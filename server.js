
import 'dotenv/config';
import express from 'express';
import TelegramBot from 'node-telegram-bot-api';
import path from 'path';
import fs from 'fs';
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';

// Fix for __dirname in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const MONGODB_URI = process.env.MONGODB_URI; // Connection string from Render Env Vars

// --- MONGODB SCHEMAS ---
const recipeSchema = new mongoose.Schema({
    id: String,
    title: String,
    description: String,
    imageUrl: String,
    videoUrl: String,
    category: String,
    outputWeight: String,
    isFavorite: Boolean,
    isArchived: { type: Boolean, default: false }, // Added field
    ingredients: Array,
    steps: Array,
    createdAt: Number,
    lastModified: Number,
    lastModifiedBy: String
});

const userSchema = new mongoose.Schema({
    id: { type: Number, unique: true },
    first_name: String,
    last_name: String,
    username: String,
    lastSeen: Number
});

const scheduleSchema = new mongoose.Schema({
    docId: { type: String, default: 'main_schedule' }, // Singleton document
    staff: Array
});

const Recipe = mongoose.model('Recipe', recipeSchema);
const User = mongoose.model('User', userSchema);
const Schedule = mongoose.model('Schedule', scheduleSchema);

// --- DB CONNECTION ---
let useMongo = false;
if (MONGODB_URI) {
    mongoose.connect(MONGODB_URI)
        .then(() => {
            console.log("✅ Connected to MongoDB");
            useMongo = true;
        })
        .catch(err => {
            console.error("❌ MongoDB Connection Error:", err);
            console.log("⚠️ Falling back to local JSON file (Data will be lost on deploy)");
        });
} else {
    console.log("⚠️ MONGODB_URI not found. Using local JSON file (Data will be lost on deploy)");
}

// Initialize Bot
let bot = null;
if (TELEGRAM_TOKEN) {
    try {
        bot = new TelegramBot(TELEGRAM_TOKEN);
    } catch (e) {
        console.error("Bot init failed:", e);
    }
}

// Middleware
app.use(express.json({ limit: '50mb' }));

// CORS
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    res.header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

app.use(express.static(path.join(__dirname, 'dist')));

// --- DATA ACCESS LAYER (Hybrid: JSON or Mongo) ---
const DB_FILE = path.join(__dirname, 'database.json');

const getLocalDb = () => {
    try {
        if (!fs.existsSync(DB_FILE)) return { recipes: [], users: {}, schedule: [] };
        return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
    } catch (e) { return { recipes: [], users: {}, schedule: [] }; }
};

const saveLocalDb = (data) => {
    try { fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2)); } catch (e) { console.error(e); }
};

// --- HELPER: Escape HTML ---
const escapeHtml = (unsafe) => {
    if (!unsafe) return "";
    return String(unsafe)
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
};

// --- API ENDPOINTS ---

// 1. Recipes
app.get('/api/recipes', async (req, res) => {
    if (useMongo) {
        try {
            const recipes = await Recipe.find({});
            res.json(recipes);
        } catch (e) { res.status(500).json({ error: e.message }); }
    } else {
        const db = getLocalDb();
        res.json(db.recipes || []);
    }
});

app.post('/api/recipes', async (req, res) => {
    const recipeData = req.body;
    
    if (useMongo) {
        try {
            await Recipe.findOneAndUpdate(
                { id: recipeData.id },
                recipeData,
                { upsert: true, new: true }
            );
            res.json({ success: true });
        } catch (e) { res.status(500).json({ error: e.message }); }
    } else {
        const db = getLocalDb();
        if (!db.recipes) db.recipes = [];
        const index = db.recipes.findIndex(r => r.id === recipeData.id);
        if (index >= 0) db.recipes[index] = recipeData;
        else db.recipes.unshift(recipeData);
        saveLocalDb(db);
        res.json({ success: true });
    }
});

app.delete('/api/recipes/:id', async (req, res) => {
    const { id } = req.params;
    
    if (useMongo) {
        try {
            await Recipe.findOneAndDelete({ id });
            res.json({ success: true });
        } catch (e) { res.status(500).json({ error: e.message }); }
    } else {
        const db = getLocalDb();
        if (db.recipes) {
            db.recipes = db.recipes.filter(r => r.id !== id);
            saveLocalDb(db);
        }
        res.json({ success: true });
    }
});

// 2. Sync User
app.post('/api/sync-user', async (req, res) => {
    const userData = req.body;
    if (!userData || !userData.id) return res.status(400).json({ error: 'Invalid user' });

    if (useMongo) {
        try {
            await User.findOneAndUpdate(
                { id: userData.id },
                { ...userData, lastSeen: Date.now() },
                { upsert: true }
            );
            res.json({ success: true });
        } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
    } else {
        const db = getLocalDb();
        if (!db.users) db.users = {};
        db.users[userData.id] = { ...userData, lastSeen: Date.now() };
        saveLocalDb(db);
        res.json({ success: true });
    }
});

// 3. Notify
app.post('/api/notify', async (req, res) => {
    if (!bot) return res.json({ success: false, error: 'No bot' });

    const { recipeTitle, action, recipeId, targetChatId, notifyAll, changes, silent } = req.body;
    if (silent) return res.json({ success: true, skipped: true });

    let recipients = [];
    
    if (notifyAll) {
        if (useMongo) {
            const users = await User.find({});
            recipients = users.map(u => u.id);
        } else {
            const db = getLocalDb();
            recipients = Object.keys(db.users || {});
        }
    } else if (targetChatId) {
        recipients = [targetChatId];
    }

    // Safety check for title
    const safeTitle = escapeHtml(recipeTitle || "Без названия");

    let message = '';
    const appUrl = WEBHOOK_URL || "https://google.com";
    
    if (action === 'create') message = `🍳 <b>Новая техкарта</b>\n\n"${safeTitle}" добавлена в базу.`;
    else if (action === 'update') {
        message = `📝 <b>Изменения в техкарте</b>\n"${safeTitle}"`;
        if (changes?.length > 0) {
            // changes already HTML safe from context
            message += `\n\n🔻 <b>Что изменилось:</b>\n` + changes.map(c => `• ${c}`).join('\n');
        } else {
            message += `\n\nВнесены правки.`;
        }
    } else if (action === 'delete') message = `🗑 <b>Техкарта удалена</b>\n\n"${safeTitle}" была удалена.`;

    const options = { parse_mode: 'HTML' };
    if (action !== 'delete') {
        options.reply_markup = { inline_keyboard: [[{ text: "📱 Открыть карту", web_app: { url: `${appUrl}/#/recipe/${recipeId}` } }]] };
    }

    // Filter valid IDs and unique
    recipients = [...new Set(recipients)].filter(id => id);

    const promises = recipients.map(chatId => bot.sendMessage(chatId, message, options).catch(e => console.error(`Failed to msg ${chatId}: ${e.message}`)));
    await Promise.all(promises);
    res.json({ success: true, count: recipients.length });
});

// 4. Share Recipe
app.post('/api/share-recipe', async (req, res) => {
    if (!bot) return res.status(503).json({ error: 'Bot not ready' });
    const { recipeId, targetChatId } = req.body;

    let recipe;
    if (useMongo) {
        recipe = await Recipe.findOne({ id: recipeId });
    } else {
        const db = getLocalDb();
        recipe = db.recipes?.find(r => r.id === recipeId);
    }

    if (!recipe) return res.status(404).json({ error: 'Recipe not found' });

    // Sanitize data
    const safeTitle = escapeHtml(recipe.title);
    const safeCategory = escapeHtml(recipe.category);
    const safeOutput = escapeHtml(recipe.outputWeight);

    let caption = `👨‍🍳 <b>${safeTitle.toUpperCase()}</b>`;
    if (recipe.category) caption += `\n📂 Категория: ${safeCategory}`;
    if (recipe.outputWeight) caption += `\n⚖️ Выход: ${safeOutput}`;
    caption += `\n\n📝 <b>Ингредиенты:</b>\n` + recipe.ingredients.map(ing => `▫️ ${escapeHtml(ing.name)}: <b>${escapeHtml(ing.amount)} ${escapeHtml(ing.unit)}</b>`).join('\n');
    caption += `\n🔪 <b>Приготовление:</b>\n` + (recipe.steps.length ? recipe.steps.map((s,i) => `${i+1}. ${escapeHtml(s)}`).join('\n') : `См. в приложении`);

    const appUrl = WEBHOOK_URL || "https://google.com";
    const options = {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: [[{ text: "📱 Открыть в приложении", web_app: { url: `${appUrl}/#/recipe/${recipeId}` } }]] }
    };

    try {
        if (recipe.imageUrl?.startsWith('data:image')) {
            const buffer = Buffer.from(recipe.imageUrl.replace(/^data:image\/\w+;base64,/, ""), 'base64');
            // Check caption limit for photos (1024 chars)
            if (caption.length > 1000) caption = caption.substring(0, 990) + "... (подробнее в приложении)";
            
            await bot.sendPhoto(targetChatId, buffer, { caption, ...options });
        } else {
            // Message limit 4096
            if (caption.length > 4000) caption = caption.substring(0, 3990) + "...";
            await bot.sendMessage(targetChatId, caption, options);
        }
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 5. Schedule
app.get('/api/schedule', async (req, res) => {
    if (useMongo) {
        try {
            const doc = await Schedule.findOne({ docId: 'main_schedule' });
            res.json(doc ? doc.staff : []);
        } catch (e) { res.status(500).json({ error: e.message }); }
    } else {
        const db = getLocalDb();
        res.json(db.schedule || []);
    }
});

app.post('/api/schedule', async (req, res) => {
    const staff = req.body;
    if (useMongo) {
        try {
            await Schedule.findOneAndUpdate(
                { docId: 'main_schedule' },
                { staff },
                { upsert: true }
            );
            res.json({ success: true });
        } catch (e) { res.status(500).json({ error: e.message }); }
    } else {
        const db = getLocalDb();
        db.schedule = staff;
        saveLocalDb(db);
        res.json({ success: true });
    }
});

// --- TELEGRAM WEBHOOK ---
if (TELEGRAM_TOKEN && bot) {
    app.post(`/bot${TELEGRAM_TOKEN}`, (req, res) => {
        bot.processUpdate(req.body);
        res.sendStatus(200);
    });
    bot.onText(/\/start/, (msg) => {
        const chatId = msg.chat.id;
        // Sync user logic is handled by frontend /api/sync-user usually, but we can do basic here if needed
        const appUrl = WEBHOOK_URL || "https://google.com";
        bot.sendMessage(chatId, "Добро пожаловать в ChefDeck! 👨‍🍳", {
            reply_markup: { inline_keyboard: [[{ text: "Открыть ChefDeck 📱", web_app: { url: appUrl } }]] }
        });
    });
}

// Serve Frontend
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));

app.listen(PORT, async () => {
    console.log(`ChefDeck Server running on port ${PORT}`);
    if (WEBHOOK_URL && bot) {
        try { await bot.setWebHook(`${WEBHOOK_URL}/bot${TELEGRAM_TOKEN}`); } 
        catch (e) { console.error("Webhook failed:", e.message); }
    }
});
