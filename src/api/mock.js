// Поддельный бэкенд для разработки. Та же серверная логика (service.js),
// что и в Supabase, но база хранится в localStorage браузера — её видят
// все вкладки, поэтому две вкладки ведут себя как два телефона.

import { createService, dispatch } from '../../supabase/functions/_shared/service.js';
import { ApiError } from '../store/listStore.js';
import { createMemoryRepo } from './memoryRepo.js';

const DB_KEY = 'mock-server-db';
const OFFLINE_KEY = 'dev-offline';
const DELAY_MS = 250;

export function isDevOffline() {
  try {
    return sessionStorage.getItem(OFFLINE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setDevOffline(offline) {
  try {
    if (offline) sessionStorage.setItem(OFFLINE_KEY, '1');
    else sessionStorage.removeItem(OFFLINE_KEY);
  } catch {
    // ignore
  }
}

export function createMockApi(user) {
  const repo = createMemoryRepo({
    load: () => JSON.parse(localStorage.getItem(DB_KEY) ?? 'null'),
    save: (db) => localStorage.setItem(DB_KEY, JSON.stringify(db)),
  });
  const service = createService({ repo, randomId: () => crypto.randomUUID().replace(/-/g, '') });

  async function call(action, params) {
    await new Promise((r) => setTimeout(r, DELAY_MS));
    if (!navigator.onLine || isDevOffline()) throw new ApiError('network');
    try {
      return structuredClone(await dispatch(service, user, { action, ...params }));
    } catch (err) {
      throw new ApiError('server', err.code ?? 'server', err.message);
    }
  }

  return {
    bootstrap: () => call('bootstrap'),
    sync: (p) => call('sync', p),
    createInvite: async () => ({ ...(await call('createInvite')), preparedMessageId: null }),
    previewInvite: (p) => call('previewInvite', p),
    acceptInvite: (p) => call('acceptInvite', p),
    leaveFamily: () => call('leaveFamily'),
  };
}
