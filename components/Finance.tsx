
import React, { useState, useMemo } from 'react';
import { TRANSLATIONS } from '../constants';
import { Language, Order, Product, RoleDef } from '../types';
import { AlertCircle, TrendingUp, Download, Calendar, Printer, FileText, Sparkles } from 'lucide-react';
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { analyzeBusinessData } from '../services/geminiService';

interface FinanceProps {
  orders: Order[];
  products: Product[];
  lang: Language;
  currentRole: RoleDef;
}

type Timeframe = 'WEEK' | 'MONTH' | 'YEAR';

export const Finance: React.FC<FinanceProps> = ({ orders, products, lang, currentRole }) => {
  const t = (key: string) => {
    if (!TRANSLATIONS[key]) {
      console.warn(`Missing translation key: ${key}`);
      return key;
    }
    return TRANSLATIONS[key][lang];
  };
  const [timeframe, setTimeframe] = useState<Timeframe>('YEAR'); // Default to Year to show mock data
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [aiReport, setAiReport] = useState('');

  // Access Control
  if (!currentRole.permissions.includes('VIEW_FINANCE')) {
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

  // Filter Orders by Timeframe
  const filteredOrders = useMemo(() => {
    const now = new Date();
    // Use a fixed reference date for mock data if needed, or real now.
    // For this demo, assuming mock data is relatively recent or we want to show it anyway.
    // The Mock data has dates in 2023. Let's assume current year is 2023 for demo purposes or just filter loosely.

    return orders.filter(order => {
      const orderDate = new Date(order.date);
      const diffTime = Math.abs(now.getTime() - orderDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (timeframe === 'WEEK') return diffDays <= 7;
      if (timeframe === 'MONTH') return diffDays <= 30;
      return true; // YEAR or All Time
    });
  }, [orders, timeframe]);

  // Aggregate Data per Product
  const productFinancials = useMemo(() => {
    const map = new Map<string, {
      name: string;
      category: string;
      unitsSold: number;
      revenue: number;
    }>();

    // Initialize all products
    products.forEach(p => {
      map.set(p.id, {
        name: p.name,
        category: p.category,
        unitsSold: 0,
        revenue: 0,
      });
    });

    // Sum up orders
    filteredOrders.forEach(order => {
      order.items.forEach(item => {
        if (map.has(item.productId)) {
          const entry = map.get(item.productId)!;
          entry.unitsSold += item.quantity;
          entry.revenue += item.price * item.quantity;
        }
      });
    });

    return Array.from(map.values()).map(p => {
      // Simple Forecast Logic: 
      // If Weekly: assume next week is +5% to +15% volatility
      // If Monthly: assume +2% to +10%
      const growthRate = (Math.random() * 0.15); // 0-15% random growth for demo
      const projected = Math.round(p.revenue * (1 + growthRate));

      return {
        ...p,
        growth: (growthRate * 100).toFixed(1) + '%',
        projectedRevenue: projected
      };
    }).sort((a, b) => b.revenue - a.revenue);

  }, [filteredOrders, products]);

  const totalRevenue = productFinancials.reduce((sum, p) => sum + p.revenue, 0);
  const totalProjected = productFinancials.reduce((sum, p) => sum + p.projectedRevenue, 0);

  const handlePrint = () => {
    const doc = new jsPDF();

    doc.setFontSize(18);
    doc.text(`${t('financialReport')} - ${t(timeframe.toLowerCase())}`, 14, 20);

    doc.setFontSize(12);
    doc.text(`${t('date')}: ${new Date().toLocaleDateString()}`, 14, 30);
    doc.text(`${t('revenue')}: ${totalRevenue.toLocaleString()} FCFA`, 14, 38);

    const tableData = productFinancials.map(p => [
      p.name,
      p.category,
      p.unitsSold,
      `${p.revenue.toLocaleString()} FCFA`,
      p.growth,
      `${p.projectedRevenue.toLocaleString()} FCFA`
    ]);

    autoTable(doc, {
      startY: 45,
      head: [[t('productName'), t('category'), t('salesVolume'), t('periodRevenue'), t('growth'), t('projectedRevenue')]],
      body: tableData,
    });

    doc.save(`financial_report_${timeframe}_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const handleGenerateAIReport = async () => {
    setIsGeneratingReport(true);
    const context = JSON.stringify({
      timeframe,
      totalRevenue,
      totalProjected,
      topProducts: productFinancials.slice(0, 3),
      lowPerforming: productFinancials.slice(-3).filter(p => p.revenue > 0)
    });

    const prompt = `Generate a professional financial executive summary for my grocery store based on the provided data. Highlight top performers and forecast.`;
    const response = await analyzeBusinessData(prompt, context, lang);
    setAiReport(response);
    setIsGeneratingReport(false);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">{t('finance')}</h1>
          <p className="text-gray-500 text-sm mt-1">{t('track')} & {t('forecast')}</p>
        </div>

        <div className="flex flex-wrap gap-1 items-center bg-white rounded-lg p-1 border border-gray-200 shadow-sm w-full md:w-auto">
          <button
            onClick={() => setTimeframe('WEEK')}
            className={`flex-1 md:flex-none px-4 py-1.5 rounded-md text-sm font-medium transition whitespace-nowrap ${timeframe === 'WEEK' ? 'bg-green-100 text-green-700' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            {t('weekly')}
          </button>
          <button
            onClick={() => setTimeframe('MONTH')}
            className={`flex-1 md:flex-none px-4 py-1.5 rounded-md text-sm font-medium transition whitespace-nowrap ${timeframe === 'MONTH' ? 'bg-green-100 text-green-700' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            {t('monthly')}
          </button>
          <button
            onClick={() => setTimeframe('YEAR')}
            className={`flex-1 md:flex-none px-4 py-1.5 rounded-md text-sm font-medium transition whitespace-nowrap ${timeframe === 'YEAR' ? 'bg-green-100 text-green-700' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            {t('yearly')}
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <p className="text-gray-500 text-sm font-bold uppercase mb-2">{t('periodRevenue')}</p>
          <h3 className="text-3xl font-bold text-gray-800">{totalRevenue.toLocaleString()} <span className="text-sm text-gray-400 font-normal">FCFA</span></h3>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <p className="text-gray-500 text-sm font-bold uppercase mb-2">{t('projectedRevenue')}</p>
          <div className="flex items-end gap-2">
            <h3 className="text-3xl font-bold text-indigo-600">{totalProjected.toLocaleString()} <span className="text-sm text-indigo-300 font-normal">FCFA</span></h3>
            <span className="text-xs text-green-500 font-bold mb-1 flex items-center">
              <TrendingUp size={12} className="mr-1" />
              +12.5%
            </span>
          </div>
        </div>
        <div className="bg-gradient-to-br from-gray-800 to-gray-900 text-white p-6 rounded-2xl shadow-sm flex flex-col justify-between">
          <div>
            <p className="text-gray-300 text-sm font-bold uppercase mb-2">AI Insights</p>
            <p className="text-sm text-gray-300 line-clamp-3">
              {aiReport || (lang === 'en' ? "Click 'Generate Report' to analyze financial health." : "Cliquez sur 'Générer Rapport' pour analyser.")}
            </p>
          </div>
          <button
            onClick={handleGenerateAIReport}
            disabled={isGeneratingReport}
            className="mt-4 w-full py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm font-medium transition flex items-center justify-center"
          >
            {isGeneratingReport ? (
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
            ) : (
              <>
                <Sparkles size={14} className="mr-2" />
                {t('generateReport')}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <h2 className="text-lg font-bold text-gray-800 flex items-center">
            <Calendar size={18} className="mr-2 text-gray-400" />
            {t('financialReport')}
          </h2>
          <button
            onClick={handlePrint}
            className="w-full md:w-auto flex items-center justify-center px-4 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition text-sm font-medium"
          >
            <Printer size={16} className="mr-2" />
            {t('printReport')}
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                <th className="p-4">{t('productName')}</th>
                <th className="p-4">{t('category')}</th>
                <th className="p-4 text-center">{t('salesVolume')}</th>
                <th className="p-4 text-right">{t('periodRevenue')}</th>
                <th className="p-4 text-center">{t('growth')} (Est.)</th>
                <th className="p-4 text-right bg-indigo-50/50 text-indigo-900">{t('forecast')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {productFinancials.length > 0 ? productFinancials.map((p, idx) => (
                <tr key={idx} className="hover:bg-gray-50 transition">
                  <td className="p-4 font-medium text-gray-800 whitespace-nowrap">{p.name}</td>
                  <td className="p-4 text-sm text-gray-500 whitespace-nowrap">{p.category}</td>
                  <td className="p-4 text-center text-sm">{p.unitsSold}</td>
                  <td className="p-4 text-right font-medium whitespace-nowrap">{p.revenue.toLocaleString()}</td>
                  <td className="p-4 text-center text-sm text-green-600 flex justify-center items-center">
                    <TrendingUp size={12} className="mr-1" />
                    {p.growth}
                  </td>
                  <td className="p-4 text-right font-bold text-indigo-600 bg-indigo-50/30 whitespace-nowrap">
                    {p.projectedRevenue.toLocaleString()}
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-gray-500">
                    No financial data available for this period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
