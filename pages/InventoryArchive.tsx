
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import * as XLSX from 'xlsx';
import { InventoryCycle, InventorySheet } from '../types';
import { useTelegram } from '../context/TelegramContext';
import { useToast } from '../context/ToastContext';
import { apiFetch } from '../services/api';

const InventoryArchive: React.FC = () => {
    const navigate = useNavigate();
    const { isAdmin } = useTelegram();
    const { addToast } = useToast();
    
    const [cycles, setCycles] = useState<InventoryCycle[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedCycle, setSelectedCycle] = useState<InventoryCycle | null>(null);
    const [expandedMonth, setExpandedMonth] = useState<string | null>(null);
    const [detailMode, setDetailMode] = useState<'summary' | 'sheets'>('summary');

    useEffect(() => {
        if (!isAdmin) { navigate('/'); return; }
        loadArchives();
    }, [isAdmin]);

    const loadArchives = async () => {
        setIsLoading(true);
        try {
            const res = await apiFetch('/api/inventory');
            const data = await res.json();
            // Only show finalized cycles in folders
            setCycles(data.filter((c: any) => c.isFinalized));
        } catch (e) {
            addToast("Ошибка загрузки архива", "error");
        } finally {
            setIsLoading(false);
        }
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

    const getConsolidatedData = (cycle: InventoryCycle) => {
        const aggregation: Record<string, { name: string; unit: string; totalActual: number }> = {};
        cycle.sheets.forEach(sheet => {
            sheet.items.forEach(item => {
                if (item.actual === undefined) return;
                const key = `${item.name.toLowerCase().trim()}_${item.unit.toLowerCase().trim()}`;
                if (!aggregation[key]) {
                    aggregation[key] = { name: item.name, unit: item.unit, totalActual: 0 };
                }
                aggregation[key].totalActual += item.actual;
            });
        });
        return Object.values(aggregation).sort((a, b) => a.name.localeCompare(b.name));
    };

    const exportCycle = (cycle: InventoryCycle) => {
        const data = getConsolidatedData(cycle);
        const excelRows = data.map(d => ({
            "Наименование": d.name,
            "Ед. изм.": d.unit,
            "Итоговый остаток (Все станции)": d.totalActual.toFixed(3).replace(/\.?0+$/, '')
        }));
        const ws = XLSX.utils.json_to_sheet(excelRows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Итоги");
        XLSX.writeFile(wb, `Inv_Full_${new Date(cycle.date).toISOString().split('T')[0]}.xlsx`);
        addToast("Сводная выгружена", "success");
    };

    if (isLoading) return <div className="flex items-center justify-center h-screen"><div className="animate-spin text-purple-500">⏳</div></div>;

    return (
        <div className="pb-24 animate-fade-in min-h-screen bg-[#f2f4f7] dark:bg-[#0f1115]">
            <div className="pt-safe-top px-5 pb-4 sticky top-0 z-40 bg-[#f2f4f7]/95 dark:bg-[#0f1115]/95 backdrop-blur-md border-b border-gray-100 dark:border-white/5">
                <div className="flex items-center gap-3 pt-4">
                    <button onClick={() => navigate('/inventory')} className="w-10 h-10 rounded-full bg-white dark:bg-[#1e1e24] shadow-sm flex items-center justify-center dark:text-white active:scale-95 transition">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
                    </button>
                    <div>
                        <h1 className="text-xl font-black text-gray-900 dark:text-white leading-none">Архив Инвента</h1>
                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">История по месяцам</p>
                    </div>
                </div>
            </div>

            <div className="px-5 pt-6 space-y-4">
                {groupedArchives.length === 0 ? (
                    <div className="text-center py-20 opacity-50 flex flex-col items-center">
                        <span className="text-6xl mb-4">📂</span>
                        <h3 className="font-bold dark:text-white">Архив пуст</h3>
                        <p className="text-xs text-gray-400 mt-2 px-10 leading-tight uppercase">Завершенные циклы появятся здесь автоматически</p>
                    </div>
                ) : (
                    groupedArchives.map(([month, monthCycles]) => {
                        const isExpanded = expandedMonth === month;
                        return (
                            <div key={month} className="space-y-2">
                                {/* FOLDER VIEW */}
                                <div 
                                    onClick={() => setExpandedMonth(isExpanded ? null : month)}
                                    className="bg-white dark:bg-[#1e1e24] p-5 rounded-[2rem] shadow-sm border border-gray-100 dark:border-white/5 flex items-center justify-between active:scale-[0.98] transition cursor-pointer"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="text-3xl">📁</div>
                                        <div>
                                            <h3 className="font-black text-gray-900 dark:text-white uppercase text-sm tracking-tight">{month}</h3>
                                            <p className="text-[9px] text-gray-400 font-bold uppercase">{monthCycles.length} завершенных цикла</p>
                                        </div>
                                    </div>
                                    <svg className={`w-5 h-5 text-gray-300 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
                                </div>

                                {/* CONTENTS */}
                                {isExpanded && (
                                    <div className="grid gap-2 pl-4 animate-slide-up">
                                        {monthCycles.map(c => (
                                            <div key={c.id} className="bg-white dark:bg-[#1e1e24] p-4 rounded-3xl shadow-sm border border-gray-100 dark:border-white/5 flex items-center justify-between group">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-2xl bg-purple-50 dark:bg-purple-500/10 flex items-center justify-center text-xl">📄</div>
                                                    <div>
                                                        <h4 className="font-bold text-gray-900 dark:text-white text-xs">{new Date(c.date).toLocaleDateString('ru-RU')}</h4>
                                                        <p className="text-[8px] text-gray-400 font-black uppercase">{c.sheets.length} станций</p>
                                                    </div>
                                                </div>
                                                <div className="flex gap-1.5">
                                                    <button onClick={() => setSelectedCycle(c)} className="w-8 h-8 rounded-xl bg-gray-100 dark:bg-white/5 flex items-center justify-center text-gray-400 hover:text-purple-500 transition active:scale-90"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg></button>
                                                    <button onClick={() => exportCycle(c)} className="w-8 h-8 rounded-xl bg-gray-100 dark:bg-white/5 flex items-center justify-center text-gray-400 hover:text-green-500 transition active:scale-90"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg></button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )
                    })
                )}
            </div>

            {/* DETAIL MODAL */}
            {selectedCycle && createPortal(
                <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-md animate-fade-in p-4">
                    <div className="bg-white dark:bg-[#1e1e24] w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col h-[85vh]">
                        <div className="p-6 border-b border-gray-100 dark:border-white/5 flex justify-between items-center bg-gray-50/50 dark:bg-black/20">
                            <div>
                                <h2 className="text-xl font-black dark:text-white leading-none">Отчет: {new Date(selectedCycle.date).toLocaleDateString()}</h2>
                                <p className="text-[9px] text-gray-400 font-bold uppercase mt-2">Архивировано: {selectedCycle.createdBy}</p>
                            </div>
                            <button onClick={() => setSelectedCycle(null)} className="w-10 h-10 rounded-full bg-white dark:bg-white/5 shadow-sm flex items-center justify-center">✕</button>
                        </div>
                        
                        <div className="flex p-2 bg-gray-100 dark:bg-black/40 mx-6 mt-4 rounded-2xl">
                            <button onClick={() => setDetailMode('summary')} className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition ${detailMode === 'summary' ? 'bg-white dark:bg-[#2a2a35] text-purple-500 shadow-sm' : 'text-gray-400'}`}>Сводная Итого</button>
                            <button onClick={() => setDetailMode('sheets')} className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition ${detailMode === 'sheets' ? 'bg-white dark:bg-[#2a2a35] text-purple-500 shadow-sm' : 'text-gray-400'}`}>По станциям</button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 no-scrollbar">
                            {detailMode === 'summary' ? (
                                <table className="w-full text-left border-collapse">
                                    <thead className="text-[8px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100 dark:border-white/5">
                                        <tr><th className="pb-4">Товар</th><th className="pb-4 text-right">Сумма Факт</th></tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50 dark:divide-white/5">
                                        {getConsolidatedData(selectedCycle).map((d, i) => (
                                            <tr key={i} className="group">
                                                <td className="py-3 pr-2">
                                                    <div className="font-bold text-gray-800 dark:text-gray-200 text-xs">{d.name}</div>
                                                    <div className="text-[8px] text-gray-400 font-black uppercase">{d.unit}</div>
                                                </td>
                                                <td className="py-3 text-right font-mono font-black text-purple-500 text-xs">
                                                    {d.totalActual.toFixed(3).replace(/\.?0+$/, '')}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            ) : (
                                <div className="space-y-6">
                                    {selectedCycle.sheets.map(sheet => (
                                        <div key={sheet.id} className="space-y-3">
                                            <div className="flex items-center gap-2">
                                                <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                                                <h4 className="text-xs font-black dark:text-white uppercase tracking-wider">{sheet.title}</h4>
                                            </div>
                                            <div className="bg-gray-50 dark:bg-black/20 rounded-2xl p-4 space-y-2">
                                                {sheet.items.map(item => (
                                                    <div key={item.id} className="flex justify-between items-center text-[11px]">
                                                        <span className="text-gray-600 dark:text-gray-400 font-medium">{item.name}</span>
                                                        <span className="font-black dark:text-white">{item.actual ?? '—'} <span className="opacity-40 text-[8px]">{item.unit}</span></span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
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
