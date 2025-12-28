import React, { useState, useRef } from 'react';
import { Product, ProductCategory } from '../types';
import { X, Plus, Trash2, Upload, Pencil, Save, Ban, LayoutList, PlusCircle } from 'lucide-react';

interface ProductCatalogProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  onAddProduct: (product: Product) => void;
  onUpdateProduct: (product: Product) => void;
  onRemoveProduct: (id: string) => void;
}

const ProductCatalog: React.FC<ProductCatalogProps> = ({ isOpen, onClose, products, onAddProduct, onUpdateProduct, onRemoveProduct }) => {
  const [activeCategory, setActiveCategory] = useState<ProductCategory>('Milk ATM');
  
  // Edit Mode & UI State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<'form' | 'list'>('list'); // Default to list on mobile

  // Form States
  const [capacity, setCapacity] = useState('');
  const [material, setMaterial] = useState<'Stainless Steel' | 'Non-Stainless Steel'>('Stainless Steel');
  const [operationType, setOperationType] = useState<'Automatic' | 'Manual'>('Automatic');
  const [taps, setTaps] = useState<'1 Tap' | '2 Taps'>('1 Tap');
  const [mountType, setMountType] = useState<'Floor Standing' | 'Wall Mount'>('Floor Standing');
  
  const [description, setDescription] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      if (images.length + e.target.files.length > 5) {
        alert("You can only upload up to 5 images per product.");
        return;
      }

      Array.from(e.target.files).forEach(file => {
        const reader = new FileReader();
        reader.onloadend = () => {
          setImages(prev => [...prev, reader.result as string]);
        };
        // Fix for TypeScript error: cast file to Blob
        reader.readAsDataURL(file as unknown as Blob);
      });
    }
  };

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  const resetForm = () => {
    setEditingId(null);
    setCapacity('');
    setDescription('');
    setMinPrice('');
    setMaxPrice('');
    setImages([]);
    setMaterial('Stainless Steel');
    setOperationType('Automatic');
    setTaps('1 Tap');
    setMountType('Floor Standing');
    // Keep category for convenience
  };

  const startEditing = (product: Product) => {
    setEditingId(product.id);
    setActiveCategory(product.category);
    setDescription(product.description);
    setMinPrice(product.priceRange.min.toString());
    setMaxPrice(product.priceRange.max.toString());
    setImages(product.images);

    // Extract specs safely
    const specs = product.specs;
    if (specs.capacity) {
        const cap = parseFloat(specs.capacity);
        setCapacity(isNaN(cap) ? '' : cap.toString());
    }
    if (specs.material) setMaterial(specs.material);
    if (specs.operationType) setOperationType(specs.operationType);
    if (specs.taps) setTaps(specs.taps);
    if (specs.mountType) setMountType(specs.mountType);

    // Switch view on mobile
    setMobileTab('form');
  };

  const handleSubmit = () => {
    // Validation
    if (!description.trim()) {
      alert("Description is mandatory.");
      return;
    }
    if (images.length === 0) {
      alert("At least one image is required.");
      return;
    }
    if (!minPrice || !maxPrice) {
      alert("Please specify a price range.");
      return;
    }

    let productSpecs: any = {};
    let generatedName = '';

    // Construct Specs and Name based on Category
    switch (activeCategory) {
      case 'Milk ATM':
        if (!capacity) { alert("Capacity is required for Milk ATM"); return; }
        productSpecs = { capacity: `${capacity} Litres` };
        generatedName = `Milk ATM - ${capacity}L (Automatic)`;
        break;

      case 'Oil ATM':
        if (!capacity) { alert("Capacity is required for Oil ATM"); return; }
        productSpecs = { capacity: `${capacity} Litres`, material };
        generatedName = `Oil/Salad ATM - ${capacity}L ${material}`;
        break;

      case 'Water Vending':
        productSpecs = { operationType, taps, mountType };
        generatedName = `Water Vending - ${taps}, ${operationType} (${mountType})`;
        break;

      case 'Reverse Osmosis':
        if (!capacity) { alert("Capacity (LPH) is required"); return; }
        productSpecs = { capacity: `${capacity} LPH` };
        generatedName = `Reverse Osmosis System - ${capacity} LPH`;
        break;
    }

    const productData: Product = {
      id: editingId || Date.now().toString(),
      category: activeCategory,
      name: generatedName,
      description,
      priceRange: {
        min: Number(minPrice),
        max: Number(maxPrice)
      },
      images: images,
      specs: productSpecs
    };

    if (editingId) {
        onUpdateProduct(productData);
        alert("Product updated successfully!");
    } else {
        onAddProduct(productData);
        alert("Product added successfully!");
    }
    
    resetForm();
    setMobileTab('list'); // Go back to list on mobile
  };

  // Shared CSS classes for inputs
  const inputClass = "w-full border p-2 rounded focus:outline-none focus:border-[#008069] bg-white text-gray-900 placeholder-gray-500";
  const selectClass = "w-full border p-2 rounded focus:outline-none focus:border-[#008069] bg-white text-gray-900";

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-5xl h-[90vh] rounded-lg shadow-xl flex flex-col overflow-hidden animate-fade-in">
        {/* Header */}
        <div className="bg-[#008069] text-white p-4 flex justify-between items-center shadow-md z-10">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            Inventory Manager
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-white/20 rounded-full">
            <X size={24} />
          </button>
        </div>

        {/* Mobile Tabs */}
        <div className="md:hidden flex border-b border-gray-200 bg-gray-50">
            <button 
                onClick={() => setMobileTab('list')}
                className={`flex-1 py-3 text-sm font-semibold flex items-center justify-center gap-2 ${mobileTab === 'list' ? 'bg-white text-[#008069] border-b-2 border-[#008069]' : 'text-gray-500'}`}
            >
                <LayoutList size={18} /> Inventory
            </button>
            <button 
                onClick={() => { setMobileTab('form'); if(!editingId) resetForm(); }}
                className={`flex-1 py-3 text-sm font-semibold flex items-center justify-center gap-2 ${mobileTab === 'form' ? 'bg-white text-[#008069] border-b-2 border-[#008069]' : 'text-gray-500'}`}
            >
                {editingId ? <Pencil size={18} /> : <PlusCircle size={18} />} 
                {editingId ? 'Edit Item' : 'Add New'}
            </button>
        </div>

        <div className="flex flex-1 overflow-hidden relative">
          
          {/* Left Panel - Form */}
          <div className={`
            w-full md:w-5/12 p-6 overflow-y-auto border-r border-gray-200 bg-white absolute md:relative inset-0 z-10 transition-transform duration-300 md:translate-x-0
            ${mobileTab === 'form' ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
          `}>
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                {editingId ? <Pencil size={20} className="text-blue-600" /> : <Plus size={20} className="text-[#008069]" />} 
                {editingId ? 'Edit Product' : 'Add New Product'}
                </h3>
                {editingId && (
                    <button onClick={resetForm} className="text-xs text-red-500 hover:text-red-700 font-semibold flex items-center gap-1">
                        <Ban size={14} /> Cancel Edit
                    </button>
                )}
            </div>

            {/* Category Selector */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Product Category</label>
              <select 
                value={activeCategory} 
                onChange={(e) => setActiveCategory(e.target.value as ProductCategory)}
                className={selectClass}
                disabled={!!editingId} // Disable category switch when editing
              >
                <option value="Milk ATM">Milk ATM</option>
                <option value="Oil ATM">Oil ATM (Salad ATM)</option>
                <option value="Water Vending">Water Vending</option>
                <option value="Reverse Osmosis">Reverse Osmosis</option>
              </select>
            </div>

            {/* Dynamic Fields */}
            <div className="bg-gray-50 p-4 rounded-lg mb-4 border border-gray-200">
              {activeCategory === 'Milk ATM' && (
                <div>
                   <label className="block text-sm font-medium text-gray-700 mb-1">Capacity (Litres)</label>
                   <input type="number" value={capacity} onChange={e => setCapacity(e.target.value)} className={`${inputClass} mb-2`} placeholder="e.g. 100" />
                   <p className="text-xs text-gray-500">* System is Automatic by default.</p>
                </div>
              )}

              {activeCategory === 'Oil ATM' && (
                <div className="flex flex-col gap-3">
                   <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Capacity (Litres)</label>
                      <input type="number" value={capacity} onChange={e => setCapacity(e.target.value)} className={inputClass} placeholder="e.g. 50" />
                   </div>
                   <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Material</label>
                      <select value={material} onChange={(e: any) => setMaterial(e.target.value)} className={selectClass}>
                        <option value="Stainless Steel">Stainless Steel</option>
                        <option value="Non-Stainless Steel">Non-Stainless Steel</option>
                      </select>
                   </div>
                </div>
              )}

              {activeCategory === 'Water Vending' && (
                <div className="flex flex-col gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Operation</label>
                    <select value={operationType} onChange={(e: any) => setOperationType(e.target.value)} className={selectClass}>
                        <option value="Automatic">Automatic</option>
                        <option value="Manual">Manual</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Taps</label>
                    <select value={taps} onChange={(e: any) => setTaps(e.target.value)} className={selectClass}>
                        <option value="1 Tap">1 Tap</option>
                        <option value="2 Taps">2 Taps</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Mount Type</label>
                    <select value={mountType} onChange={(e: any) => setMountType(e.target.value)} className={selectClass}>
                        <option value="Floor Standing">Floor Standing</option>
                        <option value="Wall Mount">Wall Mount</option>
                    </select>
                  </div>
                </div>
              )}

              {activeCategory === 'Reverse Osmosis' && (
                 <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Capacity (Litres Per Hour)</label>
                    <input type="number" value={capacity} onChange={e => setCapacity(e.target.value)} className={inputClass} placeholder="e.g. 250" />
                 </div>
              )}
            </div>

            {/* Common Fields */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Price Range (For Bargaining)</label>
                <div className="flex gap-2 items-center">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-2 text-gray-500 text-sm font-medium">KSh</span>
                    <input type="number" value={minPrice} onChange={e => setMinPrice(e.target.value)} className={`${inputClass} pl-12`} placeholder="Start" />
                  </div>
                  <span className="text-gray-500">-</span>
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-2 text-gray-500 text-sm font-medium">KSh</span>
                    <input type="number" value={maxPrice} onChange={e => setMaxPrice(e.target.value)} className={`${inputClass} pl-12`} placeholder="End" />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description <span className="text-red-500">*</span></label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  className={`${inputClass} h-24 resize-none`}
                  placeholder="Detailed description of the product..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Product Images (Max 5) <span className="text-red-500">*</span></label>
                <input 
                  type="file" 
                  accept="image/*" 
                  multiple 
                  ref={fileInputRef} 
                  onChange={handleImageUpload} 
                  className="hidden" 
                />
                <div className="flex flex-wrap gap-2 mt-2">
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="w-20 h-20 border-2 border-dashed border-gray-300 rounded flex flex-col items-center justify-center text-gray-500 hover:border-[#008069] hover:text-[#008069]"
                  >
                    <Upload size={20} />
                    <span className="text-xs mt-1">Upload</span>
                  </button>
                  {images.map((img, idx) => (
                    <div key={idx} className="relative w-20 h-20 group">
                      <img src={img} alt="Product" className="w-full h-full object-cover rounded border border-gray-200" />
                      <button 
                        onClick={() => removeImage(idx)}
                        className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <button 
                onClick={handleSubmit}
                className={`w-full py-3 rounded-lg font-semibold transition-colors shadow-sm flex items-center justify-center gap-2
                  ${editingId 
                    ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                    : 'bg-[#008069] hover:bg-[#006d59] text-white'}
                `}
              >
                {editingId ? <><Save size={20} /> Update Product</> : <><Plus size={20} /> Add Product to Inventory</>}
              </button>
            </div>
          </div>

          {/* Right Panel - Product List */}
          <div className={`
            w-full md:w-7/12 p-6 overflow-y-auto bg-gray-50 absolute md:relative inset-0 z-0 transition-transform duration-300 md:translate-x-0
            ${mobileTab === 'list' ? 'translate-x-0' : 'translate-x-full md:translate-x-0'}
          `}>
            <div className="flex justify-between items-center mb-4">
               <h3 className="font-semibold text-gray-700">Current Inventory ({products.length})</h3>
               <button onClick={() => setMobileTab('form')} className="md:hidden text-[#008069] font-bold text-sm">
                 + Add New
               </button>
            </div>
            
            <div className="space-y-4 pb-20 md:pb-0">
              {products.map(product => (
                <div key={product.id} className={`bg-white p-4 rounded-lg shadow-sm border flex gap-4 items-start ${editingId === product.id ? 'border-blue-500 ring-1 ring-blue-500' : 'border-gray-100'}`}>
                  <img 
                    src={product.images[0]} 
                    alt={product.name} 
                    className="w-20 h-20 object-cover rounded-md bg-gray-100 border"
                  />
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-bold text-[#008069] uppercase tracking-wide">{product.category}</span>
                    <h4 className="font-bold text-gray-800 text-sm truncate">{product.name}</h4>
                    <p className="text-gray-600 font-medium text-sm mt-1">
                      KSh {product.priceRange.min.toLocaleString()} - {product.priceRange.max.toLocaleString()}
                    </p>
                    <div className="text-xs text-gray-500 mt-2 flex flex-wrap gap-2">
                      {Object.entries(product.specs).map(([key, val]) => (
                        <span key={key} className="bg-gray-100 px-2 py-0.5 rounded text-gray-600 border border-gray-200 capitalize">
                          {key}: {String(val)}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                      <button 
                        onClick={() => startEditing(product)}
                        className="text-blue-500 hover:text-blue-700 p-2 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                        title="Edit Product"
                      >
                        <Pencil size={18} />
                      </button>
                      <button 
                        onClick={() => {
                            if(confirm('Are you sure you want to delete this product?')) {
                                onRemoveProduct(product.id);
                                if(editingId === product.id) resetForm();
                            }
                        }}
                        className="text-red-400 hover:text-red-600 p-2 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
                        title="Delete Product"
                      >
                        <Trash2 size={18} />
                      </button>
                  </div>
                </div>
              ))}
              {products.length === 0 && (
                <div className="text-center py-20 text-gray-400">
                  <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-4">
                    <LayoutList size={32} />
                  </div>
                  <p>No products in inventory.</p>
                  <button onClick={() => setMobileTab('form')} className="mt-4 text-[#008069] font-semibold md:hidden">
                    Add your first product
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductCatalog;