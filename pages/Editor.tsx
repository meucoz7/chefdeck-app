
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { useRecipes } from '../context/RecipeContext';
import { useToast } from '../context/ToastContext';
import { TechCard, Ingredient } from '../types';
import { parsePdfFile, ParsedPdfData } from '../services/pdfService';
import { useTelegram } from '../context/TelegramContext';
import { apiFetch } from '../services/api';
import { uploadImage } from '../services/uploadService';

type EditorMode = 'create' | 'import-upload' | 'import-staging' | 'import-images';

// --- SUBCOMPONENT: CATEGORY SELECTOR ---
const CategorySelector: React.FC<{
    value: string;
    onChange: (val: string) => void;
    existingCategories: string[];
    placeholder?: string;
}> = ({ value, onChange, existingCategories, placeholder }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [inputValue, setInputValue] = useState('');
    const containerRef = useRef<HTMLDivElement>(null);
    const filtered = useMemo(() => {
        const query = inputValue.toLowerCase().trim();
        return existingCategories.filter(c =>
            c.toLowerCase().includes(query) &&
            c.toLowerCase() !== value.toLowerCase()
        );
    }, [inputValue, existingCategories, value]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSelect = (cat: string) => {
        onChange(cat);
        setInputValue('');
        setIsOpen(false);
    };

    const handleManualSubmit = () => {
        const trimmed = inputValue.trim();
        if (!trimmed) return;
        const existing = existingCategories.find(c => c.toLowerCase() === trimmed.toLowerCase());
        onChange(existing || trimmed);
        setInputValue('');
        setIsOpen(false);
    };

    return (
        <div className="relative w-full" ref={containerRef}>
            <div
                className="w-full bg-gray-50 dark:bg-black/20 rounded-[1.25rem] px-4 py-2 border-2 border-transparent focus-within:border-sky-500/50 focus-within:bg-white dark:focus-within:bg-[#2a2a35] transition-all flex flex-wrap gap-2 items-center min-h-[58px] cursor-text"
                onClick={() => setIsOpen(true)}
            >
                {value ? (
                    <div className="bg-sky-500 text-white px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-2 animate-scale-in shadow-lg shadow-sky-500/20">
                        <span className="uppercase tracking-wider">{value}</span>
                        <button onClick={(e) => { e.stopPropagation(); onChange(''); }} className="hover:bg-black/20 rounded-full p-0.5 transition-colors">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>
                ) : null}
                <input
                    type="text"
                    className="flex-1 bg-transparent outline-none text-sm font-bold dark:text-white min-w-[140px]"
                    placeholder={value ? "" : (placeholder || "Поиск или новая...")}
                    value={inputValue}
                    onChange={(e) => { setInputValue(e.target.value); setIsOpen(true); }}
                    onFocus={() => setIsOpen(true)}
                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleManualSubmit())}
                />
            </div>
            {isOpen && (filtered.length > 0 || (inputValue.trim() && !existingCategories.some(c => c.toLowerCase() === inputValue.trim().toLowerCase()))) && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-[#1e1e24] rounded-2xl shadow-2xl border border-gray-100 dark:border-white/10 z-[100] overflow-hidden max-h-60 overflow-y-auto no-scrollbar animate-slide-up">
                    {inputValue.trim() && !existingCategories.some(c => c.toLowerCase() === inputValue.trim().toLowerCase()) && (
                        <div onClick={handleManualSubmit} className="px-5 py-4 hover:bg-sky-50 dark:hover:bg-white/5 cursor-pointer border-b border-gray-50 dark:border-white/5 group transition-colors">
                            <span className="text-[9px] font-black text-gray-400 block uppercase mb-1 tracking-widest">Создать:</span>
                            <span className="text-sm font-bold text-sky-600 dark:text-sky-400">{inputValue.trim()}</span>
                        </div>
                    )}
                    {filtered.map(cat => (
                        <div key={cat} onClick={() => handleSelect(cat)} className="px-5 py-3.5 hover:bg-gray-50 dark:hover:bg-white/5 cursor-pointer text-sm font-bold dark:text-white transition-colors border-b border-gray-50 dark:border-white/5 last:border-0">
                            {cat}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

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
  const [mode, setMode] = useState<EditorMode>('create');

  // States
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [outputWeight, setOutputWeight] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [ingredients, setIngredients] = useState<Ingredient[]>([{ name: '', amount: '', unit: '' }]);
  const [steps, setSteps] = useState<string[]>(['']);
  const [isFavorite, setIsFavorite] = useState(false);
  const [isArchived, setIsArchived] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [shouldNotify, setShouldNotify] = useState(true);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [isInitialLoaded, setIsInitialLoaded] = useState(false);

  // Import/Scraping states
  const [isParsing, setIsParsing] = useState(false);
  const [parsingProgress, setParsingProgress] = useState(0);
  const [parsingStatus, setParsingStatus] = useState('');
  const [stagedRecipes, setStagedRecipes] = useState<StagedRecipe[]>([]);
  const [bulkCategory, setBulkCategory] = useState('');
  const [importNotify, setImportNotify] = useState(false);
  const [scrapeUrl, setScrapeUrl] = useState('');
  const [imageMatches, setImageMatches] = useState<ImageMatch[]>([]);
  const [isImporting, setIsImporting] = useState(false);

  // Suggestions logic
  const [activeIngIndex, setActiveIngIndex] = useState<number | null>(null);

  const existingCategories = useMemo(() => {
    const cats = Array.from(new Set(recipes.map(r => r.category))).filter(Boolean).sort();
    return cats.length > 0 ? cats : ['Горячее', 'Салаты', 'Десерты', 'Напитки', 'Заготовки'];
  }, [recipes]);

  const ingredientDatabase = useMemo(() => {
    const map = new Map<string, string>();
    recipes.forEach(r => r.ingredients.forEach(i => {
      if (i.name.trim()) map.set(i.name.trim(), i.unit);
    }));
    return map;
  }, [recipes]);

  const getSuggestions = (query: string) => {
    if (!query || query.length < 2) return [];
    const lowerQuery = query.toLowerCase();
    return Array.from(ingredientDatabase.keys())
      .filter((name: string) => name.toLowerCase().includes(lowerQuery) && name.toLowerCase() !== lowerQuery)
      .slice(0, 5);
  };

  const handleIngredientNameChange = (index: number, value: string) => {
    const n = [...ingredients];
    n[index] = { ...n[index], name: value };
    setIngredients(n);
    setActiveIngIndex(index);
  };

  const selectSuggestion = (index: number, name: string) => {
    const suggestedUnit = ingredientDatabase.get(name) || '';
    const n = [...ingredients];
    n[index] = {
      ...n[index],
      name: name,
      unit: suggestedUnit || n[index].unit
    };
    setIngredients(n);
    setActiveIngIndex(null);
  };

  useEffect(() => {
    if (!isAdmin) {
      navigate('/', { replace: true });
      addToast("Доступ запрещен", "error");
    }
  }, [isAdmin, navigate, addToast]);

  // Initial Data Fetch - PROTECTED FROM RE-SYNC
  useEffect(() => {
    if (id && !isInitialLoaded) {
      const r = getRecipe(id);
      if (r) {
        setTitle(r.title);
        setDescription(r.description);
        setCategory(r.category);
        setOutputWeight(r.outputWeight || '');
        setImageUrl(r.imageUrl || '');
        setVideoUrl(r.videoUrl || '');
        setIngredients(r.ingredients.length > 0 ? [...r.ingredients] : [{ name: '', amount: '', unit: '' }]);
        setSteps(r.steps.length > 0 ? [...r.steps] : ['']);
        setIsFavorite(r.isFavorite);
        setIsArchived(!!r.isArchived);
        setIsInitialLoaded(true);
      }
    }
  }, [id, getRecipe, isInitialLoaded]);

  const handleBack = () => {
    if (mode === 'import-staging') {
      if (confirm("Вернуться к выбору файла? Текущие изменения будут потеряны.")) {
        setStagedRecipes([]);
        setMode('import-upload');
      }
    } else if (mode === 'import-upload' || mode === 'import-images') {
      setMode('create');
    } else {
      if (id) {
        navigate(`/recipe/${id}`, { replace: true });
      } else {
        navigate('/', { replace: true });
      }
    }
  };

  const handleImageInput = async (file: File | undefined) => {
    if (!file) return;
    setIsUploading(true);
    try {
      const url = await uploadImage(file, 'recipes');
      setImageUrl(url);
      addToast("Фото загружено успешно", "success");
    } catch (e: unknown) {
      addToast("Ошибка при загрузке фото", "error");
    } finally {
      setIsUploading(false);
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

  const handleSave = async () => {
    if (!title.trim()) { addToast("Введите название", "error"); return; }
    if (isUploading) { addToast("Подождите окончания загрузки фото", "info"); return; }

    setIsSaving(true);
    try {
      const data: TechCard = {
        id: id || uuidv4(),
        title: title.trim(),
        description: description || 'Нет описания',
        imageUrl: imageUrl,
        videoUrl: videoUrl.trim(),
        category: category.trim() || 'Без категории',
        outputWeight: outputWeight.trim() || '',
        isFavorite: isFavorite,
        isArchived: isArchived,
        ingredients: ingredients.filter(i => i.name.trim()),
        steps: steps.filter(s => s.trim()),
        createdAt: id ? (getRecipe(id)?.createdAt || Date.now()) : Date.now()
      };

      if (id) await updateRecipe(data, shouldNotify);
      else await addRecipe(data, shouldNotify);

      addToast("Сохранено", "success");
      navigate(id ? `/recipe/${id}` : '/', { replace: true });
    } catch (e: unknown) {
      addToast("Ошибка сохранения", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsParsing(true);
      setParsingProgress(0);
      setParsingStatus('Загрузка файла...');
      const interval = setInterval(() => {
        setParsingProgress(prev => {
          if (prev >= 90) return prev;
          return prev + Math.random() * 10;
        });
      }, 200);

      setParsingStatus('Анализ структуры PDF...');
      const data = await parsePdfFile(file);
      clearInterval(interval);
      setParsingProgress(100);
      setParsingStatus('Готово!');
      await new Promise(r => setTimeout(r, 500));

      const existingTitles = new Set(recipes.map(r => r.title.toLowerCase().trim()));
      const staged: StagedRecipe[] = data.map(item => {
        const isDuplicate = existingTitles.has(item.title.toLowerCase().trim());
        return {
          ...item,
          id: uuidv4(),
          category: '',
          outputWeight: calculateWeightValue(item.ingredients),
          steps: [''],
          imageUrl: '',
          selected: !isDuplicate,
          collapsed: true,
          isDuplicate: isDuplicate
        };
      });

      setStagedRecipes(staged);
      setMode('import-staging');
    } catch (err: unknown) {
      // Correctly narrow unknown catch variable to string for addToast
      const errorMessage = err instanceof Error ? err.message : String(err);
      addToast(errorMessage || "Ошибка PDF", "error");
    } finally {
      setIsParsing(false);
      setParsingProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const updateStagedRecipe = (id: string, field: keyof StagedRecipe, value: any) => {
    setStagedRecipes(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  const handleSaveImport = async () => {
    const selected = stagedRecipes.filter(r => r.selected);
    if (selected.length === 0) { addToast("Ничего не выбрано", "error"); return; }

    setIsImporting(true);
    try {
      const finalRecipes: TechCard[] = selected.map(r => ({
        id: uuidv4(),
        title: r.title,
        description: '',
        imageUrl: r.imageUrl,
        category: (r.category && r.category !== '') ? r.category : (bulkCategory || 'Импорт'),
        outputWeight: r.outputWeight,
        isFavorite: false,
        isArchived: false,
        ingredients: r.ingredients,
        steps: r.steps.filter(s => s.trim().length > 0),
        createdAt: Date.now()
      }));

      await addRecipesBulk(finalRecipes, importNotify);
      addToast(`Импортировано: ${selected.length}`, "success");
      navigate('/', { replace: true });
    } catch (e: unknown) {
      console.error(e);
      // Correctly narrow unknown catch variable to string for addToast
      const message = e instanceof Error ? e.message : String(e);
      addToast(message || "Ошибка при сохранении", "error");
    } finally {
      setIsImporting(false);
    }
  };

  const handleUrlScrape = async () => {
    if (!scrapeUrl) { addToast("Введите ссылку", "error"); return; }

    setIsParsing(true);
    setParsingStatus('Сканирование сайта...');
    setImageMatches([]);
    try {
      const encodedUrl = encodeURIComponent(scrapeUrl);
      const res = await apiFetch(`/api/proxy?url=${encodedUrl}`);
      if (!res.ok) throw new Error("Ошибка доступа к сайту");

      const html = await res.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const matches: ImageMatch[] = [];

      const getStem = (word: string) => {
        const w = word.toLowerCase();
        const endings = /(?:ами|ями|ов|ев|ей|ой|ий|ый|ая|яя|ое|ее|ые|ие|ыми|ими|им|ым|ом|ем|ах|ях|ую|юю|ы|и|а|я|о|е|у|ю)$/i;
        if (w.length > 4) return w.replace(endings, '');
        return w;
      };

      const stopWords = new Set(['с', 'со', 'и', 'в', 'на', 'под', 'из', 'от', 'для', 'по', 'над', 'к']);

      const levenshtein = (a: string, b: string): number => {
        const matrix = [];
        for (let i = 0; i <= b.length; i++) matrix[i] = [i];
        for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
        for (let i = 1; i <= b.length; i++) {
          for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
              matrix[i][j] = matrix[i - 1][j - 1];
            } else {
              matrix[i][j] = Math.min(
                matrix[i - 1][j - 1] + 1,
                Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1)
              );
            }
          }
        }
        return matrix[b.length][a.length];
      };

      const getStringSimilarity = (s1: string, s2: string): number => {
        const longer = s1.length > s2.length ? s1 : s2;
        const shorter = s1.length > s2.length ? s2 : s1;
        if (longer.length === 0) return 1.0;
        return (longer.length - levenshtein(longer, shorter)) / longer.length;
      };

      const normalize = (str: string) => {
        return str
          .toLowerCase()
          .replace(/ё/g, 'е')
          .replace(/,/g, ' ')
          .replace(/[\u00A0\s]+/g, ' ')
          .replace(/[^\w\sа-я]/g, '')
          .trim();
      };

      const getTokens = (str: string) => {
        return normalize(str)
          .split(' ')
          .filter(t => t.length > 1 && !stopWords.has(t));
      };

      const calculateScore = (strA: string, strB: string) => {
        const tokensA = getTokens(strA);
        const tokensB = getTokens(strB);
        if (tokensA.length === 0 || tokensB.length === 0) return 0;

        const [short, long] = tokensA.length < tokensB.length ? [tokensA, tokensB] : [tokensB, tokensA];
        let totalScore = 0;
        short.forEach(sToken => {
          const sStem = getStem(sToken);
          let maxTokenScore = 0;
          long.forEach(lToken => {
            const lStem = getStem(lToken);
            if (sStem === lStem) {
              maxTokenScore = 1.0;
            } else {
              if (sStem.length > 3 && lStem.length > 3) {
                const sim = getStringSimilarity(sStem, lStem);
                if (sim > maxTokenScore) maxTokenScore = sim;
              }
            }
          });
          totalScore += (maxTokenScore > 0.65 ? maxTokenScore : 0);
        });

        return totalScore / short.length;
      };

      const resolveUrl = (src: string) => {
        try {
          return new URL(src, scrapeUrl).href;
        } catch {
          return src;
        }
      };

      const allSiteItems: { title: string, img: string }[] = [];
      const siteMap: Record<string, { title: string, img: string }[]> = {};

      const extractCardData = (card: Element) => {
        let title = '';
        let imageSrc = '';
        const hiddenInput = card.querySelector('input.dish-name');
        if (hiddenInput && (hiddenInput as HTMLInputElement).value) {
          title = (hiddenInput as HTMLInputElement).value;
        } else {
          const titleEl = card.querySelector('.menu-dish-list-item-name');
          if (titleEl && titleEl.textContent) title = titleEl.textContent;
        }
        const imgEl = card.querySelector('img');
        if (imgEl) {
          imageSrc = imgEl.getAttribute('src') || '';
          if (!imageSrc || imageSrc.includes('noimg')) imageSrc = imgEl.getAttribute('data-src') || '';
        }
        return { title, img: imageSrc };
      };

      const headers = doc.querySelectorAll('h2');
      headers.forEach(h2 => {
        const catName = normalize(h2.textContent || '');
        let sibling = h2.nextElementSibling;
        while (sibling) {
          if (sibling.tagName === 'H2') break;
          if (sibling.tagName === 'UL') {
            const items: { title: string, img: string }[] = [];
            sibling.querySelectorAll('.menu-dish-list-item').forEach(card => {
              const data = extractCardData(card);
              if (data.title && data.img) {
                items.push(data);
                allSiteItems.push(data);
              }
            });
            if (items.length > 0) {
              if (!siteMap[catName]) siteMap[catName] = [];
              siteMap[catName].push(...items);
            }
          }
          sibling = sibling.nextElementSibling;
        }
      });

      if (allSiteItems.length === 0) {
        doc.querySelectorAll('.menu-dish-list-item').forEach(card => {
          const data = extractCardData(card);
          if (data.title && data.img) allSiteItems.push(data);
        });
      }

      if (allSiteItems.length === 0) {
        addToast("Не найдены карточки товаров. Проверьте ссылку.", "info");
        setIsParsing(false);
        return;
      }

      recipes.forEach(r => {
        if (r.isArchived || r.imageUrl) return;
        let searchPool = allSiteItems;
        if (r.category) {
          const rCat = normalize(r.category);
          let bestSiteCatKey = '';
          let bestCatScore = 0;
          Object.keys(siteMap).forEach(siteCat => {
            const score = calculateScore(rCat, siteCat);
            if (score > 0.8 && score > bestCatScore) {
              bestCatScore = score;
              bestSiteCatKey = siteCat;
            }
          });
          if (bestSiteCatKey) searchPool = siteMap[bestSiteCatKey];
        }

        let bestItem = null;
        let bestItemScore = 0;
        searchPool.forEach(item => {
          const score = calculateScore(r.title, item.title);
          if (score > 0.65 && score > bestItemScore) {
            bestItemScore = score;
            bestItem = item;
          }
        });

        if (bestItem) {
          matches.push({
            recipeId: r.id,
            recipeName: r.title,
            oldImage: r.imageUrl || '',
            newImage: resolveUrl(bestItem.img),
            selected: true
          });
        }
      });

      const uniqueMatches = matches.reduce((acc, current) => {
        if (!acc.find(m => m.recipeId === current.recipeId)) {
          acc.push(current);
        }
        return acc;
      }, [] as ImageMatch[]);

      setImageMatches(uniqueMatches);
      if (uniqueMatches.length === 0) addToast("Новых фото не найдено", "info");
      else addToast(`Найдено совпадений: ${uniqueMatches.length}`, "success");
    } catch (e: unknown) {
      console.error(e);
      // Correctly narrow unknown catch variable to string for addToast
      const msg = e instanceof Error ? e.message : String(e);
      addToast(`Ошибка парсинга: ${msg}`, "error");
    } finally {
      setIsParsing(false);
    }
  };

  const handleApplyImages = async () => {
    const selected = imageMatches.filter(m => m.selected);
    if (selected.length === 0) return;

    setIsImporting(true);
    try {
      for (const match of selected) {
        const recipe = recipes.find(r => r.id === match.recipeId);
        if (recipe) {
          await updateRecipe({ ...recipe, imageUrl: match.newImage }, false, true);
        }
      }
      addToast("Изображения обновлены", "success");
      navigate('/', { replace: true });
    } catch (e: unknown) {
      console.error(e);
      // Correctly narrow unknown catch variable to string for addToast
      const message = e instanceof Error ? e.message : String(e);
      addToast(message || "Ошибка обновления", "error");
    } finally {
      setIsImporting(false);
    }
  };

  if (!isAdmin) return null;

  return (
    <div className="pb-safe-bottom animate-slide-up mx-auto min-h-screen relative bg-[#f2f4f7] dark:bg-[#0f1115]">
       {(isImporting || isSaving || isUploading || isParsing) && (
           <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex flex-col items-center justify-center p-8 animate-fade-in">
                <div className="w-full max-w-xs bg-white dark:bg-[#1e1e24] p-8 rounded-[2.5rem] text-center shadow-2xl border border-white/10">
                    <h3 className="font-black text-xl mb-6 dark:text-white leading-tight uppercase tracking-tight">
                        {isUploading ? 'Загрузка фото...' :
                         isImporting ? 'Обработка данных...' :
                         isParsing ? (parsingStatus as string) :
                         'Сохранение...'}
                    </h3>
                    {isParsing ? (
                      <div className="w-full h-3 bg-gray-100 dark:bg-white/10 rounded-full overflow-hidden relative mb-4">
                        <div
                          className="absolute top-0 left-0 h-full bg-gradient-to-r from-sky-400 via-indigo-500 to-sky-400 bg-[length:200%_100%] animate-[shimmer_2s_linear_infinite] transition-all duration-300"
                          style={{ width: `${parsingProgress}%` }}
                        ></div>
                      </div>
                    ) : (
                       <div className="flex justify-center mb-4">
                           <svg className="animate-spin h-10 w-10 text-sky-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                       </div>
                    )}
                    <p className="text-[10px] text-gray-400 mt-2 uppercase tracking-[0.2em] font-black">Пожалуйста, подождите</p>
                </div>
           </div>
       )}
       <div className="px-5 pt-safe-top flex justify-between items-center mb-6">
          <button onClick={handleBack} disabled={isImporting || isSaving || isUploading || isParsing} className="w-10 h-10 rounded-full bg-white dark:bg-[#1e1e24] shadow-sm border border-gray-100 dark:border-white/5 flex items-center justify-center dark:text-white active:scale-95 transition">
             <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
          </button>
          <h1 className="text-xl font-black dark:text-white uppercase tracking-tighter">
            {mode === 'create' ? (id ? 'Правка карты' : 'Новое блюдо') :
             mode === 'import-upload' ? 'Импорт PDF' :
             mode === 'import-images' ? 'Импорт Фото' : 'Редактор'}
          </h1>
          <div className="flex items-center gap-2">
            {mode === 'create' && !id && (
              <>
                <button onClick={() => setMode('import-images')} className="text-[10px] font-black uppercase tracking-widest text-indigo-600 bg-white dark:bg-indigo-500/10 px-4 py-2.5 rounded-xl shadow-sm hover:shadow-md active:scale-95 transition border border-gray-100 dark:border-indigo-500/20 flex items-center gap-2">
                  <span>🖼️</span> Фото
                </button>
                <button onClick={() => setMode('import-upload')} className="text-[10px] font-black uppercase tracking-widest text-sky-600 bg-white dark:bg-sky-500/10 px-4 py-2.5 rounded-xl shadow-sm hover:shadow-md active:scale-95 transition border border-gray-100 dark:border-sky-500/20 flex items-center gap-2">
                  <span>📄</span> PDF
                </button>
              </>
            )}
            {mode === 'import-staging' && (
              <button onClick={handleSaveImport} className="text-xs font-bold text-white bg-gray-900 dark:bg-white dark:text-black px-4 py-2.5 rounded-xl shadow-lg active:scale-95 transition flex items-center gap-2">
                <span>Сохранить ({stagedRecipes.filter(r => r.selected).length})</span>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </button>
            )}
            {mode === 'import-images' && imageMatches.length > 0 && (
              <button onClick={handleApplyImages} className="text-[10px] font-black uppercase tracking-widest text-white bg-green-600 px-4 py-2.5 rounded-xl shadow-lg active:scale-95 transition flex items-center gap-2">
                <span>Применить ({imageMatches.filter(r => r.selected).length})</span>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </button>
            )}
          </div>
       </div>
       <div className="px-5 pb-20 space-y-6 max-w-lg mx-auto">
         {mode === 'create' && (
            <div className="space-y-6 animate-slide-up">
              {/* Photo Section */}
              <div className="bg-white dark:bg-[#1e1e24] p-5 rounded-[2.5rem] shadow-sm border border-gray-100 dark:border-white/5 space-y-6">
                  <div
                      className="relative w-full aspect-video rounded-3xl bg-gray-50 dark:bg-black/20 border-2 border-dashed border-gray-200 dark:border-gray-700 flex flex-col items-center justify-center overflow-hidden transition-all hover:border-sky-400 group cursor-pointer"
                      onClick={() => !imageUrl && !showUrlInput && fileInputRef.current?.click()}
                  >
                       {imageUrl ? (
                          <>
                              <img src={imageUrl} key={imageUrl} className="w-full h-full object-cover animate-fade-in" alt="Preview" />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[2px]">
                                   <button onClick={(e) => { e.stopPropagation(); setImageUrl(''); }} className="bg-white text-black font-black text-[10px] uppercase tracking-widest px-4 py-2 rounded-xl hover:bg-red-500 hover:text-white transition shadow-2xl">Удалить фото</button>
                              </div>
                          </>
                       ) : showUrlInput ? (
                           <div className="w-full px-6" onClick={e => e.stopPropagation()}>
                              <input autoFocus type="text" placeholder="https://..." className="w-full text-sm p-4 bg-white dark:bg-[#2a2a35] shadow-2xl rounded-2xl outline-none ring-2 ring-sky-500 dark:text-white" onKeyDown={e => e.key==='Enter' && (setImageUrl(e.currentTarget.value), setShowUrlInput(false))} onBlur={e => { if(e.target.value) setImageUrl(e.target.value); setShowUrlInput(false); }} />
                           </div>
                       ) : (
                           <div className="text-center pointer-events-none group-hover:scale-105 transition-transform duration-500">
                              <div className="w-16 h-16 rounded-full bg-white dark:bg-white/10 flex items-center justify-center mx-auto mb-4 shadow-sm">
                                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 text-sky-500"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" /></svg>
                              </div>
                              <p className="text-[10px] text-gray-400 font-black uppercase tracking-[0.2em]">Нажмите для загрузки фото</p>
                           </div>
                       )}
                       <input ref={fileInputRef} type="file" className="hidden" accept="image/*" onChange={(e) => handleImageInput(e.target.files?.[0])} />
                       {!imageUrl && !showUrlInput && (
                          <button onClick={(e) => { e.stopPropagation(); setShowUrlInput(true); }} className="absolute bottom-4 right-4 text-[9px] font-black uppercase tracking-widest bg-white dark:bg-[#2a2a35] dark:text-white px-3 py-1.5 rounded-xl shadow-lg border border-gray-100 dark:border-white/10">🔗 URL</button>
                       )}
                  </div>
                  <div className="space-y-4">
                      <div className="bg-gray-50 dark:bg-black/20 rounded-2xl px-5 py-3 border border-transparent focus-within:border-sky-500/30 focus-within:bg-white dark:focus-within:bg-[#2a2a35] transition-all">
                          <label className="text-[9px] uppercase font-black tracking-widest text-gray-400 mb-1.5 block">Название блюда</label>
                          <input type="text" className="w-full bg-transparent font-black text-xl dark:text-white outline-none" value={title} onChange={e => setTitle(e.target.value)} placeholder="Напр. Паста Карбонара" />
                      </div>
                      <div className="space-y-1">
                          <label className="text-[9px] uppercase font-black tracking-widest text-gray-400 ml-5 mb-1.5 block">Категория</label>
                          <CategorySelector value={category} onChange={setCategory} existingCategories={existingCategories} />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                          <div className="bg-gray-50 dark:bg-black/20 rounded-2xl px-5 py-3 border border-transparent focus-within:border-sky-500/30 focus-within:bg-white dark:focus-within:bg-[#2a2a35] transition-all">
                              <label className="text-[9px] uppercase font-black tracking-widest text-gray-400 mb-1.5 block">Выход</label>
                              <input type="text" className="w-full bg-transparent font-bold dark:text-white outline-none" value={outputWeight} onChange={e => setOutputWeight(e.target.value)} placeholder="350 г" />
                          </div>
                          <div className="bg-gray-50 dark:bg-black/20 rounded-2xl px-5 py-3 border border-transparent focus-within:border-red-500/30 focus-within:bg-white dark:focus-within:bg-[#2a2a35] transition-all">
                              <label className="text-[9px] uppercase font-black tracking-widest text-gray-400 mb-1.5 block">Видео URL</label>
                              <input type="text" className="w-full bg-transparent text-sm dark:text-white outline-none" value={videoUrl} onChange={e => setVideoUrl(e.target.value)} placeholder="https://..." />
                          </div>
                      </div>
                  </div>
              </div>
              {/* Ingredients Section */}
              <div className="bg-white dark:bg-[#1e1e24] p-5 rounded-[2.5rem] shadow-sm border border-gray-100 dark:border-white/5">
                  <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-5 ml-1">Ингредиенты</h3>
                  <div className="space-y-3">
                      {ingredients.map((ing, i) => {
                        const suggestions = activeIngIndex === i ? getSuggestions(ing.name) : [];
                        return (
                          <div key={i} className="grid grid-cols-[1fr_4rem_3.5rem_2rem] gap-2 items-center relative z-20">
                            <div className="relative">
                              <input
                                type="text"
                                placeholder="Продукт"
                                className="bg-gray-50 dark:bg-black/20 rounded-xl px-4 py-3.5 text-sm font-bold outline-none dark:text-white focus:ring-2 focus:ring-sky-500/20 transition-all border border-transparent focus:bg-white dark:focus:bg-[#2a2a35] w-full"
                                value={ing.name}
                                onChange={(e) => handleIngredientNameChange(i, e.target.value)}
                                onFocus={() => setActiveIngIndex(i)}
                                onBlur={() => setTimeout(() => setActiveIngIndex(null), 200)}
                              />
                              {suggestions.length > 0 && (
                                <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-[#2a2a35] rounded-xl shadow-2xl border border-gray-100 dark:border-white/10 z-50 overflow-hidden max-h-40 overflow-y-auto no-scrollbar">
                                  {suggestions.map((suggestion) => (
                                    <div
                                      key={suggestion}
                                      onMouseDown={() => selectSuggestion(i, suggestion)}
                                      className="px-4 py-3 hover:bg-sky-50 dark:hover:bg-white/10 cursor-pointer flex justify-between items-center group border-b border-gray-50 dark:border-white/5 last:border-0"
                                    >
                                      <span className="text-sm font-bold dark:text-white">{suggestion}</span>
                                      <span className="text-[10px] text-sky-500 font-black uppercase">
                                        {ingredientDatabase.get(suggestion)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                            <input type="text" placeholder="0" className="bg-gray-50 dark:bg-black/20 rounded-xl px-1 py-3.5 text-sm font-black text-center outline-none dark:text-white focus:ring-2 focus:ring-sky-500/20 w-full" value={ing.amount} onChange={e => { const n = [...ingredients]; n[i].amount = e.target.value; setIngredients(n); }} />
                            <input type="text" placeholder="ед" className="bg-gray-50 dark:bg-black/20 rounded-xl px-1 py-3.5 text-xs font-bold text-center outline-none dark:text-white focus:ring-2 focus:ring-sky-500/20 w-full uppercase" value={ing.unit} onChange={e => { const n = [...ingredients]; n[i].unit = e.target.value; setIngredients(n); }} />
                            <button onClick={() => setIngredients(ingredients.filter((_, idx) => idx !== i))} className="text-gray-300 hover:text-red-500 active:scale-90 transition-transform flex justify-center"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button>
                        </div>
                        );
                      })}
                  </div>
                  <button onClick={() => setIngredients([...ingredients, {name:'', amount:'', unit:''}])} className="mt-5 text-[10px] font-black uppercase tracking-wider text-sky-600 w-full py-4 bg-sky-50 dark:bg-sky-500/10 rounded-2xl border-2 border-dashed border-sky-200">+ Добавить строку</button>
              </div>
              {/* Technology Section */}
              <div className="bg-white dark:bg-[#1e1e24] p-5 rounded-[2.5rem] shadow-sm border border-gray-100 dark:border-white/5">
                  <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-5 ml-1">Технология</h3>
                  <textarea className="w-full bg-gray-50 dark:bg-black/20 rounded-2xl p-5 text-sm font-medium mb-5 outline-none dark:text-white min-h-[100px] resize-none" rows={3} value={description} onChange={e => setDescription(e.target.value)} placeholder="Описание или история блюда..." />
                  <div className="space-y-4">
                      {steps.map((step, i) => (
                          <div key={i} className="flex gap-4 group relative pr-10">
                              <div className="w-9 h-9 rounded-2xl bg-orange-50 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400 font-black text-sm flex items-center justify-center border border-orange-100 dark:border-orange-500/30 flex-shrink-0 mt-0.5 shadow-sm">{i+1}</div>
                              <textarea className="w-full bg-gray-50 dark:bg-black/20 rounded-2xl p-4 text-sm font-medium leading-relaxed outline-none dark:text-white resize-none" rows={3} value={step} onChange={e => { const s = [...steps]; s[i] = e.target.value; setSteps(s); }} placeholder={`Шаг ${i+1}`} />
                              <button onClick={() => setSteps(steps.filter((_, idx) => idx !== i))} className="absolute right-0 top-3 text-gray-300 hover:text-red-500"><svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" /></svg></button>
                          </div>
                      ))}
                  </div>
                  <button onClick={() => setSteps([...steps, ''])} className="mt-6 text-[10px] font-black uppercase tracking-wider text-orange-500 w-full py-4 bg-orange-50 dark:bg-orange-500/10 rounded-2xl border-2 border-dashed border-orange-200">+ Добавить шаг</button>
              </div>
              {/* Notification Toggle */}
              <div className="flex items-center justify-between bg-white dark:bg-[#1e1e24] p-5 rounded-[2rem] shadow-sm border border-gray-100 dark:border-white/5 cursor-pointer" onClick={() => setShouldNotify(!shouldNotify)}>
                   <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-colors ${shouldNotify ? 'bg-blue-100 text-blue-600 dark:bg-blue-500/20' : 'bg-gray-100 text-gray-400'}`}>
                          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
                      </div>
                      <div>
                          <p className="font-black text-sm dark:text-white uppercase tracking-wider">Уведомление</p>
                          <p className="text-[10px] text-gray-400 font-bold uppercase">Рассылка в Telegram</p>
                      </div>
                   </div>
                   <div className={`w-12 h-7 rounded-full transition-all duration-300 relative ${shouldNotify ? 'bg-blue-500' : 'bg-gray-200'}`}>
                       <div className={`w-5 h-5 bg-white rounded-full shadow absolute top-1 transition-all ${shouldNotify ? 'left-6' : 'left-1'}`}></div>
                   </div>
              </div>
            </div>
         )}
         {mode === 'import-upload' && (
          <div className="flex flex-col items-center justify-center min-h-[60vh] animate-fade-in">
            <div className="bg-white dark:bg-[#1e1e24] p-10 rounded-[2.5rem] shadow-xl border border-gray-100 dark:border-white/5 text-center w-full relative overflow-hidden group">
              <h2 className="font-black dark:text-white text-2xl mb-2 tracking-tight">Загрузка PDF</h2>
              {isParsing ? (
                <div className="py-6 w-full animate-fade-in">
                  <div className="w-full h-3 bg-gray-100 dark:bg-white/10 rounded-full overflow-hidden relative">
                    <div
                      className="absolute top-0 left-0 h-full bg-gradient-to-r from-sky-400 via-indigo-500 to-sky-400 bg-[length:200%_100%] animate-[shimmer_2s_linear_infinite] transition-all duration-300"
                      style={{ width: `${parsingProgress}%` }}
                    ></div>
                  </div>
                  <p className="text-xs font-bold text-gray-400 mt-3 uppercase tracking-wider animate-pulse">{parsingStatus}</p>
                </div>
              ) : (
                <>
                  <p className="text-sm text-gray-500 mb-8 max-w-xs mx-auto leading-relaxed">Система автоматически распознает блюда. Выберите файл.</p>
                  <input type="file" accept=".pdf" className="hidden" id="pdf-upload" onChange={handleFileUpload} />
                  <label htmlFor="pdf-upload" className="block w-full bg-gray-900 dark:bg-white text-white dark:text-black font-bold py-4 rounded-2xl cursor-pointer active:scale-95 hover:shadow-lg transition-all text-lg">
                    Выбрать файл
                  </label>
                </>
              )}
            </div>
          </div>
        )}
        {mode === 'import-images' && (
          <div className="space-y-6 animate-slide-up pb-28">
            <div className="bg-white dark:bg-[#1e1e24] p-6 rounded-[2.5rem] shadow-sm border border-gray-100 dark:border-white/5">
              <h2 className="font-black dark:text-white text-xl mb-4">Скрапинг изображений</h2>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-gray-400 uppercase">Ссылка на меню</label>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      className="flex-1 bg-gray-50 dark:bg-black/20 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white"
                      placeholder="https://milimon.ru/chipolucho/"
                      value={scrapeUrl}
                      onChange={e => setScrapeUrl(e.target.value)}
                    />
                    <button onClick={handleUrlScrape} disabled={isParsing} className="bg-indigo-600 text-white rounded-xl px-4 font-bold disabled:opacity-50">
                      {isParsing ? '...' : '🔍'}
                    </button>
                  </div>
                  <p className="text-[10px] text-gray-400 leading-tight">Система проанализирует сайт, найдет фото и сопоставит их с названиями в вашей базе.</p>
                </div>
              </div>
            </div>
            {imageMatches.length > 0 && (
              <div className="space-y-4">
                <div className="flex justify-between items-center px-2">
                  <h3 className="font-bold text-sm text-gray-500 uppercase tracking-widest">Совпадения ({imageMatches.length})</h3>
                </div>
                {imageMatches.map((match, idx) => (
                  <div
                    key={idx}
                    onClick={() => {
                      const newMatches = [...imageMatches];
                      newMatches[idx].selected = !newMatches[idx].selected;
                      setImageMatches(newMatches);
                    }}
                    className={`bg-white dark:bg-[#1e1e24] rounded-3xl p-3 border-2 transition-all cursor-pointer flex gap-3 items-center ${match.selected ? 'border-indigo-500 shadow-lg shadow-indigo-500/10' : 'border-transparent opacity-60'}`}
                  >
                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${match.selected ? 'bg-indigo-500 border-indigo-500' : 'border-gray-300'}`}>
                      {match.selected && (
                        <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-bold text-sm dark:text-white truncate">{match.recipeName}</h4>
                      <div className="flex gap-2 mt-2">
                        <div className="w-16 h-16 bg-gray-100 dark:bg-white/5 rounded-xl overflow-hidden relative">
                          {match.oldImage ? (
                            <img src={match.oldImage} className="w-full h-full object-cover opacity-50" alt="old" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs">Нет</div>
                          )}
                          <span className="absolute bottom-0 left-0 right-0 bg-black/50 text-[8px] text-white text-center py-0.5">Было</span>
                        </div>
                        <div className="flex items-center text-gray-300">➜</div>
                        <div className="w-16 h-16 bg-gray-100 dark:bg-white/5 rounded-xl overflow-hidden relative border-2 border-indigo-500">
                          <img src={match.newImage} className="w-full h-full object-cover" alt="new" />
                          <span className="absolute bottom-0 left-0 right-0 bg-indigo-500 text-[8px] text-white text-center py-0.5">Станет</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {mode === 'import-staging' && (
          <div className="space-y-6 animate-slide-up pb-28">
            <div className="bg-white dark:bg-[#1e1e24] p-4 rounded-3xl shadow-sm border border-gray-100 dark:border-white/5 space-y-3">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Массовые действия</h3>
              <div className="flex gap-3 items-center">
                <div className="flex-1">
                  <CategorySelector
                    value={bulkCategory}
                    onChange={setBulkCategory}
                    existingCategories={existingCategories}
                    placeholder="Категория для всех..."
                  />
                </div>
                <div className="flex items-center justify-between bg-gray-50 dark:bg-black/20 p-3 rounded-xl cursor-pointer border border-transparent" onClick={() => setImportNotify(!importNotify)}>
                  <div className={`w-10 h-6 rounded-full transition-colors relative ${importNotify ? 'bg-blue-500' : 'bg-gray-300 dark:bg-white/10'}`}>
                    <div className={`w-4 h-4 bg-white rounded-full shadow absolute top-1 transition-transform ${importNotify ? 'left-5' : 'left-1'}`}></div>
                  </div>
                </div>
              </div>
              <p className="text-[10px] text-gray-400 text-right pr-2">Уведомить пользователей</p>
            </div>
            {stagedRecipes.map((recipe) => (
              <div
                key={recipe.id}
                className={`bg-white dark:bg-[#1e1e24] rounded-3xl overflow-hidden border-2 transition-all duration-300 shadow-sm ${recipe.selected ? 'border-sky-500 shadow-sky-500/10' : 'border-transparent opacity-70'}`}
              >
                <div
                  className="p-3 flex items-center gap-3 bg-gray-50/50 dark:bg-white/5 cursor-pointer hover:bg-gray-100 dark:hover:bg-white/10 transition"
                  onClick={() => updateStagedRecipe(recipe.id, 'collapsed', !recipe.collapsed)}
                >
                  <div
                    onClick={(e) => { e.stopPropagation(); updateStagedRecipe(recipe.id, 'selected', !recipe.selected); }}
                    className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${recipe.selected ? 'bg-sky-500 border-sky-500' : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-white/5'}`}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className={`w-3.5 h-3.5 text-white transition-all ${recipe.selected ? 'scale-100' : 'scale-0'}`}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className={`font-bold text-sm dark:text-white truncate ${!recipe.selected && 'text-gray-400 decoration-gray-400'}`}>{recipe.title}</h3>
                  </div>
                  {recipe.isDuplicate && (
                    <span className="text-[9px] bg-orange-100 text-orange-600 dark:bg-orange-500/20 dark:text-orange-400 px-2 py-0.5 rounded font-bold uppercase whitespace-nowrap">УЖЕ В БАЗЕ</span>
                  )}
                </div>
                {!recipe.collapsed && (
                  <div className="p-5 space-y-6 animate-fade-in bg-white dark:bg-[#1e1e24]">
                    <div className="space-y-4">
                      <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-2">Название</label>
                        <input
                          type="text"
                          className="w-full bg-gray-50 dark:bg-black/20 rounded-xl px-4 py-3 text-sm font-bold dark:text-white outline-none"
                          value={recipe.title}
                          onChange={e => updateStagedRecipe(recipe.id, 'title', e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-2">Категория</label>
                        <CategorySelector
                          value={recipe.category}
                          onChange={(val) => updateStagedRecipe(recipe.id, 'category', val)}
                          existingCategories={existingCategories}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">Ингредиенты</label>
                        {recipe.ingredients.map((ing, i) => (
                          <div key={i} className="grid grid-cols-[1fr_3rem] gap-2">
                            <span className="text-sm dark:text-gray-300 truncate">{ing.name}</span>
                            <span className="text-sm font-bold text-right dark:text-white">{ing.amount} {ing.unit}</span>
                          </div>
                        ))}
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-2">Шаги приготовления</label>
                        <textarea
                          className="w-full bg-gray-50 dark:bg-black/20 rounded-xl p-3 text-sm leading-relaxed outline-none dark:text-white focus:ring-2 focus:ring-orange-500/20 transition-all border border-transparent focus:bg-white dark:focus:bg-[#2a2a35] resize-none"
                          rows={3}
                          value={recipe.steps.join('\n')}
                          onChange={(e) => updateStagedRecipe(recipe.id, 'steps', e.target.value.split('\n'))}
                          placeholder="Шаги приготовления..."
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {mode === 'create' && (
            <div className="pt-8 pb-32">
                <button
                    onClick={handleSave}
                    disabled={isSaving || isUploading}
                    className="w-full bg-gray-900 dark:bg-white text-white dark:text-black font-black py-5 rounded-[2rem] shadow-2xl active:scale-95 transition-all text-lg uppercase tracking-widest disabled:opacity-50"
                >
                    {id ? 'Обновить карту' : 'Создать техкарту'}
                </button>
            </div>
        )}
       </div>
    </div>
  );
}
