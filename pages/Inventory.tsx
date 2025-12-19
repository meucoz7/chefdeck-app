
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { v4 as uuidv4 } from 'uuid';
import * as XLSX from 'xlsx';
import { InventoryCycle, InventorySheet, InventoryItem } from '../types';
import { useToast } from '../context/ToastContext';
import { useTelegram } from '../context/TelegramContext';
import { apiFetch } from '../services/api';

interface ImportSheet {
    name: string;
    data: any[][];
    isSummary: boolean;
    isSelected: boolean;
    mapping: { name: number; unit: number };
}

const UNITS = ['кг', 'г', 'л', 'мл', 'шт', 'упак'];

const Inventory: React.FC = () => {
    const navigate = useNavigate();
    const { isAdmin, user } = useTelegram();
    const { addToast } = useToast();

    const [cycles, setCycles] = useState<InventoryCycle[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [activeCycle, setActiveCycle] = useState<InventoryCycle | null>(null);
    const [viewMode, setViewMode] = useState<'list' | 'filling' | 'admin'>('list');
    const [activeSheetId, setActiveSheetId] = useState<string | null>(null);
    
    // Import state
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [importSheets, setImportSheets] = useState<ImportSheet[]>([]);
    
    // Filling state
    const [searchTerm, setSearchTerm] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    
    // Add Item Modal state
    const [isAddingItem, setIsAddingItem] = useState(false);
    const [newItemName, setNewItemName] = useState('');
    const [newItemUnit, setNewItemUnit] = useState('кг');

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setIsLoading(true);
        try {
            const res = await apiFetch('/api/inventory');
            const data = await res.json();
            setCycles(data);
            const active = data.find((c: any) => !c.isFinalized);
            if (active) setActiveCycle(active);
        } catch (e) {
            addToast("Ошибка загрузки", "error");
        } finally {
            setIsLoading(false);
        }
    };

    // --- EXCEL IMPORT LOGIC ---
    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
            const bstr = evt.target?.result;
            const wb = XLSX.read(bstr, { type: 'binary' });
            const sheets: ImportSheet[] = wb.SheetNames.map((name, idx) => {
                const data = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1 }) as any[][];
                return { 
                    name, 
                    data, 
                    isSummary: name.toLowerCase().includes('свод') || idx === 0,
                    isSelected: true,
                    mapping: { name: 0, unit: 1 } 
                };
            });
            setImportSheets(sheets);
            setIsImportModalOpen(true);
        };
        reader.readAsBinaryString(file);
    };

    const confirmImport = async () => {
        if (importSheets.length === 0) return;
        
        const newSheets: InventorySheet[] = importSheets
            .filter(s => s.isSelected && !s.isSummary)
            .map(s => {
                const items: InventoryItem[] = s.data.slice(1).map(row => ({
                    id: uuidv4(),
                    name: String(row[s.mapping.name] || '').trim(),
                    unit: String(row[s.mapping.unit] || 'кг').trim()
                })).filter(i => 
                    i.name.length > 2 && 
                    i.unit.length >= 1 && 
                    !['наименование', 'товар', 'итого', 'подпись'].some(k => i.name.toLowerCase().includes(k))
                );

                return {
                    id: uuidv4(),
                    title: s.name,
                    items,
                    status: 'active' as const
                };
            });

        const newCycle: InventoryCycle = {
            id: uuidv4(),
            date: Date.now(),
            sheets: newSheets,
            isFinalized: false,
            createdBy: user?.first_name || 'Admin'
        };

        try {
            await apiFetch('/api/inventory/cycle', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newCycle)
            });
            setActiveCycle(newCycle);
            setCycles([newCycle, ...cycles]);
            setIsImportModalOpen(false);
            addToast("Инвентаризация начата", "success");
        } catch (e) {
            addToast("Ошибка создания", "error");
        }
    };

    // --- FILLING LOGIC ---
    const handleOpenSheet = async (sheetId: string) => {
        if (!activeCycle) return;
        
        try {
            const res = await apiFetch('/api/inventory/lock', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    cycleId: activeCycle.id, 
                    sheetId, 
                    user: { id: user?.id, name: user?.first_name } 
                })
            });
            const data = await res.json();
            if (!data.success) {
                addToast(`Эта станция уже занята: ${data.lockedBy.name}`, "error");
                return;
            }
            setActiveSheetId(sheetId);
            setViewMode('filling');
        } catch (e) {
            addToast("Ошибка доступа", "error");
        }
    };

    const updateActual = (itemId: string, val: string) => {
        if (!activeCycle || !activeSheetId) return;
        
        const cleanVal = val.replace(',', '.');
        if (cleanVal !== '' && !/^-?\d*\.?\d*$/.test(cleanVal)) return;

        const updatedCycle = { ...activeCycle };
        const sheet = updatedCycle.sheets.find(s => s.id === activeSheetId);
        if (sheet) {
            sheet.items = sheet.items.map(i => i.id === itemId ? { ...i, actual: cleanVal === '' ? undefined : Number(cleanVal) } : i);
            sheet.updatedAt = Date.now();
            sheet.updatedBy = user?.first_name;
            setActiveCycle(updatedCycle);
            saveCycleDebounced(updatedCycle);
        }
    };

    const timerRef = useRef<any>(null);
    const saveCycleDebounced = (cycle: InventoryCycle) => {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(async () => {
            setIsSaving(true);
            try {
                await apiFetch('/api/inventory/cycle', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(cycle)
                });
            } finally {
                setIsSaving(false);
            }
        }, 1000);
    };

    const submitSheet = async () => {
        if (!activeCycle || !activeSheetId) return;
        const sheet = activeCycle.sheets.find(s => s.id === activeSheetId);
        if (!sheet) return;

        const empty = sheet.items.filter(i => i.actual === undefined).length;
        if (empty > 0) {
            if (!confirm(`Осталось ${empty} незаполненных позиций. Продолжить?`)) return;
        }

        const updatedCycle = { ...activeCycle };
        const target = updatedCycle.sheets.find(s => s.id === activeSheetId);
        if (target) target.status = 'submitted';
        
        try {
            await apiFetch('/api/inventory/cycle', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedCycle)
            });
            await apiFetch('/api/inventory/unlock', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cycleId: activeCycle.id, sheetId: activeSheetId })
            });
            setActiveSheetId(null);
            setViewMode('list');
            addToast("Бланк сдан!", "success");
            loadData();
        } catch (e) {
            addToast("Ошибка сохранения", "error");
        }
    };

    // --- CONSOLIDATED VIEW (ADMIN) ---
    const consolidatedData = useMemo(() => {
        if (!activeCycle) return [];
        const map = new Map<string, { name: string, unit: string, totalActual: number }>();
        
        activeCycle.sheets.forEach(sheet => {
            sheet.items.forEach(item => {
                const key = `${item.name.toLowerCase().trim()}_${item.unit.toLowerCase().trim()}`;
                if (!map.has(key)) {
                    map.set(key, { name: item.name, unit: item.unit, totalActual: 0 });
                }
                const entry = map.get(key)!;
                entry.totalActual += item.actual || 0;
            });
        });
        return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
    }, [activeCycle]);

    const exportConsolidated = () => {
        if (!activeCycle) return;
        const data = consolidatedData.map(d => ({
            "Наименование": d.name,
            "Ед.изм": d.unit,
            "Итого факт": d.totalActual
        }));
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Сводная");
        XLSX.writeFile(wb, `Inv_Summary_${new Date(activeCycle.date).toLocaleDateString()}.xlsx`);
    };

    const handleBack = () => {
        if (viewMode === 'filling') {
            if (confirm("Выйти из бланка?")) {
                if (activeCycle && activeSheetId) {
                    apiFetch('/api/inventory/unlock', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ cycleId: activeCycle.id, sheetId: activeSheetId })
                    });
                }
                setViewMode('list');
                setActiveSheetId(null);
            }
        } else if (viewMode === 'admin') {
            setViewMode('list');
        } else {
            navigate('/');
        }
    };

    const filteredItems = useMemo(() => {
        if (!activeSheetId || !activeCycle) return [];
        const sheet = activeCycle.sheets.find(s => s.id === activeSheetId);
        if (!sheet) return [];
        if (!searchTerm) return sheet.items;
        return sheet.items.filter(i => i.name.toLowerCase().includes(searchTerm.toLowerCase()));
    }, [activeCycle, activeSheetId, searchTerm]);

    const handleAddItem = () => {
        if (!newItemName.trim() || !activeCycle || !activeSheetId) return;
        
        const newItem: InventoryItem = { 
            id: uuidv4(), 
            name: newItemName.trim(), 
            unit: newItemUnit 
        };
        
        const updatedCycle = { ...activeCycle };
        const sheet = updatedCycle.sheets.find(s => s.id === activeSheetId);
        if (sheet) {
            sheet.items.push(newItem);
            setActiveCycle(updatedCycle);
            saveCycleDebounced(updatedCycle);
            
            // Reset
            setNewItemName('');
            setIsAddingItem(false);
            addToast("Добавлено", "success");
        }
    };

    if (isLoading) return <div className="flex items-center justify-center h-screen"><div className="animate-spin text-sky-500">⏳</div></div>;

    return (
        <div className="pb-24 animate-fade-in min-h-screen bg-[#f2f4f7] dark:bg-[#0f1115]">
            {/* Header */}
            <div className="pt-safe-top px-5 pb-4 sticky top-0 z-50 bg-[#f2f4f7]/95 dark:bg-[#0f1115]/95 backdrop-blur-md border-b border-gray-100 dark:border-white/5">
                <div className="flex items-center justify-between pt-4">
                    <div className="flex items-center gap-3">
                        <button onClick={handleBack} className="w-10 h-10 rounded-full bg-white dark:bg-[#1e1e24] shadow-sm flex items-center justify-center dark:text-white border border-gray-100 dark:border-white/5 active:scale-95 transition">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
                        </button>
                        <div>
                            <h1 className="text-xl font-black text-gray-900 dark:text-white leading-none">
                                {viewMode === 'list' ? 'Инвентаризация' : (viewMode === 'filling' ? 'Бланк' : 'Сводная')}
                            </h1>
                            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">
                                {activeCycle ? new Date(activeCycle.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }) : 'Создайте новую'}
                            </p>
                        </div>
                    </div>
                    {viewMode === 'list' && isAdmin && (
                        <div className="flex gap-2">
                             <input type="file" id="xl-import" className="hidden" accept=".xlsx,.xls" onChange={handleFileUpload} />
                             <label htmlFor="xl-import" className="w-10 h-10 rounded-full bg-sky-500 text-white flex items-center justify-center shadow-lg active:scale-95 transition cursor-pointer">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
                             </label>
                             {activeCycle && (
                                <button onClick={() => setViewMode('admin')} className="w-10 h-10 rounded-full bg-white dark:bg-[#1e1e24] shadow-sm flex items-center justify-center dark:text-white border border-gray-100 dark:border-white/5 active:scale-95 transition">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0m-9.75 0h9.75" /></svg>
                                </button>
                             )}
                        </div>
                    )}
                </div>
                {viewMode === 'filling' && (
                    <div className="mt-4 relative">
                        <input 
                            type="text" 
                            className="w-full bg-white dark:bg-[#1e1e24] rounded-xl py-2.5 pl-10 pr-4 text-sm outline-none border border-gray-100 dark:border-white/5 dark:text-white shadow-sm"
                            placeholder="Поиск по бланку..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-gray-400 absolute left-3.5 top-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                    </div>
                )}
            </div>

            <div className="px-5 pt-6">
                {viewMode === 'list' && (
                    <div className="space-y-6">
                        {!activeCycle ? (
                            <div className="text-center py-20 opacity-50 flex flex-col items-center">
                                <span className="text-6xl mb-4">📊</span>
                                <h3 className="font-bold dark:text-white text-lg">Инвентаризации не начаты</h3>
                                <p className="text-xs text-gray-400 mt-2 px-10">Загрузите Excel-файл с товарами, чтобы начать снятие остатков</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Станции / Бланки</h3>
                                {activeCycle.sheets.map(sheet => {
                                    const filled = sheet.items.filter(i => i.actual !== undefined).length;
                                    const total = sheet.items.length;
                                    const pct = Math.round((filled/total)*100);
                                    
                                    return (
                                        <div 
                                            key={sheet.id}
                                            onClick={() => handleOpenSheet(sheet.id)}
                                            className="bg-white dark:bg-[#1e1e24] p-4 rounded-3xl shadow-sm border border-gray-100 dark:border-white/5 active:scale-[0.98] transition cursor-pointer flex items-center justify-between group overflow-hidden relative"
                                        >
                                            <div className="absolute bottom-0 left-0 h-1 bg-sky-500/20" style={{ width: `${pct}%` }}></div>
                                            <div className="flex items-center gap-4 relative z-10">
                                                <div className={`w-11 h-11 rounded-2xl flex items-center justify-center text-xl ${sheet.status === 'submitted' ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20' : 'bg-sky-100 text-sky-600 dark:bg-sky-500/20'}`}>
                                                    {sheet.status === 'submitted' ? '✅' : '📦'}
                                                </div>
                                                <div>
                                                    <h4 className="font-bold text-gray-900 dark:text-white">{sheet.title}</h4>
                                                    <p className="text-[10px] text-gray-400 font-bold uppercase">{filled} / {total} позиций • {pct}%</p>
                                                </div>
                                            </div>
                                            {sheet.lockedBy && <span className="text-[8px] bg-red-100 text-red-600 px-2 py-1 rounded-full font-black uppercase">🔒 {sheet.lockedBy.name}</span>}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {viewMode === 'filling' && (
                    <div className="space-y-3 pb-32">
                        {filteredItems.map(item => (
                            <div key={item.id} className="bg-white dark:bg-[#1e1e24] p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-white/5 flex items-center justify-between">
                                <div className="flex-1 min-w-0 pr-4">
                                    <h4 className="font-bold text-gray-900 dark:text-white truncate text-sm">{item.name}</h4>
                                    <p className="text-[9px] text-gray-400 font-black uppercase mt-0.5">{item.unit}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <input 
                                        type="text" 
                                        inputMode="decimal"
                                        className="w-24 bg-gray-50 dark:bg-black/40 border border-transparent focus:border-sky-500 rounded-xl px-2 py-3 text-center font-black text-lg dark:text-white outline-none transition-all shadow-inner"
                                        placeholder="0"
                                        value={item.actual ?? ''}
                                        onChange={e => updateActual(item.id, e.target.value)}
                                    />
                                </div>
                            </div>
                        ))}
                        <button onClick={() => setIsAddingItem(true)} className="w-full py-4 rounded-2xl border-2 border-dashed border-gray-200 dark:border-white/10 text-gray-400 text-xs font-black uppercase tracking-widest active:bg-gray-50 transition">+ Добавить в бланк</button>
                        <div className="fixed bottom-6 left-4 right-4 z-40 bg-[#f2f4f7]/80 dark:bg-[#0f1115]/80 backdrop-blur-md p-2 rounded-3xl">
                             <button onClick={submitSheet} className="w-full py-4 bg-gray-900 dark:bg-white text-white dark:text-black font-black rounded-2xl shadow-2xl active:scale-95 transition-all flex items-center justify-center gap-2 uppercase text-xs tracking-widest">
                                {isSaving ? '📦 Сохранение...' : '🚀 Сдать бланк'}
                             </button>
                        </div>
                    </div>
                )}

                {viewMode === 'admin' && (
                    <div className="space-y-6 pb-20">
                         <div className="flex items-center justify-between">
                            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Итоговая сводная</h3>
                            <button onClick={exportConsolidated} className="text-[9px] font-black text-sky-500 uppercase border-2 border-sky-500 px-3 py-1.5 rounded-full active:scale-95 transition">Экспорт .XLSX</button>
                         </div>
                         <div className="bg-white dark:bg-[#1e1e24] rounded-3xl shadow-xl border border-gray-100 dark:border-white/5 overflow-hidden">
                             <div className="overflow-x-auto">
                                 <table className="w-full text-left border-collapse">
                                     <thead className="bg-gray-50 dark:bg-black/40 text-[9px] font-black text-gray-400 uppercase tracking-widest">
                                         <tr>
                                             <th className="px-5 py-4">Наименование товара</th>
                                             <th className="px-2 py-4">Ед.</th>
                                             <th className="px-5 py-4 text-right">Сумма факт</th>
                                         </tr>
                                     </thead>
                                     <tbody className="text-sm divide-y divide-gray-50 dark:divide-white/5">
                                         {consolidatedData.map((d, i) => (
                                             <tr key={i} className="hover:bg-gray-50 dark:hover:bg-white/[0.02] transition-colors">
                                                 <td className="px-5 py-3.5 font-bold text-gray-800 dark:text-gray-200">{d.name}</td>
                                                 <td className="px-2 py-3.5 opacity-40 uppercase font-black text-[10px]">{d.unit}</td>
                                                 <td className="px-5 py-3.5 text-right font-mono font-black text-sky-500">{d.totalActual.toFixed(3).replace(/\.?0+$/, '')}</td>
                                             </tr>
                                         ))}
                                     </tbody>
                                 </table>
                             </div>
                         </div>
                    </div>
                )}
            </div>

            {/* IMPORT MODAL */}
            {isImportModalOpen && createPortal(
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fade-in">
                    <div className="bg-white dark:bg-[#1e1e24] w-full max-w-sm rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
                        <div className="p-6 border-b border-gray-100 dark:border-white/5 flex justify-between items-center">
                            <div>
                                <h2 className="text-xl font-black dark:text-white leading-none">Импорт данных</h2>
                                <p className="text-[9px] text-gray-400 font-bold uppercase mt-2">Выберите листы и сводную</p>
                            </div>
                            <button onClick={() => setIsImportModalOpen(false)} className="w-8 h-8 rounded-full bg-gray-100 dark:bg-white/5 flex items-center justify-center">✕</button>
                        </div>
                        <div className="p-4 overflow-y-auto space-y-4 no-scrollbar">
                            {importSheets.map((s, i) => (
                                <div key={i} className={`p-4 rounded-2xl border-2 transition-all ${s.isSelected ? (s.isSummary ? 'border-amber-500 bg-amber-500/5' : 'border-sky-500 bg-sky-500/5') : 'border-gray-100 dark:border-white/5 opacity-50'}`}>
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-3">
                                            <input type="checkbox" checked={s.isSelected} onChange={e => {
                                                const news = [...importSheets];
                                                news[i].isSelected = e.target.checked;
                                                setImportSheets(news);
                                            }} className="w-5 h-5 rounded-lg" />
                                            <h4 className="font-bold text-sm dark:text-white truncate max-w-[150px]">{s.name}</h4>
                                        </div>
                                        <button 
                                            onClick={() => {
                                                const news = importSheets.map((sh, idx) => ({ ...sh, isSummary: idx === i }));
                                                setImportSheets(news);
                                            }}
                                            className={`px-2 py-1 rounded-md text-[8px] font-black uppercase transition ${s.isSummary ? 'bg-amber-500 text-white' : 'bg-gray-100 dark:bg-white/10 text-gray-400'}`}
                                        >
                                            {s.isSummary ? 'Сводная ⭐' : 'Сделать сводной'}
                                        </button>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="space-y-1">
                                            <label className="text-[8px] font-black text-gray-400 uppercase">Кол. Товар</label>
                                            <input type="number" className="w-full bg-white dark:bg-black/40 rounded-lg p-2 text-xs font-bold dark:text-white border border-gray-100 dark:border-white/5" value={s.mapping.name} onChange={e => {
                                                const news = [...importSheets];
                                                news[i].mapping.name = Number(e.target.value);
                                                setImportSheets(news);
                                            }} />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[8px] font-black text-gray-400 uppercase">Кол. Ед.изм</label>
                                            <input type="number" className="w-full bg-white dark:bg-black/40 rounded-lg p-2 text-xs font-bold dark:text-white border border-gray-100 dark:border-white/5" value={s.mapping.unit} onChange={e => {
                                                const news = [...importSheets];
                                                news[i].mapping.unit = Number(e.target.value);
                                                setImportSheets(news);
                                            }} />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="p-6 bg-gray-50 dark:bg-black/20 flex gap-3">
                            <button onClick={() => setIsImportModalOpen(false)} className="flex-1 py-3.5 font-bold text-gray-500 text-sm uppercase">Отмена</button>
                            <button onClick={confirmImport} className="flex-1 py-3.5 font-black text-white bg-sky-600 rounded-2xl shadow-lg uppercase text-sm tracking-widest active:scale-95 transition">Создать</button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* ADD ITEM MODAL */}
            {isAddingItem && createPortal(
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fade-in" onClick={(e) => e.target === e.currentTarget && setIsAddingItem(false)}>
                    <div className="bg-white dark:bg-[#1e1e24] w-full max-w-sm rounded-[2.5rem] shadow-2xl p-6 animate-slide-up">
                         <div className="flex justify-between items-center mb-6">
                             <h2 className="text-xl font-black dark:text-white leading-none">Новая позиция</h2>
                             <button onClick={() => setIsAddingItem(false)} className="w-8 h-8 rounded-full bg-gray-100 dark:bg-white/5 text-gray-400 flex items-center justify-center">✕</button>
                         </div>
                         
                         <div className="space-y-6">
                             <div>
                                 <label className="text-[9px] font-black text-gray-400 uppercase mb-2 block ml-1">Наименование товара</label>
                                 <input 
                                    autoFocus
                                    type="text" 
                                    className="w-full bg-gray-50 dark:bg-black/40 rounded-2xl px-5 py-4 font-bold dark:text-white outline-none border border-transparent focus:border-sky-500 shadow-inner transition-all" 
                                    placeholder="Напр. Сыр Моцарелла"
                                    value={newItemName}
                                    onChange={e => setNewItemName(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleAddItem()}
                                 />
                             </div>

                             <div>
                                 <label className="text-[9px] font-black text-gray-400 uppercase mb-3 block ml-1">Единица измерения</label>
                                 <div className="flex flex-wrap gap-2">
                                     {UNITS.map(u => (
                                         <button 
                                            key={u}
                                            onClick={() => setNewItemUnit(u)}
                                            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border ${newItemUnit === u ? 'bg-sky-500 text-white border-sky-500 shadow-lg shadow-sky-500/20' : 'bg-gray-50 dark:bg-white/5 text-gray-400 border-transparent hover:bg-gray-100'}`}
                                         >
                                             {u}
                                         </button>
                                     ))}
                                 </div>
                             </div>

                             <div className="pt-2">
                                 <button 
                                    onClick={handleAddItem}
                                    className="w-full py-4 bg-sky-600 text-white font-black rounded-2xl shadow-xl shadow-sky-600/20 active:scale-95 transition-all flex items-center justify-center gap-2 uppercase text-xs tracking-widest"
                                 >
                                    🚀 Добавить в бланк
                                 </button>
                                 <p className="text-[9px] text-gray-400 text-center uppercase font-black tracking-widest mt-4 opacity-50">Вы также можете нажать Enter</p>
                             </div>
                         </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};

export default Inventory;
