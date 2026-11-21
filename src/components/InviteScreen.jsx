import { DistortionWave } from 'distortion-waves';
import { useEffect, useRef, useState } from 'react';
import Avatar from './Avatar.jsx';
import ListScreen from './ListScreen.jsx';
import Spinner from './Spinner.jsx';

const REASONS = {
  used: 'Это приглашение уже использовано.',
  expired: 'Срок приглашения истёк — оно действует сутки. Попросите прислать новое.',
  not_found: 'Приглашение не найдено.',
};

function plural(n, one, few, many) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

// «Вас пригласили — присоединиться?». После согласия волна DistortionWave
// поднимается от кнопки и «приносит» общий список.
export default function InviteScreen({ token, state, store, onClose }) {
  const [preview, setPreview] = useState(null);
  const [failed, setFailed] = useState(false);
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState(null);
  const button = useRef(null);

  useEffect(() => {
    let alive = true;
    store
      .previewInvite(token)
      .then((p) => {
        if (!alive) return;
        if (!p.valid && p.reason === 'same_family') onClose(); // уже вместе
        else setPreview(p);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [token, store, onClose]);

  async function join() {
    setJoining(true);
    setError(null);
    try {
      await store.acceptInvite(token);
      setJoined(true); // запускает волну
    } catch (err) {
      setJoining(false);
      setError(err?.kind === 'network' ? 'Нет сети. Попробуйте, когда появится интернет.' : 'Не получилось присоединиться.');
    }
  }

  if (failed) {
    return (
      <Card>
        <p>Не удалось открыть приглашение — нужен интернет.</p>
        <button className="secondary-btn" onClick={onClose}>
          Открыть мой список
        </button>
      </Card>
    );
  }
  if (!preview) {
    return (
      <Card>
        <Spinner />
      </Card>
    );
  }
  if (!preview.valid) {
    return (
      <Card>
        <p>{REASONS[preview.reason] ?? 'Приглашение недействительно.'}</p>
        <button className="secondary-btn" onClick={onClose}>
          Открыть мой список
        </button>
      </Card>
    );
  }

  const inviter = preview.inviter?.firstName ?? 'Вас';
  let warning = null;
  if (!preview.currentAlone) warning = 'Вы выйдете из текущей семьи — её список останется у остальных.';
  else if (preview.currentItemCount > 0)
    warning = `Ваш текущий список (${preview.currentItemCount} ${plural(preview.currentItemCount, 'товар', 'товара', 'товаров')}) будет удалён.`;

  const invitation = (
    <div className="screen invite-screen has-buttons">
      <div className="invite-card">
        <div className="invite-avatars">
          {preview.members.slice(0, 4).map((m) => (
            <Avatar key={m.id} id={m.id} name={m.firstName} photoUrl={m.photoUrl} size={56} />
          ))}
        </div>
        <h2>{inviter} приглашает вас в общий список покупок</h2>
        <p className="hint">
          В семье: {preview.members.map((m) => m.firstName).join(', ')}
        </p>
        {warning ? <p className="invite-warning">{warning}</p> : null}
        {error ? <p className="invite-warning">{error}</p> : null}
      </div>
    </div>
  );

  return (
    <DistortionWave
      className="wave"
      type="vertical"
      revealed={joined}
      source={button}
      onFinish={(revealed) => revealed && onClose()}
      revealedContent={<ListScreen state={state} store={store} onOpenFamily={() => {}} />}
      overlay={
        joined ? null : (
          <div className="invite-buttons">
            <button ref={button} className="primary-btn" onClick={join} disabled={joining}>
              {joining ? <Spinner size={20} /> : 'Присоединиться'}
            </button>
            <button className="secondary-btn" onClick={onClose} disabled={joining}>
              Не сейчас
            </button>
          </div>
        )
      }
    >
      {invitation}
    </DistortionWave>
  );
}

function Card({ children }) {
  return (
    <div className="screen invite-screen">
      <div className="invite-card">{children}</div>
    </div>
  );
}
