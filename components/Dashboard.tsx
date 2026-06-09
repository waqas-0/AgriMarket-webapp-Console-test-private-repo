
import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TRANSLATIONS } from '../constants';
import { Language, Order, OrderStatus, RoleDef } from '../types';
import { DollarSign, ShoppingBag, AlertTriangle, TrendingUp, AlertCircle } from 'lucide-react';
import { analyzeBusinessData } from '../services/geminiService';

interface DashboardProps {
  orders: Order[];
  products: any[]; // Using any to simplify for aggregate checks
  lang: Language;
  currentRole?: RoleDef; // Make optional for backward compatibility if needed, but should be passed
}

export const Dashboard: React.FC<DashboardProps> = ({ orders, products, lang, currentRole }) => {
  const t = (key: string) => TRANSLATIONS[key][lang];
  const [aiQuery, setAiQuery] = React.useState('');
  const [aiResponse, setAiResponse] = React.useState('');
  const [isAnalyzing, setIsAnalyzing] = React.useState(false);

  // Access Control check
  if (currentRole && !currentRole.permissions.includes('VIEW_DASHBOARD')) {
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

  const stats = useMemo(() => {
    const totalSales = orders.reduce((sum, order) => sum + order.totalAmount, 0);
    const activeOrders = orders.filter(o => o.status !== OrderStatus.DELIVERED && o.status !== OrderStatus.CANCELLED).length;
    const lowStock = products.filter(p => p.stock < 10).length;
    return { totalSales, activeOrders, lowStock };
  }, [orders, products]);

  const chartData = useMemo(() => {
    // Simple mock data for the chart, in real app would aggregate by date from orders
    return [
      { name: 'Mon', sales: 4000 },
      { name: 'Tue', sales: 3000 },
      { name: 'Wed', sales: 2000 },
      { name: 'Thu', sales: 2780 },
      { name: 'Fri', sales: 1890 },
      { name: 'Sat', sales: 2390 },
      { name: 'Sun', sales: 3490 },
    ];
  }, []);

  const handleAskAI = async () => {
    if (!aiQuery.trim()) return;
    setIsAnalyzing(true);
    // Prepare a lightweight context
    const context = JSON.stringify({
      totalSales: stats.totalSales,
      activeOrders: stats.activeOrders,
      lowStockCount: stats.lowStock,
      recentOrders: orders.slice(0, 5),
    });
    
    const response = await analyzeBusinessData(aiQuery, context, lang);
    setAiResponse(response);
    setIsAnalyzing(false);
  };

  const StatCard = ({ title, value, icon: Icon, color }: any) => (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-start justify-between">
      <div>
        <p className="text-gray-500 text-sm font-medium mb-1">{title}</p>
        <h3 className="text-2xl font-bold text-gray-800">{value}</h3>
      </div>
      <div className={`p-3 rounded-full ${color}`}>
        <Icon size={24} className="text-white" />
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-800">{t('dashboard')}</h1>
        <span className="text-sm text-gray-500">{new Date().toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <StatCard 
          title={t('revenue')} 
          value={`${stats.totalSales.toLocaleString()} FCFA`} 
          icon={DollarSign} 
          color="bg-green-500" 
        />
        <StatCard 
          title={t('activeOrders')} 
          value={stats.activeOrders} 
          icon={ShoppingBag} 
          color="bg-blue-500" 
        />
        <StatCard 
          title={t('lowStock')} 
          value={stats.lowStock} 
          icon={AlertTriangle} 
          color="bg-amber-500" 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart Section */}
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-bold text-gray-800 mb-6 flex items-center">
            <TrendingUp size={20} className="mr-2 text-green-600" />
            {t('totalSales')} (Weekly)
          </h3>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#9ca3af'}} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#9ca3af'}} />
                <Tooltip 
                  cursor={{fill: '#f3f4f6'}}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                />
                <Bar dataKey="sales" fill="#16a34a" radius={[4, 4, 0, 0]} barSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* AI Assistant Section */}
        <div className="lg:col-span-1 bg-gradient-to-br from-indigo-600 to-violet-700 p-6 rounded-2xl shadow-md text-white flex flex-col">
          <h3 className="text-lg font-bold mb-2 flex items-center">
             <span className="mr-2">✨</span> {t('aiAssistant')}
          </h3>
          <p className="text-indigo-100 text-sm mb-4">
             {lang === 'en' ? 'Get insights about your grocery business instantly.' : 'Obtenez des informations sur votre commerce instantanément.'}
          </p>
          
          <div className="flex-1 overflow-y-auto mb-4 bg-white/10 rounded-lg p-3 text-sm min-h-[150px]">
             {isAnalyzing ? (
               <div className="flex items-center justify-center h-full">
                 <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
               </div>
             ) : aiResponse ? (
               <p className="whitespace-pre-wrap leading-relaxed">{aiResponse}</p>
             ) : (
               <p className="text-indigo-200 italic text-center mt-10">
                 {lang === 'en' ? 'Ask me about sales trends or stock alerts...' : 'Demandez-moi les tendances des ventes ou alertes de stock...'}
               </p>
             )}
          </div>

          <div className="relative">
             <input 
               type="text" 
               value={aiQuery}
               onChange={(e) => setAiQuery(e.target.value)}
               placeholder={t('askAi')}
               className="w-full bg-white/20 border border-indigo-400/30 text-white placeholder-indigo-200 rounded-lg py-2 px-3 pr-10 focus:outline-none focus:ring-2 focus:ring-white/50"
               onKeyDown={(e) => e.key === 'Enter' && handleAskAI()}
             />
             <button 
               onClick={handleAskAI}
               className="absolute right-2 top-2 text-indigo-200 hover:text-white"
             >
               <TrendingUp size={18} />
             </button>
          </div>
        </div>
      </div>
    </div>
  );
};
