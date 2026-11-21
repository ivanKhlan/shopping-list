import { useState } from 'react';
import { isDevOffline, setDevOffline } from '../api/mock.js';
import { DEV_USERS, pickDevUser } from '../telegram.js';

// Только для режима разработки (вне Telegram).

export function DevUserPicker() {
  return (
    <div className="screen invite-screen">
      <div className="invite-card">
        <h2>Режим разработки</h2>
        <p className="hint">
          Вы открыли приложение вне Telegram. Выберите тестового пользователя. Две вкладки с разными пользователями —
          как два телефона.
        </p>
        <div className="dev-users">
          {DEV_USERS.map((u) => (
            <button key={u.id} className="secondary-btn" onClick={() => pickDevUser(u.id)}>
              Я — {u.firstName}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function DevBar({ user, store }) {
  const [offline, setOffline] = useState(isDevOffline());
  function toggle() {
    const next = !offline;
    setDevOffline(next);
    setOffline(next);
    store.setOnline(!next);
  }
  return (
    <div className="devbar">
      <span>
        Тест: <b>{user.firstName}</b>
      </span>
      <button onClick={() => pickDevUser(0)}>сменить</button>
      <label>
        <input type="checkbox" checked={offline} onChange={toggle} /> без сети
      </label>
    </div>
  );
}
