
import React, { useRef, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useToast } from '../context/ToastContext';
import { useTelegram } from '../context/TelegramContext';
import { useRecipes } from '../context/RecipeContext';

const HomeIcon = ({ active }: { active: boolean }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth={active ? 0 : 2} className={`w-6 h-6 transition-all duration-300 ${active ? 'scale-105' : ''}`}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
  </svg>
);

const PlusIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
    <path fillRule="evenodd" d="M12 3.75a.75.75 0 01.75.75v6.75h6.75a.75.75 0 010 1.5h-6.75v6.75a.75.75 0 01-1.5 0v-6.75H4.5a.75.75 0 010-1.5h6.75V4.5a.75.75 0 01.75-.75z" clipRule="evenodd" />
  </svg>
);

const HeartIcon = ({ active }: { active: boolean }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth={active ? 0 : 2} className={`w-6 h-6 transition-all duration-300 ${active ? 'scale-105' : ''}`}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
  </svg>
);

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const { toasts, removeToast } = useToast();
  const { isAdmin } = useTelegram();
  const { recipes } = useRecipes();
  const mainRef = useRef<HTMLDivElement>(null);
  
  // Calculate active favorites count (excluding archived ones)
  const favoritesCount = recipes.filter(r => r.isFavorite && !r.isArchived).length;
  
  // Hide nav on specific sections
  const hideNav = 
    location.pathname.includes('add') || 
    location.pathname.includes('recipe') || 
    location.pathname.includes('edit') || 
    location.pathname.includes('wastage') ||
    location.pathname.includes('inventory');

  // Scroll Restoration Logic
  useEffect(() => {
      if (mainRef.current) {
          mainRef.current.scrollTo(0, 0);
      }
  }, [location.pathname]);
  
  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#f2f4f7] dark:bg-[#0f1115] text-gray-900 dark:text-gray-100 font-sans selection:bg-sky-500/30">
      
      {/* Background Gradient Spot */}
      <div className="fixed top-[-20%] left-[-20%] w-[80%] h-[60%] bg-sky-200/20 dark:bg-sky-900/10 rounded-full blur-[100px] pointer-events-none z-0"></div>

      {/* Toasts Container */}
      <div className="fixed top-4 left-0 right-0 z-[60] px-4 pointer-events-none flex flex-col items-center gap-2">
         {toasts.map(toast => (
            <div 
              key={toast.id}
              onClick={() => removeToast(toast.id)}
              className={`pointer-events-auto px-4 py-2.5 rounded-xl shadow-xl backdrop-blur-md flex items-center gap-3 animate-slide-up min-w-[280px] max-w-sm cursor-pointer ${
                  toast.type === 'error' ? 'bg-red-500 text-white' : 
                  toast.type === 'success' ? 'bg-green-600 text-white' : 
                  'bg-gray-800 dark:bg-white text-white dark:text-black'
              }`}
            >
               {toast.type === 'success' && <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>}
               {toast.type === 'error' && <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>}
               <span className="font-bold text-xs">{toast.message}</span>
            </div>
         ))}
      </div>
      
      {/* Main Content */}
      <main ref={mainRef} className="flex-1 overflow-y-auto no-scrollbar relative z-10 scroll-smooth">
        <div className="max-w-md mx-auto min-h-full pb-28">
           {children}
        </div>
      </main>

      {/* Floating Bottom Navigation */}
      {!hideNav && (
        <div className="fixed bottom-5 left-0 right-0 z-30 px-6 pointer-events-none">
            <nav className={`max-w-[260px] mx-auto pointer-events-auto bg-white/95 dark:bg-[#1e1e24]/95 backdrop-blur-xl border border-gray-100 dark:border-white/5 rounded-[2rem] shadow-[0_15px_30px_rgba(0,0,0,0.08)] dark:shadow-black/50 p-1.5 relative`}>
                
                <div className={`grid ${isAdmin ? 'grid-cols-3' : 'grid-cols-2'} items-center`}>
                    {/* Home */}
                    <div className="flex justify-center">
                        <NavLink to="/" end className={({ isActive }) => `py-3 px-5 rounded-2xl flex flex-col items-center justify-center transition-all duration-300 ${isActive ? 'text-gray-900 dark:text-white bg-gray-50 dark:bg-white/5' : 'text-gray-400 dark:text-gray-600 active:scale-90'}`}>
                            <HomeIcon active={false} />
                        </NavLink>
                    </div>

                    {/* Add Button - Only for Admins */}
                    {isAdmin && (
                       <div className="flex justify-center -mt-8">
                           <NavLink to="/add" className="flex items-center justify-center w-12 h-12 bg-gray-900 dark:bg-sky-500 text-white rounded-full shadow-[0_8px_16px_rgba(0,0,0,0.2)] dark:shadow-sky-500/30 transition-transform active:scale-90 hover:scale-105 duration-300 ring-4 ring-[#f2f4f7] dark:ring-[#0f1115]">
                               <PlusIcon />
                           </NavLink>
                       </div>
                    )}

                    {/* Favorites */}
                    <div className="flex justify-center relative">
                        <NavLink to="/favorites" className={({ isActive }) => `py-3 px-5 rounded-2xl flex flex-col items-center justify-center transition-all duration-300 relative ${isActive ? 'text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-500/10' : 'text-gray-400 dark:text-gray-600 active:scale-90'}`}>
                            <HeartIcon active={false} />
                            {favoritesCount > 0 && (
                                <span className="absolute top-2 right-3 w-4 h-4 bg-red-500 text-white text-[9px] font-bold flex items-center justify-center rounded-full shadow-sm border border-white dark:border-[#1e1e24] animate-scale-in">
                                    {favoritesCount > 9 ? '9+' : favoritesCount}
                                </span>
                            )}
                        </NavLink>
                    </div>
                </div>

            </nav>
        </div>
      )}
    </div>
  );
};

export default Layout;
