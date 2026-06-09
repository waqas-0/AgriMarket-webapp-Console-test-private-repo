
import React, { useMemo, useState, useEffect } from 'react';
import { TRANSLATIONS } from '../constants';
import { Language, Order, Customer, OrderStatus, RoleDef } from '../types';
import { Search, MapPin, Phone, User, ArrowLeft, RefreshCcw, XCircle, AlertCircle, ShoppingBag, Filter, X, ChevronLeft, ChevronRight, Edit, Mail, Upload, Camera, ImageIcon, ExternalLink } from 'lucide-react';
import { api } from '../services/api';

const mapsLink = (lat?: number, lng?: number, address?: string) => {
  if (lat != null && lng != null && (lat !== 0 || lng !== 0)) {
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  }
  if (address?.trim()) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address.trim())}`;
  }
  return '';
};

interface CustomersProps {
  orders: Order[];
  setOrders: React.Dispatch<React.SetStateAction<Order[]>>;
  customers: Customer[];
  setCustomers: React.Dispatch<React.SetStateAction<Customer[]>>;
  lang: Language;
  currentRole: RoleDef;
}

export const Customers: React.FC<CustomersProps> = ({ orders, setOrders, customers, setCustomers, lang, currentRole }) => {
  const t = (key: string) => TRANSLATIONS[key][lang];
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'Active' | 'Inactive'>('ALL');
  const [locationFilter, setLocationFilter] = useState<string>('ALL');
  const [selectedCustomerPhone, setSelectedCustomerPhone] = useState<string | null>(null);

  // Edit Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [formData, setFormData] = useState<Partial<Customer>>({});


  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, locationFilter]);

  // Access check
  if (!currentRole.permissions.includes('VIEW_CUSTOMERS')) {
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
  
  const canManageOrders = currentRole.permissions.includes('MANAGE_ORDERS');
  const canManageCustomers = currentRole.permissions.includes('MANAGE_CUSTOMERS');

  // Derive customers display list (merge static customer data with dynamic order stats)
  const displayCustomers: Customer[] = useMemo(() => {
    // 1. Map existing customers to a dictionary for easy access
    const customerMap = new Map<string, Customer>();
    customers.forEach(c => customerMap.set(c.phone, { ...c, totalOrders: 0, totalSpent: 0, lastOrderDate: '' }));

    // 2. Aggregate stats from orders
    orders.forEach(order => {
        const phone = order.customerPhone;
        // If customer doesn't exist in our record (e.g. from new order), create a temp one
        if (!customerMap.has(phone)) {
            // Split name best effort
            const parts = order.customerName.split(' ');
            const lastName = parts.length > 1 ? parts.pop()! : '';
            const firstName = parts.join(' ');
            
            customerMap.set(phone, {
                id: phone,
                firstName,
                lastName,
                phone: order.customerPhone,
                location: order.location,
                totalOrders: 0,
                totalSpent: 0,
                lastOrderDate: order.date,
                status: 'Active' // Default
            });
        }

        const customer = customerMap.get(phone)!;
        
        if (order.status !== OrderStatus.CANCELLED && order.status !== OrderStatus.REFUNDED) {
            customer.totalSpent = (customer.totalSpent || 0) + order.totalAmount;
        }
        customer.totalOrders = (customer.totalOrders || 0) + 1;
        
        if (!customer.lastOrderDate || new Date(order.date) > new Date(customer.lastOrderDate)) {
            customer.lastOrderDate = order.date;
        }
    });

    const list = Array.from(customerMap.values());
    
    // Recalculate Active/Inactive status based on spending
    return list.map(c => ({
        ...c,
        status: (c.totalSpent || 0) >= 5000 ? 'Active' : 'Inactive'
    }));
  }, [orders, customers]);

  const uniqueLocations = useMemo(() => {
    return Array.from(new Set(displayCustomers.map(c => c.location))).sort();
  }, [displayCustomers]);

  const filteredCustomers = displayCustomers.filter(c => {
    const fullName = `${c.firstName} ${c.lastName}`.trim();
    const matchesSearch = 
      fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.phone.includes(searchTerm);
    
    const matchesStatus = statusFilter === 'ALL' || c.status === statusFilter;
    const matchesLocation = locationFilter === 'ALL' || c.location === locationFilter;

    return matchesSearch && matchesStatus && matchesLocation;
  });

  // Pagination Logic
  const totalPages = Math.ceil(filteredCustomers.length / itemsPerPage);
  const paginatedCustomers = filteredCustomers.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter('ALL');
    setLocationFilter('ALL');
  };

  const handleUpdateStatus = (orderId: string, newStatus: OrderStatus) => {
    if (!canManageOrders) return;
    if (confirm(`Are you sure you want to mark this order as ${newStatus}?`)) {
        setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
    }
  };

  const openEditModal = (customer: Customer, e: React.MouseEvent) => {
      e.stopPropagation();
      if (!canManageCustomers) return;
      setEditingCustomer(customer);
      setFormData({
          firstName: customer.firstName,
          lastName: customer.lastName,
          email: customer.email || '',
          phone: customer.phone,
          physicalAddress: customer.physicalAddress || '',
          coordinates: customer.coordinates,
          locationImage: customer.locationImage || ''
      });
      setIsEditModalOpen(true);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData(prev => ({ ...prev, locationImage: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveCustomer = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!editingCustomer || !canManageCustomers) return;

      const updatedCustomer: Customer = {
          ...editingCustomer,
          ...formData as Customer,
      };

      try {
        const saved = await api.customers.update(updatedCustomer);
        setCustomers(prev =>
          prev.map(c => c.id === saved.id ? { ...saved, ...updatedCustomer, ...saved } : c),
        );
        setIsEditModalOpen(false);
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Failed to update customer.');
      }
  };

  // --- DETAIL VIEW: CUSTOMER PROFILE ---
  if (selectedCustomerPhone) {
    const customer = displayCustomers.find(c => c.phone === selectedCustomerPhone);
    if (!customer) return <div>Customer not found</div>;

    const customerOrders = orders.filter(o => o.customerPhone === customer.phone);
    const refundedAmount = customerOrders
        .filter(o => o.status === OrderStatus.REFUNDED)
        .reduce((sum, o) => sum + o.totalAmount, 0);

    return (
      <div className="space-y-6 animate-fade-in">
        <button 
          onClick={() => setSelectedCustomerPhone(null)}
          className="flex items-center text-gray-500 hover:text-green-600 transition"
        >
          <ArrowLeft size={18} className="mr-2" />
          {t('backToCustomers')}
        </button>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-8 border-b border-gray-100 bg-gradient-to-r from-green-600 to-green-700 text-white relative">
             <div className="flex flex-col md:flex-row justify-between items-start gap-6 relative z-10">
               <div className="flex flex-col sm:flex-row items-center sm:items-start text-center sm:text-left w-full sm:w-auto space-y-4 sm:space-y-0 sm:space-x-6">
                  <div className="w-24 h-24 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center text-4xl font-bold border-2 border-white/30 shrink-0">
                    {customer.firstName.charAt(0)}
                  </div>
                  <div>
                    <h1 className="text-3xl font-bold break-all">{customer.firstName} {customer.lastName}</h1>
                    <div className="flex flex-col space-y-1 mt-2 text-green-50 items-center sm:items-start">
                       <span className="flex items-center"><Phone size={16} className="mr-2 opacity-80" /> {customer.phone}</span>
                       {customer.email && <span className="flex items-center break-all"><Mail size={16} className="mr-2 opacity-80" /> {customer.email}</span>}
                       <span className="flex items-center"><MapPin size={16} className="mr-2 opacity-80" /> {customer.location}</span>
                    </div>
                  </div>
               </div>
               
               <div className="flex flex-row md:flex-col items-center md:items-end justify-between w-full md:w-auto gap-3">
                 <span className={`inline-block px-3 py-1 rounded-full text-sm backdrop-blur-md border border-white/30 font-medium ${customer.status === 'Active' ? 'bg-green-400/30' : 'bg-gray-400/30'}`}>
                   {t(customer.status?.toLowerCase() || 'inactive')}
                 </span>
                 {canManageCustomers && (
                   <button 
                      onClick={(e) => openEditModal(customer, e)}
                      className="bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center transition backdrop-blur-sm whitespace-nowrap"
                   >
                      <Edit size={16} className="mr-2" />
                      {t('editCustomer')}
                   </button>
                 )}
               </div>
             </div>
             
             {/* Background Pattern */}
             <div className="absolute right-0 bottom-0 opacity-10">
                 <User size={200} />
             </div>
          </div>
          
          {/* Detailed Info Section */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 p-8 border-b border-gray-200">
             {/* Address & Location Card */}
             <div className="md:col-span-2 bg-gray-50 rounded-xl p-6 border border-gray-100">
                 <h3 className="font-bold text-gray-800 mb-4 flex items-center">
                    <MapPin size={18} className="mr-2 text-green-600" />
                    Location Details
                 </h3>
                 <div className="flex flex-col md:flex-row gap-6">
                     <div className="flex-1 space-y-3">
                         <div>
                             <p className="text-xs text-gray-500 uppercase font-bold">{t('physicalAddress')}</p>
                             <p className="text-gray-800">{customer.physicalAddress || "Not specified"}</p>
                         </div>
                         <div>
                             <p className="text-xs text-gray-500 uppercase font-bold">{t('coordinates')}</p>
                             {customer.coordinates ? (
                                 <p className="text-gray-800 font-mono text-sm">{customer.coordinates.lat}, {customer.coordinates.lng}</p>
                             ) : (
                                 <p className="text-gray-500 italic">Not available</p>
                             )}
                         </div>
                     </div>
                     {customer.locationImage && (
                         <div className="w-full md:w-48 h-32 rounded-lg overflow-hidden border border-gray-200 shadow-sm relative group shrink-0">
                             <img src={customer.locationImage} alt="Location" className="w-full h-full object-cover" />
                             <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                                 <span className="text-white text-xs font-bold">Location Image</span>
                             </div>
                         </div>
                     )}
                 </div>
             </div>

             {/* Stats Cards */}
             <div className="space-y-4">
                 <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex justify-between items-center">
                    <div>
                        <p className="text-gray-500 text-xs font-bold uppercase">{t('totalSpent')}</p>
                        <p className="text-xl font-bold text-gray-800">{(customer.totalSpent || 0).toLocaleString()} <span className="text-xs font-normal">FCFA</span></p>
                    </div>
                    <div className="p-2 bg-green-50 rounded-lg text-green-600">
                        <ShoppingBag size={20} />
                    </div>
                 </div>
                 <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex justify-between items-center">
                    <div>
                        <p className="text-gray-500 text-xs font-bold uppercase">{t('totalOrders')}</p>
                        <p className="text-xl font-bold text-gray-800">{customer.totalOrders}</p>
                    </div>
                 </div>
             </div>
          </div>

          <div className="p-8">
            <h3 className="text-lg font-bold text-gray-800 mb-4">{t('orderHistory')}</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 text-xs uppercase">
                    <th className="p-4">{t('date')}</th>
                    <th className="p-4">Order ID</th>
                    <th className="p-4">{t('total')}</th>
                    <th className="p-4">{t('status')}</th>
                    <th className="p-4 text-right">{t('actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {customerOrders.map(order => (
                    <tr key={order.id} className="hover:bg-gray-50">
                      <td className="p-4 text-sm text-gray-600 whitespace-nowrap">{order.date}</td>
                      <td className="p-4 text-sm font-medium whitespace-nowrap">#{order.id}</td>
                      <td className="p-4 text-sm font-bold text-gray-800 whitespace-nowrap">{order.totalAmount.toLocaleString()} FCFA</td>
                      <td className="p-4">
                        <span className={`px-2 py-1 rounded text-xs font-bold uppercase whitespace-nowrap ${
                          order.status === 'Paid' ? 'bg-blue-100 text-blue-700' :
                          order.status === 'Delivered' ? 'bg-green-100 text-green-700' :
                          order.status === 'Cancelled' ? 'bg-red-100 text-red-700' :
                          order.status === 'Refunded' ? 'bg-orange-100 text-orange-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {order.status}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        {canManageOrders && (
                          <div className="flex justify-end space-x-2">
                             {/* Allow Cancel if Pending or Processing */}
                             {(order.status === 'Pending' || order.status === 'Processing') && (
                               <button 
                                 onClick={() => handleUpdateStatus(order.id, OrderStatus.CANCELLED)}
                                 className="flex items-center px-3 py-1.5 border border-red-200 text-red-600 hover:bg-red-50 rounded text-xs font-medium transition whitespace-nowrap"
                               >
                                 <XCircle size={14} className="mr-1" />
                                 {t('cancel')}
                               </button>
                             )}
                             
                             {/* Allow Refund if Paid, Delivered, Shipped OR Cancelled */}
                             {(order.status === 'Paid' || order.status === 'Delivered' || order.status === 'Shipped' || order.status === 'Cancelled') && (
                               <button 
                                 onClick={() => handleUpdateStatus(order.id, OrderStatus.REFUNDED)}
                                 className="flex items-center px-3 py-1.5 border border-orange-200 text-orange-600 hover:bg-orange-50 rounded text-xs font-medium transition whitespace-nowrap"
                               >
                                 <RefreshCcw size={14} className="mr-1" />
                                 {t('refundOrder')}
                               </button>
                             )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- LIST VIEW: ALL CUSTOMERS ---
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">{t('customers')}</h1>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        
        {/* Filters Section */}
        <div className="p-4 border-b border-gray-100 bg-gray-50 flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
             <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
             <input 
               type="text" 
               placeholder={t('searchCustomerPlaceholder')}
               value={searchTerm}
               onChange={(e) => setSearchTerm(e.target.value)}
               className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-green-500 bg-white"
             />
          </div>
          
          <div className="flex gap-2">
            <select 
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="px-4 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-green-500 bg-white text-sm"
            >
              <option value="ALL">{t('filterByStatus')}: {t('all')}</option>
              <option value="Active">{t('active')}</option>
              <option value="Inactive">{t('inactive')}</option>
            </select>

            <select 
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              className="px-4 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-green-500 bg-white text-sm max-w-[140px] md:max-w-[200px]"
            >
              <option value="ALL">{t('filterByLocation')}: {t('all')}</option>
              {uniqueLocations.map(loc => (
                <option key={loc} value={loc}>{loc}</option>
              ))}
            </select>

            {(searchTerm || statusFilter !== 'ALL' || locationFilter !== 'ALL') && (
              <button 
                onClick={clearFilters}
                className="flex items-center px-4 py-2 text-sm text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition"
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
                 <th className="p-4">{t('customer')}</th>
                 <th className="p-4">{t('phone')}</th>
                 <th className="p-4">Location</th>
                 <th className="p-4 text-center">{t('status')}</th>
                 <th className="p-4 text-center">{t('totalOrders')}</th>
                 <th className="p-4 text-right">{t('totalSpent')}</th>
                 <th className="p-4 text-right">{t('actions')}</th>
               </tr>
             </thead>
             <tbody className="divide-y divide-gray-100">
               {paginatedCustomers.length > 0 ? paginatedCustomers.map(customer => (
                 <tr key={customer.id} className="hover:bg-gray-50 transition cursor-pointer" onClick={() => setSelectedCustomerPhone(customer.phone)}>
                    <td className="p-4 flex items-center space-x-3">
                       <div className="w-10 h-10 rounded-full bg-green-100 text-green-700 flex items-center justify-center font-bold relative shrink-0">
                         {customer.firstName.charAt(0)}
                         {customer.locationImage && (
                             <span className="absolute -bottom-1 -right-1 w-4 h-4 bg-blue-500 rounded-full border-2 border-white" title="Has location image"></span>
                         )}
                       </div>
                       <div>
                          <p className="font-medium text-gray-800 whitespace-nowrap">{customer.firstName} {customer.lastName}</p>
                          <p className="text-xs text-gray-400">Since {new Date(customer.lastOrderDate || new Date()).getFullYear()}</p>
                       </div>
                    </td>
                    <td className="p-4 text-sm text-gray-600 whitespace-nowrap">{customer.phone}</td>
                    <td className="p-4 text-sm text-gray-600 whitespace-nowrap">
                        {customer.location}
                        {customer.coordinates && (
                            <span className="text-xs text-blue-500 ml-1" title="GPS Coordinates available">📍</span>
                        )}
                    </td>
                    <td className="p-4 text-center">
                       <span className={`inline-block px-2 py-1 rounded text-xs font-bold ${
                         customer.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                       }`}>
                         {t(customer.status?.toLowerCase() || 'inactive')}
                       </span>
                    </td>
                    <td className="p-4 text-center">
                       <span className="inline-block px-2 py-1 bg-gray-100 rounded text-xs font-bold text-gray-700">
                         {customer.totalOrders}
                       </span>
                    </td>
                    <td className="p-4 text-right font-bold text-gray-800 whitespace-nowrap">
                       {(customer.totalSpent || 0).toLocaleString()} FCFA
                    </td>
                    <td className="p-4 text-right">
                       {canManageCustomers && (
                         <button 
                           onClick={(e) => openEditModal(customer, e)}
                           className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition"
                           title={t('editCustomer')}
                         >
                           <Edit size={16} />
                         </button>
                       )}
                    </td>
                 </tr>
               )) : (
                 <tr>
                   <td colSpan={7} className="p-8 text-center text-gray-500">
                      No customers found matching your filters.
                   </td>
                 </tr>
               )}
             </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
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

       {/* Edit Customer Modal */}
       {isEditModalOpen && canManageCustomers && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 max-h-[90dvh] overflow-y-auto">
                  <div className="flex justify-between items-center mb-6">
                      <h3 className="text-xl font-bold text-gray-800">{t('editCustomer')}</h3>
                      <button onClick={() => setIsEditModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                          <X size={24} />
                      </button>
                  </div>

                  <form onSubmit={handleSaveCustomer} className="space-y-4">
                      {/* Name Fields */}
                      <div className="grid grid-cols-2 gap-4">
                          <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">{t('firstName')}</label>
                              <input 
                                  type="text" 
                                  value={formData.firstName || ''}
                                  onChange={e => setFormData({...formData, firstName: e.target.value})}
                                  className="w-full border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-green-500"
                                  required
                              />
                          </div>
                          <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">{t('lastName')}</label>
                              <input 
                                  type="text" 
                                  value={formData.lastName || ''}
                                  onChange={e => setFormData({...formData, lastName: e.target.value})}
                                  className="w-full border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-green-500"
                                  required
                              />
                          </div>
                      </div>

                      {/* Contact Fields */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">{t('phone')}</label>
                              <input 
                                  type="text" 
                                  value={formData.phone || ''}
                                  onChange={e => setFormData({...formData, phone: e.target.value})}
                                  className="w-full border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-green-500 bg-gray-50"
                                  readOnly // Phone is ID, keep read-only for simplicity
                              />
                          </div>
                          <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">{t('email')}</label>
                              <input 
                                  type="email" 
                                  value={formData.email || ''}
                                  onChange={e => setFormData({...formData, email: e.target.value})}
                                  className="w-full border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-green-500"
                              />
                          </div>
                      </div>

                      {/* Physical Address */}
                      <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">{t('physicalAddress')}</label>
                          <textarea 
                              rows={2}
                              value={formData.physicalAddress || ''}
                              onChange={e => setFormData({...formData, physicalAddress: e.target.value})}
                              className="w-full border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-green-500"
                          />
                      </div>

                      {/* Coordinates */}
                      <div className="bg-gray-50 p-4 rounded-lg border border-gray-100">
                          <h4 className="text-sm font-bold text-gray-700 mb-3 flex items-center">
                              <MapPin size={16} className="mr-2" /> 
                              {t('coordinates')}
                          </h4>
                          <div className="grid grid-cols-2 gap-4">
                              <div>
                                  <label className="block text-xs font-medium text-gray-500 mb-1">{t('latitude')}</label>
                                  <input 
                                      type="number" 
                                      step="any"
                                      value={formData.coordinates?.lat || ''}
                                      onChange={e => setFormData({
                                          ...formData, 
                                          coordinates: { 
                                              lat: parseFloat(e.target.value) || 0, 
                                              lng: formData.coordinates?.lng || 0 
                                          }
                                      })}
                                      className="w-full border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-green-500 text-sm"
                                  />
                              </div>
                              <div>
                                  <label className="block text-xs font-medium text-gray-500 mb-1">{t('longitude')}</label>
                                  <input 
                                      type="number" 
                                      step="any"
                                      value={formData.coordinates?.lng || ''}
                                      onChange={e => setFormData({
                                          ...formData, 
                                          coordinates: { 
                                              lng: parseFloat(e.target.value) || 0, 
                                              lat: formData.coordinates?.lat || 0 
                                          }
                                      })}
                                      className="w-full border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-green-500 text-sm"
                                  />
                              </div>
                          </div>
                          {mapsLink(formData.coordinates?.lat, formData.coordinates?.lng, formData.physicalAddress) && (
                            <a
                              href={mapsLink(formData.coordinates?.lat, formData.coordinates?.lng, formData.physicalAddress)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-3 inline-flex items-center text-sm text-green-700 hover:text-green-900 font-medium"
                            >
                              <ExternalLink size={14} className="mr-1" />
                              Open in Google Maps
                            </a>
                          )}
                      </div>

                      {/* Location Image */}
                      <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">{t('locationImage')}</label>
                          <div className="flex flex-col items-center">
                              <div className="relative group cursor-pointer w-full h-40 bg-gray-50 rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center overflow-hidden">
                                  {formData.locationImage ? (
                                      <img src={formData.locationImage} alt="Location" className="w-full h-full object-cover" />
                                  ) : (
                                      <div className="text-center p-4">
                                          <ImageIcon className="mx-auto text-gray-400 mb-2" size={24} />
                                          <span className="text-xs text-gray-400">{t('uploadLocationImage')}</span>
                                      </div>
                                  )}
                                  <label className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center cursor-pointer text-white font-medium text-sm">
                                      <Upload size={16} className="mr-2" />
                                      {t('uploadLocationImage')}
                                      <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                                  </label>
                              </div>
                          </div>
                      </div>

                      <div className="flex justify-end space-x-3 pt-4">
                          <button 
                              type="button"
                              onClick={() => setIsEditModalOpen(false)} 
                              className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                          >
                              {t('cancel')}
                          </button>
                          <button 
                              type="submit" 
                              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                          >
                              {t('save')}
                          </button>
                      </div>
                  </form>
              </div>
          </div>
       )}

    </div>
  );
};
