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
  archiveRecipesBulk: (ids: string[]) => Promise<void>;
  restoreRecipe: (id: string) => Promise<void>;
  deleteRecipe: (id: string) => Promise<void>;
  deleteAllArchived: () => Promise<void>;
  toggleFavorite: (id: string) => Promise<void>;
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
    // Ставим таймаут на общую загрузку, чтобы не висеть вечно
    const timeout = setTimeout(() => {
        if (isLoading) {
            console.warn("Recipes fetch taking too long, showing cache...");
            const cached = scopedStorage.getJson<TechCard[]>('recipes_cache', []);
            setRecipes(cached);
            setIsLoading(false);
        }
    }, 5000);

    try {
      const res = await apiFetch('/api/recipes');
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      const safeData = Array.isArray(data) ? data.map((r: TechCard) => ({ 
        ...r, 
        isArchived: r.isArchived === true,
        isFavorite: r.isFavorite === true
      })) : [];
      setRecipes(safeData);
      scopedStorage.setJson('recipes_cache', safeData);
    } catch (e) {
      console.warn("API unavailable or slow, switching to offline mode.");
      const parsed = scopedStorage.getJson<TechCard[]>('recipes_cache', []);
      setRecipes(Array.isArray(parsed) ? parsed.map((r: any) => ({ 
        ...r, 
        isArchived: r.isArchived === true,
        isFavorite: r.isFavorite === true
      })) : []);
    } finally {
      clearTimeout(timeout);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRecipes();
  }, []);

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

  const escapeHtml = (unsafe: string | undefined | null) => {
    if (!unsafe) return "";
    return String(unsafe).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  };

  const calculateChanges = (oldR: TechCard, newR: TechCard): string[] => {
    const changes: string[] = [];
    const clean = (s: string | undefined | null) => (s || '').trim();
    if (clean(oldR.title) !== clean(newR.title)) changes.push(`Название: ${escapeHtml(oldR.title)} -> <b>${escapeHtml(newR.title)}</b>`);
    if (clean(oldR.outputWeight) !== clean(newR.outputWeight)) changes.push(`Выход: ${escapeHtml(oldR.outputWeight || '-')} -> <b>${escapeHtml(newR.outputWeight)}</b>`);
    const oldMap = new Map(oldR.ingredients.map(i => [clean(i.name), i]));
    newR.ingredients.forEach(newI => {
      const name = clean(newI.name);
      const oldI = oldMap.get(name);
      if (!oldI) changes.push(`Добавлен: <b>${escapeHtml(newI.name)}</b> (${escapeHtml(newI.amount)} ${escapeHtml(newI.unit)})`);
      else {
        if (clean(oldI.amount) !== clean(newI.amount) || clean(oldI.unit) !== clean(newI.unit)) {
          changes.push(`${escapeHtml(newI.name)}: ${escapeHtml(oldI.amount)} ${escapeHtml(oldI.unit)} -> <b>${escapeHtml(newI.amount)} ${escapeHtml(newI.unit)}</b>`);
        }
        oldMap.delete(name);
      }
    });
    oldMap.forEach(oldI => changes.push(`Удален: ${escapeHtml(oldI.name)}`));
    return changes;
  };

  const addRecipe = async (recipe: TechCard, notifyAll = false, silent = false) => {
    const enriched = { ...recipe, isArchived: false, lastModified: Date.now(), lastModifiedBy: user ? `${user.first_name} ${user.last_name || ''}` : 'Unknown' };
    setRecipes(prev => { const newState = [enriched, ...prev]; scopedStorage.setJson('recipes_cache', newState); return newState; });
    try {
      const res = await apiFetch('/api/recipes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(enriched) });
      if(!res.ok) throw new Error();
      await sendNotification(enriched, 'create', notifyAll, [], silent);
    } catch (e) { addToast("Сохранено локально", "info"); }
  };

  const addRecipesBulk = async (newRecipes: TechCard[], notifyAll = false) => {
    const enrichedRecipes = newRecipes.map(r => ({ ...r, isArchived: false, lastModified: Date.now(), lastModifiedBy: user ? `${user.first_name} ${user.last_name || ''}` : 'Import' }));
    setRecipes(prev => { const newState = [...enrichedRecipes, ...prev]; scopedStorage.setJson('recipes_cache', newState); return newState; });
    try { await apiFetch('/api/recipes/bulk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(enrichedRecipes) }); } catch (e) {}
  };

  const updateRecipe = async (updated: TechCard, notifyAll = false, silent = false) => {
    const oldRecipe = recipes.find(r => r.id === updated.id);
    const enriched = { 
      ...updated, 
      isArchived: updated.isArchived ?? oldRecipe?.isArchived ?? false,
      imageUrl: updated.imageUrl ?? oldRecipe?.imageUrl,
      lastModified: Date.now(),
      lastModifiedBy: user ? `${user.first_name} ${user.last_name || ''}` : 'Unknown'
    };
    setRecipes(prev => { const newState = prev.map(r => r.id === enriched.id ? enriched : r); scopedStorage.setJson('recipes_cache', newState); return newState; });
    try {
      const res = await apiFetch('/api/recipes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(enriched) });
      if(!res.ok) throw new Error();
      if (!silent) {
        const changes = oldRecipe ? calculateChanges(oldRecipe, enriched) : [];
        await sendNotification(enriched, 'update', notifyAll, changes, silent);
      }
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
    setRecipes(prev => { const newState = prev.map(r => ids.includes(r.id) ? { ...r, isArchived: true } : r); scopedStorage.setJson('recipes_cache', newState); return newState; });
    try { await apiFetch('/api/recipes/archive/batch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) }); } catch (e) {}
  };

  const deleteRecipe = async (id: string) => {
    const target = recipes.find(r => r.id === id);
    setRecipes(prev => { const newState = prev.filter(r => r.id !== id); scopedStorage.setJson('recipes_cache', newState); return newState; });
    try { await apiFetch(`/api/recipes/${id}`, { method: 'DELETE' }); if (target) await sendNotification(target, 'delete', false); } catch (e) {}
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
    <RecipeContext.Provider value={{ 
      recipes, addRecipe, addRecipesBulk, updateRecipe, archiveRecipe, 
      archiveRecipesBulk, restoreRecipe, deleteRecipe, deleteAllArchived, 
      toggleFavorite, getRecipe, isLoading 
    }}>
      {children}
    </RecipeContext.Provider>
  );
};

export const useRecipes = () => {
  const context = useContext(RecipeContext);
  if (!context) throw new Error('useRecipes must be used within a RecipeProvider');
  return context;
};
