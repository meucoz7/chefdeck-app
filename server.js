
import 'dotenv/config';
import express from 'express';
import TelegramBot from 'node-telegram-bot-api';
import path from 'path';
import fs from 'fs';
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';
import multer from 'multer';
import FormData from 'form-data';
import fetch from 'node-fetch';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;
const WEBHOOK_URL = process.env.WEBHOOK_URL;

const UPLOAD_API_URL = 'https://pro.filma4.ru/api/v1';
const UPLOAD_API_KEY = '3f154923d8d6324c7a38dcd83159789f82a4ea9224335df225a375a6cb3d6415';
const categoryCache = new Map();

const upload = multer({ storage: multer.memoryStorage() });

// --- MIDDLEWARES ---
app.use(express.json({ limit: '10mb' }));
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, x-bot-id");
  res.header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// --- HEALTH CHECK ---
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy', uptime: process.uptime() });
});

// --- MONGODB SCHEMAS ---
const botConfigSchema = new mongoose.Schema({
    botId: { type: String, required: true, unique: true },
    token: { type: String, required: true },
    name: String,
    ownerId: Number,
    createdAt: { type: Number, default: Date.now }
});

const recipeSchema = new mongoose.Schema({
    botId: { type: String, required: true, index: true },
    id: String,
    title: String,
    description: String,
    imageUrl: String,
    imageUrls: {
        small: String,
        medium: String,
        original: String
    },
    videoUrl: String,
    category: String,
    outputWeight: String,
    isFavorite: Boolean,
    isArchived: { type: Boolean, default: false },
    ingredients: Array,
    steps: Array,
    createdAt: Number,
    lastModified: Number,
    lastModifiedBy: String
});

const userSchema = new mongoose.Schema({
    botId: { type: String, required: true, index: true },
    id: { type: Number },
    first_name: String,
    last_name: String,
    username: String,
    lastSeen: Number,
    isAdmin: { type: Boolean, default: false }
});
userSchema.index({ botId: 1, id: 1 }, { unique: true });

const scheduleSchema = new mongoose.Schema({
    botId: { type: String, required: true, unique: true },
    staff: Array
});

const wastageSchema = new mongoose.Schema({
    botId: { type: String, required: true, index: true },
    id: String,
    date: Number,
    items: Array,
    createdBy: String
});

const inventoryCycleSchema = new mongoose.Schema({
    botId: { type: String, required: true, index: true },
    id: { type: String, required: true },
    date: { type: Number, required: true },
    sheets: Array,
    isFinalized: { type: Boolean, default: false },
    createdBy: String
});

const globalInventoryItemSchema = new mongoose.Schema({
    botId: { type: String, required: true, index: true },
    code: { type: String, required: true },
    name: { type: String, required: true },
    unit: { type: String, required: true }
});

const settingsSchema = new mongoose.Schema({
    botId: { type: String, required: true, unique: true },
    showInventory: { type: Boolean, default: true },
    showSchedule: { type: Boolean, default: true },
    showWastage: { type: Boolean, default: true },
    showArchive: { type: Boolean, default: true }
});

const BotConfig = mongoose.model('BotConfig', botConfigSchema);
const Recipe = mongoose.model('Recipe', recipeSchema);
const User = mongoose.model('User', userSchema);
const Schedule = mongoose.model('Schedule', scheduleSchema);
const Wastage = mongoose.model('Wastage', wastageSchema);
const InventoryCycle = mongoose.model('InventoryCycle', inventoryCycleSchema);
const AppSettingsModel = mongoose.model('AppSettings', settingsSchema);
const GlobalInventoryItem = mongoose.model('GlobalInventoryItem', globalInventoryItemSchema);

if (MONGODB_URI) {
    mongoose.connect(MONGODB_URI)
        .then(() => {
            console.log("✅ Connected to MongoDB");
            initializeAllBots();
        })
        .catch(err => console.error("❌ MongoDB Connection Error:", err));
}

const botInstances = new Map();

const setupBotListeners = (bot, token) => {
    bot.onText(/\/start/, async (msg) => {
        const chatId = msg.chat.id;
        const tgUser = msg.from;
        try {
            const config = await BotConfig.findOne({ token });
            if (!config) return;
            if (tgUser) {
                await User.findOneAndUpdate(
                    { id: tgUser.id, botId: config.botId },
                    { botId: config.botId, id: tgUser.id, first_name: tgUser.first_name, last_name: tgUser.last_name, username: tgUser.username, lastSeen: Date.now() },
                    { upsert: true, new: true }
                );
            }
            
            const botName = config.name || 'ChefDeck';
            const appUrl = `${WEBHOOK_URL || 'https://chefdeck.ru'}/?bot_id=${config.botId}`;
            
            await bot.sendMessage(chatId, `👋 <b>Добро пожаловать в ${botName}!</b>\n\nВаша кулинарная база знаний готова к работе.`, {
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: [[{ text: "📱 Открыть приложение", web_app: { url: appUrl } }]] }
            });
        } catch (e) { console.error(`[Bot] Error:`, e.message); }
    });
};

const getBotInstance = async (token) => {
    if (botInstances.has(token)) return botInstances.get(token);
    try {
        const bot = new TelegramBot(token, { polling: !WEBHOOK_URL });
        if (WEBHOOK_URL) {
            await bot.setWebHook(`${WEBHOOK_URL}/webhook/${token}`).catch(e => console.error(`[Bot] Hook failed:`, e.message));
        }
        setupBotListeners(bot, token);
        botInstances.set(token, bot);
        return bot;
    } catch (e) {
        console.error(`[Bot] Init failed:`, e.message);
        return null;
    }
};

const initializeAllBots = async () => {
    try {
        const bots = await BotConfig.find({});
        for (const b of bots) {
            await getBotInstance(b.token);
        }
    } catch (e) {}
};

const resolveTenant = async (req, res, next) => {
    const botId = req.headers['x-bot-id'] || req.query.bot_id || 'default';
    try {
        let config = await BotConfig.findOne({ botId });
        if (!config && botId === 'default') {
            config = { botId: 'default', token: process.env.TELEGRAM_BOT_TOKEN || 'placeholder', name: 'Default Bot' };
        }
        if (!config) return res.status(404).json({ error: "Bot not found" });
        req.tenant = { botId: config.botId, token: config.token };
        next();
    } catch (e) { res.status(500).send("Tenant resolution error"); }
};

const resolveCategoryId = async (name) => {
    const key = name.toLowerCase().trim();
    if (categoryCache.has(key)) return categoryCache.get(key);
    try {
        const res = await fetch(`${UPLOAD_API_URL}/category/create`, {
            method: 'POST',
            headers: { 'X-API-Key': UPLOAD_API_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: key })
        });
        const result = await res.json();
        if (result.success && result.data && result.data.id) {
            categoryCache.set(key, result.data.id);
            return result.data.id;
        }
    } catch (e) { console.error('[Proxy] Category error:', e.message); }
    return null;
};

// --- API ROUTES ---

app.post('/api/upload', resolveTenant, upload.single('image'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
        const folderName = req.query.folder || 'general';
        const categoryId = await resolveCategoryId(folderName);
        const form = new FormData();
        form.append('image', req.file.buffer, { filename: req.file.originalname || 'upload.jpg', contentType: req.file.mimetype });
        if (categoryId) form.append('category_id', String(categoryId));
        const uploadRes = await fetch(`${UPLOAD_API_URL}/upload`, {
            method: 'POST',
            headers: { 'X-API-Key': UPLOAD_API_KEY, ...form.getHeaders() },
            body: form
        });
        const result = await uploadRes.json();
        res.status(uploadRes.status).json(result);
    } catch (e) { res.status(500).json({ success: false, message: 'Proxy Upload Failed: ' + e.message }); }
});

app.get('/api/settings', resolveTenant, async (req, res) => {
    try {
        let settings = await AppSettingsModel.findOne({ botId: req.tenant.botId });
        if (!settings) settings = await AppSettingsModel.create({ botId: req.tenant.botId });
        res.json(settings);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/settings', resolveTenant, async (req, res) => {
    try {
        const { _id, __v, botId, ...cleanData } = req.body;
        await AppSettingsModel.findOneAndUpdate({ botId: req.tenant.botId }, cleanData, { upsert: true });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/recipes', resolveTenant, async (req, res) => {
    try { res.json(await Recipe.find({ botId: req.tenant.botId })); } catch (e) { res.status(500).send(e.message); }
});

app.post('/api/recipes', resolveTenant, async (req, res) => {
    try {
        const data = req.body;
        data.botId = req.tenant.botId;
        await Recipe.findOneAndUpdate({ id: data.id, botId: req.tenant.botId }, data, { upsert: true });
        res.json({ success: true });
    } catch (e) { res.status(500).send(e.message); }
});

app.post('/api/share-recipe', resolveTenant, async (req, res) => {
    try {
        const { recipeId, targetChatId, photoUrl } = req.body;
        const recipe = await Recipe.findOne({ id: recipeId, botId: req.tenant.botId });
        const bot = botInstances.get(req.tenant.token);
        if (bot && recipe) {
            const caption = `📖 <b>${recipe.title}</b>\n\n` +
                          `📦 Категория: ${recipe.category}\n` +
                          `⚖️ Выход: ${recipe.outputWeight || '-'}\n\n` +
                          `🛒 Ингредиенты:\n` + 
                          recipe.ingredients.map(i => `• ${i.name}: ${i.amount} ${i.unit}`).join('\n');
            if (photoUrl) await bot.sendPhoto(targetChatId, photoUrl, { caption, parse_mode: 'HTML' });
            else await bot.sendMessage(targetChatId, caption, { parse_mode: 'HTML' });
            res.json({ success: true });
        } else res.status(404).send("Bot or Recipe not found");
    } catch (e) { res.status(500).send(e.message); }
});

app.post('/api/sync-user', resolveTenant, async (req, res) => {
    try {
        const user = await User.findOneAndUpdate(
            { id: req.body.id, botId: req.tenant.botId },
            { ...req.body, botId: req.tenant.botId, lastSeen: Date.now() },
            { upsert: true, new: true }
        );
        res.json({ success: true, user });
    } catch (e) { res.status(500).send(e.message); }
});

app.get('/api/wastage', resolveTenant, async (req, res) => {
    try { res.json(await Wastage.find({ botId: req.tenant.botId }).sort({ date: -1 })); } catch (e) { res.status(500).send(e.message); }
});

app.post('/api/wastage', resolveTenant, async (req, res) => {
    try {
        const log = req.body;
        log.botId = req.tenant.botId;
        await Wastage.create(log);
        res.json({ success: true });
    } catch (e) { res.status(500).send(e.message); }
});

// НОВЫЙ МАРШРУТ УДАЛЕНИЯ СПИСАНИЯ
app.delete('/api/wastage/:id', resolveTenant, async (req, res) => {
    try {
        const { id } = req.params;
        const result = await Wastage.deleteOne({ id: id, botId: req.tenant.botId });
        if (result.deletedCount > 0) {
            res.json({ success: true });
        } else {
            res.status(404).json({ error: "Act not found" });
        }
    } catch (e) { res.status(500).send(e.message); }
});

app.post('/webhook/:token', async (req, res) => {
    const { token } = req.params;
    const bot = botInstances.get(token);
    if (bot) bot.processUpdate(req.body);
    res.sendStatus(200);
});

app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server on port ${PORT}`));
