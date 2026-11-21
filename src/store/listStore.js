// Состояние приложения на телефоне.
//
// base  — список в том виде, в каком его последний раз вернул сервер;
// queue — правки, которые ещё не дошли до сервера (офлайн-очередь).
// На экране показывается base + queue. Всё это хранится в localStorage,
// поэтому без интернета открывается последний список и правки не теряются.

import { aliveItems, applyOps, sortForView } from '../../supabase/functions/_shared/merge.js';
import {
  makeAddOps,
  makeDeleteOp,
  makeRenameOps,
  makeSetOp,
  makeUnitOps,
} from '../lib/listOps.js';
import { canDecrement, decrement, increment } from '../lib/units.js';

export const UNDO_MS = 5000;
const SYNC_DEBOUNCE_MS = 400;

export class ApiError extends Error {
  // kind: 'network' (нет связи) | 'auth' (подпись Telegram не прошла) | 'server'
  constructor(kind, code, message) {
    super(message ?? code ?? kind);
    this.kind = kind;
    this.code = code;
  }
}

function monotonicClock() {
  let last = 0;
  return () => {
    const t = Date.now();
    last = t > last ? t : last + 1;
    return last;
  };
}

export function createListStore({
  api,
  storage,
  storageKey,
  now = monotonicClock(),
  newId = () => crypto.randomUUID(),
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (id) => clearTimeout(id),
}) {
  const persisted = loadPersisted();
  let state = {
    status: persisted ? 'ready' : 'loading', // 'loading' | 'ready' | 'error'
    error: null, // 'offline_first_run' | 'auth' | 'server'
    me: persisted?.me ?? null,
    familyId: persisted?.familyId ?? null,
    members: persisted?.members ?? [],
    base: persisted?.base ?? [],
    queue: persisted?.queue ?? [],
    lastSyncAt: persisted?.lastSyncAt ?? null,
    online: true,
    syncing: false,
    hidden: [], // id товаров, удалённых, но ещё с кнопкой «Отменить»
    undo: null, // { id, label, count }
  };
  let view = computeView(state);
  const listeners = new Set();
  let inFlight = null;
  let again = false;
  let syncTimer = null;
  let undoEntry = null; // { id, ids, timer, label }

  const ctx = { now, newId };

  function loadPersisted() {
    try {
      const raw = storage?.getItem(storageKey);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function persist() {
    try {
      const { me, familyId, members, base, queue, lastSyncAt } = state;
      storage?.setItem(storageKey, JSON.stringify({ me, familyId, members, base, queue, lastSyncAt }));
    } catch {
      // Переполненное или недоступное хранилище — работаем дальше в памяти.
    }
  }

  function computeView(s) {
    const merged = aliveItems(applyOps(s.base, s.queue));
    const hidden = new Set(s.hidden);
    const items = sortForView(merged.filter((it) => !hidden.has(it.id)));
    return { ...s, items, doneCount: items.filter((it) => it.done).length, pending: s.queue.length };
  }

  function set(patch, { save = true } = {}) {
    state = { ...state, ...patch };
    view = computeView(state);
    if (save) persist();
    for (const l of listeners) l();
  }

  function currentItems() {
    return aliveItems(applyOps(state.base, state.queue));
  }

  function findItem(id) {
    return currentItems().find((it) => it.id === id);
  }

  function enqueue(ops) {
    if (ops.length === 0) return;
    set({ queue: [...state.queue, ...ops] });
    scheduleSync();
  }

  function scheduleSync() {
    if (syncTimer) clearTimer(syncTimer);
    syncTimer = setTimer(() => {
      syncTimer = null;
      sync();
    }, SYNC_DEBOUNCE_MS);
  }

  function applySnapshot(res, sentOps) {
    const sent = new Set(sentOps.map((op) => op.id));
    const queue = res.familyChanged ? [] : state.queue.filter((op) => !sent.has(op.id));
    set({
      status: 'ready',
      error: null,
      me: res.me,
      familyId: res.familyId,
      members: res.members,
      base: res.items,
      queue,
      lastSyncAt: now(),
      online: true,
    });
  }

  function handleError(err) {
    if (err instanceof ApiError && err.kind === 'network') {
      set({ online: false, status: state.familyId ? 'ready' : 'error', error: state.familyId ? null : 'offline_first_run' });
    } else if (err instanceof ApiError && err.kind === 'auth') {
      set({ status: state.familyId ? state.status : 'error', error: 'auth' });
    } else {
      set({ status: state.familyId ? state.status : 'error', error: 'server' });
    }
  }

  // Одна синхронизация за раз; если во время неё попросили ещё — повторим.
  async function sync() {
    if (inFlight) {
      again = true;
      return inFlight;
    }
    inFlight = (async () => {
      set({ syncing: true }, { save: false });
      const sentOps = state.queue.slice();
      const familyId = state.familyId;
      try {
        const res = familyId ? await api.sync({ familyId, ops: sentOps }) : await api.bootstrap();
        applySnapshot(res, familyId ? sentOps : []);
      } catch (err) {
        handleError(err);
      } finally {
        set({ syncing: false }, { save: false });
      }
    })();
    try {
      await inFlight;
    } finally {
      inFlight = null;
    }
    if (again) {
      again = false;
      return sync();
    }
  }

  // ---------- Отмена удаления ----------

  function commitUndo() {
    if (!undoEntry) return;
    const { ids, timer } = undoEntry;
    clearTimer(timer);
    undoEntry = null;
    const alive = new Set(currentItems().map((it) => it.id));
    const ops = ids.filter((id) => alive.has(id)).map((id) => makeDeleteOp(id, ctx));
    set({ hidden: state.hidden.filter((h) => !ids.includes(h)), undo: null, queue: [...state.queue, ...ops] });
    if (ops.length) scheduleSync();
  }

  function startUndo(ids, label) {
    commitUndo(); // предыдущая отмена больше не нужна
    if (ids.length === 0) return;
    const id = newId();
    const timer = setTimer(commitUndo, UNDO_MS);
    undoEntry = { id, ids, timer };
    set({ hidden: [...state.hidden, ...ids], undo: { id, label, count: ids.length } }, { save: false });
  }

  // ---------- Публичные действия ----------

  return {
    getState: () => view,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    init() {
      return sync();
    },
    refresh() {
      return sync();
    },
    setOnline(online) {
      set({ online }, { save: false });
      if (online) sync();
    },

    add({ name, unit }) {
      enqueue(makeAddOps(currentItems(), { name, unit }, { me: state.me, ...ctx }));
    },
    toggleDone(id) {
      const it = findItem(id);
      if (it) enqueue([makeSetOp(id, { done: !it.done }, ctx)]);
    },
    inc(id) {
      const it = findItem(id);
      if (it) enqueue([makeSetOp(id, { qty: increment(it.qty, it.unit) }, ctx)]);
    },
    dec(id) {
      const it = findItem(id);
      if (it && canDecrement(it.qty, it.unit)) enqueue([makeSetOp(id, { qty: decrement(it.qty, it.unit) }, ctx)]);
    },
    setQty(id, qty) {
      const it = findItem(id);
      if (it && qty > 0 && qty !== it.qty) enqueue([makeSetOp(id, { qty }, ctx)]);
    },
    rename(id, name) {
      const it = findItem(id);
      if (it) enqueue(makeRenameOps(it, name, ctx));
    },
    setUnit(id, unit) {
      const it = findItem(id);
      if (it) enqueue(makeUnitOps(it, unit, ctx));
    },
    remove(id) {
      const it = findItem(id);
      if (it) startUndo([id], `Удалено: ${it.name}`);
    },
    clearDone() {
      const ids = currentItems()
        .filter((it) => it.done && !state.hidden.includes(it.id))
        .map((it) => it.id);
      startUndo(ids, ids.length === 1 ? 'Удалён 1 купленный товар' : `Удалено купленных: ${ids.length}`);
    },
    undo() {
      if (!undoEntry) return;
      const { ids, timer } = undoEntry;
      clearTimer(timer);
      undoEntry = null;
      set({ hidden: state.hidden.filter((h) => !ids.includes(h)), undo: null }, { save: false });
    },
    // Приложение сворачивают — удаление больше нельзя отменить, фиксируем его.
    flushUndo() {
      commitUndo();
    },

    // ---------- Семья ----------

    async createInvite() {
      return api.createInvite();
    },
    async previewInvite(token) {
      return api.previewInvite({ token });
    },
    async acceptInvite(token) {
      commitUndo();
      await sync(); // сначала отправляем то, что накопилось для старого списка
      const res = await api.acceptInvite({ token });
      applySnapshot({ ...res, familyChanged: true }, []);
    },
    async leaveFamily() {
      commitUndo();
      await sync();
      const res = await api.leaveFamily();
      applySnapshot({ ...res, familyChanged: true }, []);
    },
  };
}
