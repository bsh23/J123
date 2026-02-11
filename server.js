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
const DOMAIN = 'https://whatsapp.johntechvendorsltd.co.ke';
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
let lastDailyRunDate = null; // To track daily execution

let serverConfig = {
  accessToken: process.env.FB_ACCESS_TOKEN || '',
  phoneNumberId: process.env.FB_PHONE_NUMBER_ID || '',
  verifyToken: process.env.FB_VERIFY_TOKEN || 'johntech_verify_token'
};

// --- PERSISTENCE ---
async function loadAll() {
    try { productInventory = JSON.parse(await readFile(DATA_FILE, 'utf8')); } catch (e) {}
    try { chatSessions = JSON.parse(await readFile(CHATS_FILE, 'utf8')); } catch (e) {}
    try { leadsData = JSON.parse(await readFile(LEADS_FILE, 'utf8')); } catch (e) {}
    try { knowledgeBase = JSON.parse(await readFile(KB_FILE, 'utf8')); } catch (e) {}
    try { retryQueue = JSON.parse(await readFile(QUEUE_FILE, 'utf8')); } catch (e) {}
    try { 
        const saved = JSON.parse(await readFile(CONFIG_FILE, 'utf8')); 
        serverConfig = { ...serverConfig, ...saved };
    } catch (e) {}
}

async function saveChats() { await writeFile(CHATS_FILE, JSON.stringify(chatSessions, null, 2)); }
async function saveLeads() { await writeFile(LEADS_FILE, JSON.stringify(leadsData, null, 2)); }
async function saveKB() { await writeFile(KB_FILE, JSON.stringify(knowledgeBase, null, 2)); }
async function saveQueue() { await writeFile(QUEUE_FILE, JSON.stringify(retryQueue, null, 2)); }
async function saveInventory() { await writeFile(DATA_FILE, JSON.stringify(productInventory, null, 2)); }
async function saveServerConfig() { await writeFile(CONFIG_FILE, JSON.stringify(serverConfig, null, 2)); }

// --- AI SETUP ---
const getApiKey = () => process.env.API_KEY;
const MODEL_NAME = 'gemini-3-flash-preview';

// --- SELF-LEARNING ENGINE ---
async function performSelfLearning() {
    console.log("🧠 Learning Engine: Scanning Admin responses from today...");
    const apiKey = getApiKey();
    if (!apiKey) return;

    const yesterday = new Date();
    yesterday.setHours(yesterday.getHours() - 24);

    const relevantChats = Object.values(chatSessions).filter(c => {
        const lastMsgTime = new Date(c.lastMessageTime);
        const hasAdminReply = c.messages.some(m => m.sender === 'bot' && m.id && m.id.startsWith('admin_')); 
        return lastMsgTime > yesterday && hasAdminReply;
    });

    if (relevantChats.length === 0) {
        console.log("🧠 Learning Engine: No admin interactions to learn from today.");
        return;
    }

    const learningPrompt = `
    You are the Brain of JohnTech Vendors. Look at these conversations where a HUMAN ADMIN (expert) took over from the bot.
    The admin's word is final. Your task is to extract NEW FACTS that aren't in your catalog.
    
    CONVERSATIONS:
    ${relevantChats.map(c => c.messages.slice(-20).map(m => `[${m.sender === 'user' ? 'CLIENT' : (m.id && m.id.startsWith('admin_') ? 'ADMIN' : 'BOT')}]: ${m.text}`).join('\n')).join('\n---Next Chat---\n')}
    
    TASK:
    Identify specific new info the Admin mentioned: custom prices, new shop rules, fabrication times, or technical answers.
    Return strictly a JSON array of strings (short facts).
    Example: ["100L Milk ATMs now come with a digital meter.", "Delivery to Nakuru is now KSh 2000."]
    Return [] if nothing new.
    `;

    try {
        const ai = new GoogleGenAI({ apiKey });
        const res = await ai.models.generateContent({ model: MODEL_NAME, contents: learningPrompt, config: { responseMimeType: "application/json" } });
        const newFacts = JSON.parse(res.text);
        
        if (Array.isArray(newFacts) && newFacts.length > 0) {
            knowledgeBase = [...new Set([...knowledgeBase, ...newFacts])].slice(-100); 
            await saveKB();
            console.log(`✅ Learned ${newFacts.length} new facts.`);
        }
    } catch (err) { console.error("Learning Error:", err.message); }
}

// --- CATEGORIZED LEAD ANALYSIS ---
async function performLeadAnalysis(force = false) {
    const apiKey = getApiKey();
    if (!apiKey) return null;

    const chatsToAnalyze = Object.values(chatSessions).filter(c => {
        if (c.messages.length <= 2) return false;
        if (force) return true;
        const lastMsg = new Date(c.lastMessageTime).getTime();
        const lastScan = c.lastAnalyzedTime ? new Date(c.lastAnalyzedTime).getTime() : 0;
        return lastMsg > lastScan;
    });

    if (chatsToAnalyze.length === 0) {
        leadsData.lastUpdated = new Date().toISOString();
        await saveLeads();
        return leadsData;
    }

    const analysisPrompt = `
      Analyze these JohnTech Vendors WhatsApp chats.
      
      CHATS:
      ${chatsToAnalyze.slice(0, 20).map(c => `Phone: ${c.id}\nHistory: ${c.messages.slice(-10).map(m=>m.text).join(' | ')}`).join('\n---\n')}

      TASK:
      1. Categorize each user by product: "Milk ATM", "Oil ATM", "Water Vending", "RO", "Pasteurizer", or "General".
      2. Set "isSerious: true" ONLY if they asked for payment details, a site visit, or explicit delivery terms.

      OUTPUT FORMAT:
      Return strictly a JSON object:
      {
        "categories": {
           "Milk ATM": [{ "phone": "...", "name": "...", "reason": "...", "isSerious": true }],
           "General": [...]
        }
      }
    `;

    try {
        const ai = new GoogleGenAI({ apiKey });
        const res = await ai.models.generateContent({ model: MODEL_NAME, contents: analysisPrompt, config: { responseMimeType: "application/json" } });
        const result = JSON.parse(res.text);

        const newCats = result.categories || {};
        const currentCats = leadsData.categories || {};

        for (const catName in newCats) {
            if (!currentCats[catName]) currentCats[catName] = [];
            newCats[catName].forEach(newLead => {
                const idx = currentCats[catName].findIndex(l => l.phone === newLead.phone);
                if (idx !== -1) currentCats[catName][idx] = newLead;
                else currentCats[catName].push(newLead);
            });
        }

        leadsData = { categories: currentCats, lastUpdated: new Date().toISOString() };
        const nowStr = new Date().toISOString();
        chatsToAnalyze.forEach(c => { if(chatSessions[c.id]) chatSessions[c.id].lastAnalyzedTime = nowStr; });

        await saveLeads();
        await saveChats();
        return leadsData;
    } catch (err) { console.error("Analysis Error:", err); return null; }
}

// --- SYSTEM PROMPT ---
const getSystemInstruction = (products) => {
  const productCatalogStr = products.map(p => `[${p.category}] ${p.name}: KSh ${p.priceRange.min}-${p.priceRange.max}`).join('\n');
  const learnedKnowledge = knowledgeBase.map(f => `- ${f}`).join('\n');

  return `You are "John", a human sales expert at JohnTech Vendors Ltd. 
  
  *** HUMAN BEHAVIOR RULES ***
  1. **BREVITY:** Responses MUST be under 20 words. No info-dumping.
  2. **ONE STEP AT A TIME:** Only ask one question per reply. Mimic a real chat.
  3. **CONSULTATIVE:** If they ask for "Water Machine", ask for their water source (Borehole vs Kanjo) BEFORE giving price.
  4. **MIRRORING:** Reply in the same language style as the user (Sheng, Swahili, or English).
  5. **ESCALATION:** When a user is ready to pay, call 'escalateToAdmin'. Say something like: "Let me check the exact stock on that for you real quick, just a second..."
  
  *** THINGS YOU LEARNED FROM ADMIN RECENTLY ***
  ${learnedKnowledge || "Follow standard catalog procedures."}

  *** CATALOG ***
  ${productCatalogStr}`;
};

// --- ROUTES ---
app.post('/api/analyze-leads', async (req, res) => {
  const result = await performLeadAnalysis(req.body.force || false);
  res.json(result || leadsData);
});

app.post('/api/send-message', async (req, res) => {
    const { to, text } = req.body;
    try {
        const sessionId = to;
        const msgId = `admin_${Date.now()}`;
        
        if (chatSessions[sessionId]) {
            chatSessions[sessionId].messages.push({ 
                id: msgId, 
                sender: 'bot', 
                text, 
                timestamp: new Date() 
            });
            chatSessions[sessionId].lastMessage = text;
            chatSessions[sessionId].lastMessageTime = new Date();
            chatSessions[sessionId].unreadCount = 0;
            await saveChats();
        }

        await axios.post(`https://graph.facebook.com/v17.0/${serverConfig.phoneNumberId}/messages`, 
            { messaging_product: 'whatsapp', to, type: 'text', text: { body: text } }, 
            { headers: { Authorization: `Bearer ${serverConfig.accessToken}` } }
        );
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

app.get('/api/chats', (req, res) => {
    const chats = Object.values(chatSessions).sort((a, b) => new Date(b.lastMessageTime) - new Date(a.lastMessageTime));
    res.json(chats);
});

// --- WEBHOOK LOGIC ---
app.post('/webhook', async (req, res) => {
  res.sendStatus(200);
  try {
    const body = req.body;
    if (!body.entry?.[0]?.changes?.[0]?.value?.messages) return;
    const msg = body.entry[0].changes[0].value.messages[0];
    const sender = msg.from;
    const apiKey = getApiKey();

    if (!chatSessions[sender]) chatSessions[sender] = { id: sender, contactName: msg.contacts?.[0]?.profile?.name || sender, messages: [], lastMessage: '', lastMessageTime: new Date(), botActive: true };
    const incoming = { id: msg.id, sender: 'user', timestamp: new Date(), type: 'text', text: msg.text?.body || 'Attachment' };
    chatSessions[sender].messages.push(incoming);
    chatSessions[sender].lastMessage = incoming.text;
    chatSessions[sender].lastMessageTime = new Date();
    await saveChats();

    if (!chatSessions[sender].botActive || !apiKey) return;

    const ai = new GoogleGenAI({ apiKey });
    const history = chatSessions[sender].messages.slice(-15).map(m => ({
        role: m.sender === 'user' ? 'user' : 'model',
        parts: [{ text: m.text }]
    }));

    const chat = ai.chats.create({
        model: MODEL_NAME,
        config: {
            systemInstruction: getSystemInstruction(productInventory),
            tools: [{ functionDeclarations: [
                { name: 'displayProduct', parameters: { type: Type.OBJECT, properties: { productId: { type: Type.STRING } } } },
                { name: 'escalateToAdmin', parameters: { type: Type.OBJECT, properties: { reason: { type: Type.STRING } } } }
            ] }],
            temperature: 0.6
        },
        history: history.slice(0, -1)
    });

    const result = await chat.sendMessage({ message: { parts: [{ text: incoming.text }] } });
    const content = result.candidates[0].content;
    let textRes = content.parts.find(p => p.text)?.text || "";
    const fCalls = content.parts.filter(p => p.functionCall);

    let images = [];
    let isLocking = false;

    if (fCalls.length > 0) {
        for (const fc of fCalls) {
            if (fc.name === 'displayProduct') {
                const prod = productInventory.find(p => p.id === fc.args.productId);
                if (prod?.images) images = prod.images.slice(0, 3);
            }
            if (fc.name === 'escalateToAdmin') {
                isLocking = true;
                textRes = "Let me check the exact stock and details on that for you real quick, one moment...";
            }
        }
    }

    if (images.length > 0) {
        for (const img of images) {
            await axios.post(`https://graph.facebook.com/v17.0/${serverConfig.phoneNumberId}/messages`, 
                { messaging_product: 'whatsapp', to: sender, type: 'image', image: { link: img } }, 
                { headers: { Authorization: `Bearer ${serverConfig.accessToken}` } }
            );
        }
    }

    if (textRes) {
        await axios.post(`https://graph.facebook.com/v17.0/${serverConfig.phoneNumberId}/messages`, 
            { messaging_product: 'whatsapp', to: sender, type: 'text', text: { body: textRes.replace(/\*/g, '') } }, 
            { headers: { Authorization: `Bearer ${serverConfig.accessToken}` } }
        );
        chatSessions[sender].messages.push({ sender: 'bot', text: textRes, timestamp: new Date() });
        await saveChats();
    }

    if (isLocking) {
        chatSessions[sender].botActive = false;
        chatSessions[sender].isEscalated = true;
        await saveChats();
    }
  } catch (err) { console.error("Webhook Error:", err); }
});

// --- MIDNIGHT SCHEDULER ---
setInterval(async () => {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    
    // Check if it's 00:00 and we haven't run today
    if (now.getHours() === 0 && lastDailyRunDate !== dateStr) {
        lastDailyRunDate = dateStr;
        console.log(`🕛 Midnight Maintenance Started for ${dateStr}...`);
        await performSelfLearning();
        await performLeadAnalysis(false);
    }
}, 60000); 

loadAll().then(() => {
    app.listen(PORT, '0.0.0.0', () => console.log(`🚀 JohnTech Bot Online on ${PORT}`));
});