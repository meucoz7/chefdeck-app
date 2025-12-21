
import React, { useState, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { useRecipes } from '../context/RecipeContext';
import { useTelegram } from '../context/TelegramContext';
import { useToast } from '../context/ToastContext';
import { useSettings } from '../context/SettingsContext';
import { scopedStorage } from '../services/storage';

interface HomeProps {
    favoritesOnly?: boolean;
}

/**
 * Changed to named function with default export to ensure visibility to the bundler/parser
 * and resolve the "no default export" error in App.tsx.
 */
export default function Home({ favoritesOnly = false }: HomeProps) {
  const { recipes, isLoading, archiveRecipesBulk, updateRecipe } = useRecipes();
  const { user, isAdmin } = useTelegram();
  const { settings, isLoadingSettings } = useSettings();
  const { addToast } = useToast();
  const [search, setSearch] = useState('');
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  
  const [categoryOrder, setCategoryOrder] = useState<string[]>(() => {
      return scopedStorage.getJson<string[]>('category_order', []);
  });
  
  const [isReordering, setIsReordering] = useState(false);
  const [selectedSwap, setSelectedSwap] = useState<string | null>(null);
  const [renamingCategory, setRenamingCategory] = useState<{ oldName: string, newName: string } | null>(null);
  const [isProcessingRename, setIsProcessingRename] = useState(false);
  
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedCategory = searchParams.get('category');
  const activeRecipes = recipes.filter(r => r.isArchived === false);
  
  const displayRecipes = favoritesOnly 
      ? activeRecipes.filter(r => r.isFavorite) 
      : activeRecipes;

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

  const handleRenameSubmit = async () => {
      if (!renamingCategory || renamingCategory.newName.trim() === "" || renamingCategory.newName.trim() === renamingCategory.oldName) {
          setRenamingCategory(null);
          return;
      }

      setIsProcessingRename(true);
      const oldName = renamingCategory.oldName;
      const newName = renamingCategory.newName.trim();
      
      try {
          const targets = recipes.filter(r => r.category === oldName);
          addToast(`Обновление ${targets.length} карт...`, "info");
          
          for (const recipe of targets) {
              await updateRecipe({ ...recipe, category: newName }, false, true);
          }

          const newOrder = safeOrder.map(c => c === oldName ? newName : c);
          setCategoryOrder(newOrder);
          scopedStorage.setJson('category_order', newOrder);
          
          addToast("Категория переименована", "success");
      } catch (err) {
          addToast("Ошибка при переименовании", "error");
      } finally {
          setIsProcessingRename(false);
          setRenamingCategory(null);
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

  const cancelLongPress = () => {
      if (longPressTimer.current) clearTimeout(longPressTimer.current);
  };

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

  const handleBackToMain = () => {
      if (selectedCategory) {
          setSearchParams({});
      } else if (favoritesOnly || search) {
          if (search) setSearch('');
          if (favoritesOnly) navigate('/');
      }
  };

  const visibleButtons = [];
  if (!isLoadingSettings) {
      if (settings.showInventory) visibleButtons.push('inventory');
      if (settings.showSchedule) visibleButtons.push('schedule');
      if (settings.showWastage) visibleButtons.push('wastage');
      if (settings.showArchive) visibleButtons.push('archive');
  }

  return (
    <div className="pb-28 animate-fade-in min-h-screen flex flex-col">
      <div className="pt-safe-top px-5 pb-2 bg-[#f2f4f7]/85 dark:bg-[#0f1115]/85 backdrop-blur-md sticky top-0 z-30 transition-all duration-300">
          <div className="flex items-center justify-between pt-4 mb-3">
             <div className="flex items-center gap-3 w-full">
                {!showCategoriesView && (
                    <button 
                        onClick={handleBackToMain}
                        className="w-10 h-10 rounded-full bg-white dark:bg-[#1e1e24] shadow-sm border border-gray-100 dark:border-white/5 flex items-center justify-center text-gray-900 dark:text-white active:scale-90 transition-transform"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
                    </button>
                )}

                <div className="flex-1 min-w-0">
                    <h1 className="text-2xl font-black text-gray-900 dark:text-white leading-none truncate">
                        {selectedCategory || (favoritesOnly ? 'Избранное' : (isReordering ? 'Сортировка' : 'Главная'))}
                    </h1>
                    <p className="text-xs text-gray-400 font-bold tracking-wider uppercase">
                        {selectedCategory ? 'Категория' : (favoritesOnly ? 'Ваши рецепты' : (isReordering ? 'Нажмите чтобы поменять' : 'База знаний'))}
                    </p>
                </div>

                <div className="flex-shrink-0">
                    {isReordering ? (
                        <button onClick={() => { setIsReordering(false); setSelectedSwap(null); }} className="bg-green-500 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-lg shadow-green-500/30 active:scale-95 transition">Готово</button>
                    ) : (
                        <button onClick={() => navigate('/profile')} className="w-10 h-10 rounded-full bg-white dark:bg-[#1e1e24] shadow-sm border border-gray-100 dark:border-white/5 flex items-center justify-center text-gray-900 dark:text-white active:scale-90 transition-transform overflow-hidden">
                            {user?.photo_url ? <img src={user.photo_url} alt="User" className="w-full h-full object-cover" /> : <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg>}
                        </button>
                    )}
                </div>
             </div>
          </div>
          <div className="space-y-2">
            <div className={`relative group transition-opacity duration-300 ${isReordering ? 'opacity-30 pointer-events-none' : 'opacity-100'}`}>
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                    <svg className="h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    </div>
                    <input type="text" className="block w-full pl-10 pr-4 py-3 rounded-2xl bg-white dark:bg-[#1e1e24] text-base text-gray-900 dark:text-gray-100 placeholder-gray-400 outline-none ring-1 ring-gray-200 dark:ring-white/10 focus:ring-2 focus:ring-sky-500 shadow-sm transition-all font-medium appearance-none" placeholder="Поиск блюда..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
      </div>

      <div className="px-5 pt-2">
        {isLoading ? (
            <div className="flex justify-center py-20"><div className="animate-spin text-sky-500">⏳</div></div>
        ) : (
            <>
                {!search && !favoritesOnly && !selectedCategory && !isReordering && visibleButtons.length > 0 && (
                    <div className={`grid grid-cols-${Math.min(visibleButtons.length, 4)} gap-2.5 mb-6`}>
                        {settings.showInventory && (
                            <div onClick={() => navigate('/inventory')} className="col-span-1 bg-sky-100 dark:bg-sky-500/20 rounded-2xl p-2 text-sky-600 dark:text-sky-400 flex flex-col items-center justify-center gap-1.5 h-24 cursor-pointer active:scale-[0.98] transition-transform group">
                                <div className="w-9 h-9 rounded-full bg-white dark:bg-black/20 flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" /></svg>
                                </div>
                                <h3 className="font-bold text-[9px] leading-tight text-center uppercase tracking-tighter">Остатки</h3>
                            </div>
                        )}
                        {settings.showSchedule && (
                            <div onClick={() => navigate('/schedule')} className="col-span-1 bg-indigo-100 dark:bg-indigo-500/20 rounded-2xl p-2 text-indigo-600 dark:text-indigo-400 flex flex-col items-center justify-center gap-1.5 h-24 cursor-pointer active:scale-[0.98] transition-transform group">
                                <div className="w-9 h-9 rounded-full bg-white dark:bg-black/20 flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>
                                </div>
                                <h3 className="font-bold text-[9px] leading-tight text-center uppercase tracking-tighter">График</h3>
                            </div>
                        )}
                        {settings.showWastage && (
                            <div onClick={() => navigate('/wastage')} className="col-span-1 bg-red-100 dark:bg-red-500/20 rounded-2xl p-2 text-red-600 dark:text-red-400 flex flex-col items-center justify-center gap-1.5 h-24 cursor-pointer active:scale-[0.98] transition-transform group">
                                <div className="w-9 h-9 rounded-full bg-white dark:bg-black/20 flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                                </div>
                                <h3 className="font-bold text-[9px] leading-tight text-center uppercase tracking-tighter">Списания</h3>
                            </div>
                        )}
                        {settings.showArchive && (
                            <div onClick={() => navigate('/archive')} className="col-span-1 bg-slate-100 dark:bg-slate-800/80 rounded-2xl p-2 text-slate-600 dark:text-slate-400 flex flex-col items-center justify-center gap-1.5 h-24 cursor-pointer active:scale-[0.98] transition-transform group">
                                <div className="w-9 h-9 rounded-full bg-white dark:bg-black/20 flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3.25a2.25 2.25 0 012.25-2.25h2.906a2.25 2.25 0 012.25 2.25v2.452a2.25 2.25 0 01-2.25 2.25H12a2.25 2.25 0 01-2.25-2.25V10.75z" /></svg>
                                </div>
                                <h3 className="font-bold text-[9px] leading-tight text-center uppercase tracking-tighter">Архив</h3>
                            </div>
                        )}
                    </div>
                )}

                {showCategoriesView && (
                    <div className="animate-slide-up">
                        <div className="grid grid-cols-2 gap-3">
                            {sortedCategories.map((cat: string, idx: number) => {
                                const count = activeRecipes.filter(r => r.category === cat).length;
                                return (
                                    <div 
                                        key={cat}
                                        onMouseDown={() => startLongPress(cat)}
                                        onTouchStart={() => startLongPress(cat)}
                                        onMouseUp={cancelLongPress}
                                        onMouseLeave={cancelLongPress}
                                        onTouchEnd={cancelLongPress}
                                        onClick={() => handleCategoryClick(cat)}
                                        className={`group relative bg-white dark:bg-[#1e1e24] p-5 rounded-[1.8rem] shadow-sm border active:scale-[0.98] transition-all duration-300 cursor-pointer flex flex-col justify-between h-32 select-none ${isReordering ? 'animate-wiggle border-2' : 'border-gray-100 dark:border-white/5 hover:shadow-md'}`}
                                    >
                                        <div className="flex justify-between items-start">
                                            <div className={`w-10 h-10 rounded-xl ${getCategoryColor(idx)} flex items-center justify-center`}>
                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path d="M19.5 21a3 3 0 003-3v-4.5a3 3 0 00-3-3h-15a3 3 0 00-3 3V18a3 3 0 003 3h15zM1.5 10.146V6a3 3 0 013-3h5.379a2.25 2.25 0 011.59.659l2.122 2.121c.14.141.331.22.53.22H19.5a3 3 0 013 3v1.146A4.483 4.483 0 0019.5 9h-15a4.483 4.483 0 00-3 1.146z" /></svg>
                                            </div>
                                            <div className="flex flex-col items-end gap-1">
                                                <span className="text-xs font-bold text-gray-400">{count}</span>
                                                {isReordering && isAdmin && (
                                                    <button onClick={(e) => { e.stopPropagation(); setRenamingCategory({ oldName: cat, newName: cat }); }} className="w-7 h-7 bg-white dark:bg-[#2a2a35] border border-gray-100 dark:border-white/10 rounded-full flex items-center justify-center text-sky-500 shadow-sm active:scale-90 transition-transform">
                                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" /></svg>
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-end justify-between gap-2 mt-auto">
                                            <h3 className="font-bold text-gray-900 dark:text-white text-base leading-tight group-hover:text-sky-500 transition-colors line-clamp-2">{cat}</h3>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {(!showCategoriesView) && (
                    <div className="grid grid-cols-2 gap-4 animate-fade-in pb-10">
                        {filteredRecipes.map((recipe) => (
                            <Link
                                to={`/recipe/${recipe.id}`}
                                key={recipe.id}
                                className={`group relative bg-white dark:bg-[#1e1e24] rounded-[1.8rem] p-2.5 shadow-sm border border-gray-100 dark:border-white/5 active:scale-[0.98] transition-all duration-300 flex flex-col hover:shadow-lg ${recipe.isArchived ? 'opacity-60 grayscale-[0.8]' : ''}`}
                            >
                                <div className="aspect-square w-full relative overflow-hidden rounded-2xl bg-gray-100 dark:bg-gray-800 mb-3">
                                    <img
                                        src={recipe.imageUrl || `https://ui-avatars.com/api/?name=${recipe.title}&background=random`}
                                        alt={recipe.title}
                                        className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
                                        loading="lazy"
                                    />
                                </div>
                                <div className="flex-1 flex flex-col px-1 pb-1">
                                    <h3 className="text-sm font-bold text-gray-900 dark:text-white leading-tight mb-2 line-clamp-2 min-h-[2.5rem]">
                                        {recipe.title}
                                    </h3>
                                    <div className="flex items-center gap-1.5 mt-auto">
                                        <span className="text-[10px] font-bold text-gray-500 bg-gray-100 dark:bg-white/5 px-2 py-1 rounded-lg">
                                            {recipe.ingredients.length} ингр
                                        </span>
                                    </div>
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </div>

      {/* RENAME MODAL */}
      {renamingCategory && createPortal(
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-fade-in">
              <div className="bg-white dark:bg-[#1e1e24] w-full max-w-sm rounded-[2.5rem] p-6 shadow-2xl animate-scale-in border border-gray-100 dark:border-white/10">
                  <h2 className="text-xl font-black text-gray-900 dark:text-white mb-2">Переименовать</h2>
                  <p className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-6">Категория: {renamingCategory.oldName}</p>
                  
                  <div className="space-y-4">
                      <div>
                          <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 mb-1 block">Новое название</label>
                          <input 
                              autoFocus
                              type="text" 
                              className="w-full bg-gray-50 dark:bg-black/20 rounded-2xl px-4 py-3.5 font-bold dark:text-white outline-none ring-2 ring-transparent focus:ring-sky-500/30 transition-all"
                              value={renamingCategory.newName}
                              onChange={e => setRenamingCategory({...renamingCategory, newName: e.target.value})}
                              onKeyDown={e => e.key === 'Enter' && handleRenameSubmit()}
                          />
                      </div>
                      
                      <div className="flex gap-3 pt-2">
                          <button 
                            onClick={() => setRenamingCategory(null)}
                            disabled={isProcessingRename}
                            className="flex-1 py-3.5 bg-gray-100 dark:bg-white/5 rounded-2xl font-bold text-gray-500 dark:text-gray-300 active:scale-95 transition disabled:opacity-50"
                          >
                              Отмена
                          </button>
                          <button 
                            onClick={handleRenameSubmit}
                            disabled={isProcessingRename}
                            className="flex-1 py-3.5 bg-sky-500 text-white rounded-2xl font-black shadow-lg shadow-sky-500/20 active:scale-95 transition disabled:opacity-50 flex items-center justify-center gap-2"
                          >
                              {isProcessingRename ? (
                                  <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                              ) : 'Сохранить'}
                          </button>
                      </div>
                  </div>
              </div>
          </div>,
          document.body
      )}
    </div>
  );
}
