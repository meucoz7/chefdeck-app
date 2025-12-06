
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

  // Utility to prevent HTML injection in Telegram messages
  const escapeHtml = (unsafe: string | undefined | null) => {
    if (!unsafe) return "";
    return String(unsafe)
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
  };

  const calculateChanges = (oldR: TechCard, newR: TechCard): string[] => {
      const changes: string[] = [];
      
      if (oldR.title !== newR.title) {
          changes.push(`Название: ${escapeHtml(oldR.title)} -> <b>${escapeHtml(newR.title)}</b>`);
      }
      if (oldR.outputWeight !== newR.outputWeight) {
          changes.push(`Выход: ${escapeHtml(oldR.outputWeight || '-')} -> <b>${escapeHtml(newR.outputWeight)}</b>`);
      }
      
      // Compare Ingredients intelligently
      const oldMap = new Map(oldR.ingredients.map(i => [i.name, i]));
      
      newR.ingredients.forEach(newI => {
          const oldI = oldMap.get(newI.name);
          if (!oldI) {
               changes.push(`Добавлен: <b>${escapeHtml(newI.name)}</b> (${escapeHtml(newI.amount)} ${escapeHtml(newI.unit)})`);
          } else {
               // Exists, check amount/unit
               if (oldI.amount !== newI.amount || oldI.unit !== newI.unit) {
                   changes.push(`${escapeHtml(newI.name)}: ${escapeHtml(oldI.amount)} ${escapeHtml(oldI.unit)} -> <b>${escapeHtml(newI.amount)} ${escapeHtml(newI.unit)}</b>`);
               }
               // Remove processed
               oldMap.delete(newI.name);
          }
      });
      
      // Remaining in oldMap are deleted
      oldMap.forEach(oldI => {
          changes.push(`Удален: ${escapeHtml(oldI.name)}`);
      });
      
      // Compare steps length
      if (oldR.steps.length !== newR.steps.length) {
          changes.push(`Шаги приготовления: ${oldR.steps.length} -> ${newR.steps.length}`);
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
