import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { createApi } from './api/index.js';
import { DevBar, DevUserPicker } from './components/Dev.jsx';
import FamilyScreen from './components/FamilyScreen.jsx';
import InviteScreen from './components/InviteScreen.jsx';
import ListScreen from './components/ListScreen.jsx';
import Spinner from './components/Spinner.jsx';
import { createListStore } from './store/listStore.js';
import { getLaunch, inviteTokenFrom } from './telegram.js';

export default function App() {
  const launch = useMemo(getLaunch, []);
  if (launch.mode === 'dev' && !launch.user) return <DevUserPicker />;
  if (launch.mode === 'telegram' && !launch.user) {
    return <Message text="Откройте приложение через бота в Telegram." />;
  }
  return <Main launch={launch} />;
}

function Main({ launch }) {
  const store = useMemo(() => {
    const { api } = createApi(launch);
    return createListStore({ api, storage: window.localStorage, storageKey: `shopping-list:${launch.user.id}` });
  }, [launch]);
  const state = useSyncExternalStore(store.subscribe, store.getState);

  const inviteToken = inviteTokenFrom(launch.startParam);
  const [screen, setScreen] = useState(inviteToken ? 'invite' : 'list');
  const openList = useCallback(() => setScreen('list'), []);
  const openFamily = useCallback(() => setScreen('family'), []);

  useEffect(() => {
    store.init();
    const onOnline = () => store.setOnline(true);
    const onOffline = () => store.setOnline(false);
    // Вернулись в приложение — обновляем; свернули — фиксируем удаление.
    const onVisibility = () => (document.visibilityState === 'visible' ? store.refresh() : store.flushUndo());
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', store.flushUndo);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', store.flushUndo);
    };
  }, [store]);

  let content;
  if (state.status === 'loading') {
    content = (
      <div className="screen center-screen">
        <Spinner size={40} />
      </div>
    );
  } else if (state.status === 'error') {
    content = (
      <Message
        text={
          state.error === 'offline_first_run'
            ? 'Для первого входа нужен интернет. Потом список будет открываться и без него.'
            : state.error === 'auth'
              ? 'Не удалось проверить вход. Закройте и откройте приложение заново.'
              : 'Сервер не отвечает. Попробуйте позже.'
        }
        onRetry={() => store.refresh()}
      />
    );
  } else if (screen === 'invite') {
    content = <InviteScreen token={inviteToken} state={state} store={store} onClose={openList} />;
  } else if (screen === 'family') {
    content = <FamilyScreen state={state} store={store} onBack={openList} />;
  } else {
    content = <ListScreen state={state} store={store} onOpenFamily={openFamily} />;
  }

  return (
    <div className="app">
      {launch.mode === 'dev' ? <DevBar user={launch.user} store={store} /> : null}
      <div className="app-body">{content}</div>
    </div>
  );
}

function Message({ text, onRetry }) {
  return (
    <div className="screen center-screen">
      <p className="message">{text}</p>
      {onRetry ? (
        <button className="secondary-btn" onClick={onRetry}>
          Повторить
        </button>
      ) : null}
    </div>
  );
}
