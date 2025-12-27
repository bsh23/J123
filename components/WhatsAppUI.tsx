import React, { useState, useRef, useEffect } from 'react';
import { Product, Message } from '../types';
import { 
  MoreVertical, Search, Paperclip, Smile, Mic, 
  Send, CheckCheck, CircleDashed, Phone, Video, ArrowLeft, Lock, AlertTriangle, Image as ImageIcon
} from 'lucide-react';
import { generateBotResponse } from '../services/geminiService';

interface WhatsAppUIProps {
  products: Product[];
  openCatalog: () => void;
  openSettings: () => void;
}

const WhatsAppUI: React.FC<WhatsAppUIProps> = ({ products, openCatalog, openSettings }) => {
  // State for messages - Test Chat
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      text: 'Hello! Welcome to JohnTech Vendors Ltd. How can I assist you today?',
      sender: 'bot',
      timestamp: new Date(),
      type: 'text'
    }
  ]);
  
  // State for UI navigation
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [isChatLocked, setIsChatLocked] = useState(false);
  
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (selectedChatId) {
      scrollToBottom();
    }
  }, [messages, isTyping, selectedChatId]);

  const handleSendMessage = async (text: string, image?: string) => {
    if ((!text.trim() && !image) || isChatLocked) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      text: text,
      sender: 'user',
      timestamp: new Date(),
      type: image ? 'image' : 'text',
      image: image
    };

    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setIsTyping(true);

    try {
      // Pass image to service if it exists
      const response = await generateBotResponse(messages.concat(userMsg), text, image, products);
      
      const botMsgId = (Date.now() + 1).toString();
      let delayAccumulator = 1000; // Start initial delay

      // 1. Send Images One by One with human-like delay
      if (response.imagesToDisplay && response.imagesToDisplay.length > 0) {
         response.imagesToDisplay.forEach((imgSrc, index) => {
            setTimeout(() => {
               setMessages(prev => [...prev, {
                  id: botMsgId + `_img_${index}`,
                  text: '',
                  sender: 'bot',
                  timestamp: new Date(),
                  type: 'image',
                  image: imgSrc
               }]);
               // If there are more images, keep typing
               if (index < (response.imagesToDisplay?.length || 0) - 1 || response.text) {
                 setIsTyping(true);
               }
            }, delayAccumulator);
            
            // Add 1.5 seconds delay between each image to mimic selecting and sending
            delayAccumulator += 1500; 
         });
      }

      // 2. Send Text Response after images
      if (response.text) {
        setTimeout(() => {
           setMessages(prev => [...prev, {
             id: botMsgId,
             text: response.text,
             sender: 'bot',
             timestamp: new Date(),
             type: 'text'
           }]);
           setIsTyping(false); // Stop typing after text sent
        }, delayAccumulator);
        
        // Add extra delay for admin escalation check
        delayAccumulator += 1000;
      } else {
        // If no text, stop typing after images
        setTimeout(() => setIsTyping(false), delayAccumulator);
      }

      // Handle Admin Escalation
      if (response.escalateToAdmin) {
        setTimeout(() => {
          setIsChatLocked(true);
          const systemMsg: Message = {
            id: Date.now().toString() + '_sys',
            text: 'Conversation locked. JohnTech Admin has been notified and will take over shortly.',
            sender: 'system',
            timestamp: new Date(),
            type: 'text'
          };
          setMessages(prev => [...prev, systemMsg]);
        }, delayAccumulator);
      }

    } catch (error) {
      console.error(error);
      setIsTyping(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSendMessage(inputText);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        // Automatically send the image with a caption prompt
        const caption = prompt("Add a caption (optional):") || "";
        handleSendMessage(caption, base64);
      };
      reader.readAsDataURL(file);
    }
    // Reset
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const handleChatSelect = (id: string) => {
    setSelectedChatId(id);
  };

  const handleBackToList = () => {
    setSelectedChatId(null);
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
                <div className="px-4 py-3 hover:bg-gray-100 cursor-pointer text-gray-700 text-sm">
                  New group
                </div>
                <div className="px-4 py-3 hover:bg-gray-100 cursor-pointer text-gray-700 text-sm" onClick={openSettings}>
                  Settings
                </div>
                <div className="px-4 py-3 hover:bg-gray-100 cursor-pointer text-gray-700 text-sm text-red-600">
                  Log out
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
              placeholder="Search or start new chat" 
              className="bg-transparent w-full text-sm focus:outline-none placeholder-gray-500 text-gray-700"
            />
          </div>
        </div>

        {/* Chat List */}
        <div className="flex-1 overflow-y-auto bg-white">
          <div 
            onClick={() => handleChatSelect('test-bot')}
            className={`flex items-center gap-3 p-3 cursor-pointer border-b border-gray-100 transition-colors
              ${selectedChatId === 'test-bot' ? 'bg-[#f0f2f5]' : 'hover:bg-[#f5f6f6]'}
            `}
          >
            <div className="w-12 h-12 rounded-full overflow-hidden flex-shrink-0 border border-gray-100">
               <img src="https://i.ibb.co/0yVkM0Zr/jtv.png" alt="JohnTech" className="w-full h-full object-cover" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-baseline">
                <h3 className="text-gray-900 font-medium truncate">JohnTech Client</h3>
                <span className="text-xs text-gray-500">{formatTime(messages[messages.length-1]?.timestamp || new Date())}</span>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-500 truncate flex items-center gap-1 max-w-[70%]">
                  {isChatLocked && <Lock size={12} className="text-red-500"/>}
                  {messages[messages.length-1]?.sender === 'user' && <CheckCheck size={14} className="text-blue-400" />}
                  {messages[messages.length-1]?.type === 'image' ? (
                      <span className="flex items-center gap-1"><ImageIcon size={14}/> Photo</span>
                  ) : (
                      messages[messages.length-1]?.text
                  )}
                </p>
                {isChatLocked && (
                  <span className="text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-bold">Action Needed</span>
                )}
              </div>
            </div>
          </div>
          
          <div className="p-4 text-center text-xs text-gray-400 mt-4">
            <p>Connect Meta API in Settings to see real client chats.</p>
          </div>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className={`
        flex-1 flex flex-col min-w-0 bg-[#efeae2] h-full
        ${selectedChatId ? 'flex' : 'hidden md:flex'}
      `}>
        
        {selectedChatId ? (
          <>
            {/* Chat Header */}
            <div className={`
              h-16 px-4 flex items-center justify-between border-b border-gray-200 z-10 flex-shrink-0 transition-colors
              ${isChatLocked ? 'bg-red-50' : 'bg-[#f0f2f5]'}
            `}>
              <div className="flex items-center gap-2 md:gap-4">
                <button onClick={handleBackToList} className="md:hidden text-gray-600 mr-1">
                  <ArrowLeft size={24} />
                </button>
                
                <div className="w-10 h-10 rounded-full overflow-hidden cursor-pointer relative">
                  <img 
                    src="https://i.ibb.co/0yVkM0Zr/jtv.png" 
                    alt="Chat" 
                    className="w-full h-full object-cover" 
                  />
                  {isChatLocked && (
                    <div className="absolute top-0 right-0 w-3 h-3 bg-red-600 rounded-full border-2 border-white"></div>
                  )}
                </div>
                <div className="flex flex-col cursor-pointer">
                  <span className="text-gray-900 font-medium text-base truncate max-w-[150px] md:max-w-none">
                    JohnTech Vendors Ltd
                  </span>
                  <span className={`text-xs ${isChatLocked ? 'text-red-600 font-bold' : 'text-gray-500'}`}>
                    {isChatLocked ? '⚠️ Admin Attention Required' : 'Business Account'}
                  </span>
                </div>
              </div>
              <div className="flex gap-4 md:gap-6 text-gray-500">
                 <Video size={24} className="cursor-pointer hover:text-gray-600 hidden sm:block" />
                 <Phone size={24} className="cursor-pointer hover:text-gray-600 hidden sm:block" />
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
                     Messages are end-to-end encrypted.
                  </div>
                </div>

                {/* Messages */}
                {messages.map((msg) => (
                  <div 
                    key={msg.id} 
                    className={`flex animate-fade-in ${msg.sender === 'user' ? 'justify-end' : (msg.sender === 'system' ? 'justify-center' : 'justify-start')}`}
                  >
                    {msg.sender === 'system' ? (
                      <div className="bg-[#ffeecd] text-xs text-gray-800 px-3 py-1.5 rounded-lg shadow-sm text-center max-w-sm my-2 flex items-center gap-2 border border-[#f5d9a0]">
                        <Lock size={12} className="text-orange-600" /> {msg.text}
                      </div>
                    ) : (
                      <div 
                        className={`
                          max-w-[85%] md:max-w-[65%] rounded-lg px-2 relative shadow-sm text-sm
                          ${msg.sender === 'user' 
                            ? 'bg-[#d9fdd3] rounded-tr-none' 
                            : 'bg-white rounded-tl-none'}
                        `}
                      >
                         {/* Image Message */}
                         {msg.type === 'image' && msg.image && (
                           <div className="p-1">
                              <img src={msg.image} alt="Sent" className="rounded-lg w-full max-w-[300px] object-cover mb-1" />
                           </div>
                         )}

                        {/* Text Message */}
                        {msg.text && (
                          <div className="pt-2 pl-1 pr-1 pb-1 text-gray-900 whitespace-pre-wrap leading-relaxed break-words relative z-0">
                            {msg.text}
                            {/* Spacer to reserve room for timestamp at end of line */}
                            <span className="inline-block w-16 h-3 select-none pointer-events-none align-middle ml-1"></span>
                          </div>
                        )}

                        {/* Timestamp & Status - Absolute positioned in the reserved space */}
                        <div className="absolute bottom-1 right-2 flex items-center gap-1 z-10 h-4">
                          <span className="text-[11px] text-gray-500 min-w-[45px] text-right leading-none">
                            {formatTime(msg.timestamp)}
                          </span>
                          {msg.sender === 'user' && (
                             <CheckCheck size={14} className="text-[#53bdeb]" />
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                
                {/* Typing Indicator */}
                {isTyping && (
                   <div className="flex justify-start animate-fade-in">
                     <div className="bg-white rounded-lg rounded-tl-none px-4 py-3 shadow-sm flex items-center gap-1 w-16">
                       <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                       <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-100"></div>
                       <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-200"></div>
                     </div>
                   </div>
                )}
                
                <div ref={messagesEndRef} />
              </div>
            </div>

            {/* Input Area */}
            {isChatLocked ? (
              <div className="h-auto min-h-[80px] bg-gray-100 px-4 py-4 flex flex-col items-center justify-center z-10 flex-shrink-0 text-gray-600 text-sm border-t border-red-200">
                 <div className="flex items-center gap-2 mb-2 font-semibold text-red-600">
                   <AlertTriangle size={18} />
                   <span>LOCKED: Admin Attention Required</span>
                 </div>
                 <p className="text-xs text-gray-500 mb-2">Customer has shown buying intent or requested custom fabrication.</p>
                 <button 
                  onClick={() => setIsChatLocked(false)}
                  className="bg-[#008069] text-white px-4 py-1 rounded text-xs shadow-sm hover:bg-[#006d59]"
                 >
                   Admin: Unlock Conversation
                 </button>
              </div>
            ) : (
              <div className="h-auto min-h-[64px] bg-[#f0f2f5] px-4 py-2 flex items-center gap-2 z-10 flex-shrink-0">
                <div className="flex gap-4">
                  <Smile size={26} className="text-gray-500 cursor-pointer hover:text-gray-600" />
                  <input type="file" className="hidden" ref={fileInputRef} accept="image/*" onChange={handleFileSelect} />
                  <Paperclip 
                    size={24} 
                    className="text-gray-500 cursor-pointer hover:text-gray-600" 
                    onClick={() => fileInputRef.current?.click()}
                  />
                </div>
                
                {/* Input Container */}
                <div className="flex-1 bg-white rounded-lg flex items-center min-h-[40px] border border-white">
                  <input
                    type="text"
                    className="w-full py-2 px-4 rounded-lg border-none focus:outline-none text-black placeholder-gray-500 bg-white"
                    placeholder="Type a message"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={isChatLocked}
                  />
                </div>

                <div className="">
                  {inputText.trim() ? (
                    <button onClick={() => handleSendMessage(inputText)} className="p-2 text-[#008069]">
                        <Send size={24} />
                    </button>
                  ) : (
                    <Mic size={26} className="text-gray-500 cursor-pointer hover:text-gray-600" />
                  )}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="hidden md:flex flex-col items-center justify-center h-full bg-[#f0f2f5] border-b-[6px] border-[#25d366]">
            <img src="https://i.ibb.co/0yVkM0Zr/jtv.png" alt="Logo" className="w-24 h-24 mb-6 opacity-80" />
            <h1 className="text-[#41525d] text-3xl font-light mb-4">JohnTech Vendors Manager</h1>
            <p className="text-[#8696a0] text-sm max-w-md text-center">
              Send and receive messages without keeping your phone online.<br/>
              Use WhatsApp on up to 4 linked devices and 1 phone.
            </p>
            <div className="mt-8 text-xs text-[#8696a0] flex items-center gap-1">
               <span className="text-lg">🔒</span> End-to-end encrypted
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default WhatsAppUI;