
import React, { useState, useEffect } from 'react';
import { TRANSLATIONS } from '../constants';
import { Language, Order, OrderStatus, RoleDef, LocationDef, Customer } from '../types';
import { MapPin, Phone, CreditCard, CheckCircle, Truck, Package, XCircle, AlertCircle, Filter, Download, FileText, FileSpreadsheet, File, ChevronLeft, ChevronRight, RefreshCcw, Edit2, X, Navigation, ImageIcon, Calendar as CalendarIcon, List, Loader2 } from 'lucide-react';
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { api } from '../services/api';

interface OrdersProps {
  orders: Order[];
  setOrders: React.Dispatch<React.SetStateAction<Order[]>>;
  lang: Language;
  currentRole: RoleDef;
  locations: LocationDef[];
  customers: Customer[];
}

export const Orders: React.FC<OrdersProps> = ({ orders, setOrders, lang, currentRole, locations, customers }) => {
  const t = (key: string) => TRANSLATIONS[key][lang];
  const [viewMode, setViewMode] = useState<'LIST' | 'CALENDAR'>('LIST');
  const [calendarScope, setCalendarScope] = useState<'MONTH' | 'WEEK' | 'DAY'>('MONTH');
  const [activeFilter, setActiveFilter] = useState<string>('ALL');
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);

  // Calendar State
  const [currentDate, setCurrentDate] = useState(new Date());

  // Location Assignment State
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [selectedCityId, setSelectedCityId] = useState<string>('');
  const [selectedDeliveryType, setSelectedDeliveryType] = useState<'DIRECT' | 'PICKUP'>('DIRECT');
  const [selectedPickupId, setSelectedPickupId] = useState<string>('');

  // Delivery Details View State
  const [isDeliveryModalOpen, setIsDeliveryModalOpen] = useState(false);
  const [viewingDeliveryOrder, setViewingDeliveryOrder] = useState<Order | null>(null);

  // Status update in-flight tracking (orderId or null)
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);

  // Pagination State (List View Only)
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  useEffect(() => {
    setCurrentPage(1);
  }, [activeFilter]);

  const awaitingCustomerReceipt = orders.some(
    (o) => o.status === OrderStatus.SHIPPED && !o.clientConfirmedReceipt,
  );
  useEffect(() => {
    if (!awaitingCustomerReceipt) return;
    const reload = async () => {
      try {
        const fresh = await api.orders.getAll();
        setOrders(fresh);
      } catch {
        /* ignore poll errors */
      }
    };
    const id = window.setInterval(() => { void reload(); }, 12_000);
    window.addEventListener('focus', reload);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('focus', reload);
    };
  }, [awaitingCustomerReceipt, setOrders]);

  const canManageOrders = currentRole.permissions.includes('MANAGE_ORDERS');

  // Access Control check
  if (!currentRole.permissions.includes('VIEW_ORDERS')) {
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

  const updateStatus = async (orderId: string, newStatus: OrderStatus) => {
    if (!canManageOrders) return;
    setUpdatingOrderId(orderId);
    try {
      const response = await api.orders.updateStatus(orderId, newStatus);
      if (response.success) {
        setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to update status on server.';
      alert(msg);
    } finally {
      setUpdatingOrderId(null);
    }
  };

  const openLocationModal = (orderId: string) => {
    setSelectedOrderId(orderId);
    setSelectedCityId('');
    setSelectedDeliveryType('DIRECT');
    setSelectedPickupId('');
    setIsLocationModalOpen(true);
  };

  const handleSaveLocation = async () => {
    if (!selectedOrderId || !selectedCityId) return;

    const city = locations.find(l => l.id === selectedCityId);
    if (!city) return;

    let locationString = city.name;
    let pickupId: string | undefined = undefined;

    if (selectedDeliveryType === 'PICKUP' && selectedPickupId) {
      const pickup = locations.find(l => l.id === selectedPickupId);
      if (pickup) {
        locationString = `${city.name} - ${t('pickup')}: ${pickup.name}`;
        pickupId = pickup.id;
      }
    }

    try {
      const currentOrder = orders.find(o => o.id === selectedOrderId);
      if (!currentOrder) return;

      const updatedFromApi = await api.orders.updateFulfillment(selectedOrderId, {
        deliveryMethod: selectedDeliveryType === 'PICKUP' ? 'PICKUP' : 'DIRECT',
        pickupPointId: selectedDeliveryType === 'PICKUP' ? pickupId ?? null : null,
      });

      const mergedOrder: Order = {
        ...updatedFromApi,
        location: locationString,
        pickupLocationId: pickupId,
      };

      setOrders(prev => prev.map(o => o.id === selectedOrderId ? mergedOrder : o));
      setIsLocationModalOpen(false);
    } catch (e) {
      alert("Failed to save location assignment");
    }
  };

  const openDeliveryModal = (order: Order) => {
    setViewingDeliveryOrder(order);
    setIsDeliveryModalOpen(true);
  };

  const getDeliveryDetails = (order: Order | null) => {
    if (!order) return null;

    // If it's a pickup order
    if (order.pickupLocationId) {
      const pickup = locations.find(l => l.id === order.pickupLocationId);
      if (pickup) {
        return {
          type: 'PICKUP',
          title: t('pickupPoint'),
          name: pickup.name,
          address: '',
          coordinates: pickup.coordinates,
          image: pickup.image
        };
      }
    }

    // If it's a direct delivery or default, look up customer
    const customer = customers.find(c => c.phone === order.customerPhone);
    if (customer) {
      return {
        type: 'DIRECT',
        title: t('directDelivery'),
        name: `${customer.firstName} ${customer.lastName}`,
        address: customer.physicalAddress || order.location,
        coordinates: customer.coordinates,
        image: customer.locationImage
      };
    }

    return {
      type: 'UNKNOWN',
      title: 'Location Info',
      name: order.location,
      address: '',
      coordinates: undefined,
      image: undefined
    };
  };

  const filteredOrders = activeFilter === 'ALL'
    ? orders
    : orders.filter(o => o.status === activeFilter);

  // Pagination Logic (Only for List)
  const totalPages = Math.ceil(filteredOrders.length / itemsPerPage);
  const paginatedOrders = filteredOrders.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // --- Export Logic ---
  const getExportData = () => {
    return filteredOrders.map(o => ({
      ID: o.id,
      Placed: o.date,
      Delivery: o.deliveryDate,
      Customer: o.customerName,
      Phone: o.customerPhone,
      Status: o.status,
      Items: o.items.map(i => `${i.quantity}x ${i.productName}`).join(', '),
      Total: `${o.totalAmount} FCFA`,
      Payment: o.paymentMethod,
      Location: o.location
    }));
  };

  const handleExportCSV = () => {
    const data = getExportData();
    if (data.length === 0) return;
    const headers = Object.keys(data[0]);
    const csvContent = [headers.join(','), ...data.map(row => headers.map(header => `"${(row as any)[header]}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `orders_${activeFilter}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setIsExportMenuOpen(false);
  };

  const handleExportExcel = () => {
    const data = getExportData();
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Orders");
    XLSX.writeFile(wb, `orders_${activeFilter}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    setIsExportMenuOpen(false);
  };

  const handleExportPDF = () => {
    const doc = new jsPDF();
    const tableData = filteredOrders.map(o => [o.id, o.date, o.deliveryDate, o.customerName, o.status, `${o.totalAmount} FCFA`]);
    doc.text(`Order Report - ${activeFilter}`, 14, 15);
    doc.setFontSize(10);
    doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 22);
    autoTable(doc, { startY: 30, head: [['ID', 'Placed', 'Delivery', 'Customer', 'Status', 'Total']], body: tableData });
    doc.save(`orders_${activeFilter}_${new Date().toISOString().slice(0, 10)}.pdf`);
    setIsExportMenuOpen(false);
  };

  const StatusBadge = ({ status }: { status: OrderStatus }) => {
    const styles = {
      [OrderStatus.PENDING]: "bg-gray-100 text-gray-700",
      [OrderStatus.PAID]: "bg-blue-100 text-blue-700",
      [OrderStatus.PROCESSING]: "bg-yellow-100 text-yellow-700",
      [OrderStatus.SHIPPED]: "bg-purple-100 text-purple-700",
      [OrderStatus.DELIVERED]: "bg-green-100 text-green-700",
      [OrderStatus.CANCELLED]: "bg-red-100 text-red-700",
      [OrderStatus.REFUNDED]: "bg-orange-100 text-orange-700",
    };
    return (
      <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wide ${styles[status]}`}>
        {status}
      </span>
    );
  };

  // --- Calendar Helpers ---
  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const days = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay(); // 0 is Sunday
    return { days, firstDay, year, month };
  };

  const getWeekStart = (date: Date) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day; // Adjust if week starts on Monday
    return new Date(d.setDate(diff));
  };

  const navigateCalendar = (direction: number) => {
    const newDate = new Date(currentDate);
    if (calendarScope === 'MONTH') {
      newDate.setMonth(newDate.getMonth() + direction);
    } else if (calendarScope === 'WEEK') {
      newDate.setDate(newDate.getDate() + (direction * 7));
    } else {
      newDate.setDate(newDate.getDate() + direction);
    }
    setCurrentDate(newDate);
  };

  const getOrdersForDay = (date: Date) => {
    // Simple string compare for YYYY-MM-DD
    const offset = date.getTimezoneOffset();
    const localDate = new Date(date.getTime() - (offset * 60 * 1000));
    const localDateStr = localDate.toISOString().split('T')[0];
    return filteredOrders.filter(o => o.deliveryDate === localDateStr);
  };

  const CalendarView = () => {
    const weekDays = lang === 'fr' ? ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'] : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    const renderMonth = () => {
      const { days, firstDay, year, month } = getDaysInMonth(currentDate);
      const blanks = Array.from({ length: firstDay }, (_, i) => i);
      const dayList = Array.from({ length: days }, (_, i) => i + 1);

      return (
        <>
          <div className="grid grid-cols-7 border-b border-gray-200">
            {weekDays.map(d => (
              <div key={d} className="py-2 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider bg-gray-50/50">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 auto-rows-fr">
            {blanks.map(b => <div key={`blank-${b}`} className="min-h-[100px] border-b border-r border-gray-100 bg-gray-50/30" />)}
            {dayList.map(day => {
              const checkDate = new Date(year, month, day);
              const dayOrders = getOrdersForDay(checkDate);
              const isToday = new Date().toDateString() === checkDate.toDateString();

              return (
                <div key={day} className={`min-h-[100px] border-b border-r border-gray-100 p-2 relative group hover:bg-gray-50 transition ${isToday ? 'bg-blue-50/30' : ''}`}>
                  <span className={`text-xs font-semibold ${isToday ? 'text-blue-600 bg-blue-100 w-6 h-6 flex items-center justify-center rounded-full' : 'text-gray-700'}`}>
                    {day}
                  </span>

                  <div className="mt-2 space-y-1">
                    {dayOrders.slice(0, 3).map(o => (
                      <div
                        key={o.id}
                        onClick={() => openDeliveryModal(o)}
                        className="text-[10px] px-1.5 py-0.5 rounded cursor-pointer truncate border border-transparent hover:border-gray-300 transition"
                        style={{
                          backgroundColor: o.status === OrderStatus.DELIVERED ? '#dcfce7' : o.status === OrderStatus.PENDING ? '#f3f4f6' : '#e0e7ff',
                          color: o.status === OrderStatus.DELIVERED ? '#166534' : o.status === OrderStatus.PENDING ? '#374151' : '#3730a3'
                        }}
                      >
                        {o.customerName.split(' ')[0]}
                      </div>
                    ))}
                    {dayOrders.length > 3 && (
                      <div className="text-[10px] text-gray-400 pl-1">
                        +{dayOrders.length - 3} more
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      );
    };

    const renderWeek = () => {
      const startOfWeek = getWeekStart(currentDate);
      const days = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(startOfWeek);
        d.setDate(d.getDate() + i);
        return d;
      });

      return (
        <div className="grid grid-cols-1 sm:grid-cols-7 divide-y sm:divide-y-0 sm:divide-x divide-gray-200">
          {days.map((day, idx) => {
            const dayOrders = getOrdersForDay(day);
            const isToday = new Date().toDateString() === day.toDateString();

            return (
              <div key={idx} className="min-h-[150px] bg-white p-2">
                <div className={`p-2 border-b border-gray-100 text-center mb-2 ${isToday ? 'bg-blue-50' : ''}`}>
                  <span className="text-xs uppercase text-gray-500 font-bold block">{weekDays[day.getDay()]}</span>
                  <span className={`text-lg font-bold ${isToday ? 'text-blue-600' : 'text-gray-800'}`}>{day.getDate()}</span>
                </div>
                <div className="space-y-2">
                  {dayOrders.map(o => (
                    <div
                      key={o.id}
                      onClick={() => openDeliveryModal(o)}
                      className="p-2 rounded bg-gray-50 hover:bg-gray-100 cursor-pointer border border-gray-100 transition shadow-sm"
                    >
                      <div className="flex justify-between items-start">
                        <span className="text-xs font-bold text-gray-700 truncate">{o.customerName}</span>
                        <div className={`w-2 h-2 rounded-full ${o.status === OrderStatus.DELIVERED ? 'bg-green-500' : 'bg-blue-500'}`} />
                      </div>
                      <span className="text-[10px] text-gray-500 block">{o.totalAmount} FCFA</span>
                    </div>
                  ))}
                  {dayOrders.length === 0 && <div className="text-[10px] text-gray-300 text-center italic mt-4">-</div>}
                </div>
              </div>
            );
          })}
        </div>
      );
    };

    const renderDay = () => {
      const dayOrders = getOrdersForDay(currentDate);

      return (
        <div className="p-4 sm:p-6 bg-white min-h-[400px]">
          <h3 className="text-lg font-bold text-gray-800 mb-4 border-b pb-2">
            {currentDate.toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </h3>

          {dayOrders.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <p>No deliveries scheduled for this day.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {dayOrders.map(order => (
                <div key={order.id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 bg-gray-50 rounded-xl border border-gray-100 hover:shadow-md transition">
                  <div className="flex items-center space-x-4">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold shrink-0 ${order.status === OrderStatus.DELIVERED ? 'bg-green-500' : 'bg-blue-500'}`}>
                      {order.customerName.charAt(0)}
                    </div>
                    <div>
                      <h4 className="font-bold text-gray-800">{order.customerName}</h4>
                      <div className="flex items-center text-sm text-gray-500 mt-1">
                        <Phone size={12} className="mr-1" /> {order.customerPhone}
                        <span className="mx-2">•</span>
                        <MapPin size={12} className="mr-1" /> {order.location}
                      </div>
                      <div className="text-xs text-gray-400 mt-1">
                        {order.items.map(i => `${i.quantity}x ${i.productName}`).join(', ')}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center mt-3 sm:mt-0 w-full sm:w-auto justify-between sm:justify-end gap-3">
                    <span className="font-bold text-gray-700">{order.totalAmount} FCFA</span>
                    <button
                      onClick={() => openDeliveryModal(order)}
                      className="p-2 bg-white border border-gray-200 text-blue-600 rounded-lg hover:bg-blue-50"
                    >
                      <Navigation size={18} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    };

    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden animate-fade-in">
        {/* Calendar Toolbar */}
        <div className="p-4 flex flex-col md:flex-row justify-between items-center bg-gray-50 border-b border-gray-100 gap-4">
          <div className="flex items-center space-x-2">
            <button onClick={() => navigateCalendar(-1)} className="p-2 hover:bg-gray-200 rounded-full bg-white border border-gray-200"><ChevronLeft size={16} /></button>
            <button
              onClick={() => setCurrentDate(new Date())}
              className="px-3 py-1.5 text-xs font-bold bg-white border border-gray-200 rounded-md hover:bg-gray-100"
            >
              {t('today')}
            </button>
            <button onClick={() => navigateCalendar(1)} className="p-2 hover:bg-gray-200 rounded-full bg-white border border-gray-200"><ChevronRight size={16} /></button>
          </div>

          <h2 className="text-lg font-bold text-gray-800 capitalize order-first md:order-none">
            {calendarScope === 'MONTH'
              ? currentDate.toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-US', { month: 'long', year: 'numeric' })
              : calendarScope === 'DAY'
                ? currentDate.toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                : `Week of ${getWeekStart(currentDate).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-US', { month: 'short', day: 'numeric' })}`
            }
          </h2>

          <div className="flex bg-white rounded-lg p-1 border border-gray-200 shadow-sm">
            <button
              onClick={() => setCalendarScope('MONTH')}
              className={`px-3 py-1 text-xs font-medium rounded transition ${calendarScope === 'MONTH' ? 'bg-gray-800 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
            >
              {t('month')}
            </button>
            <button
              onClick={() => setCalendarScope('WEEK')}
              className={`px-3 py-1 text-xs font-medium rounded transition ${calendarScope === 'WEEK' ? 'bg-gray-800 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
            >
              {t('week')}
            </button>
            <button
              onClick={() => setCalendarScope('DAY')}
              className={`px-3 py-1 text-xs font-medium rounded transition ${calendarScope === 'DAY' ? 'bg-gray-800 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
            >
              {t('day')}
            </button>
          </div>
        </div>

        {/* Render View Content */}
        {calendarScope === 'MONTH' && renderMonth()}
        {calendarScope === 'WEEK' && renderWeek()}
        {calendarScope === 'DAY' && renderDay()}

        {/* Mobile Agenda View Tip */}
        {calendarScope === 'MONTH' && (
          <div className="md:hidden p-4 border-t border-gray-100 bg-gray-50">
            <p className="text-xs text-center text-gray-500 italic">Tap a day to see details</p>
          </div>
        )}
      </div>
    );
  };

  const WorkflowActions = ({ order }: { order: Order }) => {
    if (!canManageOrders) return null;
    if (order.status === OrderStatus.REFUNDED) return null;
    if (order.status === OrderStatus.DELIVERED) return null;

    const isBusy = updatingOrderId === order.id;

    return (
      <div className="mt-4 pt-4 border-t border-gray-100">
        {order.cancellationRequested && (
          <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span>
              <span className="font-semibold">{t('cancellationRequested')}</span>
              {order.cancellationReason ? <> — {order.cancellationReason}</> : null}
              {' '}{t('cancellationApproveHint')}
            </span>
          </div>
        )}
      <div className="flex flex-wrap gap-2">
        {order.status === OrderStatus.PENDING && (
          <button
            onClick={() => updateStatus(order.id, OrderStatus.PAID)}
            disabled={isBusy}
            className="flex items-center px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isBusy ? <Loader2 size={16} className="mr-1.5 animate-spin" /> : <CheckCircle size={16} className="mr-1.5" />}
            {t('verifyPayment')}
          </button>
        )}

        {order.status === OrderStatus.PAID && (
          <button
            onClick={() => updateStatus(order.id, OrderStatus.PROCESSING)}
            disabled={isBusy}
            className="flex items-center px-3 py-1.5 bg-yellow-500 text-white text-sm font-medium rounded-lg hover:bg-yellow-600 transition shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isBusy ? <Loader2 size={16} className="mr-1.5 animate-spin" /> : <Package size={16} className="mr-1.5" />}
            {t('processOrder')}
          </button>
        )}

        {order.status === OrderStatus.PROCESSING && (
          <button
            onClick={() => updateStatus(order.id, OrderStatus.SHIPPED)}
            disabled={isBusy}
            className="flex items-center px-3 py-1.5 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 transition shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isBusy ? <Loader2 size={16} className="mr-1.5 animate-spin" /> : <Truck size={16} className="mr-1.5" />}
            {t('shipOrder')}
          </button>
        )}

        {order.status === OrderStatus.SHIPPED && (
          <div className="flex flex-col items-start gap-1">
            <button
              onClick={() => updateStatus(order.id, OrderStatus.DELIVERED)}
              disabled={isBusy || !order.clientConfirmedReceipt}
              title={!order.clientConfirmedReceipt ? t('awaitingCustomerReceipt') : undefined}
              className="flex items-center px-3 py-1.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isBusy ? <Loader2 size={16} className="mr-1.5 animate-spin" /> : <CheckCircle size={16} className="mr-1.5" />}
              {t('markDelivered')}
            </button>
            {!order.clientConfirmedReceipt && (
              <p className="text-xs text-amber-600">{t('awaitingCustomerReceipt')}</p>
            )}
          </div>
        )}

        {order.status === OrderStatus.CANCELLED && (
          <button
            onClick={() => updateStatus(order.id, OrderStatus.REFUNDED)}
            disabled={isBusy}
            className="flex items-center px-3 py-1.5 bg-orange-50 border border-orange-200 text-orange-600 text-sm font-medium rounded-lg hover:bg-orange-100 transition shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isBusy ? <Loader2 size={16} className="mr-1.5 animate-spin" /> : <RefreshCcw size={16} className="mr-1.5" />}
            {t('refundOrder')}
          </button>
        )}

        {order.status !== OrderStatus.CANCELLED && (
          <button
            onClick={() => updateStatus(order.id, OrderStatus.CANCELLED)}
            disabled={isBusy}
            className="flex items-center px-3 py-1.5 bg-white border border-red-200 text-red-600 text-sm font-medium rounded-lg hover:bg-red-50 transition disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isBusy ? <Loader2 size={16} className="mr-1.5 animate-spin" /> : <XCircle size={16} className="mr-1.5" />}
            {t('cancelOrder')}
          </button>
        )}
      </div>
      </div>
    );
  };

  return (
    <div className="space-y-6" onClick={() => isExportMenuOpen && setIsExportMenuOpen(false)}>

      {/* Top Header Row */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">{t('orders')}</h1>
          <p className="text-sm text-gray-500">{filteredOrders.length} {t('ordersCount')}</p>
        </div>

        <div className="flex items-center space-x-3 w-full sm:w-auto">
          {/* View Toggle */}
          <div className="flex bg-gray-100 p-1 rounded-lg">
            <button
              onClick={() => setViewMode('LIST')}
              className={`p-2 rounded-md transition ${viewMode === 'LIST' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              title={t('listView')}
            >
              <List size={18} />
            </button>
            <button
              onClick={() => setViewMode('CALENDAR')}
              className={`p-2 rounded-md transition ${viewMode === 'CALENDAR' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              title={t('calendarView')}
            >
              <CalendarIcon size={18} />
            </button>
          </div>

          {/* Export Button */}
          <div className="relative">
            <button
              onClick={(e) => { e.stopPropagation(); setIsExportMenuOpen(!isExportMenuOpen); }}
              className="flex items-center px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition shadow-sm text-sm font-medium"
            >
              <Download size={16} className="mr-2" />
              <span className="hidden sm:inline">{t('export')}</span>
            </button>

            {isExportMenuOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-xl border border-gray-100 z-50 overflow-hidden animate-fade-in-up">
                <button onClick={handleExportCSV} className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center">
                  <FileText size={16} className="mr-2 text-blue-500" />
                  {t('exportCSV')}
                </button>
                <button onClick={handleExportExcel} className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center">
                  <FileSpreadsheet size={16} className="mr-2 text-green-600" />
                  {t('exportExcel')}
                </button>
                <button onClick={handleExportPDF} className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center">
                  <File size={16} className="mr-2 text-red-500" />
                  {t('exportPDF')}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Filter Bar (Common for both views) */}
      <div className="flex items-center space-x-2 overflow-x-auto pb-2 no-scrollbar">
        <Filter className="text-gray-400 mr-2 shrink-0" size={20} />
        <button
          onClick={() => setActiveFilter('ALL')}
          className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition ${activeFilter === 'ALL'
              ? 'bg-gray-800 text-white'
              : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
            }`}
        >
          {t('allOrders')}
        </button>
        {Object.values(OrderStatus).map((status) => (
          <button
            key={status}
            onClick={() => setActiveFilter(status)}
            className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition ${activeFilter === status
                ? 'bg-green-600 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
              }`}
          >
            {status}
          </button>
        ))}
      </div>

      {viewMode === 'CALENDAR' ? (
        <CalendarView />
      ) : (
        /* List View */
        <div className="grid gap-6">
          {paginatedOrders.length > 0 ? paginatedOrders.map(order => (
            <div key={order.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow relative group-card">

              {/* Order Header */}
              <div className="p-4 bg-gray-50 border-b border-gray-100 flex flex-col md:flex-row justify-between md:items-center gap-4">
                <div className="flex flex-col">
                  <span className="font-bold text-gray-900">#{order.id}</span>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 mt-1">
                    <span className="text-[10px] text-gray-400 bg-white border border-gray-200 px-2 py-0.5 rounded-full flex items-center w-fit">
                      <span className="mr-1">{t('placedOn')}:</span> {order.date}
                    </span>
                    <span className="text-xs font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded-full flex items-center w-fit border border-green-100">
                      <CalendarIcon size={10} className="mr-1" />
                      <span className="mr-1">{t('scheduledFor')}:</span>
                      <span className="font-bold">{order.deliveryDate}</span>
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between md:justify-end w-full md:w-auto gap-3">
                  {/* Delivery Map Button for Processing/Shipped orders */}
                  {(order.status === OrderStatus.PROCESSING || order.status === OrderStatus.SHIPPED || order.status === OrderStatus.DELIVERED) && (
                    <button
                      onClick={() => openDeliveryModal(order)}
                      className="p-2 bg-blue-50 text-blue-600 rounded-full hover:bg-blue-100 transition shadow-sm flex items-center justify-center"
                      title={t('deliveryDetails')}
                    >
                      <Navigation size={18} />
                    </button>
                  )}
                  <StatusBadge status={order.status} />
                  <span className="font-bold text-lg text-gray-800 whitespace-nowrap">{order.totalAmount.toLocaleString()} FCFA</span>
                </div>
              </div>

              {/* Order Body */}
              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">

                  {/* Customer Info */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">{t('customer')}</h4>
                    <div className="ml-0">
                      <p className="font-semibold text-gray-800 text-lg">{order.customerName}</p>
                      <div className="flex items-center text-sm text-gray-600 mt-2">
                        <Phone size={14} className="mr-2 text-gray-400" />
                        {order.customerPhone}
                      </div>
                      <div className="flex items-center text-sm text-gray-600 mt-1 group cursor-pointer" onClick={() => canManageOrders && openLocationModal(order.id)}>
                        <MapPin size={14} className="mr-2 text-gray-400" />
                        <span className={canManageOrders ? "group-hover:text-blue-600 transition" : ""}>{order.location}</span>
                        {canManageOrders && <Edit2 size={12} className="ml-2 text-gray-300 group-hover:text-blue-600 opacity-0 group-hover:opacity-100 transition" />}
                      </div>
                    </div>
                  </div>

                  {/* Items */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Items</h4>
                    <ul className="space-y-3">
                      {order.items.map((item, idx) => (
                        <li key={idx} className="flex justify-between text-sm group">
                          <div className="flex items-center">
                            <span className="w-6 h-6 rounded bg-gray-100 flex items-center justify-center text-xs font-bold mr-2 text-gray-600">
                              {item.quantity}
                            </span>
                            <span className="text-gray-700 font-medium">{item.productName}</span>
                          </div>
                          <span className="text-gray-500 whitespace-nowrap ml-2">{(item.price * item.quantity).toLocaleString()}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Payment & Summary */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">{t('payment')}</h4>
                    <div className="flex items-center text-gray-700 bg-gray-50 p-3 rounded-lg border border-gray-100">
                      <CreditCard size={18} className="mr-3 text-green-600" />
                      <span className="font-medium text-sm">{order.paymentMethod}</span>
                    </div>
                    <div className="flex justify-between items-center pt-2 mt-2 border-t border-gray-100">
                      <span className="text-sm font-medium text-gray-500">{t('total')}</span>
                      <span className="font-bold text-xl text-green-600">{order.totalAmount.toLocaleString()} FCFA</span>
                    </div>
                  </div>
                </div>

                <WorkflowActions order={order} />
              </div>
            </div>
          )) : (
            <div className="text-center py-12 bg-white rounded-xl border border-gray-100">
              <Package size={48} className="mx-auto text-gray-200 mb-4" />
              <h3 className="text-lg font-medium text-gray-900">No orders found</h3>
              <p className="text-gray-500">There are no orders with the status "{activeFilter}".</p>
            </div>
          )}
        </div>
      )}

      {/* Pagination Controls (List View Only) */}
      {viewMode === 'LIST' && totalPages > 1 && (
        <div className="flex justify-center items-center space-x-4 pt-6">
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

      {/* Location Assignment Modal */}
      {isLocationModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 max-h-[90dvh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-gray-800">{t('assignLocation')}</h3>
              <button onClick={() => setIsLocationModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('selectCity')}</label>
                <select
                  value={selectedCityId}
                  onChange={(e) => {
                    setSelectedCityId(e.target.value);
                    setSelectedPickupId(''); // Reset pickup when city changes
                  }}
                  className="w-full border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-green-500 bg-white"
                >
                  <option value="">-- {t('selectCity')} --</option>
                  {locations.filter(l => l.type === 'CITY').map(city => (
                    <option key={city.id} value={city.id}>{city.name}</option>
                  ))}
                </select>
              </div>

              {selectedCityId && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('deliveryType')}</label>
                  <div className="flex space-x-2 bg-gray-100 p-1 rounded-lg">
                    <button
                      type="button"
                      onClick={() => setSelectedDeliveryType('DIRECT')}
                      className={`flex-1 py-1.5 text-sm font-medium rounded-md transition ${selectedDeliveryType === 'DIRECT' ? 'bg-white text-green-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                      {t('directDelivery')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedDeliveryType('PICKUP')}
                      className={`flex-1 py-1.5 text-sm font-medium rounded-md transition ${selectedDeliveryType === 'PICKUP' ? 'bg-white text-green-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                      {t('pickup')}
                    </button>
                  </div>
                </div>
              )}

              {selectedCityId && selectedDeliveryType === 'PICKUP' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('pickupPoint')}</label>
                  <select
                    value={selectedPickupId}
                    onChange={(e) => setSelectedPickupId(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-green-500 bg-white"
                  >
                    <option value="">-- Select Point --</option>
                    {locations.filter(l => l.type === 'PICKUP_POINT' && l.parentId === selectedCityId).map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  {locations.filter(l => l.type === 'PICKUP_POINT' && l.parentId === selectedCityId).length === 0 && (
                    <p className="text-xs text-red-500 mt-1">No pickup points available for this city.</p>
                  )}
                </div>
              )}

              <div className="pt-4">
                <button
                  onClick={handleSaveLocation}
                  disabled={!selectedCityId || (selectedDeliveryType === 'PICKUP' && !selectedPickupId)}
                  className="w-full py-2 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  {t('save')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delivery Details Modal */}
      {isDeliveryModalOpen && viewingDeliveryOrder && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90dvh]">
            {(() => {
              const details = getDeliveryDetails(viewingDeliveryOrder);
              if (!details) return null;

              return (
                <>
                  <div className="p-4 bg-gray-50 border-b flex justify-between items-center sticky top-0 bg-white z-10">
                    <h3 className="text-lg font-bold text-gray-800 flex items-center">
                      <Navigation size={20} className="mr-2 text-blue-600" />
                      {t('deliveryDetails')}
                    </h3>
                    <button onClick={() => setIsDeliveryModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                      <X size={24} />
                    </button>
                  </div>

                  <div className="p-6 overflow-y-auto space-y-6">
                    {/* Type Badge */}
                    <div className="flex items-center justify-between">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${details.type === 'PICKUP' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                        }`}>
                        {details.title}
                      </span>
                      {details.coordinates && (
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${details.coordinates.lat},${details.coordinates.lng}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center text-sm font-medium text-blue-600 hover:underline"
                        >
                          <MapPin size={16} className="mr-1" />
                          {t('openMaps')}
                        </a>
                      )}
                    </div>

                    {/* Address Info */}
                    <div>
                      <h4 className="text-sm font-bold text-gray-500 uppercase mb-2">Address Info</h4>
                      <div className="bg-gray-50 p-4 rounded-lg border border-gray-100">
                        <p className="text-lg font-bold text-gray-800">{details.name}</p>
                        {details.address && <p className="text-gray-600 mt-1">{details.address}</p>}
                        {details.coordinates ? (
                          <p className="text-xs font-mono text-gray-400 mt-2">
                            Lat: {details.coordinates.lat}, Lng: {details.coordinates.lng}
                          </p>
                        ) : (
                          <p className="text-xs text-red-400 mt-2 flex items-center">
                            <AlertCircle size={12} className="mr-1" />
                            {t('noCoords')}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Visual Image */}
                    <div>
                      <h4 className="text-sm font-bold text-gray-500 uppercase mb-2">Visual Reference</h4>
                      {details.image ? (
                        <div className="rounded-xl overflow-hidden border border-gray-200 shadow-sm h-64 bg-gray-100">
                          <img src={details.image} alt="Location" className="w-full h-full object-cover" />
                        </div>
                      ) : (
                        <div className="h-32 bg-gray-50 rounded-xl border border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-400">
                          <ImageIcon size={32} className="mb-2 opacity-50" />
                          <span className="text-sm">{t('noImage')}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="p-4 border-t bg-gray-50 flex justify-end sticky bottom-0">
                    <button
                      onClick={() => setIsDeliveryModalOpen(false)}
                      className="px-6 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition"
                    >
                      {t('close')}
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

    </div>
  );
};
