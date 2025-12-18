
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useRecipes } from '../context/RecipeContext';
import { useTelegram } from '../context/TelegramContext';
import { useToast } from '../context/ToastContext';
import { scopedStorage } from '../services/storage';
import { apiFetch } from '../services/api';
import { AppSettings } from '../types';

interface HomeProps {
    favoritesOnly?: boolean;
}

const Home: React.FC<HomeProps> = ({ favoritesOnly = false }) => {
  const { recipes, isLoading, archiveRecipesBulk } = useRecipes();
  const { user, isAdmin } = useTelegram();
  const { addToast } = useToast();
  const [search, setSearch] = useState('');
  const [includeArchive, setIncludeArchive] = useState(false);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [settings, setSettings] = useState<AppSettings>({
      showSchedule: true,
      showWastage: true,
      showInventory: true,
      showArchive: true
  });
  
  const [categoryOrder, setCategoryOrder] = useState<string[]>(() => {
      return scopedStorage.getJson<string[]>('category_order', []);
  });
  
  const [isReordering, setIsReordering] = useState(false);
  const [selectedSwap, setSelectedSwap] = useState<string | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
      apiFetch('/api/settings')
          .then(res => res.json())
          .then(data => {
              if (data && typeof data === 'object') setSettings(prev => ({ ...prev, ...data }));
          })
          .catch(() => console.log("Settings not loaded"));
  }, []);

  const selectedCategory = searchParams.get('category');
  const activeRecipes = recipes.filter(r => r.isArchived === false);
  const displayRecipes = favoritesOnly 
      ? activeRecipes.filter(r => r.isFavorite) 
      : (includeArchive && search ? recipes : activeRecipes);

  const uniqueCategories = Array.from(new Set(activeRecipes.map(r => r.category))).filter(c => c && c !== 'Без категории');
  const safeOrder = Array.isArray(categoryOrder) ? categoryOrder : [];
  
  const sortedCategories = uniqueCategories.sort((a: string, b: string) => {
      const idxA = safeOrder.indexOf(a);
      const idxB = safeOrder.indexOf(b);
      if (idxA === -1 && idxB === -1) return a.localeCompare(b);
      if (idxA === -1) return 1;
      if (idxB === -1) return -1;
      return idxA - idxB;
  });

  const filteredRecipes = displayRecipes.filter(r => {
    let matchesSearch = true;
    if (search.trim()) {
        const searchTerms = search.toLowerCase().trim().split(/\s+/);
        const titleLower = r.title.toLowerCase();
        matchesSearch = searchTerms.every(term => titleLower.includes(term));
    }
    const matchesCategory = selectedCategory ? r.category === selectedCategory : true;
    return matchesSearch && matchesCategory;
  });

  const showCategoriesView = !selectedCategory && !search && !favoritesOnly;

  const handleCategoryClick = (cat: string) => {
      if (isReordering) {
          if (!selectedSwap) {
              setSelectedSwap(cat);
          } else {
              if (selectedSwap === cat) {
                  setSelectedSwap(null);
                  return;
              }
              const newOrder = [...sortedCategories];
              const idx1 = newOrder.indexOf(selectedSwap);
              const idx2 = newOrder.indexOf(cat);
              if (idx1 !== -1 && idx2 !== -1) {
                  [newOrder[idx1], newOrder[idx2]] = [newOrder[idx2], newOrder[idx1]];
                  setCategoryOrder(newOrder);
                  scopedStorage.setJson('category_order', newOrder);
              }
              setSelectedSwap(null);
          }
      } else {
          setSearchParams({ category: cat });
      }
  };

  const archiveCategoryGroup = async (catName: string, e: React.MouseEvent) => {
      e.stopPropagation();
      const targets = activeRecipes.filter(r => r.category === catName);
      if (targets.length === 0) return;
      if (confirm(`Архивировать категорию "${catName}"?\nБудет перемещено рецептов: ${targets.length}`)) {
          const ids = targets.map(r => r.id);
          await archiveRecipesBulk(ids);
          addToast(`Архивировано карт: ${ids.length}`, "success");
      }
  };

  const startLongPress = (cat: string) => {
      if (!isAdmin || isReordering) return;
      longPressTimer.current = setTimeout(() => {
          setIsReordering(true);
          if (window.navigator.vibrate) window.navigator.vibrate(50);
          setSelectedSwap(cat);
      }, 800);
  };

  const cancelLongPress = () => { if (longPressTimer.current) clearTimeout(longPressTimer.current); };
  const clearCategory = () => { setSearchParams({}); };
  const getCategoryColor = (index: number) => {
      const colors = [
          'bg-orange-100 text-orange-600 dark:bg-orange-500/20 dark:text-orange-400',
          'bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400',
          'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400',
          'bg-purple-100 text-purple-600 dark:bg-purple-500/20 dark:text-purple-400',
          'bg-rose-100 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400',
          'bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400'
      ];
      return colors[index % colors.length];
  };

  // Modern Styled Buttons - Optimized for TWA
  const visibleButtons = useMemo(() => {
    const btns = [];
    if (settings.showSchedule) btns.push({ 
        id: 'schedule', 
        title: 'График', 
        icon: (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0h18" />
            </svg>
        ), 
        color: 'indigo', 
        path: '/schedule' 
    });
    if (settings.showInventory) btns.push({ 
        id: 'inventory', 
        title: 'Инвент', 
        icon: (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .415.162.791.425 1.066.262.275.612.448.975.448.363 0 .713-.173.975-.448.263-.275.425-.651.425-1.066 0-.231-.035-.454-.1-.664m-4.4 0c0 .664.538 1.2 1.2 1.2h4.4c.662 0 1.2-.536 1.2-1.2m-4.4 0c-.001-.225-.015-.45-.041-.673a.75.75 0 00-.735-.67c-.247-.01-.497-.014-.749-.014-.252 0-.502.004-.75.014a.75.75 0 00-.735.67c-.026.223-.04.448-.041.673" />
            </svg>
        ), 
        color: 'emerald', 
        path: '/inventory' 
    });
    if (settings.showWastage) btns.push({ 
        id: 'wastage', 
        title: 'Списания', 
        icon: (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
        ), 
        color: 'rose', 
        path: '/wastage' 
    });
    if (settings.showArchive) btns.push({ 
        id: 'archive', 
        title: 'Архив', 
        icon: (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
            </svg>
        ), 
        color: 'amber', 
        path: '/archive' 
    });
    return btns;
  }, [settings]);

  const getBtnStyles = (color: string) => {
    switch(color) {
        case 'indigo': return 'text-indigo-600 dark:text-indigo-400 border-indigo-100 dark:border-indigo-500/20';
        case 'emerald': return 'text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-500/20';
        case 'rose': return 'text-rose-600 dark:text-rose-400 border-rose-100 dark:border-rose-500/20';
        case 'amber': return 'text-amber-600 dark:text-amber-400 border-amber-100 dark:border-amber-500/20';
        default: return 'text-gray-500 border-gray-100 dark:border-white/5';
    }
  };

  const getIconContainerStyles = (color: string) => {
    switch(color) {
        case 'indigo': return 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-500 group-active:bg-indigo-500 group-active:text-white transition-colors';
        case 'emerald': return 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-500 group-active:bg-emerald-500 group-active:text-white transition-colors';
        case 'rose': return 'bg-rose-50 dark:bg-rose-500/10 text-rose-500 group-active:bg-rose-500 group-active:text-white transition-colors';
        case 'amber': return 'bg-amber-50 dark:bg-amber-500/10 text-amber-500 group-active:bg-amber-500 group-active:text-white transition-colors';
        default: return 'bg-gray-100 dark:bg-white/5 text-gray-500';
    }
  };

  return (
    <div className="pb-28 animate-fade-in min-h-screen flex flex-col">
      <div className="pt-safe-top px-5 pb-2 bg-[#f2f4f7]/85 dark:bg-[#0f1115]/85 backdrop-blur-md sticky top-0 z-30 transition-all duration-300">
          <div className="flex items-center justify-between pt-4 mb-3">
             <div className="flex items-center justify-between w-full">
                <div>
                    <h1 className="text-2xl font-black text-gray-900 dark:text-white leading-none">
                        {favoritesOnly ? 'Избранное' : (isReordering ? 'Сортировка' : 'КухняПРО')}
                    </h1>
                    <p className="text-xs text-gray-400 font-bold tracking-wider uppercase">
                        {favoritesOnly ? 'Ваши рецепты' : (isReordering ? 'Нажмите чтобы поменять' : 'База знаний')}
                    </p>
                </div>
                {isReordering ? (
                    <button onClick={() => { setIsReordering(false); setSelectedSwap(null); }} className="bg-green-500 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-lg active:scale-95 transition">Готово</button>
                ) : (
                    <button onClick={() => navigate('/profile')} className="w-10 h-10 rounded-full bg-white dark:bg-[#1e1e24] shadow-sm border border-gray-100 dark:border-white/5 flex items-center justify-center overflow-hidden active:scale-90 transition-transform">
                        {user?.photo_url ? <img src={user.photo_url} alt="User" className="w-full h-full object-cover" /> : <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg>}
                    </button>
                )}
             </div>
          </div>
          <div className="space-y-2">
            <div className={`relative group transition-opacity duration-300 ${isReordering ? 'opacity-30 pointer-events-none' : 'opacity-100'}`}>
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none"><svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg></div>
                    <input type="text" className="block w-full pl-10 pr-4 py-3 rounded-2xl bg-white dark:bg-[#1e1e24] text-base text-gray-900 dark:text-gray-100 placeholder-gray-400 outline-none ring-1 ring-gray-200 dark:ring-white/10 focus:ring-2 focus:ring-sky-500 shadow-sm transition-all font-medium appearance-none" placeholder="Поиск блюда..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            {search.length > 0 && !favoritesOnly && (
                <div onClick={() => setIncludeArchive(!includeArchive)} className="flex items-center gap-2 px-1 cursor-pointer w-fit opacity-80 hover:opacity-100 transition">
                    <div className={`w-8 h-5 rounded-full relative transition-colors ${includeArchive ? 'bg-sky-500' : 'bg-gray-300 dark:bg-white/20'}`}><div className={`absolute top-1 w-3 h-3 bg-white rounded-full shadow-sm transition-all ${includeArchive ? 'left-4' : 'left-1'}`}></div></div>
                    <span className="text-[10px] font-bold uppercase text-gray-500 dark:text-gray-400">Искать в архиве</span>
                </div>
            )}
          </div>
      </div>

      <div className="px-5 pt-2">
        {isLoading ? (
            <div className="grid grid-cols-2 gap-4 animate-pulse">{[1,2,3,4].map(i => <div key={i} className="bg-white dark:bg-[#1e1e24] rounded-[1.8rem] h-48"></div>)}</div>
        ) : (
            <>
                {!search && !favoritesOnly && !selectedCategory && !isReordering && visibleButtons.length > 0 && (
                    <div className={`grid gap-3 mb-8 grid-cols-4`}>
                        {visibleButtons.map((btn) => {
                            return (
                                <div 
                                    key={btn.id}
                                    onClick={() => navigate(btn.path)}
                                    className="group flex flex-col items-center gap-2 cursor-pointer active:scale-90 transition-transform"
                                >
                                    <div className={`w-full aspect-square rounded-[1.5rem] flex items-center justify-center shadow-sm border border-gray-100 dark:border-white/5 bg-white dark:bg-[#1e1e24] transition-all hover:shadow-md ${getBtnStyles(btn.color)}`}>
                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${getIconContainerStyles(btn.color)}`}>
                                            {btn.icon}
                                        </div>
                                    </div>
                                    <span className="text-[10px] font-black uppercase tracking-tight text-center leading-none text-gray-500 dark:text-gray-400 group-active:text-gray-900 dark:group-active:text-white">
                                        {btn.title}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                )}

                {selectedCategory && !search && (
                    <button onClick={clearCategory} className="mb-6 flex items-center gap-2 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition group animate-fade-in"><div className="w-8 h-8 rounded-full bg-white dark:bg-white/10 flex items-center justify-center shadow-sm group-active:scale-95 transition"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg></div><span className="font-bold text-xl dark:text-white">{selectedCategory}</span></button>
                )}

                {showCategoriesView && (
                    <div className="animate-slide-up">
                        <div className="grid grid-cols-2 gap-3">
                            {sortedCategories.map((cat: string, idx: number) => {
                                const count = activeRecipes.filter(r => r.category === cat).length;
                                const colorClass = getCategoryColor(idx);
                                const isSelected = selectedSwap === cat;
                                return (
                                    <div key={cat} onMouseDown={() => startLongPress(cat)} onTouchStart={() => startLongPress(cat)} onMouseUp={cancelLongPress} onMouseLeave={cancelLongPress} onTouchEnd={cancelLongPress} onClick={() => handleCategoryClick(cat)} className={`group relative bg-white dark:bg-[#1e1e24] p-5 rounded-[1.8rem] shadow-sm border active:scale-[0.98] transition-all duration-300 cursor-pointer flex flex-col justify-between h-32 select-none ${isReordering ? 'animate-wiggle border-2' : 'border-gray-100 dark:border-white/5 hover:shadow-md'} ${isSelected ? 'border-sky-500 ring-2 ring-sky-500/20 scale-105 z-10' : (isReordering ? 'border-dashed border-gray-300 dark:border-white/20' : '')}`}>
                                        <div className="flex justify-between items-start pointer-events-none"><div className={`w-10 h-10 rounded-xl ${colorClass} flex items-center justify-center`}><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path d="M19.5 21a3 3 0 003-3v-4.5a3 3 0 00-3-3h-15a3 3 0 00-3 3V18a3 3 0 003 3h15zM1.5 10.146V6a3 3 0 013-3h5.379a2.25 2.25 0 011.59.659l2.122 2.121c.14.141.331.22.53.22H19.5a3 3 0 013 3v1.146A4.483 4.483 0 0019.5 9h-15a4.483 4.483 0 00-3 1.146z" /></svg></div><span className="text-xs font-bold text-gray-400">{count}</span></div>
                                        <div className="flex items-end justify-between gap-2 mt-auto"><h3 className="font-bold text-gray-900 dark:text-white text-base leading-tight group-hover:text-sky-500 transition-colors pointer-events-none line-clamp-2">{cat}</h3>{isAdmin && !isReordering && <button onClick={(e) => archiveCategoryGroup(cat, e)} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 dark:bg-white/10 text-gray-400 hover:bg-gray-200 dark:hover:bg-white/20 hover:text-gray-600 dark:hover:text-white transition-colors flex-shrink-0 z-20"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3.25a2.25 2.25 0 012.25-2.25h2.906a2.25 2.25 0 012.25 2.25v2.452a2.25 2.25 0 01-2.25 2.25H12a2.25 2.25 0 01-2.25-2.25V10.75z" /></svg></button>}</div>
                                        {isReordering && <div className="absolute top-2 right-2">{isSelected ? <div className="w-5 h-5 bg-sky-500 rounded-full text-white flex items-center justify-center shadow-sm"><svg fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-3 h-3"><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" /></svg></div> : <div className="w-5 h-5 border-2 border-gray-200 dark:border-white/10 rounded-full"></div>}</div>}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {(!showCategoriesView) && (
                    <div className="grid grid-cols-2 gap-4 animate-fade-in pb-10">
                        {filteredRecipes.map((recipe) => (
                            <Link to={`/recipe/${recipe.id}`} key={recipe.id} className={`group relative bg-white dark:bg-[#1e1e24] rounded-[1.8rem] p-2.5 shadow-sm border border-gray-100 dark:border-white/5 active:scale-[0.98] transition-all duration-300 flex flex-col hover:shadow-lg ${recipe.isArchived ? 'opacity-60 grayscale-[0.8]' : ''}`}>{recipe.isArchived && <div className="absolute top-3 left-3 z-10 bg-gray-800 text-white text-[10px] font-bold px-2 py-1 rounded-md">АРХИВ</div>}<div className="aspect-square w-full relative overflow-hidden rounded-2xl bg-gray-100 dark:bg-gray-800 mb-3"><img src={recipe.imageUrl || `https://ui-avatars.com/api/?name=${recipe.title}&background=random`} alt={recipe.title} className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110" loading="lazy" /><div className="absolute top-2 right-2 flex flex-col gap-1 items-end">{recipe.isFavorite && <div className="bg-white/90 dark:bg-black/60 backdrop-blur-md p-1.5 rounded-full shadow-sm"><svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5 text-red-500"><path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 01-.383-.218 25.18 25.18 0 01-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25" /></svg></div>}</div></div><div className="flex-1 flex flex-col px-1 pb-1"><h3 className="text-sm font-bold text-gray-900 dark:text-white leading-tight mb-2 line-clamp-2 min-h-[2.5rem]">{recipe.title}</h3><div className="flex items-center gap-1.5 mt-auto"><span className="text-[10px] font-bold text-gray-500 bg-gray-100 dark:bg-white/5 px-2 py-1 rounded-lg">{recipe.ingredients.length} ингр</span>{recipe.outputWeight && <span className="text-[10px] font-bold text-sky-600 bg-sky-50 dark:bg-sky-500/10 px-2 py-1 rounded-lg">{recipe.outputWeight}</span>}</div></div></Link>
                        ))}
                    </div>
                )}
            </>
        )}
      </div>
    </div>
  );
};

export default Home;
