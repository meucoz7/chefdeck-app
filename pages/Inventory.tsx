
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
    const [isSummaryView, setIsSummaryView] = useState(false);
    const [isEditingStations, setIsEditingStations] = useState(false);
    
    // --- MODALS STATE ---
    const [showAddItemModal, setShowAddItemModal] = useState(false);
    const [newItemForm, setNewItemForm] = useState({ name: '', unit: 'кг' });

    const fileInputRef = useRef<HTMLInputElement>(null);

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

            const localSession = scopedStorage.getJson('active_inv_session', null);
            if (localSession) {
                setSessionLockedBy(localSession.stationId);
                setStations(prev => prev.map(s => s.id === localSession.stationId ? { ...s, items: localSession.items } : s));
            }
        } catch (e) {
            addToast("Ошибка загрузки данных", "error");
        } finally {
            setIsLoading(false);
        }
    };

    const saveLocalSession = (stationId: string, items: InvItem[]) => {
        scopedStorage.setJson('active_inv_session', { stationId, items, timestamp: Date.now() });
    };

    const clearLocalSession = () => {
        scopedStorage.removeItem('active_inv_session');
        setSessionLockedBy(null);
    };

    const startInventory = (id: string) => {
        if (isEditingStations) return;
        if (sessionLockedBy && sessionLockedBy !== id) {
            addToast("У вас уже открыт другой бланк!", "error");
            return;
        }
        setSessionLockedBy(id);
        setActiveStationId(id);
        const station = stations.find(s => s.id === id);
        if (station) saveLocalSession(id, station.items);
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

    const handleAddItem = () => {
        if (!newItemForm.name.trim() || !activeStationId) return;
        
        const newItem: InvItem = { 
            id: uuidv4(), 
            name: newItemForm.name.trim(), 
            unit: newItemForm.unit, 
            amount: '' 
        };
        
        setStations(prev => {
            const newState = prev.map(s => s.id !== activeStationId ? s : {
                ...s, items: [newItem, ...s.items]
            });
            const active = newState.find(s => s.id === activeStationId);
            if (active) saveLocalSession(activeStationId, active.items);
            return newState;
        });
        
        setShowAddItemModal(false);
        setNewItemForm({ name: '', unit: 'кг' });
        addToast("Позиция добавлена", "success");
    };

    const deleteItem = (stationId: string, itemId: string) => {
        if (!confirm("Удалить позицию из бланка?")) return;
        setStations(prev => {
            const newState = prev.map(s => s.id !== stationId ? s : {
                ...s, items: s.items.filter(i => i.id !== itemId)
            });
            const active = newState.find(s => s.id === stationId);
            if (active) saveLocalSession(stationId, active.items);
            return newState;
        });
    };

    const updateStationName = (id: string, newName: string) => {
        setStations(prev => prev.map(s => s.id === id ? { ...s, name: newName } : s));
    };

    const saveStationStructure = async () => {
        setIsLoading(true);
        try {
            await apiFetch('/api/inventory/setup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(stations)
            });
            addToast("Структура сохранена", "success");
            setIsEditingStations(false);
        } catch (e) {
            addToast("Ошибка сохранения", "error");
        } finally {
            setIsLoading(false);
        }
    };

    const finishInventory = async () => {
        const station = stations.find(s => s.id === activeStationId);
        if (!station) return;

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
            
            addToast("Бланк сохранен", "success");
            clearLocalSession();
            setActiveStationId(null);
            loadData();
        } catch (e) {
            addToast("Ошибка при отправке", "error");
        }
    };

    // --- AGGREGATION LOGIC ---
    const summaryData = useMemo(() => {
        const map = new Map<string, { name: string, unit: string, total: number, breakdown: { station: string, amount: number }[] }>();
        
        stations.forEach(station => {
            station.items.forEach(item => {
                const key = `${item.name.toLowerCase().trim()}_${item.unit.toLowerCase().trim()}`;
                const amount = parseFloat(item.amount) || 0;
                
                const existing = map.get(key) || { name: item.name, unit: item.unit, total: 0, breakdown: [] };
                existing.total += amount;
                if (amount > 0) {
                    existing.breakdown.push({ station: station.name, amount });
                }
                map.set(key, existing);
            });
        });
        
        return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
    }, [stations]);

    return (
        <div className="pb-safe-bottom animate-fade-in min-h-screen bg-[#f2f4f7] dark:bg-[#0f1115] relative">
            
            {/* Header */}
            <div className="pt-safe-top px-5 pb-4 sticky top-0 z-40 bg-[#f2f4f7]/95 dark:bg-[#0f1115]/95 backdrop-blur-md border-b border-gray-100 dark:border-white/5">
                <div className="flex items-center justify-between pt-4 mb-4">
                    <div className="flex items-center gap-3">
                        <button onClick={() => {
                            if (activeStationId) setActiveStationId(null);
                            else if (isSummaryView) setIsSummaryView(false);
                            else navigate('/');
                        }} className="w-10 h-10 rounded-full bg-white dark:bg-[#1e1e24] shadow-sm flex items-center justify-center text-gray-900 dark:text-white border border-gray-100 dark:border-white/5 active:scale-95 transition">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
                        </button>
                        <div>
                            <h1 className="text-2xl font-black text-gray-900 dark:text-white leading-none">
                                {isSummaryView ? 'Сводная' : (activeStationId ? stations.find(s => s.id === activeStationId)?.name : 'Инвентарь')}
                            </h1>
                            <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">
                                {isSummaryView ? 'Общий остаток' : (activeStationId ? 'Бланк подсчета' : 'Цехи и Станции')}
                            </p>
                        </div>
                    </div>

                    <div className="flex gap-2">
                        {activeStationId && !isSummaryView && (
                            <button onClick={() => setShowAddItemModal(true)} className="w-10 h-10 rounded-full bg-sky-500 text-white flex items-center justify-center shadow-lg active:scale-95 transition">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                            </button>
                        )}
                        {!activeStationId && !isSummaryView && isAdmin && (
                             <button onClick={() => isEditingStations ? saveStationStructure() : setIsEditingStations(true)} className={`w-10 h-10 rounded-full shadow-sm flex items-center justify-center transition active:scale-95 border border-gray-100 dark:border-white/10 ${isEditingStations ? 'bg-green-500 text-white' : 'bg-white dark:bg-[#1e1e24] text-gray-600 dark:text-gray-400'}`}>
                                {isEditingStations ? '✓' : '⚙️'}
                            </button>
                        )}
                    </div>
                </div>

                {(activeStationId || isSummaryView) && (
                    <div className="relative">
                        <input 
                            type="text" 
                            className="w-full bg-white dark:bg-[#1e1e24] rounded-xl py-2 px-4 pl-10 text-sm outline-none border border-gray-100 dark:border-white/5 dark:text-white"
                            placeholder="Поиск..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                        <svg className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                    </div>
                )}
            </div>

            <div className="px-5 space-y-4 pt-4">
                {isLoading ? (
                    <div className="text-center py-20 opacity-50"><div className="animate-spin text-sky-500 text-2xl">⏳</div></div>
                ) : isSummaryView ? (
                    /* --- READ ONLY SUMMARY VIEW (ADMINS ONLY) --- */
                    <div className="space-y-2 pb-20">
                        {summaryData
                            .filter(i => i.name.toLowerCase().includes(search.toLowerCase()))
                            .map((item, idx) => (
                                <div key={idx} className="bg-white dark:bg-[#1e1e24] p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-white/5">
                                    <div className="flex justify-between items-center">
                                        <h3 className="font-bold text-gray-900 dark:text-white text-sm">{item.name}</h3>
                                        <div className="flex items-center gap-1.5">
                                            <span className="font-black text-sky-500 text-lg">{item.total.toFixed(2).replace(/\.?0+$/, '')}</span>
                                            <span className="text-[10px] text-gray-400 font-bold uppercase">{item.unit}</span>
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap gap-1.5 mt-2">
                                        {item.breakdown.map((b, i) => (
                                            <span key={i} className="text-[8px] font-black px-2 py-0.5 rounded-md bg-gray-50 dark:bg-white/5 text-gray-500 dark:text-gray-400">
                                                {b.station}: {b.amount}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            ))}
                    </div>
                ) : activeStationId ? (
                    /* --- ACTIVE FILLABLE SHEET --- */
                    <div className="space-y-2 pb-20">
                        {stations.find(s => s.id === activeStationId)?.items
                            .filter(i => i.name.toLowerCase().includes(search.toLowerCase()))
                            .map(item => (
                                <div key={item.id} className="bg-white dark:bg-[#1e1e24] p-3 rounded-2xl shadow-sm flex items-center justify-between gap-4 border border-gray-100 dark:border-white/5">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                            <h3 className="font-bold text-gray-900 dark:text-white text-sm truncate">{item.name}</h3>
                                            {isAdmin && isEditingStations && (
                                                <button onClick={() => deleteItem(activeStationId, item.id)} className="text-red-500 p-1 opacity-50 hover:opacity-100 transition">✕</button>
                                            )}
                                        </div>
                                        <p className="text-[10px] text-gray-400 font-bold uppercase">{item.unit}</p>
                                    </div>
                                    <input 
                                        type="text" 
                                        inputMode="decimal"
                                        placeholder="0.0"
                                        className="w-20 bg-gray-50 dark:bg-black/20 rounded-xl px-2 py-2 text-center font-black text-base text-sky-500 outline-none focus:ring-2 focus:ring-sky-500/30"
                                        value={item.amount}
                                        onChange={e => handleAmountChange(activeStationId, item.id, e.target.value)}
                                    />
                                </div>
                            ))}
                        <div className="fixed bottom-8 left-5 right-5 z-50">
                            <button onClick={finishInventory} className="w-full bg-gray-900 dark:bg-white text-white dark:text-black font-black py-4 rounded-2xl shadow-2xl active:scale-95 transition-all text-lg">
                                Сохранить бланк
                            </button>
                        </div>
                    </div>
                ) : (
                    /* --- BLANKS LIST (STATIONS) --- */
                    <div className="space-y-6">
                        {isAdmin && (
                            <div className="grid grid-cols-2 gap-3">
                                <button onClick={() => setIsSummaryView(true)} className="bg-sky-500 text-white p-4 rounded-[1.8rem] flex flex-col items-center gap-2 active:scale-95 transition shadow-lg shadow-sky-500/30">
                                    <span className="text-2xl">📊</span>
                                    <span className="text-[10px] font-black uppercase">Сводный остаток</span>
                                </button>
                                <button onClick={() => setShowHistory(true)} className="bg-white dark:bg-[#1e1e24] p-4 rounded-[1.8rem] border border-gray-100 dark:border-white/5 flex flex-col items-center gap-2 active:scale-95 transition shadow-sm">
                                    <span className="text-2xl">📂</span>
                                    <span className="text-[10px] font-black uppercase text-gray-400">Архив отчетов</span>
                                </button>
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-3">
                            {stations.map(station => {
                                const isLocked = sessionLockedBy && sessionLockedBy !== station.id;
                                const inProgress = sessionLockedBy === station.id;
                                const filledItems = station.items.filter(i => i.amount !== '').length;
                                const progress = station.items.length > 0 ? Math.round((filledItems / station.items.length) * 100) : 0;

                                return (
                                    <div 
                                        key={station.id} 
                                        onClick={() => !isLocked && startInventory(station.id)}
                                        className={`bg-white dark:bg-[#1e1e24] p-4 rounded-[1.8rem] shadow-sm flex flex-col justify-between border-2 transition-all cursor-pointer aspect-square ${inProgress ? 'border-sky-500' : 'border-transparent'} ${isLocked ? 'grayscale opacity-40' : 'active:scale-[0.98]'}`}
                                    >
                                        <div className="flex flex-col items-center text-center mt-2">
                                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl mb-3 ${inProgress ? 'bg-sky-500 text-white' : 'bg-gray-50 dark:bg-white/5 dark:text-gray-400'}`}>
                                                🏢
                                            </div>
                                            {isEditingStations ? (
                                                <input 
                                                    autoFocus
                                                    className="w-full text-center bg-transparent font-black text-xs dark:text-white outline-none border-b border-sky-500/30"
                                                    value={station.name}
                                                    onChange={e => updateStationName(station.id, e.target.value)}
                                                    onClick={e => e.stopPropagation()}
                                                />
                                            ) : (
                                                <h3 className="font-black text-xs dark:text-white leading-tight line-clamp-2 uppercase tracking-tighter">{station.name}</h3>
                                            )}
                                        </div>
                                        
                                        <div className="mt-auto pt-4">
                                            <div className="w-full h-1 bg-gray-100 dark:bg-white/5 rounded-full overflow-hidden mb-2">
                                                <div className={`h-full transition-all duration-700 ${inProgress ? 'bg-sky-500' : 'bg-gray-300'}`} style={{ width: `${progress}%` }}></div>
                                            </div>
                                            <div className="flex justify-between items-center text-[8px] font-black uppercase text-gray-400">
                                                <span>{filledItems}/{station.items.length} поз</span>
                                                {inProgress && <span className="text-sky-500 animate-pulse">В работе</span>}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            {/* --- ADD ITEM MODAL --- */}
            {showAddItemModal && createPortal(
                <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-md flex items-center justify-center p-6 animate-fade-in" onClick={() => setShowAddItemModal(false)}>
                    <div className="bg-white dark:bg-[#1e1e24] w-full max-w-sm rounded-[2rem] p-6 shadow-2xl animate-slide-up" onClick={e => e.stopPropagation()}>
                        <h2 className="text-xl font-black mb-4 dark:text-white">Новая позиция</h2>
                        <div className="space-y-4 mb-6">
                            <div>
                                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Название продукта</label>
                                <input 
                                    autoFocus
                                    className="w-full bg-gray-50 dark:bg-black/20 rounded-xl px-4 py-3 font-bold dark:text-white outline-none focus:ring-2 focus:ring-sky-500/20" 
                                    placeholder="Напр. Соль поваренная"
                                    value={newItemForm.name}
                                    onChange={e => setNewItemForm({...newItemForm, name: e.target.value})}
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Единица измерения</label>
                                <div className="flex gap-2 flex-wrap mt-1">
                                    {['кг', 'л', 'шт', 'уп', 'порц'].map(u => (
                                        <button 
                                            key={u}
                                            onClick={() => setNewItemForm({...newItemForm, unit: u})}
                                            className={`px-3 py-1.5 rounded-lg text-[10px] font-black transition uppercase ${newItemForm.unit === u ? 'bg-sky-500 text-white shadow-md' : 'bg-gray-100 dark:bg-white/5 text-gray-400'}`}
                                        >
                                            {u}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => setShowAddItemModal(false)} className="flex-1 py-3 bg-gray-100 dark:bg-white/5 rounded-xl font-bold text-gray-400">Отмена</button>
                            <button onClick={handleAddItem} className="flex-1 py-3 bg-sky-500 text-white rounded-xl font-bold shadow-lg">Добавить</button>
                        </div>
                    </div>
                </div>, document.body
            )}
            
            {/* HISTORY MODAL */}
            {showHistory && createPortal(
                <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-end animate-fade-in" onClick={() => setShowHistory(false)}>
                    <div className="bg-white dark:bg-[#1e1e24] w-full rounded-t-[3rem] p-6 max-h-[85vh] overflow-y-auto no-scrollbar animate-slide-up" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-2xl font-black dark:text-white">Архив бланков</h2>
                            <button onClick={() => setShowHistory(false)} className="p-2 bg-gray-100 dark:bg-white/10 rounded-full text-gray-400"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button>
                        </div>
                        <div className="space-y-3 pb-10">
                            {history.length === 0 ? (
                                <p className="text-center py-10 text-gray-400 font-bold uppercase text-[10px]">История пуста</p>
                            ) : (
                                history.map(rep => (
                                    <div key={rep.id} className="p-4 bg-gray-50 dark:bg-white/5 rounded-2xl flex items-center justify-between border border-transparent dark:border-white/5">
                                        <div className="min-w-0">
                                            <p className="font-bold text-sm dark:text-white truncate uppercase tracking-tighter">{rep.stations[0]?.name || 'Бланк'}</p>
                                            <p className="text-[9px] text-gray-400 uppercase font-bold">{new Date(rep.date).toLocaleString('ru-RU')}</p>
                                        </div>
                                        <span className="text-sky-500 font-black text-[10px] bg-sky-50 dark:bg-sky-500/10 px-2 py-1 rounded-lg uppercase">{rep.stations[0]?.items?.length || 0} поз.</span>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>, document.body
            )}
        </div>
    );
};

export default Inventory;
