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
let chatSessions = {}; // In-memory storage for chats (synced to file)

// Fallback credentials
let serverConfig = {
  accessToken: process.env.FB_ACCESS_TOKEN || '',
  phoneNumberId: process.env.FB_PHONE_NUMBER_ID || '',
  verifyToken: process.env.FB_VERIFY_TOKEN || 'johntech_verify_token',
  appId: process.env.FB_APP_ID || '',
  appSecret: process.env.FB_APP_SECRET || ''
};

// --- LOGGING MIDDLEWARE ---
app.use((req, res, next) => {
  if (!req.url.includes('/render-image') && !req.url.includes('/api/chats')) {
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  }
  next();
});

// --- PERSISTENCE FUNCTIONS ---
async function loadInventory() {
  try {
    const data = await readFile(DATA_FILE, 'utf8');
    productInventory = JSON.parse(data);
    console.log(`📦 INVENTORY: Loaded ${productInventory.length} items.`);
  } catch (err) {
    console.log('📦 INVENTORY: Starting empty.');
    productInventory = [];
  }
}

async function loadChats() {
  try {
    const data = await readFile(CHATS_FILE, 'utf8');
    chatSessions = JSON.parse(data);
    console.log(`💬 CHATS: Loaded history for ${Object.keys(chatSessions).length} contacts.`);
  } catch (err) {
    console.log('💬 CHATS: Starting empty.');
    chatSessions = {};
  }
}

async function saveChats() {
  try {
    await writeFile(CHATS_FILE, JSON.stringify(chatSessions, null, 2));
  } catch (err) {
    console.error('❌ CHAT STORAGE ERROR:', err.message);
  }
}

async function saveInventory() {
  try {
    await writeFile(DATA_FILE, JSON.stringify(productInventory, null, 2));
  } catch (err) {
    console.error('❌ STORAGE ERROR:', err.message);
  }
}

async function loadServerConfig() {
  try {
    const data = await readFile(CONFIG_FILE, 'utf8');
    const savedConfig = JSON.parse(data);
    serverConfig = { 
      ...serverConfig, 
      ...savedConfig,
      accessToken: savedConfig.accessToken || serverConfig.accessToken,
      phoneNumberId: savedConfig.phoneNumberId || serverConfig.phoneNumberId
    };
    console.log(`⚙️  CONFIG: Loaded API Credentials.`);
  } catch (err) {
    console.log('⚙️  CONFIG: No config file found. Using defaults.');
  }
}

async function saveServerConfig() {
  try {
    await writeFile(CONFIG_FILE, JSON.stringify(serverConfig, null, 2));
    console.log('💾 CONFIG: Credentials saved to disk.');
  } catch (err) {
    console.error('❌ CONFIG ERROR:', err.message);
  }
}

// --- GEMINI SETUP ---
const getApiKey = () => process.env.API_KEY; 
const MODEL_NAME = 'gemini-3-flash-preview';

// --- TOOLS ---
const displayProductTool = {
  name: 'displayProduct',
  description: 'Trigger the sending of product photos. Use this whenever discussing a specific item in stock.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      productId: { type: Type.STRING, description: 'ID of the product' }
    },
    required: ['productId']
  }
};

const escalateToAdminTool = {
  name: 'escalateToAdmin',
  description: 'SILENTLY lock conversation and notify admin. Call this for: Buying Intent (Payment), Technical Questions (Service/Profit/Specs), Out of Stock items, or Delivery Price.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      reason: { type: Type.STRING, description: 'Reason for escalation' }
    },
    required: ['reason']
  }
};

const getSystemInstruction = (products) => {
  const productCatalogStr = products.length > 0 
    ? products.map(p => `ID: ${p.id}, Name: ${p.name}, Price: KSh ${p.priceRange.min} - ${p.priceRange.max}, Desc: ${p.description}, Specs: ${JSON.stringify(p.specs)}`).join('\n')
    : "NO SPECIFIC ITEMS CURRENTLY IN STOCK. Inform customer we fabricate custom Vending Machines (Milk, Salad, Water) upon request.";

  return `You are "John", the expert sales agent for "JohnTech Vendors Ltd" in Kenya.

  BUSINESS LOCATION:
  Thika Road, Kihunguro, behind Shell Petrol Station. (Be precise).

  YOUR GOAL:
  Assist the client with product info. However, for serious sales or complex issues, you must HAND OVER to the human admin immediately.

  PERSONALITY:
  - Mirror the user's tone. If they speak Sheng/Casual, be casual. If Formal, be formal.
  - Be helpful but concise.
  
  CRITICAL RULE - WHEN TO CALL 'escalateToAdmin' (SILENT LOCK):
  You must call the 'escalateToAdmin' tool and STOP talking if the user asks about:
  1. **Payment:** "How do I pay?", "M-Pesa number?", "Installments?".
  2. **Technical Details:** "How does the pump work?", "Profitability calculation?", "Service/Maintenance?", "Power consumption?", "Specs/features?".
  3. **Delivery Price:** "How much to transport to Kisumu?", "Delivery cost?".
  4. **Out of Stock/Custom:** Asking for a machine not in the INVENTORY LIST below.
  5. **Serious Buying Intent:** "I want to buy now", "Can I come collect?", "Where exactly are you located?".
  
  *When you call 'escalateToAdmin', do NOT generate any text response. The system will handle it.*

  OPERATIONAL RULES:
  1. **NO Special Characters:** Do NOT use asterisks (**bold**) or hashes (##).
  2. **Images First:** If showcasing a product, trigger the image tool first.
  
  INVENTORY LIST:
  ${productCatalogStr}`;
};

// --- HELPER: FORMAT TEXT ---
function formatResponseText(text) {
    if (!text) return "";
    return text.replace(/\*\*/g, '').replace(/\*/g, '').replace(/##/g, '').replace(/__/g, '');
}

// --- ROUTES ---

// 0. Health Check
app.get('/health', (req, res) => res.status(200).send('OK'));

// 1. Static Files
app.use(express.static(path.join(__dirname, 'dist')));

// 2. Inventory API
app.get('/api/products', (req, res) => res.json(productInventory || []));

app.post('/api/products', async (req, res) => {
  const { products } = req.body;
  if (Array.isArray(products)) {
    productInventory = products;
    await saveInventory();
    res.json({ status: 'success', count: productInventory.length });
  } else {
    res.status(400).json({ status: 'error' });
  }
});

// 3. Chat API (For Dashboard)
app.get('/api/chats', (req, res) => {
    const chatsArray = Object.values(chatSessions).sort((a, b) => new Date(b.lastMessageTime) - new Date(a.lastMessageTime));
    res.json(chatsArray);
});

// 3b. Toggle Bot Status (Admin Takeover/Release)
app.post('/api/chat/:id/toggle-bot', async (req, res) => {
    const { id } = req.params;
    const { active } = req.body; // true = resume bot, false = stop bot

    if (chatSessions[id]) {
        chatSessions[id].botActive = active;
        // If resuming, clear escalation flag so it looks normal
        if (active) {
            chatSessions[id].isEscalated = false;
        }
        await saveChats();
        res.json({ success: true, botActive: active });
    } else {
        res.status(404).json({ error: "Chat not found" });
    }
});

// 3c. Send Message API (For Admin Dashboard Reply)
app.post('/api/send-message', async (req, res) => {
    const { to, text } = req.body;
    
    if (!to || !text) {
        return res.status(400).json({ error: 'Missing "to" (phone) or "text" field' });
    }

    try {
        await sendWhatsApp(to, { type: 'text', text: { body: text } }, true); // Pass true for 'isAdmin'
        res.json({ success: true });
    } catch (err) {
        console.error("Admin Reply Error:", err);
        res.status(500).json({ error: 'Failed to send message' });
    }
});

// 4. Settings API
app.post('/api/settings', async (req, res) => {
  const { accessToken, phoneNumberId, businessAccountId, appId, appSecret, verifyToken } = req.body;
  serverConfig = {
    ...serverConfig,
    accessToken: accessToken || serverConfig.accessToken,
    phoneNumberId: phoneNumberId || serverConfig.phoneNumberId,
    businessAccountId: businessAccountId || serverConfig.businessAccountId,
    appId: appId || serverConfig.appId,
    appSecret: appSecret || serverConfig.appSecret,
    verifyToken: verifyToken || serverConfig.verifyToken
  };
  await saveServerConfig();
  res.json({ success: true, message: 'Settings saved to server.' });
});

app.get('/api/settings', (req, res) => {
  res.json({
    phoneNumberId: serverConfig.phoneNumberId || '',
    businessAccountId: serverConfig.businessAccountId || '',
    appId: serverConfig.appId || '',
    verifyToken: serverConfig.verifyToken || ''
  });
});

// 5. Verify Meta Config
app.post('/api/verify-meta-config', async (req, res) => {
  const { accessToken, phoneNumberId } = req.body;
  if (!accessToken || !phoneNumberId) {
    return res.status(400).json({ success: false, message: 'Missing Credentials.' });
  }
  try {
    const response = await axios.get(`https://graph.facebook.com/v17.0/${phoneNumberId}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    return res.json({ success: true, message: 'Connection Successful!', data: response.data });
  } catch (error) {
    return res.status(400).json({ success: false, message: 'Verification failed.' });
  }
});

// 6. Image Render
app.get('/api/render-image/:productId/:index', (req, res) => {
  const { productId, index } = req.params;
  const product = productInventory.find(p => p.id === productId);
  if (product && product.images && product.images[index]) {
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

// --- WHATSAPP HELPERS ---
const getAuthHeaders = () => ({ Authorization: `Bearer ${serverConfig.accessToken}` });

async function markMessageAsRead(messageId) {
    if (!serverConfig.accessToken || !serverConfig.phoneNumberId) return;
    try {
        await axios.post(
            `https://graph.facebook.com/v17.0/${serverConfig.phoneNumberId}/messages`,
            { messaging_product: 'whatsapp', status: 'read', message_id: messageId },
            { headers: getAuthHeaders() }
        );
    } catch (err) {
        console.error("Blue Tick Error:", err.message);
    }
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
    console.error("DL Error:", err.message);
    return null;
  }
}

async function sendWhatsApp(to, payload, isAdmin = false) {
  if (!serverConfig.accessToken || !serverConfig.phoneNumberId) return;
  try {
    // Save Outgoing Message to Storage
    const sessionId = to;
    if (!chatSessions[sessionId]) {
        // Should exist, but safety check
        chatSessions[sessionId] = {
            id: sessionId,
            contactName: `Client ${sessionId}`,
            messages: [],
            lastMessage: '',
            lastMessageTime: new Date(),
            unreadCount: 0,
            isEscalated: false,
            botActive: true
        };
    }

    let storageMsg = {
        id: Date.now().toString(),
        sender: 'bot', // We use 'bot' for UI, but AI sees it as 'model'
        timestamp: new Date(),
        type: payload.type
    };

    if (payload.type === 'text') storageMsg.text = payload.text.body;
    if (payload.type === 'image') {
        storageMsg.text = 'Sent an image';
        storageMsg.image = payload.image.link; 
    }

    chatSessions[sessionId].messages.push(storageMsg);
    chatSessions[sessionId].lastMessage = storageMsg.text || 'Media';
    chatSessions[sessionId].lastMessageTime = new Date();
    
    // If Admin sent it, reset unread count
    if (isAdmin) {
        chatSessions[sessionId].unreadCount = 0;
    }
    
    saveChats(); // Persist to file

    // Send to Meta
    await axios.post(
      `https://graph.facebook.com/v17.0/${serverConfig.phoneNumberId}/messages`, 
      { messaging_product: 'whatsapp', recipient_type: 'individual', to, ...payload }, 
      { headers: getAuthHeaders() }
    );
  } catch (err) {
    console.error("Send Error:", err.response?.data || err.message);
    throw err; // Propagate for API responses
  }
}

// 7. Webhook Verification
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const currentVerifyToken = serverConfig.verifyToken || 'johntech_verify_token';

  if (mode === 'subscribe' && token === currentVerifyToken) {
    console.log('✅ WEBHOOK VERIFIED');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// 8. Webhook Handler
app.post('/webhook', async (req, res) => {
  res.sendStatus(200); 

  let senderPhone = null;

  try {
    const body = req.body;
    if (!body.object || !body.entry?.[0]?.changes?.[0]?.value?.messages) return;

    const messageObj = body.entry[0].changes[0].value.messages[0];
    senderPhone = messageObj.from;
    const messageType = messageObj.type;
    const apiKey = getApiKey();

    // --- BLUE TICKS: Mark as Read ---
    await markMessageAsRead(messageObj.id);

    // --- SAVE INCOMING MESSAGE ---
    if (!chatSessions[senderPhone]) {
        chatSessions[senderPhone] = {
            id: senderPhone,
            contactName: messageObj.contacts?.[0]?.profile?.name || `Client ${senderPhone}`,
            messages: [],
            lastMessage: '',
            lastMessageTime: new Date(),
            unreadCount: 0,
            isEscalated: false,
            botActive: true // Default: Bot is active
        };
    } else {
        // Update contact name if available
        const newName = messageObj.contacts?.[0]?.profile?.name;
        if (newName) chatSessions[senderPhone].contactName = newName;
        // Ensure botActive is defined (for legacy chats)
        if (chatSessions[senderPhone].botActive === undefined) chatSessions[senderPhone].botActive = true;
    }

    let incomingMsg = {
        id: messageObj.id,
        sender: 'user',
        timestamp: new Date(),
        type: 'text',
        text: ''
    };

    // --- PROCESS MESSAGE ---
    let geminiParts = [];

    if (messageType === 'text') {
      console.log(`📩 Text from ${senderPhone}: ${messageObj.text.body}`);
      geminiParts.push({ text: messageObj.text.body });
      incomingMsg.text = messageObj.text.body;
    } else if (messageType === 'image') {
      console.log(`📷 Image from ${senderPhone}`);
      const media = await downloadMetaImage(messageObj.image.id);
      incomingMsg.type = 'image';
      incomingMsg.text = messageObj.image.caption || 'Photo';
      if (media) {
         incomingMsg.image = `data:${media.mimeType};base64,${media.base64}`;
         geminiParts.push({ inlineData: { mimeType: media.mimeType, data: media.base64 } });
         geminiParts.push({ text: messageObj.image.caption || "Analyze this image." });
      }
    } else {
      return; 
    }

    // Update Session
    chatSessions[senderPhone].messages.push(incomingMsg);
    chatSessions[senderPhone].lastMessage = incomingMsg.text;
    chatSessions[senderPhone].lastMessageTime = new Date();
    chatSessions[senderPhone].unreadCount += 1;
    await saveChats();

    // --- CHECK IF BOT IS LOCKED ---
    if (chatSessions[senderPhone].botActive === false) {
        console.log(`🔒 Bot is LOCKED for ${senderPhone}. Skipping AI response.`);
        return; // Stop here, Admin handles it.
    }

    if (!apiKey) {
      await sendWhatsApp(senderPhone, { type: 'text', text: { body: "⚠️ System Alert: AI Config Missing." } });
      return;
    }

    // --- AI GENERATION ---
    const ai = new GoogleGenAI({ apiKey });
    
    // BUILD HISTORY: Include ALL previous messages so bot "remembers" context
    // and sees what Admin wrote if Admin was active.
    const historyParts = chatSessions[senderPhone].messages
        .slice(0, -1) // Exclude current message (which is in incomingMsg)
        .slice(-15)   // Limit context window to last 15 messages for efficiency
        .map(m => ({
            role: m.sender === 'user' ? 'user' : 'model',
            parts: [{ text: m.text || (m.type === 'image' ? '[Image Sent]' : '') }]
        }));

    // Start Chat with History
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

    // Send Current Message
    const result = await chat.sendMessage({ 
       role: 'user', 
       parts: geminiParts 
    });

    const content = result.response.candidates?.[0]?.content;
    let textResponse = content?.parts?.find(p => p.text)?.text;
    const functionCalls = content?.parts?.filter(p => p.functionCall);

    let imagesToSend = [];
    let shouldSilentLock = false;
    
    if (functionCalls) {
      for (const part of functionCalls) {
        const fc = part.functionCall;
        
        if (fc.name === 'displayProduct') {
           const product = productInventory.find(p => p.id === fc.args.productId);
           if (product?.images?.length) imagesToSend = product.images.slice(0, 5);
        }
        
        if (fc.name === 'escalateToAdmin') {
           shouldSilentLock = true;
           console.log(`🚨 ESCALATION TRIGGERED: ${fc.args.reason}`);
        }
      }
    }

    if (shouldSilentLock) {
        // 1. Lock the bot
        chatSessions[senderPhone].botActive = false;
        // 2. Flag for Admin (Red Badge)
        chatSessions[senderPhone].isEscalated = true;
        await saveChats();
        // 3. DO NOT SEND TEXT RESPONSE (Silent Lock)
        return; 
    }

    // Send Images First 
    if (imagesToSend.length > 0) {
       for (let i = 0; i < imagesToSend.length; i++) {
         const link = `${DOMAIN}/api/render-image/${productInventory.find(p=>p.images.includes(imagesToSend[0])).id}/${i}`;
         await sendWhatsApp(senderPhone, { type: 'image', image: { link } });
         await new Promise(r => setTimeout(r, 800)); 
       }
    }

    // Send Text Response 
    if (textResponse) {
      textResponse = formatResponseText(textResponse);
      await sendWhatsApp(senderPhone, { type: 'text', text: { body: textResponse } });
    }

  } catch (err) {
    console.error('Webhook processing error:', err);
  }
});

// Catch-all must be last
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));

Promise.all([loadInventory(), loadChats(), loadServerConfig()]).then(() => {
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n✅ SERVER STARTED ON PORT: ${PORT}`);
    console.log(`   Webhook: ${DOMAIN}/webhook`);
    console.log("==================================================\n");
  });
});