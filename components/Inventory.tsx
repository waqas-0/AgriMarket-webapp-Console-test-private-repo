
import React, { useState, useEffect } from 'react';
import { TRANSLATIONS, PRODUCT_UNITS } from '../constants';
import { Category, Language, Product, RoleDef } from '../types';
import { Plus, Search, Sparkles, X, Edit, Trash2, AlertCircle, Printer, Minus, Tag, Image as ImageIcon, Upload, Wand2, ChevronLeft, ChevronRight } from 'lucide-react';
import { generateProductDescription, editProductImage } from '../services/geminiService';
import { api } from '../services/api';
import { uploadProductImage } from '../services/uploadProductImage';
import { isInlineImageData, resolveProductImageSrc } from '../utils/productImage';

interface InventoryProps {
  products: Product[];
  setProducts: React.Dispatch<React.SetStateAction<Product[]>>;
  categories: string[];
  lang: Language;
  currentRole: RoleDef;
}

export const Inventory: React.FC<InventoryProps> = ({ products, setProducts, categories, lang, currentRole }) => {
  const t = (key: string) => TRANSLATIONS[key][lang];
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK'>('ALL');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  
  // New State for Label Printing
  const [labelProduct, setLabelProduct] = useState<Product | null>(null);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, categoryFilter, statusFilter]);

  // Permission Check
  const canManageInventory = currentRole.permissions.includes('MANAGE_INVENTORY');

  // Form State
  const [formData, setFormData] = useState<Partial<Product>>({
    name: '',
    sku: '',
    category: categories[0] || '',
    price: 0,
    stock: 0,
    unit: PRODUCT_UNITS[0],
    description: '',
    image: '',
  });
  
  const [isGeneratingDesc, setIsGeneratingDesc] = useState(false);
  const [isEditingImage, setIsEditingImage] = useState(false);
  const [imageEditPrompt, setImageEditPrompt] = useState('');
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);
  const [pendingExtraFiles, setPendingExtraFiles] = useState<File[]>([]);

  // Access check for entire view
  if (!currentRole.permissions.includes('VIEW_INVENTORY')) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <div className="bg-red-50 p-6 rounded-full mb-4">
          <AlertCircle size={48} className="text-red-500" />
        </div>
        <h2 className="text-xl font-bold text-gray-800 mb-2">{t('accessDenied')}</h2>
        <p className="text-gray-500">{t('accessDeniedMsg')}</p>
      </div>
    );
  }

  const filteredProducts = products.filter(p => {
    // 1. Search (Name or SKU/Label)
    const matchesSearch = 
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.sku.toLowerCase().includes(searchTerm.toLowerCase());
    
    // 2. Category Filter
    const matchesCategory = categoryFilter === 'ALL' || p.category === categoryFilter;

    // 3. Status Filter
    let matchesStatus = true;
    if (statusFilter === 'LOW_STOCK') matchesStatus = p.stock < 10 && p.stock > 0;
    else if (statusFilter === 'OUT_OF_STOCK') matchesStatus = p.stock === 0;
    else if (statusFilter === 'IN_STOCK') matchesStatus = p.stock > 0;

    return matchesSearch && matchesCategory && matchesStatus;
  });

  // Pagination Logic
  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
  const paginatedProducts = filteredProducts.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const clearFilters = () => {
    setSearchTerm('');
    setCategoryFilter('ALL');
    setStatusFilter('ALL');
  };

  const handleGenerateDescription = async () => {
    if (!formData.name || !formData.category) return;
    setIsGeneratingDesc(true);
    const desc = await generateProductDescription(formData.name, formData.category, lang);
    setFormData(prev => ({ ...prev, description: desc }));
    setIsGeneratingDesc(false);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingImageFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setFormData(prev => ({ ...prev, image: reader.result as string }));
    };
    reader.readAsDataURL(file);
  };

  const resolveImageUrlForSave = async (): Promise<string[]> => {
    const urls: string[] = [];
    const uploadOne = async (file: File | null, fallbackUrl: string) => {
      if (file) {
        urls.push(await uploadProductImage(file));
        return;
      }
      const current = String(fallbackUrl ?? '').trim();
      if (isInlineImageData(current)) {
        const blob = await (async () => {
          try {
            const res = await fetch(current);
            return res.blob();
          } catch {
            return null;
          }
        })();
        if (blob) {
          const f = new File([blob], 'product-image.png', { type: blob.type || 'image/png' });
          urls.push(await uploadProductImage(f));
          return;
        }
        throw new Error('Image must be uploaded as a file. Choose a file again.');
      }
      if (current.startsWith('http://') || current.startsWith('https://')) {
        urls.push(current);
      }
    };

    const gallery = (formData.images?.length ? formData.images : [formData.image || '']).slice(0, 3);
    await uploadOne(pendingImageFile, gallery[0] || '');
    for (let i = 0; i < 2; i++) {
      const file = pendingExtraFiles[i];
      const fallback = gallery[i + 1] || '';
      if (file || fallback) await uploadOne(file ?? null, fallback);
    }
    if (!urls.length) {
      urls.push('https://placehold.co/400x400/e5e7eb/6b7280?text=Product');
    }
    return urls.slice(0, 3);
  };

  const handleEditImage = async () => {
    if (!formData.image || !imageEditPrompt) return;
    setIsEditingImage(true);
    const newImage = await editProductImage(formData.image, imageEditPrompt);
    if (newImage) {
      setFormData(prev => ({ ...prev, image: newImage }));
      setImageEditPrompt('');
    }
    setIsEditingImage(false);
  };

  const updateStock = async (id: string, change: number) => {
    if (!canManageInventory) return;
    
    // Optimistic Update can be tricky with async if failed, but for better UX:
    const product = products.find(p => p.id === id);
    if(!product) return;
    
    const newStock = Math.max(0, product.stock + change);
    
    // 1. Update UI immediately
    setProducts(prev => prev.map(p => p.id === id ? { ...p, stock: newStock } : p));
    
    // 2. Sync with API
    try {
        await api.products.updateStock(id, newStock);
    } catch (e) {
        // Revert on error
        setProducts(prev => prev.map(p => p.id === id ? { ...p, stock: product.stock } : p));
        alert("Failed to update stock on server.");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.price || formData.price <= 0) {
      alert(lang === 'fr' ? 'Le prix doit être supérieur à 0.' : 'Price must be greater than 0.');
      return;
    }
    setIsSaving(true);
    try {
        const imageUrls = await resolveImageUrlForSave();
        const payload = { ...formData, image: imageUrls[0], images: imageUrls } as Product;
        if (editingId) {
            const updated = await api.products.update({ ...payload, id: editingId });
            setProducts(prev => prev.map(p => p.id === editingId ? updated : p));
        } else {
            const created = await api.products.create(payload);
            setProducts(prev => [...prev, created]);
        }
        closeModal();
    } catch(e) {
        const msg = e instanceof Error ? e.message : 'Failed to save product.';
        alert(msg);
    } finally {
        setIsSaving(false);
    }
  };

  const openModal = (product?: Product) => {
    if (!canManageInventory) return;
    if (product) {
      setEditingId(product.id);
      setFormData({ ...product, images: product.images?.length ? product.images : [product.image].filter(Boolean) });
    } else {
      setEditingId(null);
      setFormData({
        name: '',
        sku: `SKU-${Math.floor(Math.random() * 10000)}`,
        category: categories[0] || '',
        price: 0,
        stock: 0,
        unit: PRODUCT_UNITS[0],
        description: '',
        image: '',
        images: [],
      });
    }
    setImageEditPrompt('');
    setPendingImageFile(null);
    setPendingExtraFiles([]);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
    setPendingImageFile(null);
    setPendingExtraFiles([]);
  };

  const handleExtraImageUpload = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingExtraFiles((prev) => {
      const next = [...prev];
      next[index] = file;
      return next;
    });
    const reader = new FileReader();
    reader.onloadend = () => {
      const imgs = [...(formData.images || [formData.image || ''])];
      while (imgs.length < 3) imgs.push('');
      imgs[index + 1] = reader.result as string;
      setFormData((prev) => ({ ...prev, images: imgs, image: imgs[0] || prev.image }));
    };
    reader.readAsDataURL(file);
  };

  const handleDelete = async (id: string) => {
    if (!canManageInventory) return;
    if (window.confirm('Are you sure?')) {
        try {
            await api.products.delete(id);
            setProducts(prev => prev.filter(p => p.id !== id));
        } catch(e) {
            alert("Failed to delete product.");
        }
    }
  };

  const handlePrint = () => {
    // In a real app, this would trigger window.print() with a print-specific CSS
    alert('Sent to printer!');
    setLabelProduct(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold text-gray-800">{t('inventory')}</h1>
        {canManageInventory && (
          <button 
            onClick={() => openModal()}
            className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition shadow-sm"
          >
            <Plus size={18} className="mr-2" />
            {t('addProduct')}
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {/* Filters */}
        <div className="p-4 border-b border-gray-100 bg-gray-50 flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
            <input 
              type="text" 
              placeholder={t('searchProductPlaceholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-green-500 bg-white"
            />
          </div>

          <div className="flex gap-2 overflow-x-auto no-scrollbar">
             <select 
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-4 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-green-500 bg-white text-sm whitespace-nowrap"
            >
              <option value="ALL">{t('filterByCategory')}: {t('all')}</option>
              {categories.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>

            <select 
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="px-4 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-green-500 bg-white text-sm whitespace-nowrap"
            >
              <option value="ALL">{t('filterByStatus')}: {t('all')}</option>
              <option value="IN_STOCK">{t('inStock')}</option>
              <option value="LOW_STOCK">{t('lowStock')}</option>
              <option value="OUT_OF_STOCK">{t('outOfStock')}</option>
            </select>

            {(searchTerm || categoryFilter !== 'ALL' || statusFilter !== 'ALL') && (
              <button 
                onClick={clearFilters}
                className="flex items-center px-4 py-2 text-sm text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition whitespace-nowrap"
              >
                <X size={16} className="mr-2" />
                {t('clearFilters')}
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                <th className="p-4">{t('productName')}</th>
                <th className="p-4">{t('sku')}</th>
                <th className="p-4">{t('category')}</th>
                <th className="p-4">{t('price')}</th>
                <th className="p-4 text-center">{t('stock')}</th>
                <th className="p-4 text-right">{t('actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {paginatedProducts.length > 0 ? paginatedProducts.map(product => (
                <tr key={product.id} className="hover:bg-gray-50 transition">
                  <td className="p-4 flex items-center space-x-3">
                    <img src={resolveProductImageSrc(product.image)} alt={product.name} className="w-10 h-10 rounded-lg object-cover bg-gray-200 shrink-0" />
                    <div>
                      <p className="font-medium text-gray-800 whitespace-nowrap">{product.name}</p>
                      <p className="text-xs text-gray-400 truncate max-w-[150px] md:max-w-[200px]">{product.description}</p>
                    </div>
                  </td>
                  <td className="p-4">
                     <span className="flex items-center text-xs font-mono bg-gray-100 px-2 py-1 rounded text-gray-600 whitespace-nowrap">
                        <Tag size={12} className="mr-1" />
                        {product.sku}
                     </span>
                  </td>
                  <td className="p-4">
                    <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-50 text-blue-600 whitespace-nowrap">
                      {product.category}
                    </span>
                  </td>
                  <td className="p-4 font-medium text-gray-700 whitespace-nowrap">{product.price.toLocaleString()}</td>
                  <td className="p-4">
                    <div className="flex items-center justify-center space-x-3">
                       {canManageInventory && (
                         <button 
                           onClick={() => updateStock(product.id, -1)}
                           className="w-6 h-6 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-red-100 hover:text-red-600 transition"
                         >
                           <Minus size={14} />
                         </button>
                       )}
                       <div className="text-center min-w-[60px]">
                          <span className={`text-sm font-bold block ${
                            product.stock === 0 ? 'text-gray-400' :
                            product.stock < 10 ? 'text-red-600' : 'text-gray-800'
                          }`}>
                            {product.stock} {product.unit}
                          </span>
                          {product.stock < 10 && product.stock > 0 && (
                            <span className="text-[10px] text-red-500 font-medium whitespace-nowrap">Low Stock</span>
                          )}
                          {product.stock === 0 && (
                             <span className="text-[10px] text-gray-400 font-medium whitespace-nowrap">Out of Stock</span>
                          )}
                       </div>
                       {canManageInventory && (
                         <button 
                           onClick={() => updateStock(product.id, 1)}
                           className="w-6 h-6 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-green-100 hover:text-green-600 transition"
                         >
                           <Plus size={14} />
                         </button>
                       )}
                    </div>
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex items-center justify-end space-x-2">
                       <button 
                         onClick={() => setLabelProduct(product)}
                         className="p-2 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition"
                         title={t('printLabel')}
                       >
                         <Printer size={18} />
                       </button>
                      {canManageInventory && (
                        <>
                          <button onClick={() => openModal(product)} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition">
                            <Edit size={18} />
                          </button>
                          <button onClick={() => handleDelete(product.id)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition">
                            <Trash2 size={18} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              )) : (
                <tr>
                   <td colSpan={6} className="p-8 text-center text-gray-500">
                      No products found matching your filters.
                   </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {/* Pagination reused from previous version */}
        {totalPages > 1 && (
          <div className="flex justify-center items-center space-x-4 p-4 border-t border-gray-100">
            <button 
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="flex items-center px-4 py-2 bg-white border border-gray-200 rounded-lg text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition"
            >
              <ChevronLeft size={16} className="mr-2" />
              {t('previous')}
            </button>
            <span className="text-sm font-medium text-gray-600">
              {t('page')} {currentPage} {t('of')} {totalPages}
            </span>
            <button 
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="flex items-center px-4 py-2 bg-white border border-gray-200 rounded-lg text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition"
            >
              {t('next')}
              <ChevronRight size={16} className="ml-2" />
            </button>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {isModalOpen && canManageInventory && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
             <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[90dvh] overflow-y-auto">
               <div className="p-6 border-b border-gray-100 flex justify-between items-center sticky top-0 bg-white z-10">
                 <h2 className="text-xl font-bold">{editingId ? 'Edit Product' : t('addProduct')}</h2>
                 <button onClick={closeModal} className="text-gray-400 hover:text-gray-600">
                   <X size={24} />
                 </button>
               </div>
               
               <form onSubmit={handleSubmit} className="p-6 space-y-4">
                 
                 {/* Image Upload & Edit Section */}
                 <div className="flex flex-col items-center gap-4 mb-2">
                   <div className="w-full flex justify-center">
                     <div className="w-40 h-40 bg-gray-50 rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center overflow-hidden relative group">
                       {formData.image ? (
                         <img src={resolveProductImageSrc(formData.image)} alt="Preview" className="w-full h-full object-cover" />
                       ) : (
                         <div className="text-center p-4">
                           <ImageIcon className="mx-auto text-gray-400 mb-2" size={24} />
                           <span className="text-xs text-gray-400">No image</span>
                         </div>
                       )}
                       <label className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center cursor-pointer text-white font-medium text-sm">
                          <Upload size={16} className="mr-2" />
                          {t('uploadImage')}
                          <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                       </label>
                     </div>
                   </div>
                   <p className="text-xs text-gray-500">Up to 3 images (primary + 2 optional)</p>
                   <div className="flex gap-3 w-full justify-center">
                     {[0, 1].map((slot) => (
                       <label key={slot} className="w-20 h-20 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center cursor-pointer overflow-hidden bg-gray-50 hover:border-green-400">
                         {(formData.images?.[slot + 1] || pendingExtraFiles[slot]) ? (
                           <img src={resolveProductImageSrc(formData.images?.[slot + 1] || '')} alt="" className="w-full h-full object-cover" />
                         ) : (
                           <Plus size={20} className="text-gray-400" />
                         )}
                         <input type="file" accept="image/*" className="hidden" onChange={(e) => handleExtraImageUpload(slot, e)} />
                       </label>
                     ))}
                   </div>

                   {formData.image && (
                     <div className="w-full bg-purple-50 p-3 rounded-xl border border-purple-100">
                       <div className="flex items-center gap-2">
                          <input 
                            type="text" 
                            value={imageEditPrompt} 
                            onChange={(e) => setImageEditPrompt(e.target.value)}
                            placeholder={t('editPlaceholder')}
                            className="flex-1 text-sm border-gray-300 rounded-lg px-3 py-1.5 outline-none focus:ring-1 focus:ring-purple-500"
                          />
                          <button
                            type="button"
                            onClick={handleEditImage}
                            disabled={!imageEditPrompt || isEditingImage}
                            className="bg-purple-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-purple-700 transition disabled:opacity-50 flex items-center"
                          >
                            {isEditingImage ? (
                              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            ) : (
                              <>
                                <Wand2 size={14} className="mr-1" />
                                {t('applyEdit')}
                              </>
                            )}
                          </button>
                       </div>
                     </div>
                   )}
                 </div>

                 <div className="grid grid-cols-2 gap-4">
                   <div>
                     <label className="block text-sm font-medium text-gray-700 mb-1">{t('productName')}</label>
                     <input 
                       required
                       type="text" 
                       value={formData.name}
                       onChange={e => setFormData({...formData, name: e.target.value})}
                       className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 outline-none transition"
                     />
                   </div>
                   <div>
                     <label className="block text-sm font-medium text-gray-700 mb-1">{t('sku')}</label>
                     <input 
                       required
                       type="text" 
                       value={formData.sku}
                       onChange={e => setFormData({...formData, sku: e.target.value})}
                       className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 outline-none transition font-mono"
                     />
                   </div>
                 </div>

                 <div className="grid grid-cols-2 gap-4">
                   <div>
                     <label className="block text-sm font-medium text-gray-700 mb-1">{t('category')}</label>
                     <select 
                       value={formData.category}
                       onChange={e => setFormData({...formData, category: e.target.value})}
                       className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white"
                     >
                       {categories.map(c => (
                         <option key={c} value={c}>{c}</option>
                       ))}
                     </select>
                   </div>
                   <div>
                     <label className="block text-sm font-medium text-gray-700 mb-1">{t('price')}</label>
                     <input 
                       required
                       type="number"
                       min="0.01"
                       step="0.01"
                       placeholder="0"
                       value={formData.price && formData.price > 0 ? formData.price : ''}
                       onChange={e => {
                         const raw = e.target.value;
                         if (raw === '') {
                           setFormData({ ...formData, price: 0 });
                           return;
                         }
                         const normalized = raw.replace(/^0+(?=\d)/, '');
                         const num = parseFloat(normalized);
                         if (!Number.isNaN(num)) {
                           setFormData({ ...formData, price: num });
                         }
                       }}
                       className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
                     />
                   </div>
                 </div>

                 <div className="grid grid-cols-2 gap-4">
                    <div>
                     <label className="block text-sm font-medium text-gray-700 mb-1">{t('stock')}</label>
                     <input 
                       required
                       type="number"
                       min="0"
                       step="1"
                       placeholder="0"
                       value={formData.stock === 0 && !editingId ? '' : (formData.stock ?? '')}
                       onChange={e => {
                         const raw = e.target.value;
                         if (raw === '') {
                           setFormData({ ...formData, stock: 0 });
                           return;
                         }
                         const normalized = raw.replace(/^0+(?=\d)/, '');
                         const num = parseInt(normalized, 10);
                         if (!Number.isNaN(num)) {
                           setFormData({ ...formData, stock: num });
                         }
                       }}
                       className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
                     />
                   </div>
                   <div>
                     <label className="block text-sm font-medium text-gray-700 mb-1">{t('unit')}</label>
                     <select
                       value={formData.unit}
                       onChange={e => setFormData({...formData, unit: e.target.value})}
                       className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white"
                     >
                       {PRODUCT_UNITS.map(u => (
                         <option key={u} value={u}>{u}</option>
                       ))}
                     </select>
                   </div>
                 </div>

                 <div>
                   <div className="flex justify-between items-center mb-1">
                      <label className="block text-sm font-medium text-gray-700">{t('description')}</label>
                      <button 
                        type="button"
                        onClick={handleGenerateDescription}
                        disabled={isGeneratingDesc || !formData.name}
                        className="text-xs flex items-center text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
                      >
                        <Sparkles size={14} className="mr-1" />
                        {isGeneratingDesc ? t('analyzing') : t('generateDesc')}
                      </button>
                   </div>
                   <textarea 
                     rows={3}
                     value={formData.description}
                     onChange={e => setFormData({...formData, description: e.target.value})}
                     className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
                   />
                 </div>

                 <div className="pt-4 flex space-x-3">
                   <button 
                     type="button" 
                     onClick={closeModal}
                     className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition"
                   >
                     {t('cancel')}
                   </button>
                   <button 
                     type="submit"
                     disabled={isSaving}
                     className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition flex items-center justify-center disabled:opacity-70"
                   >
                     {isSaving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : t('save')}
                   </button>
                 </div>

               </form>
             </div>
          </div>
      )}
       {/* Label Preview Modal */}
       {labelProduct && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
           <div className="bg-white rounded-xl shadow-2xl overflow-hidden w-80 max-h-[90dvh] overflow-y-auto">
              <div className="p-4 bg-gray-50 border-b flex justify-between items-center">
                 <h3 className="font-bold text-gray-700">{t('labelPreview')}</h3>
                 <button onClick={() => setLabelProduct(null)} className="text-gray-400 hover:text-gray-600">
                   <X size={20} />
                 </button>
              </div>
              <div className="p-6 flex flex-col items-center">
                 <div className="w-64 h-auto border-2 border-black p-4 rounded-lg bg-white relative shadow-lg">
                    <div className="text-center border-b-2 border-black pb-2 mb-2">
                       <h2 className="font-bold text-lg uppercase tracking-wider">AgriMarket</h2>
                    </div>
                    <div className="flex justify-between items-start mb-4">
                       <div className="flex-1">
                          <h3 className="font-bold text-lg leading-tight mb-1">{labelProduct.name}</h3>
                          <p className="text-xs text-gray-500">{labelProduct.category}</p>
                       </div>
                       <div className="text-right">
                          <span className="block font-bold text-xl">{labelProduct.price}</span>
                          <span className="text-[10px] uppercase">FCFA</span>
                       </div>
                    </div>
                    <div className="flex justify-between items-end">
                       <div>
                          <p className="text-[10px] text-gray-400 mb-0.5">SKU</p>
                          <p className="font-mono font-bold text-sm">{labelProduct.sku}</p>
                       </div>
                       {/* QR Code Simulation */}
                       <img 
                         src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${labelProduct.sku}`} 
                         alt="QR Code" 
                         className="w-16 h-16"
                       />
                    </div>
                 </div>
                 
                 <div className="mt-6 w-full flex space-x-3">
                   <button 
                     onClick={() => setLabelProduct(null)}
                     className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                   >
                     {t('close')}
                   </button>
                   <button 
                     onClick={handlePrint}
                     className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center justify-center"
                   >
                     <Printer size={18} className="mr-2" />
                     {t('print')}
                   </button>
                 </div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};
