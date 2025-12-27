import React, { useState, useRef } from 'react';
import { Product, ProductCategory } from '../types';
import { X, Plus, Trash2, Image as ImageIcon, Upload, DollarSign } from 'lucide-react';

interface ProductCatalogProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  onAddProduct: (product: Product) => void;
  onRemoveProduct: (id: string) => void;
}

const ProductCatalog: React.FC<ProductCatalogProps> = ({ isOpen, onClose, products, onAddProduct, onRemoveProduct }) => {
  const [activeCategory, setActiveCategory] = useState<ProductCategory>('Milk ATM');
  
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
    setCapacity('');
    setDescription('');
    setMinPrice('');
    setMaxPrice('');
    setImages([]);
    setMaterial('Stainless Steel');
    setOperationType('Automatic');
    setTaps('1 Tap');
    setMountType('Floor Standing');
  };

  const handleAdd = () => {
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

    const newProduct: Product = {
      id: Date.now().toString(),
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

    onAddProduct(newProduct);
    resetForm();
    alert("Product added successfully!");
  };

  // Shared CSS classes for inputs
  const inputClass = "w-full border p-2 rounded focus:outline-none focus:border-[#008069] bg-white text-gray-900 placeholder-gray-500";
  const selectClass = "w-full border p-2 rounded focus:outline-none focus:border-[#008069] bg-white text-gray-900";

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-4xl h-[90vh] rounded-lg shadow-xl flex flex-col overflow-hidden animate-fade-in">
        {/* Header */}
        <div className="bg-[#008069] text-white p-4 flex justify-between items-center">
          <h2 className="text-xl font-semibold">JohnTech Inventory Manager</h2>
          <button onClick={onClose} className="p-1 hover:bg-white/20 rounded-full">
            <X size={24} />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          
          {/* Left Panel - Add Product Form */}
          <div className="w-full md:w-1/2 p-6 overflow-y-auto border-r border-gray-200">
            <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
              <Plus size={20} className="text-[#008069]" /> Add New Product
            </h3>

            {/* Category Selector */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Product Category</label>
              <select 
                value={activeCategory} 
                onChange={(e) => setActiveCategory(e.target.value as ProductCategory)}
                className={selectClass}
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
                onClick={handleAdd}
                className="w-full bg-[#008069] text-white py-3 rounded-lg font-semibold hover:bg-[#006d59] transition-colors shadow-sm"
              >
                Add Product to Inventory
              </button>
            </div>
          </div>

          {/* Right Panel - Product List */}
          <div className="hidden md:block w-1/2 p-6 overflow-y-auto bg-gray-50">
            <h3 className="font-semibold text-gray-700 mb-4">Current Stock ({products.length})</h3>
            <div className="space-y-4">
              {products.map(product => (
                <div key={product.id} className="bg-white p-4 rounded-lg shadow-sm border border-gray-100 flex gap-4 items-start">
                  <img 
                    src={product.images[0]} 
                    alt={product.name} 
                    className="w-20 h-20 object-cover rounded-md bg-gray-100 border"
                  />
                  <div className="flex-1">
                    <span className="text-xs font-bold text-[#008069] uppercase tracking-wide">{product.category}</span>
                    <h4 className="font-bold text-gray-800 text-sm">{product.name}</h4>
                    <p className="text-gray-600 font-medium text-sm mt-1">
                      KSh {product.priceRange.min.toLocaleString()} - KSh {product.priceRange.max.toLocaleString()}
                    </p>
                    <div className="text-xs text-gray-500 mt-2 flex flex-wrap gap-2">
                      {Object.entries(product.specs).map(([key, val]) => (
                        <span key={key} className="bg-gray-100 px-2 py-0.5 rounded text-gray-600 border border-gray-200 capitalize">
                          {key}: {String(val)}
                        </span>
                      ))}
                    </div>
                  </div>
                  <button 
                    onClick={() => onRemoveProduct(product.id)}
                    className="text-red-400 hover:text-red-600 p-2"
                  >
                    <Trash2 size={20} />
                  </button>
                </div>
              ))}
              {products.length === 0 && (
                <div className="text-center py-10 text-gray-400">
                  <p>No products in inventory.</p>
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