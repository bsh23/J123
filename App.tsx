import React, { useState, useEffect } from 'react';
import WhatsAppUI from './components/WhatsAppUI';
import ProductCatalog from './components/ProductCatalog';
import SettingsModal from './components/SettingsModal';
import { Product } from './types';

const App: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [isCatalogOpen, setIsCatalogOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  
  // Track loading state: 'init', 'success', 'error'
  const [loadStatus, setLoadStatus] = useState<'init' | 'success' | 'error'>('init');
  // Track save state: 'idle', 'saving', 'saved', 'error'
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // 1. Load products from Server on startup
  useEffect(() => {
    const fetchInventory = async () => {
      try {
        const res = await fetch('/api/products');
        if (!res.ok) throw new Error(`Server returned status: ${res.status}`);
        const text = await res.text();
        let data;
        try { data = JSON.parse(text); } catch (e) { throw new Error("Invalid JSON received"); }

        if (Array.isArray(data)) {
          setProducts(data);
          setLoadStatus('success');
        } else {
          setProducts([]); 
          setLoadStatus('success');
        }
      } catch (err) {
        console.error('❌ Failed to fetch inventory:', err);
        setLoadStatus('error');
      }
    };
    fetchInventory();
  }, []);

  // CRUD HANDLERS
  const handleAddProduct = async (product: Product): Promise<boolean> => {
    setSaveStatus('saving');
    try {
        const res = await fetch('/api/product', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(product)
        });
        if (!res.ok) throw new Error("Failed to add");
        
        setProducts(prev => [...prev, product]);
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
        return true;
    } catch (err) {
        console.error(err);
        setSaveStatus('error');
        return false;
    }
  };

  const handleUpdateProduct = async (updatedProduct: Product): Promise<boolean> => {
    setSaveStatus('saving');
    try {
        const res = await fetch(`/api/product/${updatedProduct.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatedProduct)
        });
        if (!res.ok) throw new Error("Failed to update");

        setProducts(prev => prev.map(p => p.id === updatedProduct.id ? updatedProduct : p));
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
        return true;
    } catch (err) {
        console.error(err);
        setSaveStatus('error');
        return false;
    }
  };

  const handleRemoveProduct = async (id: string): Promise<boolean> => {
    setSaveStatus('saving');
    try {
        const res = await fetch(`/api/product/${id}`, {
            method: 'DELETE'
        });
        if (!res.ok) throw new Error("Failed to delete");

        setProducts(prev => prev.filter(p => p.id !== id));
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
        return true;
    } catch (err) {
        console.error(err);
        setSaveStatus('error');
        return false;
    }
  };

  return (
    <div className="h-screen bg-[#d1d7db] flex items-center justify-center relative overflow-hidden">
      <div className="absolute top-0 w-full h-32 bg-[#00a884] z-0"></div>
      
      {/* Save Status Indicator */}
      <div className="absolute top-4 right-4 z-50 pointer-events-none">
         {saveStatus === 'saving' && <div className="bg-blue-600 text-white px-3 py-1 rounded-full text-xs shadow animate-pulse font-medium">Syncing with server...</div>}
         {saveStatus === 'saved' && <div className="bg-green-600 text-white px-3 py-1 rounded-full text-xs shadow font-medium">Sync Complete</div>}
         {saveStatus === 'error' && <div className="bg-red-600 text-white px-3 py-1 rounded-full text-xs shadow animate-bounce font-medium">Sync Failed!</div>}
      </div>

      <div className="w-full h-full md:h-[95%] md:w-[95%] z-10 relative">
        <WhatsAppUI 
          products={products}
          openCatalog={() => setIsCatalogOpen(true)}
          openSettings={() => setIsSettingsOpen(true)}
          openAnalysis={() => {}} // No-op, managed internally now
        />
      </div>

      <ProductCatalog 
        isOpen={isCatalogOpen}
        onClose={() => setIsCatalogOpen(false)}
        products={products}
        onAddProduct={handleAddProduct}
        onUpdateProduct={handleUpdateProduct}
        onRemoveProduct={handleRemoveProduct}
      />

      <SettingsModal 
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
      
      {loadStatus === 'error' && (
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-red-600 text-white px-4 py-2 rounded-full shadow-lg text-sm flex items-center gap-2 z-50 animate-bounce">
          <span>⚠️ Connection lost. Changes may not save.</span>
          <button onClick={() => window.location.reload()} className="underline font-bold">Retry</button>
        </div>
      )}
    </div>
  );
};

export default App;