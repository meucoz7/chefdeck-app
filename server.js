import 'dotenv/config';
import express from 'express';
import TelegramBot from 'node-telegram-bot-api';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// Fix for __dirname in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEBHOOK_URL = process.env.WEBHOOK_URL; 
const DB_FILE = path.join(__dirname, 'database.json');

// Initialize Bot (Only if token exists)
let bot = null;
if (TELEGRAM_TOKEN) {
    try {
        bot = new TelegramBot(TELEGRAM_TOKEN);
    } catch (e) {
        console.error("Bot init failed:", e);
    }
}

// Middleware
app.use(express.json()); // Use built-in express parser instead of body-parser

// CORS middleware for development flexibility
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    res.header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// Serve React Frontend
app.use(express.static(path.join(__dirname, 'dist'))); 

// --- DATABASE HELPERS ---
const getDb = () => {
    try {
        if (!fs.existsSync(DB_FILE)) {
            const initial = { recipes: [], users: {} };
            fs.writeFileSync(DB_FILE, JSON.stringify(initial));
            return initial;
        }
        return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
    } catch (e) {
        console.error("DB Read Error", e);
        return { recipes: [], users: {} };
    }
};

const saveDb = (data) => {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error("DB Save Error", e);
    }
};

// --- API ENDPOINTS ---

// 1. Get All Recipes
app.get('/api/recipes', (req, res) => {
    const db = getDb();
    res.json(db.recipes || []);
});

// 2. Add/Update Recipe
app.post('/api/recipes', (req, res) => {
    const recipe = req.body;
    const db = getDb();
    
    if (!db.recipes) db.recipes = [];

    const index = db.recipes.findIndex(r => r.id === recipe.id);
    if (index >= 0) {
        db.recipes[index] = recipe;
    } else {
        db.recipes.unshift(recipe);
    }
    
    saveDb(db);
    res.json({ success: true, recipe });
});

// 3. Delete Recipe
app.delete('/api/recipes/:id', (req, res) => {
    const { id } = req.params;
    const db = getDb();
    
    if (db.recipes) {
        db.recipes = db.recipes.filter(r => r.id !== id);
        saveDb(db);
    }
    res.json({ success: true });
});

// 4. Sync User
app.post('/api/sync-user', (req, res) => {
    const user = req.body;
    if (!user || !user.id) return res.status(400).json({ error: 'Invalid user' });

    const db = getDb();
    if (!db.users) db.users = {};

    db.users[user.id] = {
        ...user,
        lastSeen: Date.now()
    };
    saveDb(db);
    res.json({ success: true });
});

// 5. Notify Users
app.post('/api/notify', async (req, res) => {
    if (!bot) return res.json({ success: false, error: 'No bot configured' });

    const { recipeTitle, action, editorName, recipeId, targetChatId, notifyAll } = req.body;
    const db = getDb();
    
    console.log(`[NOTIFY] Action: ${action}, Title: ${recipeTitle}, NotifyAll: ${notifyAll}`);

    let message = '';
    const link = `${WEBHOOK_URL}/#/recipe/${recipeId}`;

    if (action === 'create') {
        message = `🍳 <b>Новая техкарта!</b>\n\nШеф ${editorName} добавил: "${recipeTitle}".\n\n<a href="${link}">Открыть карту</a>`;
    } else if (action === 'update') {
        message = `📝 <b>Обновление рецепта</b>\n\n${editorName} изменил техкарту "${recipeTitle}".\n\n<a href="${link}">Посмотреть изменения</a>`;
    } else if (action === 'delete') {
        message = `🗑 <b>Техкарта удалена</b>\n\n"${recipeTitle}" была удалена из базы.`;
    }

    let recipients = [];
    if (notifyAll && db.users) {
        // Send to everyone except the editor (optional, but usually better to send to all including self for confirmation)
        recipients = Object.keys(db.users);
    } else if (targetChatId) {
        recipients = [targetChatId];
    }
    
    console.log(`[NOTIFY] Sending to ${recipients.length} users`);

    let sentCount = 0;
    const promises = recipients.map(chatId => {
        return bot.sendMessage(chatId, message, { parse_mode: 'HTML' })
            .then(() => sentCount++)
            .catch(err => console.error(`Failed to send to ${chatId}:`, err.message));
    });

    await Promise.all(promises);
    res.json({ success: true, sentTo: sentCount });
});


// --- TELEGRAM WEBHOOK ---
if (TELEGRAM_TOKEN && bot) {
    app.post(`/bot${TELEGRAM_TOKEN}`, (req, res) => {
        bot.processUpdate(req.body);
        res.sendStatus(200);
    });

    bot.onText(/\/start/, (msg) => {
        const chatId = msg.chat.id;
        const db = getDb();
        if (!db.users) db.users = {};
        
        db.users[chatId] = { id: chatId, first_name: msg.from.first_name, username: msg.from.username, lastSeen: Date.now() };
        saveDb(db);

        const appUrl = WEBHOOK_URL || "https://google.com"; 

        bot.sendMessage(chatId, "Добро пожаловать! 👨‍🍳\n\nНажмите кнопку ниже, чтобы открыть базу рецептов.", {
            reply_markup: {
                inline_keyboard: [
                    [{ text: "Открыть Приложение 📱", web_app: { url: appUrl } }]
                ]
            }
        });
    });
}

// Handle React Routing (Serve index.html for unknown routes)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, async () => {
    console.log(`ChefDeck Server running on port ${PORT}`);
    
    if (WEBHOOK_URL && bot) {
        try {
            await bot.setWebHook(`${WEBHOOK_URL}/bot${TELEGRAM_TOKEN}`);
            console.log(`Webhook set: ${WEBHOOK_URL}/bot${TELEGRAM_TOKEN}`);
        } catch (e) {
            console.error("Webhook setup failed:", e.message);
        }
    }
});
