
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
    const [viewMode, setViewMode] = useState<'list' | 'filling' | 'admin' | 'manage'>('list');
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
            else setActiveCycle(null);
        } catch (e) {
            addToast("Ошибка загрузки", "error");
        } finally {
            setIsLoading(false);
        }
    };

    // --- ADMIN MANAGEMENT LOGIC ---
    const resetInventory = async () => {
        if (!activeCycle) return;
        if (!confirm("ВНИМАНИЕ! Это полностью удалит текущие бланки и все введенные остатки. Это действие нельзя отменить. Продолжить?")) return;

        try {
            setIsSaving(true);
            // In a real app, we might have a specific delete endpoint, 
            // but here we can just update the cycle as finalized or remove it.
            // Let's assume finalizing effectively "clears" it from active status.
            const updated = { ...activeCycle, isFinalized: true };
            await apiFetch('/api/inventory/cycle', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updated)
            });
            setActiveCycle(null);
            setViewMode('list');
            addToast("Инвентаризация сброшена", "success");
            loadData();
        } catch (e) {
            addToast("Ошибка при сбросе", "error");
        } finally {
            setIsSaving(false);
        }
    };

    const renameSheet = (id: string) => {
        if (!activeCycle) return;
        const sheet = activeCycle.sheets.find(s => s.id === id);
        const newTitle = prompt("Введите новое название станции:", sheet?.title);
        if (newTitle && newTitle.trim()) {
            const updated = { ...activeCycle };
            updated.sheets = updated.sheets.map(s => s.id === id ? { ...s, title: newTitle.trim() } : s);
            setActiveCycle(updated);
            saveCycleDebounced(updated);
        }
    };

    const deleteSheet = (id: string) => {
        if (!activeCycle) return;
        if (!confirm("Удалить этот бланк и все данные в нем?")) return;
        const updated = { ...activeCycle };
        updated.sheets = updated.sheets.filter(s => s.id !== id);
        setActiveCycle(updated);
        saveCycleDebounced(updated);
        addToast("Бланк удален", "info");
    };

    const addNewSheet = () => {
        if (!activeCycle) return;
        const name = prompt("Название новой станции (напр. Бар):");
        if (name && name.trim()) {
            const newSheet: InventorySheet = {
                id: uuidv4(),
                title: name.trim(),
                items: [],
                status: 'active'
            };
            const updated = { ...activeCycle };
            updated.sheets.push(newSheet);
            setActiveCycle(updated);
            saveCycleDebounced(updated);
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
                    !['наименование', 'товар', 'итого', 'подпись', 'станция'].some(k => i.name.toLowerCase().includes(k))
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
        } else if (viewMode === 'admin' || viewMode === 'manage') {
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
                                {viewMode === 'list' ? 'Инвентаризация' : (viewMode === 'filling' ? 'Бланк' : (viewMode === 'admin' ? 'Сводная' : 'Управление'))}
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
                                <>
                                    <button onClick={() => setViewMode('admin')} className="w-10 h-10 rounded-full bg-white dark:bg-[#1e1e24] shadow-sm flex items-center justify-center dark:text-white border border-gray-100 dark:border-white/5 active:scale-95 transition">
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0m-9.75 0h9.75" /></svg>
                                    </button>
                                    <button onClick={() => setViewMode('manage')} className="w-10 h-10 rounded-full bg-white dark:bg-[#1e1e24] shadow-sm flex items-center justify-center dark:text-white border border-gray-100 dark:border-white/5 active:scale-95 transition">
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12a7.5 7.5 0 1115 0 7.5 7.5 0 01-15 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                    </button>
                                </>
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

                {viewMode === 'manage' && activeCycle && (
                    <div className="animate-slide-up space-y-6 pb-20">
                         <div className="bg-red-50 dark:bg-red-500/10 p-5 rounded-3xl border border-red-100 dark:border-red-500/20 mb-6">
                            <h3 className="text-red-600 dark:text-red-400 font-black uppercase text-xs mb-2">Опасная зона</h3>
                            <p className="text-[10px] text-red-500/70 mb-4 font-medium uppercase leading-tight">Удаление текущих данных позволит загрузить новый Excel-файл</p>
                            <button 
                                onClick={resetInventory}
                                className="w-full py-3.5 bg-red-600 text-white font-black rounded-2xl shadow-lg shadow-red-600/20 active:scale-95 transition flex items-center justify-center gap-2 uppercase text-[10px] tracking-widest"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                                Сбросить всё
                            </button>
                         </div>

                         <div className="space-y-3">
                             <div className="flex items-center justify-between px-1">
                                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Управление бланками</h3>
                                <button onClick={addNewSheet} className="text-[10px] font-black text-sky-500 uppercase">+ Новый бланк</button>
                             </div>
                             {activeCycle.sheets.map(sheet => (
                                 <div key={sheet.id} className="bg-white dark:bg-[#1e1e24] p-4 rounded-3xl border border-gray-100 dark:border-white/5 flex items-center justify-between shadow-sm">
                                     <div className="flex flex-col">
                                         <span className="text-xs font-black dark:text-white">{sheet.title}</span>
                                         <span className="text-[9px] text-gray-400 uppercase font-bold">{sheet.items.length} позиций</span>
                                     </div>
                                     <div className="flex gap-1">
                                         <button onClick={() => renameSheet(sheet.id)} className="w-9 h-9 rounded-xl bg-gray-50 dark:bg-white/5 flex items-center justify-center text-gray-400 hover:text-sky-500 transition">
                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" /></svg>
                                         </button>
                                         <button onClick={() => deleteSheet(sheet.id)} className="w-9 h-9 rounded-xl bg-gray-50 dark:bg-white/5 flex items-center justify-center text-gray-400 hover:text-red-500 transition">
                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                                         </button>
                                     </div>
                                 </div>
                             ))}
                         </div>
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
