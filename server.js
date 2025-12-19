
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

// Master Database for Inventory Items
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
            initializeDefaultBot();
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
            const appUrl = `${WEBHOOK_URL}/?bot_id=${config.botId}`;
            await bot.sendMessage(chatId, `👋 <b>Добро пожаловать в ChefDeck!</b>\n\nВаша кулинарная база знаний готова к работе.`, {
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: [[{ text: "📱 Открыть приложение", web_app: { url: appUrl } }]] }
            });
        } catch (e) { console.error(e); }
    });
};

const getBotInstance = (token) => {
    if (botInstances.has(token)) return botInstances.get(token);
    try {
        const bot = new TelegramBot(token, { polling: !WEBHOOK_URL });
        if (WEBHOOK_URL) bot.setWebHook(`${WEBHOOK_URL}/webhook/${token}`);
        setupBotListeners(bot, token);
        botInstances.set(token, bot);
        return bot;
    } catch (e) { return null; }
};

const initializeDefaultBot = async () => {
    const bots = await BotConfig.find({});
    bots.forEach(b => getBotInstance(b.token));
};

const resolveTenant = async (req, res, next) => {
    let botId = req.headers['x-bot-id'] || req.query.bot_id || 'default';
    try {
        const config = await BotConfig.findOne({ botId });
        if (!config) return res.status(404).json({ error: "Bot not found" });
        req.tenant = { botId: config.botId, token: config.token };
        req.botInstance = getBotInstance(config.token);
        next();
    } catch (e) { res.status(500).send("Server Error"); }
};

app.use(express.json({ limit: '50mb' }));
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, x-bot-id");
    res.header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

// --- SETTINGS API ---
app.get('/api/settings', resolveTenant, async (req, res) => {
    try {
        let settings = await AppSettingsModel.findOne({ botId: req.tenant.botId });
        if (!settings) {
            settings = await AppSettingsModel.create({ botId: req.tenant.botId });
        }
        res.json(settings);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/settings', resolveTenant, async (req, res) => {
    try {
        const data = req.body;
        const { _id, __v, botId, ...cleanData } = data;
        await AppSettingsModel.findOneAndUpdate({ botId: req.tenant.botId }, cleanData, { upsert: true });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- INVENTORY API ---
app.get('/api/inventory', resolveTenant, async (req, res) => {
    try {
        // --- 3 MONTH TTL CLEANUP ---
        const threeMonthsAgo = Date.now() - (90 * 24 * 60 * 60 * 1000);
        await InventoryCycle.deleteMany({ botId: req.tenant.botId, date: { $lt: threeMonthsAgo } });

        const cycles = await InventoryCycle.find({ botId: req.tenant.botId }).sort({ date: -1 });
        res.json(cycles);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/inventory/cycle', resolveTenant, async (req, res) => {
    try {
        const cycle = req.body;
        cycle.botId = req.tenant.botId;
        await InventoryCycle.findOneAndUpdate({ id: cycle.id, botId: req.tenant.botId }, cycle, { upsert: true });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Master Summary API
app.get('/api/inventory/global-items', resolveTenant, async (req, res) => {
    try {
        const items = await GlobalInventoryItem.find({ botId: req.tenant.botId }).sort({ name: 1 });
        res.json(items);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/inventory/global-items/upsert', resolveTenant, async (req, res) => {
    try {
        const { items } = req.body;
        if (!Array.isArray(items)) return res.status(400).send("Invalid items array");
        
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

app.post('/api/inventory/lock', resolveTenant, async (req, res) => {
    const { cycleId, sheetId, user } = req.body;
    try {
        const cycle = await InventoryCycle.findOne({ id: cycleId, botId: req.tenant.botId });
        if (!cycle) return res.status(404).json({ error: "Cycle not found" });
        const sheet = cycle.sheets.find(s => s.id === sheetId);
        if (sheet.lockedBy && sheet.lockedBy.id !== user.id) return res.json({ success: false, lockedBy: sheet.lockedBy });
        cycle.sheets = cycle.sheets.map(s => {
            if (s.lockedBy && s.lockedBy.id === user.id) delete s.lockedBy;
            if (s.id === sheetId) s.lockedBy = { id: user.id, name: user.name };
            return s;
        });
        await InventoryCycle.updateOne({ id: cycleId, botId: req.tenant.botId }, { sheets: cycle.sheets });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/inventory/unlock', resolveTenant, async (req, res) => {
    const { cycleId, sheetId } = req.body;
    try {
        const cycle = await InventoryCycle.findOne({ id: cycleId, botId: req.tenant.botId });
        if (!cycle) return res.sendStatus(404);
        cycle.sheets = cycle.sheets.map(s => { if (s.id === sheetId) delete s.lockedBy; return s; });
        await InventoryCycle.updateOne({ id: cycleId, botId: req.tenant.botId }, { sheets: cycle.sheets });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- USERS & ADMIN API ---
app.get('/api/users', resolveTenant, async (req, res) => {
    try {
        const users = await User.find({ botId: req.tenant.botId }).sort({ lastSeen: -1 });
        res.json(users);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/users/toggle-admin', resolveTenant, async (req, res) => {
    const { targetId, status } = req.body;
    try {
        await User.updateOne({ id: targetId, botId: req.tenant.botId }, { isAdmin: status });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/admin/register-bot', async (req, res) => {
    try {
        const { botId, token, name, ownerId } = req.body;
        const existing = await BotConfig.findOne({ botId });
        if (existing) return res.status(400).json({ error: "Этот ID уже занят" });
        
        const newBot = new BotConfig({ botId, token, name, ownerId });
        await newBot.save();
        getBotInstance(token); 
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- RECIPES API ---
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

// --- OTHER API ---
app.get('/api/proxy', async (req, res) => {
    try {
        const url = req.query.url;
        const response = await fetch(url);
        const text = await response.text();
        res.send(text);
    } catch (e) { res.status(500).send(e.message); }
});

app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));

app.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));
