// Слияние правок списка. Этот файл без зависимостей: его используют и
// приложение (чтобы показать правки из офлайн-очереди поверх списка),
// и сервер (чтобы применить очередь к общему списку семьи).
//
// Товар:
//   { id, name, qty, unit, done, order, addedBy: {id, name}, createdAt,
//     ts: { name, qty, unit, done, order },   // время последней правки поля
//     deleted?: true, deletedAt?: number }     // «надгробие» удалённого товара
//
// Правка (op):
//   { id, type: 'create', ts, item: {id, name, qty, unit, done, order, addedBy, createdAt} }
//   { id, type: 'set',    ts, itemId, fields: { name?, qty?, unit?, done?, order? } }
//   { id, type: 'delete', ts, itemId }
//
// Правила: для каждого поля побеждает правка с бОльшим временем (при равенстве —
// с бОльшим id правки, чтобы все устройства пришли к одному результату).
// Удаление побеждает всё. Повторная отправка той же правки ничего не меняет.

export const FIELDS = ['name', 'qty', 'unit', 'done', 'order'];

// Через сколько удалённые товары забываются окончательно.
export const TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function newer(ts, opId, prevTs, prevOpId) {
  if (prevTs === undefined) return true;
  if (ts !== prevTs) return ts > prevTs;
  return String(opId) > String(prevOpId ?? '');
}

export function applyOp(items, op) {
  const index = items.findIndex((it) => it.id === (op.type === 'create' ? op.item.id : op.itemId));
  const current = index === -1 ? null : items[index];

  if (op.type === 'create') {
    if (current) return items; // уже есть (или уже удалён) — повтор правки
    const src = op.item;
    const ts = {};
    const tsOp = {};
    for (const f of FIELDS) {
      ts[f] = op.ts;
      tsOp[f] = op.id;
    }
    const item = {
      id: src.id,
      name: src.name,
      qty: src.qty,
      unit: src.unit,
      done: Boolean(src.done),
      order: src.order ?? op.ts,
      addedBy: src.addedBy ?? null,
      createdAt: src.createdAt ?? op.ts,
      ts,
      tsOp,
    };
    return [...items, item];
  }

  if (!current || current.deleted) return items;

  if (op.type === 'delete') {
    const next = [...items];
    next[index] = { ...current, deleted: true, deletedAt: op.ts };
    return next;
  }

  if (op.type === 'set') {
    let changed = false;
    const updated = { ...current, ts: { ...current.ts }, tsOp: { ...(current.tsOp ?? {}) } };
    for (const f of FIELDS) {
      if (!(f in op.fields)) continue;
      if (newer(op.ts, op.id, current.ts?.[f], current.tsOp?.[f])) {
        updated[f] = op.fields[f];
        updated.ts[f] = op.ts;
        updated.tsOp[f] = op.id;
        changed = true;
      }
    }
    if (!changed) return items;
    const next = [...items];
    next[index] = updated;
    return next;
  }

  return items;
}

export function applyOps(items, ops) {
  return ops.reduce(applyOp, items);
}

export function pruneTombstones(items, now) {
  return items.filter((it) => !it.deleted || now - (it.deletedAt ?? 0) < TOMBSTONE_TTL_MS);
}

export function aliveItems(items) {
  return items.filter((it) => !it.deleted);
}

// Порядок показа: некупленные — новые сверху; купленные — внизу,
// недавно купленные выше.
export function sortForView(items) {
  const active = items.filter((it) => !it.done).sort((a, b) => b.order - a.order);
  const done = items.filter((it) => it.done).sort((a, b) => (b.ts?.done ?? 0) - (a.ts?.done ?? 0));
  return [...active, ...done];
}

// Проверка правки, пришедшей от клиента: сервер не должен доверять форме данных.
export function isValidOp(op) {
  if (!op || typeof op !== 'object') return false;
  if (typeof op.id !== 'string' || op.id.length > 64) return false;
  if (typeof op.ts !== 'number' || !Number.isFinite(op.ts)) return false;
  if (op.type === 'create') {
    const it = op.item;
    return (
      it &&
      typeof it.id === 'string' &&
      it.id.length <= 64 &&
      typeof it.name === 'string' &&
      it.name.length > 0 &&
      it.name.length <= 200 &&
      typeof it.qty === 'number' &&
      Number.isFinite(it.qty) &&
      it.qty > 0 &&
      typeof it.unit === 'string' &&
      it.unit.length <= 10
    );
  }
  if (op.type === 'set') {
    if (typeof op.itemId !== 'string' || !op.fields || typeof op.fields !== 'object') return false;
    const f = op.fields;
    if ('name' in f && (typeof f.name !== 'string' || f.name.length === 0 || f.name.length > 200)) return false;
    if ('qty' in f && (typeof f.qty !== 'number' || !Number.isFinite(f.qty) || f.qty <= 0)) return false;
    if ('unit' in f && (typeof f.unit !== 'string' || f.unit.length > 10)) return false;
    if ('done' in f && typeof f.done !== 'boolean') return false;
    if ('order' in f && (typeof f.order !== 'number' || !Number.isFinite(f.order))) return false;
    return Object.keys(f).every((k) => FIELDS.includes(k));
  }
  if (op.type === 'delete') return typeof op.itemId === 'string';
  return false;
}
