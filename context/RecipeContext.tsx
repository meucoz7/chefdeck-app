
import React, { createContext, useContext, useEffect, useState } from 'react';
import { TechCard, Ingredient } from '../types';
import { useTelegram } from './TelegramContext';
import { useToast } from './ToastContext';

interface RecipeContextType {
  recipes: TechCard[];
  addRecipe: (recipe: TechCard, notifyAll?: boolean, silent?: boolean) => Promise<void>;
  updateRecipe: (recipe: TechCard, notifyAll?: boolean) => Promise<void>;
  deleteRecipe: (id: string) => Promise<void>;
  toggleFavorite: (id: string) => void;
  getRecipe: (id: string) => TechCard | undefined;
  isLoading: boolean;
}

const RecipeContext = createContext<RecipeContextType | undefined>(undefined);

export const RecipeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [recipes, setRecipes] = useState<TechCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useTelegram();
  const { addToast } = useToast();

  const fetchRecipes = async () => {
      try {
          const res = await fetch('/api/recipes');
          if (!res.ok) throw new Error('Failed to fetch');
          const data = await res.json();
          setRecipes(data);
          localStorage.setItem('recipes_cache', JSON.stringify(data));
      } catch (e) {
          console.warn("API unavailable, switching to offline mode.");
          const saved = localStorage.getItem('recipes_cache');
          if (saved) setRecipes(JSON.parse(saved));
      } finally {
          setIsLoading(false);
      }
  };

  useEffect(() => {
    fetchRecipes();
  }, []);

  const sendNotification = async (recipe: TechCard, action: 'create' | 'update' | 'delete', notifyAll: boolean = false, changes: string[] = [], silent: boolean = false) => {
      if (!user) return;
      try {
          await fetch('/api/notify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                  action,
                  recipeId: recipe.id,
                  recipeTitle: recipe.title,
                  targetChatId: user.id,
                  notifyAll,
                  changes,
                  silent
              })
          });
      } catch (e) {
          console.error("Notify failed", e);
      }
  };

  const calculateChanges = (oldR: TechCard, newR: TechCard): string[] => {
      const changes: string[] = [];
      
      if (oldR.title !== newR.title) changes.push(`Название: ${oldR.title} -> ${newR.title}`);
      if (oldR.outputWeight !== newR.outputWeight) changes.push(`Выход: ${oldR.outputWeight || '-'} -> ${newR.outputWeight}`);
      
      // Compare Ingredients intelligently
      // 1. Check for modifications in existing ingredients (by name match mostly, but simple index match is safer for order sensitive lists)
      const maxLen = Math.max(oldR.ingredients.length, newR.ingredients.length);
      
      if (oldR.ingredients.length !== newR.ingredients.length) {
          changes.push(`Кол-во ингредиентов: ${oldR.ingredients.length} -> ${newR.ingredients.length}`);
      } else {
          for (let i = 0; i < maxLen; i++) {
              const oldI = oldR.ingredients[i];
              const newI = newR.ingredients[i];
              
              if (!oldI) {
                  changes.push(`Добавлен: ${newI.name} (${newI.amount} ${newI.unit})`);
              } else if (!newI) {
                   // removed (handled by length check usually)
              } else {
                  if (oldI.name !== newI.name) {
                       changes.push(`Ингредиент ${i+1}: ${oldI.name} -> ${newI.name}`);
                  } else if (oldI.amount !== newI.amount) {
                       changes.push(`${oldI.name}: ${oldI.amount} -> ${newI.amount} ${newI.unit}`);
                  }
              }
          }
      }
      
      // Compare steps length
      if (oldR.steps.length !== newR.steps.length) {
          changes.push(`Шаги приготовления изменены`);
      }

      return changes;
  };

  const addRecipe = async (recipe: TechCard, notifyAll = false, silent = false) => {
    const enriched = { 
        ...recipe, 
        lastModifiedBy: user ? `${user.first_name} ${user.last_name || ''}` : 'Unknown'
    };
    
    setRecipes(prev => {
        const newState = [enriched, ...prev];
        localStorage.setItem('recipes_cache', JSON.stringify(newState));
        return newState;
    });

    try {
        const res = await fetch('/api/recipes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(enriched)
        });
        if(!res.ok) throw new Error("Server error");
        await sendNotification(enriched, 'create', notifyAll, [], silent);
    } catch (e) {
        addToast("Сохранено локально", "info");
    }
  };

  const updateRecipe = async (updated: TechCard, notifyAll = false) => {
    const oldRecipe = recipes.find(r => r.id === updated.id);
    const enriched = { 
        ...updated, 
        lastModified: Date.now(),
        lastModifiedBy: user ? `${user.first_name} ${user.last_name || ''}` : 'Unknown'
    };

    setRecipes(prev => {
        const newState = prev.map(r => r.id === enriched.id ? enriched : r);
        localStorage.setItem('recipes_cache', JSON.stringify(newState));
        return newState;
    });

    try {
        const res = await fetch('/api/recipes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(enriched)
        });
        if(!res.ok) throw new Error("Server error");
        
        // Calculate diff
        const changes = oldRecipe ? calculateChanges(oldRecipe, enriched) : [];
        await sendNotification(enriched, 'update', notifyAll, changes);
    } catch (e) {
        addToast("Сохранено локально", "info");
    }
  };

  const deleteRecipe = async (id: string) => {
    const target = recipes.find(r => r.id === id);
    setRecipes(prev => {
        const newState = prev.filter(r => r.id !== id);
        localStorage.setItem('recipes_cache', JSON.stringify(newState));
        return newState;
    });
    
    try {
        const res = await fetch(`/api/recipes/${id}`, { method: 'DELETE' });
        if(!res.ok) throw new Error("Server error");
        if (target) await sendNotification(target, 'delete', false);
    } catch (e) {
        addToast("Удалено локально", "info");
    }
  };

  const toggleFavorite = (id: string) => {
    setRecipes(prev => {
        const newRecipes = prev.map(r => r.id === id ? { ...r, isFavorite: !r.isFavorite } : r);
        localStorage.setItem('recipes_cache', JSON.stringify(newRecipes)); 
        return newRecipes;
    });
  };

  const getRecipe = (id: string) => recipes.find(r => r.id === id);

  return (
    <RecipeContext.Provider value={{ recipes, addRecipe, updateRecipe, deleteRecipe, toggleFavorite, getRecipe, isLoading }}>
      {children}
    </RecipeContext.Provider>
  );
};

export const useRecipes = () => {
  const context = useContext(RecipeContext);
  if (context === undefined) {
    throw new Error('useRecipes must be used within a RecipeProvider');
  }
  return context;
};
