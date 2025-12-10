
import React, { createContext, useContext, useEffect, useState } from 'react';
import { TechCard, Ingredient } from '../types';
import { useTelegram } from '../context/TelegramContext';
import { useToast } from './ToastContext';

interface RecipeContextType {
  recipes: TechCard[];
  addRecipe: (recipe: TechCard, notifyAll?: boolean, silent?: boolean) => Promise<void>;
  addRecipesBulk: (recipes: TechCard[], notifyAll?: boolean) => Promise<void>;
  updateRecipe: (recipe: TechCard, notifyAll?: boolean) => Promise<void>;
  archiveRecipe: (id: string) => Promise<void>;
  archiveRecipesBulk: (ids: string[]) => Promise<void>;
  restoreRecipe: (id: string) => Promise<void>;
  deleteRecipe: (id: string) => Promise<void>;
  deleteAllArchived: () => Promise<void>;
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
          // Ensure data integrity
          const safeData = Array.isArray(data) ? data.map((r: TechCard) => ({ ...r, isArchived: !!r.isArchived })) : [];
          setRecipes(safeData);
          localStorage.setItem('recipes_cache', JSON.stringify(safeData));
      } catch (e) {
          console.warn("API unavailable, switching to offline mode.");
          try {
              const saved = localStorage.getItem('recipes_cache');
              if (saved) {
                  const parsed = JSON.parse(saved);
                  setRecipes(Array.isArray(parsed) ? parsed.map((r: any) => ({ ...r, isArchived: !!r.isArchived })) : []);
              }
          } catch(err) {
              console.error("Cache corrupted", err);
              setRecipes([]);
          }
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
      
      const clean = (s: string) => (s || '').trim();
      
      if (clean(oldR.title) !== clean(newR.title)) {
          changes.push(`Название: ${escapeHtml(oldR.title)} -> <b>${escapeHtml(newR.title)}</b>`);
      }
      if (clean(oldR.outputWeight) !== clean(newR.outputWeight)) {
          changes.push(`Выход: ${escapeHtml(oldR.outputWeight || '-')} -> <b>${escapeHtml(newR.outputWeight)}</b>`);
      }
      
      const oldMap = new Map(oldR.ingredients.map(i => [clean(i.name), i]));
      
      newR.ingredients.forEach(newI => {
          const name = clean(newI.name);
          const oldI = oldMap.get(name);
          
          if (!oldI) {
               changes.push(`Добавлен: <b>${escapeHtml(newI.name)}</b> (${escapeHtml(newI.amount)} ${escapeHtml(newI.unit)})`);
          } else {
               const oldAmount = clean(oldI.amount);
               const newAmount = clean(newI.amount);
               const oldUnit = clean(oldI.unit);
               const newUnit = clean(newI.unit);

               if (oldAmount !== newAmount || oldUnit !== newUnit) {
                   changes.push(`${escapeHtml(newI.name)}: ${escapeHtml(oldI.amount)} ${escapeHtml(oldI.unit)} -> <b>${escapeHtml(newI.amount)} ${escapeHtml(newI.unit)}</b>`);
               }
               oldMap.delete(name);
          }
      });
      
      oldMap.forEach(oldI => {
          changes.push(`Удален: ${escapeHtml(oldI.name)}`);
      });
      
      return changes;
  };

  const addRecipe = async (recipe: TechCard, notifyAll = false, silent = false) => {
    const enriched = { 
        ...recipe, 
        isArchived: false,
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

  // Mass add recipes
  const addRecipesBulk = async (newRecipes: TechCard[], notifyAll = false) => {
      const enrichedRecipes = newRecipes.map(r => ({
          ...r,
          isArchived: false,
          lastModifiedBy: user ? `${user.first_name} ${user.last_name || ''}` : 'Import'
      }));

      // Update Local State Immediately
      setRecipes(prev => {
          const newState = [...enrichedRecipes, ...prev];
          localStorage.setItem('recipes_cache', JSON.stringify(newState));
          return newState;
      });

      try {
          const res = await fetch('/api/recipes/bulk', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(enrichedRecipes)
          });
          if (!res.ok) throw new Error("Server error");
          
          // We intentionally do not notify for bulk add to prevent spam
      } catch (e) {
          addToast("Массовое сохранение локально", "info");
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
        
        const changes = oldRecipe ? calculateChanges(oldRecipe, enriched) : [];
        await sendNotification(enriched, 'update', notifyAll, changes);
    } catch (e) {
        addToast("Сохранено локально", "info");
    }
  };

  const archiveRecipe = async (id: string) => {
      const target = recipes.find(r => r.id === id);
      if (!target) return;

      const archived = { ...target, isArchived: true };
      
      setRecipes(prev => {
          const newState = prev.map(r => r.id === id ? archived : r);
          localStorage.setItem('recipes_cache', JSON.stringify(newState));
          return newState;
      });

      try {
          await fetch('/api/recipes', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(archived)
          });
          // Note: Archiving single recipe does NOT notify by default anymore to keep it clean,
          // unless we explicitly want to. Current logic: no notify.
      } catch (e) {
          addToast("Архивировано локально", "info");
      }
  };
  
  const archiveRecipesBulk = async (ids: string[]) => {
      if (ids.length === 0) return;
      
      // Optimistic Update
      setRecipes(prev => {
          const newState = prev.map(r => ids.includes(r.id) ? { ...r, isArchived: true } : r);
          localStorage.setItem('recipes_cache', JSON.stringify(newState));
          return newState;
      });

      try {
          await fetch('/api/recipes/archive/batch', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ids })
          });
          // Explicitly NO notifications for bulk archive
      } catch (e) {
          addToast("Массовый архив локально", "info");
      }
  };

  const restoreRecipe = async (id: string) => {
      const target = recipes.find(r => r.id === id);
      if (!target) return;

      const restored = { ...target, isArchived: false };
      
      setRecipes(prev => {
          const newState = prev.map(r => r.id === id ? restored : r);
          localStorage.setItem('recipes_cache', JSON.stringify(newState));
          return newState;
      });

      try {
          await fetch('/api/recipes', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(restored)
          });
      } catch (e) {
          addToast("Восстановлено локально", "info");
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
        // Single delete DOES notify
        if (target) await sendNotification(target, 'delete', false);
    } catch (e) {
        addToast("Удалено локально", "info");
    }
  };

  const deleteAllArchived = async () => {
    // Remove from local state
    setRecipes(prev => {
        const newState = prev.filter(r => !r.isArchived);
        localStorage.setItem('recipes_cache', JSON.stringify(newState));
        return newState;
    });

    try {
        await fetch('/api/recipes/archive/all', { method: 'DELETE' });
        // Bulk delete does NOT notify
    } catch (e) {
        addToast("Очищено локально", "info");
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
    <RecipeContext.Provider value={{ recipes, addRecipe, addRecipesBulk, updateRecipe, archiveRecipe, archiveRecipesBulk, restoreRecipe, deleteRecipe, deleteAllArchived, toggleFavorite, getRecipe, isLoading }}>
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
