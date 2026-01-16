import React, { useState, useRef, useEffect } from 'react';
import { Product, Message, ChatSession } from '../types';
import { 
  MoreVertical, Search, Paperclip, Smile, 
  Send, CheckCheck, CircleDashed, ArrowLeft, Lock, Unlock, Bot, X, Trash2,
  Sparkles
} from 'lucide-react';

interface WhatsAppUIProps {
  products: Product[];
  openCatalog: () => void;
  openSettings: () => void;
  openAnalysis: () => void;
}

const WhatsAppUI: React.FC<WhatsAppUIProps> = ({ products, openCatalog, openSettings, openAnalysis }) => {
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- POLLING ---
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
    const interval = setInterval(fetchChats, 3000); 
    return () => clearInterval(interval);
  }, []);

  const selectedChat = chatSessions.find(c => c.id === selectedChatId);
  const isEscalated = selectedChat?.isEscalated || false;
  const isBotActive = selectedChat?.botActive !== false; // Default true if undefined

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Only scroll to bottom when changing chats, NOT when chatSessions updates via polling.
  // This prevents the view from jumping while the admin is reading history.
  useEffect(() => {
    if (selectedChatId) {
      scrollToBottom();
    }
  }, [selectedChatId]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (ev.target?.result) setAttachedImage(ev.target.result as string);
      };
      reader.readAsDataURL(e.target.files[0]);
    }
  };

  const clearAttachment = () => {
    setAttachedImage(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSendMessage = async () => {
    if ((!inputText.trim() && !attachedImage) || !selectedChatId) return;
    
    setIsSending(true);
    const textToSend = inputText.trim();
    const imageToSend = attachedImage;

    try {
        const res = await fetch('/api/send-message', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                to: selectedChatId,
                text: textToSend,
                image: imageToSend
            })
        });

        if (res.ok) {
            setInputText('');
            clearAttachment();
            
            // Optimistic update
            setChatSessions(prev => prev.map(c => {
                if (c.id === selectedChatId) {
                    const newMsg: any = { 
                        id: Date.now().toString(), 
                        text: textToSend, 
                        sender: 'bot', 
                        type: imageToSend ? 'image' : 'text', 
                        timestamp: new Date() 
                    };
                    if (imageToSend) newMsg.image = imageToSend;

                    return {
                        ...c,
                        messages: [...c.messages, newMsg]
                    };
                }
                return c;
            }));
            
            // Explicitly scroll to bottom when Admin sends a message
            setTimeout(scrollToBottom, 100);
        } else {
            alert("Failed to send message via WhatsApp API.");
        }
    } catch (err) {
        console.error("Send failed", err);
    } finally {
        setIsSending(false);
    }
  };

  const toggleBot = async () => {
    if (!selectedChatId) return;
    const newStatus = !isBotActive;
    
    try {
        const res = await fetch(`/api/chat/${selectedChatId}/toggle-bot`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ active: newStatus })
        });
        
        if (res.ok) {
            // Force immediate local update
            setChatSessions(prev => prev.map(c => {
                if (c.id === selectedChatId) {
                    return { ...c, botActive: newStatus, isEscalated: newStatus ? false : c.isEscalated };
                }
                return c;
            }));
        }
    } catch (err) {
        console.error("Toggle failed", err);
    }
  };

  const handleDeleteChat = async () => {
    if (!selectedChatId) return;
    if (!confirm("Are you sure you want to delete this conversation permanently? This action cannot be undone.")) return;

    try {
        const res = await fetch(`/api/chat/${selectedChatId}`, {
            method: 'DELETE'
        });

        if (res.ok) {
            setChatSessions(prev => prev.filter(c => c.id !== selectedChatId));
            setSelectedChatId(null);
        } else {
            alert("Failed to delete chat.");
        }
    } catch (err) {
        console.error("Delete failed", err);
        alert("Error connecting to server.");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSendMessage();
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
              <div className="absolute right-0 top-10 w-56 bg-white shadow-xl rounded py-2 hidden group-hover:block z-50 border border-gray-100">
                <div className="px-4 py-3 hover:bg-gray-100 cursor-pointer text-[#008069] font-semibold text-sm flex items-center gap-2" onClick={openAnalysis}>
                  <Sparkles size={16} /> Analyze Leads (AI)
                </div>
                <div className="h-px bg-gray-100 my-1"></div>
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
                className={`flex items-center gap-3 p-3 cursor-pointer border-b border-gray-100 transition-colors relative
                  ${selectedChatId === chat.id ? 'bg-[#f0f2f5]' : 'hover:bg-[#f5f6f6]'}
                  ${(chat.isEscalated || chat.botActive === false) ? 'bg-red-50 hover:bg-red-100 border-l-4 border-l-red-600' : ''}
                `}
              >
                <div className="w-12 h-12 rounded-full overflow-hidden flex-shrink-0 border border-gray-100 bg-gray-200 flex items-center justify-center relative">
                   <span className="text-gray-500 font-bold text-lg">{chat.contactName.charAt(0)}</span>
                   {(chat.isEscalated || chat.botActive === false) && (
                     <div className="absolute bottom-0 right-0 w-4 h-4 bg-red-600 rounded-full border-2 border-white flex items-center justify-center">
                         <Lock size={10} className="text-white" />
                     </div>
                   )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-baseline">
                    <h3 className={`font-medium truncate ${chat.isEscalated ? 'text-red-700 font-bold' : 'text-gray-900'}`}>
                        {chat.contactName}
                    </h3>
                    <span className="text-xs text-gray-500">{formatTime(chat.lastMessageTime)}</span>
                  </div>
                  <div className="text-xs text-[#008069] font-medium mb-1">+{chat.id}</div>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-500 truncate flex items-center gap-1 max-w-[70%]">
                      {chat.messages[chat.messages.length-1]?.text || 'Photo'}
                    </p>
                    {(chat.isEscalated || chat.botActive === false) && (
                      <span className="text-[10px] bg-red-600 text-white px-2 py-1 rounded-full font-bold shadow-sm animate-pulse">
                        ACTION
                      </span>
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
        flex-1 flex flex-col min-w-0 bg-[#efeae2] h-full relative
        ${selectedChatId ? 'flex' : 'hidden md:flex'}
      `}>
        
        {selectedChat && selectedChatId ? (
          <>
            {/* Chat Header */}
            <div className={`
              h-16 px-4 flex items-center justify-between border-b border-gray-200 z-30 flex-shrink-0 transition-colors
              ${(!isBotActive || isEscalated) ? 'bg-red-100 border-b-2 border-red-500' : 'bg-[#f0f2f5]'}
            `}>
              <div className="flex items-center gap-2 md:gap-4">
                <button onClick={() => setSelectedChatId(null)} className="md:hidden text-gray-600 mr-1">
                  <ArrowLeft size={24} />
                </button>
                
                <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-300 flex items-center justify-center relative">
                  <span className="text-lg font-bold text-gray-600">{selectedChat.contactName.charAt(0)}</span>
                </div>
                <div className="flex flex-col cursor-pointer">
                  <span className="text-gray-900 font-medium text-base truncate max-w-[150px] md:max-w-none">
                    {selectedChat.contactName}
                  </span>
                  <span className="text-xs text-gray-500">
                    +{selectedChat.id} • 
                    {isEscalated ? <span className="text-red-600 font-bold ml-1">NEEDS ADMIN</span> : ' Online'}
                  </span>
                </div>
              </div>

              {/* ACTION BUTTONS */}
              <div className="flex items-center gap-4">
                 <button 
                   onClick={toggleBot}
                   className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold transition-colors
                     ${isBotActive 
                       ? 'bg-green-100 text-green-700 hover:bg-green-200' 
                       : 'bg-red-600 text-white hover:bg-red-700 shadow-md'}
                   `}
                 >
                   {isBotActive ? (
                     <><Bot size={16} /> Bot Active</>
                   ) : (
                     <><Lock size={16} /> LOCKED</>
                   )}
                 </button>
                 {!isBotActive && (
                    <button onClick={toggleBot} className="hidden md:block text-sm underline text-blue-600 font-semibold">
                        Resume Bot
                    </button>
                 )}
                 <div className="h-6 w-px bg-gray-300 mx-2"></div>
                 <button 
                   onClick={handleDeleteChat}
                   className="text-gray-500 hover:text-red-600 transition-colors p-2 rounded-full hover:bg-red-50"
                   title="Delete Chat"
                 >
                    <Trash2 size={22} />
                 </button>
              </div>
            </div>

            {/* Mobile LOCKED Banner - Highly Visible */}
            {(!isBotActive || isEscalated) && (
                <div className="bg-red-600 text-white p-3 text-center text-sm font-bold shadow-md z-20 flex justify-between items-center px-6 animate-pulse">
                    <span className="flex items-center gap-2"><Lock size={16} /> ADMIN ACTION NEEDED</span>
                    <button onClick={toggleBot} className="bg-white text-red-600 px-3 py-1 rounded-full text-xs uppercase">
                        Unlock
                    </button>
                </div>
            )}

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 whatsapp-bg relative">
              <div className="flex flex-col gap-2">
                
                {/* Status Banners */}
                <div className="flex justify-center my-4">
                  <div className="bg-[#fff5c4] text-xs text-gray-800 px-3 py-1.5 rounded-lg shadow-sm text-center">
                     Messages synced via WhatsApp Business API.
                  </div>
                </div>

                {/* Messages */}
                {selectedChat.messages.map((msg, idx) => (
                  <div 
                    key={idx} 
                    className={`flex animate-fade-in ${msg.sender === 'user' ? 'justify-start' : 'justify-end'}`}
                  >
                    <div 
                        className={`
                          max-w-[85%] md:max-w-[65%] rounded-lg px-2 relative shadow-sm text-sm
                          ${msg.sender === 'user' 
                            ? 'bg-white rounded-tl-none' 
                            : 'bg-[#d9fdd3] rounded-tr-none'}
                        `}
                      >
                         {/* Image */}
                         {msg.type === 'image' && msg.image && (
                           <div className="p-1">
                              <img src={msg.image} alt="Media" className="rounded-lg w-full max-w-[300px] object-cover mb-1" />
                           </div>
                         )}

                        {/* Text */}
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
            <div className="h-auto min-h-[64px] bg-[#f0f2f5] px-4 py-2 flex flex-col z-10 flex-shrink-0">
                {/* Image Preview */}
                {attachedImage && (
                  <div className="bg-white p-2 mb-2 rounded-lg shadow-sm border border-gray-200 flex items-center gap-4 self-start relative animate-fade-in">
                    <img src={attachedImage} alt="Attachment" className="h-16 w-16 object-cover rounded" />
                    <span className="text-xs text-gray-500 font-medium">Image attached</span>
                    <button 
                      onClick={clearAttachment}
                      className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5 shadow hover:bg-red-600"
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}
                
                <div className="flex items-center gap-2 w-full">
                  <div className="flex gap-4">
                    <Smile size={26} className="text-gray-500 cursor-pointer" />
                    <button onClick={() => fileInputRef.current?.click()}>
                        <Paperclip size={24} className={`cursor-pointer ${attachedImage ? 'text-[#008069]' : 'text-gray-500'}`} />
                    </button>
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      className="hidden" 
                      accept="image/*" 
                      onChange={handleFileSelect} 
                    />
                  </div>
                  
                  <div className="flex-1 bg-white rounded-lg flex items-center min-h-[40px] border border-white">
                    <input
                      type="text"
                      className="w-full py-2 px-4 rounded-lg border-none focus:outline-none text-black placeholder-gray-500 bg-white"
                      placeholder={isBotActive ? (attachedImage ? "Add a caption..." : "Type a message...") : "Bot Locked. Type to reply manually..."}
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      onKeyDown={handleKeyDown}
                      disabled={isSending}
                    />
                  </div>
                  <div className="">
                      <button onClick={handleSendMessage} disabled={isSending} className={`p-2 ${isSending ? 'text-gray-400' : 'text-[#008069]'}`}>
                          <Send size={24} />
                      </button>
                  </div>
                </div>
            </div>
          </>
        ) : (
          <div className="hidden md:flex flex-col items-center justify-center h-full bg-[#f0f2f5] border-b-[6px] border-[#25d366]">
            <img src="https://i.ibb.co/0yVkM0Zr/jtv.png" alt="Logo" className="w-24 h-24 mb-6 opacity-80" />
            <h1 className="text-[#41525d] text-3xl font-light mb-4">JohnTech Dashboard</h1>
            <p className="text-[#8696a0] text-sm max-w-md text-center">
              View incoming customer queries here in real-time.<br/>
              Chats turn <strong>Red</strong> when the bot locks due to buying intent.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default WhatsAppUI;