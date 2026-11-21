// Настоящий бэкенд: Supabase Edge Function `api`.
// Каждый запрос несёт подписанный Telegram initData — сервер проверяет подпись.

import { ApiError } from '../store/listStore.js';

export function createRealApi({ url, initData }) {
  async function call(action, params) {
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        // Свой заголовок, а не Authorization: шлюз Supabase не будет пытаться
        // разобрать его как JWT.
        headers: { 'Content-Type': 'application/json', 'X-Telegram-Init-Data': initData },
        body: JSON.stringify({ action, ...params }),
      });
    } catch {
      throw new ApiError('network');
    }
    let body = null;
    try {
      body = await res.json();
    } catch {
      // пустой или не-JSON ответ
    }
    if (res.status === 401) throw new ApiError('auth', body?.error);
    if (!res.ok) throw new ApiError('server', body?.error ?? `http_${res.status}`);
    return body;
  }

  return {
    bootstrap: () => call('bootstrap'),
    sync: (p) => call('sync', p),
    createInvite: () => call('createInvite'),
    previewInvite: (p) => call('previewInvite', p),
    acceptInvite: (p) => call('acceptInvite', p),
    leaveFamily: () => call('leaveFamily'),
  };
}
