// Единицы измерения и шаг кнопок +/−.
export const UNITS = [
  { id: 'шт', step: 1 },
  { id: 'уп', step: 1 },
  { id: 'кг', step: 0.5 },
  { id: 'г', step: 100 },
  { id: 'л', step: 0.5 },
  { id: 'мл', step: 100 },
];

export const DEFAULT_UNIT = 'шт';

export function stepOf(unit) {
  return UNITS.find((u) => u.id === unit)?.step ?? 1;
}

// Убираем хвосты вроде 0.30000000000000004.
export function roundQty(x) {
  return Math.round(x * 1000) / 1000;
}

export function increment(qty, unit) {
  return roundQty(qty + stepOf(unit));
}

// «−» не опускает количество ниже одного шага.
export function canDecrement(qty, unit) {
  return qty > stepOf(unit) + 1e-9;
}

export function decrement(qty, unit) {
  const step = stepOf(unit);
  return roundQty(Math.max(step, qty - step));
}

// При смене единицы количество не должно оказаться меньше шага
// (например, «сыр 1 шт» → граммы = 100 г).
export function qtyForUnit(qty, unit) {
  const step = stepOf(unit);
  return qty < step ? step : qty;
}

export function formatQty(qty) {
  return String(roundQty(qty)).replace('.', ',');
}

// «0,5» / «0.5» / « 350 » -> число; всё остальное -> null.
export function parseQty(text) {
  const s = String(text).trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = roundQty(Number(s));
  return n > 0 && n < 1e6 ? n : null;
}
