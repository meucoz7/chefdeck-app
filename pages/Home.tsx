
import React, { useState, useRef, useMemo } from 'react';
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

const Home: React.FC<HomeProps> = ({ favoritesOnly = false }) => {
  const { recipes, isLoading, archiveRecipesBulk, updateRecipe } = useRecipes();
  const { user, isAdmin } = useTelegram();
  const { settings, isLoadingSettings } = useSettings();
  const { addToast } = useToast();
  const [search, setSearch] = useState('');
  const [includeArchive, setIncludeArchive] = useState(false);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [categoryOrder, setCategoryOrder] = useState<string[]>(() => {
    return scopedStorage.getJson<string[]>('category_order', []);
  });
  const [isReordering, setIsReordering] = useState(false);
  const [selectedSwap, setSelectedSwap] = useState<string | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // States for the rename modal
  const [renamingCategory, setRenamingCategory] = useState<string | null>(null);
  const [newCategoryName, setNewCategoryName] = useState('');
  const selectedCategory = searchParams.get('category');

  const activeRecipes = recipes.filter(r => r.isArchived === false);
  const displayRecipes = favoritesOnly
    ? activeRecipes.filter(r => r.isFavorite)
    : (includeArchive && search ? recipes : activeRecipes);

  const uniqueCategories = useMemo(() => {
    return Array.from(new Set(activeRecipes.map(r => r.category))).filter(c => c && c !== 'Без категории');
  }, [activeRecipes]);

  const safeOrder = Array.isArray(categoryOrder) ? categoryOrder : [];

  const sortedCategories = useMemo(() => {
    return [...uniqueCategories].sort((a: string, b: string) => {
      const idxA = safeOrder.indexOf(a);
      const idxB = safeOrder.indexOf(b);
      if (idxA === -1 && idxB === -1) return a.localeCompare(b);
      if (idxA === -1) return 1;
      if (idxB === -1) return -1;
      return idxA - idxB;
    });
  }, [uniqueCategories, safeOrder]);

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

  const openRenameModal = (oldName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setRenamingCategory(oldName);
    setNewCategoryName(oldName);
  };

  const handleRenameConfirm = async () => {
    if (!renamingCategory || !newCategoryName.trim() || newCategoryName.trim() === renamingCategory) {
      setRenamingCategory(null);
      return;
    }
    const trimmedName = newCategoryName.trim();
    // Check for duplicate category name (case-insensitive)
    const isDuplicate = uniqueCategories.some(c => c.toLowerCase() === trimmedName.toLowerCase() && c !== renamingCategory);
    if (isDuplicate) {
      addToast("Категория с таким именем уже существует", "error");
      return;
    }
    const oldName = renamingCategory;
    setRenamingCategory(null);
    try {
      const targets = recipes.filter(r => r.category === oldName);
      addToast(`Обновление ${targets.length} карт...`, "info");
      for (const recipe of targets) {
        await updateRecipe({ ...recipe, category: trimmedName }, false, true);
      }
      const newOrder = safeOrder.map(c => c === oldName ? trimmedName : c);
      setCategoryOrder(newOrder);
      scopedStorage.setJson('category_order', newOrder);
      addToast("Категория переименована", "success");
    } catch (err) {
      addToast("Ошибка при переименовании", "error");
    }
  };

  const archiveCategoryGroup = async (catName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const targets = activeRecipes.filter(r => r.category === catName);
    if (targets.length === 0) return;
    if (confirm(`Архивировать категорию "${catName}"?`)) {
      const ids = targets.map(r => r.id);
      await archiveRecipesBulk(ids);
      addToast(`Архивировано карт: ${ids.length}`, "success");
    }
  };

  const startLongPress = (e: React.MouseEvent | React.TouchEvent, cat: string) => {
    if (!isAdmin || isReordering) return;
    
    // Clear any existing timer
    if (longPressTimer.current) clearTimeout(longPressTimer.current);

    longPressTimer.current = setTimeout(() => {
      setIsReordering(true);
      if (window.navigator.vibrate) window.navigator.vibrate(50);
      setSelectedSwap(cat);
    }, 600);
  };

  const cancelLongPress = () => {
    if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
    }
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
    <div className="pb-28 animate-fade-in min-h-screen flex flex-col relative">
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
      <div className="px-5 pt-2 flex-1">
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
                    const isSelectedForSwap = selectedSwap === cat;
                    return (
                      <div
                        key={cat}
                        onMouseDown={(e) => startLongPress(e, cat)}
                        onTouchStart={(e) => startLongPress(e, cat)}
                        onMouseMove={cancelLongPress}
                        onTouchMove={cancelLongPress}
                        onMouseUp={cancelLongPress}
                        onMouseLeave={cancelLongPress}
                        onTouchEnd={cancelLongPress}
                        onContextMenu={(e) => e.preventDefault()}
                        onClick={() => handleCategoryClick(cat)}
                        className={`group relative bg-white dark:bg-[#1e1e24] p-5 rounded-[1.8rem] shadow-sm border active:scale-[0.98] transition-all duration-300 cursor-pointer flex flex-col justify-between h-32 select-none 
                        ${isReordering ? 'animate-wiggle border-2 ring-2 ring-sky-500/5 touch-none' : 'border-gray-100 dark:border-white/5 hover:shadow-md touch-pan-y'} 
                        ${isSelectedForSwap ? 'border-sky-500 ring-4 ring-sky-500/20 scale-105 z-10' : ''}`}
                      >
                        <div className="flex justify-between items-start">
                          <div className={`w-10 h-10 rounded-xl ${getCategoryColor(idx)} flex items-center justify-center`}>
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path d="M19.5 21a3 3 0 003-3v-4.5a3 3 0 00-3-3h-15a3 3 0 00-3 3V18a3 3 0 003 3h15zM1.5 10.146V6a3 3 0 013-3h5.379a2.25 2.25 0 011.59.659l2.122 2.121c.14.141.331.22.53.22H19.5a3 3 0 013 3v1.146A4.483 4.483 0 0019.5 9h-15a4.483 4.483 0 00-3 1.146z" /></svg>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <span className={`text-xs font-bold ${isSelectedForSwap ? 'text-sky-500 animate-pulse' : 'text-gray-400'}`}>
                                {isSelectedForSwap ? 'ВЫБРАНО' : count}
                            </span>
                            {isReordering && isAdmin && (
                              <button onClick={(e) => openRenameModal(cat, e)} className="w-7 h-7 bg-white dark:bg-[#2a2a35] border border-gray-100 dark:border-white/10 rounded-full flex items-center justify-center text-sky-500 shadow-sm active:scale-90 transition-transform">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" /></svg>
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="flex items-end justify-between gap-2 mt-auto">
                          <h3 className={`font-bold text-base leading-tight group-hover:text-sky-500 transition-colors line-clamp-2 ${isSelectedForSwap ? 'text-sky-600 dark:text-sky-400' : 'text-gray-900 dark:text-white'}`}>{cat}</h3>
                          {isAdmin && !isReordering && (
                            <button onClick={(e) => archiveCategoryGroup(cat, e)} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 dark:bg-white/10 text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3.25a2.25 2.25 0 012.25-2.25h2.906a2.25 2.25 0 012.25 2.25v2.452a2.25 2.25 0 01-2.25 2.25H12a2.25 2.25 0 01-2.25-2.25V10.75z" /></svg></button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {!showCategoriesView && (
              <div className="grid grid-cols-2 gap-4 animate-fade-in pb-10">
                {filteredRecipes.map((recipe) => (
                  <Link
                    to={`/recipe/${recipe.id}`}
                    key={recipe.id}
                    className={`group relative bg-white dark:bg-[#1e1e24] rounded-[1.8rem] p-2.5 shadow-sm border border-gray-100 dark:border-white/5 active:scale-[0.98] transition-all duration-300 flex flex-col hover:shadow-lg ${recipe.isArchived ? 'opacity-60 grayscale-[0.8]' : ''}`}
                  >
                    {recipe.isArchived && (
                      <div className="absolute top-3 left-3 z-10 bg-gray-800 text-white text-[10px] font-bold px-2 py-1 rounded-md">АРХИВ</div>
                    )}
                    <div className="aspect-square w-full relative overflow-hidden rounded-2xl bg-gray-100 dark:bg-gray-800 mb-3">
                      <img
                        src={recipe.imageUrls?.small || recipe.imageUrl || `https://ui-avatars.com/api/?name=${recipe.title}&background=random`}
                        alt={recipe.title}
                        className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
                        loading="lazy"
                      />
                      <div className="absolute top-2 right-2 flex flex-col gap-1 items-end">
                        {recipe.isFavorite && (
                          <div className="bg-white/90 dark:bg-black/60 backdrop-blur-md p-1.5 rounded-full shadow-sm">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5 text-red-500">
                              <path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 01-.383-.218 25.18 25.18 0 01-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0112 5.052 5.5 5.5 0 0116.313 3c2.973 0 5.433 2.322 5.433 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 01-4.244 3.17 15.247 15.247 0 01-.383.219l-.022.012-.007.004-.003.001a.752.752 0 01-.704 0l-.003-.001z" />
                            </svg>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex-1 flex flex-col px-1 pb-1">
                      <h3 className="text-sm font-bold text-gray-900 dark:text-white leading-tight mb-2 line-clamp-2 min-h-[2.5rem]">
                        {recipe.title}
                      </h3>
                      <div className="flex items-center gap-1.5 mt-auto">
                        <span className="text-[10px] font-bold text-gray-500 bg-gray-100 dark:bg-white/5 px-2 py-1 rounded-lg">
                          {recipe.ingredients.length} ингр
                        </span>
                        {recipe.outputWeight && (
                          <span className="text-[10px] font-bold text-sky-600 bg-sky-50 dark:bg-sky-500/10 px-2 py-1 rounded-lg">
                            {recipe.outputWeight}
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
            {!showCategoriesView && filteredRecipes.length === 0 && (
              <div className="flex flex-col items-center justify-center mt-20 text-center opacity-70">
                <p className="text-lg font-bold dark:text-white">Ничего не найдено</p>
              </div>
            )}
          </>
        )}
      </div>
      {/* RENAME MODAL */}
      {renamingCategory && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-fade-in" onClick={() => setRenamingCategory(null)}>
          <div className="bg-white dark:bg-[#1e1e24] w-full max-w-sm rounded-[2rem] p-6 shadow-2xl animate-scale-in" onClick={e => e.stopPropagation()}>
            <h3 className="text-xl font-black dark:text-white mb-2">Переименовать</h3>
            <p className="text-xs text-gray-400 font-bold uppercase mb-4 tracking-wider">Категория: {renamingCategory}</p>
            <input
              autoFocus
              type="text"
              className="w-full bg-gray-50 dark:bg-black/20 rounded-xl px-4 py-3 text-sm font-bold dark:text-white outline-none focus:ring-2 focus:ring-sky-500 mb-6"
              value={newCategoryName}
              onChange={e => setNewCategoryName(e.target.value)}
              placeholder="Новое название..."
              onKeyDown={e => e.key === 'Enter' && handleRenameConfirm()}
            />
            <div className="flex gap-3">
              <button onClick={() => setRenamingCategory(null)} className="flex-1 py-3 bg-gray-100 dark:bg-white/5 rounded-xl font-bold text-gray-500 text-sm">Отмена</button>
              <button
                onClick={handleRenameConfirm}
                className="flex-1 py-3 bg-sky-500 text-white rounded-xl font-bold shadow-lg shadow-sky-500/30 text-sm"
              >
                Сохранить
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default Home;