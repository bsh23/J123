import React, { useState, useRef, useEffect } from 'react';
import { Product, Message, ChatSession } from '../types';
import { 
  MoreVertical, Search, Paperclip, Smile, Mic, 
  Send, CheckCheck, CircleDashed, Phone, Video, ArrowLeft, Lock, AlertTriangle, Image as ImageIcon
} from 'lucide-react';

interface WhatsAppUIProps {
  products: Product[];
  openCatalog: () => void;
  openSettings: () => void;
}

const WhatsAppUI: React.FC<WhatsAppUIProps> = ({ products, openCatalog, openSettings }) => {
  // State for Real Chats
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // --- POLLING FOR CHATS ---
  useEffect(() => {
    const fetchChats = async () => {
      try {
        const res = await fetch('/api/chats');
        if (res.ok) {
            const data = await res.json();
            setChatSessions(data);
        }
      } catch (err) {
        console.error("Polling error:", err);
      }
    };

    fetchChats();
    const interval = setInterval(fetchChats, 3000); // Poll every 3 seconds
    return () => clearInterval(interval);
  }, []);

  const selectedChat = chatSessions.find(c => c.id === selectedChatId);
  const isChatLocked = selectedChat?.isEscalated || false;

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (selectedChatId) {
      scrollToBottom();
    }
  }, [selectedChatId, chatSessions]);

  const handleSendMessage = async (text: string) => {
    if (!text.trim() || !selectedChatId) return;
    
    setIsSending(true);
    try {
        const res = await fetch('/api/send-message', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                to: selectedChatId,
                text: text.trim()
            })
        });

        if (res.ok) {
            setInputText('');
            // Optimistically add message to UI (Polling will confirm it)
            setChatSessions(prev => prev.map(c => {
                if (c.id === selectedChatId) {
                    return {
                        ...c,
                        messages: [
                            ...c.messages, 
                            { 
                                id: Date.now().toString(), 
                                text: text.trim(), 
                                sender: 'bot', 
                                type: 'text', 
                                timestamp: new Date() 
                            }
                        ]
                    };
                }
                return c;
            }));
        } else {
            alert("Failed to send message via WhatsApp API.");
        }
    } catch (err) {
        console.error("Send failed", err);
        alert("Network error sending message.");
    } finally {
        setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSendMessage(inputText);
  };

  const formatTime = (dateInput: Date | string) => {
    const date = new Date(dateInput);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="flex h-full w-full max-w-[1600px] mx-auto shadow-2xl overflow-hidden bg-[#f0f2f5] border border-gray-300/50 rounded-lg">
      
      {/* Sidebar - Contacts List */}
      <div className={`
        w-full md:w-[35%] lg:w-[30%] bg-white border-r border-gray-300 flex flex-col
        ${selectedChatId ? 'hidden md:flex' : 'flex'}
      `}>
        {/* Sidebar Header */}
        <div className="h-16 bg-[#f0f2f5] px-4 flex items-center justify-between border-b border-gray-200 flex-shrink-0">
          <div className="w-10 h-10 rounded-full bg-gray-300 overflow-hidden cursor-pointer border border-gray-200">
             <img src="https://i.ibb.co/0yVkM0Zr/jtv.png" alt="Admin" className="w-full h-full object-cover" />
          </div>
          <div className="flex gap-4 text-gray-500">
            <CircleDashed size={24} className="cursor-pointer" />
            <div className="relative group">
              <button className="hover:bg-gray-200 rounded-full p-1 transition-colors">
                <MoreVertical size={24} />
              </button>
              <div className="absolute right-0 top-10 w-48 bg-white shadow-xl rounded py-2 hidden group-hover:block z-50 border border-gray-100">
                <div className="px-4 py-3 hover:bg-gray-100 cursor-pointer text-gray-700 text-sm" onClick={openCatalog}>
                  Add Products
                </div>
                <div className="px-4 py-3 hover:bg-gray-100 cursor-pointer text-gray-700 text-sm" onClick={openSettings}>
                  Settings
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Search Bar */}
        <div className="p-2 border-b border-gray-200 bg-white flex-shrink-0">
          <div className="bg-[#f0f2f5] rounded-lg h-9 flex items-center px-4 gap-4">
            <Search size={18} className="text-gray-500" />
            <input 
              type="text" 
              placeholder="Search chats" 
              className="bg-transparent w-full text-sm focus:outline-none placeholder-gray-500 text-gray-700"
            />
          </div>
        </div>

        {/* Chat List */}
        <div className="flex-1 overflow-y-auto bg-white">
          {chatSessions.length === 0 ? (
             <div className="p-8 text-center text-gray-400 text-sm">
                <p>No active conversations yet.</p>
                <p className="mt-2">Messages sent to your WhatsApp number will appear here.</p>
             </div>
          ) : (
             chatSessions.map(chat => (
              <div 
                key={chat.id}
                onClick={() => setSelectedChatId(chat.id)}
                className={`flex items-center gap-3 p-3 cursor-pointer border-b border-gray-100 transition-colors
                  ${selectedChatId === chat.id ? 'bg-[#f0f2f5]' : 'hover:bg-[#f5f6f6]'}
                `}
              >
                <div className="w-12 h-12 rounded-full overflow-hidden flex-shrink-0 border border-gray-100 bg-gray-200 flex items-center justify-center">
                   {/* Avatar placeholder */}
                   <span className="text-gray-500 font-bold text-lg">{chat.contactName.charAt(0)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-baseline">
                    <h3 className="text-gray-900 font-medium truncate">{chat.contactName}</h3>
                    <span className="text-xs text-gray-500">{formatTime(chat.lastMessageTime)}</span>
                  </div>
                  {/* Phone Number Display */}
                  <div className="text-xs text-[#008069] font-medium mb-1">+{chat.id}</div>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-500 truncate flex items-center gap-1 max-w-[70%]">
                      {chat.isEscalated && <Lock size={12} className="text-red-500"/>}
                      {chat.messages[chat.messages.length-1]?.text}
                    </p>
                    {chat.isEscalated && (
                      <span className="text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-bold">Action Needed</span>
                    )}
                  </div>
                </div>
              </div>
             ))
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className={`
        flex-1 flex flex-col min-w-0 bg-[#efeae2] h-full
        ${selectedChatId ? 'flex' : 'hidden md:flex'}
      `}>
        
        {selectedChat && selectedChatId ? (
          <>
            {/* Chat Header */}
            <div className={`
              h-16 px-4 flex items-center justify-between border-b border-gray-200 z-10 flex-shrink-0 transition-colors
              ${isChatLocked ? 'bg-red-50' : 'bg-[#f0f2f5]'}
            `}>
              <div className="flex items-center gap-2 md:gap-4">
                <button onClick={() => setSelectedChatId(null)} className="md:hidden text-gray-600 mr-1">
                  <ArrowLeft size={24} />
                </button>
                
                <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-300 flex items-center justify-center relative">
                  <span className="text-lg font-bold text-gray-600">{selectedChat.contactName.charAt(0)}</span>
                  {isChatLocked && (
                    <div className="absolute top-0 right-0 w-3 h-3 bg-red-600 rounded-full border-2 border-white"></div>
                  )}
                </div>
                <div className="flex flex-col cursor-pointer">
                  <span className="text-gray-900 font-medium text-base truncate max-w-[150px] md:max-w-none">
                    {selectedChat.contactName}
                  </span>
                  {/* Phone number in Header */}
                  <span className="text-xs text-gray-500">+{selectedChat.id} • {isChatLocked ? '⚠️ Customer Wants to Buy' : 'Online'}</span>
                </div>
              </div>
              <div className="flex gap-4 md:gap-6 text-gray-500">
                 <Search size={24} className="cursor-pointer hover:text-gray-600" />
                 <MoreVertical size={24} className="cursor-pointer hover:text-gray-600" />
              </div>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 whatsapp-bg relative">
              <div className="flex flex-col gap-2">
                
                {/* Encryption Notice */}
                <div className="flex justify-center my-4">
                  <div className="bg-[#fff5c4] text-xs text-gray-800 px-3 py-1.5 rounded-lg shadow-sm text-center max-w-xs">
                     Messages synced from WhatsApp Business API.
                  </div>
                </div>

                {/* Messages */}
                {selectedChat.messages.map((msg, idx) => (
                  <div 
                    key={idx} 
                    className={`flex animate-fade-in ${msg.sender === 'user' ? 'justify-start' : 'justify-end'}`}
                  >
                    {/* User = White (Incoming), Bot = Green (Outgoing) */}
                    <div 
                        className={`
                          max-w-[85%] md:max-w-[65%] rounded-lg px-2 relative shadow-sm text-sm
                          ${msg.sender === 'user' 
                            ? 'bg-white rounded-tl-none' 
                            : 'bg-[#d9fdd3] rounded-tr-none'}
                        `}
                      >
                         {/* Image Message */}
                         {msg.type === 'image' && msg.image && (
                           <div className="p-1">
                              <img src={msg.image} alt="Media" className="rounded-lg w-full max-w-[300px] object-cover mb-1" />
                           </div>
                         )}

                        {/* Text Message */}
                        {msg.text && (
                          <div className="pt-2 pl-1 pr-1 pb-1 text-gray-900 whitespace-pre-wrap leading-relaxed break-words relative z-0">
                            {msg.text}
                            <span className="inline-block w-16 h-3 select-none pointer-events-none align-middle ml-1"></span>
                          </div>
                        )}

                        {/* Timestamp */}
                        <div className="absolute bottom-1 right-2 flex items-center gap-1 z-10 h-4">
                          <span className="text-[11px] text-gray-500 min-w-[45px] text-right leading-none">
                            {formatTime(msg.timestamp)}
                            {/* Simple checks for outgoing messages only */}
                            {msg.sender !== 'user' && <CheckCheck size={14} className="text-blue-500 ml-1 inline" />}
                          </span>
                        </div>
                      </div>
                  </div>
                ))}
                
                <div ref={messagesEndRef} />
              </div>
            </div>

            {/* Input Area */}
            <div className="h-auto min-h-[64px] bg-[#f0f2f5] px-4 py-2 flex items-center gap-2 z-10 flex-shrink-0">
                <div className="flex gap-4">
                  <Smile size={26} className="text-gray-500 cursor-pointer hover:text-gray-600" />
                  <Paperclip size={24} className="text-gray-500 cursor-pointer hover:text-gray-600" />
                </div>
                
                <div className="flex-1 bg-white rounded-lg flex items-center min-h-[40px] border border-white">
                  <input
                    type="text"
                    className="w-full py-2 px-4 rounded-lg border-none focus:outline-none text-black placeholder-gray-500 bg-white"
                    placeholder="Type a message..."
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={isSending}
                  />
                </div>
                <div className="">
                    <button onClick={() => handleSendMessage(inputText)} disabled={isSending} className={`p-2 ${isSending ? 'text-gray-400' : 'text-[#008069]'}`}>
                        <Send size={24} />
                    </button>
                </div>
            </div>
          </>
        ) : (
          <div className="hidden md:flex flex-col items-center justify-center h-full bg-[#f0f2f5] border-b-[6px] border-[#25d366]">
            <img src="https://i.ibb.co/0yVkM0Zr/jtv.png" alt="Logo" className="w-24 h-24 mb-6 opacity-80" />
            <h1 className="text-[#41525d] text-3xl font-light mb-4">JohnTech Dashboard</h1>
            <p className="text-[#8696a0] text-sm max-w-md text-center">
              View incoming customer queries here in real-time.<br/>
              When a customer is ready to buy, the chat will be flagged red.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default WhatsAppUI;