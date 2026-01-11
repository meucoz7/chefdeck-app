
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { TelegramUser } from '../types';
import { useTelegram } from '../context/TelegramContext';
import { useToast } from '../context/ToastContext';
import { ADMIN_IDS } from '../config';
import { apiFetch } from '../services/api';

const Users: React.FC = () => {
    const navigate = useNavigate();
    const { isAdmin, user: currentUser } = useTelegram();
    const { addToast } = useToast();
    const [users, setUsers] = useState<TelegramUser[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        if (!isAdmin) {
            navigate('/');
            return;
        }

        apiFetch('/api/users')
            .then(res => res.json())
            .then(data => {
                // SAFETY CHECK: Ensure data is actually an array
                if (Array.isArray(data)) {
                    setUsers(data);
                } else {
                    console.error("API Error: Expected array of users, got:", data);
                    // If backend returned an error object, show it
                    if (data.error) {
                        addToast(`Ошибка сервера: ${data.error}`, "error");
                    }
                    setUsers([]); // Fallback to empty array to prevent crash
                }
                setIsLoading(false);
            })
            .catch(err => {
                console.error("Network error:", err);
                setIsLoading(false);
                addToast("Ошибка загрузки пользователей", "error");
                setUsers([]); // Fallback
            });
    }, [isAdmin, navigate, addToast]);

    const handleToggleAdmin = async (targetId: number, currentStatus: boolean) => {
        // Prevent removing self
        if (targetId === currentUser?.id) {
            addToast("Нельзя снять админа с самого себя", "error");
            return;
        }

        try {
            const newStatus = !currentStatus;
            
            // Optimistic update
            setUsers(prev => prev.map(u => u.id === targetId ? { ...u, isAdmin: newStatus } : u));

            await apiFetch('/api/users/toggle-admin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ targetId, status: newStatus })
            });
            
            addToast(newStatus ? "Администратор назначен" : "Права администратора сняты", "success");
        } catch (e) {
            addToast("Ошибка при изменении прав", "error");
            // Revert
            setUsers(prev => prev.map(u => u.id === targetId ? { ...u, isAdmin: currentStatus } : u));
        }
    };

    const filteredUsers = users.filter(u => {
        const search = searchTerm.toLowerCase();
        const name = `${u.first_name} ${u.last_name || ''}`.toLowerCase();
        const username = u.username?.toLowerCase() || '';
        return name.includes(search) || username.includes(search);
    });

    return (
        <div className="pb-28 animate-fade-in min-h-screen bg-[#f2f4f7] dark:bg-[#0f1115]">
             {/* Header */}
             <div className="pt-safe-top px-5 pb-2 bg-[#f2f4f7]/85 dark:bg-[#0f1115]/85 backdrop-blur-md sticky top-0 z-40 transition-colors duration-300">
                <div className="flex items-center gap-3 pt-4 mb-2">
                    <button onClick={() => navigate('/profile')} className="w-10 h-10 rounded-full bg-white dark:bg-[#1e1e24] shadow-sm border border-gray-100 dark:border-white/5 flex items-center justify-center text-gray-900 dark:text-white active:scale-90 transition-transform">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
                    </button>
                    <div>
                        <h1 className="text-2xl font-black text-gray-900 dark:text-white leading-none">Пользователи</h1>
                        <p className="text-xs text-gray-400 font-bold tracking-wider uppercase">Управление доступом</p>
                    </div>
                </div>

                {/* Search */}
                <div className="mt-2 mb-2 relative">
                    <input 
                        type="text" 
                        placeholder="Поиск по имени или @username" 
                        className="w-full bg-white dark:bg-[#1e1e24] rounded-2xl py-3 px-4 pl-10 text-sm font-medium outline-none text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-sky-500/20 shadow-sm border border-gray-100 dark:border-white/5"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400 absolute left-3 top-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                </div>
             </div>

             <div className="px-5 space-y-3 pt-2">
                 {isLoading ? (
                     <div className="flex justify-center py-10">
                         <div className="animate-spin text-sky-500">⏳</div>
                     </div>
                 ) : filteredUsers.length === 0 ? (
                     <div className="text-center py-10 text-gray-400">
                         Пользователи не найдены
                     </div>
                 ) : (
                     filteredUsers.map(userItem => {
                         const isSuperAdmin = ADMIN_IDS.includes(userItem.id);
                         const isCurrentUser = userItem.id === currentUser?.id;
                         const displayName = `${userItem.first_name} ${userItem.last_name || ''}`.trim();
                         const displayHandle = userItem.username ? `@${userItem.username}` : `ID: ${userItem.id}`;
                         
                         return (
                             <div key={userItem.id} className="bg-white dark:bg-[#1e1e24] p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-white/5 flex items-center justify-between">
                                 <div className="flex items-center gap-3 overflow-hidden">
                                     <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-white/5 flex-shrink-0 overflow-hidden">
                                        {userItem.photo_url ? (
                                            <img src={userItem.photo_url} className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center font-bold text-gray-400 text-lg">
                                                {displayName.charAt(0).toUpperCase()}
                                            </div>
                                        )}
                                     </div>
                                     <div className="min-w-0">
                                         <h3 className="font-bold text-gray-900 dark:text-white truncate">{displayName}</h3>
                                         <p className="text-xs text-gray-400 truncate">{displayHandle}</p>
                                     </div>
                                 </div>

                                 <div className="flex-shrink-0 pl-2">
                                     {isSuperAdmin ? (
                                         <span className="text-[10px] font-bold bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 px-2 py-1 rounded-lg uppercase">
                                             Владелец
                                         </span>
                                     ) : (
                                         <button 
                                            onClick={() => handleToggleAdmin(userItem.id, !!userItem.isAdmin)}
                                            disabled={isCurrentUser}
                                            className={`w-12 h-7 rounded-full p-1 transition-colors duration-300 relative ${userItem.isAdmin ? 'bg-green-500' : 'bg-gray-200 dark:bg-white/10'}`}
                                         >
                                             <div className={`w-5 h-5 bg-white rounded-full shadow-sm transform transition-transform duration-300 ${userItem.isAdmin ? 'translate-x-5' : 'translate-x-0'}`}></div>
                                         </button>
                                     )}
                                 </div>
                             </div>
                         );
                     })
                 )}
                 <div className="text-center text-xs text-gray-400 pt-4 pb-10">
                     Всего пользователей: {users.length}
                 </div>
             </div>
        </div>
    );
};

export default Users;
