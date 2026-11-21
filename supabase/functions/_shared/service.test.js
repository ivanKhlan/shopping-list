import { beforeEach, describe, expect, it } from 'vitest';
import { createMemoryRepo } from '../../../src/api/memoryRepo.js';
import { createService, INVITE_TTL_MS } from './service.js';

const anya = { id: 1, firstName: 'Аня' };
const petya = { id: 2, firstName: 'Петя' };
const vasya = { id: 3, firstName: 'Вася' };

let clock;
let service;
let repo;

const op = (n, item) => ({
  id: `op${n}`,
  type: 'create',
  ts: n,
  item: { id: item, name: item, qty: 1, unit: 'шт', done: false, order: n, addedBy: { id: 999, name: 'Хакер' } },
});

beforeEach(() => {
  clock = 1_000_000;
  let seq = 0;
  repo = createMemoryRepo();
  service = createService({ repo, now: () => clock, randomId: () => `id${++seq}` });
});

describe('первый вход', () => {
  it('сразу создаёт свою семью с пустым списком', async () => {
    const s = await service.bootstrap(anya);
    expect(s.items).toEqual([]);
    expect(s.members.map((m) => m.firstName)).toEqual(['Аня']);
  });

  it('повторный вход — та же семья', async () => {
    const a = await service.bootstrap(anya);
    const b = await service.bootstrap(anya);
    expect(b.familyId).toBe(a.familyId);
  });
});

describe('синхронизация', () => {
  it('автором товара записывается проверенный пользователь', async () => {
    const { familyId } = await service.bootstrap(anya);
    const s = await service.sync(anya, { familyId, ops: [op(1, 'milk')] });
    expect(s.items[0].addedBy).toEqual({ id: 1, name: 'Аня' });
  });

  it('если пользователь уже в другой семье — сообщает об этом, очередь не применяется', async () => {
    const { familyId: old } = await service.bootstrap(petya);
    await service.bootstrap(anya);
    const { token } = await service.createInvite(anya);
    await service.acceptInvite(petya, { token });
    const s = await service.sync(petya, { familyId: old, ops: [op(1, 'milk')] });
    expect(s.familyChanged).toBe(true);
    expect(s.items).toEqual([]);
  });
});

describe('приглашения', () => {
  it('приглашённый попадает в семью и видит общий список', async () => {
    const { familyId } = await service.bootstrap(anya);
    await service.sync(anya, { familyId, ops: [op(1, 'milk')] });
    await service.bootstrap(petya);
    const { token } = await service.createInvite(anya);

    const preview = await service.previewInvite(petya, { token });
    expect(preview).toMatchObject({ valid: true, inviter: { firstName: 'Аня' }, currentAlone: true });

    const s = await service.acceptInvite(petya, { token });
    expect(s.familyId).toBe(familyId);
    expect(s.items.map((i) => i.name)).toEqual(['milk']);
    expect(s.members.map((m) => m.firstName)).toEqual(['Аня', 'Петя']);
  });

  it('старый список удаляется, если в старой семье никого не осталось', async () => {
    const { familyId: old } = await service.bootstrap(petya);
    await service.bootstrap(anya);
    const { token } = await service.createInvite(anya);
    await service.acceptInvite(petya, { token });
    expect(await repo.getFamily(old)).toBeNull();
  });

  it('старый список остаётся тем, кто в старой семье остался', async () => {
    const { familyId: old } = await service.bootstrap(petya);
    await service.bootstrap(vasya);
    const inv1 = await service.createInvite(petya);
    await service.acceptInvite(vasya, { token: inv1.token });

    await service.bootstrap(anya);
    const inv2 = await service.createInvite(anya);
    await service.acceptInvite(petya, { token: inv2.token });
    expect(await repo.getFamily(old)).not.toBeNull();
    expect((await repo.listMembers(old)).map((m) => m.firstName)).toEqual(['Вася']);
  });

  it('приглашение одноразовое', async () => {
    await service.bootstrap(anya);
    const { token } = await service.createInvite(anya);
    await service.acceptInvite(petya, { token });
    await expect(service.acceptInvite(vasya, { token })).rejects.toMatchObject({ code: 'invite_used' });
  });

  it('приглашение сгорает через сутки', async () => {
    await service.bootstrap(anya);
    const { token } = await service.createInvite(anya);
    clock += INVITE_TTL_MS + 1;
    expect((await service.previewInvite(petya, { token })).reason).toBe('expired');
    await expect(service.acceptInvite(petya, { token })).rejects.toMatchObject({ code: 'invite_expired' });
  });

  it('своё приглашение открыть — просто остаться в семье', async () => {
    const { familyId } = await service.bootstrap(anya);
    const { token } = await service.createInvite(anya);
    expect((await service.previewInvite(anya, { token })).reason).toBe('same_family');
    expect((await service.acceptInvite(anya, { token })).familyId).toBe(familyId);
  });
});

describe('выход из семьи', () => {
  it('вышедший получает новый пустой список, остальные сохраняют свой', async () => {
    const { familyId } = await service.bootstrap(anya);
    await service.sync(anya, { familyId, ops: [op(1, 'milk')] });
    const { token } = await service.createInvite(anya);
    await service.acceptInvite(petya, { token });

    const s = await service.leaveFamily(petya);
    expect(s.familyId).not.toBe(familyId);
    expect(s.items).toEqual([]);
    expect((await service.bootstrap(anya)).items).toHaveLength(1);
  });
});
