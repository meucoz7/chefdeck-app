
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import * as XLSX from 'xlsx';
import { InventoryCycle, InventorySheet, InventoryItem } from '../types';
import { useTelegram } from '../context/TelegramContext';
import { useToast } from '../context/ToastContext';
import { apiFetch } from '../services/api';

const SkeletonFolder = () => (
    <div className="bg-white dark:bg-[#1e1e24] p-5 rounded-[2rem] border border-gray-100 dark:border-white/5 animate-pulse flex items-center justify-between mb-3 shadow-sm">
        <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gray-100 dark:bg-white/5"></div>
            <div>
                <div className="h-4 bg-gray-200 dark:bg-white/10 rounded w-24 mb-2"></div>
                <div className="h-3 bg-gray-100 dark:bg-white/5 rounded w-16"></div>
            </div>
        </div>
    </div>
);

const InventoryArchive: React.FC = () => {
    const navigate = useNavigate();
    const { isAdmin } = useTelegram();
    const { addToast } = useToast();
    
    const [cycles, setCycles] = useState<InventoryCycle[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedCycle, setSelectedCycle] = useState<InventoryCycle | null>(null);
    const [activeStationId, setActiveStationId] = useState<string | null>(null);
    const [expandedMonth, setExpandedMonth] = useState<string | null>(null);

    useEffect(() => { loadArchives(); }, []);

    const loadArchives = async () => {
        setIsLoading(true);
        try {
            const res = await apiFetch('/api/inventory');
            const data = await res.json();
            setCycles(data.filter((c: any) => c.isFinalized));
        } catch (e) { addToast("Ошибка архива", "error"); }
        finally { setTimeout(() => setIsLoading(false), 500); }
    };

    const clearArchive = async () => {
        if (!confirm("Удалить весь архив инвентаризаций?")) return;
        try { await apiFetch('/api/inventory/archive/all', { method: 'DELETE' }); setCycles([]); addToast("Архив очищен", "success"); }
        catch (e) { addToast("Ошибка", "error"); }
    };

    const exportArchiveToExcel = (cycle: InventoryCycle) => {
        const wb = XLSX.utils.book_new();
        const aggregate: Record<string, { code: string; name: string; unit: string; actual: number }> = {};
        cycle.sheets.forEach(s => {
            s.items.forEach(it => {
                const key = `${it.code || ''}_${it.name}_${it.unit}`;
                if (!aggregate[key]) aggregate[key] = { code: it.code || '', name: it.name, unit: it.unit, actual: 0 };
                aggregate[key].actual += (it.actual || 0);
            });
        });
        const summaryData = Object.values(aggregate).map(d => ({ "Код": d.code, "Товар": d.name, "Ед. изм.": d.unit, "Всего факт": d.actual }));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryData), "Сводная");
        cycle.sheets.forEach(sheet => {
            const sheetData = sheet.items.map(it => ({ "Код": it.code || '', "Товар": it.name, "Ед. изм.": it.unit, "Факт": it.actual || 0 }));
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheetData), sheet.title.substring(0, 31));
        });
        XLSX.writeFile(wb, `Report_${new Date(cycle.date).toLocaleDateString()}.xlsx`);
    };

    const groupedArchives = useMemo(() => {
        const groups: Record<string, InventoryCycle[]> = {};
        cycles.forEach(c => {
            const monthStr = new Date(c.date).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
            if (!groups[monthStr]) groups[monthStr] = [];
            groups[monthStr].push(c);
        });
        return Object.entries(groups).sort((a, b) => new Date(b[1][0].date).getTime() - new Date(a[1][0].date).getTime());
    }, [cycles]);

    const currentReportSheet = useMemo(() => {
        if (!selectedCycle || !activeStationId) return null;
        return selectedCycle.sheets.find(s => s.id === activeStationId);
    }, [selectedCycle, activeStationId]);

    const handleOpenReport = (cycle: InventoryCycle) => {
        setSelectedCycle(cycle);
        if (cycle.sheets.length > 0) setActiveStationId(cycle.sheets[0].id);
    };

    return (
        <div className="pb-24 animate-fade-in min-h-screen bg-[#f2f4f7] dark:bg-[#0f1115]">
            <div className="pt-safe-top px-5 pb-4 sticky top-0 z-40 bg-[#f2f4f7]/95 dark:bg-[#0f1115]/95 backdrop-blur-md border-b border-gray-100 dark:border-white/5">
                <div className="flex items-center justify-between pt-4">
                    <div className="flex items-center gap-3">
                        <button onClick={() => navigate('/inventory')} className="w-10 h-10 rounded-full bg-white dark:bg-[#1e1e24] shadow-sm flex items-center justify-center dark:text-white border border-gray-100 dark:border-white/5 active:scale-95 transition">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
                        </button>
                        <div>
                            <h1 className="text-xl font-black text-gray-900 dark:text-white leading-none">Архив</h1>
                            <p className="text-[10px] text-gray-400 font-bold uppercase mt-1 tracking-widest">История инвентаризаций</p>
                        </div>
                    </div>
                    {isAdmin && <button onClick={clearArchive} className="text-[10px] font-black uppercase text-red-500 tracking-tighter active:scale-95 transition">Очистить всё</button>}
                </div>
            </div>

            <div className="px-5 pt-6 space-y-4">
                {isLoading ? (
                    <div className="space-y-3">{[1, 2, 3].map(i => <SkeletonFolder key={i} />)}</div>
                ) : groupedArchives.length === 0 ? (
                    <div className="text-center py-20 opacity-40 flex flex-col items-center animate-fade-in">
                        <span className="text-6xl mb-6">📂</span>
                        <h3 className="font-black dark:text-white uppercase tracking-widest text-xs">Архив пуст</h3>
                    </div>
                ) : (
                    groupedArchives.map(([month, monthCycles]) => (
                        <div key={month} className="space-y-3">
                            <div onClick={() => setExpandedMonth(expandedMonth === month ? null : month)} className={`p-5 rounded-[2.5rem] border transition-all cursor-pointer flex items-center justify-between group ${expandedMonth === month ? 'bg-sky-500 text-white shadow-xl shadow-sky-500/20 border-sky-500' : 'bg-white dark:bg-[#1e1e24] shadow-sm border-gray-100 dark:border-white/5'}`}>
                                <div className="flex items-center gap-4">
                                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-xl transition-colors ${expandedMonth === month ? 'bg-white/20' : 'bg-gray-50 dark:bg-white/5'}`}>📁</div>
                                    <div>
                                        <h3 className={`font-black uppercase text-xs tracking-tight ${expandedMonth === month ? 'text-white' : 'text-gray-900 dark:text-white'}`}>{month}</h3>
                                        <p className={`text-[9px] font-black uppercase ${expandedMonth === month ? 'text-white/70' : 'text-gray-400'}`}>{monthCycles.length} отчетов</p>
                                    </div>
                                </div>
                                <svg className={`w-5 h-5 transition-transform ${expandedMonth === month ? 'rotate-180 text-white' : 'text-gray-300'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
                            </div>
                            {expandedMonth === month && (
                                <div className="grid gap-2 pl-4 animate-slide-up">
                                    {monthCycles.map(c => (
                                        <div key={c.id} onClick={() => handleOpenReport(c)} className="bg-white dark:bg-[#1e1e24] p-4 rounded-3xl shadow-sm border border-gray-100 dark:border-white/5 flex items-center justify-between active:scale-[0.98] transition cursor-pointer">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center text-xl shadow-inner">📊</div>
                                                <div>
                                                    <h4 className="font-black text-gray-900 dark:text-white text-[11px] uppercase tracking-tight">{new Date(c.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}</h4>
                                                    <p className="text-[8px] text-gray-400 font-black uppercase mt-0.5 tracking-tighter">{c.sheets.length} станций</p>
                                                </div>
                                            </div>
                                            <div className="text-gray-200"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg></div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>

            {selectedCycle && createPortal(
                <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-md animate-fade-in p-4">
                    <div className="bg-[#f2f4f7] dark:bg-[#0f1115] w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col h-[85vh] animate-scale-in">
                        <div className="p-6 bg-white dark:bg-[#1e1e24] border-b border-gray-100 dark:border-white/5 flex justify-between items-center shadow-sm">
                            <div>
                                <h2 className="text-xl font-black dark:text-white leading-none uppercase tracking-tight">{new Date(selectedCycle.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}</h2>
                                <p className="text-[9px] text-gray-400 font-black uppercase mt-1.5 tracking-widest">Архивный отчет</p>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => exportArchiveToExcel(selectedCycle)} className="w-10 h-10 rounded-2xl bg-emerald-600 text-white shadow-lg shadow-emerald-600/20 flex items-center justify-center transition active:scale-95">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M7.5 12l4.5 4.5m0 0l4.5-4.5M12 3v13.5" /></svg>
                                </button>
                                <button onClick={() => setSelectedCycle(null)} className="w-10 h-10 rounded-2xl bg-gray-100 dark:bg-white/5 text-gray-400 flex items-center justify-center transition active:scale-95">✕</button>
                            </div>
                        </div>

                        {/* Station Tabs */}
                        <div className="bg-white/50 dark:bg-white/5 border-b border-gray-100 dark:border-white/5 flex overflow-x-auto no-scrollbar px-4 py-3 gap-2 flex-shrink-0">
                            {selectedCycle.sheets.map(s => (
                                <button 
                                    key={s.id} 
                                    onClick={() => setActiveStationId(s.id)}
                                    className={`px-5 py-2.5 rounded-2xl text-[9px] font-black uppercase tracking-widest whitespace-nowrap transition-all active:scale-95 ${activeStationId === s.id ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'bg-white dark:bg-black/40 text-gray-400 shadow-sm border border-gray-100 dark:border-white/5'}`}
                                >
                                    {s.title}
                                </button>
                            ))}
                        </div>

                        {/* Items List */}
                        <div className="flex-1 overflow-y-auto p-4 no-scrollbar space-y-2">
                             {currentReportSheet ? (
                                 <div className="animate-fade-in pb-10">
                                     {currentReportSheet.items.map(it => (
                                         <div key={it.id} className="flex justify-between items-center p-4 bg-white dark:bg-[#1e1e24] rounded-3xl border border-gray-100 dark:border-white/5 shadow-sm mb-2 group transition-all hover:border-indigo-500/20">
                                             <div className="min-w-0 pr-4">
                                                 <p className="dark:text-white text-xs font-black uppercase tracking-tight truncate leading-tight group-hover:text-indigo-500 transition-colors">{it.name}</p>
                                                 {it.code && <p className="text-[9px] text-gray-400 font-bold uppercase mt-1 tracking-tighter">{it.code}</p>}
                                             </div>
                                             <div className="flex-shrink-0 text-right flex items-center gap-1.5">
                                                 <span className="text-indigo-600 dark:text-indigo-400 font-black text-sm">{it.actual || 0}</span>
                                                 <span className="text-[9px] text-gray-400 font-black uppercase tracking-widest">{it.unit}</span>
                                             </div>
                                         </div>
                                     ))}
                                 </div>
                             ) : (
                                 <div className="flex flex-col items-center justify-center py-20 opacity-30 italic">
                                     <span className="text-4xl mb-4">📍</span>
                                     <p className="text-sm font-bold uppercase tracking-widest">Выберите станцию</p>
                                 </div>
                             )}
                        </div>
                    </div>
                </div>, document.body
            )}
        </div>
    );
};

export default InventoryArchive;
