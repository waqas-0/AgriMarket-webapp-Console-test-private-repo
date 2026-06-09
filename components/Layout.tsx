
import React, { useState } from 'react';
import { TRANSLATIONS } from '../constants';
import { Language, AppNotification, Permission, User, RoleDef } from '../types';
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Languages,
  LogOut,
  Menu,
  Bell,
  Settings as SettingsIcon,
  Users,
  TrendingUp,
  UserCircle,
  X,
  Upload,
  Camera,
  Clock
} from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
  currentView: string;
  setCurrentView: (view: string) => void;
  lang: Language;
  setLang: (lang: Language) => void;
  notifications: AppNotification[];
  markAllRead: () => void;
  currentUser: User;
  currentRole: RoleDef;
  onLogout: () => void;
  onUpdateProfile: (user: User) => void;
}

export const Layout: React.FC<LayoutProps> = ({
  children,
  currentView,
  setCurrentView,
  lang,
  setLang,
  notifications,
  markAllRead,
  currentUser,
  currentRole,
  onLogout,
  onUpdateProfile
}) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);

  // Profile Modal State
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [profileForm, setProfileForm] = useState({
    name: '',
    password: '',
    image: ''
  });

  const t = (key: string) => TRANSLATIONS[key][lang];
  const unreadCount = notifications.filter(n => !n.read).length;

  const openProfileModal = () => {
    setProfileForm({
      name: currentUser.name,
      password: '', // Don't show current password
      image: currentUser.image || ''
    });
    setIsProfileModalOpen(true);
    setIsMobileMenuOpen(false);
  };

  const handleProfileImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setProfileForm(prev => ({ ...prev, image: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleProfileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const updatedUser: User = {
      ...currentUser,
      name: profileForm.name,
      image: profileForm.image
    };

    if (profileForm.password) {
      updatedUser.password = profileForm.password;
    }

    onUpdateProfile(updatedUser);
    setIsProfileModalOpen(false);
  };

  const NavItem = ({ view, icon: Icon, label, permission }: { view: string; icon: any; label: string, permission: Permission }) => {
    // Check if the current role has the required permission
    if (!currentRole.permissions.includes(permission)) return null;

    return (
      <button
        onClick={() => {
          setCurrentView(view);
          setIsMobileMenuOpen(false);
        }}
        className={`w-full flex items-center space-x-3 px-6 py-4 transition-colors duration-200 ${currentView === view
          ? 'bg-green-50 text-green-700 border-r-4 border-green-600'
          : 'text-gray-500 hover:bg-gray-50 hover:text-green-600'
          }`}
      >
        <Icon size={20} />
        <span className="font-medium">{label}</span>
      </button>
    );
  };

  const NotificationPanel = () => (
    <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-xl border border-gray-100 z-50 overflow-hidden">
      <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
        <h3 className="font-semibold text-gray-800">{t('notifications')}</h3>
        {unreadCount > 0 && (
          <button onClick={markAllRead} className="text-xs text-green-600 hover:text-green-800 font-medium">
            {t('markRead')}
          </button>
        )}
      </div>
      <div className="max-h-80 overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="p-6 text-center text-gray-400 text-sm">
            {t('noNotifications')}
          </div>
        ) : (
          notifications.map(n => (
            <div key={n.id} className={`p-4 border-b border-gray-50 hover:bg-gray-50 transition ${!n.read ? 'bg-blue-50/30' : ''}`}>
              <div className="flex justify-between items-start mb-1">
                <span className={`text-sm font-semibold ${n.type === 'warning' ? 'text-amber-600' :
                  n.type === 'success' ? 'text-green-600' : 'text-blue-600'
                  }`}>
                  {n.title}
                </span>
                <span className="text-[10px] text-gray-400">
                  {new Date(n.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <p className="text-sm text-gray-600">{n.message}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );

  return (
    <div className="flex h-[100dvh] bg-gray-50 overflow-hidden">
      {/* Sidebar for Desktop */}
      <aside className="hidden md:flex md:flex-col w-64 bg-white border-r border-gray-200 shadow-sm z-10">
        <div className="px-6 pt-6 pb-4">
          <img
            src="/logo/logo-ready.svg"
            alt="AgriMarket"
            className="w-full max-w-[260px] h-20 object-contain object-left"
          />
          <p className="mt-2 text-sm font-semibold text-gray-500 tracking-wide">AgriAdmin</p>
        </div>

        <div className="px-6 py-2">
          <div
            onClick={openProfileModal}
            className="bg-gray-100 p-3 rounded-lg flex items-center space-x-3 cursor-pointer hover:bg-gray-200 transition-colors"
            title={t('clickToEditProfile')}
          >
            {currentUser.image ? (
              <img src={currentUser.image} alt={currentUser.name} className="w-8 h-8 rounded-full object-cover" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-green-200 flex items-center justify-center text-green-800 font-bold">
                {currentUser.name.charAt(0)}
              </div>
            )}
            <div className="flex flex-col overflow-hidden">
              <span className="text-sm font-bold text-gray-800 truncate">{currentUser.name}</span>
              <span className="text-xs text-gray-500 truncate">{currentRole.name}</span>
            </div>
          </div>
        </div>

        <nav className="flex-1 mt-4">
          <NavItem
            view="dashboard"
            icon={LayoutDashboard}
            label={t('dashboard')}
            permission='VIEW_DASHBOARD'
          />
          <NavItem
            view="finance"
            icon={TrendingUp}
            label={t('finance')}
            permission='VIEW_FINANCE'
          />
          <NavItem
            view="orders"
            icon={ShoppingCart}
            label={t('orders')}
            permission='VIEW_ORDERS'
          />
          <NavItem
            view="customers"
            icon={Users}
            label={t('customers')}
            permission='VIEW_CUSTOMERS'
          />
          <NavItem
            view="abandonedCarts"
            icon={Clock}
            label={t('abandonedCarts')}
            permission='VIEW_ABANDONED_CARTS'
          />
          <NavItem
            view="inventory"
            icon={Package}
            label={t('inventory')}
            permission='VIEW_INVENTORY'
          />
          {/* Show Settings if user can manage settings OR manage access control */}
          {(currentRole.permissions.includes('MANAGE_SETTINGS') || currentRole.permissions.includes('MANAGE_ACCESS_CONTROL')) && (
            <button
              onClick={() => {
                setCurrentView('settings');
                setIsMobileMenuOpen(false);
              }}
              className={`w-full flex items-center space-x-3 px-6 py-4 transition-colors duration-200 ${currentView === 'settings'
                ? 'bg-green-50 text-green-700 border-r-4 border-green-600'
                : 'text-gray-500 hover:bg-gray-50 hover:text-green-600'
                }`}
            >
              <SettingsIcon size={20} />
              <span className="font-medium">{t('settings')}</span>
            </button>
          )}
        </nav>

        <div className="p-4 border-t border-gray-100">
          <button
            onClick={() => setLang(lang === 'en' ? 'fr' : 'en')}
            className="flex items-center space-x-3 px-4 py-3 w-full text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <Languages size={18} />
            <span>{lang === 'en' ? 'Français' : 'English'}</span>
          </button>
          <button
            onClick={onLogout}
            className="mt-2 flex items-center space-x-3 px-4 py-3 text-red-500 cursor-pointer hover:bg-red-50 rounded-lg w-full"
          >
            <LogOut size={18} />
            <span>{t('logout')}</span>
          </button>
        </div>
      </aside>

      {/* Mobile Header & Overlay */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <header className="bg-white border-b border-gray-200 p-4 flex justify-between items-center z-20 sticky top-0">
          <div className="flex items-center space-x-3 md:hidden">
            <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
              <Menu className="text-gray-600" />
            </button>
            <div className="flex items-center space-x-2 md:hidden">
              <img
                src="/logo/logo-ready.svg"
                alt="AgriMarket"
                className="h-12 w-auto max-w-[200px] object-contain object-left"
              />
            </div>
          </div>

          {/* Top Right Actions */}
          <div className="flex items-center space-x-4 ml-auto">
            {/* Notification Bell */}
            <div className="relative">
              <button
                onClick={() => setIsNotifOpen(!isNotifOpen)}
                className="p-2 text-gray-500 hover:bg-gray-100 rounded-full relative transition-colors"
              >
                <Bell size={20} />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white"></span>
                )}
              </button>
              {isNotifOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsNotifOpen(false)}></div>
                  <NotificationPanel />
                </>
              )}
            </div>
            <div
              className="hidden md:flex items-center space-x-2 cursor-pointer"
              onClick={openProfileModal}
            >
              {currentUser.image ? (
                <img src={currentUser.image} alt={currentUser.name} className="w-8 h-8 rounded-full object-cover ring-2 ring-gray-100" />
              ) : (
                <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center text-gray-600 font-bold hover:bg-gray-300 transition-colors">
                  {currentUser.name.charAt(0)}
                </div>
              )}
            </div>
          </div>
        </header>

        {isMobileMenuOpen && (
          <div className="fixed inset-0 bg-gray-800 bg-opacity-50 z-30 md:hidden" onClick={() => setIsMobileMenuOpen(false)}>
            <div className="absolute left-0 top-0 bottom-0 w-64 bg-white shadow-xl flex flex-col" onClick={e => e.stopPropagation()}>
              <div
                className="p-6 border-b flex items-center space-x-3 bg-gray-50 cursor-pointer"
                onClick={openProfileModal}
              >
                {currentUser.image ? (
                  <img src={currentUser.image} alt={currentUser.name} className="w-10 h-10 rounded-full object-cover" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-green-200 flex items-center justify-center text-green-800 font-bold">
                    {currentUser.name.charAt(0)}
                  </div>
                )}
                <div className="overflow-hidden">
                  <h2 className="font-bold text-gray-800 truncate">{currentUser.name}</h2>
                  <p className="text-xs text-gray-500">{t('clickToEditProfile')}</p>
                </div>
              </div>
              <nav className="flex-1 overflow-y-auto">
                <NavItem
                  view="dashboard"
                  icon={LayoutDashboard}
                  label={t('dashboard')}
                  permission='VIEW_DASHBOARD'
                />
                <NavItem
                  view="finance"
                  icon={TrendingUp}
                  label={t('finance')}
                  permission='VIEW_FINANCE'
                />
                <NavItem
                  view="orders"
                  icon={ShoppingCart}
                  label={t('orders')}
                  permission='VIEW_ORDERS'
                />
                <NavItem
                  view="customers"
                  icon={Users}
                  label={t('customers')}
                  permission='VIEW_CUSTOMERS'
                />
                <NavItem
                  view="abandonedCarts"
                  icon={Clock}
                  label={t('abandonedCarts')}
                  permission='VIEW_ABANDONED_CARTS'
                />
                <NavItem
                  view="inventory"
                  icon={Package}
                  label={t('inventory')}
                  permission='VIEW_INVENTORY'
                />
                {(currentRole.permissions.includes('MANAGE_SETTINGS') || currentRole.permissions.includes('MANAGE_ACCESS_CONTROL')) && (
                  <button
                    onClick={() => {
                      setCurrentView('settings');
                      setIsMobileMenuOpen(false);
                    }}
                    className="w-full flex items-center space-x-3 px-6 py-4 transition-colors duration-200 text-gray-500 hover:bg-gray-50 hover:text-green-600"
                  >
                    <SettingsIcon size={20} />
                    <span className="font-medium">{t('settings')}</span>
                  </button>
                )}
              </nav>
              <div className="p-4 border-t border-gray-100 bg-gray-50">
                <button
                  onClick={() => setLang(lang === 'en' ? 'fr' : 'en')}
                  className="flex items-center space-x-3 px-4 py-2 w-full text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <Languages size={18} />
                  <span>{lang === 'en' ? 'Français' : 'English'}</span>
                </button>
                <button
                  onClick={onLogout}
                  className="mt-2 flex items-center space-x-3 px-4 py-2 text-red-500 cursor-pointer hover:bg-red-50 rounded-lg w-full"
                >
                  <LogOut size={18} />
                  <span>{t('logout')}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8 relative scroll-smooth">
          {children}
        </main>
      </div>

      {/* Profile Modal */}
      {isProfileModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 max-h-[90dvh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-gray-800">{t('myProfile')}</h3>
              <button onClick={() => setIsProfileModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleProfileSubmit} className="space-y-6">
              {/* Image Upload */}
              <div className="flex flex-col items-center">
                <div className="relative group cursor-pointer w-24 h-24 rounded-full overflow-hidden bg-gray-100 border-2 border-gray-200">
                  {profileForm.image ? (
                    <img src={profileForm.image} alt="Profile" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400">
                      <UserCircle size={48} />
                    </div>
                  )}
                  <label className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white cursor-pointer">
                    <Camera size={24} />
                    <input type="file" accept="image/*" onChange={handleProfileImageUpload} className="hidden" />
                  </label>
                </div>
                <p className="text-xs text-gray-500 mt-2">{t('profileImage')}</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                <input
                  type="text"
                  value={profileForm.name}
                  onChange={e => setProfileForm({ ...profileForm, name: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-green-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('newPassword')}</label>
                <input
                  type="password"
                  value={profileForm.password}
                  onChange={e => setProfileForm({ ...profileForm, password: e.target.value })}
                  placeholder="Leave blank to keep current"
                  className="w-full border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsProfileModalOpen(false)}
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
