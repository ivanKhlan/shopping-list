import { useEffect, useRef, useState } from 'react';
import { canDecrement, formatQty, parseQty, UNITS } from '../lib/units.js';
import { colorFor } from './Avatar.jsx';

const SWIPE_DELETE_PX = 90;

// Строка товара: галочка, название (нажать — редактировать), количество с +/−,
// свайп влево — удалить.
export default function ItemRow({ item, actions, showAuthor, rowRef }) {
  const [editing, setEditing] = useState(null); // null | 'name' | 'qty'
  const [dx, setDx] = useState(0);
  const drag = useRef(null);
  const swiped = useRef(false); // после свайпа не открывать редактирование

  // ---------- Свайп ----------
  function onPointerDown(e) {
    swiped.current = false;
    if (editing || e.target.closest('input, select, .qty, .check')) return;
    drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId, active: false };
  }
  function onPointerMove(e) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const mx = e.clientX - d.x;
    const my = e.clientY - d.y;
    if (!d.active) {
      if (Math.abs(my) > 10) {
        drag.current = null; // это прокрутка
        return;
      }
      if (mx < -10) {
        d.active = true;
        swiped.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
      } else return;
    }
    setDx(Math.min(0, mx));
  }
  function onPointerUp() {
    const d = drag.current;
    drag.current = null;
    if (!d?.active) return;
    if (dx < -SWIPE_DELETE_PX) {
      setDx(-window.innerWidth);
      setTimeout(() => actions.remove(item.id), 160);
    } else setDx(0);
  }

  const swiping = dx !== 0;

  return (
    <li ref={rowRef} className={`item ${item.done ? 'is-done' : ''}`}>
      <div className="item-delete-bg" style={{ opacity: Math.min(1, -dx / SWIPE_DELETE_PX) }}>
        Удалить
      </div>
      <div
        className={`item-body ${swiping ? 'is-swiping' : ''}`}
        style={{ transform: `translateX(${dx}px)` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <button
          className={`check ${item.done ? 'is-checked' : ''}`}
          onClick={() => actions.toggleDone(item.id)}
          aria-label={item.done ? 'Вернуть в список' : 'Отметить купленным'}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </button>

        {editing === 'name' ? (
          <NameEditor item={item} actions={actions} onDone={() => setEditing(null)} />
        ) : (
          <button className="item-name" onClick={() => !swiped.current && setEditing('name')}>
            <span className="item-name-text">{item.name}</span>
            {showAuthor && item.addedBy ? (
              <span className="author" style={{ background: colorFor(item.addedBy.id) }} title={item.addedBy.name}>
                {item.addedBy.name?.charAt(0).toUpperCase()}
              </span>
            ) : null}
          </button>
        )}

        {editing !== 'name' ? (
          <div className="qty">
            <button
              className="qty-btn"
              onClick={() => actions.dec(item.id)}
              disabled={!canDecrement(item.qty, item.unit)}
              aria-label="Меньше"
            >
              −
            </button>
            {editing === 'qty' ? (
              <QtyEditor item={item} actions={actions} onDone={() => setEditing(null)} />
            ) : (
              <button className="qty-value" onClick={() => setEditing('qty')} key={item.qty}>
                {formatQty(item.qty)} <small>{item.unit}</small>
              </button>
            )}
            <button className="qty-btn" onClick={() => actions.inc(item.id)} aria-label="Больше">
              +
            </button>
          </div>
        ) : null}
      </div>
    </li>
  );
}

function NameEditor({ item, actions, onDone }) {
  const [name, setName] = useState(item.name);
  const [unit, setUnit] = useState(item.unit);
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  function save() {
    if (name.trim()) actions.rename(item.id, name);
    if (unit !== item.unit) actions.setUnit(item.id, unit);
    onDone();
  }

  return (
    <form
      className="item-edit"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) save();
      }}
    >
      <input
        ref={ref}
        value={name}
        maxLength={200}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && onDone()}
      />
      <select value={unit} onChange={(e) => setUnit(e.target.value)} aria-label="Единица">
        {UNITS.map((u) => (
          <option key={u.id} value={u.id}>
            {u.id}
          </option>
        ))}
      </select>
      <button type="submit" className="item-edit-ok" aria-label="Сохранить">
        ✓
      </button>
    </form>
  );
}

function QtyEditor({ item, actions, onDone }) {
  const [text, setText] = useState(formatQty(item.qty));
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  function save() {
    const q = parseQty(text);
    if (q !== null) actions.setQty(item.id, q);
    onDone();
  }

  return (
    <input
      ref={ref}
      className="qty-input"
      inputMode="decimal"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === 'Enter') save();
        if (e.key === 'Escape') onDone();
      }}
    />
  );
}
