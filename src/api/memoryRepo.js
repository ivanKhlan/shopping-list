// Хранилище «сервера» в памяти. Используется в тестах и в локальном
// поддельном бэкенде (там база сохраняется в localStorage, поэтому её видят
// все вкладки браузера — две вкладки = два телефона).
//
// load() -> db, save(db). Каждое действие читает базу заново, поэтому
// изменения из другой вкладки сразу видны.

const emptyDb = () => ({ members: {}, families: {}, invites: {} });

export function createMemoryRepo({ load, save } = {}) {
  let mem = emptyDb();
  const read = () => (load ? (load() ?? emptyDb()) : mem);
  const write = (db) => {
    if (save) save(db);
    else mem = db;
  };
  const clone = (v) => (v == null ? v : structuredClone(v));

  return {
    async getMember(userId) {
      return clone(read().members[userId] ?? null);
    },
    async saveMember(member) {
      const db = read();
      db.members[member.userId] = clone(member);
      write(db);
    },
    async listMembers(familyId) {
      return clone(Object.values(read().members).filter((m) => m.familyId === familyId));
    },
    async createFamily(id) {
      const db = read();
      const family = { id, items: [], version: 0 };
      db.families[id] = family;
      write(db);
      return clone(family);
    },
    async getFamily(id) {
      return clone(read().families[id] ?? null);
    },
    async updateFamily(id, items, expectedVersion) {
      const db = read();
      const family = db.families[id];
      if (!family || family.version !== expectedVersion) return false;
      db.families[id] = { ...family, items: clone(items), version: family.version + 1 };
      write(db);
      return true;
    },
    async deleteFamily(id) {
      const db = read();
      delete db.families[id];
      for (const [token, inv] of Object.entries(db.invites)) {
        if (inv.familyId === id) delete db.invites[token];
      }
      write(db);
    },
    async createInvite(invite) {
      const db = read();
      db.invites[invite.token] = clone(invite);
      write(db);
    },
    async getInvite(token) {
      return clone(read().invites[token] ?? null);
    },
    async useInvite(token, userId) {
      const db = read();
      const inv = db.invites[token];
      if (!inv || inv.usedBy != null) return false;
      inv.usedBy = userId;
      write(db);
      return true;
    },
  };
}
