
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
let knowledgeBase = []; // Array of learned strings
let retryQueue = [];

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
    console.log("🧠 Learning Engine: Scanning Admin responses...");
    const apiKey = getApiKey();
    if (!apiKey) return;

    // Filter conversations from the last 24 hours that have Admin responses
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const relevantChats = Object.values(chatSessions).filter(c => {
        const lastMsgTime = new Date(c.lastMessageTime);
        const hasAdminReply = c.messages.some(m => m.sender === 'bot' && m.id.startsWith('admin_')); 
        return lastMsgTime > yesterday && hasAdminReply;
    });

    if (relevantChats.length === 0) return;

    const learningPrompt = `
    You are the Brain of JohnTech Vendors. Look at these conversations between a real HUMAN ADMIN and clients.
    The admin is the expert. Your job is to extract NEW KNOWLEDGE that isn't in your standard manual.
    
    CONVERSATIONS:
    ${relevantChats.map(c => c.messages.slice(-20).map(m => `[${m.sender}]: ${m.text}`).join('\n')).join('\n---Chat---\n')}
    
    TASK:
    Identify new facts, special prices, unique delivery rules, or fabrication details the Admin mentioned.
    Return strictly a JSON array of strings, each being a short fact. 
    Example: ["We now offer a 10% discount for cash payments on Milk ATMs over 200L.", "The new showroom is open on Sundays."]
    If nothing new found, return [].
    `;

    try {
        const ai = new GoogleGenAI({ apiKey });
        const res = await ai.models.generateContent({ model: MODEL_NAME, contents: learningPrompt, config: { responseMimeType: "application/json" } });
        const newFacts = JSON.parse(res.text);
        
        if (Array.isArray(newFacts) && newFacts.length > 0) {
            knowledgeBase = [...new Set([...knowledgeBase, ...newFacts])].slice(-100); // Keep last 100 facts
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
      Analyze these WhatsApp chats for JohnTech Vendors.
      
      CHATS:
      ${chatsToAnalyze.slice(0, 20).map(c => `Phone: ${c.id}\nHistory: ${c.messages.slice(-10).map(m=>m.text).join(' | ')}`).join('\n---\n')}

      TASK:
      1. Categorize each user by the machine they want (e.g., "Milk ATM", "RO", "Oil ATM"). If unknown, use "General".
      2. Flag as "isSerious: true" if they asked for a visit, till number, or specific delivery logistics.

      OUTPUT FORMAT:
      Return strictly a JSON object:
      {
        "categories": {
           "Milk ATM": [{ "phone": "...", "name": "...", "reason": "...", "isSerious": true }],
           "RO": [...]
        }
      }
    `;

    try {
        const ai = new GoogleGenAI({ apiKey });
        const res = await ai.models.generateContent({ model: MODEL_NAME, contents: analysisPrompt, config: { responseMimeType: "application/json" } });
        const result = JSON.parse(res.text);

        // Merge logic
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
  const productCatalogStr = products.map(p => `[${p.category}] ${p.name}: Max Price KSh ${p.priceRange.max}`).join('\n');
  const learnedKnowledge = knowledgeBase.map(f => `- ${f}`).join('\n');

  return `You are "John", a human sales agent for JohnTech Vendors. 
  
  *** HUMAN CONVERSATION RULES (STRICT) ***
  1. **BREVITY:** Keep every message under 25 words. 
  2. **STEP-BY-STEP:** Don't answer everything at once. Ask one follow-up question.
     - Example: If asked for Milk ATM, say "Yes we have them. What size are you thinking of? (e.g 100L, 200L)" 
     - WAIT for the answer before giving price.
  3. **MIRRORING:** If user says "Sasa", say "Sasa, nikuform aje?" 
  4. **ESCALATION:** If a user is 100% ready to buy or asks for a "Till Number", use 'escalateToAdmin'.
  
  *** LEARNED KNOWLEDGE (Admin Updates) ***
  ${learnedKnowledge || "None yet."}

  *** CATALOG ***
  ${productCatalogStr}`;
};

// --- ROUTES ---
app.post('/api/analyze-leads', async (req, res) => {
  const result = await performLeadAnalysis(req.body.force || false);
  res.json(result || leadsData);
});

// Other routes (Admin Send, Settings, CRUD) remain the same logic...

// --- WEBHOOK LOGIC ---
app.post('/webhook', async (req, res) => {
  res.sendStatus(200);
  try {
    const body = req.body;
    if (!body.entry?.[0]?.changes?.[0]?.value?.messages) return;
    const msg = body.entry[0].changes[0].value.messages[0];
    const sender = msg.from;
    const apiKey = getApiKey();

    // 1. Log & Store User Message
    if (!chatSessions[sender]) chatSessions[sender] = { id: sender, contactName: msg.contacts?.[0]?.profile?.name || sender, messages: [], lastMessage: '', lastMessageTime: new Date(), botActive: true };
    const incoming = { id: msg.id, sender: 'user', timestamp: new Date(), type: 'text', text: msg.text?.body || 'Attachment' };
    chatSessions[sender].messages.push(incoming);
    chatSessions[sender].lastMessage = incoming.text;
    chatSessions[sender].lastMessageTime = new Date();
    await saveChats();

    if (!chatSessions[sender].botActive || !apiKey) return;

    // 2. Prepare AI
    const ai = new GoogleGenAI({ apiKey });
    const history = chatSessions[sender].messages.slice(-20).map(m => ({
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

    // 3. Generate Response
    const result = await chat.sendMessage({ message: { parts: [{ text: incoming.text }] } });
    const content = result.candidates[0].content;
    const textRes = content.parts.find(p => p.text)?.text;
    const fCalls = content.parts.filter(p => p.functionCall);

    let finalMsg = textRes;
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
                // OVERRIDE textRes for human transition
                finalMsg = "Let me check the exact stock and best discount for you on that real quick, just a second...";
            }
        }
    }

    // 4. Send Responses
    if (images.length > 0) {
        for (const img of images) await sendWhatsApp(sender, { type: 'image', image: { link: `${DOMAIN}/api/render-image/...` } });
    }
    if (finalMsg) {
        await sendWhatsApp(sender, { type: 'text', text: { body: finalMsg.replace(/\*/g, '') } });
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
    if (now.getHours() === 0) {
        console.log("🕛 Midnight Maintenance Started...");
        await performSelfLearning();
        await performLeadAnalysis(false);
    }
}, 3600000);

// Initialize
loadAll().then(() => {
    app.listen(PORT, '0.0.0.0', () => console.log(`🚀 JohnTech Bot Online on ${PORT}`));
});

// (Simplified helper for example)
async function sendWhatsApp(to, payload) {
    try {
        await axios.post(`https://graph.facebook.com/v17.0/${serverConfig.phoneNumberId}/messages`, 
            { messaging_product: 'whatsapp', to, ...payload }, 
            { headers: { Authorization: `Bearer ${serverConfig.accessToken}` } }
        );
        // Also update local state
        const sess = chatSessions[to];
        if (sess) {
            sess.messages.push({ sender: 'bot', text: payload.text?.body || 'Image', timestamp: new Date() });
            sess.lastMessageTime = new Date();
        }
    } catch (e) { console.error("WhatsApp Send Error:", e.response?.data); }
}
