import React, { useState, useRef, useEffect } from 'react';
import { Product, Message, ChatSession, LeadsData, AnalyzedLead } from '../types';
import { 
  MoreVertical, Send, ArrowLeft, Lock, Bot, RefreshCw, ChevronRight, AlertCircle, MessageSquare, Phone, Trash2, Unlock
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

  const fetchChats = async () => {
    try {
      const res = await fetch('/api/chats');
      if (res.ok) setChatSessions(await res.json());
    } catch (err) {
      console.error("Fetch chats error", err);
    }
  };

  useEffect(() => {
    fetchChats();
    const int = setInterval(fetchChats, 5000);
    return () => clearInterval(int);
  }, []);

  useEffect(() => {
    if (sidebarView === 'leads') fetchLeads(false);
  }, [sidebarView]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatSessions, selectedChatId]);

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
    const textToSend = inputText;
    setInputText('');
    
    try {
      const res = await fetch('/api/send-message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: selectedChatId, text: textToSend })
      });
      if (res.ok) {
        await fetchChats();
      }
    } catch (err) {
      console.error("Send message error", err);
    } finally {
      setIsSending(false);
    }
  };

  const toggleBot = async (id: string, active: boolean) => {
    // Optimistic UI update
    setChatSessions(prev => prev.map(c => c.id === id ? { ...c, botActive: active } : c));
    
    try {
      const res = await fetch(`/api/chat/${id}/toggle-bot`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ active })
      });
      if (!res.ok) await fetchChats(); // Revert if failed
    } catch (err) {
      await fetchChats();
    }
  };

  const handleDeleteMessage = async (chatId: string, messageId: string) => {
    if (!confirm("Are you sure you want to delete this message?")) return;
    
    // Optimistic UI update
    setChatSessions(prev => prev.map(c => {
      if (c.id === chatId) {
        return { ...c, messages: c.messages.filter(m => m.id !== messageId) };
      }
      return c;
    }));

    try {
      const res = await fetch(`/api/chat/${chatId}/message/${messageId}`, {
        method: 'DELETE'
      });
      if (!res.ok) await fetchChats();
    } catch (err) {
      await fetchChats();
    }
  };

  const selectedChat = chatSessions.find(c => c.id === selectedChatId);

  return (
    <div className="flex h-full w-full max-w-[1600px] mx-auto shadow-2xl overflow-hidden bg-[#f0f2f5] rounded-lg">
      
      {/* Sidebar */}
      <div className={`w-full md:w-[30%] bg-white border-r flex flex-col ${selectedChatId ? 'hidden md:flex' : 'flex'}`}>
        <div className="bg-[#f0f2f5] p-4 flex flex-col gap-3 border-b">
            <div className="flex justify-between items-center">
                <img src="https://i.ibb.co/0yVkM0Zr/jtv.png" className="w-10 h-10 rounded-full" alt="logo" />
                <div className="flex gap-4 text-gray-500">
                    <button onClick={openCatalog} title="Inventory"><MoreVertical size={22} /></button>
                </div>
            </div>
            <div className="flex gap-2">
                <button 
                    onClick={() => setSidebarView('chats')}
                    className={`flex-1 py-2 rounded text-sm font-bold flex items-center justify-center gap-2 ${sidebarView === 'chats' ? 'bg-white text-[#008069] shadow-sm' : 'text-gray-500'}`}
                >
                    <MessageSquare size={16} /> Chats
                </button>
                <button 
                    onClick={() => setSidebarView('leads')}
                    className={`flex-1 py-2 rounded text-sm font-bold flex items-center justify-center gap-2 ${sidebarView === 'leads' ? 'bg-white text-[#008069] shadow-sm' : 'text-gray-500'}`}
                >
                    <RefreshCw size={16} className={isAnalyzing ? 'animate-spin' : ''} /> AI Leads
                </button>
            </div>
        </div>

        <div className="flex-1 overflow-y-auto">
            {sidebarView === 'chats' ? (
                chatSessions.map(chat => (
                    <div 
                        key={chat.id} 
                        onClick={() => setSelectedChatId(chat.id)}
                        className={`p-3 border-b flex gap-3 cursor-pointer hover:bg-gray-50 ${selectedChatId === chat.id ? 'bg-gray-100' : ''} ${chat.botActive === false ? 'bg-red-50' : ''}`}
                    >
                        <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center font-bold text-gray-500 relative">
                            {chat.contactName[0]}
                            {chat.botActive === false && <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-600 rounded-full flex items-center justify-center text-[8px] text-white"><Lock size={8} /></div>}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-center">
                                <h4 className={`text-sm font-semibold truncate ${chat.botActive === false ? 'text-red-700' : 'text-gray-800'}`}>{chat.contactName}</h4>
                                {chat.unreadCount > 0 && <span className="bg-[#25D366] text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">{chat.unreadCount}</span>}
                            </div>
                            <p className="text-xs text-gray-500 truncate">{chat.lastMessage}</p>
                        </div>
                    </div>
                ))
            ) : (
                <div className="bg-white">
                    <div className="p-3 border-b flex justify-between items-center bg-gray-50">
                        <span className="text-xs font-bold text-gray-500">Categorized Intent</span>
                        <button onClick={() => fetchLeads(true)} className="text-[#008069] text-xs font-bold hover:underline">Scan Now</button>
                    </div>
                    {leadsData && Object.entries(leadsData.categories).map(([cat, leads]) => {
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
                                        className={`p-3 pl-6 border-t cursor-pointer hover:bg-green-50 flex flex-col gap-1 ${l.isSerious ? 'bg-yellow-50 border-l-4 border-l-red-500' : ''}`}
                                    >
                                        <div className="flex justify-between items-center">
                                            <span className="text-xs font-bold text-gray-800">{l.name || l.phone}</span>
                                            {l.isSerious && <span className="text-[9px] bg-red-600 text-white px-1.5 rounded font-black flex items-center gap-1 shadow-sm"><AlertCircle size={8} /> SERIOUS</span>}
                                        </div>
                                        <p className="text-[11px] text-gray-600 italic line-clamp-2">"{l.reason}"</p>
                                    </div>
                                ))}
                            </div>
                        );
                    })}
                    {(!leadsData || Object.keys(leadsData.categories).length === 0) && (
                        <div className="p-10 text-center text-gray-400 text-sm">No analysis found. Click "Scan Now" to begin.</div>
                    )}
                </div>
            )}
        </div>
      </div>

      {/* Chat Area */}
      <div className={`flex-1 flex flex-col bg-[#efeae2] whatsapp-bg ${selectedChatId ? 'flex' : 'hidden md:flex'}`}>
        {selectedChat ? (
            <>
                <div className={`h-16 px-4 flex items-center justify-between border-b ${selectedChat.botActive === false ? 'bg-red-100' : 'bg-[#f0f2f5]'} z-10 shadow-sm`}>
                    <div className="flex items-center gap-3">
                        <button onClick={() => setSelectedChatId(null)} className="md:hidden text-gray-600"><ArrowLeft size={24} /></button>
                        <div className="w-10 h-10 bg-gray-300 rounded-full flex items-center justify-center font-bold text-gray-600">
                            {selectedChat.contactName[0]}
                        </div>
                        <div>
                            <h3 className="font-bold text-gray-800 leading-tight">{selectedChat.contactName}</h3>
                            <p className="text-[10px] text-gray-500">WhatsApp Business</p>
                        </div>
                    </div>
                    <div className="flex gap-4 items-center">
                        {selectedChat.botActive === false ? (
                            <button 
                                onClick={() => toggleBot(selectedChat.id, true)}
                                className="text-xs bg-red-600 text-white px-3 py-1.5 rounded-full font-bold flex items-center gap-2 shadow-md hover:bg-red-700 transition-colors"
                            >
                                <Unlock size={14} /> RE-ACTIVATE BOT
                            </button>
                        ) : (
                            <button 
                                onClick={() => toggleBot(selectedChat.id, false)}
                                className="text-xs bg-white text-gray-700 px-3 py-1.5 rounded-full font-bold border border-gray-300 hover:bg-gray-50 shadow-sm transition-colors flex items-center gap-2"
                            >
                                <Lock size={14} /> LOCK BOT
                            </button>
                        )}
                        <a href={`tel:${selectedChat.id}`} className="text-gray-500 hover:text-gray-700"><Phone size={20} /></a>
                        <MoreVertical size={20} className="text-gray-500" />
                    </div>
                </div>
                
                <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2 relative scroll-smooth">
                    {selectedChat.messages.map((m, i) => (
                        <div key={m.id || i} className={`flex group ${m.sender === 'user' ? 'justify-start' : 'justify-end'}`}>
                            <div className={`max-w-[85%] p-2 px-3 rounded shadow-sm text-sm relative transition-all ${m.sender === 'user' ? 'bg-white rounded-tl-none' : 'bg-[#d9fdd3] rounded-tr-none'}`}>
                                <div className="flex justify-between items-start gap-4">
                                    <div className="whitespace-pre-wrap">{m.text}</div>
                                    <button 
                                        onClick={() => handleDeleteMessage(selectedChat.id, m.id)}
                                        className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-opacity p-0.5"
                                        title="Delete Message"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                                <div className="text-[9px] text-gray-400 mt-1 text-right">
                                    {m.timestamp ? new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                                </div>
                            </div>
                        </div>
                    ))}
                    <div ref={messagesEndRef} />
                </div>

                <div className="p-3 bg-[#f0f2f5] flex gap-2 items-center z-10 shadow-inner">
                    <input 
                        className="flex-1 p-2.5 px-4 rounded-full border border-gray-200 focus:outline-none focus:ring-1 focus:ring-[#008069] text-sm shadow-sm" 
                        placeholder="Type a message..." 
                        value={inputText}
                        onChange={e => setInputText(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && !isSending && handleSendMessage()}
                    />
                    <button 
                        onClick={handleSendMessage} 
                        disabled={isSending || !inputText.trim()}
                        className={`w-11 h-11 rounded-full flex items-center justify-center text-white shadow-md transition-all ${inputText.trim() ? 'bg-[#008069] scale-100' : 'bg-gray-400 scale-95 opacity-50 cursor-not-allowed'}`}
                    >
                        {isSending ? <RefreshCw size={20} className="animate-spin" /> : <Send size={20} />}
                    </button>
                </div>
            </>
        ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
                <div className="w-24 h-24 bg-gray-200 rounded-full flex items-center justify-center mb-6 opacity-30">
                    <Bot size={64} />
                </div>
                <h2 className="text-xl font-medium text-gray-600">JohnTech Assistant</h2>
                <p className="text-sm mt-2 opacity-60">Select a conversation to start selling.</p>
                <div className="mt-8 flex gap-3">
                    <button onClick={openCatalog} className="bg-[#008069] text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm hover:bg-[#006d59]">View Inventory</button>
                    <button onClick={() => setSidebarView('leads')} className="bg-white text-[#008069] px-4 py-2 rounded-lg text-sm font-bold shadow-sm border border-gray-100 hover:bg-gray-50">Check Leads</button>
                </div>
            </div>
        )}
      </div>
    </div>
  );
};

export default WhatsAppUI;