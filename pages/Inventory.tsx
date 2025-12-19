
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { v4 as uuidv4 } from 'uuid';
import * as XLSX from 'xlsx';
import { InventoryCycle, InventorySheet, InventoryItem, GlobalInventoryItem } from '../types';
import { useToast } from '../context/ToastContext';
import { useTelegram } from '../context/TelegramContext';
import { apiFetch } from '../services/api';

interface ImportSheet {
    name: string;
    data: any[][];
    isSummary: boolean;
    isSelected: boolean;
    mapping: { name: number; unit: number; code: number };
}

// --- SUB-COMPONENT: SWIPEABLE ITEM ROW ---
const InventoryItemRow: React.FC<{
    item: InventoryItem;
    inputValue: string;
    onDelete: (id: string) => void;
    onChange: (id: string, val: string) => void;
}> = ({ item, inputValue, onDelete, onChange }) => {
    const [startX, setStartX] = useState(0);
    const [offsetX, setOffsetX] = useState(0);
    const [isSwiped, setIsSwiped] = useState(false);
    const { webApp } = useTelegram();

    const handleTouchStart = (e: React.TouchEvent) => {
        setStartX(e.touches[0].clientX);
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        const currentX = e.touches[0].clientX;
        const diff = currentX - startX;
        if (diff < 0) {
            setOffsetX(Math.max(diff, -100));
        } else if (isSwiped && diff > 0) {
            setOffsetX(Math.min(-80 + diff, 0));
        }
    };

    const handleTouchEnd = () => {
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
        <div className="relative overflow-hidden rounded-2xl mb-3 group select-none touch-pan-y">
            <div 
                className="absolute inset-0 bg-[#f2f4f7] dark:bg-[#0f1115] flex justify-end items-center pr-6 cursor-pointer active:opacity-70 transition-opacity"
                onClick={() => { onDelete(item.id); resetSwipe(); }}
            >
                <div className="flex flex-col items-center gap-1 text-red-500">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                    <span className="text-[8px] font-black uppercase tracking-tighter">Удалить</span>
                </div>
            </div>

            <div 
                style={{ transform: `translateX(${offsetX}px)` }}
                className="relative bg-white dark:bg-[#1e1e24] p-4 flex items-center justify-between border border-gray-100 dark:border-white/5 transition-transform duration-200 ease-out z-10"
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
                    <input 
                        type="text" 
                        inputMode="decimal"
                        className="w-24 bg-gray-50 dark:bg-black/40 border border-transparent focus:border-sky-500 rounded-xl px-2 py-3 text-center font-black text-lg dark:text-white outline-none transition-all shadow-inner"
                        placeholder="0"
                        value={inputValue}
                        onChange={e => onChange(item.id, e.target.value)}
                        onFocus={resetSwipe}
                    />
                </div>
            </div>
        </div>
    );
};

const Inventory: React.FC = () => {
    const navigate = useNavigate();
    const { isAdmin, user } = useTelegram();
    const { addToast } = useToast();

    const [cycles, setCycles] = useState<InventoryCycle[]>([]);
    const [globalItems, setGlobalItems] = useState<GlobalInventoryItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [activeCycle, setActiveCycle] = useState<InventoryCycle | null>(null);
    const [viewMode, setViewMode] = useState<'list' | 'filling' | 'admin' | 'manage'>('list');
    const [activeSheetId, setActiveSheetId] = useState<string | null>(null);
    
    const [inputValues, setInputValues] = useState<Record<string, string>>({});
    
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [importSheets, setImportSheets] = useState<ImportSheet[]>([]);
    const [importType, setImportType] = useState<'cycle' | 'summary'>('cycle');
    
    const [searchTerm, setSearchTerm] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    
    const [isAddingItem, setIsAddingItem] = useState(false);
    const [newItemName, setNewItemName] = useState('');
    const [newItemUnit, setNewItemUnit] = useState('кг');
    const [newItemCode, setNewItemCode] = useState('');
    const [showSuggestions, setShowSuggestions] = useState(false);

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
            // ONLY show non-finalized cycle as active
            const active = data.find((c: any) => !c.isFinalized);
            if (active) setActiveCycle(active);
            else setActiveCycle(null);
        } catch (e) {
            addToast("Ошибка загрузки", "error");
        } finally {
            setIsLoading(false);
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
                const visibleData = rawData.filter((_, rowIndex) => {
                    return !(rowsMeta[rowIndex] && rowsMeta[rowIndex].hidden === true);
                });

                return { 
                    name, 
                    data: visibleData, 
                    isSummary: idx === 0,
                    isSelected: true,
                    // Default mappings
                    mapping: type === 'summary' ? { code: 1, name: 2, unit: 5 } : { code: -1, name: 0, unit: 1 } 
                };
            });
            setImportSheets(sheets);
            // Summary doesn't need mapping adjustment usually but we show the modal anyway to confirm sheets
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
                        const code = String(row[1] || '').trim(); // B
                        const name = String(row[2] || '').trim(); // C
                        const unit = String(row[5] || '').trim(); // F
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
                await apiFetch('/api/inventory/cycle', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(newCycle)
                });
                setActiveCycle(newCycle);
                setCycles([newCycle, ...cycles]);
                addToast("Бланки загружены", "success");
            }
        } catch (e) {
            addToast("Ошибка импорта", "error");
        } finally {
            setIsImportModalOpen(false);
            setIsSaving(false);
        }
    };

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
                addToast(`Занято: ${data.lockedBy.name}`, "error");
                return;
            }
            const sheet = activeCycle.sheets.find(s => s.id === sheetId);
            if (sheet) {
                const initialInputs: Record<string, string> = {};
                sheet.items.forEach(item => {
                    initialInputs[item.id] = item.actual !== undefined ? item.actual.toString() : '';
                });
                setInputValues(initialInputs);
            }
            setActiveSheetId(sheetId);
            setViewMode('filling');
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
            setActiveCycle(updatedCycle);
            saveCycleDebounced(updatedCycle);
        }
    };

    const timerRef = useRef<any>(null);
    const saveCycleDebounced = (cycle: InventoryCycle) => {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(async () => {
            try { await apiFetch('/api/inventory/cycle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cycle) }); } catch (e) {}
        }, 1500);
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
        
        // CHECK COMPLETION
        const allDone = updatedCycle.sheets.every(s => s.status === 'submitted');
        if (allDone) {
            updatedCycle.isFinalized = true;
        }

        try {
            await apiFetch('/api/inventory/cycle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updatedCycle) });
            await apiFetch('/api/inventory/unlock', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cycleId: activeCycle.id, sheetId: activeSheetId }) });
            setActiveSheetId(null); setViewMode('list'); loadData();
            if (allDone) addToast("Инвентаризация завершена и отправлена в архив!", "success");
            else addToast("Бланк сдан!", "success");
        } catch (e) { addToast("Ошибка", "error"); }
    };

    const handleBack = () => {
        if (viewMode === 'filling') {
            if (confirm("Выйти из бланка?")) {
                if (activeCycle && activeSheetId) {
                    apiFetch('/api/inventory/unlock', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cycleId: activeCycle.id, sheetId: activeSheetId }) });
                }
                setViewMode('list'); setActiveSheetId(null);
            }
        } else if (viewMode === 'admin' || viewMode === 'manage') {
            setViewMode('list');
        } else navigate('/');
    };

    const suggestions = useMemo(() => {
        if (!newItemName || newItemName.length < 2) return [];
        const query = newItemName.toLowerCase();
        return globalItems.filter(item => item.name.toLowerCase().includes(query)).slice(0, 5);
    }, [newItemName, globalItems]);

    const selectSuggestion = (item: GlobalInventoryItem) => {
        setNewItemName(item.name);
        setNewItemUnit(item.unit);
        setNewItemCode(item.code);
        setShowSuggestions(false);
    };

    const handleAddItem = () => {
        if (!newItemName.trim() || !activeCycle || !activeSheetId) return;
        const newItem: InventoryItem = { id: uuidv4(), name: newItemName.trim(), unit: newItemUnit, code: newItemCode };
        const updatedCycle = { ...activeCycle };
        const sheet = updatedCycle.sheets.find(s => s.id === activeSheetId);
        if (sheet) {
            sheet.items.push(newItem);
            setActiveCycle(updatedCycle);
            saveCycleDebounced(updatedCycle);
            setNewItemName(''); setNewItemCode(''); setIsAddingItem(false);
        }
    };

    if (isLoading) return <div className="flex items-center justify-center h-screen"><div className="animate-spin text-sky-500">⏳</div></div>;

    return (
        <div className="pb-24 animate-fade-in min-h-screen bg-[#f2f4f7] dark:bg-[#0f1115]">
            <div className="pt-safe-top px-5 pb-4 sticky top-0 z-50 bg-[#f2f4f7]/95 dark:bg-[#0f1115]/95 backdrop-blur-md border-b border-gray-100 dark:border-white/5">
                <div className="flex items-center justify-between pt-4">
                    <div className="flex items-center gap-3">
                        <button onClick={handleBack} className="w-10 h-10 rounded-full bg-white dark:bg-[#1e1e24] shadow-sm flex items-center justify-center dark:text-white border border-gray-100 dark:border-white/5 active:scale-95 transition">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
                        </button>
                        <div>
                            <h1 className="text-xl font-black text-gray-900 dark:text-white leading-none">Инвентаризация</h1>
                            <p className="text-[10px] text-gray-400 font-bold uppercase mt-1 tracking-widest truncate max-w-[200px]">
                                {activeCycle ? new Date(activeCycle.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }) : 'Создать новую'}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="px-5 pt-6">
                {viewMode === 'list' && (
                    <div className="space-y-6">
                        {isAdmin && (
                            <div className="grid grid-cols-4 gap-2.5 mb-2">
                                <div onClick={() => document.getElementById('xl-cycle')?.click()} className="col-span-1 bg-sky-100 dark:bg-sky-500/20 rounded-2xl p-2 text-sky-600 dark:text-sky-400 flex flex-col items-center justify-center gap-1 h-20 active:scale-[0.98] transition group">
                                    <input type="file" id="xl-cycle" className="hidden" accept=".xlsx,.xls" onChange={e => handleFileUpload(e, 'cycle')} />
                                    <div className="w-8 h-8 rounded-full bg-white dark:bg-black/20 flex items-center justify-center shadow-sm group-hover:scale-110 transition"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg></div>
                                    <h3 className="font-bold text-[8px] uppercase tracking-tighter text-center">Загрузить бланки</h3>
                                </div>
                                <div onClick={() => document.getElementById('xl-summary')?.click()} className="col-span-1 bg-amber-100 dark:bg-amber-500/20 rounded-2xl p-2 text-amber-600 dark:text-amber-400 flex flex-col items-center justify-center gap-1 h-20 active:scale-[0.98] transition group">
                                    <input type="file" id="xl-summary" className="hidden" accept=".xlsx,.xls" onChange={e => handleFileUpload(e, 'summary')} />
                                    <div className="w-8 h-8 rounded-full bg-white dark:bg-black/20 flex items-center justify-center shadow-sm group-hover:scale-110 transition"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" /></svg></div>
                                    <h3 className="font-bold text-[8px] uppercase tracking-tighter text-center">Обновить базу</h3>
                                </div>
                                <div onClick={() => navigate('/inventory/archive')} className="col-span-1 bg-purple-100 dark:bg-purple-500/20 rounded-2xl p-2 text-purple-600 dark:text-purple-400 flex flex-col items-center justify-center gap-1 h-20 active:scale-[0.98] transition group">
                                    <div className="w-8 h-8 rounded-full bg-white dark:bg-black/20 flex items-center justify-center shadow-sm group-hover:scale-110 transition"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3.25a2.25 2.25 0 012.25-2.25h2.906a2.25 2.25 0 012.25 2.25v2.452a2.25 2.25 0 01-2.25 2.25H12a2.25 2.25 0 01-2.25-2.25V10.75z" /></svg></div>
                                    <h3 className="font-bold text-[8px] uppercase tracking-tighter text-center">Архив инвента</h3>
                                </div>
                                {activeCycle && (
                                    <div onClick={() => setViewMode('manage')} className="col-span-1 bg-slate-100 dark:bg-white/5 rounded-2xl p-2 text-slate-600 dark:text-gray-300 flex flex-col items-center justify-center gap-1 h-20 active:scale-[0.98] transition group">
                                        <div className="w-8 h-8 rounded-full bg-white dark:bg-black/20 flex items-center justify-center shadow-sm group-hover:scale-110 transition"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg></div>
                                        <h3 className="font-bold text-[8px] uppercase tracking-tighter">Настройки</h3>
                                    </div>
                                )}
                            </div>
                        )}

                        {!activeCycle ? (
                            <div className="text-center py-20 opacity-50 flex flex-col items-center">
                                <span className="text-6xl mb-4">📦</span>
                                <h3 className="font-bold dark:text-white text-lg">Инвентаризация не активна</h3>
                                <p className="text-xs text-gray-400 mt-2 px-10 leading-relaxed text-center uppercase tracking-tighter font-medium">Загрузите Excel файл с товарами по станциям, чтобы начать</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] ml-1">Станции / Смены</h3>
                                {activeCycle.sheets.map(sheet => {
                                    const filled = sheet.items.filter(i => i.actual !== undefined).length;
                                    const total = sheet.items.length;
                                    const pct = total > 0 ? Math.round((filled/total)*100) : 0;
                                    return (
                                        <div key={sheet.id} onClick={() => handleOpenSheet(sheet.id)} className="bg-white dark:bg-[#1e1e24] p-4 rounded-3xl shadow-sm border border-gray-100 dark:border-white/5 active:scale-[0.98] transition cursor-pointer flex items-center justify-between overflow-hidden relative">
                                            <div className="absolute bottom-0 left-0 h-1 bg-sky-500/20" style={{ width: `${pct}%` }}></div>
                                            <div className="flex items-center gap-4 relative z-10">
                                                <div className={`w-11 h-11 rounded-2xl flex items-center justify-center text-xl ${sheet.status === 'submitted' ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20' : 'bg-sky-100 text-sky-600 dark:bg-sky-500/20'}`}>
                                                    {sheet.status === 'submitted' ? '✅' : '👨‍🍳'}
                                                </div>
                                                <div>
                                                    <h4 className="font-bold text-gray-900 dark:text-white leading-tight">{sheet.title}</h4>
                                                    <p className="text-[9px] text-gray-400 font-black uppercase mt-0.5">{filled} / {total} поз. • {pct}%</p>
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
                         <div className="bg-red-50 dark:bg-red-500/10 p-5 rounded-3xl border border-red-100 dark:border-red-500/20">
                            <h3 className="text-red-600 dark:text-red-400 font-black uppercase text-[10px] mb-1">Сброс</h3>
                            <p className="text-[9px] text-red-500/70 mb-4 font-medium uppercase leading-tight">Удалит текущую инвентаризацию без сохранения в архив.</p>
                            <button onClick={() => { if(confirm("Сбросить всё?")) { setActiveCycle(null); loadData(); } }} className="w-full py-3 bg-red-600 text-white font-black rounded-2xl shadow-lg uppercase text-[10px] tracking-widest active:scale-95 transition">Сбросить всё</button>
                         </div>
                    </div>
                )}

                {viewMode === 'filling' && activeSheetId && activeCycle && (
                    <div className="space-y-1 pb-32">
                        <div className="mb-4 px-1 text-[9px] text-gray-400 font-black uppercase tracking-widest flex items-center gap-2">📦 {activeCycle.sheets.find(s=>s.id===activeSheetId)?.title}</div>
                        {activeCycle.sheets.find(s=>s.id===activeSheetId)?.items.filter(i => !searchTerm || i.name.toLowerCase().includes(searchTerm.toLowerCase())).map(item => (
                            <InventoryItemRow key={item.id} item={item} inputValue={inputValues[item.id] ?? ''} onChange={handleActualChange} onDelete={(id) => {
                                const updated = {...activeCycle};
                                const s = updated.sheets.find(sh => sh.id === activeSheetId);
                                if (s) s.items = s.items.filter(i => i.id !== id);
                                setActiveCycle(updated); saveCycleDebounced(updated);
                            }} />
                        ))}
                        <button onClick={() => setIsAddingItem(true)} className="w-full py-4 mt-4 rounded-3xl border-2 border-dashed border-gray-200 dark:border-white/10 text-gray-400 text-[10px] font-black uppercase tracking-widest">+ Добавить позицию</button>
                        <div className="fixed bottom-6 left-4 right-4 z-[60] bg-[#f2f4f7]/80 dark:bg-[#0f1115]/80 backdrop-blur-md p-2 rounded-3xl">
                             <button onClick={submitSheet} className="w-full py-4 bg-gray-900 dark:bg-white text-white dark:text-black font-black rounded-2xl shadow-2xl uppercase text-[10px] tracking-widest">Сдать бланк</button>
                        </div>
                    </div>
                )}
            </div>

            {/* IMPORT MODAL (FLEXIBLE EDITOR) */}
            {isImportModalOpen && createPortal(
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fade-in">
                    <div className="bg-white dark:bg-[#1e1e24] w-full max-w-sm rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
                        <div className="p-6 border-b border-gray-100 dark:border-white/5 flex justify-between items-center bg-gray-50/50 dark:bg-black/20">
                            <div><h2 className="text-xl font-black dark:text-white leading-none">Настройка импорта</h2><p className="text-[9px] text-gray-400 font-bold uppercase mt-2">{importType === 'summary' ? 'Обновление базы товаров (B,C,F)' : 'Импорт бланков станций'}</p></div>
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
                        <div className="p-6 bg-gray-50 dark:bg-black/20 flex gap-3"><button onClick={() => setIsImportModalOpen(false)} className="flex-1 py-3.5 font-bold text-gray-500 text-sm uppercase">Отмена</button><button onClick={confirmImport} className="flex-1 py-3.5 font-black text-white bg-sky-600 rounded-2xl shadow-lg uppercase text-sm tracking-widest">Импорт</button></div>
                    </div>
                </div>, document.body
            )}

            {/* ADD ITEM MODAL */}
            {isAddingItem && createPortal(
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fade-in" onClick={(e) => e.target === e.currentTarget && setIsAddingItem(false)}>
                    <div className="bg-white dark:bg-[#1e1e24] w-full max-w-sm rounded-[2.5rem] shadow-2xl p-6 animate-slide-up relative">
                         <div className="flex justify-between items-center mb-6"><h2 className="text-xl font-black dark:text-white leading-none">Добавить товар</h2><button onClick={() => setIsAddingItem(false)} className="w-8 h-8 rounded-full bg-gray-100 dark:bg-white/5 text-gray-400 flex items-center justify-center">✕</button></div>
                         <div className="space-y-6">
                             <div className="relative">
                                 <label className="text-[9px] font-black text-gray-400 uppercase mb-2 block ml-1">Наименование (из справочника)</label>
                                 <input autoFocus type="text" className="w-full bg-gray-50 dark:bg-black/40 rounded-2xl px-5 py-4 font-bold dark:text-white outline-none focus:ring-2 focus:ring-sky-500 transition-all" placeholder="Поиск товара..." value={newItemName} onChange={e => { setNewItemName(e.target.value); setShowSuggestions(true); }} />
                                 {showSuggestions && suggestions.length > 0 && (
                                     <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-[#2a2a35] rounded-2xl shadow-2xl border border-gray-100 dark:border-white/10 z-[110] overflow-hidden max-h-48 overflow-y-auto">
                                         {suggestions.map(s => (
                                             <div key={s.code + s.name} onClick={() => selectSuggestion(s)} className="px-5 py-3.5 hover:bg-sky-50 dark:hover:bg-white/5 cursor-pointer flex justify-between items-center group transition-colors">
                                                 <div><span className="text-xs font-bold dark:text-white block leading-tight">{s.name}</span><span className="text-[8px] text-gray-400 font-bold uppercase">{s.code}</span></div>
                                                 <span className="text-[9px] font-black text-gray-400 uppercase">{s.unit}</span>
                                             </div>
                                         ))}
                                     </div>
                                 )}
                             </div>
                             <div className="grid grid-cols-2 gap-3">
                                <div><label className="text-[9px] font-black text-gray-400 uppercase mb-2 block">Код</label><input type="text" readOnly className="w-full bg-gray-100 dark:bg-black/20 rounded-xl px-4 py-3 text-xs font-bold text-gray-500" value={newItemCode} /></div>
                                <div><label className="text-[9px] font-black text-gray-400 uppercase mb-2 block">Ед. изм.</label><input type="text" readOnly className="w-full bg-gray-100 dark:bg-black/20 rounded-xl px-4 py-3 text-xs font-bold text-gray-500" value={newItemUnit} /></div>
                             </div>
                             <div className="pt-2"><button onClick={handleAddItem} className="w-full py-4 bg-sky-600 text-white font-black rounded-2xl shadow-xl shadow-sky-600/20 active:scale-95 transition-all text-xs tracking-widest uppercase">🚀 Добавить в бланк</button></div>
                         </div>
                    </div>
                </div>, document.body
            )}
        </div>
    );
};

export default Inventory;
