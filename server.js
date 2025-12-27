import 'dotenv/config';
import express from 'express';
import path from 'path';
import axios from 'axios';
import { GoogleGenAI, Type } from '@google/genai';
import { fileURLToPath } from 'url';
import { readFile, writeFile } from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '50mb' }));

// --- CONFIGURATION ---
const PORT = 5041; 
const DOMAIN = 'https://whatsapp.johntechvendorsltd.co.ke';
const DATA_FILE = path.join(__dirname, 'inventory.json');
const CONFIG_FILE = path.join(__dirname, 'server-config.json');

// --- STATE MANAGEMENT ---
let productInventory = [];

// Fallback credentials
let serverConfig = {
  accessToken: process.env.FB_ACCESS_TOKEN || 'EAAZAphZBPWU7wBQT7Y3mmkG7lbOhb2MgO0CZBZBfDFJhoSlcDD3QaRZAOW3OZAwyVOpuBmyEJzZBO6Id33MMMtsBZBq3jm78GeLi71H2ZCw26d6INUtZCSrfqFgZAwZAESTsDpHB51lwEGmvTsn20qBjtQPQKuX0ApygP12SHZAm1Qszfd8DNBndmnUWZAV3aKs2qTQjEDEAZDZD',
  phoneNumberId: process.env.FB_PHONE_NUMBER_ID || '849028871635662',
  verifyToken: process.env.FB_VERIFY_TOKEN || 'johntech_verify_token',
  appId: process.env.FB_APP_ID || '1804882224239548',
  appSecret: process.env.FB_APP_SECRET || '5444a89d5cbf3ce81e8aa985268390b5'
};

// --- LOGGING MIDDLEWARE ---
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
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
// Key removed due to leak. Must be provided via Environment Variable.
const getApiKey = () => process.env.API_KEY; 
// CHANGED: Using Flash model to avoid Quota Exceeded (429) errors
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
  description: 'Notify admin for high buying intent, custom fabrication, or out-of-stock items.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      reason: { type: Type.STRING }
    },
    required: ['reason']
  }
};

const getSystemInstruction = (products) => {
  const productCatalogStr = products.length > 0 
    ? products.map(p => `ID: ${p.id}, Name: ${p.name}, Price Range: KSh ${p.priceRange.min} - ${p.priceRange.max}, Desc: ${p.description}`).join('\n')
    : "NO SPECIFIC ITEMS CURRENTLY IN STOCK. Inform customer we fabricate custom Vending Machines upon request.";

  return `You are a friendly and expert Sales Agent for "JohnTech Vendors Ltd" in Kenya.
  
  CORE BUSINESS:
  We manufacture and sell high-quality Vending Machines:
  1. Milk ATMs (Pasteurized milk dispensers).
  2. Salad Oil ATMs (Cooking oil dispensers).
  3. Water Vending Machines (Pure water).
  4. Reverse Osmosis (RO) Systems (Water purification).

  KEY BUSINESS DETAILS (Use these in conversation):
  - Location: Thika Road, Kihunguro, Behind Shell Petrol Station.
  - Delivery: We deliver countrywide (Kenya).
  - Warranty: All machines come with a 1-Year Warranty.

  SALES STRATEGY:
  - **Be Persuasive but Natural:** Mention it's a "highly profitable business".
  - **Visuals:** ALWAYS use 'displayProduct' tool when describing a machine.
  - **Pricing:** Give the price range confidently.
  
  INVENTORY LIST:
  ${productCatalogStr}`;
};

// --- ROUTES ---

// 0. Health Check (Important for 502 debugging)
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

// 3. Settings API
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

// 4. Verify Meta Config
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

// 5. Image Render
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

async function sendWhatsApp(to, payload) {
  if (!serverConfig.accessToken || !serverConfig.phoneNumberId) return;
  try {
    await axios.post(
      `https://graph.facebook.com/v17.0/${serverConfig.phoneNumberId}/messages`, 
      { messaging_product: 'whatsapp', recipient_type: 'individual', to, ...payload }, 
      { headers: getAuthHeaders() }
    );
  } catch (err) {
    console.error("Send Error:", err.response?.data || err.message);
  }
}

// 6. Webhook Verification
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

// 7. Webhook Handler
app.post('/webhook', async (req, res) => {
  res.sendStatus(200); 

  // We define these outside the try block so they are available in catch
  let senderPhone = null;

  try {
    const body = req.body;
    if (!body.object || !body.entry?.[0]?.changes?.[0]?.value?.messages) return;

    const messageObj = body.entry[0].changes[0].value.messages[0];
    senderPhone = messageObj.from;
    const messageType = messageObj.type;
    const apiKey = getApiKey();

    if (!apiKey) {
      console.error("❌ MISSING GEMINI API KEY");
      await sendWhatsApp(senderPhone, { type: 'text', text: { body: "⚠️ System Alert: AI Config Missing. Please contact admin." } });
      return;
    }

    let geminiParts = [];

    if (messageType === 'text') {
      console.log(`📩 Text from ${senderPhone}: ${messageObj.text.body}`);
      geminiParts.push({ text: messageObj.text.body });
    } else if (messageType === 'image') {
      console.log(`📷 Image from ${senderPhone}`);
      const media = await downloadMetaImage(messageObj.image.id);
      if (media) {
        geminiParts.push({ inlineData: { mimeType: media.mimeType, data: media.base64 } });
        geminiParts.push({ text: messageObj.image.caption || "Analyze this image." });
      }
    } else {
      return; 
    }

    const ai = new GoogleGenAI({ apiKey });
    const result = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: { role: 'user', parts: geminiParts },
      config: {
        systemInstruction: getSystemInstruction(productInventory),
        tools: [{ functionDeclarations: [displayProductTool, escalateToAdminTool] }],
      },
    });

    const content = result.candidates?.[0]?.content;
    const textResponse = content?.parts?.find(p => p.text)?.text;
    const functionCalls = content?.parts?.filter(p => p.functionCall);

    let imagesToSend = [];
    
    if (functionCalls) {
      for (const part of functionCalls) {
        const fc = part.functionCall;
        if (fc.name === 'displayProduct') {
           const product = productInventory.find(p => p.id === fc.args.productId);
           if (product?.images?.length) imagesToSend = product.images.slice(0, 5);
        }
        if (fc.name === 'escalateToAdmin') {
           await sendWhatsApp(senderPhone, { type: 'text', text: { body: "🚨 Connecting you to an agent..." } });
        }
      }
    }

    if (imagesToSend.length > 0) {
       for (let i = 0; i < imagesToSend.length; i++) {
         const link = `${DOMAIN}/api/render-image/${productInventory.find(p=>p.images.includes(imagesToSend[0])).id}/${i}`;
         await sendWhatsApp(senderPhone, { type: 'image', image: { link } });
         await new Promise(r => setTimeout(r, 500));
       }
    }

    if (textResponse) {
      await sendWhatsApp(senderPhone, { type: 'text', text: { body: textResponse } });
    }

  } catch (err) {
    console.error('Webhook processing error:', err);
    // Graceful Fallback: Tell the user the bot is down instead of ignoring them
    if (senderPhone) {
        try {
            await sendWhatsApp(senderPhone, { type: 'text', text: { body: "⚠️ Maintenance Mode: Our AI assistant is currently updating. Please try again in a few minutes or call us directly." } });
        } catch (e) {
            console.error("Failed to send error notice");
        }
    }
  }
});

// Catch-all must be last
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));

Promise.all([loadInventory(), loadServerConfig()]).then(() => {
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n✅ SERVER STARTED ON PORT: ${PORT}`);
    console.log(`   Health Check: http://127.0.0.1:${PORT}/health`);
    console.log("==================================================\n");
  });

  server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
      console.error(`\n❌ CRITICAL ERROR: Port ${PORT} is already in use!`);
      process.exit(1);
    } else {
      console.error(e);
      process.exit(1);
    }
  });
});