import { describe, expect, it } from 'vitest';
import { signInitData, verifyInitData } from './telegramAuth.js';

const BOT_TOKEN = '123456:TEST-TOKEN-FOR-UNIT-TESTS';
const NOW = 1_800_000_000;

async function makeInitData(fields, token = BOT_TOKEN) {
  const params = new URLSearchParams(fields);
  params.set('hash', await signInitData(params, token));
  return params.toString();
}

const user = JSON.stringify({ id: 42, first_name: 'Аня', username: 'anya' });

describe('verifyInitData', () => {
  it('принимает правильно подписанные данные', async () => {
    const initData = await makeInitData({ auth_date: String(NOW - 60), query_id: 'q', user });
    expect(await verifyInitData(initData, BOT_TOKEN, NOW)).toEqual({
      id: 42,
      firstName: 'Аня',
      username: 'anya',
      photoUrl: null,
    });
  });

  it('отклоняет подделанного пользователя', async () => {
    const initData = await makeInitData({ auth_date: String(NOW), user });
    const forged = initData.replace(encodeURIComponent('"id":42'), encodeURIComponent('"id":43'));
    await expect(verifyInitData(forged, BOT_TOKEN, NOW)).rejects.toThrow('bad_signature');
  });

  it('отклоняет подпись другого бота', async () => {
    const initData = await makeInitData({ auth_date: String(NOW), user }, '999:OTHER');
    await expect(verifyInitData(initData, BOT_TOKEN, NOW)).rejects.toThrow('bad_signature');
  });

  it('отклоняет слишком старые данные', async () => {
    const initData = await makeInitData({ auth_date: String(NOW - 8 * 24 * 3600), user });
    await expect(verifyInitData(initData, BOT_TOKEN, NOW)).rejects.toThrow('expired');
  });
});
