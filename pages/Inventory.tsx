
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { v4 as uuidv4 } from 'uuid';
import * as XLSX from 'xlsx';
import { InventoryCycle, InventorySheet, InventoryItem, GlobalInventoryItem } from '../types';
import { useToast } from '../context/ToastContext';
import { useTelegram } from '../context/TelegramContext';
import { apiFetch } from '../services/api';

// --- TYPES ---

/* Added missing ImportSheet interface to fix errors on lines 138 and 184 */
interface ImportSheet {
    name: string;
    data: any[][];
    isSummary: boolean;
    isSelected: boolean;
    mapping: {
        code: number;
        name: number;
        unit: number;
    };
}

// --- UI COMPONENTS ---

const SkeletonItem = () => (
    <div className="bg-white dark:bg-[#1e1e24] p-4 rounded-3xl border border-gray-100 dark:border-white/5 animate-pulse mb-3">
        <div className="flex justify-between items-center">
            <div className="flex-1">
                <div className="h-4 bg-gray-200 dark:bg-white/10 rounded w-3/4 mb-2"></div>
                <div className="h-3 bg-gray-100 dark:bg-white/5 rounded w-1/4"></div>
            </div>
            <div className="w-20 h-10 bg-gray-100 dark:bg-white/5 rounded-xl"></div>
        </div>
    </div>
);

const InventoryItemRow: React.FC<{
    item: InventoryItem;
    inputValue: string;
    onDelete: (id: string) => void;
    onChange: (id: string, val: string) => void;
    readOnly?: boolean;
}> = ({ item, inputValue, onDelete, onChange, readOnly }) => {
    const [startX, setStartX] = useState(0);
    const [offsetX, setOffsetX] = useState(0);
    const [isSwiped, setIsSwiped] = useState(false);
    const { webApp } = useTelegram();

    const handleTouchStart = (e: React.TouchEvent) => {
        if (readOnly) return;
        setStartX(e.touches[0].clientX);
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (readOnly) return;
        const currentX = e.touches[0].clientX;
        const diff = currentX - startX;
        if (diff < 0) {
            setOffsetX(Math.max(diff, -100));
        } else if (isSwiped && diff > 0) {
            setOffsetX(Math.min(-80 + diff, 0));
        }
    };

    const handleTouchEnd = () => {
        if (readOnly) return;
        if (offsetX < -50) {
            setOffsetX(-80);
            setIsSwiped(true);
            if (webApp?.HapticFeedback) webApp.HapticFeedback.impactOccurred('light');
        } else {
            setOffsetX(0);
            setIsSwiped(false);
        }
    };

    const resetSwipe = () => {
        setOffsetX(0);
        setIsSwiped(false);
    };

    return (
        <div className="relative overflow-hidden rounded-2xl mb-3 group select-none touch-pan-y shadow-sm">
            {!readOnly && (
                <div 
                    className="absolute inset-0 bg-red-500 flex justify-end items-center pr-6 cursor-pointer active:opacity-70 transition-opacity"
                    onClick={() => { onDelete(item.id); resetSwipe(); }}
                >
                    <div className="flex flex-col items-center gap-1 text-white">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                        <span className="text-[8px] font-black uppercase tracking-tighter">Удалить</span>
                    </div>
                </div>
            )}

            <div 
                style={{ transform: `translateX(${offsetX}px)` }}
                className={`relative bg-white dark:bg-[#1e1e24] p-4 flex items-center justify-between border border-gray-100 dark:border-white/5 transition-transform duration-200 ease-out z-10 ${readOnly ? '' : 'cursor-default'}`}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onClick={() => isSwiped && resetSwipe()}
            >
                <div className="flex-1 min-w-0 pr-4">
                    <h4 className="font-bold text-gray-900 dark:text-white truncate text-sm leading-tight">{item.name}</h4>
                    <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[9px] text-gray-400 font-black uppercase">{item.unit}</span>
                        {item.code && <span className="text-[8px] text-gray-300 font-bold bg-gray-50 dark:bg-black/20 px-1 rounded">{item.code}</span>}
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {readOnly ? (
                        <div className="px-4 py-2 bg-gray-50 dark:bg-black/20 rounded-xl text-lg font-black dark:text-white">
                            {inputValue || '0'}
                        </div>
                    ) : (
                        <input 
                            type="text" 
                            inputMode="decimal"
                            className="w-24 bg-gray-50 dark:bg-black/40 border border-transparent focus:border-sky-500 rounded-xl px-2 py-3 text-center font-black text-lg dark:text-white outline-none transition-all shadow-inner"
                            placeholder="0"
                            value={inputValue}
                            onChange={e => onChange(item.id, e.target.value)}
                            onFocus={resetSwipe}
                        />
                    )}
                </div>
            </div>
        </div>
    );
};

// --- MAIN COMPONENT ---

const Inventory: React.FC = () => {
    const navigate = useNavigate();
    const { isAdmin, user } = useTelegram();
    const { addToast } = useToast();

    const [cycles, setCycles] = useState<InventoryCycle[]>([]);
    const [globalItems, setGlobalItems] = useState<GlobalInventoryItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [activeCycle, setActiveCycle] = useState<InventoryCycle | null>(null);
    const [viewMode, setViewMode] = useState<'list' | 'filling' | 'admin' | 'manage' | 'summary'>('list');
    const [activeSheetId, setActiveSheetId] = useState<string | null>(null);
    
    const [inputValues, setInputValues] = useState<Record<string, string>>({});
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [importSheets, setImportSheets] = useState<ImportSheet[]>([]);
    const [importType, setImportType] = useState<'cycle' | 'summary'>('cycle');
    
    const [searchTerm, setSearchTerm] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [isAddingSheet, setIsAddingSheet] = useState(false);
    const [newSheetTitle, setNewSheetTitle] = useState('');
    const [selectedGlobalIds, setSelectedGlobalIds] = useState<Set<string>>(new Set());

    useEffect(() => {
        loadData();
        fetchGlobalItems();
    }, []);

    const fetchGlobalItems = async () => {
        try {
            const res = await apiFetch('/api/inventory/global-items');
            const data = await res.json();
            setGlobalItems(data);
        } catch (e) {}
    };

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
            setTimeout(() => setIsLoading(false), 500); // Small delay for UX
        }
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'cycle' | 'summary') => {
        const file = e.target.files?.[0];
        if (!file) return;
        setImportType(type);
        const reader = new FileReader();
        reader.onload = (evt) => {
            const bstr = evt.target?.result;
            const wb = XLSX.read(bstr, { type: 'binary' });
            const sheets: ImportSheet[] = wb.SheetNames.map((name, idx) => {
                const sheet = wb.Sheets[name];
                const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
                const rowsMeta = sheet['!rows'] || [];
                const visibleData = rawData.filter((_, rowIndex) => !(rowsMeta[rowIndex] && rowsMeta[rowIndex].hidden === true));
                return { 
                    name, 
                    data: visibleData, 
                    isSummary: idx === 0,
                    isSelected: true,
                    mapping: type === 'summary' ? { code: 1, name: 2, unit: 5 } : { code: -1, name: 0, unit: 1 } 
                };
            });
            setImportSheets(sheets);
            setIsImportModalOpen(true);
        };
        reader.readAsBinaryString(file);
    };

    const confirmImport = async () => {
        if (importSheets.length === 0) return;
        setIsSaving(true);
        try {
            if (importType === 'summary') {
                const allNewItems: GlobalInventoryItem[] = [];
                importSheets.filter(s => s.isSelected).forEach(s => {
                    s.data.forEach(row => {
                        const code = String(row[1] || '').trim();
                        const name = String(row[2] || '').trim();
                        const unit = String(row[5] || '').trim();
                        if (code && name && unit && !name.toLowerCase().includes('наименование') && code.length > 1) {
                            allNewItems.push({ botId: '', code, name, unit });
                        }
                    });
                });
                await apiFetch('/api/inventory/global-items/upsert', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ items: allNewItems })
                });
                addToast("База обновлена", "success");
                fetchGlobalItems();
            } else {
                const newSheets: InventorySheet[] = importSheets
                    .filter(s => s.isSelected && !s.isSummary)
                    .map(s => {
                        const items: InventoryItem[] = s.data.map(row => {
                            const name = String(row[s.mapping.name] || '').trim();
                            const unit = String(row[s.mapping.unit] || '').trim();
                            const code = s.mapping.code !== -1 ? String(row[s.mapping.code] || '').trim() : '';
                            if (name && unit && name.length > 2 && !['товар', 'итого', 'наименование'].some(k => name.toLowerCase().includes(k))) {
                                return { id: uuidv4(), code, name, unit };
                            }
                            return null;
                        }).filter(i => i !== null) as InventoryItem[];
                        return { id: uuidv4(), title: s.name, items, status: 'active' as const };
                    });

                const newCycle: InventoryCycle = {
                    id: uuidv4(),
                    date: Date.now(),
                    sheets: newSheets,
                    isFinalized: false,
                    createdBy: user?.first_name || 'Admin'
                };
                await apiFetch('/api/inventory/cycle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newCycle) });
                setActiveCycle(newCycle); setCycles([newCycle, ...cycles]);
                addToast("Бланки загружены", "success");
            }
        } catch (e) { addToast("Ошибка импорта", "error"); } finally { setIsImportModalOpen(false); setIsSaving(false); }
    };

    const handleOpenSheet = async (sheetId: string) => {
        if (!activeCycle) return;
        try {
            const res = await apiFetch('/api/inventory/lock', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cycleId: activeCycle.id, sheetId, user: { id: user?.id, name: user?.first_name } })
            });
            const data = await res.json();
            if (!data.success) { addToast(`Занято: ${data.lockedBy.name}`, "error"); return; }
            const sheet = activeCycle.sheets.find(s => s.id === sheetId);
            if (sheet) {
                const initialInputs: Record<string, string> = {};
                sheet.items.forEach(item => { initialInputs[item.id] = item.actual !== undefined ? item.actual.toString() : ''; });
                setInputValues(initialInputs);
            }
            setActiveSheetId(sheetId); setViewMode('filling');
        } catch (e) { addToast("Ошибка доступа", "error"); }
    };

    const handleActualChange = (itemId: string, rawVal: string) => {
        if (!activeCycle || !activeSheetId) return;
        let normalizedVal = rawVal.replace(',', '.');
        if (normalizedVal !== '' && !/^-?\d*\.?\d*$/.test(normalizedVal)) return;
        setInputValues(prev => ({ ...prev, [itemId]: normalizedVal }));
        const numeric = parseFloat(normalizedVal);
        const updatedCycle = { ...activeCycle };
        const sheet = updatedCycle.sheets.find(s => s.id === activeSheetId);
        if (sheet) {
            sheet.items = sheet.items.map(i => i.id === itemId ? { ...i, actual: isNaN(numeric) ? undefined : numeric } : i);
            setActiveCycle(updatedCycle); saveCycleDebounced(updatedCycle);
        }
    };

    const timerRef = useRef<any>(null);
    const saveCycleDebounced = (cycle: InventoryCycle) => {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(async () => {
            try { await apiFetch('/api/inventory/cycle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cycle) }); } catch (e) {}
        }, 1000);
    };

    const submitSheet = async () => {
        if (!activeCycle || !activeSheetId) return;
        const sheet = activeCycle.sheets.find(s => s.id === activeSheetId);
        if (!sheet) return;
        const empty = sheet.items.filter(i => i.actual === undefined).length;
        if (empty > 0 && !confirm(`Осталось ${empty} позиций. Сдать?`)) return;
        
        const updatedCycle = { ...activeCycle };
        const target = updatedCycle.sheets.find(s => s.id === activeSheetId);
        if (target) target.status = 'submitted';
        
        const allDone = updatedCycle.sheets.every(s => s.status === 'submitted');
        if (allDone) updatedCycle.isFinalized = true;

        try {
            await apiFetch('/api/inventory/cycle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updatedCycle) });
            await apiFetch('/api/inventory/unlock', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cycleId: activeCycle.id, sheetId: activeSheetId }) });
            setActiveSheetId(null); setViewMode('list'); loadData();
            if (allDone) addToast("Инвентаризация завершена!", "success");
            else addToast("Бланк сдан!", "success");
        } catch (e) { addToast("Ошибка", "error"); }
    };

    const deleteCycle = async (id: string) => {
        if (!confirm("Удалить текущую инвентаризацию?")) return;
        try {
            await apiFetch(`/api/inventory/cycle/${id}`, { method: 'DELETE' });
            setActiveCycle(null); loadData();
            addToast("Удалено", "success");
        } catch (e) { addToast("Ошибка", "error"); }
    };

    const handleCreateSheet = async () => {
        if (!newSheetTitle.trim() || selectedGlobalIds.size === 0 || !activeCycle) return;
        const selectedItems: InventoryItem[] = globalItems
            .filter(gi => selectedGlobalIds.has(`${gi.code}_${gi.name}`))
            .map(gi => ({ id: uuidv4(), name: gi.name, unit: gi.unit, code: gi.code }));
        
        const newSheet: InventorySheet = { id: uuidv4(), title: newSheetTitle.trim(), items: selectedItems, status: 'active' };
        const updatedCycle = { ...activeCycle, sheets: [...activeCycle.sheets, newSheet] };
        
        try {
            await apiFetch('/api/inventory/cycle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updatedCycle) });
            setActiveCycle(updatedCycle);
            setIsAddingSheet(false); setNewSheetTitle(''); setSelectedGlobalIds(new Set());
            addToast("Бланк создан", "success");
        } catch (e) { addToast("Ошибка", "error"); }
    };

    const deleteSheet = async (sheetId: string) => {
        if (!activeCycle || !confirm("Удалить этот бланк?")) return;
        const updated = { ...activeCycle, sheets: activeCycle.sheets.filter(s => s.id !== sheetId) };
        try {
            await apiFetch('/api/inventory/cycle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updated) });
            setActiveCycle(updated); addToast("Бланк удален", "info");
        } catch (e) { addToast("Ошибка", "error"); }
    };

    const renameSheet = async (sheetId: string) => {
        if (!activeCycle) return;
        const sheet = activeCycle.sheets.find(s => s.id === sheetId);
        const newName = prompt("Новое название:", sheet?.title);
        if (!newName || newName === sheet?.title) return;
        const updated = { ...activeCycle, sheets: activeCycle.sheets.map(s => s.id === sheetId ? { ...s, title: newName } : s) };
        try {
            await apiFetch('/api/inventory/cycle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updated) });
            setActiveCycle(updated); addToast("Переименовано", "success");
        } catch (e) { addToast("Ошибка", "error"); }
    };

    const handleBack = () => {
        if (viewMode === 'filling') {
            if (activeCycle && activeSheetId) apiFetch('/api/inventory/unlock', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cycleId: activeCycle.id, sheetId: activeSheetId }) });
            setViewMode('list'); setActiveSheetId(null);
        } else if (viewMode !== 'list') setViewMode('list');
        else navigate('/');
    };

    const consolidatedData = useMemo(() => {
        if (!activeCycle) return [];
        const agg: Record<string, { name: string; unit: string; total: number }> = {};
        activeCycle.sheets.forEach(s => s.items.forEach(i => {
            if (i.actual === undefined) return;
            const key = `${i.name}_${i.unit}`;
            if (!agg[key]) agg[key] = { name: i.name, unit: i.unit, total: 0 };
            agg[key].total += i.actual;
        }));
        return Object.values(agg).sort((a, b) => a.name.localeCompare(b.name));
    }, [activeCycle]);

    const filteredGlobal = globalItems.filter(gi => !searchTerm || gi.name.toLowerCase().includes(searchTerm.toLowerCase()));

    return (
        <div className="pb-24 animate-fade-in min-h-screen bg-[#f2f4f7] dark:bg-[#0f1115]">
            {/* Header */}
            <div className="pt-safe-top px-5 pb-4 sticky top-0 z-50 bg-[#f2f4f7]/95 dark:bg-[#0f1115]/95 backdrop-blur-md border-b border-gray-100 dark:border-white/5 shadow-sm">
                <div className="flex items-center justify-between pt-4">
                    <div className="flex items-center gap-3">
                        <button onClick={handleBack} className="w-10 h-10 rounded-full bg-white dark:bg-[#1e1e24] shadow-sm flex items-center justify-center dark:text-white active:scale-95 transition">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
                        </button>
                        <div>
                            <h1 className="text-xl font-black text-gray-900 dark:text-white leading-none">Инвентаризация</h1>
                            <p className="text-[10px] text-gray-400 font-bold uppercase mt-1 tracking-widest truncate max-w-[180px]">
                                {activeCycle ? new Date(activeCycle.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }) : 'Цикл не начат'}
                            </p>
                        </div>
                    </div>
                    {viewMode === 'filling' && (
                        <input 
                            type="text" 
                            placeholder="Поиск..." 
                            className="w-32 bg-gray-100 dark:bg-black/20 rounded-xl px-3 py-2 text-xs font-bold dark:text-white outline-none"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    )}
                </div>
            </div>

            <div className="px-5 pt-6">
                {isLoading ? (
                    <div className="space-y-4">
                        {[1, 2, 3, 4, 5].map(i => <SkeletonItem key={i} />)}
                    </div>
                ) : (
                    <>
                        {viewMode === 'list' && (
                            <div className="space-y-6">
                                {isAdmin && (
                                    <div className="grid grid-cols-4 gap-2.5 mb-2">
                                        <div onClick={() => document.getElementById('xl-cycle')?.click()} className="col-span-1 bg-sky-100 dark:bg-sky-500/20 rounded-2xl p-2 text-sky-600 dark:text-sky-400 flex flex-col items-center justify-center gap-1 h-20 active:scale-[0.98] transition group">
                                            <input type="file" id="xl-cycle" className="hidden" accept=".xlsx,.xls" onChange={e => handleFileUpload(e, 'cycle')} />
                                            <div className="w-8 h-8 rounded-full bg-white dark:bg-black/20 flex items-center justify-center shadow-sm group-hover:scale-110 transition"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg></div>
                                            <h3 className="font-bold text-[8px] uppercase tracking-tighter text-center">Импорт Excel</h3>
                                        </div>
                                        <div onClick={() => document.getElementById('xl-summary')?.click()} className="col-span-1 bg-amber-100 dark:bg-amber-500/20 rounded-2xl p-2 text-amber-600 dark:text-amber-400 flex flex-col items-center justify-center gap-1 h-20 active:scale-[0.98] transition group">
                                            <input type="file" id="xl-summary" className="hidden" accept=".xlsx,.xls" onChange={e => handleFileUpload(e, 'summary')} />
                                            <div className="w-8 h-8 rounded-full bg-white dark:bg-black/20 flex items-center justify-center shadow-sm group-hover:scale-110 transition"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" /></svg></div>
                                            <h3 className="font-bold text-[8px] uppercase tracking-tighter text-center">База товаров</h3>
                                        </div>
                                        <div onClick={() => setViewMode('summary')} className="col-span-1 bg-emerald-100 dark:bg-emerald-500/20 rounded-2xl p-2 text-emerald-600 dark:text-emerald-400 flex flex-col items-center justify-center gap-1 h-20 active:scale-[0.98] transition group">
                                            <div className="w-8 h-8 rounded-full bg-white dark:bg-black/20 flex items-center justify-center shadow-sm group-hover:scale-110 transition"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg></div>
                                            <h3 className="font-bold text-[8px] uppercase tracking-tighter text-center">Сводная</h3>
                                        </div>
                                        <div onClick={() => setViewMode('manage')} className="col-span-1 bg-purple-100 dark:bg-purple-500/20 rounded-2xl p-2 text-purple-600 dark:text-purple-400 flex flex-col items-center justify-center gap-1 h-20 active:scale-[0.98] transition group">
                                            <div className="w-8 h-8 rounded-full bg-white dark:bg-black/20 flex items-center justify-center shadow-sm group-hover:scale-110 transition"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg></div>
                                            <h3 className="font-bold text-[8px] uppercase tracking-tighter text-center">Управление</h3>
                                        </div>
                                    </div>
                                )}

                                {!activeCycle ? (
                                    <div className="text-center py-20 opacity-50 flex flex-col items-center animate-fade-in">
                                        <span className="text-6xl mb-4">📦</span>
                                        <h3 className="font-bold dark:text-white">Цикл не активен</h3>
                                        <p className="text-[10px] text-gray-400 mt-2 uppercase tracking-widest">Загрузите Excel или создайте бланки вручную</p>
                                    </div>
                                ) : (
                                    <div className="space-y-3 animate-slide-up">
                                        <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] ml-1">Станции и бланки</h3>
                                        {activeCycle.sheets.map(sheet => {
                                            const filled = sheet.items.filter(i => i.actual !== undefined).length;
                                            const total = sheet.items.length;
                                            const pct = total > 0 ? Math.round((filled/total)*100) : 0;
                                            return (
                                                <div key={sheet.id} onClick={() => handleOpenSheet(sheet.id)} className="bg-white dark:bg-[#1e1e24] p-4 rounded-3xl shadow-sm border border-gray-100 dark:border-white/5 active:scale-[0.98] transition cursor-pointer flex items-center justify-between overflow-hidden relative group">
                                                    <div className="absolute bottom-0 left-0 h-1 bg-sky-500/20 transition-all duration-500" style={{ width: `${pct}%` }}></div>
                                                    <div className="flex items-center gap-4 relative z-10">
                                                        <div className={`w-11 h-11 rounded-2xl flex items-center justify-center text-xl transition-colors ${sheet.status === 'submitted' ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20' : 'bg-sky-100 text-sky-600 dark:bg-sky-500/20'}`}>
                                                            {sheet.status === 'submitted' ? '✅' : '🔪'}
                                                        </div>
                                                        <div>
                                                            <h4 className="font-bold text-gray-900 dark:text-white leading-tight group-hover:text-sky-500 transition-colors">{sheet.title}</h4>
                                                            <p className="text-[9px] text-gray-400 font-black uppercase mt-0.5">{filled} / {total} поз. • {pct}%</p>
                                                        </div>
                                                    </div>
                                                    {sheet.lockedBy && <span className="text-[8px] bg-red-100 text-red-600 px-2 py-1 rounded-full font-black uppercase shadow-sm">🔒 {sheet.lockedBy.name}</span>}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}

                        {viewMode === 'summary' && activeCycle && (
                            <div className="animate-slide-up space-y-4">
                                <div className="flex justify-between items-center px-1">
                                    <h3 className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Текущая сводная ведомость</h3>
                                    <span className="text-[10px] font-bold text-gray-400">{consolidatedData.length} поз.</span>
                                </div>
                                <div className="bg-white dark:bg-[#1e1e24] rounded-[2rem] shadow-xl overflow-hidden border border-emerald-100 dark:border-emerald-500/10">
                                    <table className="w-full border-collapse">
                                        <thead className="bg-gray-50 dark:bg-black/20 text-[8px] font-black uppercase text-gray-400 border-b border-gray-100 dark:border-white/5">
                                            <tr><th className="p-4 text-left">Товар</th><th className="p-4 text-right">Всего факт</th></tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-50 dark:divide-white/5">
                                            {consolidatedData.map((d, i) => (
                                                <tr key={i} className="hover:bg-emerald-50/30 dark:hover:bg-emerald-500/5 transition-colors">
                                                    <td className="p-4">
                                                        <div className="font-bold text-xs dark:text-white leading-none">{d.name}</div>
                                                        <div className="text-[9px] text-gray-400 font-bold uppercase mt-1">{d.unit}</div>
                                                    </td>
                                                    <td className="p-4 text-right font-black text-emerald-600 dark:text-emerald-400 text-sm">
                                                        {d.total.toFixed(3).replace(/\.?0+$/, '')}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {viewMode === 'manage' && activeCycle && (
                            <div className="animate-slide-up space-y-6">
                                <div className="flex justify-between items-center">
                                    <h3 className="text-[10px] font-bold text-purple-600 uppercase tracking-widest ml-1">Редактирование бланков</h3>
                                    <button onClick={() => setIsAddingSheet(true)} className="px-4 py-2 bg-purple-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-purple-500/20 active:scale-95 transition">+ Новый бланк</button>
                                </div>
                                <div className="space-y-3">
                                    {activeCycle.sheets.map(sheet => (
                                        <div key={sheet.id} className="bg-white dark:bg-[#1e1e24] p-5 rounded-3xl border border-gray-100 dark:border-white/5 flex items-center justify-between shadow-sm">
                                            <div className="min-w-0 flex-1">
                                                <h4 className="font-bold dark:text-white truncate">{sheet.title}</h4>
                                                <p className="text-[9px] text-gray-400 font-black uppercase">{sheet.items.length} позиций</p>
                                            </div>
                                            <div className="flex gap-2">
                                                <button onClick={() => renameSheet(sheet.id)} className="w-9 h-9 rounded-xl bg-gray-50 dark:bg-white/5 text-gray-400 flex items-center justify-center active:scale-90 transition"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" /></svg></button>
                                                <button onClick={() => deleteSheet(sheet.id)} className="w-9 h-9 rounded-xl bg-red-50 dark:bg-red-500/10 text-red-500 flex items-center justify-center active:scale-90 transition"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg></button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <div className="pt-6 border-t border-gray-100 dark:border-white/5">
                                     <button onClick={() => deleteCycle(activeCycle.id)} className="w-full py-4 bg-red-600 text-white font-black rounded-2xl shadow-xl shadow-red-500/20 active:scale-95 transition uppercase text-xs tracking-widest">⚠️ Удалить текущую инвентаризацию</button>
                                </div>
                            </div>
                        )}

                        {viewMode === 'filling' && activeSheetId && activeCycle && (
                            <div className="space-y-1 pb-32 animate-fade-in">
                                <div className="mb-4 px-1 text-[9px] text-gray-400 font-black uppercase tracking-widest flex items-center gap-2">🔪 {activeCycle.sheets.find(s=>s.id===activeSheetId)?.title}</div>
                                {activeCycle.sheets.find(s=>s.id===activeSheetId)?.items.filter(i => !searchTerm || i.name.toLowerCase().includes(searchTerm.toLowerCase())).map(item => (
                                    <InventoryItemRow key={item.id} item={item} inputValue={inputValues[item.id] ?? ''} onChange={handleActualChange} onDelete={(id) => {
                                        const updated = {...activeCycle};
                                        const s = updated.sheets.find(sh => sh.id === activeSheetId);
                                        if (s) s.items = s.items.filter(i => i.id !== id);
                                        setActiveCycle(updated); saveCycleDebounced(updated);
                                    }} />
                                ))}
                                <button onClick={() => {
                                    const sheet = activeCycle.sheets.find(s=>s.id===activeSheetId);
                                    if(sheet) { setViewMode('manage'); setInputValues({}); }
                                }} className="w-full py-4 mt-4 rounded-3xl border-2 border-dashed border-gray-200 dark:border-white/10 text-gray-400 text-[10px] font-black uppercase tracking-widest hover:border-sky-500 transition">+ Редактировать позиции</button>
                                <div className="fixed bottom-6 left-4 right-4 z-[60] bg-white/80 dark:bg-black/80 backdrop-blur-md p-2 rounded-3xl shadow-2xl border border-gray-100 dark:border-white/5">
                                     <button onClick={submitSheet} className="w-full py-4 bg-gray-900 dark:bg-white text-white dark:text-black font-black rounded-2xl uppercase text-[10px] tracking-widest active:scale-95 transition shadow-lg">Сдать бланк</button>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* CREATE SHEET MODAL */}
            {isAddingSheet && createPortal(
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fade-in">
                    <div className="bg-white dark:bg-[#1e1e24] w-full max-w-sm rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
                        <div className="p-6 border-b border-gray-100 dark:border-white/5 flex justify-between items-center bg-gray-50/50 dark:bg-black/20">
                            <div><h2 className="text-xl font-black dark:text-white leading-none">Новый бланк</h2><p className="text-[9px] text-gray-400 font-bold uppercase mt-2">Ручное создание из базы</p></div>
                            <button onClick={() => setIsAddingSheet(false)} className="w-8 h-8 rounded-full bg-gray-200 dark:bg-white/10 flex items-center justify-center active:scale-90 transition">✕</button>
                        </div>
                        <div className="p-5 space-y-4 flex-1 flex flex-col min-h-0">
                            <input type="text" placeholder="Название (напр. Горячий цех)" className="w-full bg-gray-50 dark:bg-black/40 rounded-2xl px-4 py-3 font-bold dark:text-white outline-none focus:ring-2 focus:ring-purple-500" value={newSheetTitle} onChange={e => setNewSheetTitle(e.target.value)} />
                            <div className="relative flex-1 flex flex-col min-h-0">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg></div>
                                <input type="text" placeholder="Поиск в базе..." className="w-full bg-gray-50 dark:bg-black/40 rounded-xl px-4 py-2.5 pl-10 text-xs font-bold dark:text-white outline-none mb-3" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                                <div className="flex-1 overflow-y-auto space-y-1 no-scrollbar pr-1">
                                    {filteredGlobal.map(gi => {
                                        const key = `${gi.code}_${gi.name}`;
                                        const selected = selectedGlobalIds.has(key);
                                        return (
                                            <div key={key} onClick={() => { const n = new Set(selectedGlobalIds); if(selected) n.delete(key); else n.add(key); setSelectedGlobalIds(n); }} className={`p-3 rounded-2xl flex items-center gap-3 transition-colors cursor-pointer ${selected ? 'bg-purple-600 text-white' : 'hover:bg-gray-100 dark:hover:bg-white/5 text-gray-600 dark:text-gray-300'}`}>
                                                <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center ${selected ? 'bg-white border-white' : 'border-gray-200 dark:border-white/10'}`}>{selected && <svg className="w-3.5 h-3.5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={4}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}</div>
                                                <div className="min-w-0 flex-1"><p className="text-[11px] font-bold leading-tight truncate">{gi.name}</p><p className={`text-[8px] uppercase font-black ${selected ? 'text-white/60' : 'text-gray-400'}`}>{gi.code} • {gi.unit}</p></div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                        <div className="p-5 bg-gray-50 dark:bg-black/20 flex gap-3"><button onClick={() => setIsAddingSheet(false)} className="flex-1 py-3.5 font-bold text-gray-400 text-xs uppercase">Отмена</button><button onClick={handleCreateSheet} disabled={!newSheetTitle || selectedGlobalIds.size === 0} className="flex-1 py-3.5 font-black text-white bg-purple-600 rounded-2xl shadow-xl uppercase text-xs tracking-widest disabled:opacity-30 transition-all">Создать ({selectedGlobalIds.size})</button></div>
                    </div>
                </div>, document.body
            )}

            {/* IMPORT MODAL */}
            {isImportModalOpen && createPortal(
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fade-in">
                    <div className="bg-white dark:bg-[#1e1e24] w-full max-w-sm rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
                        <div className="p-6 border-b border-gray-100 dark:border-white/5 flex justify-between items-center bg-gray-50/50 dark:bg-black/20">
                            <div><h2 className="text-xl font-black dark:text-white leading-none">Настройка импорта</h2><p className="text-[9px] text-gray-400 font-bold uppercase mt-2">{importType === 'summary' ? 'Обновление справочника товаров' : 'Импорт бланков из Excel'}</p></div>
                            <button onClick={() => setIsImportModalOpen(false)} className="w-8 h-8 rounded-full bg-gray-200 dark:bg-white/10 flex items-center justify-center">✕</button>
                        </div>
                        <div className="p-4 overflow-y-auto space-y-4 no-scrollbar">
                            {importSheets.map((s, i) => (
                                <div key={i} className={`p-4 rounded-3xl border-2 transition-all ${s.isSelected ? 'border-sky-500 bg-sky-500/5' : 'border-gray-100 dark:border-white/5 opacity-50'}`}>
                                    <div className="flex items-center gap-3 mb-3">
                                        <input type="checkbox" checked={s.isSelected} onChange={e => { const ns = [...importSheets]; ns[i].isSelected = e.target.checked; setImportSheets(ns); }} className="w-5 h-5 rounded-lg" />
                                        <h4 className="font-bold text-sm dark:text-white truncate">{s.name}</h4>
                                    </div>
                                    {importType === 'cycle' && s.isSelected && (
                                        <div className="grid grid-cols-2 gap-2">
                                            <div className="space-y-1">
                                                <label className="text-[8px] font-black text-gray-400 uppercase">Кол. Товар</label>
                                                <input type="number" className="w-full bg-white dark:bg-black/40 rounded-lg p-2 text-xs font-bold dark:text-white border border-gray-100 dark:border-white/5" value={s.mapping.name} onChange={e => { const ns = [...importSheets]; ns[i].mapping.name = Number(e.target.value); setImportSheets(ns); }} />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[8px] font-black text-gray-400 uppercase">Кол. Ед.изм</label>
                                                <input type="number" className="w-full bg-white dark:bg-black/40 rounded-lg p-2 text-xs font-bold dark:text-white border border-gray-100 dark:border-white/5" value={s.mapping.unit} onChange={e => { const ns = [...importSheets]; ns[i].mapping.unit = Number(e.target.value); setImportSheets(ns); }} />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                        <div className="p-6 bg-gray-50 dark:bg-black/20 flex gap-3"><button onClick={() => setIsImportModalOpen(false)} className="flex-1 py-3.5 font-bold text-gray-400 text-xs uppercase">Отмена</button><button onClick={confirmImport} className="flex-1 py-3.5 font-black text-white bg-sky-600 rounded-2xl shadow-xl uppercase text-xs tracking-widest">Импорт</button></div>
                    </div>
                </div>, document.body
            )}
        </div>
    );
};

export default Inventory;
