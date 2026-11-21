// Проверка подписи initData от Telegram Mini App.
// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
//
// secret = HMAC_SHA256(key = "WebAppData", data = botToken)
// hash   = hex(HMAC_SHA256(key = secret, data = data_check_string))
// data_check_string — все поля, кроме hash, в виде "key=value", отсортированные
// по ключу и склеенные через "\n".
//
// Работает на Web Crypto: и в Deno (Supabase), и в Node (тесты).

const enc = new TextEncoder();

// initData подписан в момент открытия приложения. Офлайн-очередь может
// отправиться заметно позже, поэтому срок жизни подписи — неделя.
export const MAX_AUTH_AGE_SEC = 7 * 24 * 60 * 60;

async function hmac(keyBytes, data) {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
}

function toHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function dataCheckString(params) {
  return [...params.entries()]
    .filter(([k]) => k !== 'hash')
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
}

export async function signInitData(params, botToken) {
  const secret = await hmac(enc.encode('WebAppData'), botToken);
  return toHex(await hmac(secret, dataCheckString(params)));
}

// Возвращает пользователя {id, firstName, username, photoUrl} или бросает ошибку.
export async function verifyInitData(initData, botToken, nowSec = Math.floor(Date.now() / 1000)) {
  if (typeof initData !== 'string' || initData.length === 0) throw new Error('no_init_data');
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) throw new Error('no_hash');

  const expected = await signInitData(params, botToken);
  if (!safeEqual(expected, hash)) throw new Error('bad_signature');

  const authDate = Number(params.get('auth_date'));
  if (!Number.isFinite(authDate) || nowSec - authDate > MAX_AUTH_AGE_SEC) throw new Error('expired');

  const raw = params.get('user');
  if (!raw) throw new Error('no_user');
  const u = JSON.parse(raw);
  if (typeof u.id !== 'number') throw new Error('no_user');
  return {
    id: u.id,
    firstName: [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || 'Без имени',
    username: u.username ?? null,
    photoUrl: u.photo_url ?? null,
  };
}
