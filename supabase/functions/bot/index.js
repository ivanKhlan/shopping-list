// Supabase Edge Function `bot` — вебхук Telegram-бота.
// Бот минимальный: на /start отвечает приветствием и кнопкой «Открыть список».
//
// Секреты:
//   BOT_TOKEN       — токен бота
//   APP_URL         — адрес приложения (GitHub Pages), например https://login.github.io/shopping-list/
//   WEBHOOK_SECRET  — любая длинная случайная строка; та же передаётся в setWebhook (secret_token)

const BOT_TOKEN = Deno.env.get('BOT_TOKEN');
const APP_URL = Deno.env.get('APP_URL');
const WEBHOOK_SECRET = Deno.env.get('WEBHOOK_SECRET');

async function telegram(method, payload) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

Deno.serve(async (req) => {
  // Запросы не от Telegram отбрасываем.
  if (req.headers.get('X-Telegram-Bot-Api-Secret-Token') !== WEBHOOK_SECRET) {
    return new Response('forbidden', { status: 403 });
  }

  const update = await req.json().catch(() => null);
  const msg = update?.message;
  if (msg?.chat?.type === 'private' && typeof msg.text === 'string' && msg.text.startsWith('/start')) {
    await telegram('sendMessage', {
      chat_id: msg.chat.id,
      text: 'Привет! Здесь общий список покупок для вашей семьи.\nОткройте его кнопкой ниже или кнопкой «Список» слева от поля ввода.',
      reply_markup: { inline_keyboard: [[{ text: '🛒 Открыть список', web_app: { url: APP_URL } }]] },
    });
  }
  return new Response('ok');
});
