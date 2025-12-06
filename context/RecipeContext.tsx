
import React, { createContext, useContext, useEffect, useState } from 'react';
import { TechCard } from '../types';
import { useTelegram } from './TelegramContext';
import { useToast } from './ToastContext';

interface RecipeContextType {
  recipes: TechCard[];
  addRecipe: (recipe: TechCard, notifyAll?: boolean) => Promise<void>;
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

  // Load recipes from Backend API with Offline Fallback
  const fetchRecipes = async () => {
      try {
          const res = await fetch('/api/recipes');
          if (!res.ok) throw new Error('Failed to fetch');
          const data = await res.json();
          setRecipes(data);
          // Sync successful fetch to local storage for future offline use
          localStorage.setItem('recipes_cache', JSON.stringify(data));
      } catch (e) {
          console.warn("API unavailable, switching to offline mode.");
          // Fallback to local storage if offline or server fails
          const saved = localStorage.getItem('recipes_cache') || localStorage.getItem('recipes_v3');
          if (saved) setRecipes(JSON.parse(saved));
          
          if (window.location.hostname === 'localhost') {
            // Only show toast in dev to not annoy users in prod if offline
            // addToast("Сервер недоступен. Работаем локально.", "info");
          }
      } finally {
          setIsLoading(false);
      }
  };

  useEffect(() => {
    fetchRecipes();
  }, []);

  // Helper to send notification
  const sendNotification = async (recipe: TechCard, action: 'create' | 'update' | 'delete', notifyAll: boolean = false) => {
      if (!user) return;
      try {
          await fetch('/api/notify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                  action,
                  recipeId: recipe.id,
                  recipeTitle: recipe.title,
                  editorName: `${user.first_name} ${user.last_name || ''}`,
                  targetChatId: user.id,
                  notifyAll
              })
          });
      } catch (e) {
          console.error("Notify failed (server might be offline)", e);
      }
  };

  const addRecipe = async (recipe: TechCard, notifyAll = false) => {
    const enriched = { 
        ...recipe, 
        lastModifiedBy: user ? `${user.first_name} ${user.last_name || ''}` : 'Unknown'
    };
    
    // Optimistic Update (Update UI immediately)
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
        await sendNotification(enriched, 'create', notifyAll);
    } catch (e) {
        addToast("Сохранено локально (нет связи с сервером)", "info");
    }
  };

  const updateRecipe = async (updated: TechCard, notifyAll = false) => {
    const enriched = { 
        ...updated, 
        lastModified: Date.now(),
        lastModifiedBy: user ? `${user.first_name} ${user.last_name || ''}` : 'Unknown'
    };

    // Optimistic Update
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
        await sendNotification(enriched, 'update', notifyAll);
    } catch (e) {
        addToast("Сохранено локально (нет связи с сервером)", "info");
    }
  };

  const deleteRecipe = async (id: string) => {
    const target = recipes.find(r => r.id === id);
    
    // Optimistic Update
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

  // Favorites are local only (per device) for now
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
