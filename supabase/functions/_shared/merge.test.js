import { describe, expect, it } from 'vitest';
import { aliveItems, applyOps, isValidOp, pruneTombstones, sortForView, TOMBSTONE_TTL_MS } from './merge.js';

const create = (id, ts, extra = {}) => ({
  id: `c-${id}-${ts}`,
  type: 'create',
  ts,
  item: { id, name: id, qty: 1, unit: 'шт', done: false, order: ts, createdAt: ts, ...extra },
});
const set = (opId, itemId, ts, fields) => ({ id: opId, type: 'set', ts, itemId, fields });
const del = (opId, itemId, ts) => ({ id: opId, type: 'delete', ts, itemId });

describe('applyOps', () => {
  it('создаёт товар', () => {
    const items = applyOps([], [create('milk', 1)]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: 'milk', qty: 1, done: false });
  });

  it('повторная отправка тех же правок ничего не меняет', () => {
    const ops = [create('milk', 1), set('s1', 'milk', 2, { qty: 3 }), del('d1', 'milk', 3)];
    const once = applyOps([], ops);
    expect(applyOps(once, ops)).toEqual(once);
  });

  it('побеждает последняя правка — независимо от порядка прихода', () => {
    const base = applyOps([], [create('milk', 1)]);
    const mine = set('a', 'milk', 10, { qty: 2 });
    const theirs = set('b', 'milk', 20, { qty: 3 });
    expect(applyOps(base, [mine, theirs])[0].qty).toBe(3);
    expect(applyOps(base, [theirs, mine])[0].qty).toBe(3);
  });

  it('при одинаковом времени результат одинаков на всех устройствах', () => {
    const base = applyOps([], [create('milk', 1)]);
    const a = set('a', 'milk', 10, { qty: 2 });
    const b = set('b', 'milk', 10, { qty: 3 });
    expect(applyOps(base, [a, b])[0].qty).toBe(applyOps(base, [b, a])[0].qty);
  });

  it('правки разных полей не затирают друг друга', () => {
    const base = applyOps([], [create('milk', 1)]);
    // Я отметил «куплено», а партнёр позже поменял количество.
    const items = applyOps(base, [set('b', 'milk', 20, { qty: 5 }), set('a', 'milk', 10, { done: true })]);
    expect(items[0]).toMatchObject({ qty: 5, done: true });
  });

  it('удаление побеждает даже более позднюю правку', () => {
    const base = applyOps([], [create('milk', 1)]);
    const items = applyOps(base, [del('d', 'milk', 5), set('s', 'milk', 50, { qty: 9 })]);
    expect(aliveItems(items)).toHaveLength(0);
    expect(items[0].qty).toBe(1);
  });

  it('удалённый товар не воскресает от повторного create', () => {
    const items = applyOps([], [create('milk', 1), del('d', 'milk', 2), create('milk', 1)]);
    expect(aliveItems(items)).toHaveLength(0);
  });

  it('правка несуществующего товара игнорируется', () => {
    expect(applyOps([], [set('s', 'ghost', 1, { qty: 2 })])).toEqual([]);
  });
});

describe('pruneTombstones', () => {
  it('забывает только старые удалённые товары', () => {
    const items = applyOps([], [create('a', 1), create('b', 1), del('d1', 'a', 100), del('d2', 'b', 1000)]);
    const pruned = pruneTombstones(items, 100 + TOMBSTONE_TTL_MS + 1);
    expect(pruned.map((i) => i.id)).toEqual(['b']);
  });
});

describe('sortForView', () => {
  it('новые сверху, купленные внизу', () => {
    const items = applyOps(
      [],
      [create('old', 1), create('new', 2), create('bought', 3), set('s', 'bought', 4, { done: true })],
    );
    expect(sortForView(items).map((i) => i.id)).toEqual(['new', 'old', 'bought']);
  });
});

describe('isValidOp', () => {
  it('отбрасывает мусор', () => {
    expect(isValidOp(null)).toBe(false);
    expect(isValidOp({ id: 'x', type: 'set', ts: 1, itemId: 'a', fields: { qty: -1 } })).toBe(false);
    expect(isValidOp({ id: 'x', type: 'set', ts: 1, itemId: 'a', fields: { hack: 1 } })).toBe(false);
    expect(isValidOp(create('milk', 1))).toBe(true);
    expect(isValidOp(set('s', 'milk', 1, { done: true }))).toBe(true);
  });
});
