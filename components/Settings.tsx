
import React, { useState } from 'react';
import { TRANSLATIONS, ALL_PERMISSIONS } from '../constants';
import { Language, RoleDef, User, Permission, LocationDef } from '../types';
import { Trash2, Plus, AlertCircle, Save, CheckSquare, Square, Edit, Shield, Users, Grid, UserCircle, Camera, MapPin, Map, ImageIcon, Upload, X } from 'lucide-react';
import { api } from '../services/api';

interface SettingsProps {
  categories: string[];
  onAddCategory: (category: string) => void;
  onDeleteCategory: (category: string) => void;
  lang: Language;
  
  // Access Control Props
  roles: RoleDef[];
  users: User[];
  setRoles: React.Dispatch<React.SetStateAction<RoleDef[]>>;
  setUsers: React.Dispatch<React.SetStateAction<User[]>>;
  currentUser: User;
  currentRole: RoleDef;
  
  // Location Props
  locations: LocationDef[];
  setLocations: React.Dispatch<React.SetStateAction<LocationDef[]>>;
}

export const Settings: React.FC<SettingsProps> = ({ 
  categories, 
  onAddCategory, 
  onDeleteCategory, 
  lang, 
  roles,
  users,
  setRoles,
  setUsers,
  currentUser,
  currentRole,
  locations,
  setLocations
}) => {
  const t = (key: string) => TRANSLATIONS[key][lang];
  const [activeTab, setActiveTab] = useState<'general' | 'locations' | 'roles' | 'users'>('general');

  // Category State
  const [newCategory, setNewCategory] = useState('');
  
  // Location State
  const [newCityName, setNewCityName] = useState('');
  const [newPickupNames, setNewPickupNames] = useState<{[key: string]: string}>({}); // Map cityId -> input value
  
  // Location Edit Modal State
  const [isLocationEditModalOpen, setIsLocationEditModalOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState<LocationDef | null>(null);
  const [locationForm, setLocationForm] = useState<{name: string, lat: string, lng: string, image: string}>({
      name: '', lat: '', lng: '', image: ''
  });

  // Role State
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleDef | null>(null);
  const [roleForm, setRoleForm] = useState<{name: string, permissions: Permission[]}>({ name: '', permissions: [] });

  // User State
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userForm, setUserForm] = useState<Partial<User>>({ name: '', username: '', password: '', roleId: '', image: '' });

  // Permissions
  const canManageSettings = currentRole.permissions.includes('MANAGE_SETTINGS');
  const canManageAccess = currentRole.permissions.includes('MANAGE_ACCESS_CONTROL');

  if (!canManageSettings && !canManageAccess) {
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

  // --- Category Handlers ---
  const handleAddCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (newCategory.trim()) {
      onAddCategory(newCategory.trim());
      setNewCategory('');
    }
  };
  
  // --- Location Handlers ---
  const handleAddCity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newCityName.trim()) {
        const newCity: LocationDef = {
            id: `loc_${Date.now()}`,
            name: newCityName.trim(),
            type: 'CITY'
        };
        const saved = await api.settings.saveLocation(newCity);
        if(saved) setLocations(prev => [...prev, saved]);
        setNewCityName('');
    }
  };

  const handleAddPickup = async (cityId: string) => {
      const name = newPickupNames[cityId];
      if (name && name.trim()) {
          const newPickup: LocationDef = {
              id: `loc_pt_${Date.now()}`,
              name: name.trim(),
              type: 'PICKUP_POINT',
              parentId: cityId
          };
          const saved = await api.settings.saveLocation(newPickup);
          if (saved) {
            setLocations(prev => [...prev, saved]);
            setNewPickupNames(prev => ({...prev, [cityId]: ''}));
          }
      }
  };

  const deleteLocation = async (id: string) => {
      if (window.confirm("Are you sure? Deleting a city will delete its pickup points.")) {
          await api.settings.deleteLocation(id);
          setLocations(prev => prev.filter(l => l.id !== id && l.parentId !== id));
      }
  };

  const openLocationEditModal = (location: LocationDef) => {
      setEditingLocation(location);
      setLocationForm({
          name: location.name,
          lat: location.coordinates?.lat.toString() || '',
          lng: location.coordinates?.lng.toString() || '',
          image: location.image || ''
      });
      setIsLocationEditModalOpen(true);
  };

  const handleLocationImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setLocationForm(prev => ({ ...prev, image: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const saveLocation = async () => {
      if (!editingLocation) return;
      
      const updatedLocation: LocationDef = {
          ...editingLocation,
          name: locationForm.name,
          image: locationForm.image,
          coordinates: (locationForm.lat && locationForm.lng) ? {
              lat: parseFloat(locationForm.lat),
              lng: parseFloat(locationForm.lng)
          } : undefined
      };

      const saved = await api.settings.saveLocation(updatedLocation);
      if (saved) {
        setLocations(prev => prev.map(l => l.id === editingLocation.id ? saved : l));
        setIsLocationEditModalOpen(false);
      }
  };


  // --- Role Handlers ---
  const openRoleModal = (role?: RoleDef) => {
    if (role) {
      setEditingRole(role);
      setRoleForm({ name: role.name, permissions: role.permissions });
    } else {
      setEditingRole(null);
      setRoleForm({ name: '', permissions: [] });
    }
    setIsRoleModalOpen(true);
  };

  const togglePermission = (permId: Permission) => {
    setRoleForm(prev => {
      const hasPerm = prev.permissions.includes(permId);
      return {
        ...prev,
        permissions: hasPerm 
          ? prev.permissions.filter(p => p !== permId)
          : [...prev.permissions, permId]
      };
    });
  };

  const saveRole = async () => {
    if (!roleForm.name) return;
    
    let newRole: RoleDef;
    if (editingRole) {
      newRole = { ...editingRole, ...roleForm };
    } else {
      newRole = {
        id: `role_${Date.now()}`,
        name: roleForm.name,
        permissions: roleForm.permissions,
        isSystem: false
      };
    }

    const saved = await api.settings.saveRole(newRole);
    if(saved) {
      if(editingRole) {
        setRoles(prev => prev.map(r => r.id === editingRole.id ? saved : r));
      } else {
        setRoles(prev => [...prev, saved]);
      }
      setIsRoleModalOpen(false);
    }
  };

  const deleteRole = async (roleId: string) => {
    const isAssigned = users.some(u => u.roleId === roleId);
    if (isAssigned) {
      alert("Cannot delete role assigned to users.");
      return;
    }
    if (window.confirm(t('deleteRoleWarn'))) {
      await api.settings.deleteRole(roleId);
      setRoles(prev => prev.filter(r => r.id !== roleId));
    }
  };

  // --- User Handlers ---
  const openUserModal = (user?: User) => {
    if (user) {
      setEditingUser(user);
      setUserForm({ name: user.name, username: user.username, roleId: user.roleId, password: '', image: user.image || '' });
    } else {
      setEditingUser(null);
      setUserForm({ name: '', username: '', roleId: roles[0]?.id || '', password: '', image: '' });
    }
    setIsUserModalOpen(true);
  };

  const handleUserImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setUserForm(prev => ({ ...prev, image: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const saveUser = async () => {
    if (!userForm.username || !userForm.roleId || !userForm.name) return;
    
    let userToSave: User;

    if (editingUser) {
        // Prepare update
        userToSave = { ...editingUser, ...userForm } as User;
        if (!userForm.password) delete userToSave.password;
    } else {
      if (!userForm.password) {
        alert("Password required for new user");
        return;
      }
      userToSave = {
        id: `user_${Date.now()}`,
        name: userForm.name!,
        username: userForm.username!,
        password: userForm.password!,
        roleId: userForm.roleId!,
        image: userForm.image
      };
    }

    try {
      const saved = await api.settings.saveUser(userToSave);
      if (saved) {
          if (editingUser) {
              setUsers(prev => prev.map(u => u.id === saved.id ? saved : u));
          } else {
              setUsers(prev => [...prev, saved]);
          }
          setIsUserModalOpen(false);
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to save user.');
    }
  };

  const deleteUser = async (userId: string) => {
    if (userId === currentUser.id) {
      alert("Cannot delete yourself.");
      return;
    }
    if (window.confirm(t('deleteUserWarn'))) {
      await api.settings.deleteUser(userId);
      setUsers(prev => prev.filter(u => u.id !== userId));
    }
  };

  // Helper for rendering locations
  const cities = locations.filter(l => l.type === 'CITY');
  const getPickups = (cityId: string) => locations.filter(l => l.type === 'PICKUP_POINT' && l.parentId === cityId);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-800">{t('settings')}</h1>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 bg-white rounded-t-xl overflow-hidden flex-wrap">
        {canManageSettings && (
            <>
            <button 
                onClick={() => setActiveTab('general')}
                className={`flex-1 min-w-[120px] py-4 px-6 text-sm font-medium flex items-center justify-center ${activeTab === 'general' ? 'bg-green-50 text-green-700 border-b-2 border-green-600' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
            >
                <Grid size={18} className="mr-2" />
                {t('general')}
            </button>
            <button 
                onClick={() => setActiveTab('locations')}
                className={`flex-1 min-w-[120px] py-4 px-6 text-sm font-medium flex items-center justify-center ${activeTab === 'locations' ? 'bg-green-50 text-green-700 border-b-2 border-green-600' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
            >
                <MapPin size={18} className="mr-2" />
                {t('locations')}
            </button>
            </>
        )}
        {canManageAccess && (
          <>
            <button 
              onClick={() => setActiveTab('roles')}
              className={`flex-1 min-w-[120px] py-4 px-6 text-sm font-medium flex items-center justify-center ${activeTab === 'roles' ? 'bg-green-50 text-green-700 border-b-2 border-green-600' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
            >
              <Shield size={18} className="mr-2" />
              {t('roles')}
            </button>
            <button 
              onClick={() => setActiveTab('users')}
              className={`flex-1 min-w-[120px] py-4 px-6 text-sm font-medium flex items-center justify-center ${activeTab === 'users' ? 'bg-green-50 text-green-700 border-b-2 border-green-600' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
            >
              <Users size={18} className="mr-2" />
              {t('users')}
            </button>
          </>
        )}
      </div>

      <div className="bg-white rounded-b-xl shadow-sm border border-t-0 border-gray-200 p-6">
        
        {/* === GENERAL TAB (Categories) === */}
        {activeTab === 'general' && canManageSettings && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-bold text-gray-800">{t('manageCategories')}</h2>
              <p className="text-sm text-gray-500">Add or remove product categories.</p>
            </div>
            
            <form onSubmit={handleAddCategory} className="flex gap-3">
              <input
                type="text"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                placeholder={t('categoryName')}
                className="flex-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
              />
              <button
                type="submit"
                disabled={!newCategory.trim()}
                className="px-6 py-2 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center"
              >
                <Plus size={18} className="mr-2" />
                {t('addCategory')}
              </button>
            </form>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {categories.map((cat) => (
                <div key={cat} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg border border-gray-100">
                  <span className="font-medium text-gray-800">{cat}</span>
                  <button onClick={() => onDeleteCategory(cat)} className="p-2 text-gray-400 hover:text-red-600">
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {/* === LOCATIONS TAB === */}
        {activeTab === 'locations' && canManageSettings && (
           <div className="space-y-6">
               <div>
                  <h2 className="text-lg font-bold text-gray-800">{t('manageLocations')}</h2>
                  <p className="text-sm text-gray-500">Define cities and pick-up points for order assignment.</p>
               </div>
               
               {/* Add City Form */}
               <form onSubmit={handleAddCity} className="flex gap-3 bg-gray-50 p-4 rounded-xl">
                  <input
                    type="text"
                    value={newCityName}
                    onChange={(e) => setNewCityName(e.target.value)}
                    placeholder={t('cityName')}
                    className="flex-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
                  />
                  <button
                    type="submit"
                    disabled={!newCityName.trim()}
                    className="px-6 py-2 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center whitespace-nowrap"
                  >
                    <Plus size={18} className="mr-2" />
                    {t('addCity')}
                  </button>
               </form>

               <div className="space-y-4">
                  {cities.map(city => (
                      <div key={city.id} className="border border-gray-200 rounded-xl overflow-hidden">
                          <div className="bg-gray-100 p-4 flex justify-between items-center">
                              <div className="flex items-center font-bold text-gray-800">
                                  <Map className="mr-2 text-green-600" size={20} />
                                  {city.name}
                              </div>
                              <button onClick={() => deleteLocation(city.id)} className="text-gray-400 hover:text-red-600 transition">
                                  <Trash2 size={18} />
                              </button>
                          </div>
                          
                          <div className="p-4 bg-white">
                              {/* List Pickups */}
                              <div className="space-y-2 mb-4">
                                  {getPickups(city.id).length === 0 && (
                                      <p className="text-sm text-gray-400 italic pl-2">No pick-up points added yet.</p>
                                  )}
                                  {getPickups(city.id).map(pickup => (
                                      <div key={pickup.id} className="flex justify-between items-center pl-4 pr-2 py-2 hover:bg-gray-50 rounded-lg group">
                                          <div className="flex items-center text-sm text-gray-700">
                                              {pickup.image ? (
                                                  <img src={pickup.image} alt="loc" className="w-8 h-8 rounded-full object-cover mr-3 border border-gray-200" />
                                              ) : (
                                                  <MapPin size={16} className="mr-3 text-gray-400" />
                                              )}
                                              <div>
                                                <span className="font-medium">{pickup.name}</span>
                                                {pickup.coordinates && (
                                                    <span className="text-[10px] text-gray-400 block">
                                                        {pickup.coordinates.lat.toFixed(4)}, {pickup.coordinates.lng.toFixed(4)}
                                                    </span>
                                                )}
                                              </div>
                                          </div>
                                          <div className="flex items-center opacity-0 group-hover:opacity-100 transition space-x-2">
                                              <button 
                                                onClick={() => openLocationEditModal(pickup)} 
                                                className="text-gray-300 hover:text-blue-500"
                                              >
                                                  <Edit size={14} />
                                              </button>
                                              <button 
                                                onClick={() => deleteLocation(pickup.id)} 
                                                className="text-gray-300 hover:text-red-500"
                                              >
                                                  <Trash2 size={14} />
                                              </button>
                                          </div>
                                      </div>
                                  ))}
                              </div>
                              
                              {/* Add Pickup Form */}
                              <div className="flex gap-2 pl-4">
                                  <input 
                                     type="text"
                                     value={newPickupNames[city.id] || ''}
                                     onChange={(e) => setNewPickupNames(prev => ({...prev, [city.id]: e.target.value}))}
                                     placeholder={t('pickupName')}
                                     className="flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded-lg outline-none focus:border-green-500"
                                  />
                                  <button 
                                     onClick={() => handleAddPickup(city.id)}
                                     disabled={!newPickupNames[city.id]?.trim()}
                                     className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 disabled:opacity-50"
                                  >
                                      {t('addPickup')}
                                  </button>
                              </div>
                          </div>
                      </div>
                  ))}
               </div>
           </div>
        )}

        {/* === ROLES TAB === */}
        {activeTab === 'roles' && canManageAccess && (
          <div className="space-y-6">
             <div className="flex justify-between items-center">
              <div>
                <h2 className="text-lg font-bold text-gray-800">{t('roles')} & {t('permissions')}</h2>
                <p className="text-sm text-gray-500">Define what users can see and do.</p>
              </div>
              <button onClick={() => openRoleModal()} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 flex items-center">
                <Plus size={16} className="mr-2" />
                {t('addRole')}
              </button>
            </div>

            <div className="grid gap-4">
              {roles.map(role => (
                <div key={role.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-sm transition">
                   <div className="flex justify-between items-start mb-3">
                      <div>
                        <h3 className="font-bold text-gray-800 text-lg">{role.name}</h3>
                        <span className="text-xs text-gray-500">{role.isSystem ? 'System Role' : 'Custom Role'}</span>
                      </div>
                      <div className="flex space-x-2">
                        <button onClick={() => openRoleModal(role)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"><Edit size={16}/></button>
                        {!role.isSystem && (
                          <button onClick={() => deleteRole(role.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg"><Trash2 size={16}/></button>
                        )}
                      </div>
                   </div>
                   <div className="flex flex-wrap gap-2">
                      {role.permissions.map(p => (
                        <span key={p} className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded border border-gray-200">
                          {ALL_PERMISSIONS.find(ap => ap.id === p)?.label[lang] || p}
                        </span>
                      ))}
                   </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* === USERS TAB === */}
        {activeTab === 'users' && canManageAccess && (
          <div className="space-y-6">
             <div className="flex justify-between items-center">
              <div>
                <h2 className="text-lg font-bold text-gray-800">{t('users')}</h2>
                <p className="text-sm text-gray-500">Manage user accounts and assignments.</p>
              </div>
              <button onClick={() => openUserModal()} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 flex items-center">
                <Plus size={16} className="mr-2" />
                {t('addUser')}
              </button>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 text-xs uppercase">
                    <th className="p-4">{t('username')}</th>
                    <th className="p-4">Name</th>
                    <th className="p-4">{t('role')}</th>
                    <th className="p-4 text-right">{t('actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {users.map(user => {
                    const userRole = roles.find(r => r.id === user.roleId);
                    return (
                      <tr key={user.id}>
                        <td className="p-4 flex items-center space-x-3">
                           {user.image ? (
                             <img src={user.image} alt={user.name} className="w-8 h-8 rounded-full object-cover" />
                           ) : (
                             <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500">
                               <UserCircle size={20} />
                             </div>
                           )}
                           <span className="font-medium">{user.username}</span>
                        </td>
                        <td className="p-4 text-gray-600">{user.name}</td>
                        <td className="p-4">
                          <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded text-xs font-bold">
                            {userRole?.name || 'Unknown'}
                          </span>
                        </td>
                        <td className="p-4 text-right space-x-2">
                          <button onClick={() => openUserModal(user)} className="text-blue-600 hover:text-blue-800"><Edit size={16}/></button>
                          {user.id !== currentUser.id && (
                             <button onClick={() => deleteUser(user.id)} className="text-red-600 hover:text-red-800"><Trash2 size={16}/></button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>

      {/* --- LOCATION EDIT MODAL --- */}
      {isLocationEditModalOpen && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
                  <div className="flex justify-between items-center mb-4">
                      <h3 className="text-xl font-bold text-gray-800">{t('editLocation')}</h3>
                      <button onClick={() => setIsLocationEditModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                          <X size={24} />
                      </button>
                  </div>
                  
                  <div className="space-y-4">
                      {/* Image Upload */}
                      <div className="flex flex-col items-center">
                          <div className="relative group cursor-pointer w-full h-32 bg-gray-50 rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center overflow-hidden">
                              {locationForm.image ? (
                                  <img src={locationForm.image} alt="Location" className="w-full h-full object-cover" />
                              ) : (
                                  <div className="text-center p-4">
                                      <ImageIcon className="mx-auto text-gray-400 mb-2" size={24} />
                                      <span className="text-xs text-gray-400">{t('locationImage')}</span>
                                  </div>
                              )}
                              <label className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center cursor-pointer text-white font-medium text-sm">
                                  <Upload size={16} className="mr-2" />
                                  {t('uploadLocationImage')}
                                  <input type="file" accept="image/*" onChange={handleLocationImageUpload} className="hidden" />
                              </label>
                          </div>
                      </div>

                      <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">{t('pickupName')}</label>
                          <input 
                              type="text"
                              value={locationForm.name}
                              onChange={(e) => setLocationForm({...locationForm, name: e.target.value})}
                              className="w-full border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-green-500"
                          />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                          <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">{t('latitude')}</label>
                              <input 
                                  type="number"
                                  step="any"
                                  value={locationForm.lat}
                                  onChange={(e) => setLocationForm({...locationForm, lat: e.target.value})}
                                  placeholder="e.g. 14.6928"
                                  className="w-full border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-green-500"
                              />
                          </div>
                          <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">{t('longitude')}</label>
                              <input 
                                  type="number"
                                  step="any"
                                  value={locationForm.lng}
                                  onChange={(e) => setLocationForm({...locationForm, lng: e.target.value})}
                                  placeholder="e.g. -17.4467"
                                  className="w-full border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-green-500"
                              />
                          </div>
                      </div>

                      <div className="flex justify-end space-x-3 pt-4">
                          <button 
                              onClick={() => setIsLocationEditModalOpen(false)} 
                              className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                          >
                              {t('cancel')}
                          </button>
                          <button 
                              onClick={saveLocation} 
                              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                          >
                              {t('save')}
                          </button>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* --- ROLE MODAL --- */}
      {isRoleModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
            <h3 className="text-xl font-bold mb-4">{editingRole ? t('editRole') : t('addRole')}</h3>
            <div className="space-y-4">
               <div>
                 <label className="block text-sm font-medium text-gray-700 mb-1">{t('roleName')}</label>
                 <input 
                   type="text" 
                   value={roleForm.name} 
                   onChange={e => setRoleForm({...roleForm, name: e.target.value})}
                   className="w-full border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-green-500"
                 />
               </div>
               <div>
                 <label className="block text-sm font-medium text-gray-700 mb-2">{t('permissions')}</label>
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {ALL_PERMISSIONS.map(perm => (
                      <div 
                        key={perm.id} 
                        onClick={() => togglePermission(perm.id)}
                        className={`flex items-center p-3 rounded-lg border cursor-pointer transition ${roleForm.permissions.includes(perm.id) ? 'bg-green-50 border-green-500' : 'hover:bg-gray-50 border-gray-200'}`}
                      >
                         {roleForm.permissions.includes(perm.id) ? (
                           <CheckSquare size={18} className="text-green-600 mr-2" />
                         ) : (
                           <Square size={18} className="text-gray-400 mr-2" />
                         )}
                         <span className="text-sm">{perm.label[lang]}</span>
                      </div>
                    ))}
                 </div>
               </div>
               <div className="flex justify-end space-x-3 pt-4">
                 <button onClick={() => setIsRoleModalOpen(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">{t('cancel')}</button>
                 <button onClick={saveRole} disabled={!roleForm.name} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">{t('save')}</button>
               </div>
            </div>
          </div>
        </div>
      )}

      {/* --- USER MODAL --- */}
      {isUserModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-xl font-bold mb-4">{editingUser ? t('editUser') : t('addUser')}</h3>
            <div className="space-y-4">
               {/* User Image Upload */}
               <div className="flex flex-col items-center">
                 <div className="relative group cursor-pointer w-20 h-20 rounded-full overflow-hidden bg-gray-100 border-2 border-gray-200">
                    {userForm.image ? (
                      <img src={userForm.image} alt="User" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-400">
                        <UserCircle size={40} />
                      </div>
                    )}
                    <label className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white cursor-pointer">
                       <Camera size={20} />
                       <input type="file" accept="image/*" onChange={handleUserImageUpload} className="hidden" />
                    </label>
                 </div>
                 <p className="text-xs text-gray-500 mt-2">{t('profileImage')}</p>
               </div>

               <div>
                 <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                 <input 
                   type="text" 
                   value={userForm.name} 
                   onChange={e => setUserForm({...userForm, name: e.target.value})}
                   className="w-full border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-green-500"
                 />
               </div>
               <div>
                 <label className="block text-sm font-medium text-gray-700 mb-1">Email (login)</label>
                 <input 
                   type="text" 
                   value={userForm.username} 
                   onChange={e => setUserForm({...userForm, username: e.target.value})}
                   className="w-full border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-green-500"
                   disabled={!!editingUser} // Cannot change username of existing user for simplicity
                 />
               </div>
               <div>
                 <label className="block text-sm font-medium text-gray-700 mb-1">{t('password')}</label>
                 <input 
                   type="password" 
                   value={userForm.password} 
                   onChange={e => setUserForm({...userForm, password: e.target.value})}
                   placeholder={editingUser ? "Leave blank to keep current" : ""}
                   className="w-full border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-green-500"
                 />
               </div>
               <div>
                 <label className="block text-sm font-medium text-gray-700 mb-1">{t('role')}</label>
                 <select 
                   value={userForm.roleId} 
                   onChange={e => setUserForm({...userForm, roleId: e.target.value})}
                   className="w-full border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-green-500 bg-white"
                 >
                   {roles.map(r => (
                     <option key={r.id} value={r.id}>{r.name}</option>
                   ))}
                 </select>
               </div>
               <div className="flex justify-end space-x-3 pt-4">
                 <button onClick={() => setIsUserModalOpen(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">{t('cancel')}</button>
                 <button onClick={saveUser} disabled={!userForm.username || !userForm.name} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">{t('save')}</button>
               </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
