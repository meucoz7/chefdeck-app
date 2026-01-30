
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { TechCard, Ingredient } from '../types';
import { useTelegram } from '../context/TelegramContext';
import { useToast } from './ToastContext';
import { apiFetch } from '../services/api';
import { scopedStorage } from '../services/storage';

interface RecipeContextType {
  recipes: TechCard[];
  addRecipe: (recipe: TechCard, notifyAll?: boolean, silent?: boolean) => Promise<void>;
  addRecipesBulk: (recipes: TechCard[], notifyAll?: boolean) => Promise<void>;
  updateRecipe: (recipe: TechCard, notifyAll?: boolean, silent?: boolean) => Promise<void>;
  archiveRecipe: (id: string) => Promise<void>;
  restoreRecipe: (id: string) => Promise<void>;
  deleteRecipe: (id: string) => Promise<void>;
  deleteAllArchived: () => Promise<void>;
  toggleFavorite: (id: string) => Promise<void>;
  archiveRecipesBulk: (ids: string[]) => Promise<void>;
  getRecipe: (id: string) => TechCard | undefined;
  isLoading: boolean;
}

const RecipeContext = createContext<RecipeContextType | undefined>(undefined);

export const RecipeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [recipes, setRecipes] = useState<TechCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { user, initialData, isInitialized } = useTelegram();
  const { addToast } = useToast();

  useEffect(() => {
    if (isInitialized) {
        if (initialData?.recipes) {
            const safeData = initialData.recipes.map(r => ({
                ...r,
                isArchived: r.isArchived === true,
                isFavorite: r.isFavorite === true
            }));
            setRecipes(safeData);
            scopedStorage.setJson('recipes_cache', safeData);
            setIsLoading(false);
        } else {
            // Fallback to cache or single fetch if init failed
            const cached = scopedStorage.getJson<TechCard[]>('recipes_cache', []);
            setRecipes(cached);
            setIsLoading(false);
        }
    }
  }, [isInitialized, initialData]);

  const sendNotification = async (recipe: TechCard, action: 'create' | 'update' | 'delete', notifyAll: boolean = false, changes: string[] = [], silent: boolean = false) => {
    if (!user || silent) return;
    try {
      await apiFetch('/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, recipeId: recipe.id, recipeTitle: recipe.title, targetChatId: user.id, notifyAll, changes, silent })
      });
    } catch (e) {}
  };

  const addRecipe = async (recipe: TechCard, notifyAll = false, silent = false) => {
    const enriched = { ...recipe, isArchived: false, lastModified: Date.now(), lastModifiedBy: user ? `${user.first_name}` : 'Unknown' };
    setRecipes(prev => {
      const newState = [enriched, ...prev];
      scopedStorage.setJson('recipes_cache', newState);
      return newState;
    });
    try {
      await apiFetch('/api/recipes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(enriched) });
      await sendNotification(enriched, 'create', notifyAll, [], silent);
    } catch (e) { addToast("Сохранено локально", "info"); }
  };

  const addRecipesBulk = async (newRecipes: TechCard[]) => {
    const enriched = newRecipes.map(r => ({ ...r, isArchived: false, lastModified: Date.now() }));
    setRecipes(prev => {
      const newState = [...enriched, ...prev];
      scopedStorage.setJson('recipes_cache', newState);
      return newState;
    });
    try {
      await apiFetch('/api/recipes/bulk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(enriched) });
    } catch (e) {}
  };

  const updateRecipe = async (updated: TechCard, notifyAll = false, silent = false) => {
    const oldRecipe = recipes.find(r => r.id === updated.id);
    const enriched = { ...updated, lastModified: Date.now(), lastModifiedBy: user ? `${user.first_name}` : 'Unknown' };
    setRecipes(prev => {
      const newState = prev.map(r => r.id === enriched.id ? enriched : r);
      scopedStorage.setJson('recipes_cache', newState);
      return newState;
    });
    try {
      await apiFetch('/api/recipes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(enriched) });
      if (!silent) await sendNotification(enriched, 'update', notifyAll, [], silent);
    } catch (e) { addToast("Обновлено локально", "info"); }
  };

  const archiveRecipe = async (id: string) => {
    const target = recipes.find(r => r.id === id);
    if (target) await updateRecipe({ ...target, isArchived: true }, false, true);
  };

  const restoreRecipe = async (id: string) => {
    const target = recipes.find(r => r.id === id);
    if (target) await updateRecipe({ ...target, isArchived: false }, false, true);
  };

  const archiveRecipesBulk = async (ids: string[]) => {
    setRecipes(prev => {
        const newState = prev.map(r => ids.includes(r.id) ? { ...r, isArchived: true } : r);
        scopedStorage.setJson('recipes_cache', newState);
        return newState;
    });
    try {
        await apiFetch('/api/recipes/archive/batch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) });
    } catch (e) {}
  };

  const deleteRecipe = async (id: string) => {
    setRecipes(prev => {
      const newState = prev.filter(r => r.id !== id);
      scopedStorage.setJson('recipes_cache', newState);
      return newState;
    });
    try { await apiFetch(`/api/recipes/${id}`, { method: 'DELETE' }); } catch (e) {}
  };

  const deleteAllArchived = async () => {
    setRecipes(prev => prev.filter(r => !r.isArchived));
    try { await apiFetch('/api/recipes/archive/all', { method: 'DELETE' }); } catch (e) {}
  };

  const toggleFavorite = async (id: string) => {
    const target = recipes.find(r => r.id === id);
    if (target) await updateRecipe({ ...target, isFavorite: !target.isFavorite }, false, true);
  };

  const getRecipe = useCallback((id: string) => recipes.find(r => r.id === id), [recipes]);

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
