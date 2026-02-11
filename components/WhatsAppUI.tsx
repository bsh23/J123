
import React, { useState, useRef, useEffect } from 'react';
import { Product, Message, ChatSession, LeadsData, AnalyzedLead } from '../types';
import { 
  MoreVertical, Search, Paperclip, Smile, 
  Send, CheckCheck, ArrowLeft, Lock, Bot, X, Trash2,
  Sparkles, MessageSquare, PhoneCall, RefreshCw, ChevronRight, AlertCircle
} from 'lucide-react';

interface WhatsAppUIProps {
  products: Product[];
  openCatalog: () => void;
  openSettings: () => void;
  openAnalysis: () => void;
}

const WhatsAppUI: React.FC<WhatsAppUIProps> = ({ products, openCatalog, openSettings }) => {
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sidebarView, setSidebarView] = useState<'chats' | 'leads'>('chats');
  const [leadsData, setLeadsData] = useState<LeadsData | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [expandedCat, setExpandedCat] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchChats = async () => {
      const res = await fetch('/api/chats');
      if (res.ok) setChatSessions(await res.json());
    };
    fetchChats();
    const int = setInterval(fetchChats, 4000);
    return () => clearInterval(int);
  }, []);

  useEffect(() => {
    if (sidebarView === 'leads') fetchLeads(false);
  }, [sidebarView]);

  const fetchLeads = async (force: boolean) => {
    setIsAnalyzing(true);
    try {
        const res = await fetch('/api/analyze-leads', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ force })
        });
        if (res.ok) setLeadsData(await res.json());
    } finally { setIsAnalyzing(false); }
  };

  const handleSendMessage = async () => {
    if (!inputText.trim() || !selectedChatId) return;
    setIsSending(true);
    const res = await fetch('/api/send-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: selectedChatId, text: inputText })
    });
    if (res.ok) setInputText('');
    setIsSending(false);
  };

  const selectedChat = chatSessions.find(c => c.id === selectedChatId);

  return (
    <div className="flex h-full w-full max-w-[1600px] mx-auto shadow-2xl overflow-hidden bg-[#f0f2f5] rounded-lg">
      
      {/* Sidebar */}
      <div className={`w-full md:w-[30%] bg-white border-r flex flex-col ${selectedChatId ? 'hidden md:flex' : 'flex'}`}>
        <div className="bg-[#f0f2f5] p-4 flex flex-col gap-3 border-b">
            <div className="flex justify-between items-center">
                <img src="https://i.ibb.co/0yVkM0Zr/jtv.png" className="w-10 h-10 rounded-full" />
                <div className="flex gap-4 text-gray-500">
                    <button onClick={openCatalog} title="Inventory"><MoreVertical size={22} /></button>
                </div>
            </div>
            <div className="flex gap-2">
                <button 
                    onClick={() => setSidebarView('chats')}
                    className={`flex-1 py-2 rounded text-sm font-bold ${sidebarView === 'chats' ? 'bg-white text-[#008069] shadow-sm' : 'text-gray-500'}`}
                >
                    Chats
                </button>
                <button 
                    onClick={() => setSidebarView('leads')}
                    className={`flex-1 py-2 rounded text-sm font-bold ${sidebarView === 'leads' ? 'bg-white text-[#008069] shadow-sm' : 'text-gray-500'}`}
                >
                    Leads
                </button>
            </div>
        </div>

        <div className="flex-1 overflow-y-auto">
            {sidebarView === 'chats' ? (
                chatSessions.map(chat => (
                    <div 
                        key={chat.id} 
                        onClick={() => setSelectedChatId(chat.id)}
                        className={`p-3 border-b flex gap-3 cursor-pointer hover:bg-gray-50 ${selectedChatId === chat.id ? 'bg-gray-100' : ''} ${!chat.botActive ? 'bg-red-50' : ''}`}
                    >
                        <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center font-bold text-gray-500 relative">
                            {chat.contactName[0]}
                            {!chat.botActive && <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-600 rounded-full flex items-center justify-center text-[8px] text-white"><Lock size={8} /></div>}
                        </div>
                        <div className="flex-1 min-w-0">
                            <h4 className={`text-sm font-semibold truncate ${!chat.botActive ? 'text-red-700' : 'text-gray-800'}`}>{chat.contactName}</h4>
                            <p className="text-xs text-gray-500 truncate">{chat.lastMessage}</p>
                        </div>
                    </div>
                ))
            ) : (
                <div className="bg-white">
                    <div className="p-3 border-b flex justify-between items-center bg-gray-50">
                        <span className="text-xs font-bold text-gray-500">Categorized Opportunities</span>
                        <button onClick={() => fetchLeads(true)} className="text-[#008069]"><RefreshCw size={14} className={isAnalyzing ? 'animate-spin' : ''} /></button>
                    </div>
                    {leadsData && Object.entries(leadsData.categories).map(([cat, leads]) => {
                        // Fix: Cast 'leads' to AnalyzedLead[] to avoid TS unknown errors
                        const typedLeads = leads as AnalyzedLead[];
                        return (
                            <div key={cat} className="border-b">
                                <button 
                                    onClick={() => setExpandedCat(expandedCat === cat ? null : cat)}
                                    className="w-full p-3 flex justify-between items-center hover:bg-gray-50"
                                >
                                    <span className="text-sm font-bold text-gray-700">{cat} ({typedLeads.length})</span>
                                    <ChevronRight size={16} className={`transition-transform ${expandedCat === cat ? 'rotate-90' : ''}`} />
                                </button>
                                {expandedCat === cat && typedLeads.map(l => (
                                    <div 
                                        key={l.phone} 
                                        onClick={() => setSelectedChatId(l.phone)}
                                        className={`p-3 pl-6 border-t cursor-pointer hover:bg-green-50 flex flex-col gap-1 ${l.isSerious ? 'bg-yellow-50 border-l-4 border-l-yellow-400' : ''}`}
                                    >
                                        <div className="flex justify-between items-center">
                                            <span className="text-xs font-bold text-gray-800">{l.name}</span>
                                            {l.isSerious && <span className="text-[9px] bg-red-600 text-white px-1.5 rounded font-black flex items-center gap-1"><AlertCircle size={8} /> SERIOUS</span>}
                                        </div>
                                        <p className="text-[11px] text-gray-600 italic">"{l.reason}"</p>
                                    </div>
                                ))}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
      </div>

      {/* Chat Area */}
      <div className={`flex-1 flex flex-col bg-[#efeae2] ${selectedChatId ? 'flex' : 'hidden md:flex'}`}>
        {selectedChat ? (
            <>
                <div className={`h-16 px-4 flex items-center justify-between border-b ${!selectedChat.botActive ? 'bg-red-100' : 'bg-[#f0f2f5]'}`}>
                    <div className="flex items-center gap-3">
                        <button onClick={() => setSelectedChatId(null)} className="md:hidden"><ArrowLeft size={24} /></button>
                        <h3 className="font-bold text-gray-800">{selectedChat.contactName}</h3>
                    </div>
                    {!selectedChat.botActive && <span className="text-xs font-bold text-red-600 animate-pulse">LOCKED FOR ADMIN</span>}
                </div>
                <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
                    {selectedChat.messages.map((m, i) => (
                        <div key={i} className={`flex ${m.sender === 'user' ? 'justify-start' : 'justify-end'}`}>
                            <div className={`max-w-[80%] p-2 rounded shadow-sm text-sm ${m.sender === 'user' ? 'bg-white' : 'bg-[#d9fdd3]'}`}>
                                {m.text}
                            </div>
                        </div>
                    ))}
                    <div ref={messagesEndRef} />
                </div>
                <div className="p-3 bg-[#f0f2f5] flex gap-2">
                    <input 
                        className="flex-1 p-2 rounded border focus:outline-none" 
                        placeholder="Type to reply..." 
                        value={inputText}
                        onChange={e => setInputText(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
                    />
                    <button onClick={handleSendMessage} className="text-[#008069]"><Send /></button>
                </div>
            </>
        ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
                <Bot size={48} className="mb-4 opacity-20" />
                <p>Select a chat to view activity</p>
            </div>
        )}
      </div>
    </div>
  );
};

export default WhatsAppUI;
