// Логика «сервера»: семьи, участники, приглашения, синхронизация списка.
// Работает поверх хранилища (repo), поэтому один и тот же код крутится
// и в Supabase Edge Function, и в локальном поддельном бэкенде, и в тестах.
//
// repo (все методы асинхронные):
//   getMember(userId) -> member | null
//   saveMember(member)                         // member: {userId, familyId, firstName, username, photoUrl, joinedAt}
//   listMembers(familyId) -> member[]
//   createFamily(id) -> family                 // family: {id, items: [], version: 0}
//   getFamily(id) -> family | null
//   updateFamily(id, items, expectedVersion) -> boolean   // false, если версия уже другая
//   deleteFamily(id)
//   createInvite(invite)                       // invite: {token, familyId, inviterId, createdAt, expiresAt, usedBy: null}
//   getInvite(token) -> invite | null
//   useInvite(token, userId) -> boolean        // атомарно: true, только если ещё не использовано

import { aliveItems, applyOps, isValidOp, pruneTombstones } from './merge.js';

export const INVITE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_OPS_PER_SYNC = 500;
const MAX_ITEMS = 1000;
const UPDATE_RETRIES = 5;

export class ServiceError extends Error {
  constructor(code, message) {
    super(message ?? code);
    this.code = code;
  }
}

export function createService({ repo, now = () => Date.now(), randomId }) {
  const publicMember = (m) => ({
    id: m.userId,
    firstName: m.firstName,
    username: m.username ?? null,
    photoUrl: m.photoUrl ?? null,
  });

  async function ensureMember(user) {
    let member = await repo.getMember(user.id);
    if (!member) {
      const family = await repo.createFamily(randomId());
      member = {
        userId: user.id,
        familyId: family.id,
        firstName: user.firstName,
        username: user.username ?? null,
        photoUrl: user.photoUrl ?? null,
        joinedAt: now(),
      };
      await repo.saveMember(member);
      return member;
    }
    // Имя и аватарка могли поменяться в Telegram.
    if (
      member.firstName !== user.firstName ||
      (member.username ?? null) !== (user.username ?? null) ||
      (member.photoUrl ?? null) !== (user.photoUrl ?? null)
    ) {
      member = {
        ...member,
        firstName: user.firstName,
        username: user.username ?? null,
        photoUrl: user.photoUrl ?? null,
      };
      await repo.saveMember(member);
    }
    return member;
  }

  async function snapshot(member) {
    let family = await repo.getFamily(member.familyId);
    if (!family) {
      // Семью кто-то удалил (не должно случаться) — создаём новую.
      family = await repo.createFamily(randomId());
      member = { ...member, familyId: family.id, joinedAt: now() };
      await repo.saveMember(member);
    }
    const members = await repo.listMembers(family.id);
    return {
      me: publicMember(member),
      familyId: family.id,
      members: members.sort((a, b) => a.joinedAt - b.joinedAt).map(publicMember),
      items: aliveItems(family.items),
    };
  }

  async function bootstrap(user) {
    const member = await ensureMember(user);
    return snapshot(member);
  }

  async function sync(user, { familyId, ops }) {
    if (!Array.isArray(ops)) throw new ServiceError('bad_request', 'ops must be an array');
    if (ops.length > MAX_OPS_PER_SYNC) throw new ServiceError('bad_request', 'too many ops');
    const member = await ensureMember(user);

    if (member.familyId !== familyId) {
      // Пользователь уже в другой семье (например, перешёл с другого устройства):
      // очередь относится к старому списку, её нужно выбросить.
      return { familyChanged: true, ...(await snapshot(member)) };
    }

    // Автор товара — всегда проверенный пользователь, а не то, что прислал клиент.
    const author = { id: user.id, name: user.firstName };
    const clean = ops
      .filter(isValidOp)
      .map((op) => (op.type === 'create' ? { ...op, item: { ...op.item, addedBy: author } } : op));

    if (clean.length > 0) {
      for (let attempt = 0; ; attempt++) {
        const family = await repo.getFamily(familyId);
        let items = pruneTombstones(applyOps(family.items, clean), now());
        if (aliveItems(items).length > MAX_ITEMS) throw new ServiceError('too_many_items');
        if (await repo.updateFamily(familyId, items, family.version)) break;
        if (attempt >= UPDATE_RETRIES) throw new ServiceError('busy', 'please retry');
      }
    }
    return { familyChanged: false, ...(await snapshot(member)) };
  }

  async function createInvite(user) {
    const member = await ensureMember(user);
    const invite = {
      token: randomId(),
      familyId: member.familyId,
      inviterId: user.id,
      createdAt: now(),
      expiresAt: now() + INVITE_TTL_MS,
      usedBy: null,
    };
    await repo.createInvite(invite);
    return { token: invite.token, expiresAt: invite.expiresAt };
  }

  async function checkInvite(token) {
    if (typeof token !== 'string' || token.length === 0 || token.length > 64) return { ok: false, reason: 'not_found' };
    const invite = await repo.getInvite(token);
    if (!invite) return { ok: false, reason: 'not_found' };
    if (invite.usedBy !== null && invite.usedBy !== undefined) return { ok: false, reason: 'used', invite };
    if (now() > invite.expiresAt) return { ok: false, reason: 'expired', invite };
    const family = await repo.getFamily(invite.familyId);
    if (!family) return { ok: false, reason: 'not_found' };
    return { ok: true, invite, family };
  }

  async function previewInvite(user, { token }) {
    const member = await ensureMember(user);
    const check = await checkInvite(token);
    if (check.invite && check.invite.familyId === member.familyId) {
      return { valid: false, reason: 'same_family' };
    }
    if (!check.ok) return { valid: false, reason: check.reason };
    const inviter = await repo.getMember(check.invite.inviterId);
    const newMembers = await repo.listMembers(check.invite.familyId);
    const myMembers = await repo.listMembers(member.familyId);
    const myFamily = await repo.getFamily(member.familyId);
    return {
      valid: true,
      inviter: inviter ? publicMember(inviter) : null,
      members: newMembers.map(publicMember),
      currentAlone: myMembers.length <= 1,
      currentItemCount: myFamily ? aliveItems(myFamily.items).length : 0,
    };
  }

  async function acceptInvite(user, { token }) {
    const member = await ensureMember(user);
    const check = await checkInvite(token);
    if (check.invite && check.invite.familyId === member.familyId) {
      return snapshot(member);
    }
    if (!check.ok) throw new ServiceError(`invite_${check.reason}`);
    if (!(await repo.useInvite(token, user.id))) throw new ServiceError('invite_used');

    const oldFamilyId = member.familyId;
    const moved = { ...member, familyId: check.invite.familyId, joinedAt: now() };
    await repo.saveMember(moved);

    // Старый список удаляется, только если в старой семье больше никого нет.
    const left = await repo.listMembers(oldFamilyId);
    if (left.length === 0) await repo.deleteFamily(oldFamilyId);

    return snapshot(moved);
  }

  async function leaveFamily(user) {
    const member = await ensureMember(user);
    const members = await repo.listMembers(member.familyId);
    if (members.length <= 1) return snapshot(member); // один — выходить некуда
    const family = await repo.createFamily(randomId());
    const moved = { ...member, familyId: family.id, joinedAt: now() };
    await repo.saveMember(moved);
    return snapshot(moved);
  }

  return { bootstrap, sync, createInvite, previewInvite, acceptInvite, leaveFamily };
}

// Общая точка входа: {action, ...params} -> результат.
export async function dispatch(service, user, body) {
  const { action, ...params } = body ?? {};
  switch (action) {
    case 'bootstrap':
      return service.bootstrap(user);
    case 'sync':
      return service.sync(user, params);
    case 'createInvite':
      return service.createInvite(user);
    case 'previewInvite':
      return service.previewInvite(user, params);
    case 'acceptInvite':
      return service.acceptInvite(user, params);
    case 'leaveFamily':
      return service.leaveFamily(user);
    default:
      throw new ServiceError('bad_request', `unknown action: ${action}`);
  }
}
