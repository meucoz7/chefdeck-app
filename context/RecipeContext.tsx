
import React, { createContext, useContext, useEffect, useState } from 'react';
import { TechCard, Ingredient } from '../types';
import { useTelegram } from '../context/TelegramContext';
import { useToast } from './ToastContext';
import { apiFetch } from '../services/api';
import { scopedStorage } from '../services/storage';

interface RecipeContextType {
  recipes: TechCard[];
  addRecipe: (recipe: TechCard, notifyAll?: boolean) => Promise<void>;
  addRecipesBulk: (recipes: TechCard[], notifyAll?: boolean) => Promise<void>;
  updateRecipe: (recipe: TechCard, notifyAll?: boolean, silent?: boolean) => Promise<void>;
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
          const res = await apiFetch('/api/recipes');
          if (!res.ok) throw new Error('Failed to fetch');
          const data = await res.json();
          if (Array.isArray(data)) {
              const safeData = data.map((r: TechCard) => ({ 
                ...r, 
                isArchived: !!r.isArchived,
                isFavorite: !!r.isFavorite
              }));
              setRecipes(safeData);
              scopedStorage.setJson('recipes_cache', safeData);
          }
      } catch (e) {
          const parsed = scopedStorage.getJson<TechCard[]>('recipes_cache', []);
          if (Array.isArray(parsed)) setRecipes(parsed);
      } finally {
          setIsLoading(false);
      }
  };

  useEffect(() => { fetchRecipes(); }, []);

  const sendNotification = async (recipe: TechCard, action: 'create' | 'update' | 'delete', notifyAll: boolean = false, changes: string[] = []) => {
      if (!user) return;
      try {
          await apiFetch('/api/notify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action, recipeId: recipe.id, recipeTitle: recipe.title, targetChatId: user.id, notifyAll, changes })
          });
      } catch (e) {}
  };

  const addRecipe = async (recipe: TechCard, notifyAll = false) => {
    const enriched = { ...recipe, isArchived: false, lastModified: Date.now(), lastModifiedBy: user?.first_name || 'System' };
    setRecipes(prev => {
        const newState = [enriched, ...prev];
        scopedStorage.setJson('recipes_cache', newState);
        return newState;
    });
    try {
        await apiFetch('/api/recipes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(enriched)
        });
        await sendNotification(enriched, 'create', notifyAll);
    } catch (e) { console.error(e); }
  };

  const addRecipesBulk = async (newRecipes: TechCard[], notifyAll = false) => {
      const enriched = newRecipes.map(r => ({ ...r, isArchived: false, lastModified: Date.now(), lastModifiedBy: 'Import' }));
      setRecipes(prev => {
          const newState = [...enriched, ...prev];
          scopedStorage.setJson('recipes_cache', newState);
          return newState;
      });
      try {
          await apiFetch('/api/recipes/bulk', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(enriched)
          });
      } catch (e) { console.error(e); }
  };

  const updateRecipe = async (updated: TechCard, notifyAll = false, silent = false) => {
    const oldRecipe = recipes.find(r => r.id === updated.id);
    const enriched = { 
        ...updated, 
        isArchived: updated.isArchived ?? oldRecipe?.isArchived ?? false,
        lastModified: Date.now(),
        lastModifiedBy: user?.first_name || 'System'
    };

    setRecipes(prev => {
        const newState = prev.map(r => r.id === enriched.id ? enriched : r);
        scopedStorage.setJson('recipes_cache', newState);
        return newState;
    });

    try {
        await apiFetch('/api/recipes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(enriched)
        });
        if (!silent) await sendNotification(enriched, 'update', notifyAll);
    } catch (e) { console.error(e); }
  };

  const archiveRecipe = async (id: string) => {
      const target = recipes.find(r => r.id === id);
      if (target) await updateRecipe({ ...target, isArchived: true }, false, true);
  };

  const restoreRecipe = async (id: string) => {
      const target = recipes.find(r => r.id === id);
      if (target) await updateRecipe({ ...target, isArchived: false }, false, true);
  };

  const deleteRecipe = async (id: string) => {
    const target = recipes.find(r => r.id === id);
    setRecipes(prev => {
        const newState = prev.filter(r => r.id !== id);
        scopedStorage.setJson('recipes_cache', newState);
        return newState;
    });
    try {
        await apiFetch(`/api/recipes/${id}`, { method: 'DELETE' });
        if (target) await sendNotification(target, 'delete', false);
    } catch (e) {}
  };

  const archiveRecipesBulk = async (ids: string[]) => {
      setRecipes(prev => {
          const newState = prev.map(r => ids.includes(r.id) ? { ...r, isArchived: true } : r);
          scopedStorage.setJson('recipes_cache', newState);
          return newState;
      });
      try {
          await apiFetch('/api/recipes/archive/batch', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ids })
          });
      } catch (e) {}
  };

  const deleteAllArchived = async () => {
    setRecipes(prev => prev.filter(r => !r.isArchived));
    try { await apiFetch('/api/recipes/archive/all', { method: 'DELETE' }); } catch (e) {}
  };

  const toggleFavorite = (id: string) => {
    const target = recipes.find(r => r.id === id);
    if (target) updateRecipe({ ...target, isFavorite: !target.isFavorite }, false, true);
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
  if (!context) throw new Error('useRecipes must be used within a RecipeProvider');
  return context;
};
