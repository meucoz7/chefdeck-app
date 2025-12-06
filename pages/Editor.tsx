
import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { useRecipes } from '../context/RecipeContext';
import { useToast } from '../context/ToastContext';
import { TechCard, Ingredient } from '../types';
import { parsePdfFile, ParsedPdfData } from '../services/pdfService';
import { useTelegram } from '../context/TelegramContext';

type EditorMode = 'create' | 'import-upload' | 'import-staging';

interface StagedRecipe extends ParsedPdfData {
  id: string;
  category: string;
  outputWeight: string;
  steps: string[];
  imageUrl?: string;
  selected: boolean;
  collapsed: boolean;
}

const Editor: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>(); 
  const { addRecipe, getRecipe, updateRecipe } = useRecipes();
  const { addToast } = useToast();
  const { isAdmin } = useTelegram();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- STATE ---
  const [mode, setMode] = useState<EditorMode>('create');
  
  // Create/Edit Mode State
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [outputWeight, setOutputWeight] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [ingredients, setIngredients] = useState<Ingredient[]>([{ name: '', amount: '', unit: '' }]);
  const [steps, setSteps] = useState<string[]>(['']);
  const [isFavorite, setIsFavorite] = useState(false);
  
  // Notification Feature
  const [shouldNotify, setShouldNotify] = useState(true); 
  const [showUrlInput, setShowUrlInput] = useState(false);

  // Import Mode State
  const [isParsing, setIsParsing] = useState(false);
  const [stagedRecipes, setStagedRecipes] = useState<StagedRecipe[]>([]);

  // --- ACCESS CONTROL ---
  useEffect(() => {
    if (!isAdmin) {
        navigate('/');
        addToast("Доступ запрещен", "error");
    }
  }, [isAdmin, navigate, addToast]);

  // --- EFFECT: LOAD DATA FOR EDITING ---
  useEffect(() => {
      if (id) {
          const recipe = getRecipe(id);
          if (recipe) {
              setTitle(recipe.title);
              setDescription(recipe.description);
              setCategory(recipe.category);
              setOutputWeight(recipe.outputWeight || '');
              setImageUrl(recipe.imageUrl || '');
              setVideoUrl(recipe.videoUrl || '');
              setIngredients(recipe.ingredients.length > 0 ? recipe.ingredients : [{ name: '', amount: '', unit: '' }]);
              setSteps(recipe.steps.length > 0 ? recipe.steps : ['']);
              setIsFavorite(recipe.isFavorite);
          }
      }
  }, [id, getRecipe]);

  const handleBack = () => {
      if (mode === 'import-staging') {
          if (confirm("Вернуться к выбору файла? Текущие изменения будут потеряны.")) {
            setStagedRecipes([]);
            setMode('import-upload');
          }
      } else if (mode === 'import-upload') {
          setMode('create');
      } else {
          if (id) navigate(`/recipe/${id}`);
          else navigate('/');
      }
  };

  const handleImageInput = (file: File | undefined, setter: (url: string) => void) => {
    if (file && file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (ev) => { if (ev.target?.result) setter(ev.target.result as string); };
        reader.readAsDataURL(file);
    }
  };
  
  const calculateWeightValue = (ings: Ingredient[]): string => {
      let total = 0;
      ings.forEach(ing => {
          let val = parseFloat(ing.amount.replace(',', '.'));
          if (isNaN(val)) return;
          const unit = ing.unit.toLowerCase();
          if (unit.includes('кг') || unit.includes('л') || unit.includes('литр')) val *= 1000;
          total += val;
      });
      return total > 0 ? `${total.toFixed(0)} г` : '';
  };

  // --- SAVE / UPDATE ---
  const handleSave = async () => {
    if (!title) { addToast("Укажите название", "error"); return; }
    
    const recipeData: TechCard = {
      id: id || uuidv4(),
      title,
      description: description || 'Нет описания',
      imageUrl,
      videoUrl,
      category: category || 'Без категории',
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
  };

  // --- IMPORT ACTIONS ---
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
        setIsParsing(true);
        const data = await parsePdfFile(file);
        const staged: StagedRecipe[] = data.map(item => ({
            ...item,
            id: uuidv4(),
            category: '',
            outputWeight: calculateWeightValue(item.ingredients),
            steps: [''], 
            imageUrl: '',
            selected: true,
            collapsed: true
        }));
        setStagedRecipes(staged);
        setMode('import-staging');
    } catch (err: any) {
        addToast(err.message || "Ошибка PDF", "error");
    } finally {
        setIsParsing(false);
        if (fileInputRef.current) fileInputRef.current.value = ''; 
    }
  };

  const updateStagedRecipe = (id: string, field: keyof StagedRecipe, value: any) => {
      setStagedRecipes(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  const handleSaveImport = async () => {
      const selected = stagedRecipes.filter(r => r.selected);
      if (selected.length === 0) { addToast("Ничего не выбрано", "error"); return; }
      
      for (const r of selected) {
          const newId = uuidv4();
          await addRecipe({
              id: newId,
              title: r.title,
              description: '',
              imageUrl: r.imageUrl,
              category: r.category || 'Импорт',
              outputWeight: r.outputWeight,
              isFavorite: false,
              ingredients: r.ingredients,
              steps: r.steps.filter(s => s.trim().length > 0),
              createdAt: Date.now()
          }, shouldNotify); 
      }
      
      addToast(`Импортировано: ${selected.length}`, "success");
      navigate('/', { replace: true });
  };
  
  if (!isAdmin) return null;

  return (
    <div className="pb-safe-bottom animate-slide-up mx-auto min-h-screen relative bg-[#f2f4f7] dark:bg-[#0f1115]">
       
       {/* HEADER (Non-Sticky) */}
       <div className="px-5 pt-safe-top mt-4 flex justify-between items-center mb-4">
          <button onClick={handleBack} className="flex items-center gap-2 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition group">
                <div className="w-9 h-9 rounded-full bg-white dark:bg-white/10 flex items-center justify-center shadow-sm border border-gray-100 dark:border-white/5 group-active:scale-95 transition">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                    </svg>
                </div>
                <span className="font-bold text-sm hidden sm:block">Назад</span>
          </button>
          
          <div className="flex items-center gap-2">
            {mode === 'create' && !id && (
                <button onClick={() => setMode('import-upload')} className="text-xs font-bold text-sky-600 bg-white dark:bg-sky-500/10 px-4 py-2.5 rounded-xl shadow-sm hover:shadow-md active:scale-95 transition border border-gray-100 dark:border-sky-500/20">
                    PDF Импорт
                </button>
            )}
             {mode === 'import-staging' && (
                <button onClick={handleSaveImport} className="text-xs font-bold text-white bg-gray-900 dark:bg-white dark:text-black px-4 py-2.5 rounded-xl shadow-lg active:scale-95 transition flex items-center gap-2">
                    <span>Сохранить ({stagedRecipes.filter(r=>r.selected).length})</span>
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                </button>
            )}
          </div>
       </div>

       <div className="px-5 pb-10 space-y-6 max-w-lg mx-auto">
          <h1 className="text-2xl font-black dark:text-white leading-none tracking-tight mb-6">
                {mode === 'create' ? (id ? 'Редактирование' : 'Новое блюдо') : mode === 'import-upload' ? 'Импорт PDF' : 'Редактор'}
          </h1>

          {mode === 'create' && (
             <div className="space-y-5">
                {/* Image & Main Info */}
                <div className="bg-white dark:bg-[#1e1e24] p-5 rounded-[2rem] shadow-sm border border-gray-100 dark:border-white/5 space-y-5">
                    {/* Image Input */}
                    <div 
                        className="relative w-full aspect-video rounded-2xl bg-gray-50 dark:bg-black/20 border-2 border-dashed border-gray-200 dark:border-gray-700 flex flex-col items-center justify-center overflow-hidden transition hover:border-sky-400 group cursor-pointer"
                        onClick={() => !imageUrl && !showUrlInput && fileInputRef.current?.click()} 
                    >
                         {imageUrl ? (
                            <>
                                <img src={imageUrl} className="w-full h-full object-cover" />
                                <button onClick={(e) => { e.stopPropagation(); setImageUrl(''); }} className="absolute top-2 right-2 bg-black/50 text-white p-1.5 rounded-full hover:bg-red-500 transition backdrop-blur-sm"><svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg></button>
                            </>
                         ) : showUrlInput ? (
                             <div className="w-full px-6" onClick={e => e.stopPropagation()}>
                                <input autoFocus type="text" placeholder="https://..." className="w-full text-sm p-3 bg-white shadow-xl rounded-xl outline-none ring-2 ring-sky-500" onKeyDown={e => { if(e.key==='Enter') { setImageUrl(e.currentTarget.value); setShowUrlInput(false); }}} onBlur={e => { if(e.target.value) setImageUrl(e.target.value); setShowUrlInput(false); }} />
                             </div>
                         ) : (
                             <>
                                <div className="text-center pointer-events-none group-hover:scale-105 transition-transform">
                                    <div className="w-12 h-12 rounded-full bg-white dark:bg-white/10 flex items-center justify-center mx-auto mb-3 shadow-sm">
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-gray-400 dark:text-gray-300"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" /></svg>
                                    </div>
                                    <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Нажмите, чтобы загрузить фото</p>
                                </div>
                                <input ref={fileInputRef} type="file" className="hidden" accept="image/*" onChange={(e) => handleImageInput(e.target.files?.[0], setImageUrl)} />
                             </>
                         )}
                         {!imageUrl && !showUrlInput && (
                            <button onClick={(e) => { e.stopPropagation(); setShowUrlInput(true); }} className="absolute bottom-3 right-3 text-[10px] font-bold bg-white dark:bg-[#2a2a35] dark:text-white px-2 py-1 rounded-lg shadow-sm hover:scale-105 transition border border-gray-100 dark:border-white/10">🔗 URL</button>
                         )}
                    </div>
                    
                    <div className="space-y-3 pt-2">
                        <div className="bg-gray-50 dark:bg-black/20 rounded-xl px-4 py-1 border border-transparent focus-within:border-sky-500/30 focus-within:bg-white dark:focus-within:bg-[#2a2a35] transition-all">
                             <label className="text-[10px] uppercase font-bold text-gray-400">Название</label>
                             <input type="text" className="w-full bg-transparent font-bold text-lg dark:text-white outline-none placeholder-gray-300" value={title} onChange={e => setTitle(e.target.value)} placeholder="Напр. Паста Карбонара" />
                        </div>
                        <div className="flex gap-3">
                            <div className="flex-1 bg-gray-50 dark:bg-black/20 rounded-xl px-4 py-1 border border-transparent focus-within:border-sky-500/30 focus-within:bg-white dark:focus-within:bg-[#2a2a35] transition-all">
                                <label className="text-[10px] uppercase font-bold text-gray-400">Категория</label>
                                <input type="text" className="w-full bg-transparent font-medium text-base dark:text-white outline-none placeholder-gray-300" value={category} onChange={e => setCategory(e.target.value)} placeholder="Горячее" />
                            </div>
                            <div className="w-28 bg-gray-50 dark:bg-black/20 rounded-xl px-4 py-1 border border-transparent focus-within:border-sky-500/30 focus-within:bg-white dark:focus-within:bg-[#2a2a35] transition-all">
                                <label className="text-[10px] uppercase font-bold text-gray-400">Выход</label>
                                <input type="text" className="w-full bg-transparent font-medium text-base dark:text-white outline-none placeholder-gray-300" value={outputWeight} onChange={e => setOutputWeight(e.target.value)} placeholder="350 г" />
                            </div>
                        </div>
                         <div className="bg-gray-50 dark:bg-black/20 rounded-xl px-4 py-1 border border-transparent focus-within:border-red-500/30 focus-within:bg-white dark:focus-within:bg-[#2a2a35] transition-all">
                             <label className="text-[10px] uppercase font-bold text-gray-400 flex items-center gap-1">Видео</label>
                             <input type="text" className="w-full bg-transparent text-sm dark:text-white outline-none placeholder-gray-300" value={videoUrl} onChange={e => setVideoUrl(e.target.value)} placeholder="YouTube или ссылка..." />
                        </div>
                    </div>
                </div>

                {/* Ingredients */}
                <div className="bg-white dark:bg-[#1e1e24] p-5 rounded-[2rem] shadow-sm border border-gray-100 dark:border-white/5">
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Ингредиенты</h3>
                    <div className="space-y-3">
                        {ingredients.map((ing, i) => (
                        <div key={i} className="grid grid-cols-[1fr_4rem_3rem_2rem] gap-2 items-center">
                            <input type="text" placeholder="Продукт" className="bg-gray-50 dark:bg-black/20 rounded-xl px-3 py-3 text-sm font-medium outline-none dark:text-white focus:ring-2 focus:ring-sky-500/20 transition-all border border-transparent focus:bg-white dark:focus:bg-[#2a2a35] w-full min-w-0" value={ing.name} onChange={(e) => { const n = [...ingredients]; n[i].name = e.target.value; setIngredients(n); }} />
                            <input type="text" placeholder="Кол-во" className="bg-gray-50 dark:bg-black/20 rounded-xl px-1 py-3 text-sm font-bold text-center outline-none dark:text-white focus:ring-2 focus:ring-sky-500/20 transition-all border border-transparent focus:bg-white dark:focus:bg-[#2a2a35] w-full min-w-0" value={ing.amount} onChange={(e) => { const n = [...ingredients]; n[i].amount = e.target.value; setIngredients(n); }} />
                            <input type="text" placeholder="Ед." className="bg-gray-50 dark:bg-black/20 rounded-xl px-1 py-3 text-sm text-center outline-none dark:text-white focus:ring-2 focus:ring-sky-500/20 transition-all border border-transparent focus:bg-white dark:focus:bg-[#2a2a35] w-full min-w-0" value={ing.unit} onChange={(e) => { const n = [...ingredients]; n[i].unit = e.target.value; setIngredients(n); }} />
                            
                            <div className="flex justify-center">
                                {ingredients.length > 1 && (
                                    <button onClick={() => setIngredients(ingredients.filter((_, idx) => idx !== i))} className="p-2 text-gray-300 hover:text-red-500 transition-colors">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                                    </button>
                                )}
                            </div>
                        </div>
                        ))}
                    </div>
                    <button onClick={() => setIngredients([...ingredients, {name:'', amount:'', unit:''}])} className="mt-4 text-xs font-bold uppercase tracking-wider text-sky-600 w-full py-3 bg-sky-50 dark:bg-sky-500/10 rounded-xl hover:bg-sky-100 transition border border-dashed border-sky-200 dark:border-sky-500/30">+ Добавить ряд</button>
                </div>

                {/* Steps */}
                <div className="bg-white dark:bg-[#1e1e24] p-5 rounded-[2rem] shadow-sm border border-gray-100 dark:border-white/5">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Технология</h3>
                    </div>
                    
                    <textarea 
                        className="w-full bg-gray-50 dark:bg-black/20 rounded-xl p-4 text-sm mb-4 outline-none dark:text-white focus:ring-2 focus:ring-purple-500/20 transition-all border border-transparent focus:bg-white dark:focus:bg-[#2a2a35] resize-none" 
                        rows={2} value={description} onChange={e => setDescription(e.target.value)} placeholder="Короткое описание блюда..." 
                    />
                    
                    <div className="space-y-4">
                        {steps.map((step, i) => (
                            <div key={i} className="flex gap-3 group relative pr-8">
                                <div className="w-8 h-8 rounded-full bg-orange-100 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400 font-bold text-xs flex items-center justify-center border border-orange-200 dark:border-orange-500/30 flex-shrink-0 mt-1">{i+1}</div>
                                <textarea 
                                    className="w-full bg-gray-50 dark:bg-black/20 rounded-xl p-3 text-sm leading-relaxed outline-none dark:text-white focus:ring-2 focus:ring-orange-500/20 transition-all border border-transparent focus:bg-white dark:focus:bg-[#2a2a35] resize-none" 
                                    rows={3} value={step} onChange={(e) => { const s = [...steps]; s[i] = e.target.value; setSteps(s); }} placeholder={`Шаг ${i+1}`}
                                />
                                <button onClick={() => setSteps(steps.filter((_, idx) => idx !== i))} className="absolute right-0 top-3 p-1 text-gray-300 hover:text-red-500 transition-colors"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button>
                            </div>
                        ))}
                    </div>
                    <button onClick={() => setSteps([...steps, ''])} className="mt-6 text-xs font-bold uppercase tracking-wider text-orange-500 w-full py-3 bg-orange-50 dark:bg-orange-500/10 rounded-xl hover:bg-orange-100 transition border border-dashed border-orange-200 dark:border-orange-500/30">+ Добавить шаг</button>
                </div>
                
                {/* NOTIFICATION CHECKBOX */}
                <div className="flex items-center justify-between bg-white dark:bg-[#1e1e24] p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-white/5 cursor-pointer" onClick={() => setShouldNotify(!shouldNotify)}>
                     <div className="flex items-center gap-3">
                         <div className="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" /></svg>
                         </div>
                         <div>
                             <p className="font-bold text-sm dark:text-white">Уведомить всех пользователей</p>
                             <p className="text-[10px] text-gray-400">Бот разошлет сообщение в Telegram</p>
                         </div>
                     </div>
                     <div className={`w-12 h-7 rounded-full transition-colors relative ${shouldNotify ? 'bg-blue-500' : 'bg-gray-200 dark:bg-white/10'}`}>
                         <div className={`w-5 h-5 bg-white rounded-full shadow absolute top-1 transition-transform ${shouldNotify ? 'left-6' : 'left-1'}`}></div>
                     </div>
                </div>

                <div className="pt-4 pb-24">
                    <button onClick={handleSave} className="w-full bg-gray-900 dark:bg-white text-white dark:text-black font-bold py-4 rounded-2xl shadow-xl hover:shadow-2xl hover:scale-[1.02] active:scale-[0.98] transition-all text-lg">
                        {id ? 'Обновить карту' : 'Сохранить карту'}
                    </button>
                </div>
             </div>
          )}

          {/* Import Modes */}
          {mode === 'import-upload' && (
              <div className="flex flex-col items-center justify-center min-h-[60vh] animate-fade-in">
                 <div className="bg-white dark:bg-[#1e1e24] p-10 rounded-[2.5rem] shadow-xl border border-gray-100 dark:border-white/5 text-center w-full relative overflow-hidden group">
                     <h2 className="font-black dark:text-white text-2xl mb-2 tracking-tight">Загрузка PDF</h2>
                     <p className="text-sm text-gray-500 mb-8 max-w-xs mx-auto leading-relaxed">Система автоматически распознает блюда. Выберите файл.</p>
                     <input type="file" accept=".pdf" className="hidden" id="pdf-upload" onChange={handleFileUpload} disabled={isParsing} />
                     <label htmlFor="pdf-upload" className="block w-full bg-gray-900 dark:bg-white text-white dark:text-black font-bold py-4 rounded-2xl cursor-pointer active:scale-95 hover:shadow-lg transition-all text-lg">{isParsing ? 'Анализ файла...' : 'Выбрать файл'}</label>
                 </div>
              </div>
          )}
          
          {mode === 'import-staging' && (
              <div className="space-y-6 animate-slide-up pb-28">
                 {stagedRecipes.map((recipe) => (
                     <div key={recipe.id} className={`bg-white dark:bg-[#1e1e24] rounded-3xl overflow-hidden border-2 transition-all duration-300 shadow-sm ${recipe.selected ? 'border-sky-500 shadow-sky-500/10' : 'border-transparent opacity-70'}`}>
                         {/* Card Header */}
                         <div className="p-3 flex items-center gap-3 bg-gray-50/50 dark:bg-white/5 cursor-pointer hover:bg-gray-100 dark:hover:bg-white/10 transition" onClick={() => updateStagedRecipe(recipe.id, 'collapsed', !recipe.collapsed)}>
                             <div onClick={(e) => { e.stopPropagation(); updateStagedRecipe(recipe.id, 'selected', !recipe.selected); }} className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${recipe.selected ? 'bg-sky-500 border-sky-500' : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-white/5'}`}>
                                 <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className={`w-3.5 h-3.5 text-white transition-all ${recipe.selected ? 'scale-100' : 'scale-0'}`}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                             </div>
                             <div className="flex-1 min-w-0"><h3 className={`font-bold text-sm dark:text-white truncate ${!recipe.selected && 'text-gray-400 decoration-gray-400'}`}>{recipe.title}</h3></div>
                         </div>
                         
                         {/* Staging Editor */}
                         {!recipe.collapsed && (
                             <div className="p-5 space-y-6 animate-fade-in bg-white dark:bg-[#1e1e24]">
                                  <div className="space-y-3">
                                      <input type="text" className="w-full bg-transparent text-base font-bold dark:text-white outline-none border-b border-gray-100 dark:border-white/10" value={recipe.title} onChange={e => updateStagedRecipe(recipe.id, 'title', e.target.value)} />
                                      
                                      {/* Ingredient Editor for Staging (Simplified) */}
                                       <div className="space-y-2">
                                            {recipe.ingredients.map((ing, i) => (
                                                <div key={i} className="grid grid-cols-[1fr_3rem] gap-2">
                                                    <span className="text-sm dark:text-gray-300 truncate">{ing.name}</span>
                                                    <span className="text-sm font-bold text-right dark:text-white">{ing.amount} {ing.unit}</span>
                                                </div>
                                            ))}
                                       </div>

                                       <textarea 
                                            className="w-full bg-gray-50 dark:bg-black/20 rounded-xl p-3 text-sm leading-relaxed outline-none dark:text-white focus:ring-2 focus:ring-orange-500/20 transition-all border border-transparent focus:bg-white dark:focus:bg-[#2a2a35] resize-none" 
                                            rows={3} 
                                            value={recipe.steps.join('\n')} 
                                            onChange={(e) => updateStagedRecipe(recipe.id, 'steps', e.target.value.split('\n'))} 
                                            placeholder="Шаги приготовления..."
                                        />
                                        <div className="flex justify-between items-center text-xs text-gray-400">
                                            <button onClick={() => updateStagedRecipe(recipe.id, 'steps', [...recipe.steps, ''])} className="text-orange-500 font-bold">+ Шаг</button>
                                        </div>
                                  </div>
                             </div>
                         )}
                     </div>
                 ))}
              </div>
          )}
       </div>
    </div>
  );
};

export default Editor;
