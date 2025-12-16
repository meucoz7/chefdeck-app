
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { v4 as uuidv4 } from 'uuid';
import { WastageLog, WastageItem, WastageReason } from '../types';
import { useToast } from '../context/ToastContext';
import { useRecipes } from '../context/RecipeContext';
import { apiFetch } from '../services/api';
import { useTelegram } from '../context/TelegramContext';

const REASONS: { key: WastageReason; label: string; icon: string; color: string }[] = [
    { key: 'spoilage', label: 'Порча', icon: '🤢', color: 'bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-400' },
    { key: 'expired', label: 'Срок годности', icon: '📅', color: 'bg-orange-100 text-orange-600 dark:bg-orange-500/20 dark:text-orange-400' },
    { key: 'mistake', label: 'Ошибка кухни', icon: '🔥', color: 'bg-yellow-100 text-yellow-600 dark:bg-yellow-500/20 dark:text-yellow-400' },
    { key: 'training', label: 'Проработка', icon: '👨‍🍳', color: 'bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400' },
    { key: 'other', label: 'Прочее', icon: '📦', color: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' }
];

const Wastage: React.FC = () => {
    const navigate = useNavigate();
    const { addToast } = useToast();
    const { recipes } = useRecipes();
    const { user } = useTelegram();
    
    const [logs, setLogs] = useState<WastageLog[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isCreateMode, setIsCreateMode] = useState(false);
    
    // Create/Edit State
    const [currentDate, setCurrentDate] = useState(new Date().toISOString().split('T')[0]);
    const [items, setItems] = useState<WastageItem[]>([]);
    const [isItemModalOpen, setIsItemModalOpen] = useState(false);
    
    // New Item Temp State
    const [tempItem, setTempItem] = useState<Partial<WastageItem>>({ reason: 'spoilage' });
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // --- DATA LOADING ---
    useEffect(() => {
        apiFetch('/api/wastage')
            .then(res => res.json())
            .then(data => {
                setLogs(Array.isArray(data) ? data : []);
                setIsLoading(false);
            })
            .catch(() => {
                addToast("Ошибка загрузки", "error");
                setIsLoading(false);
            });
    }, []);

    // --- AUTOCOMPLETE LOGIC ---
    const ingredientNames = useMemo(() => {
        const set = new Set<string>();
        recipes.forEach(r => r.ingredients.forEach(i => set.add(i.name)));
        return Array.from(set);
    }, [recipes]);

    const handleNameInput = (val: string) => {
        setTempItem(prev => ({ ...prev, ingredientName: val }));
        if (val.length > 1) {
            setSuggestions(ingredientNames.filter(n => n.toLowerCase().includes(val.toLowerCase())).slice(0, 5));
        } else {
            setSuggestions([]);
        }
    };

    const selectSuggestion = (name: string) => {
        setTempItem(prev => ({ ...prev, ingredientName: name }));
        setSuggestions([]);
        
        // Auto-fill unit if possible
        const found = recipes.find(r => r.ingredients.some(i => i.name === name))?.ingredients.find(i => i.name === name);
        if (found) {
            setTempItem(prev => ({ ...prev, unit: found.unit }));
        }
    };

    // --- ACTIONS ---
    const handleAddItem = () => {
        if (!tempItem.ingredientName || !tempItem.amount) {
            addToast("Заполните название и количество", "error");
            return;
        }
        const newItem: WastageItem = {
            id: uuidv4(),
            ingredientName: tempItem.ingredientName,
            amount: tempItem.amount,
            unit: tempItem.unit || 'кг',
            reason: tempItem.reason || 'spoilage',
            comment: tempItem.comment,
            photoUrl: tempItem.photoUrl
        };
        setItems(prev => [...prev, newItem]);
        setTempItem({ reason: 'spoilage' });
        setIsItemModalOpen(false);
    };

    const handleSaveLog = async () => {
        if (items.length === 0) {
            addToast("Добавьте позиции", "error");
            return;
        }
        
        const newLog: WastageLog = {
            id: uuidv4(),
            date: new Date(currentDate).getTime(),
            items,
            createdBy: user ? `${user.first_name} ${user.last_name || ''}` : 'Unknown'
        };

        try {
            await apiFetch('/api/wastage', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newLog)
            });
            setLogs(prev => [newLog, ...prev]);
            setIsCreateMode(false);
            setItems([]);
            addToast("Акт списания сохранен", "success");
        } catch (e) {
            addToast("Ошибка сохранения", "error");
        }
    };

    const handleDeleteLog = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (confirm("Удалить этот акт?")) {
            try {
                await apiFetch(`/api/wastage/${id}`, { method: 'DELETE' });
                setLogs(prev => prev.filter(l => l.id !== id));
                addToast("Удалено", "info");
            } catch (e) {
                addToast("Ошибка удаления", "error");
            }
        }
    };

    const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (ev) => setTempItem(prev => ({ ...prev, photoUrl: ev.target?.result as string }));
            reader.readAsDataURL(file);
        }
    };

    return (
        <div className="pb-24 animate-fade-in min-h-screen bg-[#f2f4f7] dark:bg-[#0f1115]">
            
            {/* Header */}
            <div className="pt-safe-top px-5 pb-4 sticky top-0 z-40 bg-[#f2f4f7]/90 dark:bg-[#0f1115]/90 backdrop-blur-md">
                <div className="flex items-center justify-between pt-4 mb-2">
                    <div className="flex items-center gap-3">
                        <button onClick={() => isCreateMode ? setIsCreateMode(false) : navigate('/')} className="w-10 h-10 rounded-full bg-white dark:bg-[#1e1e24] shadow-sm flex items-center justify-center text-gray-900 dark:text-white border border-gray-100 dark:border-white/5 active:scale-95 transition">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
                        </button>
                        <div>
                            <h1 className="text-2xl font-black text-gray-900 dark:text-white leading-none">{isCreateMode ? 'Новый акт' : 'Списания'}</h1>
                            <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">{isCreateMode ? 'Заполните форму' : 'Журнал учета потерь'}</p>
                        </div>
                    </div>
                    {!isCreateMode && (
                        <button onClick={() => { setItems([]); setIsCreateMode(true); }} className="w-10 h-10 rounded-full bg-red-500 text-white flex items-center justify-center shadow-lg shadow-red-500/30 active:scale-95 transition hover:bg-red-600">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                        </button>
                    )}
                </div>
            </div>

            <div className="px-5 space-y-4">
                {isLoading ? (
                    <div className="text-center py-10 opacity-50"><div className="animate-spin text-red-500 text-2xl">⏳</div></div>
                ) : isCreateMode ? (
                    <div className="animate-slide-up space-y-6">
                        {/* Date Picker */}
                        <div className="bg-white dark:bg-[#1e1e24] p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-white/5 flex items-center justify-between">
                            <span className="text-sm font-bold text-gray-500 uppercase">Дата списания</span>
                            <input 
                                type="date" 
                                className="bg-gray-50 dark:bg-black/20 rounded-xl px-3 py-2 text-sm font-bold dark:text-white outline-none"
                                value={currentDate}
                                onChange={e => setCurrentDate(e.target.value)}
                            />
                        </div>

                        {/* Items List */}
                        <div className="space-y-3">
                            {items.map((item, idx) => {
                                const reason = REASONS.find(r => r.key === item.reason);
                                return (
                                    <div key={item.id} className="bg-white dark:bg-[#1e1e24] p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-white/5 relative overflow-hidden">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <h3 className="font-bold text-gray-900 dark:text-white text-lg">{item.ingredientName}</h3>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg uppercase flex items-center gap-1 ${reason?.color}`}>
                                                        <span>{reason?.icon}</span> {reason?.label}
                                                    </span>
                                                    <span className="text-sm font-bold text-gray-500">{item.amount} {item.unit}</span>
                                                </div>
                                                {item.comment && <p className="text-xs text-gray-400 mt-2 italic">"{item.comment}"</p>}
                                            </div>
                                            {item.photoUrl && (
                                                <div className="w-12 h-12 rounded-xl bg-gray-100 dark:bg-white/5 overflow-hidden flex-shrink-0 border border-gray-200 dark:border-white/10">
                                                    <img src={item.photoUrl} className="w-full h-full object-cover" />
                                                </div>
                                            )}
                                        </div>
                                        <button onClick={() => setItems(items.filter(i => i.id !== item.id))} className="absolute top-0 right-0 p-3 text-gray-300 hover:text-red-500 transition">
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" /></svg>
                                        </button>
                                    </div>
                                );
                            })}
                            
                            <button onClick={() => setIsItemModalOpen(true)} className="w-full py-4 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-2xl text-gray-400 font-bold uppercase tracking-wider hover:bg-gray-50 dark:hover:bg-white/5 transition flex items-center justify-center gap-2">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                                Добавить позицию
                            </button>
                        </div>

                        <button onClick={handleSaveLog} className="w-full bg-gray-900 dark:bg-white text-white dark:text-black font-bold py-4 rounded-2xl shadow-xl active:scale-95 transition mt-4">
                            Сохранить акт
                        </button>
                    </div>
                ) : (
                    /* LIST MODE */
                    <div className="space-y-4">
                        {logs.length === 0 ? (
                            <div className="text-center py-20 opacity-50">
                                <div className="text-4xl mb-3">🗑️</div>
                                <p className="font-bold dark:text-white">История пуста</p>
                                <p className="text-xs text-gray-400">Нажмите + чтобы добавить списание</p>
                            </div>
                        ) : (
                            logs.map(log => (
                                <div key={log.id} className="bg-white dark:bg-[#1e1e24] p-5 rounded-3xl shadow-sm border border-gray-100 dark:border-white/5 relative group">
                                    <div className="flex justify-between items-start mb-4 pb-4 border-b border-gray-100 dark:border-white/5">
                                        <div>
                                            <h3 className="font-black text-xl text-gray-900 dark:text-white leading-none">
                                                {new Date(log.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}
                                            </h3>
                                            <p className="text-xs text-gray-400 font-bold mt-1">Автор: {log.createdBy || 'Неизвестно'}</p>
                                        </div>
                                        <button onClick={(e) => handleDeleteLog(log.id, e)} className="text-gray-300 hover:text-red-500 transition">
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5"><path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" /></svg>
                                        </button>
                                    </div>
                                    <div className="space-y-3">
                                        {log.items.map((item, i) => {
                                            const reason = REASONS.find(r => r.key === item.reason);
                                            return (
                                                <div key={i} className="flex justify-between items-center text-sm">
                                                    <div className="flex items-center gap-2">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                                                        <span className="text-gray-700 dark:text-gray-300 font-medium">{item.ingredientName}</span>
                                                        {item.photoUrl && <span className="text-xs">📷</span>}
                                                    </div>
                                                    <div className="flex flex-col items-end">
                                                        <span className="font-bold dark:text-white">{item.amount} {item.unit}</span>
                                                        <span className={`text-[9px] uppercase font-bold ${reason?.color?.split(' ')[1]}`}>{reason?.label}</span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <div className="mt-4 pt-3 border-t border-gray-100 dark:border-white/5 flex justify-between items-center">
                                        <span className="text-xs text-gray-400 font-bold uppercase">Итого позиций:</span>
                                        <span className="text-sm font-black text-gray-900 dark:text-white">{log.items.length}</span>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}
            </div>

            {/* NEW ITEM MODAL */}
            {isItemModalOpen && createPortal(
                <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 animate-fade-in">
                    <div className="bg-white dark:bg-[#1e1e24] w-full max-w-sm rounded-[2rem] p-6 shadow-2xl animate-slide-up space-y-5">
                        <h3 className="font-black text-xl dark:text-white">Добавить позицию</h3>
                        
                        {/* Name Autocomplete */}
                        <div className="relative group">
                            <label className="text-[10px] font-bold text-gray-400 uppercase">Наименование</label>
                            <input 
                                type="text" 
                                className="w-full bg-gray-50 dark:bg-black/20 rounded-xl px-4 py-3 font-bold dark:text-white outline-none focus:ring-2 focus:ring-sky-500/20"
                                placeholder="Например: Лосось"
                                value={tempItem.ingredientName || ''}
                                onChange={e => handleNameInput(e.target.value)}
                            />
                            {suggestions.length > 0 && (
                                <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-[#2a2a35] rounded-xl shadow-xl z-50 border border-gray-100 dark:border-white/10 overflow-hidden">
                                    {suggestions.map(s => (
                                        <div key={s} onClick={() => selectSuggestion(s)} className="px-4 py-3 hover:bg-gray-50 dark:hover:bg-white/10 cursor-pointer dark:text-white text-sm font-medium">{s}</div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Amount & Unit */}
                        <div className="flex gap-3">
                            <div className="flex-1">
                                <label className="text-[10px] font-bold text-gray-400 uppercase">Кол-во</label>
                                <input 
                                    type="number" 
                                    className="w-full bg-gray-50 dark:bg-black/20 rounded-xl px-4 py-3 font-bold dark:text-white outline-none focus:ring-2 focus:ring-sky-500/20"
                                    placeholder="0.0"
                                    value={tempItem.amount || ''}
                                    onChange={e => setTempItem(prev => ({...prev, amount: e.target.value}))}
                                />
                            </div>
                            <div className="w-24">
                                <label className="text-[10px] font-bold text-gray-400 uppercase">Ед.изм.</label>
                                <input 
                                    type="text" 
                                    className="w-full bg-gray-50 dark:bg-black/20 rounded-xl px-4 py-3 font-bold dark:text-white outline-none focus:ring-2 focus:ring-sky-500/20"
                                    placeholder="кг"
                                    value={tempItem.unit || ''}
                                    onChange={e => setTempItem(prev => ({...prev, unit: e.target.value}))}
                                />
                            </div>
                        </div>

                        {/* Reason Selector */}
                        <div>
                            <label className="text-[10px] font-bold text-gray-400 uppercase mb-2 block">Причина списания</label>
                            <div className="flex flex-wrap gap-2">
                                {REASONS.map(r => (
                                    <button 
                                        key={r.key}
                                        onClick={() => setTempItem(prev => ({...prev, reason: r.key}))}
                                        className={`px-3 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 border-2 ${tempItem.reason === r.key ? `border-transparent shadow-md transform scale-105 ${r.color}` : 'bg-gray-50 dark:bg-white/5 border-transparent text-gray-400'}`}
                                    >
                                        <span>{r.icon}</span> {r.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Comment & Photo */}
                        <div className="flex gap-3">
                            <input 
                                type="text" 
                                className="flex-1 bg-gray-50 dark:bg-black/20 rounded-xl px-4 py-3 text-sm dark:text-white outline-none focus:ring-2 focus:ring-sky-500/20"
                                placeholder="Комментарий..."
                                value={tempItem.comment || ''}
                                onChange={e => setTempItem(prev => ({...prev, comment: e.target.value}))}
                            />
                            <div className="relative">
                                <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handlePhotoUpload} />
                                <button onClick={() => fileInputRef.current?.click()} className={`w-12 h-full rounded-xl flex items-center justify-center text-xl transition ${tempItem.photoUrl ? 'bg-green-500 text-white shadow-lg' : 'bg-gray-100 dark:bg-white/10 text-gray-400'}`}>
                                    {tempItem.photoUrl ? '✓' : '📷'}
                                </button>
                            </div>
                        </div>

                        <button onClick={handleAddItem} className="w-full bg-gray-900 dark:bg-white text-white dark:text-black font-bold py-4 rounded-xl shadow-xl active:scale-95 transition text-lg">
                            Добавить
                        </button>
                        <button onClick={() => setIsItemModalOpen(false)} className="w-full text-gray-400 font-bold text-sm py-2">Отмена</button>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};

export default Wastage;
