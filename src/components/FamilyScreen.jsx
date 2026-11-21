import { useEffect, useState } from 'react';
import { confirmDialog, shareInvite, showBackButton } from '../telegram.js';
import Avatar from './Avatar.jsx';
import Spinner from './Spinner.jsx';

export default function FamilyScreen({ state, store, onBack }) {
  const { members, me, online } = state;
  const [busy, setBusy] = useState(null); // 'invite' | 'leave'
  const [message, setMessage] = useState(null);
  const [devLink, setDevLink] = useState(null);

  useEffect(() => showBackButton(onBack), [onBack]);

  async function invite() {
    setBusy('invite');
    setMessage(null);
    setDevLink(null);
    try {
      const inv = await store.createInvite();
      const res = await shareInvite(inv);
      if (res.devLink) setDevLink(res.devLink);
      else if (res.shared) setMessage('Приглашение отправлено. Оно действует сутки.');
    } catch {
      setMessage('Не получилось создать приглашение. Нужен интернет.');
    } finally {
      setBusy(null);
    }
  }

  async function leave() {
    const ok = await confirmDialog('Выйти из семьи? Общий список останется у остальных, а у вас будет новый пустой.');
    if (!ok) return;
    setBusy('leave');
    try {
      await store.leaveFamily();
      onBack();
    } catch {
      setMessage('Не получилось выйти. Нужен интернет.');
      setBusy(null);
    }
  }

  return (
    <div className="screen family-screen">
      <header className="topbar">
        <button className="icon-btn" onClick={onBack} aria-label="Назад">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
        <h1>Семья</h1>
        <span className="topbar-spacer" />
      </header>

      <div className="scroll">
        <ul className="members">
          {members.map((m) => (
            <li key={m.id}>
              <Avatar id={m.id} name={m.firstName} photoUrl={m.photoUrl} size={40} />
              <div>
                <div className="member-name">
                  {m.firstName}
                  {m.id === me?.id ? <span className="hint"> · это вы</span> : null}
                </div>
                {m.username ? <div className="hint">@{m.username}</div> : null}
              </div>
            </li>
          ))}
        </ul>

        <div className="family-actions">
          <button className="primary-btn" onClick={invite} disabled={busy !== null || !online}>
            {busy === 'invite' ? <Spinner size={20} /> : 'Пригласить'}
          </button>
          <p className="hint center">
            {online
              ? 'Выберите контакт в Telegram: ему придёт кнопка «Присоединиться». Приглашение действует сутки.'
              : 'Чтобы пригласить, нужен интернет.'}
          </p>

          {devLink ? (
            <div className="dev-note">
              <b>Режим разработки.</b> В Telegram здесь открылся бы выбор контакта. Откройте ссылку в новой вкладке —
              это «второй телефон»:
              <a href={devLink} target="_blank" rel="noreferrer">
                {devLink}
              </a>
            </div>
          ) : null}
          {message ? <p className="hint center">{message}</p> : null}

          {members.length > 1 ? (
            <button className="danger-btn" onClick={leave} disabled={busy !== null || !online}>
              {busy === 'leave' ? <Spinner size={20} /> : 'Выйти из семьи'}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
