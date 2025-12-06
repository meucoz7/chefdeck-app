
# ChefDeck - Telegram Mini App

Система управления техкартами для ресторанов с интеграцией Telegram Bot и AI.

## Функционал
- 📱 Telegram Mini App (TWA)
- 🤖 Telegram Bot (Уведомления)
- 🍳 Управление рецептами и ингредиентами
- ✨ AI Генерация техкарт (Gemini)
- 📂 Импорт из PDF

## Как запустить локально

1. Установите зависимости:
   ```bash
   npm install
   ```

2. Создайте файл `.env` в корне и добавьте ключи:
   ```env
   TELEGRAM_BOT_TOKEN=ващ_токен
   API_KEY=ваш_gemini_key
   WEBHOOK_URL=https://ваш-url.com
   ```

3. Запустите проект:
   ```bash
   npm run dev
   ```

## Деплой (Инструкция)

Этот проект требует Node.js сервера. Рекомендуемый хостинг: Render.com.

1. Залейте код на GitHub.
2. Создайте "Web Service" на Render.
3. Укажите Build Command: `npm install && npm run build`
4. Укажите Start Command: `node server.js`
