import React, { useState, useEffect } from 'react';
import { X, Server, Shield, Smartphone, Key, Loader2, CheckCircle, AlertCircle } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const [config, setConfig] = useState({
    appId: '',
    appSecret: '',
    accessToken: '',
    phoneNumberId: '',
    businessAccountId: '',
    verifyToken: 'johntech_verify_token'
  });

  const [status, setStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [feedbackMsg, setFeedbackMsg] = useState('');

  // Load from Server on Open
  useEffect(() => {
    if (isOpen) {
      setStatus('idle');
      setFeedbackMsg('');
      
      // Attempt to fetch current config (non-sensitive parts)
      fetch('/api/settings')
        .then(res => res.json())
        .then(data => {
           setConfig(prev => ({
             ...prev,
             phoneNumberId: data.phoneNumberId || '',
             businessAccountId: data.businessAccountId || '',
             appId: data.appId || '',
             verifyToken: data.verifyToken || 'johntech_verify_token'
           }));
        })
        .catch(err => console.error("Could not fetch settings", err));
        
      // Also check local storage for full persistence in UI
      const local = localStorage.getItem('johntech_meta_config');
      if (local) {
        const parsed = JSON.parse(local);
        setConfig(prev => ({ ...prev, ...parsed }));
      }
    }
  }, [isOpen]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setConfig(prev => ({ ...prev, [name]: value }));
    if (status !== 'idle') {
      setStatus('idle');
      setFeedbackMsg('');
    }
  };

  const handleVerifyAndSave = async () => {
    if (!config.accessToken || !config.phoneNumberId) {
       setStatus('error');
       setFeedbackMsg('Access Token and Phone Number ID are required.');
       return;
    }

    setStatus('testing');
    setFeedbackMsg('Testing connection to Meta API...');

    try {
      // 1. Verify with Meta
      const verifyRes = await fetch('/api/verify-meta-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessToken: config.accessToken,
          phoneNumberId: config.phoneNumberId
        })
      });
      const verifyData = await verifyRes.json();

      if (!verifyData.success) {
        throw new Error(verifyData.message || 'Meta verification failed.');
      }

      // 2. Save to Server (Critical step)
      const saveRes = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      
      if (!saveRes.ok) throw new Error("Failed to save to server.");

      // 3. Save to LocalStorage (Backup)
      localStorage.setItem('johntech_meta_config', JSON.stringify(config));

      setStatus('success');
      setFeedbackMsg('Verified & Saved! Server is updated.');
      
      setTimeout(() => {
        onClose();
      }, 1500);

    } catch (error: any) {
      setStatus('error');
      setFeedbackMsg(error.message || 'Error occurred.');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white w-full max-w-2xl rounded-lg shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="bg-[#008069] text-white p-4 flex justify-between items-center">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Server size={24} /> API Configuration
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-white/20 rounded-full">
            <X size={24} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto">
          <p className="text-gray-600 mb-6 text-sm bg-blue-50 p-3 rounded border border-blue-100">
            <strong>Action Required:</strong> Enter your Meta Developer credentials below. These will be saved to the server to enable the WhatsApp Chatbot.
          </p>

          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">App ID</label>
                <input type="text" name="appId" value={config.appId} onChange={handleChange} className="w-full border p-2 rounded focus:border-[#008069]" placeholder="e.g. 1234567890" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">App Secret</label>
                <input type="password" name="appSecret" value={config.appSecret} onChange={handleChange} className="w-full border p-2 rounded focus:border-[#008069]" placeholder="••••••••" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Permanent Access Token <span className="text-red-500">*</span></label>
              <input type="password" name="accessToken" value={config.accessToken} onChange={handleChange} className="w-full border p-2 rounded focus:border-[#008069] font-mono text-sm" placeholder="EAAG..." />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number ID <span className="text-red-500">*</span></label>
                <input type="text" name="phoneNumberId" value={config.phoneNumberId} onChange={handleChange} className="w-full border p-2 rounded focus:border-[#008069]" placeholder="e.g. 100000001" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Webhook Verify Token</label>
                <input type="text" name="verifyToken" value={config.verifyToken} onChange={handleChange} className="w-full border p-2 rounded focus:border-[#008069]" placeholder="johntech_verify_token" />
              </div>
            </div>
            
            {status !== 'idle' && (
              <div className={`p-3 rounded-lg flex items-start gap-2 text-sm
                ${status === 'testing' ? 'bg-blue-50 text-blue-700' : ''}
                ${status === 'success' ? 'bg-green-50 text-green-700' : ''}
                ${status === 'error' ? 'bg-red-50 text-red-700' : ''}
              `}>
                {status === 'testing' && <Loader2 size={18} className="animate-spin" />}
                {status === 'success' && <CheckCircle size={18} />}
                {status === 'error' && <AlertCircle size={18} />}
                <span>{feedbackMsg}</span>
              </div>
            )}
          </div>
        </div>

        <div className="bg-gray-50 p-4 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:text-gray-800">Cancel</button>
          <button 
            onClick={handleVerifyAndSave}
            disabled={status === 'testing'}
            className={`bg-[#008069] text-white px-6 py-2 rounded shadow-sm ${status === 'testing' ? 'opacity-70' : 'hover:bg-[#006d59]'}`}
          >
            {status === 'testing' ? 'Verifying...' : 'Verify & Save'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;