
import React, { useState, useEffect } from 'react';
import { TRANSLATIONS } from '../constants';
import { Language, AbandonedCart, RoleDef } from '../types';
import { ShoppingCart, Trash2, Mail, Phone, Clock, AlertCircle, ChevronDown, ChevronUp, User } from 'lucide-react';
import { api } from '../services/api';

interface AbandonedCartsProps {
    lang: Language;
    currentRole: RoleDef;
}

export const AbandonedCarts: React.FC<AbandonedCartsProps> = ({ lang, currentRole }) => {
    const t = (key: string) => TRANSLATIONS[key][lang];
    const [carts, setCarts] = useState<AbandonedCart[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [expandedCartId, setExpandedCartId] = useState<string | null>(null);

    useEffect(() => {
        fetchCarts();
    }, []);

    const fetchCarts = async () => {
        setIsLoading(true);
        try {
            const data = await api.abandonedCarts.getAll();
            setCarts(data);
        } catch (error) {
            console.error("Failed to fetch abandoned carts", error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (window.confirm(t('deleteCartWarn'))) {
            try {
                await api.abandonedCarts.delete(id);
                setCarts(prev => prev.filter(c => c.id !== id));
            } catch (error) {
                alert("Failed to delete cart");
            }
        }
    };

    const toggleExpand = (id: string) => {
        setExpandedCartId(expandedCartId === id ? null : id);
    };

    if (!currentRole.permissions.includes('VIEW_ABANDONED_CARTS')) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-center p-8">
                <AlertCircle size={48} className="text-red-500 mb-4" />
                <h2 className="text-xl font-bold">{t('accessDenied')}</h2>
                <p className="text-gray-500">{t('accessDeniedMsg')}</p>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">{t('abandonedCartsTitle')}</h1>
                    <p className="text-sm text-gray-500">{carts.length} {t('abandonedCartsTitle').toLowerCase()}</p>
                </div>
            </div>

            {isLoading ? (
                <div className="flex justify-center py-12">
                    <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin"></div>
                </div>
            ) : carts.length === 0 ? (
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
                    <ShoppingCart size={48} className="mx-auto text-gray-200 mb-4" />
                    <p className="text-gray-500">{t('noAbandonedCarts')}</p>
                </div>
            ) : (
                <div className="grid gap-4">
                    {carts.map(cart => (
                        <div key={cart.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition">
                            <div
                                className="p-4 flex flex-col md:flex-row justify-between items-start md:items-center cursor-pointer"
                                onClick={() => toggleExpand(cart.id)}
                            >
                                <div className="flex items-center space-x-4">
                                    <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center text-orange-600">
                                        <User size={20} />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-gray-800">{cart.customerName || cart.email || cart.phone || 'Anonymous Guest'}</h3>
                                        <div className="flex items-center text-xs text-gray-400 mt-1">
                                            <Clock size={12} className="mr-1" />
                                            <span>{t('lastActive')}: {new Date(cart.lastUpdatedAt).toLocaleString()}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-4 md:mt-0 flex items-center space-x-6 w-full md:w-auto justify-between md:justify-end">
                                    <div className="text-right">
                                        <p className="text-xs text-gray-400 uppercase font-bold tracking-wider">{t('total')}</p>
                                        <p className="font-bold text-lg text-green-600">{cart.totalAmount.toLocaleString()} FCFA</p>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <button
                                            className="p-2 text-gray-400 hover:text-red-500 transition"
                                            onClick={(e) => { e.stopPropagation(); handleDelete(cart.id); }}
                                        >
                                            <Trash2 size={20} />
                                        </button>
                                        {expandedCartId === cart.id ? <ChevronUp className="text-gray-400" /> : <ChevronDown className="text-gray-400" />}
                                    </div>
                                </div>
                            </div>

                            {expandedCartId === cart.id && (
                                <div className="px-4 pb-4 pt-2 border-t border-gray-50 space-y-4 animate-fade-in-down">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                        <div>
                                            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">{t('itemsInCart')}</h4>
                                            <ul className="space-y-2">
                                                {cart.items.map((item, idx) => (
                                                    <li key={idx} className="flex justify-between text-sm items-center">
                                                        <span className="text-gray-700 font-medium">
                                                            <span className="text-gray-400 mr-2">{item.quantity}x</span>
                                                            {item.productName}
                                                        </span>
                                                        <span className="text-gray-500">{(item.price * item.quantity).toLocaleString()} FCFA</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>

                                        <div className="space-y-4">
                                            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">{t('followUp')}</h4>
                                            <div className="flex flex-wrap gap-2">
                                                {cart.email && (
                                                    <a
                                                        href={`mailto:${cart.email}?subject=Your AgriMarket Cart`}
                                                        className="flex items-center px-4 py-2 bg-blue-50 text-blue-600 rounded-lg text-sm font-medium hover:bg-blue-100 transition"
                                                    >
                                                        <Mail size={16} className="mr-2" />
                                                        Email Customer
                                                    </a>
                                                )}
                                                {cart.phone && (
                                                    <a
                                                        href={`tel:${cart.phone}`}
                                                        className="flex items-center px-4 py-2 bg-green-50 text-green-600 rounded-lg text-sm font-medium hover:bg-green-100 transition"
                                                    >
                                                        <Phone size={16} className="mr-2" />
                                                        Call Customer
                                                    </a>
                                                )}
                                            </div>
                                            <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                                                <p className="text-xs text-gray-500">
                                                    <strong>{t('capturedAt')}:</strong> {new Date(cart.capturedAt).toLocaleString()}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
