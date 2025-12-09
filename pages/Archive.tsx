import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useRecipes } from '../context/RecipeContext';
import { useToast } from '../context/ToastContext';
import { useTelegram } from '../context/TelegramContext';

const Archive: React.FC = () => {
    const { recipes, restoreRecipe, deleteRecipe } = useRecipes();
    const { isAdmin } = useTelegram();
    const { addToast } = useToast();
    const navigate = useNavigate();

    const archivedRecipes = recipes.filter(r => r.isArchived);

    const handleRestore = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        restoreRecipe(id);
        addToast("Восстановлено", "success");
    };

    const handleDeleteForever = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if(confirm("Удалить навсегда? Это действие нельзя отменить.")) {
            deleteRecipe(id);
            addToast("Удалено навсегда", "info");
        }
    };

    return (
        <div className="pb-28 animate-fade-in min-h-screen">
            {/* Header */}
            <div className="pt-safe-top px-5 pb-2 bg-[#f2f4f7]/85 dark:bg-[#0f1115]/85 backdrop-blur-md sticky top-0 z-30 transition-all duration-300">
                <div className="flex items-center gap-3 pt-4 mb-3">
                    <button onClick={() => navigate('/')} className="w-10 h-10 rounded-full bg-white dark:bg-[#1e1e24] shadow-sm border border-gray-100 dark:border-white/5 flex items-center justify-center text-gray-900 dark:text-white active:scale-90 transition-transform hover:bg-gray-50 dark:hover:bg-white/10">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
                    </button>
                    <div>
                        <h1 className="text-2xl font-black text-gray-900 dark:text-white leading-none">Архив</h1>
                        <p className="text-xs text-gray-400 font-bold tracking-wider uppercase">Удаленные техкарты</p>
                    </div>
                </div>
            </div>

            <div className="px-5 pt-4">
                {archivedRecipes.length === 0 ? (
                    <div className="flex flex-col items-center justify-center mt-20 text-center opacity-50">
                        <div className="text-4xl mb-4">📭</div>
                        <p className="font-bold dark:text-white">Архив пуст</p>
                        <p className="text-xs text-gray-400">Удаленные рецепты появятся здесь</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {archivedRecipes.map(recipe => (
                            <div key={recipe.id} onClick={() => navigate(`/recipe/${recipe.id}`)} className="bg-white dark:bg-[#1e1e24] p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-white/5 flex gap-4 cursor-pointer active:scale-[0.98] transition">
                                <div className="w-16 h-16 rounded-xl bg-gray-100 dark:bg-white/5 overflow-hidden flex-shrink-0 grayscale opacity-80">
                                    <img 
                                        src={recipe.imageUrl || `https://ui-avatars.com/api/?name=${recipe.title}`} 
                                        className="w-full h-full object-cover" 
                                    />
                                </div>
                                <div className="flex-1 min-w-0 flex flex-col justify-center">
                                    <h3 className="font-bold text-gray-700 dark:text-gray-300 truncate line-through decoration-gray-400">{recipe.title}</h3>
                                    <p className="text-xs text-gray-400">{recipe.category}</p>
                                    
                                    {isAdmin && (
                                        <div className="flex gap-2 mt-2">
                                            <button onClick={(e) => handleRestore(recipe.id, e)} className="text-[10px] font-bold text-green-600 bg-green-50 dark:bg-green-500/10 px-2 py-1 rounded hover:bg-green-100 transition">Восстановить</button>
                                            <button onClick={(e) => handleDeleteForever(recipe.id, e)} className="text-[10px] font-bold text-red-500 bg-red-50 dark:bg-red-500/10 px-2 py-1 rounded hover:bg-red-100 transition">Удалить</button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default Archive;
