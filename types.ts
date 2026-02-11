
export type ProductCategory = 
  | 'Milk ATM' 
  | 'Oil ATM' 
  | 'Water Vending' 
  | 'Reverse Osmosis' 
  | 'Milk Pasteurizer' 
  | 'Bottle Rinser' 
  | 'Packaging Table' 
  | 'Cold Water Vending' 
  | 'Ultra Filtration'
  | 'General';

export interface Product {
  id: string;
  category: ProductCategory;
  name: string;
  priceRange: {
    min: number;
    max: number;
  };
  description: string;
  images: string[];
  specs: {
    capacity?: string;
    material?: 'Stainless Steel' | 'Non-Stainless Steel';
    operationType?: 'Automatic' | 'Manual';
    taps?: '1 Tap' | '2 Taps';
    mountType?: 'Floor Standing' | 'Wall Mount';
    dimensions?: string;
    [key: string]: any;
  };
}

export interface Message {
  id: string;
  text: string;
  sender: 'user' | 'bot' | 'system';
  timestamp: Date | string;
  type: 'text' | 'image'; 
  image?: string;
}

export interface ChatSession {
  id: string;
  contactName: string;
  messages: Message[];
  lastMessage: string;
  lastMessageTime: Date | string;
  unreadCount: number;
  isEscalated?: boolean;
  botActive?: boolean;
  lastAnalyzedTime?: string;
}

export interface AnalyzedLead {
  phone: string;
  name: string;
  reason: string;
  isSerious: boolean;
  category: string;
}

export interface LeadsData {
  categories: {
    [category: string]: AnalyzedLead[];
  };
  lastUpdated?: string;
}
