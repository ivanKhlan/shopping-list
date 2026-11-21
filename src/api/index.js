import { createMockApi } from './mock.js';
import { createRealApi } from './real.js';

// Настоящий бэкенд, если задан адрес функции (VITE_API_URL) и приложение
// открыто в Telegram. Иначе — локальный поддельный.
export function createApi(launch) {
  const url = import.meta.env.VITE_API_URL;
  if (launch.mode === 'telegram' && url) return { api: createRealApi({ url, initData: launch.initData }), kind: 'real' };
  return { api: createMockApi(launch.user), kind: 'mock' };
}
