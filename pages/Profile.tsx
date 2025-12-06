
import React from 'react';
import { useTheme } from '../context/ThemeContext';
import { useRecipes } from '../context/RecipeContext';
import { useNavigate } from 'react-router-dom';
import { useTelegram } from '../context/TelegramContext';

const Profile: React.FC = () => {
    const { theme, toggleTheme } = useTheme();
    const { recipes } = useRecipes();
    const { user, isTwa, isAdmin } = useTelegram();
    const navigate = useNavigate();
    
    // Determine display name and handle
    const displayName = user ? `${user.first_name} ${user.last_name || ''}`.trim() : 'Гость';
    const displayHandle = user?.username ? `@${user.username}` : (isTwa ? `ID: ${user?.id}` : 'Web Browser User');

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
                <div className="flex flex-col items-center pt-4 pb-2">
                    <div className="relative mb-4 group">
                        <div className="w-24 h-24 rounded-full bg-white dark:bg-[#1e1e24] p-1 shadow-lg border border-gray-100 dark:border-white/5">
                            {user?.photo_url ? (
                                <img src={user.photo_url} className="w-full h-full rounded-full object-cover" alt="User" />
                            ) : (
                                <div className="w-full h-full rounded-full bg-gradient-to-tr from-sky-400 to-indigo-500 flex items-center justify-center text-4xl shadow-inner text-white">
                                    {displayName.charAt(0).toUpperCase()}
                                </div>
                            )}
                        </div>
                        {isAdmin && (
                            <div className="absolute bottom-0 right-0 bg-white dark:bg-[#2a2a35] rounded-full p-1.5 shadow-md border border-gray-100 dark:border-white/10" title="Administrator">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-sky-500"><path fillRule="evenodd" d="M7.5 6a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM3.751 20.105a8.25 8.25 0 0116.498 0 .75.75 0 01-.437.695A18.683 18.683 0 0112 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 01-.437-.695z" clipRule="evenodd" /></svg>
                            </div>
                        )}
                    </div>
                    
                    <h2 className="text-center text-xl font-black text-gray-900 dark:text-white mb-1">
                        {displayName}
                    </h2>
                    <p className="text-center text-xs font-medium text-gray-500 dark:text-gray-400">
                        {displayHandle}
                    </p>
                </div>

                {/* Stats Compact Grid */}
                <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white dark:bg-[#1e1e24] p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-white/5 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gray-50 dark:bg-white/5 flex items-center justify-center text-gray-400">
                             <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" /></svg>
                        </div>
                        <div>
                             <p className="text-xl font-black text-gray-900 dark:text-white leading-none">{recipes.length}</p>
                             <p className="text-[10px] uppercase font-bold text-gray-400">Всего карт</p>
                        </div>
                    </div>
                    <div className="bg-white dark:bg-[#1e1e24] p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-white/5 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-red-50 dark:bg-red-500/10 flex items-center justify-center text-red-500">
                             <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" /></svg>
                        </div>
                        <div>
                             <p className="text-xl font-black text-gray-900 dark:text-white leading-none">{recipes.filter(r => r.isFavorite).length}</p>
                             <p className="text-[10px] uppercase font-bold text-gray-400">Избранное</p>
                        </div>
                    </div>
                </div>

                {/* Settings Groups */}
                <div className="space-y-4">
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest ml-2 mb-2">Настройки</h3>
                    <div className="bg-white dark:bg-[#1e1e24] rounded-[1.5rem] shadow-sm border border-gray-100 dark:border-white/5 overflow-hidden">
                         
                         {/* Theme Toggle */}
                         {!isTwa && (
                             <div onClick={toggleTheme} className="p-4 flex items-center justify-between cursor-pointer active:bg-gray-50 dark:active:bg-white/5 transition border-b border-gray-50 dark:border-white/5 last:border-0">
                                 <div className="flex items-center gap-3">
                                     <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white shadow-sm transition-colors ${theme === 'dark' ? 'bg-indigo-500' : 'bg-orange-400'}`}>
                                        {theme === 'dark' ? <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" /></svg> : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" /></svg>}
                                     </div>
                                     <span className="font-bold dark:text-white text-sm">Оформление</span>
                                 </div>
                                 <div className={`w-11 h-6 rounded-full p-1 transition-colors duration-300 ${theme === 'dark' ? 'bg-indigo-500' : 'bg-gray-200'}`}>
                                    <div className={`w-4 h-4 bg-white rounded-full shadow-sm transform transition-transform duration-300 ${theme === 'dark' ? 'translate-x-5' : 'translate-x-0'}`}></div>
                                 </div>
                             </div>
                         )}
                         
                         {isTwa && (
                            <div className="p-4 flex items-center justify-between opacity-50 cursor-not-allowed">
                                 <div className="flex items-center gap-3">
                                     <div className="w-8 h-8 rounded-full flex items-center justify-center text-white bg-gray-400">
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>
                                     </div>
                                     <span className="font-bold dark:text-white text-sm">Тема синхронизирована с Telegram</span>
                                 </div>
                            </div>
                         )}
                    </div>
                </div>

                <div className="text-center pt-6 opacity-50 pb-safe-bottom">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">ChefDeck v1.7.0</p>
                    <p className="text-[10px] text-gray-300 dark:text-gray-600 mt-1">{isTwa ? `Secure Connection via Telegram` : 'Web Mode'}</p>
                </div>

             </div>
        </div>
    );
};

export default Profile;
