
import React, { useState, useEffect, useRef } from 'react';
import { Layout } from './components/Layout';
import { Login } from './components/Login';
import { Dashboard } from './components/Dashboard';
import { Inventory } from './components/Inventory';
import { Orders } from './components/Orders';
import { Customers } from './components/Customers';
import { Settings } from './components/Settings';
import { Finance } from './components/Finance';
import { AbandonedCarts } from './components/AbandonedCarts';
import { TRANSLATIONS } from './constants';
import { Language, Order, Product, AppNotification, RoleDef, User, LocationDef, Customer } from './types';
import { api, resolveRoleDef } from './services/api';

export default function App() {
  const [currentView, setCurrentView] = useState('dashboard');
  const [lang, setLang] = useState<Language>('en');
  const [isLoading, setIsLoading] = useState(true); // Start true for initial session check

  // Authentication State
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // Data State (Initialized empty, populated via useEffect)
  const [roles, setRoles] = useState<RoleDef[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const seenNotificationIds = useRef<Set<string>>(new Set());
  const [categories, setCategories] = useState<string[]>([]);
  const [locations, setLocations] = useState<LocationDef[]>([]);

  // 1. Restore Session
  useEffect(() => {
    const restoreSession = async () => {
      const user = await api.auth.validateSession();
      if (user) {
        setCurrentUser(user);
      }
      setIsLoading(false);
    };
    restoreSession();
  }, []);

  // 2. Fetch Data when User is Authenticated
  useEffect(() => {
    if (!currentUser) return;

    const fetchData = async () => {
      try {
        // Phase 1 — small/fast endpoints that the dashboard needs immediately.
        // These are single-page requests so they resolve quickly.
        const [fetchedCategories, fetchedLocations, fetchedRoles] = await Promise.all([
          api.settings.getCategories(),
          api.settings.getLocations(),
          api.settings.getRoles(),
        ]);
        setCategories(fetchedCategories);
        setLocations(fetchedLocations);
        setRoles(fetchedRoles);

        // Phase 2 — heavy paginated datasets loaded in the background so the
        // UI becomes interactive as soon as Phase 1 finishes.
        Promise.all([
          api.orders.getAll(),
          api.products.getAll(),
          api.customers.getAll(),
          api.settings.getUsers(),
        ])
          .then(([fetchedOrders, fetchedProducts, fetchedCustomers, fetchedUsers]) => {
            setOrders(fetchedOrders);
            setProducts(fetchedProducts);
            setCustomers(fetchedCustomers);
            setUsers(fetchedUsers);
          })
          .catch(err => console.error('Background data load failed:', err));
      } catch (error) {
        console.error('Failed to load initial data:', error);
      }
    };

    fetchData();
  }, [currentUser]);

  const getCurrentRole = (): RoleDef | undefined => {
    if (!currentUser?.roleId) return undefined;
    return roles.find(r => r.id === currentUser.roleId) ?? resolveRoleDef(currentUser.roleId);
  };

  const handleLogin = async (u: string, p: string): Promise<boolean> => {
    try {
      const user = await api.auth.login(u, p);
      if (user) {
        setCurrentUser(user);
        return true;
      }
      return false;
    } catch (e) {
      return false;
    }
  };

  const handleLogout = () => {
    api.auth.logout();
    setCurrentUser(null);
    setCurrentView('dashboard');
    setOrders([]);
    setProducts([]);
    setCustomers([]);
    setCategories([]);
    setLocations([]);
    setRoles([]);
    setUsers([]);
    setNotifications([]);
  };

  useEffect(() => {
    const handleUnauthorized = () => {
      setCurrentUser(null);
      setCurrentView('dashboard');
      setOrders([]);
      setProducts([]);
      setCustomers([]);
      setCategories([]);
      setLocations([]);
      setRoles([]);
      setUsers([]);
      setNotifications([]);
    };

    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
  }, []);

  const handleUpdateProfile = async (updatedUser: User) => {
    try {
      const savedUser = await api.auth.updateProfile(updatedUser);
      setCurrentUser(savedUser);
      setUsers(prev => prev.map(u => u.id === savedUser.id ? savedUser : u));

      addNotification({
        title: 'Profile Updated',
        message: 'Your profile has been updated successfully.',
        type: 'success'
      });
    } catch (e) {
      console.error(e);
      alert("Failed to update profile");
    }
  };

  // Low-stock alerts — run only when the products list is populated/updated.
  useEffect(() => {
    if (!currentUser || products.length === 0) return;
    const lowStockItems = products.filter(p => p.stock < 10 && p.stock > 0);
    if (lowStockItems.length > 0) {
      addNotification({
        title: TRANSLATIONS['lowStockAlert'][lang],
        message: `${lowStockItems.length} items are running low on stock.`,
        type: 'warning',
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products.length, currentUser?.id]);

  // API notification polling — independent of product state so the interval
  // is not torn down and re-created on every inventory change.
  useEffect(() => {
    if (!currentUser) return;

    let cancelled = false;
    const poll = async () => {
      try {
        const { getAccessToken } = await import('./services/auth');
        const token = getAccessToken();
        if (!token) return;
        const res = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/notifications?limit=20`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok || cancelled) return;
        const payload = await res.json();
        const rows = Array.isArray(payload) ? payload : payload?.data ?? [];
        rows
          .filter((n: { id?: string; isRead?: boolean }) => n.id && !n.isRead && !seenNotificationIds.current.has(n.id!))
          .slice(0, 5)
          .forEach((n: { id: string; message?: string; type?: string }) => {
            seenNotificationIds.current.add(n.id);
            addNotification({
              title: TRANSLATIONS['notifications'][lang],
              message: n.message || 'New update',
              type: n.type?.toLowerCase() === 'success' ? 'success' : 'info',
            });
          });
      } catch {
        /* ignore poll errors */
      }
    };

    void poll();
    const interval = setInterval(poll, 20000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [lang, currentUser?.id]);

  const addNotification = (n: Omit<AppNotification, 'id' | 'timestamp' | 'read'>) => {
    const newNotif: AppNotification = {
      ...n,
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date(),
      read: false
    };
    setNotifications(prev => [newNotif, ...prev]);
    if (Notification.permission === 'granted') {
      new window.Notification(n.title, { body: n.message });
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission();
    }
  };

  const markAllRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  // Handlers for Settings interactions that need to update top-level state
  const handleAddCategory = async (category: string) => {
    if (!categories.includes(category)) {
      await api.settings.addCategory(category, categories);
      setCategories(prev => [...prev, category]);
      addNotification({
        title: 'Category Added',
        message: `Category "${category}" has been added successfully.`,
        type: 'success'
      });
    }
  };

  const handleDeleteCategory = async (category: string) => {
    const isUsed = products.some(p => p.category === category);
    if (isUsed) {
      alert(TRANSLATIONS['cannotDeleteCategory'][lang]);
      return;
    }

    if (window.confirm(TRANSLATIONS['deleteCategoryWarn'][lang])) {
      await api.settings.deleteCategory(category, categories);
      setCategories(prev => prev.filter(c => c !== category));
    }
  };

  // Loading Screen
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center">
          <img
            src="/logo/logo-ready.svg"
            alt="AgriMarket"
            className="w-full max-w-[300px] h-24 object-contain mb-6"
          />
          <div className="w-12 h-12 border-4 border-green-600 border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-gray-500 font-medium">Loading AgriAdmin...</p>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return <Login onLogin={handleLogin} lang={lang} />;
  }

  const currentRole = getCurrentRole();
  if (!currentRole) return <div>Error: Role not found</div>;

  const renderView = () => {
    // Basic Permission Check Wrapper
    const checkPermission = (perm: string, component: React.ReactNode) => {
      if (currentRole.permissions.includes(perm as any)) return component;
      return <Dashboard orders={orders} products={products} lang={lang} currentRole={currentRole} />;
    };

    switch (currentView) {
      case 'dashboard':
        return <Dashboard orders={orders} products={products} lang={lang} currentRole={currentRole} />;
      case 'inventory':
        return checkPermission('VIEW_INVENTORY', (
          <Inventory
            products={products}
            setProducts={setProducts}
            categories={categories}
            lang={lang}
            currentRole={currentRole}
          />
        ));
      case 'orders':
        return checkPermission('VIEW_ORDERS', (
          <Orders orders={orders} setOrders={setOrders} lang={lang} currentRole={currentRole} locations={locations} customers={customers} />
        ));
      case 'customers':
        return checkPermission('VIEW_CUSTOMERS', (
          <Customers orders={orders} setOrders={setOrders} customers={customers} setCustomers={setCustomers} lang={lang} currentRole={currentRole} />
        ));
      case 'finance':
        return checkPermission('VIEW_FINANCE', (
          <Finance orders={orders} products={products} lang={lang} currentRole={currentRole} />
        ));
      case 'abandonedCarts':
        return checkPermission('VIEW_ABANDONED_CARTS', (
          <AbandonedCarts lang={lang} currentRole={currentRole} />
        ));
      case 'settings':
        if (currentRole.permissions.includes('MANAGE_SETTINGS') || currentRole.permissions.includes('MANAGE_ACCESS_CONTROL')) {
          return (
            <Settings
              categories={categories}
              onAddCategory={handleAddCategory}
              onDeleteCategory={handleDeleteCategory}
              lang={lang}
              roles={roles}
              users={users}
              setRoles={setRoles}
              setUsers={setUsers}
              currentUser={currentUser}
              currentRole={currentRole}
              locations={locations}
              setLocations={setLocations}
            />
          );
        }
        return <Dashboard orders={orders} products={products} lang={lang} currentRole={currentRole} />;
      default:
        return <Dashboard orders={orders} products={products} lang={lang} currentRole={currentRole} />;
    }
  };

  return (
    <Layout
      currentView={currentView}
      setCurrentView={setCurrentView}
      lang={lang}
      setLang={setLang}
      notifications={notifications}
      markAllRead={markAllRead}
      currentUser={currentUser}
      currentRole={currentRole}
      onLogout={handleLogout}
      onUpdateProfile={handleUpdateProfile}
    >
      {renderView()}
    </Layout>
  );
}
