import React, { useState, useEffect } from 'react';
import { X, Loader2, RefreshCw, AlertTriangle, PhoneCall, DollarSign, MapPin, MessageCircle } from 'lucide-react';

interface AnalyzedLead {
  phone: string;
  name: string;
  reason: string;
}

interface AnalysisResult {
  serious: AnalyzedLead[];
  stalled: AnalyzedLead[];
  visiting: AnalyzedLead[];
  followUp: AnalyzedLead[];
}

interface LeadAnalysisModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const LeadAnalysisModal: React.FC<LeadAnalysisModalProps> = ({ isOpen, onClose }) => {
  const [data, setData] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'serious' | 'stalled' | 'visiting' | 'followUp'>('serious');

  const fetchAnalysis = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/analyze-leads', { method: 'POST' });
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error("Analysis failed", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && !data) {
      fetchAnalysis();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const getTabClass = (tab: string) => `
    flex-1 py-3 text-sm font-semibold flex items-center justify-center gap-2 border-b-2 transition-colors
    ${activeTab === tab ? 'border-[#008069] text-[#008069] bg-green-50' : 'border-transparent text-gray-500 hover:bg-gray-50'}
  `;

  const renderList = (list: AnalyzedLead[]) => {
    if (!list || list.length === 0) return <div className="p-8 text-center text-gray-400">No leads found in this category.</div>;

    return (
      <div className="divide-y divide-gray-100">
        {list.map((lead, idx) => (
          <div key={idx} className="p-4 hover:bg-gray-50 flex justify-between items-start gap-4">
             <div>
                <h4 className="font-bold text-gray-800">{lead.name}</h4>
                <p className="text-sm text-[#008069] font-mono">{lead.phone}</p>
                <p className="text-sm text-gray-600 mt-1 italic">"{lead.reason}"</p>
             </div>
             <a 
                href={`https://wa.me/${lead.phone}`} 
                target="_blank" 
                rel="noopener noreferrer"
                className="bg-green-100 text-green-700 p-2 rounded-full hover:bg-green-200"
                title="Chat on WhatsApp"
             >
                <MessageCircle size={18} />
             </a>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white w-full max-w-2xl rounded-lg shadow-xl overflow-hidden flex flex-col h-[80vh]">
        <div className="bg-[#008069] text-white p-4 flex justify-between items-center">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            ✨ AI Lead Analysis
          </h2>
          <div className="flex items-center gap-2">
            <button onClick={fetchAnalysis} disabled={loading} className="p-1 hover:bg-white/20 rounded-full">
               <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
            </button>
            <button onClick={onClose} className="p-1 hover:bg-white/20 rounded-full">
               <X size={24} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 bg-white">
          <button onClick={() => setActiveTab('serious')} className={getTabClass('serious')}>
             <PhoneCall size={16} /> Call Now <span className="bg-red-100 text-red-600 px-1.5 rounded-full text-xs ml-1">{data?.serious?.length || 0}</span>
          </button>
          <button onClick={() => setActiveTab('stalled')} className={getTabClass('stalled')}>
             <DollarSign size={16} /> Price Stalled <span className="bg-orange-100 text-orange-600 px-1.5 rounded-full text-xs ml-1">{data?.stalled?.length || 0}</span>
          </button>
          <button onClick={() => setActiveTab('visiting')} className={getTabClass('visiting')}>
             <MapPin size={16} /> Visiting <span className="bg-blue-100 text-blue-600 px-1.5 rounded-full text-xs ml-1">{data?.visiting?.length || 0}</span>
          </button>
          <button onClick={() => setActiveTab('followUp')} className={getTabClass('followUp')}>
             <MessageCircle size={16} /> Follow Up <span className="bg-gray-100 text-gray-600 px-1.5 rounded-full text-xs ml-1">{data?.followUp?.length || 0}</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto bg-white relative">
          {loading ? (
             <div className="absolute inset-0 flex flex-col items-center justify-center bg-white z-10">
                <Loader2 size={40} className="text-[#008069] animate-spin mb-4" />
                <p className="text-gray-500 font-medium">Scanning conversation history...</p>
                <p className="text-gray-400 text-xs mt-2">This may take a few seconds</p>
             </div>
          ) : (
             <>
               {activeTab === 'serious' && (
                 <div className="bg-red-50 p-3 text-red-700 text-xs border-b border-red-100 flex items-center gap-2">
                    <AlertTriangle size={14} /> 
                    High Priority: These users asked for payment details or showed immediate intent.
                 </div>
               )}
               {activeTab === 'stalled' && (
                 <div className="bg-orange-50 p-3 text-orange-700 text-xs border-b border-orange-100 flex items-center gap-2">
                    <DollarSign size={14} /> 
                    Price Friction: Negotiated but stopped replying. Try offering a small discount.
                 </div>
               )}
               
               {data && renderList(data[activeTab])}
             </>
          )}
        </div>
      </div>
    </div>
  );
};

export default LeadAnalysisModal;