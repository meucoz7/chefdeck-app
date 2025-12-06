
import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { useRecipes } from '../context/RecipeContext';
import { useToast } from '../context/ToastContext';
import { useTelegram } from '../context/TelegramContext';

const Details: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { getRecipe, deleteRecipe, toggleFavorite } = useRecipes();
  const { addToast } = useToast();
  const { isAdmin, user } = useTelegram();
  const navigate = useNavigate();
  const recipe = getRecipe(id || '');
  
  const [isImageOpen, setIsImageOpen] = useState(false);
  const [isVideoOpen, setIsVideoOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);

  if (!recipe) return null;

  const handleBack = () => {
    // Check if there is history state to go back to (e.g. came from home/search)
    // If not (direct link), go to home
    if (window.history.state && window.history.state.idx > 0) {
        navigate(-1);
    } else {
        navigate('/', { replace: true });
    }
  };

  const handleEdit = () => navigate(`/edit/${recipe.id}`);

  const handleDelete = () => {
    if (!isAdmin) return;
    if (confirm("Вы уверены, что хотите удалить эту техкарту?")) {
      deleteRecipe(recipe.id);
      addToast("Карта удалена", "info");
      navigate('/', { replace: true });
    }
  };

  // New Share Logic: Send to Bot
  const handleSendToChat = async () => {
    if (!user) {
        addToast("Недоступно в браузере", "error");
        return;
    }
    setIsSending(true);
    try {
        const res = await fetch('/api/share-recipe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                recipeId: recipe.id,
                targetChatId: user.id
            })
        });
        if (res.ok) {
            addToast("Отправлено в чат", "success");
        } else {
            throw new Error("Failed");
        }
    } catch (e) {
        addToast("Ошибка отправки", "error");
    } finally {
        setIsSending(false);
    }
  };

  const getEmbedVideoUrl = (url: string) => {
      const ytMatch = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/);
      return ytMatch ? `https://www.youtube.com/embed/${ytMatch[1]}` : null;
  };
  const youtubeEmbed = recipe.videoUrl ? getEmbedVideoUrl(recipe.videoUrl) : null;
  
  const hasSteps = recipe.steps.length > 0 && recipe.steps.some(s => s.trim().length > 0);
  const hasDescription = recipe.description && recipe.description.trim().length > 0 && recipe.description !== 'Нет описания';

  return (
    <div className="animate-fade-in bg-[#f2f4f7] dark:bg-[#0f1115] min-h-screen relative pb-safe-bottom">
      
      {isImageOpen && createPortal(
          <div className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-4 animate-fade-in backdrop-blur-md" onClick={() => setIsImageOpen(false)}>
             <button className="absolute top-safe-top right-4 p-2 bg-white/10 rounded-full text-white"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button>
             <img src={recipe.imageUrl || `https://ui-avatars.com/api/?name=${recipe.title}`} className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl" />
          </div>, document.body
      )}

      {isVideoOpen && createPortal(
          <div className="fixed inset-0 z-[100] bg-black/95 flex flex-col items-center justify-center p-4 animate-fade-in backdrop-blur-md">
             <div className="w-full max-w-4xl flex justify-end mb-4 pt-safe-top">
                 <button onClick={() => setIsVideoOpen(false)} className="w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button>
             </div>
             <div className="w-full max-w-4xl aspect-video bg-black rounded-3xl overflow-hidden shadow-2xl border border-white/10">
                  {youtubeEmbed ? <iframe src={youtubeEmbed} className="w-full h-full" allowFullScreen title="Video" /> : <video controls className="w-full h-full" src={recipe.videoUrl} autoPlay />}
             </div>
          </div>, document.body
      )}

      {/* Header */}
      <div className="pt-safe-top px-4 pb-2 bg-[#f2f4f7]/85 dark:bg-[#0f1115]/85 backdrop-blur-md sticky top-0 z-40 transition-colors duration-300">
          <div className="flex items-center justify-between pt-4">
              <div className="flex items-center gap-3 overflow-hidden">
                 <button onClick={handleBack} className="flex-shrink-0 w-10 h-10 rounded-full bg-white dark:bg-[#1e1e24] shadow-sm border border-gray-100 dark:border-white/5 flex items-center justify-center text-gray-900 dark:text-white active:scale-90 transition-transform hover:bg-gray-50 dark:hover:bg-white/10">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
                 </button>
                 <div className="min-w-0">
                    <h1 className="text-xl font-black text-gray-900 dark:text-white leading-none truncate">{recipe.title}</h1>
                    <p className="text-xs text-gray-400 font-bold tracking-wider uppercase truncate">{recipe.category}</p>
                 </div>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                 <button onClick={() => toggleFavorite(recipe.id)} className={`w-10 h-10 rounded-full flex items-center justify-center transition-all active:scale-90 shadow-sm border border-transparent ${recipe.isFavorite ? 'bg-red-500 text-white' : 'bg-white dark:bg-[#1e1e24] text-gray-400 dark:text-gray-300 hover:text-red-500'}`}>
                   <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill={recipe.isFavorite ? "currentColor" : "none"} stroke="currentColor" strokeWidth={recipe.isFavorite ? 0 : 2} className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" /></svg>
                 </button>
                 
                 {isAdmin && (
                    <button onClick={handleEdit} className="w-10 h-10 rounded-full bg-white dark:bg-[#1e1e24] shadow-sm flex items-center justify-center text-gray-500 hover:text-sky-500 active:scale-90 transition-transform">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" /></svg>
                    </button>
                 )}
                 
                 {/* Share to Chat Button */}
                 <button onClick={handleSendToChat} disabled={isSending} className="w-10 h-10 rounded-full bg-white dark:bg-[#1e1e24] shadow-sm flex items-center justify-center text-gray-500 hover:text-indigo-500 active:scale-90 transition-transform disabled:opacity-50">
                   {isSending ? (
                      <svg className="animate-spin h-5 w-5 text-indigo-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                   ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" /></svg>
                   )}
                 </button>
              </div>
          </div>
      </div>

      <div className="px-5 space-y-6">
          <div className="animate-slide-up space-y-4">
              {/* Tags */}
              <div className="flex flex-wrap gap-2 mt-2">
                   <div className="px-3 py-1.5 bg-white dark:bg-white/5 rounded-full shadow-sm border border-gray-100 dark:border-white/5 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-gray-400"></span>
                      <span className="text-[10px] font-bold tracking-widest uppercase text-gray-600 dark:text-gray-300">{recipe.category}</span>
                   </div>
                   {recipe.outputWeight && (
                      <div className="px-3 py-1.5 bg-white dark:bg-white/5 rounded-full shadow-sm border border-gray-100 dark:border-white/5 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-sky-500"></span>
                        <span className="text-[10px] font-bold tracking-widest uppercase text-gray-600 dark:text-gray-300">{recipe.outputWeight}</span>
                      </div>
                   )}
              </div>
              
              {/* Description - Only Show if Exists */}
              {hasDescription && (
                  <div className="bg-white dark:bg-[#1e1e24] rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-white/5">
                      <p className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed whitespace-pre-line">{recipe.description}</p>
                  </div>
              )}

              {/* Media Buttons */}
              <div className="flex gap-3">
                  <button onClick={() => setIsImageOpen(true)} className="flex-1 bg-white dark:bg-[#1e1e24] border border-gray-200 dark:border-white/10 rounded-2xl py-3 px-4 shadow-sm active:scale-95 transition hover:shadow-md flex items-center justify-center gap-2">
                     <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 text-indigo-500"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" /></svg>
                     <span className="font-bold text-xs text-gray-900 dark:text-white uppercase">Фото</span>
                  </button>
                  {recipe.videoUrl ? (
                      <button onClick={() => setIsVideoOpen(true)} className="flex-1 bg-white dark:bg-[#1e1e24] border border-gray-200 dark:border-white/10 rounded-2xl py-3 px-4 shadow-sm active:scale-95 transition hover:shadow-md flex items-center justify-center gap-2">
                         <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-red-500"><path fillRule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z" clipRule="evenodd" /></svg>
                         <span className="font-bold text-xs text-gray-900 dark:text-white uppercase">Видео</span>
                      </button>
                  ) : (
                      <div className="flex-1 border border-dashed border-gray-200 dark:border-white/5 rounded-2xl py-3 px-4 flex items-center justify-center gap-2 opacity-50 cursor-not-allowed">
                            <span className="font-bold text-xs text-gray-400 uppercase">Нет видео</span>
                      </div>
                  )}
              </div>
          </div>

          {/* Ingredients */}
          <div className="bg-white dark:bg-[#1e1e24] rounded-3xl shadow-sm border border-gray-100 dark:border-white/5 overflow-hidden animate-slide-up" style={{ animationDelay: '0.1s' }}>
              <div className="px-6 py-4 border-b border-gray-100 dark:border-white/5 bg-gray-50/50 dark:bg-white/5">
                  <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-sky-500"></span>
                      Состав ({recipe.ingredients.length})
                  </h2>
              </div>
              <div className="flex flex-col">
                  {recipe.ingredients.map((ing, idx) => (
                      <div key={idx} className="flex justify-between items-center px-6 py-3 odd:bg-white dark:odd:bg-[#1e1e24] even:bg-gray-50/50 dark:even:bg-white/[0.02] border-b border-gray-50 dark:border-white/5 last:border-0">
                          <span className="text-base font-medium text-gray-900 dark:text-gray-200 flex-1 pr-4">{ing.name}</span>
                          <div className="text-right flex-shrink-0 font-mono">
                              <span className="font-bold text-lg text-gray-900 dark:text-white">{ing.amount}</span>
                              <span className="text-xs font-bold text-gray-400 ml-1">{ing.unit}</span>
                          </div>
                      </div>
                  ))}
              </div>
          </div>

          {/* Steps */}
          {hasSteps && (
              <div className="bg-white dark:bg-[#1e1e24] rounded-3xl shadow-sm border border-gray-100 dark:border-white/5 overflow-hidden animate-slide-up pb-5" style={{ animationDelay: '0.2s' }}>
                   <div className="px-6 py-4 border-b border-gray-100 dark:border-white/5 bg-gray-50/50 dark:bg-white/5">
                      <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-orange-500"></span>
                          Приготовление
                      </h2>
                   </div>
                   <div className="p-6 space-y-6">
                       {recipe.steps.map((step, idx) => step.trim() && (
                          <div key={idx} className="flex gap-4">
                               <div className="flex-shrink-0 w-8 h-8 rounded-full bg-orange-50 dark:bg-orange-500/10 text-orange-600 dark:text-orange-400 font-bold text-sm flex items-center justify-center border border-orange-100 dark:border-orange-500/20 mt-0.5">{idx + 1}</div>
                               <p className="text-base leading-relaxed text-gray-800 dark:text-gray-200 flex-1">{step}</p>
                          </div>
                       ))}
                   </div>
              </div>
          )}

          {isAdmin && (
            <div className="flex justify-center py-6 pb-20">
                <button onClick={handleDelete} className="text-red-500 text-xs font-bold px-6 py-3 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/10 transition">Удалить техкарту</button>
            </div>
          )}
      </div>
    </div>
  );
};

export default Details;
