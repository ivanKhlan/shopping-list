// Хранилище для service.js поверх таблиц Supabase (см. migrations/).

const toMember = (r) =>
  r && {
    userId: Number(r.user_id),
    familyId: r.family_id,
    firstName: r.first_name,
    username: r.username,
    photoUrl: r.photo_url,
    joinedAt: Number(r.joined_at),
  };

const toInvite = (r) =>
  r && {
    token: r.token,
    familyId: r.family_id,
    inviterId: Number(r.inviter_id),
    createdAt: Number(r.created_at),
    expiresAt: Number(r.expires_at),
    usedBy: r.used_by === null ? null : Number(r.used_by),
  };

function check({ data, error }) {
  if (error) throw new Error(`db: ${error.message}`);
  return data;
}

export function createSupabaseRepo(db) {
  return {
    async getMember(userId) {
      return toMember(check(await db.from('members').select('*').eq('user_id', userId).maybeSingle()));
    },
    async saveMember(m) {
      check(
        await db.from('members').upsert({
          user_id: m.userId,
          family_id: m.familyId,
          first_name: m.firstName,
          username: m.username,
          photo_url: m.photoUrl,
          joined_at: m.joinedAt,
        }),
      );
    },
    async listMembers(familyId) {
      return check(await db.from('members').select('*').eq('family_id', familyId)).map(toMember);
    },
    async createFamily(id) {
      const row = check(await db.from('families').insert({ id }).select('id, items, version').single());
      return { id: row.id, items: row.items, version: row.version };
    },
    async getFamily(id) {
      const row = check(await db.from('families').select('id, items, version').eq('id', id).maybeSingle());
      return row && { id: row.id, items: row.items, version: row.version };
    },
    // Оптимистичная блокировка: обновляем, только если версия не поменялась.
    async updateFamily(id, items, expectedVersion) {
      const rows = check(
        await db
          .from('families')
          .update({ items, version: expectedVersion + 1 })
          .eq('id', id)
          .eq('version', expectedVersion)
          .select('id'),
      );
      return rows.length === 1;
    },
    async deleteFamily(id) {
      check(await db.from('families').delete().eq('id', id));
    },
    async createInvite(inv) {
      check(
        await db.from('invites').insert({
          token: inv.token,
          family_id: inv.familyId,
          inviter_id: inv.inviterId,
          created_at: inv.createdAt,
          expires_at: inv.expiresAt,
          used_by: null,
        }),
      );
    },
    async getInvite(token) {
      return toInvite(check(await db.from('invites').select('*').eq('token', token).maybeSingle()));
    },
    // Атомарно: срабатывает только для ещё не использованного приглашения.
    async useInvite(token, userId) {
      const rows = check(
        await db.from('invites').update({ used_by: userId }).eq('token', token).is('used_by', null).select('token'),
      );
      return rows.length === 1;
    },
  };
}
