// Превращает действия пользователя в правки (ops) для очереди.
import { increment, qtyForUnit, stepOf } from './units.js';

export function normalizeName(name) {
  return String(name).trim().replace(/\s+/g, ' ').toLowerCase().replace(/ё/g, 'е');
}

export function cleanName(name) {
  return String(name).trim().replace(/\s+/g, ' ').slice(0, 200);
}

// Добавление товара. Если такой уже есть с той же единицей:
//  - не куплен  -> количество +1 шаг;
//  - куплен     -> галочка снимается, количество = 1 шаг, товар поднимается наверх.
// С другой единицей — отдельная строка.
export function makeAddOps(items, { name, unit }, { me, now, newId }) {
  const clean = cleanName(name);
  if (!clean) return [];
  const key = normalizeName(clean);
  const same = items.filter((it) => !it.deleted && it.unit === unit && normalizeName(it.name) === key);
  const active = same.find((it) => !it.done);
  if (active) {
    return [{ id: newId(), type: 'set', ts: now(), itemId: active.id, fields: { qty: increment(active.qty, unit) } }];
  }
  const done = same[0];
  if (done) {
    const ts = now();
    return [
      {
        id: newId(),
        type: 'set',
        ts,
        itemId: done.id,
        fields: { done: false, qty: stepOf(unit), order: ts },
      },
    ];
  }
  const ts = now();
  return [
    {
      id: newId(),
      type: 'create',
      ts,
      item: {
        id: newId(),
        name: clean,
        qty: stepOf(unit),
        unit,
        done: false,
        order: ts,
        addedBy: me ? { id: me.id, name: me.firstName } : null,
        createdAt: ts,
      },
    },
  ];
}

export function makeSetOp(itemId, fields, { now, newId }) {
  return { id: newId(), type: 'set', ts: now(), itemId, fields };
}

export function makeRenameOps(item, name, { now, newId }) {
  const clean = cleanName(name);
  if (!clean || clean === item.name) return [];
  return [makeSetOp(item.id, { name: clean }, { now, newId })];
}

export function makeUnitOps(item, unit, { now, newId }) {
  if (unit === item.unit) return [];
  return [makeSetOp(item.id, { unit, qty: qtyForUnit(item.qty, unit) }, { now, newId })];
}

export function makeDeleteOp(itemId, { now, newId }) {
  return { id: newId(), type: 'delete', ts: now(), itemId };
}
