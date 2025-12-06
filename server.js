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

// Middleware - INCREASED LIMIT for Base64 Images
app.use(express.json({ limit: '50mb' })); 

// CORS middleware
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
            const initial = { recipes: [], users: {}, schedule: [] };
            fs.writeFileSync(DB_FILE, JSON.stringify(initial));
            return initial;
        }
        return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
    } catch (e) {
        console.error("DB Read Error", e);
        return { recipes: [], users: {}, schedule: [] };
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

// 5. Notify Users (Change Log)
app.post('/api/notify', async (req, res) => {
    if (!bot) return res.json({ success: false, error: 'No bot configured' });

    const { recipeTitle, action, recipeId, targetChatId, notifyAll, changes, silent } = req.body;
    
    if (silent) return res.json({ success: true, skipped: true });

    const db = getDb();
    
    console.log(`[NOTIFY] Action: ${action}, Title: ${recipeTitle}`);

    let message = '';
    const appUrl = WEBHOOK_URL || "https://google.com";
    
    if (action === 'create') {
        message = `🍳 <b>Новая техкарта</b>\n\n"${recipeTitle}" добавлена в базу.`;
    } else if (action === 'update') {
        message = `📝 <b>Изменения в техкарте</b>\n"${recipeTitle}"`;
        
        if (changes && Array.isArray(changes) && changes.length > 0) {
            message += `\n\n🔻 <b>Что изменилось:</b>\n`;
            changes.forEach(change => {
                // Ensure nice formatting for changes
                message += `• ${change}\n`;
            });
        } else {
            message += `\n\nВнесены правки (детали не указаны).`;
        }
    } else if (action === 'delete') {
        message = `🗑 <b>Техкарта удалена</b>\n\n"${recipeTitle}" была удалена.`;
    }

    let recipients = [];
    if (notifyAll && db.users) {
        recipients = Object.keys(db.users);
    } else if (targetChatId) {
        recipients = [targetChatId];
    }

    const options = { parse_mode: 'HTML' };

    if (action !== 'delete') {
        options.reply_markup = {
            inline_keyboard: [
                [{ text: "📱 Открыть карту", web_app: { url: `${appUrl}/#/recipe/${recipeId}` } }]
            ]
        };
    }
    
    const promises = recipients.map(chatId => {
        return bot.sendMessage(chatId, message, options)
            .catch(err => console.error(`Failed to send to ${chatId}:`, err.message));
    });

    await Promise.all(promises);
    res.json({ success: true, count: recipients.length });
});

// 6. Share Recipe to Chat
app.post('/api/share-recipe', async (req, res) => {
    if (!bot) return res.status(503).json({ error: 'Bot not ready' });
    
    const { recipeId, targetChatId } = req.body;
    const db = getDb();
    const recipe = db.recipes?.find(r => r.id === recipeId);

    if (!recipe) return res.status(404).json({ error: 'Recipe not found' });

    // Format Message
    let caption = `👨‍🍳 <b>${recipe.title.toUpperCase()}</b>`;
    if (recipe.category) caption += `\n📂 Категория: ${recipe.category}`;
    if (recipe.outputWeight) caption += `\n⚖️ Выход: ${recipe.outputWeight}`;
    
    caption += `\n\n📝 <b>Ингредиенты:</b>\n`;
    recipe.ingredients.forEach(ing => {
        caption += `▫️ ${ing.name}: <b>${ing.amount} ${ing.unit}</b>\n`;
    });

    caption += `\n🔪 <b>Приготовление:</b>\n`;
    if (recipe.steps && recipe.steps.length > 0) {
        recipe.steps.forEach((step, i) => {
            caption += `${i+1}. ${step}\n`;
        });
    } else {
        caption += `См. в приложении`;
    }

    const appUrl = WEBHOOK_URL || "https://google.com";
    const options = {
        parse_mode: 'HTML',
        reply_markup: {
            inline_keyboard: [
                [{ text: "📱 Открыть в приложении", web_app: { url: `${appUrl}/#/recipe/${recipeId}` } }]
            ]
        }
    };

    try {
        if (recipe.imageUrl && recipe.imageUrl.startsWith('data:image')) {
            // Convert base64 to buffer
            const base64Data = recipe.imageUrl.replace(/^data:image\/\w+;base64,/, "");
            const buffer = Buffer.from(base64Data, 'base64');
            await bot.sendPhoto(targetChatId, buffer, { caption, ...options });
        } else {
            await bot.sendMessage(targetChatId, caption, options);
        }
        res.json({ success: true });
    } catch (e) {
        console.error("Share failed", e);
        res.status(500).json({ error: e.message });
    }
});

// 7. Schedule Endpoints
app.get('/api/schedule', (req, res) => {
    const db = getDb();
    res.json(db.schedule || []);
});

app.post('/api/schedule', (req, res) => {
    const schedule = req.body;
    const db = getDb();
    db.schedule = schedule;
    saveDb(db);
    res.json({ success: true });
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

        bot.sendMessage(chatId, "Добро пожаловать в ChefDeck! 👨‍🍳\n\nБаза техкарт вашего ресторана.", {
            reply_markup: {
                inline_keyboard: [
                    [{ text: "Открыть ChefDeck 📱", web_app: { url: appUrl } }]
                ]
            }
        });
    });
}

// Handle React Routing
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, async () => {
    console.log(`ChefDeck Server running on port ${PORT}`);
    if (WEBHOOK_URL && bot) {
        try {
            await bot.setWebHook(`${WEBHOOK_URL}/bot${TELEGRAM_TOKEN}`);
        } catch (e) {
            console.error("Webhook setup failed:", e.message);
        }
    }
});
