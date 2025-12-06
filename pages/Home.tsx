
import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useRecipes } from '../context/RecipeContext';
import { useTelegram } from '../context/TelegramContext';

interface HomeProps {
    favoritesOnly?: boolean;
}

const Home: React.FC<HomeProps> = ({ favoritesOnly = false }) => {
  const { recipes } = useRecipes();
  const { user } = useTelegram();
  const [search, setSearch] = useState('');
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  
  // Get category from URL or null
  const selectedCategory = searchParams.get('category');

  const displayRecipes = favoritesOnly ? recipes.filter(r => r.isFavorite) : recipes;
  const categories = Array.from(new Set(displayRecipes.map(r => r.category))).filter(c => c && c !== 'Без категории') as string[];

  const filteredRecipes = displayRecipes.filter(r => {
    const matchesSearch = r.title.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = selectedCategory ? r.category === selectedCategory : true;
    return matchesSearch && matchesCategory;
  });

  const showCategoriesView = !selectedCategory && !search && !favoritesOnly;

  const handleCategoryClick = (cat: string) => {
      setSearchParams({ category: cat });
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

  return (
    <div className="pb-28 animate-fade-in min-h-screen flex flex-col">
      
      {/* Unified Header */}
      <div className="pt-safe-top px-5 pb-2 bg-[#f2f4f7]/85 dark:bg-[#0f1115]/85 backdrop-blur-md sticky top-0 z-30 transition-all duration-300">
          <div className="flex items-center justify-between pt-4 mb-3">
             <div>
                <h1 className="text-2xl font-black text-gray-900 dark:text-white leading-none">
                    {favoritesOnly ? 'Избранное' : 'Главная'}
                </h1>
                <p className="text-xs text-gray-400 font-bold tracking-wider uppercase">
                    {favoritesOnly ? 'Ваши рецепты' : 'База знаний'}
                </p>
             </div>

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
          </div>

          <div className="relative group">
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
      </div>

      <div className="px-5 pt-4">
        
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
                    {categories.map((cat, idx) => {
                        const count = recipes.filter(r => r.category === cat).length;
                        const colorClass = getCategoryColor(idx);
                        
                        return (
                            <div 
                                key={cat}
                                onClick={() => handleCategoryClick(cat)}
                                className="group relative bg-white dark:bg-[#1e1e24] p-5 rounded-[1.8rem] shadow-sm border border-gray-100 dark:border-white/5 active:scale-[0.98] transition-all duration-300 cursor-pointer hover:shadow-md flex flex-col justify-between h-32"
                            >
                                <div className="flex justify-between items-start">
                                    <div className={`w-10 h-10 rounded-xl ${colorClass} flex items-center justify-center`}>
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                                            <path d="M19.5 21a3 3 0 003-3v-4.5a3 3 0 00-3-3h-15a3 3 0 00-3 3V18a3 3 0 003 3h15zM1.5 10.146V6a3 3 0 013-3h5.379a2.25 2.25 0 011.59.659l2.122 2.121c.14.141.331.22.53.22H19.5a3 3 0 013 3v1.146A4.483 4.483 0 0019.5 9h-15a4.483 4.483 0 00-3 1.146z" />
                                        </svg>
                                    </div>
                                    <span className="text-xs font-bold text-gray-400">{count}</span>
                                </div>
                                
                                <h3 className="font-bold text-gray-900 dark:text-white text-base leading-tight group-hover:text-sky-500 transition-colors">
                                    {cat}
                                </h3>
                            </div>
                        );
                    })}
                </div>
                {categories.length === 0 && (
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
                        className="group relative bg-white dark:bg-[#1e1e24] rounded-[1.8rem] p-2.5 shadow-sm border border-gray-100 dark:border-white/5 active:scale-[0.98] transition-all duration-300 flex flex-col hover:shadow-lg"
                    >
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
      </div>
    </div>
  );
};

export default Home;
