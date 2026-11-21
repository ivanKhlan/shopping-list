// Supabase Edge Function `api` — единственная точка входа для приложения.
// Каждый запрос проверяется по подписи Telegram (initData), затем
// передаётся в общую логику service.js.
//
// Секреты (supabase secrets set ...):
//   BOT_TOKEN       — токен бота от @BotFather
//   BOT_USERNAME    — имя бота без @, например my_shopping_bot
// SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY Supabase подставляет сам.

import { createClient } from 'npm:@supabase/supabase-js@2.49.4';
import { createService, dispatch, ServiceError } from '../_shared/service.js';
import { createSupabaseRepo } from '../_shared/supabaseRepo.js';
import { verifyInitData } from '../_shared/telegramAuth.js';

const BOT_TOKEN = Deno.env.get('BOT_TOKEN');
const BOT_USERNAME = Deno.env.get('BOT_USERNAME');

const db = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false },
});

const service = createService({
  repo: createSupabaseRepo(db),
  randomId: () => {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  },
});

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'x-telegram-init-data, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

// Готовим сообщение-приглашение, которое пользователь отправит выбранному
// контакту через Telegram.WebApp.shareMessage().
async function prepareInviteMessage(user, token) {
  // Ссылка на главное Mini App бота (BotFather → Configure Mini App).
  // Короткое имя из /newapp не нужно.
  const link = `https://t.me/${BOT_USERNAME}?startapp=inv_${token}`;
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/savePreparedInlineMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: user.id,
      allow_user_chats: true,
      allow_group_chats: true,
      result: {
        type: 'article',
        id: token.slice(0, 32),
        title: 'Пригласить в список покупок',
        input_message_content: {
          message_text: `${user.firstName} приглашает вас в общий список покупок 🛒\nПриглашение действует сутки.`,
        },
        reply_markup: { inline_keyboard: [[{ text: 'Присоединиться к списку', url: link }]] },
      },
    }),
  });
  const body = await res.json();
  if (!body.ok) throw new Error(`telegram: ${body.description}`);
  return body.result.id;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  let user;
  try {
    user = await verifyInitData(req.headers.get('X-Telegram-Init-Data') ?? '', BOT_TOKEN);
  } catch (err) {
    return json({ error: `auth_${err.message}` }, 401);
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad_json' }, 400);
  }

  try {
    const result = await dispatch(service, user, body);
    if (body.action === 'createInvite') {
      result.preparedMessageId = await prepareInviteMessage(user, result.token);
    }
    return json(result);
  } catch (err) {
    if (err instanceof ServiceError) {
      return json({ error: err.code }, err.code === 'busy' ? 503 : 400);
    }
    console.error(err);
    return json({ error: 'internal' }, 500);
  }
});
