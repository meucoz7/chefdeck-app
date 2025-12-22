
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import * as XLSX from 'xlsx';
import { InventoryCycle } from '../types';
import { useTelegram } from '../context/TelegramContext';
import { useToast } from '../context/ToastContext';
import { apiFetch } from '../services/api';

const SkeletonFolder = () => (
    <div className="bg-white dark:bg-[#1e1e24] p-5 rounded-[2rem] border border-gray-100 dark:border-white/5 animate-pulse flex items-center justify-between mb-2">
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
    const [expandedMonth, setExpandedMonth] = useState<string | null>(null);

    useEffect(() => { loadArchives(); }, []);

    const loadArchives = async () => {
        setIsLoading(true);
        try {
            const res = await apiFetch('/api/inventory');
            const data = await res.json();
            setCycles(data.filter((c: any) => c.isFinalized));
        } catch (e) { addToast("Ошибка загрузки архива", "error"); }
        finally { setTimeout(() => setIsLoading(false), 500); }
    };

    const clearArchive = async () => {
        if (!confirm("Удалить весь архив инвентаризаций?")) return;
        try { await apiFetch('/api/inventory/archive/all', { method: 'DELETE' }); setCycles([]); addToast("Архив очищен", "success"); }
        catch (e) { addToast("Ошибка", "error"); }
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

    return (
        <div className="pb-24 animate-fade-in min-h-screen bg-[#f2f4f7] dark:bg-[#0f1115]">
            <div className="pt-safe-top px-5 pb-4 sticky top-0 z-40 bg-[#f2f4f7]/95 dark:bg-[#0f1115]/95 backdrop-blur-md border-b border-gray-100 dark:border-white/5">
                <div className="flex items-center justify-between pt-4">
                    <div className="flex items-center gap-3">
                        <button onClick={() => navigate('/inventory')} className="w-10 h-10 rounded-full bg-white dark:bg-[#1e1e24] shadow-sm flex items-center justify-center dark:text-white transition">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
                        </button>
                        <div>
                            <h1 className="text-xl font-black text-gray-900 dark:text-white leading-none">Архив</h1>
                            <p className="text-[10px] text-gray-400 font-bold uppercase mt-1 tracking-widest">История Инвентов</p>
                        </div>
                    </div>
                    {isAdmin && <button onClick={clearArchive} className="text-[10px] font-black uppercase text-red-500">Очистить всё</button>}
                </div>
            </div>

            <div className="px-5 pt-6 space-y-4">
                {isLoading ? (
                    <div className="space-y-3">{[1, 2, 3].map(i => <SkeletonFolder key={i} />)}</div>
                ) : groupedArchives.length === 0 ? (
                    <div className="text-center py-20 opacity-50 flex flex-col items-center">
                        <span className="text-6xl mb-4">📁</span>
                        <h3 className="font-bold dark:text-white">Архив пуст</h3>
                    </div>
                ) : (
                    groupedArchives.map(([month, monthCycles]) => (
                        <div key={month} className="space-y-2">
                            <div onClick={() => setExpandedMonth(expandedMonth === month ? null : month)} className="bg-white dark:bg-[#1e1e24] p-5 rounded-[2rem] shadow-sm border border-gray-100 dark:border-white/5 flex items-center justify-between transition cursor-pointer group">
                                <div className="flex items-center gap-4">
                                    <div className="text-3xl group-hover:scale-110 transition duration-300">📁</div>
                                    <div><h3 className="font-black text-gray-900 dark:text-white uppercase text-sm">{month}</h3><p className="text-[9px] text-gray-400 font-bold uppercase">{monthCycles.length} отчетов</p></div>
                                </div>
                                <svg className={`w-5 h-5 text-gray-300 transition-transform ${expandedMonth === month ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
                            </div>
                            {expandedMonth === month && (
                                <div className="grid gap-2 pl-4 animate-slide-up">
                                    {monthCycles.map(c => (
                                        <div key={c.id} onClick={() => setSelectedCycle(c)} className="bg-white dark:bg-[#1e1e24] p-4 rounded-3xl shadow-sm border border-gray-100 dark:border-white/5 flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-2xl bg-purple-50 dark:bg-purple-500/10 flex items-center justify-center text-xl">📄</div>
                                                <div><h4 className="font-bold text-gray-900 dark:text-white text-xs">{new Date(c.date).toLocaleDateString('ru-RU')}</h4><p className="text-[8px] text-gray-400 font-black uppercase">{c.sheets.length} станций</p></div>
                                            </div>
                                            <div className="text-gray-300"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg></div>
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
                    <div className="bg-white dark:bg-[#1e1e24] w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col h-[85vh]">
                        <div className="p-6 border-b border-gray-100 dark:border-white/5 flex justify-between items-center bg-gray-50/50 dark:bg-black/20">
                            <div><h2 className="text-xl font-black dark:text-white leading-none">{new Date(selectedCycle.date).toLocaleDateString()}</h2><p className="text-[9px] text-gray-400 font-bold uppercase mt-2">Архивный отчет</p></div>
                            <button onClick={() => setSelectedCycle(null)} className="w-10 h-10 rounded-full bg-white dark:bg-white/5 shadow-sm flex items-center justify-center transition">✕</button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6 no-scrollbar">
                             {selectedCycle.sheets.map(s => (
                                 <div key={s.id} className="mb-6">
                                     <h4 className="text-xs font-black dark:text-white uppercase mb-2 text-purple-500">{s.title}</h4>
                                     <div className="space-y-1">
                                         {s.items.map(it => (
                                             <div key={it.id} className="flex justify-between items-center p-2 bg-gray-50 dark:bg-black/20 rounded-lg text-xs font-bold">
                                                 <span className="dark:text-white">{it.name}</span>
                                                 <span className="text-purple-500">{it.actual || 0} {it.unit}</span>
                                             </div>
                                         ))}
                                     </div>
                                 </div>
                             ))}
                        </div>
                    </div>
                </div>, document.body
            )}
        </div>
    );
};

export default InventoryArchive;
