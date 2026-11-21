import { useLayoutEffect, useRef, useState } from 'react';
import AddBar from './AddBar.jsx';
import Avatar from './Avatar.jsx';
import ItemRow from './ItemRow.jsx';
import Spinner from './Spinner.jsx';

const PULL_TRIGGER_PX = 64;

function formatTime(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  const today = new Date();
  const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === today.toDateString()) return time;
  return `${d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}, ${time}`;
}

// Плавное перемещение строк, когда товар уезжает вниз в «купленное» (FLIP).
function useFlip(items) {
  const nodes = useRef(new Map());
  const prev = useRef(new Map());
  useLayoutEffect(() => {
    const next = new Map();
    for (const [id, el] of nodes.current) {
      if (!el.isConnected) continue;
      const top = el.getBoundingClientRect().top;
      next.set(id, top);
      const before = prev.current.get(id);
      if (before !== undefined && Math.abs(before - top) > 1) {
        el.style.transition = 'none';
        el.style.transform = `translateY(${before - top}px)`;
        requestAnimationFrame(() => {
          el.style.transition = '';
          el.style.transform = '';
        });
      }
    }
    prev.current = next;
  }, [items]);
  return (id) => (el) => {
    if (el) nodes.current.set(id, el);
    else nodes.current.delete(id);
  };
}

export default function ListScreen({ state, store, onOpenFamily }) {
  const { items, members, online, syncing, lastSyncAt, pending, doneCount, undo, error } = state;
  const active = items.filter((it) => !it.done);
  const done = items.filter((it) => it.done);
  const showAuthor = members.length > 1;
  const refFor = useFlip(items);

  // ---------- Потянуть вниз, чтобы обновить ----------
  const scroller = useRef(null);
  const pullStart = useRef(null);
  const [pull, setPull] = useState(0);
  function onTouchStart(e) {
    pullStart.current = scroller.current.scrollTop <= 0 ? e.touches[0].clientY : null;
  }
  function onTouchMove(e) {
    if (pullStart.current === null) return;
    const dy = e.touches[0].clientY - pullStart.current;
    setPull(dy > 0 ? Math.min(90, dy * 0.5) : 0);
  }
  function onTouchEnd() {
    if (pull >= PULL_TRIGGER_PX) store.refresh();
    pullStart.current = null;
    setPull(0);
  }

  return (
    <div className="screen list-screen">
      <header className="topbar">
        <h1>Покупки</h1>
        <div className="topbar-actions">
          <button
            className={`icon-btn ${syncing ? 'is-spinning' : ''}`}
            onClick={() => store.refresh()}
            aria-label="Обновить"
            title="Обновить"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M20 12a8 8 0 1 1-2.34-5.66M20 4v5h-5" />
            </svg>
          </button>
          <button className="family-btn" onClick={onOpenFamily} aria-label="Семья">
            {members.slice(0, 3).map((m) => (
              <Avatar key={m.id} id={m.id} name={m.firstName} photoUrl={m.photoUrl} size={30} />
            ))}
          </button>
        </div>
      </header>

      {!online ? (
        <div className="banner banner-offline">
          Нет сети · список от {formatTime(lastSyncAt)}
          {pending > 0 ? ` · ждут отправки: ${pending}` : ''}
        </div>
      ) : null}
      {error === 'auth' ? (
        <div className="banner banner-error">Не удалось проверить вход. Закройте и откройте приложение заново.</div>
      ) : null}
      {error === 'server' ? <div className="banner banner-error">Сервер не ответил. Попробуем ещё раз позже.</div> : null}

      <div
        className="scroll"
        ref={scroller}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div className="pull" style={{ height: pull }}>
          {pull > 0 ? <Spinner progress={Math.min(1, pull / PULL_TRIGGER_PX)} /> : null}
        </div>

        {items.length === 0 ? (
          <div className="empty">
            <div className="empty-icon" aria-hidden="true">
              <svg viewBox="0 0 48 48">
                <path d="M8 10h4l5 22h20l4-15H14" />
                <circle cx="19" cy="38" r="2.5" />
                <circle cx="34" cy="38" r="2.5" />
              </svg>
            </div>
            <p>Список пуст</p>
            <p className="hint">Напишите внизу, что нужно купить</p>
          </div>
        ) : null}

        <ul className="items">
          {active.map((it) => (
            <ItemRow key={it.id} item={it} actions={store} showAuthor={showAuthor} rowRef={refFor(it.id)} />
          ))}
        </ul>

        {done.length > 0 ? (
          <>
            <div className="done-header">
              <span>Куплено · {doneCount}</span>
              <button className="link-btn" onClick={() => store.clearDone()}>
                Очистить купленное
              </button>
            </div>
            <ul className="items">
              {done.map((it) => (
                <ItemRow key={it.id} item={it} actions={store} showAuthor={showAuthor} rowRef={refFor(it.id)} />
              ))}
            </ul>
          </>
        ) : null}
      </div>

      {undo ? (
        <div className="toast" key={undo.id}>
          <span>{undo.label}</span>
          <button onClick={() => store.undo()}>Отменить</button>
          <i className="toast-timer" />
        </div>
      ) : null}

      <AddBar onAdd={(v) => store.add(v)} />
    </div>
  );
}
