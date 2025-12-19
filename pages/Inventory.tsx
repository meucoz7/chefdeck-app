
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { v4 as uuidv4 } from 'uuid';
import * as XLSX from 'xlsx';
import { InventoryCycle, InventorySheet, InventoryItem, InventoryStatus } from '../types';
import { useToast } from '../context/ToastContext';
import { useTelegram } from '../context/TelegramContext';
import { useRecipes } from '../context/RecipeContext';
import { apiFetch } from '../services/api';

const Inventory: React.FC = () => {
    const navigate = useNavigate();
    const { isAdmin, user } = useTelegram();
    const { addToast } = useToast();
    const { recipes } = useRecipes();

    const [cycles, setCycles] = useState<InventoryCycle[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [activeCycle, setActiveCycle] = useState<InventoryCycle | null>(null);
    const [viewMode, setViewMode] = useState<'list' | 'filling' | 'admin'>('list');
    const [activeSheetId, setActiveSheetId] = useState<string | null>(null);
    
    // Admin state
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [importData, setImportData] = useState<{ sheets: { name: string, data: any[][], mapping: any }[] } | null>(null);
    const [currentImportIdx, setCurrentImportIdx] = useState(0);

    // Filling state
    const [searchTerm, setSearchTerm] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [isAddingItem, setIsAddingItem] = useState(false);

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
            const sheets = wb.SheetNames.map(name => {
                const data = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1 }) as any[][];
                return { name, data, mapping: { name: 0, unit: 1, amount: 2 } };
            });
            setImportData({ sheets });
            setIsImportModalOpen(true);
        };
        reader.readAsBinaryString(file);
    };

    const confirmImport = async () => {
        if (!importData) return;
        
        const newSheets: InventorySheet[] = importData.sheets.map(s => {
            const items: InventoryItem[] = s.data.slice(1).map(row => ({
                id: uuidv4(),
                name: String(row[s.mapping.name] || ''),
                unit: String(row[s.mapping.unit] || 'кг'),
                expected: parseFloat(String(row[s.mapping.amount] || '0').replace(',', '.')) || 0
            })).filter(i => i.name.trim().length > 1);

            return {
                id: uuidv4(),
                title: s.name,
                items,
                status: 'active'
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
        
        // Safety Check: Lock sheet
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
        if (cleanVal !== '' && isNaN(Number(cleanVal))) return;

        const numVal = cleanVal === '' ? undefined : Number(cleanVal);

        const updatedCycle = { ...activeCycle };
        const sheet = updatedCycle.sheets.find(s => s.id === activeSheetId);
        if (sheet) {
            sheet.items = sheet.items.map(i => i.id === itemId ? { ...i, actual: numVal } : i);
            sheet.updatedAt = Date.now();
            sheet.updatedBy = user?.first_name;
            setActiveCycle(updatedCycle);
            // Real-time save
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
        const map = new Map<string, { name: string, unit: string, totalActual: number, totalExpected: number, perSheet: any }>();
        
        activeCycle.sheets.forEach(sheet => {
            sheet.items.forEach(item => {
                const key = `${item.name.toLowerCase()}_${item.unit.toLowerCase()}`;
                if (!map.has(key)) {
                    map.set(key, { name: item.name, unit: item.unit, totalActual: 0, totalExpected: 0, perSheet: {} });
                }
                const entry = map.get(key)!;
                entry.totalActual += item.actual || 0;
                entry.totalExpected += item.expected || 0;
                entry.perSheet[sheet.id] = item.actual || 0;
            });
        });
        return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
    }, [activeCycle]);

    const exportConsolidated = () => {
        if (!activeCycle) return;
        const data = consolidatedData.map(d => ({
            "Наименование": d.name,
            "Ед.изм": d.unit,
            "Учет": d.totalExpected,
            "Факт": d.totalActual,
            "Разница": d.totalActual - d.totalExpected
        }));
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Сводная");
        XLSX.writeFile(wb, `Inventory_${new Date(activeCycle.date).toLocaleDateString()}.xlsx`);
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

    const addItemToSheet = (name: string, unit: string) => {
        if (!activeCycle || !activeSheetId) return;
        const newItem: InventoryItem = { id: uuidv4(), name, unit, expected: 0 };
        const updatedCycle = { ...activeCycle };
        const sheet = updatedCycle.sheets.find(s => s.id === activeSheetId);
        if (sheet) {
            sheet.items.push(newItem);
            setActiveCycle(updatedCycle);
            saveCycleDebounced(updatedCycle);
            setIsAddingItem(false);
            addToast("Добавлено в бланк", "success");
        }
    };

    if (isLoading) return <div className="flex items-center justify-center h-screen"><div className="animate-spin text-sky-500">⏳</div></div>;

    return (
        <div className="pb-24 animate-fade-in min-h-screen bg-[#f2f4f7] dark:bg-[#0f1115]">
            {/* Header */}
            <div className="pt-safe-top px-5 pb-4 sticky top-0 z-50 bg-[#f2f4f7]/90 dark:bg-[#0f1115]/90 backdrop-blur-md border-b border-gray-100 dark:border-white/5">
                <div className="flex items-center justify-between pt-4">
                    <div className="flex items-center gap-3">
                        <button onClick={handleBack} className="w-10 h-10 rounded-full bg-white dark:bg-[#1e1e24] shadow-sm flex items-center justify-center dark:text-white border border-gray-100 dark:border-white/5 active:scale-95 transition">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
                        </button>
                        <div>
                            <h1 className="text-xl font-black text-gray-900 dark:text-white leading-none">
                                {viewMode === 'list' ? 'Инвентаризация' : (viewMode === 'filling' ? 'Снятие остатков' : 'Управление')}
                            </h1>
                            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">
                                {activeCycle ? new Date(activeCycle.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }) : 'Нет активной'}
                            </p>
                        </div>
                    </div>
                    {viewMode === 'list' && isAdmin && (
                        <div className="flex gap-2">
                             <input type="file" id="xl-import" className="hidden" accept=".xlsx,.xls" onChange={handleFileUpload} />
                             <label htmlFor="xl-import" className="w-10 h-10 rounded-full bg-green-500 text-white flex items-center justify-center shadow-lg active:scale-95 transition cursor-pointer">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
                             </label>
                             <button onClick={() => setViewMode('admin')} className="w-10 h-10 rounded-full bg-white dark:bg-[#1e1e24] shadow-sm flex items-center justify-center dark:text-white border border-gray-100 dark:border-white/5 active:scale-95 transition">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0m-9.75 0h9.75" /></svg>
                             </button>
                        </div>
                    )}
                </div>
                {viewMode === 'filling' && (
                    <div className="mt-4 relative group">
                        <input 
                            type="text" 
                            className="w-full bg-white dark:bg-[#1e1e24] rounded-xl py-2.5 pl-10 pr-4 text-sm outline-none focus:ring-2 focus:ring-sky-500/20 border border-gray-100 dark:border-white/5 dark:text-white"
                            placeholder="Быстрый поиск в бланке..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-gray-400 absolute left-3.5 top-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                    </div>
                )}
            </div>

            <div className="px-5 pt-6 space-y-4">
                {viewMode === 'list' && (
                    <div className="space-y-6">
                        {!activeCycle ? (
                            <div className="text-center py-20 opacity-50 flex flex-col items-center">
                                <span className="text-5xl mb-4">🧊</span>
                                <h3 className="font-bold dark:text-white">Нет активных инвентаризаций</h3>
                                <p className="text-xs text-gray-400 mt-2">Админ может создать новый бланк через импорт Excel</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Станции</h3>
                                {activeCycle.sheets.map(sheet => (
                                    <div 
                                        key={sheet.id}
                                        onClick={() => handleOpenSheet(sheet.id)}
                                        className="bg-white dark:bg-[#1e1e24] p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-white/5 active:scale-[0.98] transition cursor-pointer flex items-center justify-between"
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl ${sheet.status === 'submitted' ? 'bg-green-100 text-green-600 dark:bg-green-500/20' : 'bg-sky-100 text-sky-600 dark:bg-sky-500/20'}`}>
                                                {sheet.status === 'submitted' ? '✅' : '📦'}
                                            </div>
                                            <div>
                                                <h4 className="font-bold text-gray-900 dark:text-white">{sheet.title}</h4>
                                                <p className="text-[10px] text-gray-400 font-medium">{sheet.items.length} позиций</p>
                                            </div>
                                        </div>
                                        {sheet.lockedBy && <span className="text-[9px] bg-red-100 text-red-600 px-2 py-1 rounded-full font-bold">🔒 {sheet.lockedBy.name}</span>}
                                        {!sheet.lockedBy && sheet.status === 'submitted' && <span className="text-[9px] bg-green-100 text-green-600 px-2 py-1 rounded-full font-bold">СДАНО</span>}
                                    </div>
                                ))}
                            </div>
                        )}
                        {/* ARCHIVE PREVIEW - Restricted to Admin */}
                        {isAdmin && cycles.length > 1 && (
                            <div className="pt-4">
                                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest ml-1 mb-3">История (Админ)</h3>
                                <div className="space-y-3 opacity-60">
                                    {cycles.filter(c => c.id !== activeCycle?.id).map(c => (
                                        <div key={c.id} className="bg-white dark:bg-[#1e1e24] p-4 rounded-2xl border border-gray-100 dark:border-white/5 flex justify-between items-center">
                                            <span className="text-sm font-bold dark:text-white">{new Date(c.date).toLocaleDateString()}</span>
                                            <span className="text-[10px] uppercase font-bold text-gray-400">Архив</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {viewMode === 'filling' && (
                    <div className="space-y-3 pb-20">
                        {filteredItems.map(item => (
                            <div key={item.id} className="bg-white dark:bg-[#1e1e24] p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-white/5 flex items-center justify-between">
                                <div className="flex-1 min-w-0 pr-4">
                                    <h4 className="font-bold text-gray-900 dark:text-white truncate">{item.name}</h4>
                                    <p className="text-[10px] text-gray-400 font-bold uppercase">{item.unit}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <input 
                                        type="text" 
                                        inputMode="decimal"
                                        className="w-20 bg-gray-50 dark:bg-black/40 border border-transparent focus:border-sky-500 rounded-xl px-2 py-3 text-center font-black text-lg dark:text-white outline-none"
                                        placeholder="0"
                                        value={item.actual ?? ''}
                                        onChange={e => updateActual(item.id, e.target.value)}
                                    />
                                </div>
                            </div>
                        ))}
                        <button onClick={() => setIsAddingItem(true)} className="w-full py-4 rounded-2xl border-2 border-dashed border-gray-200 dark:border-white/10 text-gray-400 text-sm font-bold active:bg-gray-50 transition">+ Добавить позицию</button>
                        <div className="fixed bottom-6 left-4 right-4 z-40">
                             <button onClick={submitSheet} className="w-full py-4 bg-gray-900 dark:bg-white text-white dark:text-black font-black rounded-2xl shadow-2xl active:scale-95 transition flex items-center justify-center gap-2">
                                {isSaving ? '📦 Сохранение...' : '🚀 Сдать бланк'}
                             </button>
                        </div>
                    </div>
                )}

                {viewMode === 'admin' && (
                    <div className="space-y-6">
                         <div className="flex items-center justify-between">
                            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Сводная таблица</h3>
                            <button onClick={exportConsolidated} className="text-[10px] font-bold text-sky-500 uppercase border border-sky-500 px-3 py-1 rounded-full">Скачать .XLSX</button>
                         </div>
                         <div className="bg-white dark:bg-[#1e1e24] rounded-2xl shadow-sm border border-gray-100 dark:border-white/5 overflow-hidden">
                             <div className="overflow-x-auto">
                                 <table className="w-full text-left border-collapse">
                                     <thead className="bg-gray-50 dark:bg-black/20 text-[10px] font-bold text-gray-400 uppercase">
                                         <tr>
                                             <th className="px-4 py-3">Товар</th>
                                             <th className="px-2 py-3">Ед</th>
                                             <th className="px-2 py-3 text-right">Учет</th>
                                             <th className="px-2 py-3 text-right">Факт</th>
                                             <th className="px-2 py-3 text-right">Разн</th>
                                         </tr>
                                     </thead>
                                     <tbody className="text-xs divide-y divide-gray-50 dark:divide-white/5">
                                         {consolidatedData.map((d, i) => (
                                             <tr key={i} className="dark:text-white">
                                                 <td className="px-4 py-3 font-bold">{d.name}</td>
                                                 <td className="px-2 py-3 opacity-60 uppercase">{d.unit}</td>
                                                 <td className="px-2 py-3 text-right font-mono">{d.totalExpected}</td>
                                                 <td className="px-2 py-3 text-right font-mono font-black">{d.totalActual}</td>
                                                 <td className={`px-2 py-3 text-right font-mono font-bold ${d.totalActual - d.totalExpected < 0 ? 'text-red-500' : 'text-green-500'}`}>
                                                     {d.totalActual - d.totalExpected > 0 ? '+' : ''}{d.totalActual - d.totalExpected}
                                                 </td>
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
            {isImportModalOpen && importData && createPortal(
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fade-in">
                    <div className="bg-white dark:bg-[#1e1e24] w-full max-w-sm rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
                        <div className="p-6 border-b border-gray-100 dark:border-white/5 flex justify-between items-center">
                            <h2 className="text-xl font-black dark:text-white">Импорт Excel</h2>
                            <button onClick={() => setIsImportModalOpen(false)} className="text-gray-400">✕</button>
                        </div>
                        <div className="p-6 overflow-y-auto space-y-6">
                            <div className="flex bg-gray-100 dark:bg-black/20 p-1 rounded-xl overflow-x-auto no-scrollbar">
                                {importData.sheets.map((s, i) => (
                                    <button 
                                        key={i} 
                                        onClick={() => setCurrentImportIdx(i)}
                                        className={`px-4 py-2 rounded-lg text-[10px] font-bold uppercase transition-all whitespace-nowrap ${currentImportIdx === i ? 'bg-white dark:bg-[#2a2a35] shadow text-black dark:text-white' : 'text-gray-400'}`}
                                    >
                                        {s.name}
                                    </button>
                                ))}
                            </div>
                            
                            <div className="space-y-4">
                                <div className="space-y-1">
                                    <label className="text-[9px] font-bold text-gray-400 uppercase ml-1">Название станции</label>
                                    <input 
                                        type="text" 
                                        className="w-full bg-gray-50 dark:bg-black/20 rounded-xl px-4 py-3 font-bold dark:text-white outline-none border border-transparent focus:border-sky-500"
                                        value={importData.sheets[currentImportIdx].name}
                                        onChange={e => {
                                            const newSheets = [...importData.sheets];
                                            newSheets[currentImportIdx].name = e.target.value;
                                            setImportData({ ...importData, sheets: newSheets });
                                        }}
                                    />
                                </div>
                                <div className="grid grid-cols-3 gap-2">
                                    <div className="space-y-1">
                                        <label className="text-[8px] font-bold text-gray-400 uppercase">Кол. Товар</label>
                                        <input type="number" className="w-full bg-gray-50 dark:bg-black/20 rounded-lg p-2 text-center text-xs font-bold dark:text-white" value={importData.sheets[currentImportIdx].mapping.name} onChange={e => {
                                            const newSheets = [...importData.sheets];
                                            newSheets[currentImportIdx].mapping.name = Number(e.target.value);
                                            setImportData({ ...importData, sheets: newSheets });
                                        }} />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[8px] font-bold text-gray-400 uppercase">Кол. Ед.изм</label>
                                        <input type="number" className="w-full bg-gray-50 dark:bg-black/20 rounded-lg p-2 text-center text-xs font-bold dark:text-white" value={importData.sheets[currentImportIdx].mapping.unit} onChange={e => {
                                            const newSheets = [...importData.sheets];
                                            newSheets[currentImportIdx].mapping.unit = Number(e.target.value);
                                            setImportData({ ...importData, sheets: newSheets });
                                        }} />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[8px] font-bold text-gray-400 uppercase">Кол. Остаток</label>
                                        <input type="number" className="w-full bg-gray-50 dark:bg-black/20 rounded-lg p-2 text-center text-xs font-bold dark:text-white" value={importData.sheets[currentImportIdx].mapping.amount} onChange={e => {
                                            const newSheets = [...importData.sheets];
                                            newSheets[currentImportIdx].mapping.amount = Number(e.target.value);
                                            setImportData({ ...importData, sheets: newSheets });
                                        }} />
                                    </div>
                                </div>
                                <div className="text-[10px] text-gray-400 italic">Столбцы считаются от 0 (A=0, B=1, C=2...)</div>
                            </div>
                        </div>
                        <div className="p-6 bg-gray-50 dark:bg-black/20 flex gap-3">
                            <button onClick={() => setIsImportModalOpen(false)} className="flex-1 py-3 font-bold text-gray-500 bg-gray-100 dark:bg-white/5 rounded-xl">Отмена</button>
                            <button onClick={confirmImport} className="flex-1 py-3 font-bold text-white bg-green-600 rounded-xl shadow-lg">Импортировать</button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* ADD ITEM MODAL */}
            {isAddingItem && createPortal(
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fade-in">
                    <div className="bg-white dark:bg-[#1e1e24] w-full max-w-sm rounded-[2.5rem] shadow-2xl overflow-hidden p-6 animate-slide-up">
                         <h2 className="text-xl font-black dark:text-white mb-6">Добавить в бланк</h2>
                         <div className="space-y-4">
                             <input 
                                autoFocus
                                type="text" 
                                className="w-full bg-gray-50 dark:bg-black/20 rounded-xl px-4 py-3 font-bold dark:text-white outline-none border border-transparent focus:border-sky-500" 
                                placeholder="Название ингредиента"
                                onKeyDown={e => {
                                    if(e.key === 'Enter') {
                                        addItemToSheet(e.currentTarget.value, 'кг');
                                    }
                                }}
                             />
                             <p className="text-[10px] text-gray-400 text-center uppercase tracking-wider">Нажмите Enter для подтверждения</p>
                             <button onClick={() => setIsAddingItem(false)} className="w-full py-3 font-bold text-gray-400">Закрыть</button>
                         </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};

export default Inventory;
