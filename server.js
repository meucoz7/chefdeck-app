
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
const MONGODB_URI = process.env.MONGODB_URI;
const WEBHOOK_URL = process.env.WEBHOOK_URL; // Base URL (e.g., https://my-app.onrender.com)

// --- MONGODB SCHEMAS ---

// 1. Bot Configuration (The Tenant)
const botConfigSchema = new mongoose.Schema({
    botId: { type: String, required: true, unique: true }, // slug, e.g. "burger_king_bot"
    token: { type: String, required: true },
    name: String,
    ownerId: Number, // Telegram ID of the person who pays/owns this instance
    createdAt: { type: Number, default: Date.now }
});

// 2. Data Models (Scoped by botId)
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
    id: { type: Number }, // Telegram User ID
    first_name: String,
    last_name: String,
    username: String,
    lastSeen: Number,
    isAdmin: { type: Boolean, default: false }
});

// Compound index to ensure a user is unique per bot, but can exist in multiple bots
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

const BotConfig = mongoose.model('BotConfig', botConfigSchema);
const Recipe = mongoose.model('Recipe', recipeSchema);
const User = mongoose.model('User', userSchema);
const Schedule = mongoose.model('Schedule', scheduleSchema);
const Wastage = mongoose.model('Wastage', wastageSchema);

// --- DB CONNECTION & INDEX CLEANUP ---
let isConnected = false;

const fixDatabaseIndexes = async () => {
    try {
        const userCollection = mongoose.connection.collection('users');
        // Check current indexes
        const indexes = await userCollection.indexes();
        
        // Look for the conflicting index "id_1" which enforces unique ID across ALL bots
        const conflictingIndex = indexes.find(idx => idx.name === 'id_1');
        
        if (conflictingIndex) {
            console.log("🔥 Found conflicting legacy index 'id_1'. Dropping it to enable multi-tenancy...");
            await userCollection.dropIndex('id_1');
            console.log("✅ Successfully dropped 'id_1'. Multi-bot users are now supported.");
        }
    } catch (e) {
        // Ignore errors (e.g. collection doesn't exist yet, or index not found)
        console.log("ℹ️ Index check passed or skipped.");
    }
};

if (MONGODB_URI) {
    mongoose.connect(MONGODB_URI)
        .then(async () => {
            console.log("✅ Connected to MongoDB");
            isConnected = true;
            
            // Run index fix
            await fixDatabaseIndexes();
            
            initializeDefaultBot();
        })
        .catch(err => console.error("❌ MongoDB Connection Error:", err));
} else {
    console.error("❌ FATAL: MONGODB_URI is required for multi-tenancy.");
    process.exit(1);
}

// --- BOT INSTANCE MANAGER ---
// We keep active bot instances in memory to send notifications
const botInstances = new Map(); // token -> TelegramBot instance

// Helper to attach event listeners to a bot instance
const setupBotListeners = (bot, token) => {
    // Handle /start command
    bot.onText(/\/start/, async (msg) => {
        const chatId = msg.chat.id;
        const tgUser = msg.from;

        console.log(`📩 Received /start from ${tgUser?.first_name} (ID: ${tgUser?.id}) via token ...${token.slice(-5)}`);

        try {
            // Find bot config to get the correct botId for the URL and DB scope
            const config = await BotConfig.findOne({ token });
            
            if (!config) {
                console.error(`❌ Bot config not found in DB for token ending in ...${token.slice(-5)}`);
                await bot.sendMessage(chatId, "⚠️ Ошибка: Бот не настроен в базе данных. Пожалуйста, зарегистрируйте его через админ-панель.");
                return;
            }

            // --- SAVE USER TO DB IMMEDIATELY ---
            if (tgUser) {
                console.log(`👤 Saving user ${tgUser.first_name} for bot scope: '${config.botId}'`);
                const updateRes = await User.findOneAndUpdate(
                    { id: tgUser.id, botId: config.botId },
                    { 
                        botId: config.botId,
                        id: tgUser.id,
                        first_name: tgUser.first_name,
                        last_name: tgUser.last_name,
                        username: tgUser.username,
                        lastSeen: Date.now()
                    },
                    { upsert: true, new: true }
                );
                console.log(`✅ User saved/updated: ${updateRes.id} in ${config.botId}`);
            }
            // -----------------------------------

            const appUrl = `${WEBHOOK_URL}/?bot_id=${config.botId}`;
            const botName = config.name || 'ChefDeck';
            
            await bot.sendMessage(chatId, `👋 <b>Добро пожаловать в ${botName}!</b>\n\nЭто ваша система управления техкартами и чек-листами.`, {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "📱 Открыть приложение", web_app: { url: appUrl } }]
                    ]
                }
            });
        } catch (e) {
            console.error("❌ Critical Error in /start handler:", e);
            bot.sendMessage(chatId, "Произошла внутренняя ошибка сервера.").catch(() => {});
        }
    });
};

const getBotInstance = (token) => {
    if (!token) return null;
    if (botInstances.has(token)) return botInstances.get(token);

    try {
        console.log(`🤖 Initializing bot instance for token ...${token.slice(-5)}`);
        // Only polling if NO webhook url is defined (local dev), otherwise Webhook
        const options = WEBHOOK_URL ? { polling: false } : { polling: true };
        const bot = new TelegramBot(token, options);
        
        // Setup Webhook if production
        if (WEBHOOK_URL) {
            const hookPath = `${WEBHOOK_URL}/webhook/${token}`;
            bot.setWebHook(hookPath)
                .then(() => console.log(`🔗 Webhook set: ${hookPath}`))
                .catch(e => console.error(`❌ Webhook set failed for ${token.slice(0, 10)}...`, e.message));
        } else {
             console.log("🔄 Started Polling Mode (Local Dev)");
        }

        // Initialize Listeners
        setupBotListeners(bot, token);

        botInstances.set(token, bot);
        return bot;
    } catch (e) {
        console.error("❌ Failed to init bot:", e);
        return null;
    }
};

// Seed the first bot from .env if DB is empty
const initializeDefaultBot = async () => {
    const defaultToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!defaultToken) {
        console.warn("⚠️ TELEGRAM_BOT_TOKEN not provided in .env");
    }

    try {
        const count = await BotConfig.countDocuments();
        if (count === 0 && defaultToken) {
            console.log("⚙️ Initializing default bot from .env...");
            await BotConfig.create({
                botId: 'default',
                token: defaultToken,
                name: 'Default Bot'
            });
            console.log("✅ Default bot created in DB. ID: 'default'");
        }
        
        // Load ALL bots from DB into memory
        const bots = await BotConfig.find({});
        bots.forEach(b => getBotInstance(b.token));
        console.log(`🔄 Active Bots Loaded: ${bots.length}`);

    } catch (e) {
        console.error("❌ Initialization failed", e);
    }
};

// --- MIDDLEWARE: TENANT RESOLVER ---
// Determines which bot is being accessed based on 'x-bot-id' header
const resolveTenant = async (req, res, next) => {
    if (!isConnected) return res.status(503).json({ error: "Database not connected" });

    // 1. Try header (sent by frontend)
    let botId = req.headers['x-bot-id'];

    // 2. Fallback: If query param exists (for initial loading)
    if (!botId && req.query.bot_id) botId = req.query.bot_id;

    // 3. Fallback: 'default' if nothing specified (backward compatibility)
    if (!botId || botId === 'undefined' || botId === 'null') botId = 'default';

    try {
        let config = await BotConfig.findOne({ botId });
        
        // SMART FALLBACK: If 'default' is requested but not found, use the first available bot
        if (!config && botId === 'default') {
            const firstBot = await BotConfig.findOne().sort({ createdAt: 1 });
            if (firstBot) {
                console.log(`⚠️ Bot 'default' not found. Falling back to '${firstBot.botId}'`);
                config = firstBot;
            }
        }

        if (!config) {
            console.warn(`⚠️ Tenant resolution failed. Bot ID '${botId}' not found.`);
            return res.status(404).json({ error: `Bot '${botId}' not found. Please register it via /admin/register-bot` });
        }
        
        // Attach context to request
        req.tenant = {
            botId: config.botId,
            token: config.token,
            config: config
        };
        req.botInstance = getBotInstance(config.token);
        
        next();
    } catch (e) {
        console.error("Tenant resolution error:", e);
        res.status(500).json({ error: "Internal Server Error" });
    }
};

app.use(express.json({ limit: '50mb' }));

// CORS
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, x-bot-id");
    res.header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

app.use(express.static(path.join(__dirname, 'dist')));

// --- SYSTEM API (For You/Admin) ---
app.post('/admin/register-bot', async (req, res) => {
    const { botId, token, name, ownerId } = req.body;
    
    if (!botId || !token) return res.status(400).json({ error: "botId and token required" });

    try {
        const existing = await BotConfig.findOne({ $or: [{ botId }, { token }] });
        if (existing) return res.status(400).json({ error: "Bot ID or Token already registered" });

        const newBot = await BotConfig.create({ botId, token, name, ownerId });
        
        // Initialize webhook immediately
        getBotInstance(token);

        res.json({ success: true, bot: newBot });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- PROXY ENDPOINT FOR SCRAPING ---
app.get('/api/proxy', resolveTenant, async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).json({ error: "URL is required" });

    try {
        console.log(`🌐 Proxying request to: ${targetUrl}`);
        const response = await fetch(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7'
            }
        });
        
        if (!response.ok) {
            return res.status(response.status).send(`Failed to fetch remote URL: ${response.statusText}`);
        }

        const html = await response.text();
        res.send(html);
    } catch (e) {
        console.error("Proxy error:", e.message);
        res.status(500).send(`Proxy Error: ${e.message}`);
    }
});

// --- CLIENT API (Scoped by Tenant) ---

// 1. Recipes
app.get('/api/recipes', resolveTenant, async (req, res) => {
    try {
        const recipes = await Recipe.find({ botId: req.tenant.botId });
        res.json(recipes);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/recipes', resolveTenant, async (req, res) => {
    const recipeData = req.body;
    recipeData.botId = req.tenant.botId; // Force scope

    try {
        await Recipe.findOneAndUpdate(
            { id: recipeData.id, botId: req.tenant.botId },
            recipeData,
            { upsert: true, new: true }
        );
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/recipes/bulk', resolveTenant, async (req, res) => {
    const recipes = req.body;
    if (!Array.isArray(recipes)) return res.status(400).json({ error: "Expected array" });

    try {
        const operations = recipes.map(r => ({
            updateOne: {
                filter: { id: r.id, botId: req.tenant.botId },
                update: { $set: { ...r, botId: req.tenant.botId } },
                upsert: true
            }
        }));
        if (operations.length > 0) await Recipe.bulkWrite(operations);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/recipes/archive/batch', resolveTenant, async (req, res) => {
    const { ids } = req.body;
    try {
        await Recipe.updateMany(
            { id: { $in: ids }, botId: req.tenant.botId },
            { $set: { isArchived: true } }
        );
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/recipes/:id', resolveTenant, async (req, res) => {
    try {
        await Recipe.findOneAndDelete({ id: req.params.id, botId: req.tenant.botId });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/recipes/archive/all', resolveTenant, async (req, res) => {
    try {
        await Recipe.deleteMany({ isArchived: true, botId: req.tenant.botId });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 2. Users
app.post('/api/sync-user', resolveTenant, async (req, res) => {
    const userData = req.body;
    if (!userData.id) return res.status(400).json({ error: 'Invalid user' });

    try {
        const user = await User.findOneAndUpdate(
            { id: userData.id, botId: req.tenant.botId },
            { ...userData, botId: req.tenant.botId, lastSeen: Date.now() },
            { upsert: true, new: true }
        );
        res.json({ success: true, user });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/users', resolveTenant, async (req, res) => {
    try {
        console.log(`👥 [API] Fetching users for bot scope: '${req.tenant.botId}'`);
        const users = await User.find({ botId: req.tenant.botId }).sort({ lastSeen: -1 });
        res.json(users);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/users/toggle-admin', resolveTenant, async (req, res) => {
    const { targetId, status } = req.body;
    try {
        await User.findOneAndUpdate(
            { id: targetId, botId: req.tenant.botId }, 
            { isAdmin: status }
        );
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 3. Notifications & Sharing
app.post('/api/notify', resolveTenant, async (req, res) => {
    const bot = req.botInstance;
    if (!bot) return res.json({ success: false, error: 'Bot instance not found' });

    const { recipeTitle, action, recipeId, targetChatId, notifyAll, changes, silent } = req.body;
    if (silent) return res.json({ success: true, skipped: true });

    let recipients = [];
    if (notifyAll) {
        const users = await User.find({ botId: req.tenant.botId });
        recipients = users.map(u => u.id);
    } else if (targetChatId) {
        recipients = [targetChatId];
    }

    const appUrl = `${WEBHOOK_URL}/?bot_id=${req.tenant.botId}#/recipe/${recipeId}`;
    const escape = (s) => (s||"").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const safeTitle = escape(recipeTitle || "Без названия");
    
    let message = '';
    if (action === 'create') message = `🍳 <b>Новая техкарта</b>\n\n"${safeTitle}" добавлена в базу.`;
    else if (action === 'update') {
        message = `📝 <b>Изменения в техкарте</b>\n"${safeTitle}"`;
        if (changes?.length > 0) message += `\n\n🔻 <b>Что изменилось:</b>\n` + changes.map(c => `• ${c}`).join('\n');
        else message += `\n\nВнесены правки.`;
    } else if (action === 'delete') message = `🗑 <b>Техкарта удалена</b>\n\n"${safeTitle}" была удалена.`;

    const options = { 
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: [[{ text: "📱 Открыть карту", web_app: { url: appUrl } }]] }
    };
    if (action === 'delete') delete options.reply_markup;

    recipients = [...new Set(recipients)].filter(id => id);
    recipients.forEach(chatId => bot.sendMessage(chatId, message, options).catch(() => {}));
    
    res.json({ success: true, count: recipients.length });
});

app.post('/api/share-recipe', resolveTenant, async (req, res) => {
    const bot = req.botInstance;
    if (!bot) return res.status(503).json({ error: 'Bot not ready' });
    
    const { recipeId, targetChatId } = req.body;
    try {
        const recipe = await Recipe.findOne({ id: recipeId, botId: req.tenant.botId });
        if (!recipe) return res.status(404).json({ error: 'Not found' });

        const escape = (s) => (s||"").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        
        let caption = `👨‍🍳 <b>${escape(recipe.title).toUpperCase()}</b>`;
        if (recipe.category) caption += `\n📂 Категория: ${escape(recipe.category)}`;
        if (recipe.outputWeight) caption += `\n⚖️ Выход: ${escape(recipe.outputWeight)}`;
        caption += `\n\n📝 <b>Ингредиенты:</b>\n` + recipe.ingredients.map(ing => `▫️ ${escape(ing.name)}: <b>${escape(ing.amount)} ${escape(ing.unit)}</b>`).join('\n');
        
        const appUrl = `${WEBHOOK_URL}/?bot_id=${req.tenant.botId}#/recipe/${recipeId}`;
        const options = {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: [[{ text: "📱 Открыть в приложении", web_app: { url: appUrl } }]] }
        };

        if (recipe.imageUrl?.startsWith('data:image')) {
            const buffer = Buffer.from(recipe.imageUrl.split(',')[1], 'base64');
            if (caption.length > 1000) caption = caption.substring(0, 990) + "...";
            await bot.sendPhoto(targetChatId, buffer, { caption, ...options });
        } else {
            await bot.sendMessage(targetChatId, caption, options);
        }
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 4. Schedule
app.get('/api/schedule', resolveTenant, async (req, res) => {
    try {
        const doc = await Schedule.findOne({ botId: req.tenant.botId });
        res.json(doc ? doc.staff : []);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/schedule', resolveTenant, async (req, res) => {
    try {
        await Schedule.findOneAndUpdate(
            { botId: req.tenant.botId },
            { staff: req.body },
            { upsert: true }
        );
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/schedule/share', resolveTenant, async (req, res) => {
    const bot = req.botInstance;
    if (!bot) return res.status(503).json({ error: 'Bot not ready' });
    
    const { image, userId } = req.body;
    try {
        const buffer = Buffer.from(image.replace(/^data:image\/\w+;base64,/, ""), 'base64');
        await bot.sendPhoto(userId, buffer, { 
            caption: `📅 <b>Актуальный график смен</b>`, 
            parse_mode: 'HTML'
        });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 5. Wastage
app.get('/api/wastage', resolveTenant, async (req, res) => {
    try {
        const logs = await Wastage.find({ botId: req.tenant.botId }).sort({ date: -1 });
        res.json(logs);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/wastage', resolveTenant, async (req, res) => {
    const logData = req.body;
    logData.botId = req.tenant.botId;
    try {
        await Wastage.findOneAndUpdate(
            { id: logData.id, botId: req.tenant.botId },
            logData,
            { upsert: true, new: true }
        );
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/wastage/:id', resolveTenant, async (req, res) => {
    try {
        await Wastage.findOneAndDelete({ id: req.params.id, botId: req.tenant.botId });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- DYNAMIC WEBHOOK HANDLER ---
app.post('/webhook/:token', (req, res) => {
    const token = req.params.token;
    const bot = botInstances.get(token);
    
    if (bot) {
        bot.processUpdate(req.body);
    } else {
        BotConfig.findOne({ token }).then(config => {
            if (config) {
                const newBot = getBotInstance(token);
                if (newBot) newBot.processUpdate(req.body);
            }
        });
    }
    res.sendStatus(200);
});

// Serve Frontend
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));

app.listen(PORT, () => {
    console.log(`🚀 Multi-tenant Server running on port ${PORT}`);
});
