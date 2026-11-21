import { describe, expect, it } from 'vitest';
import { applyOps } from '../../supabase/functions/_shared/merge.js';
import { makeAddOps, makeUnitOps, normalizeName } from './listOps.js';
import { canDecrement, decrement, formatQty, increment, parseQty } from './units.js';

function ctx() {
  let t = 100;
  let n = 0;
  return { me: { id: 1, firstName: 'Аня' }, now: () => ++t, newId: () => `id${++n}` };
}

function add(items, name, unit, c) {
  return applyOps(items, makeAddOps(items, { name, unit }, c));
}

describe('шаги единиц', () => {
  it('шт и уп — по 1, кг и л — по 0,5, г и мл — по 100', () => {
    expect(increment(1, 'шт')).toBe(2);
    expect(increment(1, 'уп')).toBe(2);
    expect(increment(0.5, 'кг')).toBe(1);
    expect(increment(0.5, 'л')).toBe(1);
    expect(increment(100, 'г')).toBe(200);
    expect(increment(100, 'мл')).toBe(200);
  });

  it('«−» не опускается ниже одного шага', () => {
    expect(canDecrement(1, 'шт')).toBe(false);
    expect(canDecrement(0.5, 'кг')).toBe(false);
    expect(canDecrement(150, 'г')).toBe(true);
    expect(decrement(150, 'г')).toBe(100);
  });

  it('без хвостов вроде 0.30000000000000004', () => {
    let q = 0.5;
    for (let i = 0; i < 5; i++) q = increment(q, 'кг');
    expect(q).toBe(3);
  });

  it('ручной ввод количества', () => {
    expect(parseQty('0,5')).toBe(0.5);
    expect(parseQty(' 350 ')).toBe(350);
    expect(parseQty('0')).toBeNull();
    expect(parseQty('абв')).toBeNull();
    expect(formatQty(1.5)).toBe('1,5');
  });
});

describe('добавление и повторы', () => {
  it('новый товар — количество в один шаг', () => {
    const c = ctx();
    const items = add([], 'Сыр', 'г', c);
    expect(items[0]).toMatchObject({ name: 'Сыр', qty: 100, unit: 'г', addedBy: { id: 1, name: 'Аня' } });
  });

  it('повтор с той же единицей прибавляет шаг (без учёта регистра и пробелов)', () => {
    const c = ctx();
    let items = add([], 'Молоко', 'шт', c);
    items = add(items, '  молоко ', 'шт', c);
    expect(items).toHaveLength(1);
    expect(items[0].qty).toBe(2);
  });

  it('ё и е считаются одинаковыми', () => {
    expect(normalizeName('Ёжик')).toBe(normalizeName('ежик'));
  });

  it('повтор с другой единицей — отдельная строка', () => {
    const c = ctx();
    let items = add([], 'Молоко', 'шт', c);
    items = add(items, 'Молоко', 'л', c);
    expect(items).toHaveLength(2);
  });

  it('повтор купленного снимает галочку и ставит один шаг', () => {
    const c = ctx();
    let items = add([], 'Молоко', 'л', c);
    items = applyOps(items, [{ id: 'x', type: 'set', ts: c.now(), itemId: items[0].id, fields: { done: true, qty: 3 } }]);
    items = add(items, 'молоко', 'л', c);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ done: false, qty: 0.5 });
  });

  it('пустое название ничего не добавляет', () => {
    expect(makeAddOps([], { name: '   ', unit: 'шт' }, ctx())).toEqual([]);
  });

  it('при смене единицы количество не меньше шага', () => {
    const c = ctx();
    const items = add([], 'Сыр', 'шт', c);
    const [op] = makeUnitOps(items[0], 'г', c);
    expect(op.fields).toEqual({ unit: 'г', qty: 100 });
  });
});
