
import React from 'react';
import { useTheme } from '../context/ThemeContext';
import { useNavigate } from 'react-router-dom';
import { useTelegram } from '../context/TelegramContext';

const Profile: React.FC = () => {
    const { theme, toggleTheme } = useTheme();
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
                                    {theme === 'dark' ? <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" /></svg> : <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" /></svg>}
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

                <div className="text-center pt-10 opacity-50 pb-safe-bottom">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">ChefDeck v1.8.1</p>
                    <p className="text-[10px] text-gray-300 dark:text-gray-600 mt-1">{isTwa ? `Secure Connection via Telegram` : 'Web Mode'}</p>
                </div>

             </div>
        </div>
    );
};

export default Profile;
