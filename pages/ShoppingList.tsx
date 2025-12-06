import React from 'react';
import { useRecipes } from '../context/RecipeContext';

const ShoppingList: React.FC = () => {
  const { recipes } = useRecipes();
  
  // Get favorite recipes
  const favoriteRecipes = recipes.filter(r => r.isFavorite);
  
  // Aggregate ingredients
  // Note: This is a simple aggregation. Converting units (kg to g) would require a more complex math library.
  // For now, we group by Name + Unit.
  
  const shoppingMap = new Map<string, { name: string; amount: number; unit: string }>();

  favoriteRecipes.forEach(recipe => {
      recipe.ingredients.forEach(ing => {
          const key = `${ing.name.toLowerCase().trim()}-${ing.unit.toLowerCase().trim()}`;
          const current = shoppingMap.get(key);
          
          // Try parse amount (handle commas)
          const amountVal = parseFloat(ing.amount.replace(',', '.'));
          
          if (!isNaN(amountVal)) {
              if (current) {
                  current.amount += amountVal;
              } else {
                  shoppingMap.set(key, {
                      name: ing.name,
                      amount: amountVal,
                      unit: ing.unit
                  });
              }
          }
      });
  });

  const shoppingList = Array.from(shoppingMap.values());

  return (
    <div className="px-5 pt-12 pb-10 animate-fade-in min-h-screen">
        <h1 className="text-3xl font-bold dark:text-white mb-2">Список закупок</h1>
        <p className="text-gray-500 text-sm mb-6">Основано на {favoriteRecipes.length} избранных техкартах</p>

        {favoriteRecipes.length === 0 ? (
            <div className="bg-white dark:bg-[#1e1e24] p-8 rounded-3xl text-center shadow-sm">
                <div className="w-16 h-16 bg-gray-100 dark:bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl">
                    🥦
                </div>
                <h3 className="font-bold text-lg dark:text-white">Список пуст</h3>
                <p className="text-gray-500 mt-2 text-sm">Добавьте техкарты в "Избранное", чтобы сформировать общий список продуктов.</p>
            </div>
        ) : (
            <div className="bg-white dark:bg-[#1e1e24] rounded-[2rem] shadow-sm overflow-hidden">
                <div className="p-1">
                    {shoppingList.map((item, idx) => (
                        <div key={idx} className="flex justify-between items-center p-4 border-b border-gray-100 dark:border-white/5 last:border-0 hover:bg-gray-50 dark:hover:bg-white/5 transition">
                            <div className="flex items-center gap-3">
                                <div className="w-2 h-2 rounded-full bg-sky-500"></div>
                                <span className="font-medium text-gray-800 dark:text-gray-200 text-sm capitalize">{item.name}</span>
                            </div>
                            <span className="font-bold text-gray-900 dark:text-white whitespace-nowrap bg-gray-100 dark:bg-white/10 px-2 py-1 rounded-lg text-xs">
                                {item.amount.toFixed(3).replace(/\.?0+$/, '')} {item.unit}
                            </span>
                        </div>
                    ))}
                </div>
                <div className="bg-gray-50 dark:bg-white/5 p-4 text-center">
                   <button 
                     onClick={() => {
                        const text = shoppingList.map(i => `${i.name}: ${i.amount.toFixed(3).replace(/\.?0+$/, '')} ${i.unit}`).join('\n');
                        navigator.clipboard.writeText(text);
                        alert("Список скопирован!");
                     }}
                     className="text-sky-600 dark:text-sky-400 text-xs font-bold uppercase tracking-wider hover:underline"
                   >
                     Копировать список
                   </button>
                </div>
            </div>
        )}
    </div>
  );
};

export default ShoppingList;