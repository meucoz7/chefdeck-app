
import 'dotenv/config';
import express from 'express';
import TelegramBot from 'node-telegram-bot-api';
import path from 'path';
import fs from 'fs';
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';
import * as XLSX from 'xlsx';

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

const settingsSchema = new mongoose.Schema({
    botId: { type: String, required: true, unique: true },
    showSchedule: { type: Boolean, default: true },
    showWastage: { type: Boolean, default: true },
    showInventory: { type: Boolean, default: true },
    showArchive: { type: Boolean, default: true }
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

// Inventory Models
const invStationSchema = new mongoose.Schema({
    botId: { type: String, required: true, index: true },
    id: String,
    name: String,
    items: Array
});

const invReportSchema = new mongoose.Schema({
    botId: { type: String, required: true, index: true },
    id: String,
    date: { type: Number, default: Date.now },
    stations: Array,
    createdBy: String
});

const BotConfig = mongoose.model('BotConfig', botConfigSchema);
const Settings = mongoose.model('Settings', settingsSchema);
const Recipe = mongoose.model('Recipe', recipeSchema);
const User = mongoose.model('User', userSchema);
const Schedule = mongoose.model('Schedule', scheduleSchema);
const InvStation = mongoose.model('InvStation', invStationSchema);
const InvReport = mongoose.model('InvReport', invReportSchema);

let isConnected = false;
mongoose.connect(MONGODB_URI).then(() => { isConnected = true; console.log("✅ MongoDB Connected"); });

const botInstances = new Map();
const setupBotListeners = (bot, token) => {
    bot.onText(/\/start/, async (msg) => {
        const chatId = msg.chat.id;
        const config = await BotConfig.findOne({ token });
        if (!config) return;
        const appUrl = `${WEBHOOK_URL}/?bot_id=${config.botId}`;
        await bot.sendMessage(chatId, `👋 <b>Добро пожаловать!</b>`, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: [[{ text: "📱 Открыть кухню", web_app: { url: appUrl } }]] }
        });
    });
};

const getBotInstance = (token) => {
    if (botInstances.has(token)) return botInstances.get(token);
    const bot = new TelegramBot(token, { polling: !WEBHOOK_URL });
    if (WEBHOOK_URL) bot.setWebHook(`${WEBHOOK_URL}/webhook/${token}`);
    setupBotListeners(bot, token);
    botInstances.set(token, bot);
    return bot;
};

const resolveTenant = async (req, res, next) => {
    let botId = req.headers['x-bot-id'] || req.query.bot_id || 'default';
    const config = await BotConfig.findOne({ botId });
    if (!config) return res.status(404).json({ error: "Bot not found" });
    req.tenant = { botId: config.botId, token: config.token };
    req.botInstance = getBotInstance(config.token);
    next();
};

app.use(express.json({ limit: '50mb' }));
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, x-bot-id");
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

// --- SETTINGS API ---
app.get('/api/settings', resolveTenant, async (req, res) => {
    const s = await Settings.findOne({ botId: req.tenant.botId });
    res.json(s || {});
});
app.post('/api/settings', resolveTenant, async (req, res) => {
    await Settings.findOneAndUpdate({ botId: req.tenant.botId }, req.body, { upsert: true });
    res.json({ success: true });
});

// --- INVENTORY API ---
app.get('/api/inventory/stations', resolveTenant, async (req, res) => {
    const stations = await InvStation.find({ botId: req.tenant.botId });
    res.json(stations);
});

app.post('/api/inventory/setup', resolveTenant, async (req, res) => {
    const stations = req.body;
    await InvStation.deleteMany({ botId: req.tenant.botId });
    const docs = stations.map(s => ({ ...s, botId: req.tenant.botId }));
    await InvStation.insertMany(docs);
    res.json({ success: true });
});

app.post('/api/inventory/submit', resolveTenant, async (req, res) => {
    const { stationId, items, createdBy } = req.body;
    const report = await InvReport.create({
        botId: req.tenant.botId,
        id: uuidv4(),
        stations: [{ id: stationId, items }],
        createdBy
    });
    res.json({ success: true, report });
});

app.get('/api/inventory/history', resolveTenant, async (req, res) => {
    const reports = await InvReport.find({ botId: req.tenant.botId }).sort({ date: -1 }).limit(50);
    res.json(reports);
});

app.get('/api/inventory/export', resolveTenant, async (req, res) => {
    const reports = await InvReport.find({ botId: req.tenant.botId }).sort({ date: -1 }).limit(10);
    const wb = XLSX.utils.book_new();
    reports.forEach(r => {
        const data = [];
        r.stations.forEach(s => {
            s.items.forEach(i => {
                data.push({ "Цех": s.id, "Продукт": i.name, "Ед.изм": i.unit, "Остаток": i.amount });
            });
        });
        const ws = XLSX.utils.json_to_sheet(data);
        XLSX.utils.book_append_sheet(wb, ws, new Date(r.date).toLocaleDateString().replace(/\//g, '-'));
    });
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
});

app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));

app.listen(PORT, () => console.log(`🚀 Server on ${PORT}`));
function uuidv4() { return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c == 'x' ? r : (r & 0x3 | 0x8)).toString(16); }); }
