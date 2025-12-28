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
app.use(express.json({ limit: '50mb' }));

// --- CONFIGURATION ---
const PORT = 5041; 
const DOMAIN = 'https://whatsapp.johntechvendorsltd.co.ke';
const DATA_FILE = path.join(__dirname, 'inventory.json');
const CHATS_FILE = path.join(__dirname, 'chats.json');
const CONFIG_FILE = path.join(__dirname, 'server-config.json');

// --- STATE MANAGEMENT ---
let productInventory = [];
let chatSessions = {}; 

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

async function saveChats() {
  try { await writeFile(CHATS_FILE, JSON.stringify(chatSessions, null, 2)); } catch (err) { console.error('❌ CHAT SAVE ERROR:', err.message); }
}

async function saveInventory() {
  try { await writeFile(DATA_FILE, JSON.stringify(productInventory, null, 2)); } catch (err) { console.error('❌ INVENTORY SAVE ERROR:', err.message); }
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

// --- TOOLS ---
const displayProductTool = {
  name: 'displayProduct',
  description: 'Trigger the sending of product photos. ONLY use this when: 1. You have identified the EXACT product ID based on user specs (Capacity/Type). 2. The user explicitly asks to "see" the machine.',
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
  
  *** YOUR CORE BEHAVIOR: CONSULTATIVE SELLING ***
  
  You are NOT a catalog search engine. You are a consultant. 
  When a user says "I want a Milk ATM", DO NOT just guess a product. You must find out what size they need first.

  --- INTERACTION RULES ---

  1. **PHASE 1: QUALIFICATION (CRITICAL)**
     - If a user asks for a category (e.g., "Do you have Milk ATMs?", "I need a water machine"), you **MUST** ask for specifications before proposing a product.
     - **Milk/Oil ATMs:** Ask: "What capacity (Litres) are you looking for? We have sizes like 100L, 200L, etc."
     - **Water Vending:** Ask: "Do you need Automatic or Manual? How many taps?"
     - **Reverse Osmosis:** Ask: "What is the output capacity (LPH) you need?"
     - **DO NOT** show an image or a specific price until the user answers this.

  2. **PHASE 2: MATCHING & PRESENTATION**
     - Once the user gives the specs (e.g., "I want 150 Litres"), look at the [ITEM] list below.
     - **IF MATCH FOUND:** 
       - Say: "We have a 150L model available."
       - Use 'displayProduct' tool to show it.
       - Explain the key features from the DESCRIPTION.
     - **IF NO MATCH:**
       - Say: "We don't have a 150L in stock right now, but we can fabricate one for you. Or would you like to see our [Closest Size]?"

  3. **PHASE 3: ANSWERING QUESTIONS (TEXT ONLY)**
     - If the user asks **"How much is it?"**:
       - Reply with the Price Range in text.
       - **DO NOT** use 'displayProduct'. Just give the price.
     - If the user asks **"How does it work?"**:
       - Explain the mechanism in simple layman's terms (e.g., "You key in the amount, and it pumps exactly that value...").
       - **DO NOT** use 'displayProduct'. Explain with words first.

  4. **PHASE 4: NEGOTIATION & CLOSING**
     - You can negotiate prices downwards towards the 'Min' price listed.
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

// Serve static files if they exist
const distPath = path.join(__dirname, 'dist');
if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
} else {
    console.warn("⚠️ 'dist' folder missing. Skipping static file serving.");
}

app.get('/api/products', (req, res) => res.json(productInventory || []));
app.post('/api/products', async (req, res) => {
  const { products } = req.body;
  if (Array.isArray(products)) {
    productInventory = products;
    await saveInventory();
    res.json({ status: 'success' });
  } else { res.status(400).json({ status: 'error' }); }
});

app.get('/api/chats', (req, res) => {
    const chatsArray = Object.values(chatSessions).sort((a, b) => new Date(b.lastMessageTime) - new Date(a.lastMessageTime));
    res.json(chatsArray);
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
    const { to, text } = req.body;
    try {
        await sendWhatsApp(to, { type: 'text', text: { body: text } }, true);
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
        text: payload.type === 'text' ? payload.text.body : 'Sent Image'
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
        .slice(-10) // Small context window
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
        maxOutputTokens: 800,
        temperature: 0.7,
      },
      history: historyParts
    });

    const result = await chat.sendMessage({ message: { parts: geminiParts } });

    // API Handling using getters
    let textResponse = result.text;
    const functionCalls = result.functionCalls; 

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
    console.error('❌ ERROR:', err.message);
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

Promise.all([loadInventory(), loadChats(), loadServerConfig()]).then(() => {
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log("________________________________________________________________");
    console.log(`✅ SERVER STARTED ON PORT: ${PORT}`);
    const key = process.env.API_KEY || "";
    console.log(`🔑 API Key Status: ${key ? "LOADED (" + key.substring(0,4) + "...)" : "MISSING ❌"}`);
    console.log(`📝 Logs will appear below for every message.`);
    console.log("________________________________________________________________\n");
  });
});