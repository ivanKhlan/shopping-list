import { useRef, useState } from 'react';
import { normalizeName } from '../lib/listOps.js';
import { DEFAULT_UNIT, UNITS } from '../lib/units.js';

// Запоминаем единицу для названия только на этом телефоне.
const MEMORY_KEY = 'unit-memory';

function loadMemory() {
  try {
    return JSON.parse(localStorage.getItem(MEMORY_KEY) ?? '{}');
  } catch {
    return {};
  }
}

function remember(name, unit) {
  try {
    const m = loadMemory();
    m[normalizeName(name)] = unit;
    localStorage.setItem(MEMORY_KEY, JSON.stringify(m));
  } catch {
    // ignore
  }
}

export default function AddBar({ onAdd }) {
  const [name, setName] = useState('');
  const [unit, setUnit] = useState(DEFAULT_UNIT);
  const [unitTouched, setUnitTouched] = useState(false);
  const input = useRef(null);

  function onName(value) {
    setName(value);
    if (unitTouched) return;
    const known = loadMemory()[normalizeName(value)];
    setUnit(known ?? DEFAULT_UNIT);
  }

  function submit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    onAdd({ name, unit });
    remember(name, unit);
    setName('');
    setUnit(DEFAULT_UNIT);
    setUnitTouched(false);
    input.current?.focus();
  }

  return (
    <form className="addbar" onSubmit={submit}>
      <input
        ref={input}
        className="addbar-input"
        placeholder="Что купить?"
        value={name}
        maxLength={200}
        enterKeyHint="done"
        onChange={(e) => onName(e.target.value)}
      />
      <select
        className="addbar-unit"
        value={unit}
        aria-label="Единица"
        onChange={(e) => {
          setUnit(e.target.value);
          setUnitTouched(true);
        }}
      >
        {UNITS.map((u) => (
          <option key={u.id} value={u.id}>
            {u.id}
          </option>
        ))}
      </select>
      <button className="addbar-btn" type="submit" disabled={!name.trim()} aria-label="Добавить">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
    </form>
  );
}
