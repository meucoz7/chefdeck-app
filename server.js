
import 'dotenv/config';
import express from 'express';
import TelegramBot from 'node-telegram-bot-api';
import path from 'path';
import fs from 'fs';
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;
const WEBHOOK_URL = process.env.WEBHOOK_URL;

// Внутренние константы для хранилища
const UPLOAD_API_URL = 'https://pro.filma4.ru/api';
const UPLOAD_API_KEY = '3f154923d8d6324c7a38dcd83159789f82a4ea9224335df225a375a6cb3d6415';
const folderCache = new Map();

// --- GLOBAL ERROR HANDLING ---
process.on('unhandledRejection', (reason, promise) => {
    console.error('[Runtime] Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
    console.error('[Runtime] Uncaught Exception thrown:', err);
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
globalInventoryItemSchema.index({ botId: 1, code: 1, name: 1 }, { unique: true });

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

// --- DB CONNECTION ---
if (MONGODB_URI) {
    mongoose.connect(MONGODB_URI)
        .then(() => {
            console.log("✅ Connected to MongoDB");
            initializeAllBots();
        })
        .catch(err => console.error("❌ MongoDB Connection Error:", err));
}

// --- BOT INSTANCE MANAGER ---
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
            const appUrl = `${WEBHOOK_URL || 'https://chefdeck.ru'}/?bot_id=${config.botId}`;
            await bot.sendMessage(chatId, `👋 <b>Добро пожаловать в ChefDeck!</b>\n\nВаша кулинарная база знаний готова к работе.`, {
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: [[{ text: "📱 Открыть приложение", web_app: { url: appUrl } }]] }
            });
        } catch (e) { console.error(`[Bot] Error:`, e.message); }
    });
};

const getBotInstance = async (token) => {
    if (botInstances.has(token)) return botInstances.get(token);
    try {
        const usePolling = !WEBHOOK_URL;
        const bot = new TelegramBot(token, { polling: usePolling });
        if (WEBHOOK_URL) {
            const hookUrl = `${WEBHOOK_URL}/webhook/${token}`;
            await bot.setWebHook(hookUrl).catch(e => console.error(`[Bot] Hook failed:`, e.message));
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
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    } catch (e) {}
};

app.use(express.json({ limit: '10mb' }));

// --- UPLOAD HELPER ---
const getServerFolderId = async (name) => {
    const key = name.toLowerCase().trim();
    if (folderCache.has(key)) return folderCache.get(key);
    try {
        const res = await fetch(`${UPLOAD_API_URL}/folders`, { 
            headers: { 'X-API-Key': UPLOAD_API_KEY, 'Accept': 'application/json' } 
        });
        
        if (!res.ok) return null;
        
        const result = await res.json();
        if (result.success && Array.isArray(result.data)) {
            const f = result.data.find(folder => folder.name.toLowerCase() === key);
            if (f) { folderCache.set(key, f.id); return f.id; }
        }
        
        const createRes = await fetch(`${UPLOAD_API_URL}/folders`, {
            method: 'POST',
            headers: { 'X-API-Key': UPLOAD_API_KEY, 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({ name: key })
        });
        const createResult = await createRes.json();
        if (createResult.success) { folderCache.set(key, createResult.data.id); return createResult.data.id; }
    } catch (e) { console.error('[ServerUpload] Folder logic skip:', e.message); }
    return null;
};

// --- TELEGRAM WEBHOOK ---
app.post('/webhook/:token', async (req, res) => {
    const { token } = req.params;
    const bot = botInstances.get(token);
    if (bot) bot.processUpdate(req.body);
    res.sendStatus(200);
});

// CORS
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, x-bot-id");
    res.header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

const resolveTenant = async (req, res, next) => {
    let botId = req.headers['x-bot-id'] || req.query.bot_id || 'default';
    try {
        const config = await BotConfig.findOne({ botId });
        if (!config) return res.status(404).json({ error: "Bot not found" });
        req.tenant = { botId: config.botId, token: config.token };
        next();
    } catch (e) { res.status(500).send("Tenant resolution error"); }
};

// --- CORRECTED UPLOAD PROXY ROUTE ---
app.post('/api/upload', resolveTenant, async (req, res) => {
    try {
        const folderName = req.query.folder || 'general';
        const folderId = await getServerFolderId(folderName);
        
        const targetUrl = new URL(`${UPLOAD_API_URL}/upload`);
        if (folderId) targetUrl.searchParams.set('folder_id', folderId);

        console.log('[ServerUpload] Proxying to:', targetUrl.toString());

        // ВАЖНО: Node.js fetch требует duplex: 'half' при передаче потока (req) в body
        const uploadRes = await fetch(targetUrl.toString(), {
            method: 'POST',
            headers: {
                'X-API-Key': UPLOAD_API_KEY,
                'Accept': 'application/json',
                'Content-Type': req.headers['content-type']
            },
            body: req,
            duplex: 'half' 
        });

        const result = await uploadRes.json().catch(e => ({ success: false, message: 'Invalid JSON from upstream' }));
        res.status(uploadRes.status).json(result);
    } catch (e) {
        console.error('[ServerUpload] Proxy Error:', e.message);
        res.status(500).json({ success: false, message: e.message || 'Server Upload Proxy Error' });
    }
});

// --- OTHER API ROUTES ---
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

app.get('/api/inventory', resolveTenant, async (req, res) => {
    try { res.json(await InventoryCycle.find({ botId: req.tenant.botId }).sort({ date: -1 })); } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/inventory/cycle', resolveTenant, async (req, res) => {
    try {
        const cycle = req.body;
        cycle.botId = req.tenant.botId;
        await InventoryCycle.findOneAndUpdate({ id: cycle.id, botId: req.tenant.botId }, cycle, { upsert: true });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/inventory/cycle/:id', resolveTenant, async (req, res) => {
    try { await InventoryCycle.deleteOne({ id: req.params.id, botId: req.tenant.botId }); res.json({ success: true }); } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/inventory/global-items', resolveTenant, async (req, res) => {
    try { res.json(await GlobalInventoryItem.find({ botId: req.tenant.botId }).sort({ name: 1 })); } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/inventory/global-items/upsert', resolveTenant, async (req, res) => {
    try {
        const { items } = req.body;
        for (const item of items) {
            await GlobalInventoryItem.findOneAndUpdate(
                { botId: req.tenant.botId, code: item.code, name: item.name },
                { ...item, botId: req.tenant.botId },
                { upsert: true }
            );
        }
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/users', resolveTenant, async (req, res) => {
    try { res.json(await User.find({ botId: req.tenant.botId }).sort({ lastSeen: -1 })); } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/users/toggle-admin', resolveTenant, async (req, res) => {
    try {
        await User.updateOne({ id: req.body.targetId, botId: req.tenant.botId }, { isAdmin: req.body.status });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/admin/register-bot', async (req, res) => {
    try {
        const { botId, token, name, ownerId } = req.body;
        const existing = await BotConfig.findOne({ botId });
        if (existing) return res.status(400).json({ error: "ID занят" });
        const newBot = new BotConfig({ botId, token, name, ownerId });
        await newBot.save();
        await getBotInstance(token); 
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

app.get('/api/schedule', resolveTenant, async (req, res) => {
    try {
        const s = await Schedule.findOne({ botId: req.tenant.botId });
        res.json(s ? s.staff : []);
    } catch (e) { res.status(500).send(e.message); }
});

app.post('/api/schedule', resolveTenant, async (req, res) => {
    try {
        await Schedule.findOneAndUpdate({ botId: req.tenant.botId }, { staff: req.body }, { upsert: true });
        res.json({ success: true });
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

app.get('/api/proxy', async (req, res) => {
    try {
        const url = req.query.url;
        const response = await fetch(url);
        const text = await response.text();
        res.send(text);
    } catch (e) { res.status(500).send("Proxy Error"); }
});

// Static
app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));

app.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));
