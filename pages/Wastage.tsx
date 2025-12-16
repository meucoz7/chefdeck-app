
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { v4 as uuidv4 } from 'uuid';
import * as XLSX from 'xlsx';
import { WastageLog, WastageItem, WastageReason } from '../types';
import { useToast } from '../context/ToastContext';
import { useRecipes } from '../context/RecipeContext';
import { apiFetch } from '../services/api';
import { useTelegram } from '../context/TelegramContext';

// Updated Reasons
const REASONS: { key: WastageReason; label: string; icon: string; color: string }[] = [
    { key: 'spoilage', label: 'Порча', icon: '🤢', color: 'bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-400' },
    { key: 'expired', label: 'Срок годности', icon: '📅', color: 'bg-orange-100 text-orange-600 dark:bg-orange-500/20 dark:text-orange-400' },
    { key: 'mistake', label: 'Ошибка кухни', icon: '🔥', color: 'bg-yellow-100 text-yellow-600 dark:bg-yellow-500/20 dark:text-yellow-400' },
    { key: 'staff', label: 'Стаф-питание', icon: '🍲', color: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400' },
    { key: 'employee', label: 'На сотрудника', icon: '💸', color: 'bg-purple-100 text-purple-600 dark:bg-purple-500/20 dark:text-purple-400' },
    { key: 'other', label: 'Прочее', icon: '📦', color: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' }
];

const Wastage: React.FC = () => {
    const navigate = useNavigate();
    const { addToast } = useToast();
    const { recipes } = useRecipes();
    const { user, isAdmin } = useTelegram();
    
    const [logs, setLogs] = useState<WastageLog[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isCreateMode, setIsCreateMode] = useState(false);
    const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    
    // --- CREATE ACT STATE ---
    const [actDate, setActDate] = useState(new Date().toISOString().split('T')[0]);
    const [actItems, setActItems] = useState<Partial<WastageItem>[]>([{ id: uuidv4(), ingredientName: '', amount: '', unit: '' }]);
    const [actReason, setActReason] = useState<WastageReason>('spoilage');
    const [actComment, setActComment] = useState('');
    const [actPhoto, setActPhoto] = useState<string | null>(null);

    // --- EXPORT STATE ---
    const [showExportModal, setShowExportModal] = useState(false);
    const [exportType, setExportType] = useState<'month' | 'period'>('month');
    const [dateRange, setDateRange] = useState({ start: '', end: '' });

    // --- AUTOCOMPLETE STATE ---
    const [activeRowIndex, setActiveRowIndex] = useState<number | null>(null);
    const [suggestions, setSuggestions] = useState<string[]>([]);
    
    const fileInputRef = useRef<HTMLInputElement>(null);
    // Refs for amount inputs to handle auto-focus
    const amountInputRefs = useRef<(HTMLInputElement | null)[]>([]);

    // --- DATA LOADING ---
    useEffect(() => {
        loadData();
    }, []);

    const loadData = () => {
        setIsLoading(true);
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
    };

    // --- HELPERS ---
    const selectedLog = useMemo(() => logs.find(l => l.id === selectedLogId), [logs, selectedLogId]);

    const ingredientNames = useMemo(() => {
        const set = new Set<string>();
        recipes.forEach(r => r.ingredients.forEach(i => set.add(i.name)));
        return Array.from(set);
    }, [recipes]);

    const getUnitForIngredient = (name: string) => {
        const found = recipes.find(r => r.ingredients.some(i => i.name === name))?.ingredients.find(i => i.name === name);
        return found ? found.unit : '';
    };

    const handleNameInput = (index: number, val: string) => {
        const newItems = [...actItems];
        newItems[index].ingredientName = val;
        setActItems(newItems);
        setActiveRowIndex(index);

        if (val.length > 1) {
            setSuggestions(ingredientNames.filter(n => n.toLowerCase().includes(val.toLowerCase())).slice(0, 5));
        } else {
            setSuggestions([]);
        }
    };

    const selectSuggestion = (index: number, name: string, e: React.MouseEvent) => {
        // Critical: Prevent the input blur event from firing immediately on click.
        // This keeps the keyboard context active while we switch focus.
        e.preventDefault();

        const newItems = [...actItems];
        newItems[index].ingredientName = name;
        const unit = getUnitForIngredient(name);
        if (unit && !newItems[index].unit) newItems[index].unit = unit;
        
        setActItems(newItems);
        setSuggestions([]);
        setActiveRowIndex(null);

        // Use requestAnimationFrame for smoother focus transfer on mobile devices
        requestAnimationFrame(() => {
            const input = amountInputRefs.current[index];
            if (input) {
                input.focus();
            }
        });
    };

    // --- ACTIONS ---
    const addRow = () => {
        setActItems([...actItems, { id: uuidv4(), ingredientName: '', amount: '', unit: '' }]);
    };

    const removeRow = (index: number) => {
        if (actItems.length > 1) {
            setActItems(actItems.filter((_, i) => i !== index));
        }
    };

    const updateRow = (index: number, field: keyof WastageItem, val: string) => {
        const newItems = [...actItems];
        newItems[index] = { ...newItems[index], [field]: val };
        setActItems(newItems);
    };

    const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (ev) => setActPhoto(ev.target?.result as string);
            reader.readAsDataURL(file);
        }
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleSaveAct = async () => {
        const validItems = actItems.filter(i => i.ingredientName?.trim() && i.amount?.trim());
        
        if (validItems.length === 0) {
            addToast("Добавьте хотя бы один продукт", "error");
            return;
        }

        setIsSaving(true);

        const finalItems: WastageItem[] = validItems.map(i => ({
            id: i.id || uuidv4(),
            ingredientName: i.ingredientName!,
            amount: i.amount!,
            unit: i.unit || 'кг',
            reason: actReason,
            comment: actComment,
            photoUrl: actPhoto || undefined
        }));

        const newLog: WastageLog = {
            id: uuidv4(),
            date: new Date(actDate).getTime(),
            items: finalItems,
            createdBy: user ? `${user.first_name} ${user.last_name || ''}` : 'Unknown'
        };

        try {
            await apiFetch('/api/wastage', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newLog)
            });
            setLogs(prev => [newLog, ...prev]);
            
            // Reset Form
            setIsCreateMode(false);
            setActItems([{ id: uuidv4(), ingredientName: '', amount: '', unit: '' }]);
            setActReason('spoilage');
            setActComment('');
            setActPhoto(null);
            
            addToast("Акт списания создан", "success");
        } catch (e) {
            addToast("Ошибка сохранения", "error");
        } finally {
            setIsSaving(false);
        }
    };

    const deleteLog = async (id: string) => {
        if(confirm("Удалить этот акт?")) {
            try {
                await apiFetch(`/api/wastage/${id}`, { method: 'DELETE' });
                setLogs(prev => prev.filter(l => l.id !== id));
                if(selectedLogId === id) setSelectedLogId(null);
                addToast("Акт удален", "info");
            } catch(e) {
                addToast("Ошибка удаления", "error");
            }
        }
    };

    const handleBack = () => {
        if (selectedLogId) setSelectedLogId(null);
        else if (isCreateMode) setIsCreateMode(false);
        else navigate('/');
    };

    // --- HISTORY GROUPING ---
    const groupedLogs = useMemo(() => {
        const groups: Record<string, WastageLog[]> = {};
        logs.forEach(log => {
            const d = new Date(log.date).toDateString();
            if (!groups[d]) groups[d] = [];
            groups[d].push(log);
        });
        
        // Sort by date desc
        return Object.entries(groups).sort((a, b) => new Date(b[0]).getTime() - new Date(a[0]).getTime());
    }, [logs]);

    // --- EXPORT LOGIC ---
    const handleExport = () => {
        let filteredLogs = logs;
        let filename = 'Wastage_Report';

        if (exportType === 'month') {
            const now = new Date();
            const start = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
            const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).getTime();
            filteredLogs = logs.filter(l => l.date >= start && l.date <= end);
            filename += `_${now.getMonth() + 1}_${now.getFullYear()}`;
        } else {
            if (!dateRange.start || !dateRange.end) {
                addToast("Выберите даты", "error");
                return;
            }
            const start = new Date(dateRange.start).getTime();
            const end = new Date(dateRange.end).getTime() + 86400000;
            filteredLogs = logs.filter(l => l.date >= start && l.date <= end);
            filename += `_${dateRange.start}_${dateRange.end}`;
        }

        if (filteredLogs.length === 0) {
            addToast("Нет данных за выбранный период", "info");
            return;
        }

        const aggregation: Record<string, { name: string, amount: number, unit: string, reasons: Set<string> }> = {};

        filteredLogs.forEach(log => {
            log.items.forEach(item => {
                const key = `${item.ingredientName.toLowerCase()}_${item.unit.toLowerCase()}`;
                if (!aggregation[key]) {
                    aggregation[key] = { 
                        name: item.ingredientName, 
                        amount: 0, 
                        unit: item.unit, 
                        reasons: new Set() 
                    };
                }
                const val = parseFloat(item.amount.replace(',', '.'));
                if (!isNaN(val)) aggregation[key].amount += val;
                
                const reasonLabel = REASONS.find(r => r.key === item.reason)?.label || item.reason;
                aggregation[key].reasons.add(reasonLabel);
            });
        });

        const excelRows = Object.values(aggregation).map(item => ({
            "Наименование": item.name,
            "Кол-во": item.amount.toFixed(3).replace(/\.?0+$/, ''),
            "Ед.изм.": item.unit,
            "Причины": Array.from(item.reasons).join(', ')
        }));

        const ws = XLSX.utils.json_to_sheet(excelRows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Списания");
        XLSX.writeFile(wb, `${filename}.xlsx`);
        
        setShowExportModal(false);
        addToast("Скачивание началось", "success");
    };

    return (
        <div className="pb-safe-bottom animate-fade-in min-h-screen bg-[#f2f4f7] dark:bg-[#0f1115] relative">
            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handlePhotoUpload} />

            {/* SAVING OVERLAY */}
            {isSaving && createPortal(
                <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-md flex items-center justify-center animate-fade-in">
                    <div className="bg-white dark:bg-[#1e1e24] p-8 rounded-3xl shadow-2xl flex flex-col items-center">
                        <div className="animate-spin text-sky-500 mb-4">
                            <svg className="w-10 h-10" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                        </div>
                        <p className="font-bold text-gray-900 dark:text-white">Сохранение...</p>
                    </div>
                </div>,
                document.body
            )}

            {/* Header */}
            <div className="pt-safe-top px-5 pb-4 sticky top-0 z-40 bg-[#f2f4f7]/90 dark:bg-[#0f1115]/90 backdrop-blur-md">
                <div className="flex items-center justify-between pt-4 mb-2">
                    <div className="flex items-center gap-3">
                        <button onClick={handleBack} disabled={isSaving} className="w-10 h-10 rounded-full bg-white dark:bg-[#1e1e24] shadow-sm flex items-center justify-center text-gray-900 dark:text-white border border-gray-100 dark:border-white/5 active:scale-95 transition disabled:opacity-50">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
                        </button>
                        <div>
                            <h1 className="text-2xl font-black text-gray-900 dark:text-white leading-none">
                                {isCreateMode ? 'Новый акт' : (selectedLog ? 'Просмотр' : 'Журнал')}
                            </h1>
                            <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">
                                {isCreateMode ? 'Заполните форму' : (selectedLog ? 'Детали списания' : 'Учет потерь')}
                            </p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        {!isCreateMode && !selectedLog && (
                            <>
                                {isAdmin && (
                                    <button onClick={() => setShowExportModal(true)} className="w-10 h-10 rounded-full bg-white dark:bg-[#1e1e24] shadow-sm flex items-center justify-center text-green-600 dark:text-green-400 border border-gray-100 dark:border-white/10 active:scale-95 transition">
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
                                    </button>
                                )}
                                <button onClick={() => setIsCreateMode(true)} className="w-10 h-10 rounded-full bg-red-500 text-white flex items-center justify-center shadow-lg shadow-red-500/30 active:scale-95 transition hover:bg-red-600">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                                </button>
                            </>
                        )}
                        {selectedLog && (
                            <button onClick={() => deleteLog(selectedLog.id)} className="w-10 h-10 rounded-full bg-red-50 dark:bg-red-500/20 text-red-500 flex items-center justify-center active:scale-95 transition">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                            </button>
                        )}
                    </div>
                </div>
            </div>

            <div className="px-5 space-y-4">
                {isLoading ? (
                    <div className="text-center py-10 opacity-50"><div className="animate-spin text-red-500 text-2xl">⏳</div></div>
                ) : isCreateMode ? (
                    /* CREATE MODE */
                    <div className="animate-slide-up space-y-6 pb-20">
                        <div className="bg-white dark:bg-[#1e1e24] p-4 rounded-3xl shadow-sm border border-gray-100 dark:border-white/5 flex items-center justify-between">
                            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Дата акта</span>
                            <input 
                                type="date" 
                                className="bg-gray-50 dark:bg-black/20 rounded-xl px-3 py-2 text-sm font-bold dark:text-white outline-none"
                                value={actDate}
                                onChange={e => setActDate(e.target.value)}
                            />
                        </div>

                        <div className="bg-white dark:bg-[#1e1e24] p-5 rounded-[2rem] shadow-sm border border-gray-100 dark:border-white/5">
                            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Состав списания</h3>
                            <div className="space-y-3">
                                {actItems.map((item, idx) => (
                                    <div key={item.id} className="flex gap-2 items-center relative">
                                        <div className="flex-1 relative">
                                            <input 
                                                type="text" 
                                                placeholder="Продукт" 
                                                className="w-full bg-gray-50 dark:bg-black/20 rounded-xl px-3 py-3 text-sm font-bold dark:text-white outline-none focus:ring-2 focus:ring-sky-500/20"
                                                value={item.ingredientName}
                                                onChange={e => handleNameInput(idx, e.target.value)}
                                                onFocus={() => setActiveRowIndex(idx)}
                                                onBlur={() => setTimeout(() => setActiveRowIndex(null), 200)}
                                            />
                                            {activeRowIndex === idx && suggestions.length > 0 && (
                                                <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-[#2a2a35] rounded-xl shadow-xl z-50 border border-gray-100 dark:border-white/10 overflow-hidden">
                                                    {suggestions.map(s => (
                                                        <div key={s} onMouseDown={(e) => selectSuggestion(idx, s, e)} className="px-4 py-2 hover:bg-gray-50 dark:hover:bg-white/10 cursor-pointer dark:text-white text-sm font-medium border-b border-gray-50 dark:border-white/5 last:border-0">{s}</div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                        <input 
                                            ref={el => { amountInputRefs.current[idx] = el; }}
                                            type="text" 
                                            inputMode="decimal"
                                            placeholder="0.0" 
                                            className="w-20 bg-gray-50 dark:bg-black/20 rounded-xl px-2 py-3 text-sm font-bold text-center dark:text-white outline-none focus:ring-2 focus:ring-sky-500/20"
                                            value={item.amount}
                                            onChange={e => {
                                                // Replace comma with dot and validate number format
                                                const val = e.target.value.replace(',', '.');
                                                if (/^\d*\.?\d*$/.test(val)) {
                                                    updateRow(idx, 'amount', val);
                                                }
                                            }}
                                        />
                                        <input 
                                            type="text" 
                                            placeholder="Ед" 
                                            className="w-14 bg-gray-50 dark:bg-black/20 rounded-xl px-1 py-3 text-sm text-center dark:text-white outline-none focus:ring-2 focus:ring-sky-500/20"
                                            value={item.unit}
                                            onChange={e => updateRow(idx, 'unit', e.target.value)}
                                        />
                                        {idx === actItems.length - 1 ? (
                                            <button onClick={addRow} className="w-10 h-10 flex items-center justify-center bg-sky-500 text-white rounded-xl shadow-lg shadow-sky-500/30 active:scale-95 transition">
                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                                            </button>
                                        ) : (
                                            <button onClick={() => removeRow(idx)} className="w-10 h-10 flex items-center justify-center text-gray-300 hover:text-red-500 rounded-xl transition">
                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="bg-white dark:bg-[#1e1e24] p-5 rounded-[2rem] shadow-sm border border-gray-100 dark:border-white/5 space-y-5">
                            <div>
                                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Причина списания</h3>
                                <div className="flex flex-wrap gap-2">
                                    {REASONS.map(r => (
                                        <button 
                                            key={r.key}
                                            onClick={() => setActReason(r.key)}
                                            className={`px-3 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 border-2 ${actReason === r.key ? `border-transparent shadow-md transform scale-105 ${r.color}` : 'bg-gray-50 dark:bg-white/5 border-transparent text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10'}`}
                                        >
                                            <span>{r.icon}</span> {r.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="flex gap-3 items-stretch">
                                <textarea 
                                    className="flex-1 bg-gray-50 dark:bg-black/20 rounded-xl px-4 py-3 text-sm dark:text-white outline-none focus:ring-2 focus:ring-sky-500/20 resize-none h-14"
                                    placeholder="Комментарий к акту..."
                                    value={actComment}
                                    onChange={e => setActComment(e.target.value)}
                                />
                                <div className="relative">
                                    <button onClick={() => fileInputRef.current?.click()} className={`h-14 w-14 rounded-xl flex items-center justify-center text-xl transition border-2 border-dashed ${actPhoto ? 'border-green-500 bg-green-50 text-green-600' : 'border-gray-200 dark:border-white/10 text-gray-400'}`}>
                                        {actPhoto ? '✓' : '📷'}
                                    </button>
                                </div>
                            </div>
                        </div>

                        <button onClick={handleSaveAct} disabled={isSaving} className="w-full bg-gray-900 dark:bg-white text-white dark:text-black font-bold py-4 rounded-2xl shadow-xl active:scale-95 transition text-lg disabled:opacity-50 disabled:scale-100">
                            {isSaving ? 'Сохранение...' : 'Сохранить акт'}
                        </button>
                    </div>
                ) : selectedLog ? (
                    /* DETAIL VIEW */
                    <div className="animate-slide-up space-y-6 pb-20">
                        <div className="bg-white dark:bg-[#1e1e24] p-5 rounded-[2rem] shadow-sm border border-gray-100 dark:border-white/5">
                            <div className="flex items-center gap-4 mb-6 pb-6 border-b border-gray-100 dark:border-white/5">
                                {(() => {
                                    const r = REASONS.find(res => res.key === selectedLog.items[0].reason);
                                    return (
                                        <>
                                            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-4xl shadow-sm ${r?.color.replace('text-', 'bg-opacity-20 text-')}`}>
                                                {r?.icon}
                                            </div>
                                            <div>
                                                <h2 className="text-xl font-black text-gray-900 dark:text-white leading-none mb-2">{r?.label}</h2>
                                                <p className="text-sm text-gray-500 font-medium">Автор: {selectedLog.createdBy}</p>
                                                <p className="text-xs text-gray-400 mt-1">{new Date(selectedLog.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                                            </div>
                                        </>
                                    );
                                })()}
                            </div>

                            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Позиции ({selectedLog.items.length})</h3>
                            <div className="space-y-3">
                                {selectedLog.items.map((item, idx) => (
                                    <div key={idx} className="flex justify-between items-center p-3 bg-gray-50 dark:bg-black/20 rounded-xl">
                                        <span className="font-bold text-gray-900 dark:text-white text-sm">{item.ingredientName}</span>
                                        <span className="font-mono font-bold text-gray-900 dark:text-white bg-white dark:bg-white/10 px-2 py-1 rounded-lg text-sm">{item.amount} <span className="text-xs text-gray-500">{item.unit}</span></span>
                                    </div>
                                ))}
                            </div>

                            {(selectedLog.items[0].comment || selectedLog.items[0].photoUrl) && (
                                <div className="mt-6 pt-4 border-t border-gray-100 dark:border-white/5 space-y-4">
                                    {selectedLog.items[0].comment && (
                                        <div>
                                            <h4 className="text-[10px] font-bold text-gray-400 uppercase mb-2">Комментарий</h4>
                                            <p className="text-sm text-gray-700 dark:text-gray-300 italic">"{selectedLog.items[0].comment}"</p>
                                        </div>
                                    )}
                                    {selectedLog.items[0].photoUrl && (
                                        <div>
                                            <h4 className="text-[10px] font-bold text-gray-400 uppercase mb-2">Фотоотчет</h4>
                                            <img src={selectedLog.items[0].photoUrl} className="w-full rounded-xl" />
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    /* COMPACT LIST MODE */
                    <div className="space-y-6 pb-20">
                        {groupedLogs.length === 0 ? (
                            <div className="text-center py-20 opacity-50">
                                <div className="text-4xl mb-3">🗑️</div>
                                <p className="font-bold dark:text-white">История пуста</p>
                                <p className="text-xs text-gray-400">Нажмите +, чтобы добавить</p>
                            </div>
                        ) : (
                            groupedLogs.map(([dateStr, logsInGroup]) => {
                                const dateObj = new Date(logsInGroup[0].date);
                                
                                return (
                                    <div key={dateStr} className="animate-slide-up">
                                        <div className="flex items-center gap-3 mb-3 px-2">
                                            <div className="h-[1px] flex-1 bg-gray-200 dark:bg-white/10"></div>
                                            <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                                                {dateObj.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}
                                            </span>
                                            <div className="h-[1px] flex-1 bg-gray-200 dark:bg-white/10"></div>
                                        </div>

                                        <div className="space-y-3">
                                            {logsInGroup.map(log => {
                                                // Determine main reason from first item
                                                const mainReasonKey = log.items[0]?.reason || 'other';
                                                const reasonConfig = REASONS.find(r => r.key === mainReasonKey) || REASONS[REASONS.length - 1];
                                                const totalItems = log.items.length;

                                                return (
                                                    <div 
                                                        key={log.id} 
                                                        onClick={() => setSelectedLogId(log.id)}
                                                        className="bg-white dark:bg-[#1e1e24] p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-white/5 active:scale-[0.98] transition-all flex items-center justify-between cursor-pointer hover:shadow-md"
                                                    >
                                                        <div className="flex items-center gap-4">
                                                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl shadow-sm ${reasonConfig.color.replace('text-', 'bg-opacity-20 text-')}`}>
                                                                {reasonConfig.icon}
                                                            </div>
                                                            <div>
                                                                <h3 className="font-black text-base text-gray-900 dark:text-white leading-tight mb-1">
                                                                    {reasonConfig.label}
                                                                </h3>
                                                                <div className="flex items-center gap-2 text-xs text-gray-400 font-medium">
                                                                    <span>{log.createdBy}</span>
                                                                    <span className="w-1 h-1 bg-gray-300 rounded-full"></span>
                                                                    <span>{totalItems} поз.</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5 text-gray-300"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                )}
            </div>

            {/* EXPORT MODAL */}
            {showExportModal && createPortal(
                <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in" onClick={(e) => { if(e.target === e.currentTarget) setShowExportModal(false); }}>
                    <div className="bg-white dark:bg-[#1e1e24] w-full max-w-sm rounded-[2rem] p-6 shadow-2xl animate-slide-up">
                        <h3 className="text-xl font-black dark:text-white mb-4">Экспорт в Excel</h3>
                        
                        <div className="space-y-4 mb-6">
                            <div className="flex bg-gray-100 dark:bg-black/20 p-1 rounded-xl">
                                <button onClick={() => setExportType('month')} className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase transition ${exportType === 'month' ? 'bg-white dark:bg-[#2a2a35] shadow-sm text-black dark:text-white' : 'text-gray-400'}`}>За месяц</button>
                                <button onClick={() => setExportType('period')} className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase transition ${exportType === 'period' ? 'bg-white dark:bg-[#2a2a35] shadow-sm text-black dark:text-white' : 'text-gray-400'}`}>Период</button>
                            </div>

                            {exportType === 'period' && (
                                <div className="flex gap-3">
                                    <div className="flex-1 space-y-1">
                                        <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">От</label>
                                        <input 
                                            type="date" 
                                            className="w-full bg-gray-50 dark:bg-black/20 rounded-xl px-4 py-3 text-sm font-bold dark:text-white outline-none focus:ring-2 focus:ring-sky-500/20 transition-all border border-transparent focus:bg-white dark:focus:bg-[#2a2a35]" 
                                            value={dateRange.start} 
                                            onChange={e => setDateRange({...dateRange, start: e.target.value})} 
                                        />
                                    </div>
                                    <div className="flex-1 space-y-1">
                                        <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">До</label>
                                        <input 
                                            type="date" 
                                            className="w-full bg-gray-50 dark:bg-black/20 rounded-xl px-4 py-3 text-sm font-bold dark:text-white outline-none focus:ring-2 focus:ring-sky-500/20 transition-all border border-transparent focus:bg-white dark:focus:bg-[#2a2a35]" 
                                            value={dateRange.end} 
                                            onChange={e => setDateRange({...dateRange, end: e.target.value})} 
                                        />
                                    </div>
                                </div>
                            )}
                            
                            <p className="text-xs text-gray-400 text-center leading-relaxed">
                                Будет сформирован файл .xlsx со сводной таблицей списаний (наименование, суммарный вес, причины).
                            </p>
                        </div>

                        <div className="flex gap-3">
                            <button onClick={() => setShowExportModal(false)} className="flex-1 py-3 text-gray-500 font-bold bg-gray-100 dark:bg-white/5 rounded-xl hover:bg-gray-200 dark:hover:bg-white/10 transition">Отмена</button>
                            <button onClick={handleExport} className="flex-1 py-3 text-white font-bold bg-green-600 rounded-xl shadow-lg shadow-green-600/30 hover:bg-green-700 transition">Скачать</button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};

export default Wastage;

