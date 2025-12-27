export type ProductCategory = 'Milk ATM' | 'Oil ATM' | 'Water Vending' | 'Reverse Osmosis';

export interface Product {
  id: string;
  category: ProductCategory;
  name: string; // Generated automatically or manual
  priceRange: {
    min: number;
    max: number;
  };
  description: string;
  images: string[]; // Base64 strings
  specs: {
    capacity?: string; // Milk, Oil, RO
    material?: 'Stainless Steel' | 'Non-Stainless Steel'; // Oil
    operationType?: 'Automatic' | 'Manual'; // Water
    taps?: '1 Tap' | '2 Taps'; // Water
    mountType?: 'Floor Standing' | 'Wall Mount'; // Water
    [key: string]: any;
  };
}

export interface Message {
  id: string;
  text: string;
  sender: 'user' | 'bot' | 'system';
  timestamp: Date | string; // Allow string date from JSON
  type: 'text' | 'image'; 
  image?: string; // Single image url/base64
}

export interface ChatSession {
  id: string;
  contactName: string;
  messages: Message[];
  lastMessage: string;
  lastMessageTime: Date | string;
  unreadCount: number;
  isEscalated?: boolean; // New field for admin attention
}