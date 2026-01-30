
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
const tenantConfigCache = new Map(); // Кэш для настроек ботов

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
    imageUrls: { small: String, medium: String, original: String },
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
const Wastage = mongoose.model('Wastage', wastageSchema);
const InventoryCycle = mongoose.model('InventoryCycle', inventoryCycleSchema);
const AppSettingsModel = mongoose.model('AppSettings', settingsSchema);

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
            let config = tenantConfigCache.get(token);
            if (!config) config = await BotConfig.findOne({ token });
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
            tenantConfigCache.set(b.botId, b);
            await getBotInstance(b.token);
        }
        console.log(`✅ Preloaded ${bots.length} bot configs`);
    } catch (e) {}
};

const resolveTenant = async (req, res, next) => {
    const botId = req.headers['x-bot-id'] || req.query.bot_id || 'default';
    try {
        let config = tenantConfigCache.get(botId);
        if (!config) {
            config = await BotConfig.findOne({ botId });
            if (config) tenantConfigCache.set(botId, config);
        }
        
        if (!config && botId === 'default') {
            config = { botId: 'default', token: process.env.TELEGRAM_BOT_TOKEN || 'placeholder', name: 'Default Bot' };
        }
        if (!config) return res.status(404).json({ error: "Bot not found" });
        req.tenant = { botId: config.botId, token: config.token };
        next();
    } catch (e) { res.status(500).send("Tenant resolution error"); }
};

// --- CONSOLIDATED INIT ENDPOINT ---
app.post('/api/init-app', resolveTenant, async (req, res) => {
    try {
        const botId = req.tenant.botId;
        const userData = req.body;

        // 1. Sync User
        const user = await User.findOneAndUpdate(
            { id: userData.id, botId },
            { ...userData, botId, lastSeen: Date.now() },
            { upsert: true, new: true }
        );

        // 2. Get Settings
        let settings = await AppSettingsModel.findOne({ botId });
        if (!settings) settings = await AppSettingsModel.create({ botId });

        // 3. Get Recipes
        const recipes = await Recipe.find({ botId });

        res.json({
            success: true,
            user,
            settings,
            recipes
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- API ROUTES ---
app.get('/api/proxy', async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).send("URL parameter is missing");
    try {
        const response = await fetch(targetUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' }
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const body = await response.text();
        res.send(body);
    } catch (e) { res.status(500).send("Failed to fetch target URL"); }
});

app.post('/api/upload', resolveTenant, upload.single('image'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
        const form = new FormData();
        form.append('image', req.file.buffer, { filename: req.file.originalname || 'upload.jpg', contentType: req.file.mimetype });
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

app.get('/api/users', resolveTenant, async (req, res) => {
    try { res.json(await User.find({ botId: req.tenant.botId }).sort({ lastSeen: -1 })); } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/users/toggle-admin', resolveTenant, async (req, res) => {
    try {
        const { targetId, status } = req.body;
        await User.findOneAndUpdate({ id: targetId, botId: req.tenant.botId }, { isAdmin: status });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/admin/register-bot', async (req, res) => {
    try {
        const { botId, token, name, ownerId } = req.body;
        const existing = await BotConfig.findOne({ botId });
        if (existing) return res.status(400).json({ success: false, error: "Bot ID уже занят" });
        const newBot = await BotConfig.create({ botId, token, name, ownerId });
        tenantConfigCache.set(botId, newBot);
        await getBotInstance(token);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
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
