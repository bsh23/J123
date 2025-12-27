import { GoogleGenAI, Type, FunctionDeclaration } from "@google/genai";
import { Product, Message } from "../types";
import { GOOGLE_API_KEY } from "../config";

const MODEL_NAME = 'gemini-3-flash-preview';

function removeEmojis(text: string): string {
  // Optional: You can keep emojis if you want the bot to be friendly
  // return text.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{2300}-\u{23FF}]/gu, '');
  return text; 
}

const displayProductTool: FunctionDeclaration = {
  name: 'displayProduct',
  description: 'Trigger the sending of product photos. Use this whenever discussing a specific item in stock.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      productId: { type: Type.STRING, description: 'The ID of the product to display.' }
    },
    required: ['productId']
  }
};

const escalateToAdminTool: FunctionDeclaration = {
  name: 'escalateToAdmin',
  description: 'Call the admin. REQUIRED when: 1. Buying intent is high. 2. Custom fabrication. 3. Item not in stock. 4. Payment questions.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      reason: { type: Type.STRING, description: 'The reason for calling the admin.' }
    },
    required: ['reason']
  }
};

export const generateBotResponse = async (
  history: Message[],
  userMessage: string,
  image: string | undefined,
  products: Product[]
): Promise<{ text: string; imagesToDisplay?: string[]; escalateToAdmin?: boolean }> => {
  try {
    const ai = new GoogleGenAI({ apiKey: GOOGLE_API_KEY });

    const productCatalogStr = products.length > 0 
      ? products.map(p => `
          Product ID: ${p.id}
          Name: ${p.name}
          Price Range: KSh ${p.priceRange.min} - KSh ${p.priceRange.max}
          Description: ${p.description}
          Specs: ${JSON.stringify(p.specs)}
          `).join('\n-------------------\n')
      : "NO SPECIFIC ITEMS CURRENTLY IN STOCK. Inform the customer that we can fabricate custom Vending Machines (Milk, Salad Oil, Water) upon request.";

    const systemInstruction = `You are a friendly and expert Sales Agent for "JohnTech Vendors Ltd" in Kenya.

    CORE BUSINESS:
    We manufacture and sell high-quality Vending Machines:
    1. Milk ATMs (Pasteurized milk dispensers).
    2. Salad Oil ATMs (Cooking oil dispensers).
    3. Water Vending Machines (Pure water).
    4. Reverse Osmosis (RO) Systems (Water purification).

    KEY BUSINESS DETAILS:
    - Location: Thika Road, Kihunguro, Behind Shell Petrol Station.
    - Delivery: We deliver countrywide (Kenya).
    - Warranty: 1-Year Warranty on all machines.
    - Customization: We fabricate custom sizes (e.g., 50L to 1000L).

    BEHAVIORAL RULES:
    1. **Natural Image Sharing**: If you describe a product, use the 'displayProduct' tool so the user can see it.
    2. **Speak Like a Human**: Explain the value (ROI, Profits) of the machine, not just technical specs.
    3. **Close the Sale**: If they ask for price, give the range and mention the quality (Stainless Steel).
    
    CURRENT INVENTORY LIST:
    ${productCatalogStr}
    `;

    const chatHistory = history
      .filter(m => m.sender !== 'system')
      .map(m => {
        const parts: any[] = [];
        if (m.image) {
           parts.push({ inlineData: { mimeType: 'image/png', data: m.image.split(',')[1] } });
        }
        if (m.text) parts.push({ text: m.text });
        return {
          role: m.sender === 'user' ? 'user' : 'model',
          parts: parts
        };
      });

    const chat = ai.chats.create({
      model: MODEL_NAME,
      config: {
        systemInstruction,
        tools: [{ functionDeclarations: [displayProductTool, escalateToAdminTool] }],
        temperature: 0.7, 
      },
      history: chatHistory
    });

    // Handle current user message
    const currentParts: any[] = [];
    if (image) {
       currentParts.push({ inlineData: { mimeType: 'image/png', data: image.split(',')[1] } });
    }
    currentParts.push({ text: userMessage || "Analyze this image" });

    const result = await chat.sendMessage({ 
      message: { parts: currentParts } 
    });
    
    const responseCandidate = result.candidates?.[0];
    const content = responseCandidate?.content;
    const rawText = content?.parts?.find(p => p.text)?.text || "";
    
    const textPart = removeEmojis(rawText);
    
    let imagesToDisplay: string[] = [];
    let escalateToAdmin = false;

    const functionCalls = content?.parts?.filter(p => p.functionCall);
    
    if (functionCalls) {
      for (const part of functionCalls) {
        const call = part.functionCall;
        if (call) {
          if (call.name === 'displayProduct') {
            const pid = (call.args as any).productId;
            const product = products.find(p => p.id === pid);
            if (product) {
              imagesToDisplay = product.images;
            }
          }
          if (call.name === 'escalateToAdmin') {
            escalateToAdmin = true;
          }
        }
      }
    }
    
    return {
      text: textPart,
      imagesToDisplay,
      escalateToAdmin
    };

  } catch (error) {
    console.error("Gemini API Error:", error);
    return { text: "Network error. Please try again." };
  }
};