
import React, { useState, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useRecipes } from '../context/RecipeContext';
import { useTelegram } from '../context/TelegramContext';
import { useToast } from '../context/ToastContext';
import { scopedStorage } from '../services/storage';

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
  
  // --- REORDERING STATE ---
  const [categoryOrder, setCategoryOrder] = useState<string[]>(() => {
      return scopedStorage.getJson<string[]>('category_order', []);
  });
  
  const [isReordering, setIsReordering] = useState(false);
  const [selectedSwap, setSelectedSwap] = useState<string | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Get category from URL or null
  const selectedCategory = searchParams.get('category');

  // Filter Active vs Archived
  const activeRecipes = recipes.filter(r => r.isArchived === false); // Strict check
  
  // Base list to filter from
  const displayRecipes = favoritesOnly 
      ? activeRecipes.filter(r => r.isFavorite) 
      : (includeArchive && search ? recipes : activeRecipes);

  // Get unique categories
  const uniqueCategories = Array.from(new Set(activeRecipes.map(r => r.category))).filter(c => c && c !== 'Без категории');

  // Sort Categories based on saved order
  const safeOrder = Array.isArray(categoryOrder) ? categoryOrder : [];
  
  const sortedCategories = uniqueCategories.sort((a: string, b: string) => {
      const idxA = safeOrder.indexOf(a);
      const idxB = safeOrder.indexOf(b);
      // If both new, alphabetical
      if (idxA === -1 && idxB === -1) return a.localeCompare(b);
      // If one new, put at end
      if (idxA === -1) return 1;
      if (idxB === -1) return -1;
      return idxA - idxB;
  });

  const filteredRecipes = displayRecipes.filter(r => {
    // Improved Search Logic
    let matchesSearch = true;
    if (search.trim()) {
        const searchTerms = search.toLowerCase().trim().split(/\s+/);
        const titleLower = r.title.toLowerCase();
        // Check if ALL terms are present in the title (AND logic)
        matchesSearch = searchTerms.every(term => titleLower.includes(term));
    }

    const matchesCategory = selectedCategory ? r.category === selectedCategory : true;
    return matchesSearch && matchesCategory;
  });

  const showCategoriesView = !selectedCategory && !search && !favoritesOnly;

  // --- HANDLERS ---

  const handleCategoryClick = (cat: string) => {
      if (isReordering) {
          if (!selectedSwap) {
              setSelectedSwap(cat);
          } else {
              // SWAP LOGIC
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
          // Uses bulk method which bypasses single-item notifications
          await archiveRecipesBulk(ids);
          addToast(`Архивировано карт: ${ids.length}`, "success");
      }
  };

  const startLongPress = (cat: string) => {
      if (!isAdmin || isReordering) return; // Only admin starts, and only if not already started
      longPressTimer.current = setTimeout(() => {
          setIsReordering(true);
          if (window.navigator.vibrate) window.navigator.vibrate(50);
          setSelectedSwap(cat); // Auto select the one pressed
      }, 800);
  };

  const cancelLongPress = () => {
      if (longPressTimer.current) clearTimeout(longPressTimer.current);
  };

  const clearCategory = () => {
      setSearchParams({});
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

  // Skeleton Loader Component
  const SkeletonGrid = () => (
      <div className="grid grid-cols-2 gap-4 animate-pulse">
          {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="bg-white dark:bg-[#1e1e24] rounded-[1.8rem] p-2.5 h-48 flex flex-col border border-gray-100 dark:border-white/5">
                  <div className="w-full aspect-square bg-gray-200 dark:bg-white/5 rounded-2xl mb-3"></div>
                  <div className="h-3 w-3/4 bg-gray-200 dark:bg-white/5 rounded mb-2"></div>
                  <div className="h-2 w-1/2 bg-gray-200 dark:bg-white/5 rounded mt-auto"></div>
              </div>
          ))}
      </div>
  );

  return (
    <div className="pb-28 animate-fade-in min-h-screen flex flex-col">
      
      {/* Unified Header */}
      <div className="pt-safe-top px-5 pb-2 bg-[#f2f4f7]/85 dark:bg-[#0f1115]/85 backdrop-blur-md sticky top-0 z-30 transition-all duration-300">
          <div className="flex items-center justify-between pt-4 mb-3">
             <div className="flex items-center justify-between w-full">
                <div>
                    <h1 className="text-2xl font-black text-gray-900 dark:text-white leading-none">
                        {favoritesOnly ? 'Избранное' : (isReordering ? 'Сортировка' : 'Главная')}
                    </h1>
                    <p className="text-xs text-gray-400 font-bold tracking-wider uppercase">
                        {favoritesOnly ? 'Ваши рецепты' : (isReordering ? 'Нажмите чтобы поменять' : 'База знаний')}
                    </p>
                </div>
                
                {isReordering ? (
                    <button 
                        onClick={() => { setIsReordering(false); setSelectedSwap(null); }}
                        className="bg-green-500 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-lg shadow-green-500/30 active:scale-95 transition"
                    >
                        Готово
                    </button>
                ) : (
                    <button 
                        onClick={() => navigate('/profile')}
                        className="w-10 h-10 rounded-full bg-white dark:bg-[#1e1e24] shadow-sm border border-gray-100 dark:border-white/5 flex items-center justify-center text-gray-900 dark:text-white active:scale-90 transition-transform hover:bg-gray-50 dark:hover:bg-white/10 overflow-hidden"
                    >
                        {user?.photo_url ? (
                            <img src={user.photo_url} alt="User" className="w-full h-full object-cover" />
                        ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg>
                        )}
                    </button>
                )}
             </div>
          </div>

          <div className="space-y-2">
            <div className={`relative group transition-opacity duration-300 ${isReordering ? 'opacity-30 pointer-events-none' : 'opacity-100'}`}>
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                    <svg className="h-5 w-5 text-gray-400 group-focus-within:text-sky-500 transition-colors" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    </div>
                    <input
                    type="text"
                    className="block w-full pl-10 pr-4 py-3 rounded-2xl bg-white dark:bg-[#1e1e24] text-base text-gray-900 dark:text-gray-100 placeholder-gray-400 outline-none ring-1 ring-gray-200 dark:ring-white/10 focus:ring-2 focus:ring-sky-500 shadow-sm transition-all font-medium appearance-none"
                    placeholder="Поиск блюда..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    />
            </div>
            
            {/* Search in Archive Toggle */}
            {search.length > 0 && !favoritesOnly && (
                <div onClick={() => setIncludeArchive(!includeArchive)} className="flex items-center gap-2 px-1 cursor-pointer w-fit opacity-80 hover:opacity-100 transition">
                    <div className={`w-8 h-5 rounded-full relative transition-colors ${includeArchive ? 'bg-sky-500' : 'bg-gray-300 dark:bg-white/20'}`}>
                        <div className={`absolute top-1 w-3 h-3 bg-white rounded-full shadow-sm transition-all ${includeArchive ? 'left-4' : 'left-1'}`}></div>
                    </div>
                    <span className="text-[10px] font-bold uppercase text-gray-500 dark:text-gray-400">Искать в архиве</span>
                </div>
            )}
          </div>
      </div>

      <div className="px-5 pt-2">
        {isLoading ? (
            <SkeletonGrid />
        ) : (
            <>
                {/* BANNERS: Schedule (Horizontal) + Archive (Square) */}
                {!search && !favoritesOnly && !selectedCategory && !isReordering && (
                    <div className="grid grid-cols-3 gap-3 mb-6">
                        {/* Schedule - 2 Columns (Horizontal Layout) */}
                        <div onClick={() => navigate('/schedule')} className="col-span-2 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-[1.8rem] px-5 py-4 text-white shadow-lg shadow-indigo-500/20 flex flex-row items-center h-24 cursor-pointer active:scale-[0.98] transition-transform relative overflow-hidden group">
                            <div className="relative z-10 w-12 h-12 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-sm mr-4 flex-shrink-0 group-hover:scale-110 transition-transform">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>
                            </div>
                            <div className="relative z-10 flex-1 min-w-0 flex flex-col justify-center h-full">
                                <h3 className="font-bold text-base leading-tight truncate">График</h3>
                                <p className="text-[10px] opacity-80 uppercase font-bold tracking-wider">Смен</p>
                            </div>
                            {/* Decorative Circle */}
                            <div className="absolute -bottom-4 -right-4 w-24 h-24 bg-white/10 rounded-full blur-2xl"></div>
                        </div>

                        {/* Archive - 1 Column (Centered Layout) */}
                        <div onClick={() => navigate('/archive')} className="col-span-1 bg-gray-200 dark:bg-white/10 rounded-[1.8rem] p-2 text-gray-500 dark:text-gray-300 flex flex-col items-center justify-center gap-1.5 h-24 cursor-pointer active:scale-[0.98] transition-transform relative overflow-hidden border border-transparent hover:border-gray-300 dark:hover:border-white/20 group">
                             <div className="w-10 h-10 rounded-full bg-white dark:bg-black/20 flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3.25a2.25 2.25 0 012.25-2.25h2.906a2.25 2.25 0 012.25 2.25v2.452a2.25 2.25 0 01-2.25 2.25H12a2.25 2.25 0 01-2.25-2.25V10.75z" /></svg>
                             </div>
                             <h3 className="font-bold text-xs leading-tight">Архив</h3>
                        </div>
                    </div>
                )}

                {/* Navigation Breadcrumb */}
                {selectedCategory && !search && (
                    <button 
                        onClick={clearCategory}
                        className="mb-6 flex items-center gap-2 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition group animate-fade-in"
                    >
                        <div className="w-8 h-8 rounded-full bg-white dark:bg-white/10 flex items-center justify-center shadow-sm group-active:scale-95 transition">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
                        </div>
                        <span className="font-bold text-xl dark:text-white">{selectedCategory}</span>
                    </button>
                )}

                {/* VIEW 1: CATEGORY FOLDERS */}
                {showCategoriesView && (
                    <div className="animate-slide-up">
                        <div className="grid grid-cols-2 gap-3">
                            {sortedCategories.map((cat: string, idx: number) => {
                                const count = activeRecipes.filter(r => r.category === cat).length;
                                const colorClass = getCategoryColor(idx);
                                const isSelected = selectedSwap === cat;
                                
                                return (
                                    <div 
                                        key={cat}
                                        onMouseDown={() => startLongPress(cat)}
                                        onTouchStart={() => startLongPress(cat)}
                                        onMouseUp={cancelLongPress}
                                        onMouseLeave={cancelLongPress}
                                        onTouchEnd={cancelLongPress}
                                        onClick={() => handleCategoryClick(cat)} // Separate interaction handler
                                        className={`group relative bg-white dark:bg-[#1e1e24] p-5 rounded-[1.8rem] shadow-sm border active:scale-[0.98] transition-all duration-300 cursor-pointer flex flex-col justify-between h-32 select-none
                                            ${isReordering ? 'animate-wiggle border-2' : 'border-gray-100 dark:border-white/5 hover:shadow-md'}
                                            ${isSelected ? 'border-sky-500 ring-2 ring-sky-500/20 scale-105 z-10' : (isReordering ? 'border-dashed border-gray-300 dark:border-white/20' : '')}
                                        `}
                                    >
                                        <div className="flex justify-between items-start pointer-events-none">
                                            <div className={`w-10 h-10 rounded-xl ${colorClass} flex items-center justify-center`}>
                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                                                    <path d="M19.5 21a3 3 0 003-3v-4.5a3 3 0 00-3-3h-15a3 3 0 00-3 3V18a3 3 0 003 3h15zM1.5 10.146V6a3 3 0 013-3h5.379a2.25 2.25 0 011.59.659l2.122 2.121c.14.141.331.22.53.22H19.5a3 3 0 013 3v1.146A4.483 4.483 0 0019.5 9h-15a4.483 4.483 0 00-3 1.146z" />
                                                </svg>
                                            </div>
                                            <span className="text-xs font-bold text-gray-400">{count}</span>
                                        </div>
                                        
                                        <div className="flex items-end justify-between gap-2 mt-auto">
                                            <h3 className="font-bold text-gray-900 dark:text-white text-base leading-tight group-hover:text-sky-500 transition-colors pointer-events-none line-clamp-2">
                                                {cat}
                                            </h3>
                                            
                                            {/* Admin: Archive Category Button */}
                                            {isAdmin && !isReordering && (
                                                <button
                                                    onClick={(e) => archiveCategoryGroup(cat, e)}
                                                    className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 dark:bg-white/10 text-gray-400 hover:bg-gray-200 dark:hover:bg-white/20 hover:text-gray-600 dark:hover:text-white transition-colors flex-shrink-0 z-20"
                                                    title="Архивировать категорию"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3.25a2.25 2.25 0 012.25-2.25h2.906a2.25 2.25 0 012.25 2.25v2.452a2.25 2.25 0 01-2.25 2.25H12a2.25 2.25 0 01-2.25-2.25V10.75z" />
                                                    </svg>
                                                </button>
                                            )}
                                        </div>
                                        
                                        {/* Reorder Indicator */}
                                        {isReordering && (
                                            <div className="absolute top-2 right-2">
                                                {isSelected ? (
                                                    <div className="w-5 h-5 bg-sky-500 rounded-full text-white flex items-center justify-center shadow-sm">
                                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-3 h-3"><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" /></svg>
                                                    </div>
                                                ) : (
                                                    <div className="w-5 h-5 border-2 border-gray-200 dark:border-white/10 rounded-full"></div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                        {sortedCategories.length === 0 && (
                            <div className="flex flex-col items-center justify-center py-20 text-center">
                                <div className="w-16 h-16 bg-gray-100 dark:bg-white/5 rounded-full flex items-center justify-center text-3xl mb-4">📂</div>
                                <h3 className="font-bold text-gray-900 dark:text-white mb-1">Нет категорий</h3>
                                <p className="text-gray-400 text-sm">Создайте первый рецепт</p>
                            </div>
                        )}
                    </div>
                )}

                {/* VIEW 2: RECIPE LIST */}
                {(!showCategoriesView) && (
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
                                        src={recipe.imageUrl || `https://ui-avatars.com/api/?name=${recipe.title}&background=random`}
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
                        <button onClick={() => {setSearch(''); clearCategory();}} className="mt-2 text-sky-500 font-bold text-sm">Сбросить фильтры</button>
                    </div>
                )}
            </>
        )}
      </div>
    </div>
  );
};

export default Home;

