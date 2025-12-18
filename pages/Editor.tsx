
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { useRecipes } from '../context/RecipeContext';
import { useToast } from '../context/ToastContext';
import { TechCard, Ingredient } from '../types';
import { parsePdfFile, ParsedPdfData } from '../services/pdfService';
import { useTelegram } from '../context/TelegramContext';
import { apiFetch } from '../services/api';

type EditorMode = 'create' | 'import-upload' | 'import-staging' | 'import-images';

interface StagedRecipe extends ParsedPdfData {
  id: string;
  category: string;
  outputWeight: string;
  steps: string[];
  imageUrl?: string;
  selected: boolean;
  collapsed: boolean;
  isDuplicate: boolean; 
}

interface ImageMatch {
    recipeId: string;
    recipeName: string;
    oldImage: string;
    newImage: string;
    selected: boolean;
}

export default function Editor() {
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>(); 
  const { addRecipe, addRecipesBulk, getRecipe, updateRecipe, recipes } = useRecipes();
  const { addToast } = useToast();
  const { isAdmin } = useTelegram();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- EDITOR STATE ---
  const [mode, setMode] = useState<EditorMode>('create');
  
  // Create/Edit Mode State
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [outputWeight, setOutputWeight] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [ingredients, setIngredients] = useState<Ingredient[]>([{ name: '', amount: '', unit: 'кг' }]);
  const [steps, setSteps] = useState<string[]>(['']);
  const [isFavorite, setIsFavorite] = useState(false);
  const [shouldNotify, setShouldNotify] = useState(true); 

  // --- IMPORT STATE ---
  const [isParsing, setIsParsing] = useState(false);
  const [parsingProgress, setParsingProgress] = useState(0);
  const [stagedRecipes, setStagedRecipes] = useState<StagedRecipe[]>([]);
  const [bulkCategory, setBulkCategory] = useState('');
  const [importNotify, setImportNotify] = useState(false);
  
  // --- SCRAPE STATE ---
  const [scrapeUrl, setScrapeUrl] = useState('');
  const [imageMatches, setImageMatches] = useState<ImageMatch[]>([]);
  const [isSaving, setIsSaving] = useState(false); 

  // --- AUTOCOMPLETE LOGIC ---
  const [activeIngIndex, setActiveIngIndex] = useState<number | null>(null);
  
  const ingredientDatabase = useMemo(() => {
      const map = new Map<string, string>();
      recipes.forEach(r => {
          r.ingredients.forEach(i => {
              const cleanName = i.name.trim();
              if (cleanName && (!map.has(cleanName) || !map.get(cleanName))) {
                  map.set(cleanName, i.unit);
              }
          });
      });
      return map;
  }, [recipes]);

  const getSuggestions = (query: string) => {
      if (!query || query.length < 2) return [];
      const lowerQuery = query.toLowerCase();
      return Array.from(ingredientDatabase.keys())
          .filter(name => name.toLowerCase().includes(lowerQuery) && name.toLowerCase() !== lowerQuery)
          .slice(0, 5);
  };

  useEffect(() => {
    if (!isAdmin) {
        navigate('/');
        addToast("Доступ ограничен", "error");
    }
  }, [isAdmin, navigate, addToast]);

  useEffect(() => {
      if (id) {
          const recipeRef = getRecipe(id);
          if (recipeRef) {
              const r = JSON.parse(JSON.stringify(recipeRef));
              setTitle(r.title);
              setDescription(r.description);
              setCategory(r.category);
              setOutputWeight(r.outputWeight || '');
              setImageUrl(r.imageUrl || '');
              setVideoUrl(r.videoUrl || '');
              setIngredients(r.ingredients.length > 0 ? r.ingredients : [{ name: '', amount: '', unit: 'кг' }]);
              setSteps(r.steps.length > 0 ? r.steps : ['']);
              setIsFavorite(r.isFavorite);
          }
      }
  }, [id, getRecipe]);

  const handleBack = () => {
      if (mode === 'import-staging' || mode === 'import-images' || mode === 'import-upload') {
          setMode('create');
      } else {
          navigate(id ? `/recipe/${id}` : '/');
      }
  };

  const handleImageInput = (file: File | undefined) => {
    if (file && file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (ev) => { if (ev.target?.result) setImageUrl(ev.target.result as string); };
        reader.readAsDataURL(file);
    }
  };

  const handleSave = async () => {
    if (!title.trim()) { addToast("Введите название", "error"); return; }
    setIsSaving(true);
    try {
        const recipeData: TechCard = {
            id: id || uuidv4(),
            title: title.trim(),
            description: description || 'Нет описания',
            imageUrl,
            videoUrl,
            category: category.trim() || 'Без категории',
            outputWeight: outputWeight || '',
            isFavorite: isFavorite,
            ingredients: ingredients.filter(i => i.name.trim() !== ''),
            steps: steps.filter(s => s.trim() !== ''),
            createdAt: id ? (getRecipe(id)?.createdAt || Date.now()) : Date.now()
        };
        if (id) {
            await updateRecipe(recipeData, shouldNotify);
            addToast("Обновлено", "success");
            navigate(`/recipe/${id}`, { replace: true });
        } else {
            await addRecipe(recipeData, shouldNotify);
            addToast("Сохранено", "success");
            navigate('/', { replace: true });
        }
    } catch (e) {
        addToast("Ошибка сохранения", "error");
    } finally {
        setIsSaving(false);
    }
  };

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setIsParsing(true);
      setParsingProgress(10);
      try {
          const data = await parsePdfFile(file);
          setParsingProgress(60);
          const existingTitles = new Set(recipes.map(r => r.title.toLowerCase().trim()));
          const staged: StagedRecipe[] = data.map(item => ({
              ...item,
              id: uuidv4(),
              category: '',
              outputWeight: '',
              steps: [''],
              selected: true,
              collapsed: true,
              isDuplicate: existingTitles.has(item.title.toLowerCase().trim())
          }));
          setStagedRecipes(staged);
          setParsingProgress(100);
          setMode('import-staging');
      } catch (err) {
          addToast("Ошибка чтения PDF", "error");
      } finally {
          setIsParsing(false);
          setParsingProgress(0);
      }
  };

  const updateStaged = (idx: number, field: keyof StagedRecipe, val: any) => {
      const news = [...stagedRecipes];
      news[idx] = { ...news[idx], [field]: val };
      setStagedRecipes(news);
  };

  const handleSaveImport = async () => {
      const targets = stagedRecipes.filter(r => r.selected);
      if (targets.length === 0) return;
      setIsSaving(true);
      try {
          const final: TechCard[] = targets.map(r => ({
              id: uuidv4(),
              title: r.title,
              description: '',
              category: bulkCategory || r.category || 'Импорт',
              ingredients: r.ingredients,
              steps: r.steps,
              outputWeight: r.outputWeight,
              isFavorite: false,
              createdAt: Date.now()
          }));
          await addRecipesBulk(final, importNotify);
          addToast(`Импортировано ${final.length} карт`, "success");
          navigate('/');
      } catch (e) {
          addToast("Ошибка импорта", "error");
      } finally {
          setIsSaving(false);
      }
  };

  const handleUrlScrape = async () => {
      if (!scrapeUrl) return;
      setIsParsing(true);
      setImageMatches([]);
      try {
          const res = await apiFetch(`/api/proxy?url=${encodeURIComponent(scrapeUrl)}`);
          if (!res.ok) throw new Error();
          const html = await res.text();
          const parser = new DOMParser();
          const doc = parser.parseFromString(html, 'text/html');
          
          const scrapedImages: { alt: string, src: string }[] = [];
          doc.querySelectorAll('img').forEach(img => {
              const src = img.getAttribute('src');
              const alt = img.getAttribute('alt') || '';
              if (src && src.startsWith('http') && alt.length > 3) {
                  scrapedImages.push({ alt: alt.toLowerCase(), src });
              }
          });

          const matches: ImageMatch[] = [];
          recipes.forEach(r => {
              if (r.imageUrl || r.isArchived) return;
              const match = scrapedImages.find(img => img.alt.includes(r.title.toLowerCase()) || r.title.toLowerCase().includes(img.alt));
              if (match) {
                  matches.push({ recipeId: r.id, recipeName: r.title, oldImage: '', newImage: match.src, selected: true });
              }
          });

          setImageMatches(matches);
          if (matches.length === 0) addToast("Совпадений не найдено", "info");
          else addToast(`Найдено ${matches.length} фото`, "success");
      } catch (e) {
          addToast("Ошибка доступа к сайту", "error");
      } finally {
          setIsParsing(false);
      }
  };

  const handleApplyScrape = async () => {
      const selected = imageMatches.filter(m => m.selected);
      if (selected.length === 0) return;
      setIsSaving(true);
      try {
          for (const match of selected) {
              const r = recipes.find(rec => rec.id === match.recipeId);
              if (r) await updateRecipe({ ...r, imageUrl: match.newImage }, false, true);
          }
          addToast("Фото привязаны", "success");
          navigate('/');
      } catch (e) {
          addToast("Ошибка сохранения", "error");
      } finally {
          setIsSaving(false);
      }
  };

  return (
    <div className="pb-safe-bottom animate-fade-in min-h-screen bg-[#f2f4f7] dark:bg-[#0f1115] relative">
       {(isSaving || isParsing) && (
           <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-md flex flex-col items-center justify-center p-8 animate-fade-in">
                <div className="bg-white dark:bg-[#1e1e24] p-8 rounded-[2.5rem] text-center shadow-2xl border border-gray-100 dark:border-white/5">
                    <div className="animate-spin text-sky-500 mb-6 inline-block">
                        <svg className="w-12 h-12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    </div>
                    <h3 className="font-black text-xl dark:text-white uppercase tracking-tighter">{isSaving ? 'Сохранение...' : 'Анализ данных...'}</h3>
                    {parsingProgress > 0 && <div className="w-full h-1.5 bg-gray-100 dark:bg-white/10 rounded-full mt-4 overflow-hidden"><div className="h-full bg-sky-500 transition-all duration-300" style={{ width: `${parsingProgress}%` }}></div></div>}
                </div>
           </div>
       )}
       
       <div className="px-5 pt-safe-top flex justify-between items-center mb-4">
          <button onClick={handleBack} className="w-10 h-10 rounded-full bg-white dark:bg-[#1e1e24] shadow-sm flex items-center justify-center text-gray-500 border border-gray-100 dark:border-white/5 active:scale-95 transition">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
          </button>
          <div className="flex gap-2">
            {!id && mode === 'create' && (
                <>
                <button onClick={() => setMode('import-images')} className="text-[9px] font-black uppercase bg-white dark:bg-indigo-500/10 text-indigo-600 px-3 py-2 rounded-xl shadow-sm border border-indigo-100 dark:border-indigo-500/20 active:scale-95 transition">🖼️ Фото</button>
                <button onClick={() => setMode('import-upload')} className="text-[9px] font-black uppercase bg-white dark:bg-sky-500/10 text-sky-600 px-3 py-2 rounded-xl shadow-sm border border-sky-100 dark:border-sky-500/20 active:scale-95 transition">📄 PDF</button>
                </>
            )}
          </div>
       </div>

       <div className="px-5 pb-20 space-y-6">
          <h1 className="text-2xl font-black dark:text-white leading-none tracking-tighter">
              {mode === 'create' ? (id ? 'Редактор техкарты' : 'Новое блюдо') : mode === 'import-staging' ? 'Подтверждение импорта' : 'Импорт данных'}
          </h1>
          
          {mode === 'create' && (
             <div className="space-y-4 animate-slide-up">
                {/* Image & Main Info */}
                <div className="bg-white dark:bg-[#1e1e24] p-4 rounded-[2rem] shadow-sm border border-gray-100 dark:border-white/5 space-y-4">
                    <div className="relative w-full aspect-video rounded-2xl bg-gray-50 dark:bg-black/20 overflow-hidden group cursor-pointer border-2 border-dashed border-gray-200 dark:border-white/5 flex flex-col items-center justify-center" onClick={() => !imageUrl && fileInputRef.current?.click()}>
                        {imageUrl ? (
                            <img src={imageUrl} className="w-full h-full object-cover animate-fade-in" alt="Recipe" />
                        ) : (
                            <div className="text-center opacity-40">
                                <span className="text-3xl mb-1 block">📸</span>
                                <span className="text-[9px] font-black uppercase tracking-widest">Добавить фото</span>
                            </div>
                        )}
                        <input ref={fileInputRef} type="file" className="hidden" accept="image/*" onChange={e => handleImageInput(e.target.files?.[0])} />
                    </div>
                    {imageUrl && <button onClick={() => setImageUrl('')} className="w-full py-1 text-[8px] font-black text-red-500 uppercase tracking-widest opacity-50">Удалить изображение</button>}

                    <div className="space-y-3">
                        <div className="space-y-1">
                            <label className="text-[9px] font-black uppercase text-gray-400 ml-1">Название блюда</label>
                            <input className="w-full bg-gray-50 dark:bg-white/5 p-3 rounded-xl font-black text-base dark:text-white outline-none focus:ring-2 focus:ring-sky-500/20 transition-all" value={title} onChange={e => setTitle(e.target.value)} placeholder="Напр. Паста Карбонара" />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <label className="text-[9px] font-black uppercase text-gray-400 ml-1">Категория</label>
                                <input className="w-full bg-gray-50 dark:bg-white/5 p-3 rounded-xl font-bold dark:text-white text-sm outline-none" value={category} onChange={e => setCategory(e.target.value)} placeholder="Горячее" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[9px] font-black uppercase text-gray-400 ml-1">Выход (г/шт)</label>
                                <input className="w-full bg-gray-50 dark:bg-white/5 p-3 rounded-xl font-bold dark:text-white text-sm outline-none" value={outputWeight} onChange={e => setOutputWeight(e.target.value)} placeholder="350 г" />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Ingredients Smart Table */}
                <div className="bg-white dark:bg-[#1e1e24] p-5 rounded-[2rem] shadow-sm border border-gray-100 dark:border-white/5">
                    <h3 className="text-[10px] font-black uppercase text-gray-400 mb-4 tracking-widest flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-sky-500"></span>
                        Состав ингредиентов
                    </h3>
                    <div className="space-y-2">
                        {ingredients.map((ing, i) => (
                            <div key={i} className="flex gap-1.5 items-center animate-fade-in">
                                <div className="flex-1 relative">
                                    <input className="w-full bg-gray-50 dark:bg-white/5 p-3 rounded-xl text-xs font-bold dark:text-white outline-none border border-transparent focus:border-sky-500/30" value={ing.name} onChange={e => {
                                        const n = [...ingredients]; n[i].name = e.target.value; setIngredients(n);
                                        setActiveIngIndex(i);
                                    }} onFocus={() => setActiveIngIndex(i)} onBlur={() => setTimeout(() => setActiveIngIndex(null), 200)} placeholder="Продукт" />
                                    {activeIngIndex === i && getSuggestions(ing.name).length > 0 && (
                                        <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white dark:bg-[#2a2a35] shadow-2xl rounded-xl border border-gray-100 dark:border-white/10 overflow-hidden animate-scale-in">
                                            {getSuggestions(ing.name).map(s => (
                                                <div key={s} onMouseDown={() => {
                                                    const n = [...ingredients]; n[i].name = s; n[i].unit = ingredientDatabase.get(s) || n[i].unit;
                                                    setIngredients(n);
                                                }} className="p-3 text-xs font-bold border-b border-gray-100 dark:border-white/5 last:border-0 dark:text-white cursor-pointer hover:bg-sky-50 dark:hover:bg-white/5 transition-colors">{s}</div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <input className="w-14 bg-gray-50 dark:bg-white/5 p-3 rounded-xl text-xs font-black text-center dark:text-sky-400 outline-none" value={ing.amount} onChange={e => { const n = [...ingredients]; n[i].amount = e.target.value.replace(',','.'); setIngredients(n); }} placeholder="0" />
                                <input className="w-10 bg-gray-50 dark:bg-white/5 p-3 rounded-xl text-[8px] font-black text-center dark:text-gray-400 outline-none uppercase" value={ing.unit} onChange={e => { const n = [...ingredients]; n[i].unit = e.target.value; setIngredients(n); }} placeholder="ед" />
                                {ingredients.length > 1 && <button onClick={() => setIngredients(ingredients.filter((_, idx) => idx !== i))} className="w-8 h-8 flex-shrink-0 text-red-500 opacity-30 hover:opacity-100 transition-opacity">✕</button>}
                            </div>
                        ))}
                    </div>
                    <button onClick={() => setIngredients([...ingredients, { name: '', amount: '', unit: 'кг' }])} className="w-full mt-4 py-3 border-2 border-dashed border-gray-100 dark:border-white/5 rounded-xl text-[9px] font-black uppercase text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5 active:scale-95 transition-all">+ Добавить строку</button>
                </div>

                {/* Methodology / Steps */}
                <div className="bg-white dark:bg-[#1e1e24] p-5 rounded-[2rem] shadow-sm border border-gray-100 dark:border-white/5 space-y-4">
                    <h3 className="text-[10px] font-black uppercase text-gray-400 mb-2 tracking-widest flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-orange-500"></span>
                        Технологический процесс
                    </h3>
                    <div className="space-y-4">
                        {steps.map((step, i) => (
                            <div key={i} className="flex gap-3 items-start animate-fade-in group">
                                <div className="w-7 h-7 rounded-full bg-orange-50 dark:bg-orange-500/10 text-orange-600 flex items-center justify-center font-black text-[10px] flex-shrink-0 mt-1 border border-orange-100 dark:border-orange-500/20">{i+1}</div>
                                <textarea className="flex-1 bg-gray-50 dark:bg-white/5 p-3 rounded-xl text-xs font-medium dark:text-white outline-none resize-none min-h-[80px] focus:ring-2 focus:ring-orange-500/20 transition-all" value={step} onChange={e => { const s = [...steps]; s[i] = e.target.value; setSteps(s); }} placeholder="Описание этапа..." />
                                {steps.length > 1 && <button onClick={() => setSteps(steps.filter((_, idx) => idx !== i))} className="w-6 h-6 flex-shrink-0 text-red-500 opacity-0 group-hover:opacity-30 transition-opacity mt-2">✕</button>}
                            </div>
                        ))}
                    </div>
                    <button onClick={() => setSteps([...steps, ''])} className="w-full py-3 border-2 border-dashed border-gray-100 dark:border-white/5 rounded-xl text-[9px] font-black uppercase text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5 active:scale-95 transition-all">+ Добавить шаг</button>
                </div>

                {/* Footer Controls */}
                <div className="bg-white dark:bg-[#1e1e24] p-4 rounded-3xl shadow-sm border border-gray-100 dark:border-white/5 flex items-center justify-between" onClick={() => setShouldNotify(!shouldNotify)}>
                    <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${shouldNotify ? 'bg-sky-500 text-white' : 'bg-gray-100 dark:bg-white/5 text-gray-400'}`}>
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" /></svg>
                        </div>
                        <span className="text-[10px] font-black uppercase text-gray-500">Уведомить в Telegram</span>
                    </div>
                    <div className={`w-10 h-6 rounded-full p-1 transition-colors ${shouldNotify ? 'bg-sky-500' : 'bg-gray-200 dark:bg-white/10'}`}>
                        <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${shouldNotify ? 'translate-x-4' : 'translate-x-0'}`}></div>
                    </div>
                </div>

                <div className="pt-4 pb-12">
                    <button onClick={handleSave} disabled={isSaving} className="w-full bg-gray-900 dark:bg-white text-white dark:text-black font-black py-4 rounded-2xl shadow-xl active:scale-95 transition-all text-lg uppercase tracking-widest">
                        {id ? 'Обновить карту' : 'Создать техкарту'}
                    </button>
                </div>
             </div>
          )}
          
          {mode === 'import-upload' && (
              <div className="animate-fade-in py-12 flex flex-col items-center justify-center h-full">
                  <div className="bg-white dark:bg-[#1e1e24] p-10 rounded-[3rem] shadow-xl border border-gray-100 dark:border-white/5 text-center w-full max-w-sm">
                      <div className="w-20 h-20 bg-sky-50 dark:bg-sky-500/10 rounded-full flex items-center justify-center text-3xl mb-6 mx-auto">📄</div>
                      <h2 className="text-xl font-black dark:text-white mb-2 tracking-tighter uppercase">Импорт PDF</h2>
                      <p className="text-xs text-gray-500 mb-8 leading-relaxed">Загрузите PDF файл с техкартами, система автоматически распознает состав и технологию.</p>
                      <input type="file" accept=".pdf" className="hidden" id="pdf-input" onChange={handlePdfUpload} />
                      <label htmlFor="pdf-input" className="block w-full py-4 bg-gray-900 dark:bg-white text-white dark:text-black font-black rounded-2xl cursor-pointer active:scale-95 transition-transform uppercase tracking-widest text-sm">Выбрать файл</label>
                  </div>
              </div>
          )}

          {mode === 'import-images' && (
              <div className="animate-fade-in space-y-6">
                  <div className="bg-white dark:bg-[#1e1e24] p-6 rounded-[2.5rem] shadow-sm border border-gray-100 dark:border-white/5">
                      <h2 className="text-lg font-black dark:text-white mb-4 uppercase tracking-tighter">Скрапинг фото</h2>
                      <p className="text-xs text-gray-500 mb-6">Введите ссылку на сайт вашего меню. Система найдет фото и привяжет их к вашим блюдам без фото.</p>
                      <div className="flex gap-2">
                          <input className="flex-1 bg-gray-50 dark:bg-white/5 p-3 rounded-xl text-sm font-bold dark:text-white outline-none" placeholder="https://tastymenu.ru..." value={scrapeUrl} onChange={e => setScrapeUrl(e.target.value)} />
                          <button onClick={handleUrlScrape} disabled={isParsing} className="bg-indigo-500 text-white px-4 rounded-xl font-black disabled:opacity-50">🔍</button>
                      </div>
                  </div>
                  {imageMatches.length > 0 && (
                      <div className="space-y-3">
                          <h3 className="text-xs font-black uppercase text-gray-400 px-2">Найденные совпадения ({imageMatches.length})</h3>
                          {imageMatches.map((m, idx) => (
                              <div key={idx} className="bg-white dark:bg-[#1e1e24] p-3 rounded-2xl flex items-center gap-4 border border-gray-100 dark:border-white/5">
                                  <img src={m.newImage} className="w-16 h-16 rounded-xl object-cover" />
                                  <div className="flex-1 min-w-0">
                                      <p className="font-bold text-sm dark:text-white truncate">{m.recipeName}</p>
                                  </div>
                                  <input type="checkbox" checked={m.selected} onChange={e => {
                                      const news = [...imageMatches];
                                      news[idx].selected = e.target.checked;
                                      setImageMatches(news);
                                  }} className="w-5 h-5 rounded-lg text-sky-500" />
                              </div>
                          ))}
                          <button onClick={handleApplyScrape} className="w-full py-4 bg-sky-500 text-white font-black rounded-2xl shadow-lg active:scale-95 transition mt-4">ПРИМЕНИТЬ ФОТО</button>
                      </div>
                  )}
              </div>
          )}

          {mode === 'import-staging' && (
               <div className="animate-fade-in space-y-4 pb-20">
                   <div className="bg-sky-500 p-6 rounded-[2.5rem] text-white shadow-lg space-y-4">
                       <div className="flex justify-between items-center">
                           <div>
                               <span className="text-[10px] font-black uppercase opacity-70">Найдено техкарт</span>
                               <p className="text-3xl font-black">{stagedRecipes.length}</p>
                           </div>
                           <button onClick={handleSaveImport} className="bg-white text-sky-500 font-black px-6 py-3 rounded-2xl active:scale-95 transition uppercase tracking-widest text-xs">Импорт</button>
                       </div>
                       <div className="space-y-1">
                           <label className="text-[9px] font-black uppercase opacity-70">Общая категория</label>
                           <input className="w-full bg-white/20 p-2 rounded-lg outline-none placeholder-white/40 font-bold" value={bulkCategory} onChange={e => setBulkCategory(e.target.value)} placeholder="Напр. Меню Лето 2024" />
                       </div>
                   </div>

                   <div className="space-y-3">
                       {stagedRecipes.map((r, idx) => (
                           <div key={r.id} className={`bg-white dark:bg-[#1e1e24] rounded-3xl overflow-hidden border-2 transition-all ${r.selected ? 'border-sky-500 shadow-md' : 'border-transparent opacity-60'}`}>
                               <div className="p-4 flex items-center justify-between cursor-pointer" onClick={() => updateStaged(idx, 'collapsed', !r.collapsed)}>
                                   <div className="flex items-center gap-3 min-w-0">
                                       <input type="checkbox" checked={r.selected} onChange={e => updateStaged(idx, 'selected', e.target.checked)} onClick={e => e.stopPropagation()} className="w-5 h-5 rounded text-sky-500" />
                                       <span className="font-bold text-sm dark:text-white truncate">{r.title}</span>
                                       {r.isDuplicate && <span className="text-[8px] bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded font-black">ДУБЛИКАТ</span>}
                                   </div>
                                   <svg className={`w-4 h-4 text-gray-300 transition-transform ${r.collapsed ? '' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
                               </div>
                               {!r.collapsed && (
                                   <div className="px-4 pb-4 space-y-4 animate-fade-in border-t border-gray-50 dark:border-white/5 pt-4">
                                       <div className="space-y-1">
                                           <label className="text-[9px] font-black text-gray-400 uppercase">Название</label>
                                           <input className="w-full bg-gray-50 dark:bg-white/5 p-2 rounded-lg text-sm font-bold dark:text-white" value={r.title} onChange={e => updateStaged(idx, 'title', e.target.value)} />
                                       </div>
                                       <div className="space-y-1">
                                           <label className="text-[9px] font-black text-gray-400 uppercase">Состав ({r.ingredients.length})</label>
                                           <div className="space-y-1 max-h-40 overflow-y-auto no-scrollbar bg-gray-50 dark:bg-black/20 p-2 rounded-xl">
                                               {r.ingredients.map((ing, i) => (
                                                   <div key={i} className="flex justify-between text-[10px] dark:text-gray-300 py-0.5">
                                                       <span>{ing.name}</span>
                                                       <span className="font-bold">{ing.amount} {ing.unit}</span>
                                                   </div>
                                               ))}
                                           </div>
                                       </div>
                                       <div className="space-y-1">
                                           <label className="text-[9px] font-black text-gray-400 uppercase">Инструкция</label>
                                           <textarea className="w-full bg-gray-50 dark:bg-white/5 p-2 rounded-lg text-xs min-h-[80px] outline-none dark:text-white" value={r.steps.join('\n')} onChange={e => updateStaged(idx, 'steps', e.target.value.split('\n'))} />
                                       </div>
                                   </div>
                               )}
                           </div>
                       ))}
                   </div>
               </div>
          )}
       </div>
    </div>
  );
}
