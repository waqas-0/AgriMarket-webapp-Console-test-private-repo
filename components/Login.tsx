
import React, { useState } from 'react';
import { TRANSLATIONS } from '../constants';
import { Language } from '../types';
import { Lock, User } from 'lucide-react';

interface LoginProps {
  onLogin: (username: string, password: string) => Promise<boolean>;
  lang: Language;
}

export const Login: React.FC<LoginProps> = ({ onLogin, lang }) => {
  const t = (key: string) => TRANSLATIONS[key][lang];
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(false);

    const success = await onLogin(username, password);
    if (!success) {
      setError(true);
      setIsLoading(false);
    }
    // If success, App.tsx will unmount this component, so no need to setIsLoading(false)
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-lg overflow-hidden">
        <div className="px-8 pt-8 pb-4 text-center border-b border-gray-100">
          <img
            src="/logo/logo-ready.svg"
            alt="AgriMarket"
            className="mx-auto w-full max-w-[300px] h-24 object-contain"
          />
          <p className="mt-2 text-sm font-semibold text-gray-500">AgriAdmin Control Panel</p>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          <h2 className="text-2xl font-bold text-gray-800 text-center">{t('loginTitle')}</h2>

          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm text-center">
              {t('invalidCredentials')}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email or phone</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
                  placeholder="retail-admin@agrimarket.ati"
                  disabled={isLoading}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('password')}</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
                  placeholder="••••••••"
                  disabled={isLoading}
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-green-600 text-white py-2 rounded-lg font-bold hover:bg-green-700 transition flex items-center justify-center disabled:opacity-70"
          >
            {isLoading ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : (
              t('loginBtn')
            )}
          </button>

        </form>
      </div>
    </div>
  );
};
