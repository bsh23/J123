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
// INCREASED LIMIT TO 500MB TO HANDLE LARGE INVENTORY FILES
app.use(express.json({ limit: '500mb' }));

// --- CONFIGURATION ---
const PORT = 5041; 
const DOMAIN = 'https://whatsapp.johntechvendorsltd.co.ke';
const DATA_FILE = path.join(__dirname, 'inventory.json');
const CHATS_FILE = path.join(__dirname, 'chats.json');
const LEADS_FILE = path.join(__dirname, 'leads.json');
const QUEUE_FILE = path.join(__dirname, 'failed_requests.json');
const CONFIG_FILE = path.join(__dirname, 'server-config.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// --- STATE MANAGEMENT ---
let productInventory = [];
let chatSessions = {}; 
let leadsData = { serious: [], stalled: [], visiting: [], followUp: [], lastUpdated: null };
let retryQueue = [];

// Fallback credentials
let serverConfig = {
  accessToken: process.env.FB_ACCESS_TOKEN || '',
  phoneNumberId: process.env.FB_PHONE_NUMBER_ID || '',
  verifyToken: process.env.FB_VERIFY_TOKEN || 'johntech_verify_token',
  appId: process.env.FB_APP_ID || '',
  appSecret: process.env.FB_APP_SECRET || ''
};

// --- LOGGING ---
app.use((req, res, next) => {
  if (!req.url.includes('/render-image') && !req.url.includes('/api/chats')) {
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  }
  next();
});

// --- PERSISTENCE ---
async function loadInventory() {
  try {
    const data = await readFile(DATA_FILE, 'utf8');
    productInventory = JSON.parse(data);
    console.log(`📦 INVENTORY: Loaded ${productInventory.length} items.`);
  } catch (err) {
    productInventory = [];
  }
}

async function loadChats() {
  try {
    const data = await readFile(CHATS_FILE, 'utf8');
    chatSessions = JSON.parse(data);
    console.log(`💬 CHATS: Loaded history for ${Object.keys(chatSessions).length} contacts.`);
  } catch (err) {
    chatSessions = {};
  }
}

async function loadLeads() {
  try {
    const data = await readFile(LEADS_FILE, 'utf8');
    leadsData = JSON.parse(data);
    console.log(`✨ LEADS: Loaded cached analysis.`);
  } catch (err) {
    leadsData = { serious: [], stalled: [], visiting: [], followUp: [], lastUpdated: null };
  }
}

async function loadQueue() {
    try {
        const data = await readFile(QUEUE_FILE, 'utf8');
        retryQueue = JSON.parse(data);
        if (retryQueue.length > 0) console.log(`⚠️  RECOVERY: Loaded ${retryQueue.length} pending messages from previous session.`);
    } catch (err) {
        retryQueue = [];
    }
}

async function saveChats() {
  try { await writeFile(CHATS_FILE, JSON.stringify(chatSessions, null, 2)); } catch (err) { console.error('❌ CHAT SAVE ERROR:', err.message); }
}

async function saveInventory() {
  try { await writeFile(DATA_FILE, JSON.stringify(productInventory, null, 2)); } catch (err) { console.error('❌ INVENTORY SAVE ERROR:', err.message); }
}

async function saveLeads() {
  try { await writeFile(LEADS_FILE, JSON.stringify(leadsData, null, 2)); } catch (err) { console.error('❌ LEADS SAVE ERROR:', err.message); }
}

async function saveQueue() {
    try { await writeFile(QUEUE_FILE, JSON.stringify(retryQueue, null, 2)); } catch (err) { console.error('❌ QUEUE SAVE ERROR:', err.message); }
}

async function loadServerConfig() {
  try {
    const data = await readFile(CONFIG_FILE, 'utf8');
    const savedConfig = JSON.parse(data);
    serverConfig = { ...serverConfig, ...savedConfig };
    console.log(`⚙️  CONFIG: Loaded.`);
  } catch (err) {
    console.log('⚙️  CONFIG: Using defaults.');
  }
}

async function saveServerConfig() {
  try { await writeFile(CONFIG_FILE, JSON.stringify(serverConfig, null, 2)); } catch (err) { console.error('❌ CONFIG SAVE ERROR:', err.message); }
}

// --- GEMINI SETUP ---
const getApiKey = () => process.env.API_KEY; 
const MODEL_NAME = 'gemini-3-flash-preview';

// --- HELPER: RETRY LOGIC ---
async function sendMessageWithRetry(chat, parts) {
    const maxRetries = 2; // Reduced retries to fail faster and move to queue
    let lastError;

    for (let i = 0; i < maxRetries; i++) {
        try {
            return await chat.sendMessage({ message: { parts } });
        } catch (err) {
            lastError = err;
            const status = err.response?.status || err.status || (err.response?.data?.error?.code);
            const msg = err.message || JSON.stringify(err.response?.data);

            // Retry on 503 (Service Unavailable) or 429 (Too Many Requests) or "overloaded"
            if (status === 503 || status === 429 || msg.includes('overloaded')) {
                const delay = 2000 * (i + 1); 
                console.warn(`⚠️ Gemini Model Overloaded. Retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                throw err; 
            }
        }
    }
    throw lastError;
}

// --- BACKGROUND WORKER: RECOVERY QUEUE ---
// Runs every 60 seconds to check for messages that failed during downtime
setInterval(async () => {
    if (retryQueue.length === 0) return;

    console.log(`🔄 QUEUE: Attempting to process ${retryQueue.length} pending items...`);
    const apiKey = getApiKey();
    if (!apiKey) return;

    // Process one by one to avoid rate limits
    const currentBatch = [...retryQueue]; 
    // Clear queue locally, we will re-add failures
    retryQueue = []; 
    await saveQueue();

    for (const item of currentBatch) {
        try {
            // Check if chat still exists and bot is active
            if (!chatSessions[item.to] || chatSessions[item.to].botActive === false) {
                console.log(`🗑️ Discarding queued message for ${item.to} (Chat deleted or Locked)`);
                continue;
            }

            console.log(`🔄 Retrying AI response for ${item.to}...`);
            const ai = new GoogleGenAI({ apiKey });
            
            // Re-construct history
            const historyParts = chatSessions[item.to].messages
                .filter(m => m.timestamp < item.timestamp) // Only history BEFORE this failed message
                .slice(-30)
                .map(m => ({
                    role: m.sender === 'user' ? 'user' : 'model',
                    parts: [{ text: (m.type === 'image') ? '[Image]' : (m.text || '') }]
                }));

            const chat = ai.chats.create({
                model: MODEL_NAME,
                config: {
                    systemInstruction: getSystemInstruction(productInventory),
                    tools: [{ functionDeclarations: [displayProductTool, escalateToAdminTool] }],
                    temperature: 0.7,
                },
                history: historyParts
            });

            // Send the Original Request
            const result = await sendMessageWithRetry(chat, item.parts);
            
            // --- PROCESS RESULT (Same as Webhook) ---
            const responseCandidate = result.candidates?.[0];
            const contentParts = responseCandidate?.content?.parts || [];
            
            let textResponse = contentParts.filter(part => part.text).map(part => part.text).join('');
            const functionCalls = contentParts.filter(part => part.functionCall).map(part => part.functionCall);

            let imagesToSend = [];
            let shouldSilentLock = false;

            if (functionCalls?.length > 0) {
                for (const fc of functionCalls) {
                    if (fc.name === 'displayProduct') {
                         const product = productInventory.find(p => p.id === fc.args.productId);
                         if (product?.images?.length) imagesToSend = product.images.slice(0, 5);
                    }
                    if (fc.name === 'escalateToAdmin') shouldSilentLock = true;
                }
            }

            if (shouldSilentLock) {
                chatSessions[item.to].botActive = false;
                chatSessions[item.to].isEscalated = true;
                await saveChats();
                continue;
            }

            if (imagesToSend.length > 0) {
                 for (let i = 0; i < imagesToSend.length; i++) {
                     const link = `${DOMAIN}/api/render-image/${productInventory.find(p=>p.images.includes(imagesToSend[0])).id}/${i}`;
                     await sendWhatsApp(item.to, { type: 'image', image: { link } });
                 }
            }

            if (textResponse) {
                textResponse = formatResponseText(textResponse);
                await sendWhatsApp(item.to, { type: 'text', text: { body: textResponse } });
            }
            console.log(`✅ Recovered message for ${item.to}`);

        } catch (err) {
            console.error(`❌ Retry failed for ${item.to}:`, err.message);
            // Re-add to queue if it was a network error, otherwise discard
            if (err.status === 503 || err.code === 'ETIMEDOUT' || !err.status) {
                retryQueue.push(item);
                await saveQueue();
            }
        }
    }
}, 60000); // Run every 60 seconds

// --- BACKGROUND WORKER: AUTO LEADS SCANNING ---
// Checks every hour. If it's 00:00 (midnight), runs analysis.
setInterval(async () => {
    const now = new Date();
    // Check if it's between 00:00 and 00:59
    if (now.getHours() === 0) {
        // Check if we already ran today
        const lastRun = leadsData.lastUpdated ? new Date(leadsData.lastUpdated) : new Date(0);
        
        // If last run was NOT today
        if (lastRun.getDate() !== now.getDate() || lastRun.getMonth() !== now.getMonth()) {
            console.log("🕛 MIDNIGHT TRIGGER: Running Daily Lead Analysis...");
            await performLeadAnalysis(false); // Force = false (Incremental)
        }
    }
}, 3600000); // Check every 1 hour

// --- TOOLS ---
const displayProductTool = {
  name: 'displayProduct',
  description: 'Trigger the sending of product photos. RESTRICTIONS: 1. DO NOT use when answering questions about PRICE, LOCATION, or PAYMENT. 2. ONLY use when the user explicitly asks to "see" the machine, "send photos", or "share images".',
  parameters: {
    type: Type.OBJECT,
    properties: { productId: { type: Type.STRING, description: 'ID of the specific product' } },
    required: ['productId']
  }
};

const escalateToAdminTool = {
  name: 'escalateToAdmin',
  description: 'SILENTLY lock conversation. ONLY use this when the user is 100% ready to pay (asking for Till Number, Bank details) or confirming specific delivery logistics.',
  parameters: {
    type: Type.OBJECT,
    properties: { reason: { type: Type.STRING, description: 'Reason for escalation' } },
    required: ['reason']
  }
};

const getSystemInstruction = (products) => {
  const productCatalogStr = products.length > 0 
    ? products.map(p => `
[ITEM]
ID: ${p.id}
NAME: ${p.name}
CATEGORY: ${p.category}
SPECS: ${JSON.stringify(p.specs || {})}
PRICE_RANGE: ${p.priceRange.min} - ${p.priceRange.max} KSh
DESCRIPTION: ${p.description}`).join('\n')
    : "NO ITEMS IN STOCK. We fabricate custom Vending Machines upon request.";

  return `You are "John", a friendly and consultative sales agent for "JohnTech Vendors Ltd".
  LOCATION: Thika Road, Kihunguro, Behind Shell Petrol Station.
  
  *** CRITICAL: LANGUAGE MIRRORING ***
  You MUST detect and mirror the user's language style:
  1. **Strict English:** If user speaks formal English, reply in formal English.
  2. **Swahili/Sheng Mix:** If user speaks Swahili or "Sheng" (e.g., "Kuna form?", "Bei ni ngapi?", "Niko area"), you MUST reply in a casual Kenyan Swahili/English mix. 
  3. **DO NOT** sound robotic or strictly formal if the user is casual. Build rapport.
  
  *** YOUR CORE BEHAVIOR: CONSULTATIVE SELLING ***
  
  You are NOT a catalog search engine. You are a consultant. 
  When a user says "I want a Milk ATM", DO NOT just guess a product. You must find out what size they need first.

  --- INTERACTION RULES ---

  1. **PHASE 1: QUALIFICATION (CRITICAL)**
     - **WATER PURIFICATION LOGIC (Strict Rule):**
       - If user asks for "Water Machine", "Purification", "RO", or "Treatment", you **MUST** ask: "What is the source of your water? (e.g., Municipal/Kanjo, Borehole, River, or Salty?)"
       - **IF Municipal/City Council/Kanjo:** You MUST recommend **Ultra Filtration (UF)**. Do NOT sell them Reverse Osmosis unless they insist.
       - **IF Borehole/Salty/River:** You MUST recommend **Reverse Osmosis (RO)**.
     
     - **Milk/Oil ATMs:** Ask: "What capacity (Litres) are you looking for?"
     - **DO NOT** show an image or a specific price until the user answers qualification questions.

  2. **PHASE 2: STRICT PRODUCT MATCHING**
     - Ensure the product you select for 'displayProduct' **EXACTLY** matches the user's requirements.
     - **PROHIBITED:** Do NOT send an image of a "2 Taps" machine if they asked for "1 Tap".
     
  3. **PHASE 3: PRICING STRATEGY**
     - **STANDARD QUOTE:** Always quote the **MAXIMUM** (High End) price first.
     - **NEGOTIATION:** Only reveal the **MINIMUM** price if the user says "Too expensive" or asks for a discount.
     - **DO NOT** use 'displayProduct' when answering price questions. Just give the text.

  4. **PHASE 4: ANSWERING GENERAL QUESTIONS**
     - **Location/How it works:** Answer purely with text.
     - **DO NOT** use 'displayProduct' when answering about location or operation.

  5. **PHASE 5: CLOSING**
     - Only use 'escalateToAdmin' if they are ready to pay via M-Pesa or Bank.

  --- INVENTORY DATA ---
  ${productCatalogStr}`;
};

function formatResponseText(text) {
    if (!text) return "";
    return text.replace(/\*\*/g, '').replace(/\*/g, '').replace(/##/g, '').replace(/__/g, '');
}

// --- ROUTES ---
app.get('/health', (req, res) => res.status(200).send('OK'));

// Serve uploads folder statically
app.use('/uploads', express.static(UPLOADS_DIR));

// Serve static files if they exist
const distPath = path.join(__dirname, 'dist');
if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
} else {
    console.warn("⚠️ 'dist' folder missing. Skipping static file serving.");
}

app.get('/api/products', (req, res) => res.json(productInventory || []));

// BULK UPDATE (Legacy/Sync)
app.post('/api/products', async (req, res) => {
  const { products } = req.body;
  if (Array.isArray(products)) {
    productInventory = products;
    await saveInventory();
    res.json({ status: 'success' });
  } else { res.status(400).json({ status: 'error' }); }
});

// SINGLE CREATE
app.post('/api/product', async (req, res) => {
    try {
        const product = req.body;
        if (!product || !product.id) return res.status(400).json({ error: "Invalid product data" });
        
        productInventory.push(product);
        await saveInventory();
        console.log(`✅ Product Added: ${product.name}`);
        res.json({ success: true });
    } catch (err) {
        console.error("Add Product Error:", err);
        res.status(500).json({ error: "Failed to save product" });
    }
});

// SINGLE UPDATE
app.put('/api/product/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updatedProduct = req.body;
        const index = productInventory.findIndex(p => p.id === id);
        
        if (index !== -1) {
            productInventory[index] = updatedProduct;
            await saveInventory();
            console.log(`✅ Product Updated: ${updatedProduct.name}`);
            res.json({ success: true });
        } else {
            res.status(404).json({ error: "Product not found" });
        }
    } catch (err) {
        console.error("Update Product Error:", err);
        res.status(500).json({ error: "Failed to update product" });
    }
});

// SINGLE DELETE
app.delete('/api/product/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const initialLength = productInventory.length;
        productInventory = productInventory.filter(p => p.id !== id);
        
        if (productInventory.length < initialLength) {
            await saveInventory();
            console.log(`🗑️ Product Deleted: ${id}`);
            res.json({ success: true });
        } else {
            res.status(404).json({ error: "Product not found" });
        }
    } catch (err) {
        console.error("Delete Product Error:", err);
        res.status(500).json({ error: "Failed to delete product" });
    }
});

app.get('/api/chats', (req, res) => {
    const chatsArray = Object.values(chatSessions).sort((a, b) => new Date(b.lastMessageTime) - new Date(a.lastMessageTime));
    res.json(chatsArray);
});

// --- LEAD ANALYSIS LOGIC ---
// Separated function for reuse in Cron and API
async function performLeadAnalysis(force = false) {
    const apiKey = getApiKey();
    if (!apiKey) return null;

    // 1. Filter chats: 
    //    - Must have messages > 2
    //    - If NOT forced, only analyze chats where lastMessageTime > lastAnalyzedTime
    const chatsToAnalyze = Object.values(chatSessions).filter(c => {
        if (c.messages.length <= 2) return false;
        if (force) return true;
        
        const lastMsg = new Date(c.lastMessageTime).getTime();
        const lastScan = c.lastAnalyzedTime ? new Date(c.lastAnalyzedTime).getTime() : 0;
        return lastMsg > lastScan;
    });

    // Sort to prioritize most recent active chats
    chatsToAnalyze.sort((a, b) => new Date(b.lastMessageTime) - new Date(a.lastMessageTime));
    
    // Slice to top 20 to save tokens, even in auto mode
    const activeChats = chatsToAnalyze.slice(0, 20);

    if (activeChats.length === 0) {
        console.log("Lead Analysis: No new conversations to scan.");
        // Just update timestamp
        leadsData.lastUpdated = new Date().toISOString();
        await saveLeads();
        return leadsData;
    }

    console.log(`🧠 Analyzing ${activeChats.length} conversations...`);

    const analysisPrompt = `
      You are an expert Sales Manager for JohnTech Vendors. 
      Analyze the following WhatsApp conversation summaries and categorize the customers into 4 specific lists.

      INPUT DATA (Chats):
      ${activeChats.map(c => `
        Phone: ${c.id}
        Name: ${c.contactName}
        Last Msg: "${c.lastMessage}"
        History Summary: ${c.messages.slice(-15).map(m => `[${m.sender}]: ${m.text || 'image'}`).join(' | ')}
      `).join('\n----------------\n')}

      TASKS:
      Categorize each customer based on their *latest* intent. Include the EXACT phone number provided.
      1. "serious": Ready to buy, asked for payment details, or highly interested. Needs ADMIN CALL immediately.
      2. "stalled": Interested but stopped replying after price was mentioned or is negotiating.
      3. "visiting": Explicitly said they will visit the shop/location.
      4. "followUp": General inquiries, asked about specs, awaiting reply.

      OUTPUT FORMAT:
      Return strictly a JSON object with this schema:
      {
        "serious": [{ "phone": "...", "name": "...", "reason": "..." }],
        "stalled": [{ "phone": "...", "name": "...", "reason": "..." }],
        "visiting": [{ "phone": "...", "name": "...", "reason": "..." }],
        "followUp": [{ "phone": "...", "name": "...", "reason": "..." }]
      }
    `;

    try {
        const ai = new GoogleGenAI({ apiKey });
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: analysisPrompt,
            config: {
                responseMimeType: "application/json",
                temperature: 0.2 
            },
        });

        const result = JSON.parse(response.text);
        
        // Merge with existing data (Deduplicate based on phone)
        const mergeLists = (oldList, newList) => {
            const map = new Map();
            oldList.forEach(i => map.set(i.phone, i));
            // New list overwrites old if same phone
            newList.forEach(i => map.set(i.phone, i)); 
            return Array.from(map.values());
        };

        leadsData = {
            serious: mergeLists(leadsData.serious, result.serious || []),
            stalled: mergeLists(leadsData.stalled, result.stalled || []),
            visiting: mergeLists(leadsData.visiting, result.visiting || []),
            followUp: mergeLists(leadsData.followUp, result.followUp || []),
            lastUpdated: new Date().toISOString()
        };

        // Update lastAnalyzedTime for processed chats
        const nowStr = new Date().toISOString();
        activeChats.forEach(c => {
            if (chatSessions[c.id]) {
                chatSessions[c.id].lastAnalyzedTime = nowStr;
            }
        });

        await saveLeads();
        await saveChats(); // Save the new timestamps
        return leadsData;

    } catch (err) {
        console.error("AI Analysis Failed:", err);
        return null;
    }
}

app.post('/api/analyze-leads', async (req, res) => {
  const { force } = req.body;
  
  if (!force && leadsData.lastUpdated) {
     // Check if less than 5 minutes since last update, return cache
     const diff = new Date().getTime() - new Date(leadsData.lastUpdated).getTime();
     if (diff < 300000) return res.json(leadsData);
  }

  const result = await performLeadAnalysis(force);
  if (result) {
      res.json(result);
  } else {
      res.status(500).json({ error: "Analysis failed" });
  }
});

app.delete('/api/chat/:id', async (req, res) => {
    const { id } = req.params;
    if (chatSessions[id]) {
        delete chatSessions[id];
        await saveChats();
        res.json({ success: true });
    } else {
        res.status(404).json({ error: "Chat not found" });
    }
});

app.post('/api/chat/:id/toggle-bot', async (req, res) => {
    const { id } = req.params;
    const { active } = req.body; 
    if (chatSessions[id]) {
        chatSessions[id].botActive = active;
        if (active) chatSessions[id].isEscalated = false;
        await saveChats();
        res.json({ success: true, botActive: active });
    } else { res.status(404).json({ error: "Chat not found" }); }
});

app.post('/api/send-message', async (req, res) => {
    const { to, text, image } = req.body;
    try {
        if (image) {
            // Handle Image Upload
            const matches = image.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
            if (!matches || matches.length !== 3) {
                return res.status(400).json({ error: 'Invalid image format' });
            }
            const mimeType = matches[1];
            const base64Data = matches[2];
            const buffer = Buffer.from(base64Data, 'base64');
            const ext = mimeType.split('/')[1] || 'png';
            const filename = `admin_${Date.now()}_${Math.floor(Math.random() * 1000)}.${ext}`;
            const filePath = path.join(UPLOADS_DIR, filename);

            await writeFile(filePath, buffer);

            const publicUrl = `${DOMAIN}/uploads/${filename}`;
            console.log(`📤 Sending Image: ${publicUrl}`);

            await sendWhatsApp(to, { 
                type: 'image', 
                image: { link: publicUrl, caption: text || '' } 
            }, true);
        } else {
            // Text Only
            await sendWhatsApp(to, { type: 'text', text: { body: text } }, true);
        }
        res.json({ success: true });
    } catch (err) {
        console.error("Admin Reply Error:", err);
        res.status(500).json({ error: 'Failed' });
    }
});

app.post('/api/settings', async (req, res) => {
  serverConfig = { ...serverConfig, ...req.body };
  await saveServerConfig();
  res.json({ success: true });
});

app.get('/api/settings', (req, res) => {
  res.json({
    phoneNumberId: serverConfig.phoneNumberId || '',
    businessAccountId: serverConfig.businessAccountId || '',
    appId: serverConfig.appId || '',
    verifyToken: serverConfig.verifyToken || ''
  });
});

app.post('/api/verify-meta-config', async (req, res) => {
  const { accessToken, phoneNumberId } = req.body;
  try {
    await axios.get(`https://graph.facebook.com/v17.0/${phoneNumberId}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    return res.json({ success: true });
  } catch (error) { return res.status(400).json({ success: false }); }
});

app.get('/api/render-image/:productId/:index', (req, res) => {
  const { productId, index } = req.params;
  const product = productInventory.find(p => p.id === productId);
  if (product?.images?.[index]) {
    const matches = product.images[index].match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (matches && matches.length === 3) {
      const buffer = Buffer.from(matches[2], 'base64');
      res.writeHead(200, { 'Content-Type': matches[1], 'Content-Length': buffer.length });
      res.end(buffer);
      return;
    }
  }
  res.status(404).send('Not found');
});

// --- HELPERS ---
const getAuthHeaders = () => ({ Authorization: `Bearer ${serverConfig.accessToken}` });

async function markMessageAsRead(messageId) {
    if (!serverConfig.accessToken || !serverConfig.phoneNumberId) return;
    try {
        await axios.post(
            `https://graph.facebook.com/v17.0/${serverConfig.phoneNumberId}/messages`,
            { messaging_product: 'whatsapp', status: 'read', message_id: messageId },
            { headers: getAuthHeaders() }
        );
    } catch (err) { console.error("Read Mark Error:", err.message); }
}

async function downloadMetaImage(mediaId) {
  if (!serverConfig.accessToken) return null;
  try {
    const urlRes = await axios.get(`https://graph.facebook.com/v17.0/${mediaId}`, { headers: getAuthHeaders() });
    const mediaRes = await axios.get(urlRes.data.url, { headers: getAuthHeaders(), responseType: 'arraybuffer' });
    return { 
      base64: Buffer.from(mediaRes.data).toString('base64'),
      mimeType: mediaRes.headers['content-type']
    };
  } catch (err) {
    console.error("Image DL Error:", err.message);
    return null;
  }
}

async function sendWhatsApp(to, payload, isAdmin = false) {
  if (!serverConfig.accessToken) return;
  try {
    const sessionId = to;
    if (!chatSessions[sessionId]) {
        chatSessions[sessionId] = {
            id: sessionId,
            contactName: `Client ${sessionId}`,
            messages: [],
            lastMessage: '',
            lastMessageTime: new Date(),
            unreadCount: 0,
            botActive: true
        };
    }
    let storageMsg = {
        id: Date.now().toString(),
        sender: 'bot',
        timestamp: new Date(),
        type: payload.type,
        text: payload.type === 'text' ? payload.text.body : (payload.image.caption || 'Sent Image')
    };
    if (payload.type === 'image') storageMsg.image = payload.image.link; 

    chatSessions[sessionId].messages.push(storageMsg);
    chatSessions[sessionId].lastMessage = storageMsg.text;
    chatSessions[sessionId].lastMessageTime = new Date();
    if (isAdmin) chatSessions[sessionId].unreadCount = 0;
    saveChats();

    await axios.post(
      `https://graph.facebook.com/v17.0/${serverConfig.phoneNumberId}/messages`, 
      { messaging_product: 'whatsapp', recipient_type: 'individual', to, ...payload }, 
      { headers: getAuthHeaders() }
    );
  } catch (err) {
    console.error("Send Error:", err.response?.data || err.message);
    throw err;
  }
}

// --- WEBHOOK ---
app.get('/webhook', (req, res) => {
  if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === serverConfig.verifyToken) {
    res.status(200).send(req.query['hub.challenge']);
  } else { res.sendStatus(403); }
});

app.post('/webhook', async (req, res) => {
  res.sendStatus(200); 

  try {
    const body = req.body;
    if (!body.object || !body.entry?.[0]?.changes?.[0]?.value?.messages) return;

    const messageObj = body.entry[0].changes[0].value.messages[0];
    const senderPhone = messageObj.from;
    const messageType = messageObj.type;
    const apiKey = getApiKey();

    await markMessageAsRead(messageObj.id);

    // Initialize Chat
    if (!chatSessions[senderPhone]) {
        chatSessions[senderPhone] = {
            id: senderPhone,
            contactName: messageObj.contacts?.[0]?.profile?.name || `Client ${senderPhone}`,
            messages: [],
            lastMessage: '',
            lastMessageTime: new Date(),
            unreadCount: 0,
            botActive: true
        };
    } else {
        if (messageObj.contacts?.[0]?.profile?.name) chatSessions[senderPhone].contactName = messageObj.contacts[0].profile.name;
    }

    let incomingMsg = {
        id: messageObj.id,
        sender: 'user',
        timestamp: new Date(),
        type: 'text',
        text: ''
    };

    let geminiParts = [];

    if (messageType === 'text') {
      console.log(`📩 TEXT from ${senderPhone}: ${messageObj.text.body}`);
      geminiParts.push({ text: messageObj.text.body });
      incomingMsg.text = messageObj.text.body;
    } else if (messageType === 'image') {
      console.log(`📷 IMAGE from ${senderPhone}`);
      const media = await downloadMetaImage(messageObj.image.id);
      incomingMsg.type = 'image';
      incomingMsg.text = messageObj.image.caption || 'Photo';
      if (media) {
         incomingMsg.image = `data:${media.mimeType};base64,${media.base64}`;
         geminiParts.push({ inlineData: { mimeType: media.mimeType, data: media.base64 } });
         geminiParts.push({ text: messageObj.image.caption || "Analyze this image." });
      }
    } else { return; }

    chatSessions[senderPhone].messages.push(incomingMsg);
    chatSessions[senderPhone].lastMessage = incomingMsg.text;
    chatSessions[senderPhone].lastMessageTime = new Date();
    chatSessions[senderPhone].unreadCount += 1;
    await saveChats();

    // Lock Check
    if (chatSessions[senderPhone].botActive === false) {
        console.log(`🔒 Bot LOCKED for ${senderPhone}. Skipping.`);
        return; 
    }

    if (!apiKey) {
      console.log("⚠️ API KEY MISSING. Cannot reply.");
      await sendWhatsApp(senderPhone, { type: 'text', text: { body: "⚠️ System Alert: AI Config Missing." } });
      return;
    }
    
    if (geminiParts.length === 0) return;

    console.log(`🤖 Asking Gemini (${MODEL_NAME})...`);

    const ai = new GoogleGenAI({ apiKey });
    
    // SAFETY: Don't send old images in history, they cause errors.
    // Replace old images with text placeholders.
    const historyParts = chatSessions[senderPhone].messages
        .slice(0, -1) 
        .slice(-30) // INCREASED CONTEXT WINDOW FROM 10 TO 30
        .filter(m => m.text || m.type === 'image')
        .map(m => ({
            role: m.sender === 'user' ? 'user' : 'model',
            parts: [{ 
                text: (m.type === 'image') 
                    ? `[User sent an image labeled: ${m.text || 'Photo'}]` 
                    : (m.text || '') 
            }]
        }));

    const chat = ai.chats.create({
      model: MODEL_NAME,
      config: {
        systemInstruction: getSystemInstruction(productInventory),
        tools: [{ functionDeclarations: [displayProductTool, escalateToAdminTool] }],
        maxOutputTokens: 4096, 
        temperature: 0.7,
      },
      history: historyParts
    });

    try {
        // IMPLEMENTED RETRY LOGIC HERE
        const result = await sendMessageWithRetry(chat, geminiParts);

        // --- MANUAL RESPONSE EXTRACTION TO AVOID SDK WARNINGS ---
        const responseCandidate = result.candidates?.[0];
        const contentParts = responseCandidate?.content?.parts || [];
        
        // Extract Text
        let textResponse = contentParts.filter(part => part.text).map(part => part.text).join('');
        const functionCalls = contentParts.filter(part => part.functionCall).map(part => part.functionCall);

        let imagesToSend = [];
        let shouldSilentLock = false;
        
        if (functionCalls && functionCalls.length > 0) {
          for (const fc of functionCalls) {
            if (fc.name === 'displayProduct') {
               const product = productInventory.find(p => p.id === fc.args.productId);
               if (product?.images?.length) imagesToSend = product.images.slice(0, 5);
            }
            if (fc.name === 'escalateToAdmin') {
               shouldSilentLock = true;
               console.log(`🚨 ESCALATION: ${fc.args.reason}`);
            }
          }
        }

        if (shouldSilentLock) {
            chatSessions[senderPhone].botActive = false;
            chatSessions[senderPhone].isEscalated = true;
            await saveChats();
            console.log(`🔒 Bot Locked Silently.`);
            return; 
        }

        if (imagesToSend.length > 0) {
           for (let i = 0; i < imagesToSend.length; i++) {
             const link = `${DOMAIN}/api/render-image/${productInventory.find(p=>p.images.includes(imagesToSend[0])).id}/${i}`;
             await sendWhatsApp(senderPhone, { type: 'image', image: { link } });
             await new Promise(r => setTimeout(r, 800)); 
           }
        }

        if (textResponse) {
          textResponse = formatResponseText(textResponse);
          console.log(`🤖 Reply: ${textResponse.substring(0, 40)}...`);
          await sendWhatsApp(senderPhone, { type: 'text', text: { body: textResponse } });
        }
    } catch (err) {
        // CRITICAL: ADD TO QUEUE IF FAILED
        console.error("❌ Message Failed, adding to RETRY QUEUE:", err.message);
        
        // Don't queue invalid user errors, only system errors
        if (err.status === 503 || err.code === 'ETIMEDOUT' || !err.status) {
            retryQueue.push({
                to: senderPhone,
                parts: geminiParts,
                timestamp: new Date().getTime()
            });
            await saveQueue();
        }
    }

  } catch (err) {
    // Better Error Logging
    if (err.response) {
       console.error('❌ SERVER/HOOK ERROR:', JSON.stringify(err.response.data, null, 2));
    } else {
       console.error('❌ ERROR:', err.message);
    }
  }
});

// SAFE CATCH-ALL FOR FRONTEND
app.get('*', (req, res) => {
  const indexPath = path.join(__dirname, 'dist', 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(503).send(`
      <html>
        <body style="font-family:sans-serif; text-align:center; padding:50px;">
          <h1>Maintenance in Progress</h1>
          <p>The dashboard is currently building. Please refresh in 2 minutes.</p>
          <hr>
          <p><em>Admin: Run 'npm run build' on the server.</em></p>
        </body>
      </html>
    `);
  }
});

Promise.all([loadInventory(), loadChats(), loadLeads(), loadQueue(), loadServerConfig()]).then(() => {
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log("________________________________________________________________");
    console.log(`✅ SERVER STARTED ON PORT: ${PORT}`);
    const key = process.env.API_KEY || "";
    console.log(`🔑 API Key Status: ${key ? "LOADED (" + key.substring(0,4) + "...)" : "MISSING ❌"}`);
    console.log(`📝 Logs will appear below for every message.`);
    console.log("________________________________________________________________\n");
  });
});