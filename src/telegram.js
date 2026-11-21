// Обёртка над Telegram Mini App API. Вне Telegram (в обычном браузере)
// включается режим разработки: тестовые пользователи выбираются вручную.

const tg = typeof window !== 'undefined' ? window.Telegram?.WebApp : undefined;

export const DEV_USERS = [
  { id: 101, firstName: 'Аня' },
  { id: 102, firstName: 'Петя' },
  { id: 103, firstName: 'Вася' },
];

const DEV_USER_KEY = 'dev-user';

export function getLaunch() {
  if (tg && tg.initData) {
    const u = tg.initDataUnsafe?.user;
    return {
      mode: 'telegram',
      initData: tg.initData,
      user: u
        ? { id: u.id, firstName: u.first_name, username: u.username ?? null, photoUrl: u.photo_url ?? null }
        : null,
      startParam: tg.initDataUnsafe?.start_param ?? null,
    };
  }
  const url = new URL(window.location.href);
  const fromUrl = Number(url.searchParams.get('user'));
  const forcePick = url.searchParams.has('pick');
  let stored = null;
  try {
    stored = forcePick ? null : Number(sessionStorage.getItem(DEV_USER_KEY));
  } catch {
    // нет sessionStorage
  }
  const id = fromUrl || stored;
  return {
    mode: 'dev',
    initData: '',
    user: DEV_USERS.find((u) => u.id === id) ?? null,
    startParam: url.searchParams.get('startapp'),
  };
}

export function pickDevUser(id) {
  try {
    sessionStorage.setItem(DEV_USER_KEY, String(id));
  } catch {
    // ignore
  }
  const url = new URL(window.location.href);
  url.searchParams.delete('pick');
  url.searchParams.delete('user');
  window.location.replace(url.toString());
}

export function initTelegram() {
  if (!tg) return;
  tg.ready();
  tg.expand();
  // Иначе свайп вниз по списку закрывает приложение вместо обновления.
  tg.disableVerticalSwipes?.();
}

export function confirmDialog(message) {
  if (tg?.showConfirm && tg.initData) {
    return new Promise((resolve) => tg.showConfirm(message, (ok) => resolve(ok)));
  }
  return Promise.resolve(window.confirm(message));
}

// Отправка приглашения: в Telegram открывается выбор контакта.
// Возвращает { shared: boolean } или { devLink } в режиме разработки.
export function shareInvite({ token, preparedMessageId }) {
  if (tg?.shareMessage && preparedMessageId) {
    return new Promise((resolve) => tg.shareMessage(preparedMessageId, (sent) => resolve({ shared: Boolean(sent) })));
  }
  const url = new URL(window.location.href);
  url.search = '';
  url.searchParams.set('startapp', `inv_${token}`);
  url.searchParams.set('pick', '1');
  return Promise.resolve({ devLink: url.toString() });
}

// Кнопка «Назад» в шапке Telegram.
export function showBackButton(onClick) {
  if (!tg?.BackButton || !tg.initData) return () => {};
  tg.BackButton.onClick(onClick);
  tg.BackButton.show();
  return () => {
    tg.BackButton.offClick(onClick);
    tg.BackButton.hide();
  };
}

// Значок приложения на главном экране телефона (Telegram 8.0+).
// Статус: 'unsupported' | 'unknown' | 'missed' | 'added'.
export function checkHomeScreen() {
  if (!tg?.initData || !tg.isVersionAtLeast?.('8.0') || !tg.addToHomeScreen || !tg.checkHomeScreenStatus) {
    return Promise.resolve('unsupported');
  }
  return new Promise((resolve) => {
    try {
      tg.checkHomeScreenStatus((status) => resolve(status || 'unknown'));
    } catch {
      resolve('unsupported');
    }
  });
}

// Показывает системный запрос «Добавить на главный экран».
// onAdded вызывается, если пользователь согласился. Возвращает функцию отписки.
export function addToHomeScreen(onAdded) {
  const handler = () => {
    tg.offEvent('homeScreenAdded', handler);
    onAdded();
  };
  tg.onEvent('homeScreenAdded', handler);
  tg.addToHomeScreen();
  return () => tg.offEvent('homeScreenAdded', handler);
}

export function inviteTokenFrom(startParam) {
  return startParam && startParam.startsWith('inv_') ? startParam.slice(4) : null;
}
