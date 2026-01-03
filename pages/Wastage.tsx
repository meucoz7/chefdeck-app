
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import * as XLSX from 'xlsx';
import { WastageLog, WastageItem, WastageReason, ImageUrls } from '../types';
import { useToast } from '../context/ToastContext';
import { useTelegram } from '../context/TelegramContext';
import { apiFetch } from '../services/api';
import { uploadImage } from '../services/uploadService';
import { scopedStorage } from '../services/storage';

const REASONS: { value: WastageReason; label: string; icon: string; color: string }[] = [
    { value: 'spoilage', label: 'Порча', icon: '🥀', color: 'bg-red-500' },
    { value: 'expired', label: 'Срок годности', icon: '⏰', color: 'bg-orange-500' },
    { value: 'mistake', label: 'Ошибка', icon: '🥣', color: 'bg-amber-500' },
    { value: 'training', label: 'Обучение', icon: '🎓', color: 'bg-blue-500' },
    { value: 'staff', label: 'Питание', icon: '🥗', color: 'bg-emerald-500' },
    { value: 'employee', label: 'Сотрудник', icon: '👤', color: 'bg-indigo-500' },
    { value: 'other', label: 'Другое', icon: '❓', color: 'bg-gray-500' }
];

const Wastage: React.FC = () => {
    const navigate = useNavigate();
    const { addToast } = useToast();
    const { user, isAdmin } = useTelegram();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const [logs, setLogs] = useState<WastageLog[]>([]);
    const [isAdding, setIsAdding] = useState(false);
    const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
    const [expandedMonth, setExpandedMonth] = useState<string | null>(null);
    const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
    const [isReasonDropdownOpen, setIsReasonDropdownOpen] = useState(false);

    // Multi-item Entry State
    const [globalReason, setGlobalReason] = useState<WastageReason>('spoilage');
    const [stagedItems, setStagedItems] = useState<Partial<WastageItem>[]>([
        { id: uuidv4(), unit: 'кг', ingredientName: '', amount: '' }
    ]);
    const [actPhoto, setActPhoto] = useState<string>('');
    const [actPhotos, setActPhotos] = useState<ImageUrls | null>(null);
    const [globalComment, setGlobalComment] = useState('');

    useEffect(() => {
        const cached = scopedStorage.getJson<WastageLog[]>('wastage_logs', []);
        if (cached && cached.length > 0) {
            setLogs(cached);
        }
        
        apiFetch('/api/wastage')
            .then(res => {
                if (!res.ok) throw new Error();
                return res.json();
            })
            .then(data => {
                if (Array.isArray(data)) {
                    setLogs(data);
                    scopedStorage.setJson('wastage_logs', data);
                }
            })
            .catch(() => {
                console.warn("Wastage API unavailable, using local cache.");
            });
    }, []);

    // Handle clicks outside dropdown
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsReasonDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const groupedData = useMemo(() => {
        const months: Record<string, Record<WastageReason, (WastageItem & { logId: string })[]>> = {};

        logs.forEach(log => {
            const date = new Date(log.date);
            const monthKey = date.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
            
            if (!months[monthKey]) {
                months[monthKey] = {} as Record<WastageReason, (WastageItem & { logId: string })[]>;
                REASONS.forEach(r => { months[monthKey][r.value] = []; });
            }

            log.items.forEach(item => {
                months[monthKey][item.reason].push({
                    ...item,
                    logId: log.id,
                    comment: `${item.comment || ''} (Дата: ${date.toLocaleDateString()})`.trim()
                });
            });
        });

        return months;
    }, [logs]);

    const addStagedItem = () => {
        setStagedItems([...stagedItems, { id: uuidv4(), unit: 'кг', ingredientName: '', amount: '' }]);
    };

    const removeStagedItem = (id: string) => {
        if (stagedItems.length > 1) {
            setStagedItems(stagedItems.filter(i => i.id !== id));
        }
    };

    const updateStagedItem = (id: string, field: keyof WastageItem, value: any) => {
        setStagedItems(stagedItems.map(i => i.id === id ? { ...i, [field]: value } : i));
    };

    const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setIsUploadingPhoto(true);
            try {
                const urls = await uploadImage(file, 'wastages');
                setActPhoto(urls.original);
                setActPhotos(urls);
                addToast("Фото прикреплено", "success");
            } catch (err: any) {
                addToast(err.message || "Ошибка при загрузке фото", "error");
            } finally {
                setIsUploadingPhoto(false);
            }
        }
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleSave = async () => {
        const validItems = stagedItems.filter(i => i.ingredientName && i.amount);
        
        if (validItems.length === 0) {
            addToast("Добавьте хотя бы одну позицию", "error");
            return;
        }

        const finalItems: WastageItem[] = validItems.map(i => ({
            id: i.id || uuidv4(),
            ingredientName: i.ingredientName!.trim(),
            amount: i.amount!.toString().replace(',', '.'),
            unit: i.unit || 'кг',
            reason: globalReason,
            comment: globalComment,
            photoUrl: actPhoto,
            photoUrls: actPhotos || undefined
        }));

        const newLog: WastageLog = {
            id: uuidv4(),
            date: Date.now(),
            items: finalItems,
            createdBy: user ? `${user.first_name} ${user.last_name || ''}` : 'Unknown'
        };

        try {
            const res = await apiFetch('/api/wastage', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newLog)
            });
            
            if (!res.ok) throw new Error();

            setLogs(prev => {
                const updated = [newLog, ...prev];
                scopedStorage.setJson('wastage_logs', updated);
                return updated;
            });

            addToast("Акт списания сохранен", "success");
            setIsAdding(false);
            setStagedItems([{ id: uuidv4(), unit: 'кг', ingredientName: '', amount: '' }]);
            setGlobalReason('spoilage');
            setGlobalComment('');
            setActPhoto('');
            setActPhotos(null);
        } catch (err) {
            addToast("Ошибка сохранения", "error");
        }
    };

    const handleDeleteLog = async (logId: string) => {
        if (!isAdmin) return;
        if (confirm("Удалить этот акт списания (все позиции в нем)?")) {
            try {
                const res = await apiFetch(`/api/wastage/${logId}`, { method: 'DELETE' });
                if (res.ok) {
                    setLogs(prev => {
                        const updated = prev.filter(l => l.id !== logId);
                        scopedStorage.setJson('wastage_logs', updated);
                        return updated;
                    });
                    addToast("Списание удалено", "success");
                } else {
                    throw new Error();
                }
            } catch (err) {
                setLogs(prev => prev.filter(l => l.id !== logId));
                addToast("Удалено локально", "info");
            }
        }
    };

    const exportMonthToExcel = (monthName: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!isAdmin) return;
        const monthData = groupedData[monthName];
        const workbook = XLSX.utils.book_new();

        REASONS.forEach(reason => {
            const items = monthData[reason.value];
            if (items.length === 0) return;

            const summary: Record<string, { name: string; unit: string; amount: number }> = {};
            items.forEach(it => {
                const key = `${it.ingredientName.toLowerCase().trim()}_${it.unit.toLowerCase()}`;
                const num = parseFloat(it.amount) || 0;
                if (!summary[key]) {
                    summary[key] = { name: it.ingredientName, unit: it.unit, amount: 0 };
                }
                summary[key].amount += num;
            });

            const sheetData = Object.values(summary).map(s => ({
                "Наименование": s.name,
                "Кол-во": s.amount,
                "Ед. изм.": s.unit
            }));

            const worksheet = XLSX.utils.json_to_sheet(sheetData);
            XLSX.utils.book_append_sheet(workbook, worksheet, reason.label.substring(0, 31));
        });

        XLSX.writeFile(workbook, `Списания_${monthName.replace(/\s+/g, '_')}.xlsx`);
        addToast("Отчет сформирован", "success");
    };

    const currentReasonInfo = REASONS.find(r => r.value === globalReason)!;

    return (
        <div className="pb-28 animate-fade-in min-h-screen bg-[#f2f4f7] dark:bg-[#0f1115]">
            <div className="pt-safe-top px-5 pb-4 sticky top-0 z-40 bg-[#f2f4f7]/85 dark:bg-[#0f1115]/85 backdrop-blur-md border-b border-gray-100 dark:border-white/5">
                <div className="flex items-center justify-between pt-4">
                    <div className="flex items-center gap-3">
                        <button onClick={() => navigate('/')} className="w-10 h-10 rounded-full bg-white dark:bg-[#1e1e24] shadow-sm flex items-center justify-center dark:text-white border border-gray-100 dark:border-white/5 active:scale-95 transition">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
                        </button>
                        <div>
                            <h1 className="text-xl font-black text-gray-900 dark:text-white leading-none">Списания</h1>
                            <p className="text-[10px] text-gray-400 font-bold uppercase mt-1 tracking-widest">Акты и архив</p>
                        </div>
                    </div>
                    <button onClick={() => setIsAdding(!isAdding)} className={`w-10 h-10 rounded-full flex items-center justify-center shadow-lg transition-all duration-300 active:scale-90 ${isAdding ? 'bg-gray-800 text-white rotate-45' : 'bg-indigo-600 text-white shadow-indigo-500/30'}`}>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                    </button>
                </div>
            </div>

            <div className="px-5 pt-6 space-y-4">
                {isAdding ? (
                    <div className="bg-white dark:bg-[#1e1e24] p-5 rounded-[2.5rem] shadow-xl border border-gray-100 dark:border-white/5 space-y-5 animate-slide-up">
                        <div className="flex justify-between items-center px-1">
                            <h2 className="text-lg font-black dark:text-white uppercase tracking-tight">Новый акт</h2>
                            <button onClick={() => setIsAdding(false)} className="text-gray-300 p-2">✕</button>
                        </div>

                        {/* Custom Dropdown for Reason Selection */}
                        <div className="space-y-2 relative" ref={dropdownRef}>
                            <label className="text-[9px] font-black text-gray-400 uppercase ml-2 tracking-widest">Причина списания</label>
                            <button 
                                onClick={() => setIsReasonDropdownOpen(!isReasonDropdownOpen)}
                                className={`w-full bg-gray-50 dark:bg-black/20 rounded-2xl px-5 py-4 flex items-center justify-between border-2 transition-all ${isReasonDropdownOpen ? 'border-indigo-500 shadow-lg shadow-indigo-500/10' : 'border-transparent shadow-sm'}`}
                            >
                                <div className="flex items-center gap-3">
                                    <span className="text-xl">{currentReasonInfo.icon}</span>
                                    <span className="font-bold text-sm dark:text-white uppercase tracking-tight">{currentReasonInfo.label}</span>
                                </div>
                                <svg className={`w-5 h-5 text-gray-400 transition-transform duration-300 ${isReasonDropdownOpen ? 'rotate-180 text-indigo-500' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                                </svg>
                            </button>

                            {isReasonDropdownOpen && (
                                <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-[#2a2a35] rounded-3xl shadow-2xl border border-gray-100 dark:border-white/10 z-[60] overflow-hidden animate-scale-in origin-top">
                                    <div className="p-2 space-y-1">
                                        {REASONS.map(r => (
                                            <button 
                                                key={r.value}
                                                onClick={() => {
                                                    setGlobalReason(r.value);
                                                    setIsReasonDropdownOpen(false);
                                                }}
                                                className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl transition-all ${globalReason === r.value ? 'bg-indigo-600 text-white shadow-md' : 'hover:bg-gray-50 dark:hover:bg-white/5 text-gray-700 dark:text-gray-200'}`}
                                            >
                                                <span className="text-lg">{r.icon}</span>
                                                <span className="font-black text-[11px] uppercase tracking-wider">{r.label}</span>
                                                {globalReason === r.value && (
                                                    <svg className="w-4 h-4 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={4}><path d="M5 13l4 4L19 7" /></svg>
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="space-y-2">
                            <div className="grid grid-cols-[1fr_5rem_5rem_2rem] gap-2 px-2">
                                <label className="text-[8px] font-black text-gray-400 uppercase tracking-tighter">Продукт</label>
                                <label className="text-[8px] font-black text-gray-400 uppercase tracking-tighter text-center">Ед.изм</label>
                                <label className="text-[8px] font-black text-gray-400 uppercase tracking-tighter text-center">Кол-во</label>
                                <div className="w-2"></div>
                            </div>
                            
                            <div className="space-y-2">
                                {stagedItems.map((item, idx) => (
                                    <div key={item.id} className="grid grid-cols-[1fr_5rem_5rem_2rem] gap-2 items-center group/item animate-fade-in">
                                        <input 
                                            type="text" 
                                            className="w-full bg-gray-50 dark:bg-black/20 rounded-xl px-3 py-2.5 text-xs font-bold dark:text-white outline-none border border-transparent focus:border-indigo-500/30 transition-all"
                                            placeholder="Лосось"
                                            value={item.ingredientName}
                                            onChange={e => updateStagedItem(item.id!, 'ingredientName', e.target.value)}
                                        />
                                        <select 
                                            className="w-full bg-gray-50 dark:bg-black/20 rounded-xl px-2 py-2.5 text-[10px] font-black dark:text-white outline-none appearance-none text-center"
                                            value={item.unit}
                                            onChange={e => updateStagedItem(item.id!, 'unit', e.target.value)}
                                        >
                                            <option value="кг">кг</option>
                                            <option value="г">г</option>
                                            <option value="л">л</option>
                                            <option value="мл">мл</option>
                                            <option value="шт">шт</option>
                                            <option value="упак">уп</option>
                                        </select>
                                        <input 
                                            type="text" 
                                            inputMode="decimal"
                                            className="w-full bg-gray-50 dark:bg-black/20 rounded-xl px-2 py-2.5 text-xs font-black dark:text-white outline-none border border-transparent focus:border-indigo-500/30 text-center"
                                            placeholder="0.00"
                                            value={item.amount}
                                            onChange={e => updateStagedItem(item.id!, 'amount', e.target.value)}
                                        />
                                        <button 
                                            onClick={() => removeStagedItem(item.id!)} 
                                            className={`text-gray-300 hover:text-red-500 transition active:scale-90 ${stagedItems.length === 1 ? 'opacity-0 pointer-events-none' : ''}`}
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4"><path d="M6 18L18 6M6 6l12 12" /></svg>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <button onClick={addStagedItem} className="w-full py-3 border-2 border-dashed border-gray-100 dark:border-white/5 rounded-2xl flex items-center justify-center gap-2 text-sky-500 hover:bg-sky-50 dark:hover:bg-sky-500/5 transition active:scale-[0.98]">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                            <span className="text-[9px] font-black uppercase tracking-widest">Добавить строку</span>
                        </button>

                        <div className="pt-2 space-y-4">
                            <div className="space-y-1">
                                <label className="text-[9px] font-black text-gray-400 uppercase ml-3 tracking-widest">Общий комментарий</label>
                                <textarea 
                                    className="w-full bg-gray-50 dark:bg-black/20 rounded-2xl px-4 py-3 text-sm dark:text-white outline-none resize-none h-16 border border-transparent focus:border-indigo-500/20"
                                    placeholder="Детали для всего акта (опц.)..."
                                    value={globalComment}
                                    onChange={e => setGlobalComment(e.target.value)}
                                />
                            </div>

                            <div className="flex gap-3">
                                <div 
                                    onClick={() => fileInputRef.current?.click()}
                                    className={`flex-1 h-14 rounded-2xl border-2 border-dashed flex items-center justify-center gap-2 cursor-pointer transition-all ${actPhoto ? 'border-emerald-500 bg-emerald-500/5' : 'border-gray-200 dark:border-white/10 hover:border-indigo-400'}`}
                                >
                                    {isUploadingPhoto ? (
                                        <div className="animate-spin text-indigo-500">⏳</div>
                                    ) : actPhoto ? (
                                        <div className="flex items-center gap-2 text-emerald-600 font-black text-[9px] uppercase">✅ Фото добавлено</div>
                                    ) : (
                                        <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">📷 Фото подтверждение</span>
                                    )}
                                </div>
                                <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handlePhotoUpload} />
                            </div>

                            <button onClick={handleSave} className="w-full py-5 bg-indigo-600 text-white font-black rounded-3xl shadow-xl shadow-indigo-600/30 active:scale-95 transition-all text-[11px] tracking-[0.2em] uppercase">
                                Подтвердить списание ({stagedItems.filter(i => i.ingredientName && i.amount).length})
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-4 pb-20">
                        {Object.keys(groupedData).length === 0 ? (
                            <div className="text-center py-20 opacity-40 flex flex-col items-center">
                                <span className="text-7xl mb-6 grayscale">📂</span>
                                <h3 className="font-black dark:text-white uppercase tracking-widest text-xs">Архив пуст</h3>
                                <p className="text-[10px] text-gray-400 mt-2 uppercase">Здесь появятся папки с отчетами</p>
                            </div>
                        ) : (
                            Object.entries(groupedData).map(([month, categories]) => {
                                const isMonthExpanded = expandedMonth === month;
                                const totalMonthItems = Object.values(categories).flat().length;

                                return (
                                    <div key={month} className="animate-slide-up">
                                        <div 
                                            onClick={() => setExpandedMonth(isMonthExpanded ? null : month)}
                                            className={`p-5 rounded-[2.5rem] border transition-all duration-300 cursor-pointer flex items-center justify-between group relative overflow-hidden ${isMonthExpanded ? 'bg-white dark:bg-[#1e1e24] shadow-xl border-gray-100 dark:border-white/10 mb-4' : 'bg-white/60 dark:bg-white/5 border-transparent shadow-sm'}`}
                                        >
                                            <div className="flex items-center gap-4 relative z-10">
                                                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl transition-all duration-500 ${isMonthExpanded ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30 -rotate-3' : 'bg-gray-100 dark:bg-white/5 text-gray-400 group-hover:bg-indigo-100 group-hover:text-indigo-600'}`}>
                                                    {isMonthExpanded ? '📂' : '📁'}
                                                </div>
                                                <div>
                                                    <h3 className={`font-black uppercase text-sm tracking-tight transition-colors ${isMonthExpanded ? 'text-gray-900 dark:text-white' : 'text-gray-500'}`}>{month}</h3>
                                                    <p className="text-[9px] font-black text-gray-400 uppercase mt-0.5 tracking-widest">{totalMonthItems} записей</p>
                                                </div>
                                            </div>
                                            
                                            <div className="flex items-center gap-3 relative z-10">
                                                {isAdmin && (
                                                    <button 
                                                        onClick={(e) => exportMonthToExcel(month, e)}
                                                        className={`p-2.5 rounded-xl transition-all active:scale-90 ${isMonthExpanded ? 'bg-emerald-500 text-white shadow-md' : 'bg-gray-100 dark:bg-white/5 text-gray-400'}`}
                                                        title="Экспорт в Excel"
                                                    >
                                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1M16 10l-4 4m0 0l-4-4m4 4V4" /></svg>
                                                    </button>
                                                )}
                                                <svg className={`w-5 h-5 transition-transform duration-500 ${isMonthExpanded ? 'rotate-180 text-indigo-500' : 'text-gray-300'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
                                            </div>
                                        </div>

                                        {isMonthExpanded && (
                                            <div className="space-y-2 pl-4 pr-1 animate-fade-in">
                                                {REASONS.map(reasonInfo => {
                                                    const itemsInCategory = categories[reasonInfo.value];
                                                    if (itemsInCategory.length === 0) return null;
                                                    const isCatExpanded = expandedCategory === `${month}_${reasonInfo.value}`;

                                                    return (
                                                        <div key={reasonInfo.value} className="space-y-2">
                                                            <div 
                                                                onClick={() => setExpandedCategory(isCatExpanded ? null : `${month}_${reasonInfo.value}`)}
                                                                className={`p-4 rounded-[1.8rem] border transition-all cursor-pointer flex items-center justify-between ${isCatExpanded ? 'bg-gray-50 dark:bg-black/20 border-gray-200 dark:border-white/5' : 'bg-white dark:bg-[#1e1e24] border-transparent shadow-sm'}`}
                                                            >
                                                                <div className="flex items-center gap-3">
                                                                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm text-white ${reasonInfo.color} shadow-sm`}>
                                                                        {reasonInfo.icon}
                                                                    </div>
                                                                    <span className="font-bold text-xs uppercase tracking-tight dark:text-white">{reasonInfo.label}</span>
                                                                    <span className="px-2 py-0.5 rounded-lg bg-gray-100 dark:bg-white/5 text-[9px] font-black text-gray-400">{itemsInCategory.length}</span>
                                                                </div>
                                                                <svg className={`w-4 h-4 text-gray-300 transition-transform ${isCatExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
                                                            </div>

                                                            {isCatExpanded && (
                                                                <div className="space-y-2 pl-3 animate-slide-up pb-2">
                                                                    {itemsInCategory.map((item, idx) => (
                                                                        <div key={idx} className="bg-white dark:bg-[#1e1e24] p-4 rounded-3xl shadow-sm border border-gray-50 dark:border-white/5 flex gap-4 transition-all hover:border-indigo-500/20 relative group">
                                                                            {(item.photoUrls?.small || item.photoUrl) && (
                                                                                <div className="w-14 h-14 rounded-2xl overflow-hidden flex-shrink-0 bg-gray-100 cursor-pointer shadow-sm" onClick={() => window.open(item.photoUrls?.original || item.photoUrl, '_blank')}>
                                                                                    <img src={item.photoUrls?.small || item.photoUrl} className="w-full h-full object-cover" />
                                                                                </div>
                                                                            )}
                                                                            <div className="flex-1 min-w-0 flex flex-col justify-center pr-8">
                                                                                <div className="flex justify-between items-start">
                                                                                    <h5 className="font-bold text-[13px] dark:text-white truncate uppercase tracking-tight leading-tight">{item.ingredientName}</h5>
                                                                                    <span className="font-black text-indigo-600 dark:text-indigo-400 text-[13px] whitespace-nowrap ml-2">{item.amount} {item.unit}</span>
                                                                                </div>
                                                                                {item.comment && (
                                                                                    <p className="text-[10px] text-gray-400 mt-1 line-clamp-2 leading-relaxed italic">"{item.comment}"</p>
                                                                                )}
                                                                            </div>
                                                                            {isAdmin && (
                                                                                <button 
                                                                                    onClick={(e) => { e.stopPropagation(); handleDeleteLog(item.logId); }}
                                                                                    className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-red-50 dark:bg-red-500/10 text-red-500 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity active:scale-90"
                                                                                >
                                                                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                                                                                </button>
                                                                            )}
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default Wastage;
