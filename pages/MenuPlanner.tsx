import React, { useState } from 'react';
import { useRecipes } from '../context/RecipeContext';
import { TechCard } from '../types';

interface MenuPosition {
    recipeId: string;
    count: number; // number of servings/batches
}

const MenuPlanner: React.FC = () => {
  const { recipes } = useRecipes();
  const [eventName, setEventName] = useState('');
  const [menu, setMenu] = useState<MenuPosition[]>([]);
  const [isSelectorOpen, setIsSelectorOpen] = useState(false);

  const addToMenu = (id: string) => {
      setMenu(prev => {
          if (prev.find(p => p.recipeId === id)) return prev;
          return [...prev, { recipeId: id, count: 1 }];
      });
      setIsSelectorOpen(false);
  };

  const updateCount = (id: string, delta: number) => {
      setMenu(prev => prev.map(p => {
          if (p.recipeId !== id) return p;
          const newCount = Math.max(0, p.count + delta);
          return { ...p, count: newCount };
      }).filter(p => p.count > 0));
  };

  // --- CALCULATION LOGIC ---
  const shoppingMap = new Map<string, { name: string; amount: number; unit: string }>();

  menu.forEach(pos => {
      const recipe = recipes.find(r => r.id === pos.recipeId);
      if (!recipe) return;

      recipe.ingredients.forEach(ing => {
          const key = `${ing.name.toLowerCase().trim()}-${ing.unit.toLowerCase().trim()}`;
          const current = shoppingMap.get(key);
          const amountVal = parseFloat(ing.amount.replace(',', '.'));

          if (!isNaN(amountVal)) {
              const totalAmount = amountVal * pos.count;
              if (current) {
                  current.amount += totalAmount;
              } else {
                  shoppingMap.set(key, {
                      name: ing.name,
                      amount: totalAmount,
                      unit: ing.unit
                  });
              }
          }
      });
  });

  const shoppingList = Array.from(shoppingMap.values()).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="px-5 pt-10 pb-20 animate-fade-in min-h-screen">
       <h1 className="text-3xl font-extrabold dark:text-white mb-2">Калькулятор</h1>
       <p className="text-gray-500 text-sm mb-6">Планирование банкета и закупки</p>

       <div className="bg-white dark:bg-[#1e1e24] p-5 rounded-[2rem] shadow-sm border border-gray-100 dark:border-white/5 mb-6">
           <input 
              type="text" 
              placeholder="Название события (напр. Свадьба)" 
              className="w-full bg-transparent text-xl font-bold outline-none dark:text-white placeholder-gray-300 dark:placeholder-gray-600 mb-4"
              value={eventName}
              onChange={e => setEventName(e.target.value)}
           />
           
           <div className="space-y-3">
               {menu.map(pos => {
                   const r = recipes.find(rec => rec.id === pos.recipeId);
                   if (!r) return null;
                   return (
                       <div key={pos.recipeId} className="flex items-center justify-between bg-gray-50 dark:bg-black/20 p-3 rounded-xl">
                           <div className="flex-1 truncate pr-2">
                               <p className="font-bold text-sm dark:text-white truncate">{r.title}</p>
                           </div>
                           <div className="flex items-center gap-3 bg-white dark:bg-[#2a2a35] rounded-lg px-2 py-1 shadow-sm">
                               <button onClick={() => updateCount(pos.recipeId, -1)} className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-red-500 font-bold">-</button>
                               <span className="font-bold text-sm w-4 text-center dark:text-white">{pos.count}</span>
                               <button onClick={() => updateCount(pos.recipeId, 1)} className="w-6 h-6 flex items-center justify-center text-sky-500 font-bold">+</button>
                           </div>
                       </div>
                   );
               })}
               
               <button 
                  onClick={() => setIsSelectorOpen(true)}
                  className="w-full py-3 border border-dashed border-gray-300 dark:border-gray-600 rounded-xl text-gray-400 text-sm font-bold hover:bg-gray-50 dark:hover:bg-white/5 transition"
               >
                   + Добавить блюдо
               </button>
           </div>
       </div>

       {shoppingList.length > 0 && (
           <div className="bg-white dark:bg-[#1e1e24] p-5 rounded-[2rem] shadow-sm border border-gray-100 dark:border-white/5">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold dark:text-white">Итоговый список</h3>
                    <button 
                        onClick={() => {
                            const text = `Событие: ${eventName}\n\n${shoppingList.map(i => `${i.name}: ${i.amount.toFixed(3).replace(/\.?0+$/, '')} ${i.unit}`).join('\n')}`;
                            navigator.clipboard.writeText(text);
                            alert("Скопировано!");
                        }}
                        className="text-xs font-bold text-sky-500 bg-sky-50 dark:bg-sky-500/10 px-3 py-1.5 rounded-lg"
                    >
                        Копировать
                    </button>
                </div>
                <div className="divide-y divide-gray-100 dark:divide-white/5">
                    {shoppingList.map((item, i) => (
                        <div key={i} className="flex justify-between py-2 text-sm">
                            <span className="text-gray-600 dark:text-gray-300 capitalize">{item.name}</span>
                            <span className="font-bold dark:text-white">{item.amount.toFixed(3).replace(/\.?0+$/, '')} {item.unit}</span>
                        </div>
                    ))}
                </div>
           </div>
       )}

       {/* RECIPE SELECTOR MODAL */}
       {isSelectorOpen && (
           <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
               <div className="bg-white dark:bg-[#1e1e24] w-full max-w-sm rounded-[2rem] max-h-[70vh] flex flex-col shadow-2xl animate-slide-up">
                   <div className="p-5 border-b border-gray-100 dark:border-white/5 flex justify-between items-center">
                       <h3 className="font-bold text-lg dark:text-white">Выберите блюдо</h3>
                       <button onClick={() => setIsSelectorOpen(false)} className="bg-gray-100 dark:bg-white/10 p-2 rounded-full text-gray-500">
                           <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                       </button>
                   </div>
                   <div className="overflow-y-auto p-2 space-y-2 flex-1">
                       {recipes.map(r => (
                           <button 
                              key={r.id} 
                              onClick={() => addToMenu(r.id)}
                              className="w-full text-left flex items-center gap-3 p-3 hover:bg-gray-50 dark:hover:bg-white/5 rounded-xl transition"
                           >
                               <div className="w-10 h-10 rounded-lg bg-gray-200 dark:bg-white/10 overflow-hidden">
                                   <img src={r.imageUrl || `https://ui-avatars.com/api/?name=${r.title}`} className="w-full h-full object-cover" />
                               </div>
                               <div>
                                   <p className="font-bold text-sm dark:text-white">{r.title}</p>
                                   <p className="text-xs text-gray-400">{r.category}</p>
                               </div>
                           </button>
                       ))}
                   </div>
               </div>
           </div>
       )}

    </div>
  );
};

export default MenuPlanner;