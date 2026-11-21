# Список покупок — Telegram Mini App

Общий список покупок на 2–3 человека («семья»). Один бот для всех, у каждой семьи свой список.
Работает без интернета: показывает последний список, правки копятся и отправляются, когда появится сеть.

## Запуск на компьютере

```powershell
npm install
npm run dev
```

Откройте http://localhost:5173. Вне Telegram включается **режим разработки**:

- выбираете тестового пользователя (Аня / Петя / Вася);
- **две вкладки с разными пользователями = два телефона**;
- «Семья» → «Пригласить» покажет ссылку — откройте её в новой вкладке, это «второй телефон»;
- галочка **«без сети»** в жёлтой полосе имитирует пропажу интернета.

Вместо Supabase работает поддельный бэкенд: та же серверная логика, но база лежит в `localStorage` браузера.
Очистить всё: в консоли браузера `localStorage.clear()`.

## Тесты

```powershell
npm test
```

Покрыто: слияние правок («побеждает последняя правка», удаление побеждает), офлайн-очередь двух телефонов,
повторы товаров, шаги единиц, приглашения, проверка подписи Telegram.

## Как устроено

| Где | Что |
| --- | --- |
| `supabase/functions/_shared/merge.js` | Правила слияния правок. Общие для телефона и сервера |
| `supabase/functions/_shared/service.js` | «Сервер»: семьи, приглашения, синхронизация. Работает поверх хранилища |
| `supabase/functions/_shared/telegramAuth.js` | Проверка подписи Telegram (initData) |
| `supabase/functions/api/` | Edge Function: проверка входа → `service.js` → таблицы Supabase |
| `supabase/functions/bot/` | Вебхук бота: ответ на /start |
| `supabase/migrations/` | Таблицы `families`, `members`, `invites` |
| `src/store/listStore.js` | Телефон: локальная копия + офлайн-очередь + синхронизация + отмена удаления |
| `src/api/` | `mock.js` — поддельный бэкенд, `real.js` — настоящий |
| `src/components/` | Экраны: список, семья, приглашение (с волной DistortionWave) |
| `public/sw.js` | Сервис-воркер: приложение открывается без интернета |

Список семьи хранится одним документом с номером версии: если два телефона пишут одновременно,
второй перечитает список и применит свои правки заново — ничего не теряется.

## Выкладка

> В PowerShell пишите `npm.cmd` и `npx.cmd` вместо `npm` и `npx`: Windows по умолчанию
> не даёт PowerShell запускать их обычные версии. Все команды — из папки `shopping-list`.

**Токен бота — это пароль от бота.** Он вводится только в настройки Supabase и в адрес вебхука (шаг 5).
В код, в git, в `.env` и в чаты он попадать не должен. Если токен утёк — в @BotFather: `/revoke`.

### 0. Что понадобится

- git (https://git-scm.com/download/win), аккаунты на https://github.com и https://supabase.com — бесплатные;
- Supabase CLI уже есть в проекте (`npx.cmd supabase ...`), ставить отдельно не нужно.

### 1. Код на GitHub → адрес приложения

1. На GitHub: **New repository**, имя `shopping-list`, **Public** (бесплатные Pages — только для публичных),
   без README.
2. В папке проекта (подставьте свой логин):
   ```powershell
   git init -b main
   git add .
   git commit -m "Список покупок"
   git remote add origin https://github.com/<логин>/shopping-list.git
   git push -u origin main
   ```
3. В репозитории: **Settings → Pages → Source: GitHub Actions**. Затем **Actions → Deploy to GitHub Pages →
   Run workflow**. Через пару минут приложение будет по адресу `https://<логин>.github.io/shopping-list/`.
   Пока это ещё поддельный бэкенд — так и должно быть.

### 2. Бот

В Telegram у @BotFather:
1. `/newbot` → имя и username бота (например `my_shopping_list_bot`) → получите **токен**.
2. `/mybots` → бот → **Bot Settings → Configure Mini App → Enable Mini App** → **адрес из шага 1**.
   Это главное Mini App бота: по нему работают ссылки-приглашения `t.me/<бот>?startapp=...`.
3. `/mybots` → бот → **Bot Settings → Menu Button** → адрес из шага 1, текст «Список».
4. По желанию: `/setuserpic` — аватарка бота (её же Telegram, скорее всего, берёт для значка на экране телефона).

### 3. Supabase: база

1. На supabase.com: **New project** (регион — например Frankfurt), пароль базы сохраните у себя.
2. Ref проекта — в адресе страницы проекта: `supabase.com/dashboard/project/<ref>`.
3. В папке проекта:
   ```powershell
   npx.cmd supabase login
   npx.cmd supabase link --project-ref <ref>
   npm.cmd run deploy:db
   ```
   `link` спросит пароль базы.

### 4. Supabase: секреты и функции

1. В панели Supabase: **Edge Functions → Secrets** → добавьте:

   | Имя | Значение |
   | --- | --- |
   | `BOT_TOKEN` | токен из шага 2 |
   | `BOT_USERNAME` | username бота без `@` |
   | `APP_URL` | адрес из шага 1 |
   | `WEBHOOK_SECRET` | длинная случайная строка из букв и цифр (придумайте, 30+ символов) |

2. Выложите функции:
   ```powershell
   npm.cmd run deploy:functions
   ```

### 5. Вебхук бота (один раз)

Откройте в браузере, подставив значения:
`https://api.telegram.org/bot<токен>/setWebhook?url=https://<ref>.supabase.co/functions/v1/bot&secret_token=<WEBHOOK_SECRET>`

Должно ответить `"ok":true`. Теперь бот отвечает на /start.

### 6. Подключить приложение к Supabase

На GitHub: **Settings → Secrets and variables → Actions → Variables → New repository variable**:
`VITE_API_URL` = `https://<ref>.supabase.co/functions/v1/api`. Затем **Actions → Run workflow** ещё раз.

### 7. Проверка

Откройте бота, нажмите /start → «Открыть список». Добавьте товар, нажмите «Семья» → «Пригласить»,
отправьте приглашение второму человеку. Если что-то не так — логи функций в панели Supabase:
**Edge Functions → api → Logs**.

Обновления потом: `git add .`, `git commit -m "..."`, `git push` — сайт пересоберётся сам.
Изменили функции — `npm.cmd run deploy:functions`.

## Что стоит проверить на настоящем телефоне

- **Офлайн-открытие внутри Telegram** держится на сервис-воркере. Android WebView его поддерживает,
  но это нужно проверить вживую: открыть приложение с интернетом, закрыть, включить режим полёта, открыть снова.
- **Волна** требует WebGL2; без него библиотека сама покажет плавное появление.
- Время правок берётся из часов телефона. Если часы сильно сбиты, «последняя правка» может определиться неверно.
- Если оба телефона **без сети** добавят один и тот же товар, получится две строки (объединяются только
  повторы, которые телефон видит в момент добавления).
