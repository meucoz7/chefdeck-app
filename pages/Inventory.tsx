
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { v4 as uuidv4 } from 'uuid';
import * as XLSX from 'xlsx';
import { useTelegram } from '../context/TelegramContext';
import { useToast } from '../context/ToastContext';
import { apiFetch } from '../services/api';
import { scopedStorage } from '../services/storage';
import { InvStation, InvItem, InvReport } from '../types';

const Inventory: React.FC = () => {
    const navigate = useNavigate();
    const { isAdmin, user } = useTelegram();
    const { addToast } = useToast();
    
    // --- APP STATE ---
    const [stations, setStations] = useState<InvStation[]>([]);
    const [history, setHistory] = useState<InvReport[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    
    // --- UI STATE ---
    const [activeStationId, setActiveStationId] = useState<string | null>(null);
    const [sessionLockedBy, setSessionLockedBy] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [showHistory, setShowHistory] = useState(false);
    
    // --- IMPORT STATE ---
    const [importingFile, setImportingFile] = useState<any>(null);
    const [importStep, setImportStep] = useState<'none' | 'sheets' | 'columns'>('none');
    const [sheetMappings, setSheetMappings] = useState<{ original: string, mapped: string, selected: boolean }[]>([]);
    const [columnMapping, setColumnMapping] = useState({ name: 0, unit: 1, amount: 2 });
    const [excelPreview, setExcelPreview] = useState<any[][]>([]);

    const fileInputRef = useRef<HTMLInputElement>(null);

    // --- LOAD DATA ---
    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setIsLoading(true);
        try {
            const [sRes, hRes] = await Promise.all([
                apiFetch('/api/inventory/stations'),
                apiFetch('/api/inventory/history')
            ]);
            const sData = await sRes.json();
            const hData = await hRes.json();
            
            setStations(sData || []);
            setHistory(hData || []);

            // Check if user has an active local session
            const localSession = scopedStorage.getJson('active_inv_session', null);
            if (localSession) {
                setSessionLockedBy(localSession.stationId);
                // Merge local counts into current stations
                setStations(prev => prev.map(s => s.id === localSession.stationId ? { ...s, items: localSession.items } : s));
            }
        } catch (e) {
            addToast("Ошибка сети", "error");
        } finally {
            setIsLoading(false);
        }
    };

    // --- REAL-TIME LOCAL SAVE ---
    const saveLocalSession = (stationId: string, items: InvItem[]) => {
        scopedStorage.setJson('active_inv_session', { stationId, items, timestamp: Date.now() });
    };

    const clearLocalSession = () => {
        scopedStorage.removeItem('active_inv_session');
        setSessionLockedBy(null);
    };

    // --- ACTIONS ---
    const startInventory = (id: string) => {
        if (sessionLockedBy && sessionLockedBy !== id) {
            addToast("У вас уже открыт другой бланк!", "error");
            return;
        }
        setSessionLockedBy(id);
        setActiveStationId(id);
        saveLocalSession(id, stations.find(s => s.id === id)?.items || []);
    };

    const handleAmountChange = (stationId: string, itemId: string, val: string) => {
        const cleanVal = val.replace(',', '.');
        if (!/^\d*\.?\d*$/.test(cleanVal)) return;

        setStations(prev => {
            const newState = prev.map(s => s.id !== stationId ? s : {
                ...s,
                items: s.items.map(i => i.id !== itemId ? i : { ...i, amount: cleanVal })
            });
            const active = newState.find(s => s.id === stationId);
            if (active) saveLocalSession(stationId, active.items);
            return newState;
        });
    };

    const addManualItem = (stationId: string) => {
        const name = prompt("Название продукта:");
        if (!name) return;
        const unit = prompt("Ед. изм. (кг, шт, л):", "кг") || "кг";
        
        const newItem: InvItem = { id: uuidv4(), name, unit, amount: '' };
        
        setStations(prev => {
            const newState = prev.map(s => s.id !== stationId ? s : {
                ...s, items: [newItem, ...s.items]
            });
            const active = newState.find(s => s.id === stationId);
            if (active) saveLocalSession(stationId, active.items);
            return newState;
        });
    };

    const finishInventory = async () => {
        const station = stations.find(s => s.id === activeStationId);
        if (!station) return;

        const filledCount = station.items.filter(i => i.amount !== '').length;
        if (filledCount === 0) {
            if (!confirm("Ни одна позиция не заполнена. Завершить?")) return;
        } else if (filledCount < station.items.length) {
            if (!confirm(`Заполнено ${filledCount} из ${station.items.length}. Остальные будут считаться как 0. Продолжить?`)) return;
        }

        try {
            await apiFetch('/api/inventory/submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    stationId: activeStationId,
                    items: station.items,
                    createdBy: user ? `${user.first_name} ${user.last_name || ''}` : 'Unknown'
                })
            });
            
            addToast("Инвентаризация цеха завершена", "success");
            clearLocalSession();
            setActiveStationId(null);
            loadData();
        } catch (e) {
            addToast("Ошибка сохранения в базу", "error");
        }
    };

    // --- EXCEL IMPORT LOGIC ---
    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
            const bstr = evt.target?.result;
            const wb = XLSX.read(bstr, { type: 'binary' });
            setImportingFile(wb);
            setSheetMappings(wb.SheetNames.map(n => ({ original: n, mapped: n, selected: true })));
            setImportStep('sheets');
        };
        reader.readAsBinaryString(file);
    };

    const proceedToColumns = () => {
        const firstSelected = sheetMappings.find(s => s.selected);
        if (!firstSelected) return;
        
        const ws = importingFile.Sheets[firstSelected.original];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
        setExcelPreview(data.slice(0, 10)); // Preview first 10 rows
        setImportStep('columns');
    };

    const finalizeImport = async () => {
        setIsLoading(true);
        const newStations: InvStation[] = [];

        sheetMappings.filter(s => s.selected).forEach(s => {
            const ws = importingFile.Sheets[s.original];
            const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
            
            const items: InvItem[] = rows.slice(1).map(row => ({
                id: uuidv4(),
                name: String(row[columnMapping.name] || ''),
                unit: String(row[columnMapping.unit] || 'кг'),
                amount: '',
                initialAmount: String(row[columnMapping.amount] || '0')
            })).filter(i => i.name.trim() !== '');

            newStations.push({ id: uuidv4(), name: s.mapped || s.original, items });
        });

        try {
            await apiFetch('/api/inventory/setup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newStations)
            });
            addToast("База инвентаризации обновлена", "success");
            setImportStep('none');
            loadData();
        } catch (e) {
            addToast("Ошибка импорта", "error");
        } finally {
            setIsLoading(false);
        }
    };

    const exportSummary = async () => {
        addToast("Формирую Excel...", "info");
        try {
            const res = await apiFetch('/api/inventory/export');
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Summary_Inventory_${new Date().toLocaleDateString()}.xlsx`;
            a.click();
        } catch (e) {
            addToast("Ошибка экспорта", "error");
        }
    };

    return (
        <div className="pb-24 animate-fade-in min-h-screen bg-[#f2f4f7] dark:bg-[#0f1115] relative">
            <input type="file" ref={fileInputRef} className="hidden" accept=".xlsx,.xls" onChange={handleFileSelect} />
            
            {/* Header */}
            <div className="pt-safe-top px-5 pb-4 sticky top-0 z-40 bg-[#f2f4f7]/95 dark:bg-[#0f1115]/95 backdrop-blur-md border-b border-gray-100 dark:border-white/5">
                <div className="flex items-center justify-between pt-4 mb-4">
                    <div className="flex items-center gap-3">
                        <button onClick={() => activeStationId ? setActiveStationId(null) : navigate('/')} className="w-10 h-10 rounded-full bg-white dark:bg-[#1e1e24] shadow-sm flex items-center justify-center text-gray-900 dark:text-white border border-gray-100 dark:border-white/5 active:scale-95 transition">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
                        </button>
                        <div>
                            <h1 className="text-2xl font-black text-gray-900 dark:text-white leading-none">
                                {activeStationId ? stations.find(s => s.id === activeStationId)?.name : 'Инвентарь'}
                            </h1>
                            <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">
                                {activeStationId ? 'Бланк подсчета' : 'Цехи и Станции'}
                            </p>
                        </div>
                    </div>

                    <div className="flex gap-2">
                        {activeStationId && (
                            <button onClick={() => addManualItem(activeStationId)} className="w-10 h-10 rounded-full bg-sky-500 text-white flex items-center justify-center shadow-lg active:scale-95 transition">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                            </button>
                        )}
                        {!activeStationId && isAdmin && (
                            <button onClick={() => fileInputRef.current?.click()} className="w-10 h-10 rounded-full bg-green-600 text-white flex items-center justify-center shadow-lg active:scale-95 transition">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
                            </button>
                        )}
                    </div>
                </div>

                {/* Local Search in Active Sheet */}
                {activeStationId && (
                    <div className="relative">
                        <input 
                            type="text" 
                            className="w-full bg-white dark:bg-[#1e1e24] rounded-xl py-2 px-4 pl-10 text-sm outline-none border border-gray-100 dark:border-white/5"
                            placeholder="Поиск продукта..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                        <svg className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                    </div>
                )}
            </div>

            <div className="px-5 space-y-4 pt-4">
                {isLoading ? (
                    <div className="text-center py-10 opacity-50"><div className="animate-spin text-sky-500 text-2xl">⏳</div></div>
                ) : activeStationId ? (
                    /* --- ACTIVE INVENTORY SHEET --- */
                    <div className="space-y-3 pb-20">
                        {stations.find(s => s.id === activeStationId)?.items
                            .filter(i => i.name.toLowerCase().includes(search.toLowerCase()))
                            .map(item => (
                                <div key={item.id} className="bg-white dark:bg-[#1e1e24] p-4 rounded-2xl shadow-sm flex items-center justify-between gap-4 border border-gray-100 dark:border-white/5">
                                    <div className="min-w-0">
                                        <h3 className="font-bold text-gray-900 dark:text-white text-sm truncate">{item.name}</h3>
                                        <p className="text-[10px] text-gray-400 font-bold uppercase">{item.unit}</p>
                                    </div>
                                    <input 
                                        type="text" 
                                        inputMode="decimal"
                                        placeholder="0.0"
                                        className="w-24 bg-gray-50 dark:bg-black/20 rounded-xl px-2 py-3 text-center font-black text-lg text-sky-500 outline-none focus:ring-2 focus:ring-sky-500/30"
                                        value={item.amount}
                                        onChange={e => handleAmountChange(activeStationId, item.id, e.target.value)}
                                    />
                                </div>
                            ))}
                        
                        <div className="fixed bottom-8 left-5 right-5 z-50">
                            <button onClick={finishInventory} className="w-full bg-gray-900 dark:bg-white text-white dark:text-black font-black py-4 rounded-2xl shadow-2xl active:scale-95 transition-all text-lg">
                                Завершить и сохранить
                            </button>
                        </div>
                    </div>
                ) : (
                    /* --- STATION LIST --- */
                    <div className="space-y-6">
                        {/* Admin Tools Banner */}
                        {isAdmin && stations.length > 0 && (
                            <div className="grid grid-cols-2 gap-3">
                                <button onClick={exportSummary} className="bg-white dark:bg-[#1e1e24] p-4 rounded-2xl border border-gray-100 dark:border-white/5 flex flex-col items-center gap-2 active:scale-95 transition shadow-sm">
                                    <span className="text-xl">📊</span>
                                    <span className="text-[10px] font-black uppercase text-gray-400">Сводная Excel</span>
                                </button>
                                <button onClick={() => setShowHistory(true)} className="bg-white dark:bg-[#1e1e24] p-4 rounded-2xl border border-gray-100 dark:border-white/5 flex flex-col items-center gap-2 active:scale-95 transition shadow-sm">
                                    <span className="text-xl">📂</span>
                                    <span className="text-[10px] font-black uppercase text-gray-400">Архив 3 мес</span>
                                </button>
                            </div>
                        )}

                        <div className="grid grid-cols-1 gap-3">
                            {stations.map(station => {
                                const isLocked = sessionLockedBy && sessionLockedBy !== station.id;
                                const inProgress = sessionLockedBy === station.id;

                                return (
                                    <div 
                                        key={station.id} 
                                        onClick={() => !isLocked && startInventory(station.id)}
                                        className={`bg-white dark:bg-[#1e1e24] p-5 rounded-[2rem] shadow-sm flex items-center justify-between border-2 transition-all cursor-pointer ${inProgress ? 'border-sky-500 scale-[1.02] shadow-xl' : 'border-transparent opacity-100'} ${isLocked ? 'grayscale opacity-40 cursor-not-allowed' : 'active:scale-[0.98]'}`}
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl ${inProgress ? 'bg-sky-500 text-white' : 'bg-gray-50 dark:bg-black/20'}`}>
                                                🏢
                                            </div>
                                            <div>
                                                <h3 className="font-black text-lg dark:text-white leading-none mb-1">{station.name}</h3>
                                                <p className="text-xs text-gray-400 font-bold uppercase">{station.items.length} поз. в бланке</p>
                                            </div>
                                        </div>
                                        {inProgress ? (
                                            <span className="animate-pulse text-sky-500 font-black text-[10px] uppercase">В процессе...</span>
                                        ) : (
                                            <svg className="w-5 h-5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                        
                        {stations.length === 0 && (
                            <div className="text-center py-20 opacity-50">
                                <div className="text-4xl mb-4">🧊</div>
                                <p className="font-bold dark:text-white">База пуста</p>
                                {isAdmin && <p className="text-xs text-gray-400">Загрузите Excel файл в шапке</p>}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* --- IMPORT MODALS --- */}
            {importStep === 'sheets' && createPortal(
                <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
                    <div className="bg-white dark:bg-[#1e1e24] w-full max-w-sm rounded-[2rem] p-6 shadow-2xl">
                        <h2 className="text-xl font-black mb-4 dark:text-white">Листы и Цехи</h2>
                        <div className="space-y-2 max-h-[50vh] overflow-y-auto no-scrollbar mb-6">
                            {sheetMappings.map((s, i) => (
                                <div key={i} className="flex gap-2 items-center bg-gray-50 dark:bg-black/20 p-2 rounded-xl">
                                    <input type="checkbox" checked={s.selected} onChange={e => setSheetMappings(prev => prev.map((sm, idx) => idx === i ? { ...sm, selected: e.target.checked } : sm))} />
                                    <div className="flex-1">
                                        <p className="text-[10px] text-gray-400 font-bold uppercase">{s.original}</p>
                                        <input className="w-full bg-transparent text-sm font-bold dark:text-white outline-none" value={s.mapped} onChange={e => setSheetMappings(prev => prev.map((sm, idx) => idx === i ? { ...sm, mapped: e.target.value } : sm))} placeholder="Название цеха" />
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => setImportStep('none')} className="flex-1 py-3 bg-gray-100 dark:bg-white/5 rounded-xl font-bold text-gray-400">Отмена</button>
                            <button onClick={proceedToColumns} className="flex-1 py-3 bg-sky-500 text-white rounded-xl font-bold shadow-lg">Далее</button>
                        </div>
                    </div>
                </div>, document.body
            )}

            {importStep === 'columns' && createPortal(
                <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
                    <div className="bg-white dark:bg-[#1e1e24] w-full max-w-sm rounded-[2rem] p-6 shadow-2xl">
                        <h2 className="text-xl font-black mb-2 dark:text-white">Столбцы данных</h2>
                        <p className="text-xs text-gray-400 mb-6 font-bold uppercase tracking-widest">Укажите номера колонок (A=0, B=1...)</p>
                        
                        <div className="space-y-4 mb-8">
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-bold dark:text-white">Название:</span>
                                <input type="number" className="w-16 bg-gray-50 dark:bg-black/20 p-2 rounded-lg text-center font-bold dark:text-white" value={columnMapping.name} onChange={e => setColumnMapping({...columnMapping, name: parseInt(e.target.value)})} />
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-bold dark:text-white">Ед. изм.:</span>
                                <input type="number" className="w-16 bg-gray-50 dark:bg-black/20 p-2 rounded-lg text-center font-bold dark:text-white" value={columnMapping.unit} onChange={e => setColumnMapping({...columnMapping, unit: parseInt(e.target.value)})} />
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-bold dark:text-white">Остаток:</span>
                                <input type="number" className="w-16 bg-gray-50 dark:bg-black/20 p-2 rounded-lg text-center font-bold dark:text-white" value={columnMapping.amount} onChange={e => setColumnMapping({...columnMapping, amount: parseInt(e.target.value)})} />
                            </div>
                        </div>

                        <div className="flex gap-2">
                            <button onClick={() => setImportStep('sheets')} className="flex-1 py-3 bg-gray-100 dark:bg-white/5 rounded-xl font-bold text-gray-400">Назад</button>
                            <button onClick={finalizeImport} className="flex-1 py-3 bg-green-600 text-white rounded-xl font-bold shadow-lg">Загрузить</button>
                        </div>
                    </div>
                </div>, document.body
            )}
            
            {/* --- HISTORY MODAL --- */}
            {showHistory && createPortal(
                <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-end animate-fade-in">
                    <div className="bg-white dark:bg-[#1e1e24] w-full rounded-t-[3rem] p-6 max-h-[85vh] overflow-y-auto no-scrollbar animate-slide-up">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-2xl font-black dark:text-white">История (3 мес)</h2>
                            <button onClick={() => setShowHistory(false)} className="p-2 bg-gray-100 dark:bg-white/5 rounded-full"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg></button>
                        </div>
                        <div className="space-y-3 pb-10">
                            {history.map(rep => (
                                <div key={rep.id} className="p-4 bg-gray-50 dark:bg-black/20 rounded-2xl flex items-center justify-between">
                                    <div>
                                        <p className="font-bold text-sm dark:text-white">{new Date(rep.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</p>
                                        <p className="text-[10px] text-gray-400 uppercase font-bold">{rep.createdBy}</p>
                                    </div>
                                    <button className="text-sky-500 font-bold text-xs">Excel</button>
                                </div>
                            ))}
                            {history.length === 0 && <p className="text-center py-10 text-gray-400 italic">Нет завершенных отчетов</p>}
                        </div>
                    </div>
                </div>, document.body
            )}
        </div>
    );
};

export default Inventory;
