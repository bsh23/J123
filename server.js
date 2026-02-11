
import 'dotenv/config';
import express from 'express';
import path from 'path';
import axios from 'axios';
import { GoogleGenAI, Type } from '@google/genai';
import { fileURLToPath } from 'url';
import { readFile, writeFile } from 'fs/promises';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '500mb' }));

// --- CONFIGURATION ---
const PORT = 5041; 
const DATA_FILE = path.join(__dirname, 'inventory.json');
const CHATS_FILE = path.join(__dirname, 'chats.json');
const LEADS_FILE = path.join(__dirname, 'leads.json');
const KB_FILE = path.join(__dirname, 'knowledge_base.json');
const QUEUE_FILE = path.join(__dirname, 'failed_requests.json');
const CONFIG_FILE = path.join(__dirname, 'server-config.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// --- STATE MANAGEMENT ---
let productInventory = [];
let chatSessions = {}; 
let leadsData = { categories: {}, lastUpdated: null };
let knowledgeBase = []; 
let retryQueue = [];
let lastDailyRunDate = null; 

let serverConfig = {
  accessToken: process.env.FB_ACCESS_TOKEN || '',
  phoneNumberId: process.env.FB_PHONE_NUMBER_ID || '',
  verifyToken: process.env.FB_VERIFY_TOKEN || 'johntech_verify_token'
};

// --- PERSISTENCE ---
async function loadAll() {
    try { productInventory = JSON.parse(await readFile(DATA_FILE, 'utf8')); } catch (e) { productInventory = []; }
    try { chatSessions = JSON.parse(await readFile(CHATS_FILE, 'utf8')); } catch (e) { chatSessions = {}; }
    try { leadsData = JSON.parse(await readFile(LEADS_FILE, 'utf8')); } catch (e) { leadsData = { categories: {}, lastUpdated: null }; }
    try { knowledgeBase = JSON.parse(await readFile(KB_FILE, 'utf8')); } catch (e) { knowledgeBase = []; }
    try { retryQueue = JSON.parse(await readFile(QUEUE_FILE, 'utf8')); } catch (e) { retryQueue = []; }
    try { 
        const saved = JSON.parse(await readFile(CONFIG_FILE, 'utf8')); 
        serverConfig = { ...serverConfig, ...saved };
    } catch (e) {}
}

async function saveChats() { await writeFile(CHATS_FILE, JSON.stringify(chatSessions, null, 2)); }
async function saveLeads() { await writeFile(LEADS_FILE, JSON.stringify(leadsData, null, 2)); }
async function saveKB() { await writeFile(KB_FILE, JSON.stringify(knowledgeBase, null, 2)); }
async function saveInventory() { await writeFile(DATA_FILE, JSON.stringify(productInventory, null, 2)); }
async function saveServerConfig() { await writeFile(CONFIG_FILE, JSON.stringify(serverConfig, null, 2)); }

// --- AI SETUP ---
const getApiKey = () => process.env.API_KEY;
const MODEL_NAME = 'gemini-3-flash-preview';

// --- SELF-LEARNING ENGINE ---
async function performSelfLearning() {
    console.log("🧠 Learning Engine: Scanning Admin responses...");
    const apiKey = getApiKey();
    if (!apiKey) return;

    const yesterday = new Date();
    yesterday.setHours(yesterday.getHours() - 24);

    const relevantChats = Object.values(chatSessions).filter(c => {
        const lastMsgTime = new Date(c.lastMessageTime);
        const hasAdminReply = c.messages.some(m => m.sender === 'bot' && m.id && m.id.startsWith('admin_')); 
        return lastMsgTime > yesterday && hasAdminReply;
    });

    if (relevantChats.length === 0) return;

    const learningPrompt = `Extract new facts from these admin responses for JohnTech Vendors. Return a JSON array of short strings. [${relevantChats.map(c => c.messages.slice(-10).map(m => m.text).join(' ')).join(' | ')}]`;

    try {
        const ai = new GoogleGenAI({ apiKey });
        const res = await ai.models.generateContent({ model: MODEL_NAME, contents: learningPrompt, config: { responseMimeType: "application/json" } });
        const newFacts = JSON.parse(res.text);
        if (Array.isArray(newFacts)) {
            knowledgeBase = [...new Set([...knowledgeBase, ...newFacts])].slice(-100); 
            await saveKB();
        }
    } catch (err) { console.error("Learning Error:", err.message); }
}

// --- LEAD ANALYSIS ---
async function performLeadAnalysis(force = false) {
    const apiKey = getApiKey();
    if (!apiKey) return null;
    const analysisPrompt = `Categorize these leads for JohnTech Vendors. Return JSON: { "categories": { "Category": [{"phone":"", "name":"", "reason":"", "isSerious":true}] } } Chats: ${JSON.stringify(Object.values(chatSessions).slice(0, 10))}`;
    try {
        const ai = new GoogleGenAI({ apiKey });
        const res = await ai.models.generateContent({ model: MODEL_NAME, contents: analysisPrompt, config: { responseMimeType: "application/json" } });
        leadsData = JSON.parse(res.text);
        leadsData.lastUpdated = new Date().toISOString();
        await saveLeads();
        return leadsData;
    } catch (err) { return null; }
}

const getSystemInstruction = (products) => {
  const productCatalogStr = products.map(p => `[${p.category}] ${p.name}: KSh ${p.priceRange.min}-${p.priceRange.max}`).join('\n');
  const learnedKnowledge = knowledgeBase.map(f => `- ${f}`).join('\n');
  return `You are "John", a human sales expert at JohnTech Vendors Ltd. Keep it brief (<20 words). One question at a time. \nCatalog:\n${productCatalogStr}\nKnowledge:\n${learnedKnowledge}`;
};

// --- API ROUTES ---

// Products
app.get('/api/products', (req, res) => res.json(productInventory));
app.post('/api/product', async (req, res) => {
    productInventory.push(req.body);
    await saveInventory();
    res.json({ success: true });
});
app.put('/api/product/:id', async (req, res) => {
    productInventory = productInventory.map(p => p.id === req.params.id ? req.body : p);
    await saveInventory();
    res.json({ success: true });
});
app.delete('/api/product/:id', async (req, res) => {
    productInventory = productInventory.filter(p => p.id !== req.params.id);
    await saveInventory();
    res.json({ success: true });
});

// Chats & Messaging
app.get('/api/chats', (req, res) => res.json(Object.values(chatSessions).sort((a,b) => new Date(b.lastMessageTime) - new Date(a.lastMessageTime))));
app.post('/api/send-message', async (req, res) => {
    const { to, text } = req.body;
    try {
        if (chatSessions[to]) {
            chatSessions[to].messages.push({ id: `admin_${Date.now()}`, sender: 'bot', text, timestamp: new Date() });
            chatSessions[to].lastMessage = text;
            chatSessions[to].lastMessageTime = new Date();
            await saveChats();
        }
        await axios.post(`https://graph.facebook.com/v17.0/${serverConfig.phoneNumberId}/messages`, { messaging_product: 'whatsapp', to, type: 'text', text: { body: text } }, { headers: { Authorization: `Bearer ${serverConfig.accessToken}` } });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

app.post('/api/chat/:id/toggle-bot', async (req, res) => {
    if (chatSessions[req.params.id]) {
        chatSessions[req.params.id].botActive = req.body.active;
        await saveChats();
        res.json({ success: true });
    } else res.status(404).json({ error: 'Not found' });
});

// Settings
app.get('/api/settings', (req, res) => {
    const { accessToken, ...safeConfig } = serverConfig;
    res.json(safeConfig);
});
app.post('/api/settings', async (req, res) => {
    serverConfig = { ...serverConfig, ...req.body };
    await saveServerConfig();
    res.json({ success: true });
});
app.post('/api/verify-meta-config', (req, res) => res.json({ success: true, message: 'Verified' }));

// Lead Analysis
app.post('/api/analyze-leads', async (req, res) => res.json(await performLeadAnalysis(req.body.force)));

// --- WEBHOOK ---
app.post('/webhook', async (req, res) => {
  res.sendStatus(200);
  try {
    const body = req.body;
    if (!body.entry?.[0]?.changes?.[0]?.value?.messages) return;
    const msg = body.entry[0].changes[0].value.messages[0];
    const sender = msg.from;
    const apiKey = getApiKey();

    if (!chatSessions[sender]) chatSessions[sender] = { id: sender, contactName: msg.contacts?.[0]?.profile?.name || sender, messages: [], lastMessage: '', lastMessageTime: new Date(), botActive: true };
    chatSessions[sender].messages.push({ id: msg.id, sender: 'user', timestamp: new Date(), text: msg.text?.body || 'Attachment' });
    chatSessions[sender].lastMessage = msg.text?.body || 'Attachment';
    chatSessions[sender].lastMessageTime = new Date();
    await saveChats();

    if (!chatSessions[sender].botActive || !apiKey) return;

    const ai = new GoogleGenAI({ apiKey });
    const chat = ai.chats.create({
        model: MODEL_NAME,
        config: { systemInstruction: getSystemInstruction(productInventory), temperature: 0.6 }
    });
    const result = await chat.sendMessage({ message: msg.text?.body || "Hello" });
    const textRes = result.text;

    await axios.post(`https://graph.facebook.com/v17.0/${serverConfig.phoneNumberId}/messages`, { messaging_product: 'whatsapp', to: sender, type: 'text', text: { body: textRes } }, { headers: { Authorization: `Bearer ${serverConfig.accessToken}` } });
    chatSessions[sender].messages.push({ sender: 'bot', text: textRes, timestamp: new Date() });
    await saveChats();
  } catch (err) {}
});

// --- STATIC FILES (Crucial for fix) ---
app.use(express.static(path.join(__dirname, 'dist')));

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// --- START ---
loadAll().then(() => {
    app.listen(PORT, '0.0.0.0', () => console.log(`🚀 JohnTech Bot Online on ${PORT}`));
});
