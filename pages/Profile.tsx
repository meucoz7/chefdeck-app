
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from '../context/ThemeContext';
import { useNavigate } from 'react-router-dom';
import { useTelegram } from '../context/TelegramContext';
import { ADMIN_IDS } from '../config';
import { useToast } from '../context/ToastContext';
import { apiFetch } from '../services/api';

const Profile: React.FC = () => {
    const { theme, toggleTheme } = useTheme();
    const { user, isTwa, isAdmin } = useTelegram();
    const navigate = useNavigate();
    const { addToast } = useToast();
    
    // Bot Registration State
    const [isRegModalOpen, setIsRegModalOpen] = useState(false);
    const [regForm, setRegForm] = useState({ botId: '', token: '', name: '' });
    const [isRegistering, setIsRegistering] = useState(false);

    // Determine display name and handle
    const displayName = user ? `${user.first_name} ${user.last_name || ''}`.trim() : 'Гость';
    const displayHandle = user?.username ? `@${user.username}` : (isTwa ? `ID: ${user?.id}` : 'Web Browser User');

    // Super Admin Check (Hardcoded IDs only)
    const isSuperAdmin = user && ADMIN_IDS.includes(user.id);

    const handleRegisterBot = async () => {
        if (!regForm.botId || !regForm.token || !regForm.name) {
            addToast("Заполните все поля", "error");
            return;
        }

        setIsRegistering(true);
        try {
            const res = await apiFetch('/admin/register-bot', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...regForm,
                    ownerId: user?.id
                })
            });
            
            const data = await res.json();
            
            if (res.ok && data.success) {
                addToast(`Бот ${regForm.name} успешно добавлен!`, "success");
                setIsRegModalOpen(false);
                setRegForm({ botId: '', token: '', name: '' });
            } else {
                throw new Error(data.error || "Ошибка регистрации");
            }
        } catch (e: any) {
            addToast(e.message, "error");
        } finally {
            setIsRegistering(false);
        }
    };

    return (
        <div className="pb-28 animate-fade-in min-h-screen bg-[#f2f4f7] dark:bg-[#0f1115]">
             {/* Header */}
             <div className="pt-safe-top px-5 pb-4 sticky top-0 z-40 bg-[#f2f4f7]/85 dark:bg-[#0f1115]/85 backdrop-blur-md transition-colors duration-300">
                <div className="flex items-center gap-3 pt-4 mb-2">
                    <button onClick={() => navigate('/')} className="w-10 h-10 rounded-full bg-white dark:bg-[#1e1e24] shadow-sm border border-gray-100 dark:border-white/5 flex items-center justify-center text-gray-900 dark:text-white active:scale-90 transition-transform">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
                    </button>
                    <div>
                        <h1 className="text-2xl font-black text-gray-900 dark:text-white leading-none">Профиль</h1>
                        <p className="text-xs text-gray-400 font-bold tracking-wider uppercase">Личный кабинет</p>
                    </div>
                </div>
             </div>

             <div className="px-5 space-y-6">
                
                {/* Hero Card */}
                <div className="flex flex-col items-center pt-8 pb-6">
                    <div className="relative mb-5 group">
                        <div className="w-28 h-28 rounded-full bg-white dark:bg-[#1e1e24] p-1.5 shadow-xl border border-gray-100 dark:border-white/5">
                            {user?.photo_url ? (
                                <img src={user.photo_url} className="w-full h-full rounded-full object-cover" alt="User" />
                            ) : (
                                <div className="w-full h-full rounded-full bg-gradient-to-tr from-sky-400 to-indigo-500 flex items-center justify-center text-5xl shadow-inner text-white font-bold">
                                    {displayName.charAt(0).toUpperCase()}
                                </div>
                            )}
                        </div>
                        {isAdmin && (
                            <div className="absolute bottom-1 right-1 bg-white dark:bg-[#2a2a35] rounded-full p-2 shadow-lg border border-gray-100 dark:border-white/10" title="Administrator">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-sky-500"><path fillRule="evenodd" d="M7.5 6a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM3.751 20.105a8.25 8.25 0 0116.498 0 .75.75 0 01-.437.695A18.683 18.683 0 0112 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 01-.437-.695z" clipRule="evenodd" /></svg>
                            </div>
                        )}
                    </div>
                    
                    <h2 className="text-center text-2xl font-black text-gray-900 dark:text-white mb-1.5">
                        {displayName}
                    </h2>
                    <p className="text-center text-sm font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-white/5 px-3 py-1 rounded-full">
                        {displayHandle}
                    </p>
                </div>

                {/* Settings Groups */}
                <div className="space-y-4">
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest ml-2 mb-2">Настройки</h3>
                    <div className="bg-white dark:bg-[#1e1e24] rounded-[1.5rem] shadow-sm border border-gray-100 dark:border-white/5 overflow-hidden">
                         
                         {/* Theme Toggle */}
                         <div onClick={toggleTheme} className="p-5 flex items-center justify-between cursor-pointer active:bg-gray-50 dark:active:bg-white/5 transition">
                             <div className="flex items-center gap-4">
                                 <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white shadow-sm transition-colors ${theme === 'dark' ? 'bg-indigo-500' : 'bg-orange-400'}`}>
                                    {theme === 'dark' ? <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" /></svg> : <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" /></svg>}
                                 </div>
                                 <div>
                                     <span className="font-bold dark:text-white text-base block">Оформление</span>
                                     <span className="text-xs text-gray-400">{theme === 'dark' ? 'Темная тема' : 'Светлая тема'}</span>
                                 </div>
                             </div>
                             <div className={`w-12 h-7 rounded-full p-1 transition-colors duration-300 ${theme === 'dark' ? 'bg-indigo-500' : 'bg-gray-200'}`}>
                                <div className={`w-5 h-5 bg-white rounded-full shadow-sm transform transition-transform duration-300 ${theme === 'dark' ? 'translate-x-5' : 'translate-x-0'}`}></div>
                             </div>
                         </div>
                    </div>
                </div>

                {/* Admin Actions */}
                {isAdmin && (
                    <div className="space-y-4">
                        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest ml-2 mb-2">Администрирование</h3>
                        <div className="bg-white dark:bg-[#1e1e24] rounded-[1.5rem] shadow-sm border border-gray-100 dark:border-white/5 overflow-hidden divide-y divide-gray-100 dark:divide-white/5">
                             <div onClick={() => navigate('/users')} className="p-5 flex items-center justify-between cursor-pointer active:bg-gray-50 dark:active:bg-white/5 transition">
                                 <div className="flex items-center gap-4">
                                     <div className="w-10 h-10 rounded-full flex items-center justify-center text-white bg-indigo-500 shadow-sm">
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>
                                     </div>
                                     <div>
                                         <span className="font-bold dark:text-white text-base block">Пользователи</span>
                                         <span className="text-xs text-gray-400">Управление доступом</span>
                                     </div>
                                 </div>
                                 <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 text-gray-300"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                             </div>

                             <div onClick={() => navigate('/app-settings')} className="p-5 flex items-center justify-between cursor-pointer active:bg-gray-50 dark:active:bg-white/5 transition">
                                 <div className="flex items-center gap-4">
                                     <div className="w-10 h-10 rounded-full flex items-center justify-center text-white bg-sky-500 shadow-sm">
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                     </div>
                                     <div>
                                         <span className="font-bold dark:text-white text-base block">Настройки приложения</span>
                                         <span className="text-xs text-gray-400">Управление кнопками главной</span>
                                     </div>
                                 </div>
                                 <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 text-gray-300"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                             </div>

                             {/* SUPER ADMIN: ADD BOT BUTTON */}
                             {isSuperAdmin && (
                                <div onClick={() => setIsRegModalOpen(true)} className="p-5 flex items-center justify-between cursor-pointer active:bg-gray-50 dark:active:bg-white/5 transition bg-purple-50/50 dark:bg-purple-900/10">
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-full flex items-center justify-center text-white bg-purple-600 shadow-sm">
                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                        </div>
                                        <div>
                                            <span className="font-bold dark:text-white text-base block">Добавить бота</span>
                                            <span className="text-xs text-gray-400">Новый ресторан (Tenant)</span>
                                        </div>
                                    </div>
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 text-gray-300"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                                </div>
                             )}
                        </div>
                    </div>
                )}

                <div className="text-center pt-10 opacity-50 pb-safe-bottom">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">ChefDeck v1.8.5</p>
                    <p className="text-[10px] text-gray-300 dark:text-gray-600 mt-1">{isTwa ? `Secure Connection via Telegram` : 'Web Mode'}</p>
                </div>

             </div>

             {/* Registration Modal */}
             {isRegModalOpen && createPortal(
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in" style={{ touchAction: 'none' }}>
                    <div className="bg-white dark:bg-[#1e1e24] w-full max-w-sm rounded-3xl p-6 shadow-2xl animate-scale-in" style={{ touchAction: 'auto' }}>
                        <h2 className="text-xl font-black text-gray-900 dark:text-white mb-4">Новый бот</h2>
                        
                        <div className="space-y-4">
                            <div>
                                <label className="text-xs font-bold text-gray-400 uppercase block mb-1">Bot ID (Slug)</label>
                                <input 
                                    type="text" 
                                    placeholder="my_rest_bot" 
                                    className="w-full bg-gray-50 dark:bg-black/20 rounded-xl px-4 py-3 outline-none border border-transparent focus:border-purple-500/50 dark:text-white"
                                    value={regForm.botId}
                                    onChange={e => setRegForm(prev => ({...prev, botId: e.target.value.toLowerCase().replace(/\s/g, '_')}))}
                                />
                                <p className="text-[10px] text-gray-400 mt-1">Только латиница и _</p>
                            </div>
                            
                            <div>
                                <label className="text-xs font-bold text-gray-400 uppercase block mb-1">Название заведения</label>
                                <input 
                                    type="text" 
                                    placeholder="Pizza Roma" 
                                    className="w-full bg-gray-50 dark:bg-black/20 rounded-xl px-4 py-3 outline-none border border-transparent focus:border-purple-500/50 dark:text-white"
                                    value={regForm.name}
                                    onChange={e => setRegForm(prev => ({...prev, name: e.target.value}))}
                                />
                            </div>

                            <div>
                                <label className="text-xs font-bold text-gray-400 uppercase block mb-1">Bot Token (BotFather)</label>
                                <input 
                                    type="text" 
                                    placeholder="12345:AAH..." 
                                    className="w-full bg-gray-50 dark:bg-black/20 rounded-xl px-4 py-3 outline-none border border-transparent focus:border-purple-500/50 dark:text-white font-mono text-xs"
                                    value={regForm.token}
                                    onChange={e => setRegForm(prev => ({...prev, token: e.target.value}))}
                                />
                            </div>
                        </div>

                        <div className="flex gap-3 mt-6">
                            <button onClick={() => setIsRegModalOpen(false)} className="flex-1 py-3 bg-gray-100 dark:bg-white/5 rounded-xl font-bold text-gray-500 dark:text-gray-300">Отмена</button>
                            <button 
                                onClick={handleRegisterBot} 
                                disabled={isRegistering}
                                className="flex-1 py-3 bg-purple-600 text-white rounded-xl font-bold shadow-lg shadow-purple-600/30 flex items-center justify-center disabled:opacity-50"
                            >
                                {isRegistering ? '...' : 'Создать'}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
             )}
        </div>
    );
};

export default Profile;
