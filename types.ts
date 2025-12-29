
export type ProductCategory = 
  | 'Milk ATM' 
  | 'Oil ATM' 
  | 'Water Vending' 
  | 'Reverse Osmosis' 
  | 'Milk Pasteurizer' 
  | 'Bottle Rinser' 
  | 'Packaging Table' 
  | 'Cold Water Vending' 
  | 'Ultra Filtration';

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
    capacity?: string; // Milk, Oil, RO, Pasteurizer, UF, Bottle Rinser
    material?: 'Stainless Steel' | 'Non-Stainless Steel'; // Oil, Packaging Table
    operationType?: 'Automatic' | 'Manual'; // Water
    taps?: '1 Tap' | '2 Taps'; // Water, Cold Water
    mountType?: 'Floor Standing' | 'Wall Mount'; // Water
    dimensions?: string; // Packaging Table
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
  isEscalated?: boolean; // True if Admin attention is needed (Red Flag)
  botActive?: boolean;   // True if Bot is handling, False if locked for Admin
}
