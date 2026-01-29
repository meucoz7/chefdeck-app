
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { v4 as uuidv4 } from 'uuid';
import * as XLSX from 'xlsx';
import { InventoryCycle, InventorySheet, InventoryItem, GlobalInventoryItem, AuditEntry } from '../types';
import { useToast } from '../context/ToastContext';
import { useTelegram } from '../context/TelegramContext';
import { apiFetch } from '../services/api';

// --- UTILS ---
const cleanMongoFields = (obj: any): any => {
    if (Array.isArray(obj)) {
        return obj.map(cleanMongoFields);
    } else if (obj !== null && typeof obj === 'object') {
        const newObj: any = {};
        for (const key in obj) {
            if (key !== '_id' && key !== '__v') {
                newObj[key] = cleanMongoFields(obj[key]);
            }
        }
        return newObj;
    }
    return obj;
};

const safeEval = (expr: string): number | null => {
    try {
        // Only allow numbers and basic math operators
        const cleanExpr = expr.replace(/[^-0-9+*/().,]/g, '').replace(',', '.');
        if (!cleanExpr || /^[0-9.]+$/.test(cleanExpr)) return null;
        const res = Function(`"use strict"; return (${cleanExpr})`)();
        return typeof res === 'number' && isFinite(res) ? res : null;
    } catch {
        return null;
    }
};

// --- UI COMPONENTS ---
const Modal: React.FC<{ 
    isOpen: boolean; 
    onClose: () => void; 
    title: string; 
    subtitle?: string; 
    children: React.ReactNode;
    footer?: React.ReactNode;
    maxWidth?: string;
}> = ({ isOpen, onClose, title, subtitle, children, footer, maxWidth = "max-w-sm" }) => {
    if (!isOpen) return null;
    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fade-in">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose}></div>
            <div className={`bg-white dark:bg-[#1e1e24] w-full ${maxWidth} rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col relative animate-scale-in max-h-[90vh]`}>
                <div className="p-6 border-b border-gray-100 dark:border-white/5 bg-gray-50/50 dark:bg-white/5 flex-shrink-0">
                    <div className="flex justify-between items-center">
                        <div>
                            <h2 className="text-xl font-black dark:text-white leading-none uppercase tracking-tight">{title}</h2>
                            {subtitle && <p className="text-[10px] text-gray-400 font-bold uppercase mt-1.5 tracking-wider">{subtitle}</p>}
                        </div>
                        <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 dark:bg-white/10 flex items-center justify-center text-gray-400">✕</button>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto no-scrollbar p-6">
                    {children}
                </div>
                {footer && (
                    <div className="p-6 bg-gray-50 dark:bg-white/5 border-t border-gray-100 dark:border-white/5 flex-shrink-0">
                        {footer}
                    </div>
                )}
            </div>
        </div>, document.body
    );
};

const CustomConfirm: React.FC<{
    isOpen: boolean; 
    onClose: () => void; 
    onConfirm: () => void; 
    title: string; 
    message: string; 
    confirmText?: string; 
    type?: 'danger' | 'success' | 'info';
}> = ({ isOpen, onClose, onConfirm, title, message, confirmText = "Подтвердить", type = 'info' }) => {
    return (
        <Modal isOpen={isOpen} onClose={onClose} title={title}>
            <div className="text-center py-4">
                <div className={`w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center text-2xl ${
                    type === 'danger' ? 'bg-red-100 text-red-600' : 
                    type === 'success' ? 'bg-emerald-100 text-emerald-600' : 'bg-sky-100 text-sky-600'
                }`}>
                    {type === 'danger' ? '⚠️' : type === 'success' ? '✅' : 'ℹ️'}
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-300 font-medium leading-relaxed">{message}</p>
                <div className="grid grid-cols-2 gap-3 mt-8">
                    <button onClick={onClose} className="py-3.5 bg-gray-100 dark:bg-white/5 rounded-2xl font-bold text-gray-500 uppercase text-[10px] tracking-widest">Отмена</button>
                    <button onClick={() => { onConfirm(); onClose(); }} className={`py-3.5 rounded-2xl font-black text-white uppercase text-[10px] tracking-widest shadow-lg ${
                        type === 'danger' ? 'bg-red-500 shadow-red-500/20' : 
                        type === 'success' ? 'bg-emerald-600 shadow-emerald-600/20' : 'bg-sky-500 shadow-sky-500/20'
                    }`}>
                        {confirmText}
                    </button>
                </div>
            </div>
        </Modal>
    );
};

// --- ROW COMPONENT ---
const InventoryItemRow = React.memo<{
    item: InventoryItem;
    cycleId: string;
    sheetId: string;
    onDelete: (id: string) => void;
    onSync: (id: string, val: string) => void;
    readOnly?: boolean;
}>(({ item, cycleId, sheetId, onDelete, onSync, readOnly }) => {
    const draftKey = `inv_draft_${cycleId}_${sheetId}_${item.id}`;
    
    const [localValue, setLocalValue] = useState(() => {
        const saved = localStorage.getItem(draftKey);
        return saved !== null ? saved : (item.actual?.toString() || '');
    });

    const [isSaving, setIsSaving] = useState(false);
    const [calcResult, setCalcResult] = useState<number | null>(null);
    const [offsetX, setOffsetX] = useState(0);
    const [startX, setStartX] = useState(0);
    const [isSwiping, setIsSwiping] = useState(false);
    const { webApp } = useTelegram();
    const syncTimerRef = useRef<any>(null);

    useEffect(() => {
        if (!syncTimerRef.current) {
            const parentVal = item.actual?.toString() || '';
            if (parentVal !== localValue && !isSaving) {
                setLocalValue(parentVal);
                localStorage.removeItem(draftKey);
            }
        }
    }, [item.actual]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value.replace(',', '.');
        setLocalValue(val);
        localStorage.setItem(draftKey, val);

        // Expression evaluation
        const res = safeEval(val);
        setCalcResult(res);

        if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
        syncTimerRef.current = setTimeout(() => {
            const finalVal = safeEval(val) ?? parseFloat(val);
            if (!isNaN(finalVal)) {
                setIsSaving(true);
                onSync(item.id, finalVal.toString());
                if (webApp?.HapticFeedback) webApp.HapticFeedback.impactOccurred('light');
                setTimeout(() => setIsSaving(false), 2000);
            }
            syncTimerRef.current = null;
        }, 1200);
    };

    const handleBlur = () => {
        if (calcResult !== null) {
            const resultStr = calcResult.toString();
            setLocalValue(resultStr);
            setCalcResult(null);
            onSync(item.id, resultStr);
        }
    };

    return (
        <div className="relative overflow-hidden rounded-[1.8rem] mb-2 group bg-white dark:bg-[#1e1e24] shadow-sm border border-gray-100 dark:border-white/5 transition-all">
             {!readOnly && (
                <div className="absolute inset-y-0 right-0 w-[80px] bg-red-500 flex flex-col items-center justify-center cursor-pointer z-0" onClick={() => onDelete(item.id)}>
                    <svg className="w-5 h-5 text-white mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M14.74 9l-.346 9m-4.788 0L9.26 9" strokeWidth={2.5} /></svg>
                    <span className="text-[7px] text-white font-black uppercase">Удалить</span>
                </div>
            )}
            <div 
                style={{ transform: `translateX(${offsetX}px)`, touchAction: isSwiping ? 'pan-x' : 'pan-y' }}
                className="relative bg-white dark:bg-[#1e1e24] p-4 flex items-center justify-between transition-transform duration-200 ease-out z-10"
                onTouchStart={(e) => { if(!readOnly) setStartX(e.touches[0].clientX); }}
                onTouchMove={(e) => {
                    if(readOnly) return;
                    const diff = e.touches[0].clientX - startX;
                    if(Math.abs(diff) > 10) setIsSwiping(true);
                    if(diff < 0) setOffsetX(Math.max(diff, -80));
                    else setOffsetX(0);
                }}
                onTouchEnd={() => {
                    if(offsetX < -40) setOffsetX(-80);
                    else setOffsetX(0);
                    setTimeout(() => setIsSwiping(false), 100);
                }}
            >
                <div className="flex-1 min-w-0 pr-4">
                    <h4 className="font-bold text-gray-900 dark:text-white truncate text-xs uppercase tracking-tight">{item.name}</h4>
                    <div className="flex items-center gap-2 mt-1">
                        <span className="text-[8px] text-gray-400 font-black uppercase tracking-tighter">{item.unit}</span>
                        {item.code && <span className="text-[8px] text-sky-500 font-bold bg-sky-50 dark:bg-sky-500/10 px-1.5 py-0.5 rounded-md">{item.code}</span>}
                    </div>
                </div>
                <div className="relative flex items-center gap-2">
                    {calcResult !== null && (
                        <div className="absolute -top-7 right-0 bg-indigo-500 text-white text-[10px] px-2 py-1 rounded-xl font-black animate-scale-in shadow-lg z-20">
                            = {calcResult}
                        </div>
                    )}
                    <div className="relative">
                        <input 
                            type="text" 
                            inputMode="decimal" 
                            readOnly={readOnly}
                            className={`w-24 bg-gray-50 dark:bg-black/40 border-2 border-transparent focus:border-sky-500 rounded-2xl px-2 py-3 text-center font-black text-lg dark:text-white outline-none transition-all ${readOnly ? 'opacity-50' : ''}`}
                            placeholder="0" 
                            value={localValue} 
                            onChange={handleInputChange}
                            onBlur={handleBlur}
                        />
                        {isSaving && (
                            <div className="absolute -right-1.5 -top-1.5 bg-emerald-500 text-white rounded-full p-1 shadow-lg animate-scale-in z-10">
                                <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
});

// --- MAIN COMPONENT ---
const Inventory: React.FC = () => {
    const navigate = useNavigate();
    const { isAdmin, user, webApp } = useTelegram();
    const { addToast } = useToast();

    const [cycles, setCycles] = useState<InventoryCycle[]>([]);
    const [globalItems, setGlobalItems] = useState<GlobalInventoryItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [activeCycle, setActiveCycle] = useState<InventoryCycle | null>(null);
    const [viewMode, setViewMode] = useState<'list' | 'filling' | 'manage' | 'summary' | 'audit'>('list');
    const [activeSheetId, setActiveSheetId] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [summarySearchTerm, setSummarySearchTerm] = useState('');
    const [hideFilled, setHideFilled] = useState(false);
    
    const [confirmModal, setConfirmModal] = useState<{isOpen: boolean, type?: any, title: string, message: string, onConfirm: () => void} | null>(null);
    const [isAddingSheet, setIsAddingSheet] = useState(false);
    const [newSheetTitle, setNewSheetTitle] = useState('');
    const [isGlobalImportOpen, setIsGlobalImportOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const syncLockRef = useRef<boolean>(false);

    const lockSyncTemporarily = () => {
        syncLockRef.current = true;
        setTimeout(() => { syncLockRef.current = false; }, 3000);
    };

    const fetchGlobalItems = async () => {
        try { const res = await apiFetch('/api/inventory/global-items'); const data = await res.json(); setGlobalItems(data); } catch (e) {}
    };

    const loadData = async () => {
        setIsLoading(true);
        try {
            const res = await apiFetch('/api/inventory');
            const data = await res.json();
            setCycles(data);
            setActiveCycle(data.find((c: any) => !c.isFinalized) || null);
        } catch (e) { addToast("Ошибка загрузки", "error"); }
        finally { setTimeout(() => setIsLoading(false), 500); }
    };

    const loadDataSilent = async () => {
        if (isSaving || isAddingSheet || syncLockRef.current) return;
        try {
            const res = await apiFetch('/api/inventory');
            const data = await res.json();
            setCycles(data);
            setActiveCycle(data.find((c: any) => !c.isFinalized) || null);
        } catch (e) {}
    };

    useEffect(() => { 
        loadData(); 
        fetchGlobalItems(); 
        const interval = setInterval(loadDataSilent, 8000);
        return () => clearInterval(interval);
    }, []);

    const startInventory = async () => {
        if (!activeCycle || !activeSheetId) return;
        
        // Optimistic UI Update
        setActiveCycle(prev => {
            if (!prev) return prev;
            const updated = { ...prev };
            const sheet = updated.sheets.find(s => s.id === activeSheetId);
            if (sheet) {
                sheet.lockedBy = { id: user?.id || 0, name: user?.first_name || 'Я' };
                sheet.lockedAt = Date.now();
            }
            return updated;
        });

        try {
            const res = await apiFetch('/api/inventory/lock', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cycleId: activeCycle.id, sheetId: activeSheetId, user: { id: user?.id, name: user?.first_name } })
            });
            const data = await res.json();
            if (data.success) { 
                addToast("Бланк взят в работу", "success"); 
                if (webApp?.HapticFeedback) webApp.HapticFeedback.notificationOccurred('success');
            } else { 
                addToast(`Занято: ${data.lockedBy.name}`, "error"); 
                loadDataSilent();
            }
        } catch (e) { addToast("Ошибка связи", "error"); loadDataSilent(); }
    };

    const handleActualSync = useCallback((itemId: string, val: string) => {
        lockSyncTemporarily();
        const numeric = parseFloat(val);
        if (!activeCycle || !activeSheetId) return;

        setActiveCycle(prev => {
            if (!prev) return prev;
            const updated = { ...prev };
            const sheet = updated.sheets.find(s => s.id === activeSheetId);
            if (sheet) {
                sheet.items = sheet.items.map(i => i.id === itemId ? { ...i, actual: isNaN(numeric) ? undefined : numeric } : i);
                apiFetch('/api/inventory/cycle', { 
                    method: 'POST', 
                    headers: { 'Content-Type': 'application/json' }, 
                    body: JSON.stringify({ ...updated, updatedBy: user?.first_name }) 
                });
                return updated;
            }
            return prev;
        });
    }, [activeSheetId, activeCycle, user]);

    const handleItemDelete = useCallback((id: string) => {
        if (!activeCycle || !activeSheetId) return;
        lockSyncTemporarily();
        const updated = {...activeCycle};
        const s = updated.sheets.find(sh => sh.id === activeSheetId);
        if (s) {
            s.items = s.items.filter(i => i.id !== id);
            setActiveCycle(updated);
            apiFetch('/api/inventory/cycle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updated) });
        }
    }, [activeCycle, activeSheetId]);

    const submitSheet = async () => {
        if (!activeCycle || !activeSheetId) return;
        setIsSaving(true);
        try {
            const updated = { ...activeCycle };
            const sheet = updated.sheets.find(s => s.id === activeSheetId);
            if (sheet) {
                sheet.status = 'submitted';
                sheet.lockedBy = undefined;
                sheet.lockedAt = undefined;
                await apiFetch('/api/inventory/cycle', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(updated)
                });
                setActiveSheetId(null);
                setViewMode('list');
                addToast("Бланк сдан успешно", "success");
                if (webApp?.HapticFeedback) webApp.HapticFeedback.notificationOccurred('success');
                loadData();
            }
        } catch (e) { addToast("Ошибка связи", "error"); }
        finally { setIsSaving(false); }
    };

    const finalizeCycle = async () => {
        if (!activeCycle) return;
        setConfirmModal({
            isOpen: true,
            type: 'success',
            title: "Завершить инвентаризацию?",
            message: "Все данные будут сохранены в архив. Текущие остатки обнулятся.",
            onConfirm: async () => {
                setIsSaving(true);
                try {
                    const cleanedActive = cleanMongoFields(activeCycle);
                    const archiveCycle = { 
                        ...cleanedActive, 
                        id: uuidv4(), 
                        isFinalized: true, 
                        date: Date.now(),
                        sheets: cleanedActive.sheets.map((s: any) => ({
                            ...s,
                            items: s.items.filter((it: any) => (it.actual !== undefined && it.actual > 0))
                        })).filter((s: any) => s.items.length > 0)
                    };
                    await apiFetch('/api/inventory/cycle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(archiveCycle) });

                    const resetCycle = { 
                        ...cleanedActive, 
                        sheets: cleanedActive.sheets.map((s: any) => ({ 
                            ...s, 
                            status: 'active', 
                            lockedBy: undefined,
                            lockedAt: undefined,
                            items: s.items.map((i: any) => ({ ...i, actual: undefined })) 
                        }))
                    };
                    await apiFetch('/api/inventory/cycle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(resetCycle) });
                    
                    loadData();
                    setViewMode('list');
                    addToast("Инвентаризация финализирована", "success");
                } catch (e) { addToast("Ошибка финализации", "error"); }
                finally { setIsSaving(false); }
            }
        });
    };

    const overallProgress = useMemo(() => {
        if (!activeCycle) return 0;
        let total = 0;
        let filled = 0;
        activeCycle.sheets.forEach(s => {
            total += s.items.length;
            filled += s.items.filter(i => i.actual !== undefined).length;
        });
        return total > 0 ? Math.round((filled / total) * 100) : 0;
    }, [activeCycle]);

    const handleOpenSheet = (id: string) => {
        if (!activeCycle) return;
        const sheet = activeCycle.sheets.find(s => s.id === id);
        if (sheet && sheet.lockedBy && sheet.lockedBy.id !== user?.id) {
            const now = Date.now();
            if (sheet.lockedAt && (now - sheet.lockedAt < 30 * 60 * 1000)) {
                addToast(`Лист занят: ${sheet.lockedBy.name}`, "info");
                return;
            }
        }
        setActiveSheetId(id);
        setSearchTerm('');
        setViewMode('filling');
    };

    const currentSheet = activeCycle?.sheets.find(s => s.id === activeSheetId);
    const isLockedByMe = currentSheet?.lockedBy?.id === user?.id;
    const isLockedByOthers = currentSheet?.lockedBy && currentSheet.lockedBy.id !== user?.id;

    const filteredSheetItems = useMemo(() => {
        if (!currentSheet) return [];
        let items = currentSheet.items;
        if (hideFilled) items = items.filter(i => i.actual === undefined);
        if (searchTerm) {
            const s = searchTerm.toLowerCase();
            items = items.filter(i => i.name.toLowerCase().includes(s) || (i.code && i.code.toLowerCase().includes(s)));
        }
        return items;
    }, [currentSheet, searchTerm, hideFilled]);

    const handleExcelImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setIsSaving(true);
        try {
            const buffer = await file.arrayBuffer();
            const workbook = XLSX.read(buffer);
            const ws = workbook.Sheets[workbook.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
            
            const newItems: InventoryItem[] = [];
            rows.forEach((row, i) => {
                if (i === 0) return;
                const name = String(row[0] || '').trim();
                const unit = String(row[1] || '').trim();
                const code = row[2] ? String(row[2]) : '';
                if (name && unit) {
                    newItems.push({ id: uuidv4(), name, unit, code });
                }
            });

            if (newItems.length === 0) throw new Error("Нет данных");

            const cycle = activeCycle || {
                id: uuidv4(),
                date: Date.now(),
                sheets: [],
                isFinalized: false,
                createdBy: user?.first_name || 'System'
            };

            const newSheet: InventorySheet = {
                id: uuidv4(),
                title: file.name.split('.')[0],
                items: newItems,
                status: 'active'
            };

            const updatedCycle = { ...cycle, sheets: [...cycle.sheets, newSheet] };
            await apiFetch('/api/inventory/cycle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updatedCycle) });
            addToast("Станция импортирована", "success");
            loadData();
        } catch (err: any) { addToast(err.message || "Ошибка импорта", "error"); }
        finally { setIsSaving(false); if(e.target) e.target.value = ''; }
    };

    return (
        <div className="pb-24 animate-fade-in min-h-screen bg-[#f2f4f7] dark:bg-[#0f1115]">
            {confirmModal && (
                <CustomConfirm 
                    isOpen={confirmModal.isOpen} 
                    onClose={() => setConfirmModal(null)} 
                    onConfirm={confirmModal.onConfirm} 
                    title={confirmModal.title} 
                    message={confirmModal.message}
                    type={confirmModal.type}
                />
            )}

            <div className="pt-safe-top px-5 pb-4 sticky top-0 z-50 bg-[#f2f4f7]/95 dark:bg-[#0f1115]/95 backdrop-blur-md border-b border-gray-100 dark:border-white/5">
                <div className="flex items-center justify-between pt-4">
                    <div className="flex items-center gap-3 overflow-hidden flex-1">
                        <button onClick={() => viewMode === 'list' ? navigate('/') : setViewMode('list')} className="w-10 h-10 rounded-full bg-white dark:bg-[#1e1e24] shadow-sm flex items-center justify-center dark:text-white border border-gray-100 dark:border-white/5 active:scale-95 transition">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
                        </button>
                        <div className="min-w-0 flex-1">
                            <h1 className="text-lg font-black text-gray-900 dark:text-white leading-none truncate">
                                {viewMode === 'filling' ? currentSheet?.title : viewMode === 'summary' ? 'Сводная' : viewMode === 'audit' ? 'История правок' : 'Инвентаризация'}
                            </h1>
                            <p className="text-[9px] text-gray-400 font-black uppercase mt-1 tracking-widest leading-none">
                                {activeCycle ? `Прогресс: ${overallProgress}%` : 'Загрузка...'}
                            </p>
                        </div>
                    </div>
                    
                    <div className="flex gap-2">
                        {viewMode === 'filling' && (isLockedByMe || isAdmin) && (
                             <button onClick={() => setHideFilled(!hideFilled)} className={`w-10 h-10 rounded-full flex items-center justify-center transition-all border ${hideFilled ? 'bg-indigo-500 text-white border-indigo-500' : 'bg-white dark:bg-[#1e1e24] text-gray-400 border-gray-100 dark:border-white/10'}`}>
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" /></svg>
                             </button>
                        )}
                        {viewMode === 'list' && isAdmin && activeCycle?.auditLog && activeCycle.auditLog.length > 0 && (
                            <button onClick={() => setViewMode('audit')} className="w-10 h-10 rounded-full bg-white dark:bg-[#1e1e24] shadow-sm flex items-center justify-center text-amber-500 border border-gray-100 dark:border-white/10 active:scale-95 transition">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" strokeWidth={2.5} /></svg>
                            </button>
                        )}
                    </div>
                </div>

                {(viewMode === 'filling' || viewMode === 'summary') && (
                    <div className="mt-4 relative animate-slide-up">
                        <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-gray-400">
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                        </div>
                        <input 
                            type="text" 
                            placeholder="Поиск по названию..." 
                            className="w-full bg-white dark:bg-black/40 border-2 border-transparent focus:border-sky-500/20 rounded-2xl py-3 pl-12 pr-4 text-sm font-bold dark:text-white outline-none shadow-sm transition-all"
                            value={viewMode === 'summary' ? summarySearchTerm : searchTerm}
                            onChange={e => viewMode === 'summary' ? setSummarySearchTerm(e.target.value) : setSearchTerm(e.target.value)}
                        />
                    </div>
                )}
            </div>

            <div className="px-5 pt-6">
                {isLoading ? (
                    <div className="space-y-4">
                        {[1, 2, 3].map(i => <div key={i} className="h-24 bg-white dark:bg-[#1e1e24] rounded-3xl animate-pulse"></div>)}
                    </div>
                ) : (
                    <>
                        {viewMode === 'list' && (
                            <div className="space-y-6">
                                {/* Dashboard Progress */}
                                {activeCycle && (
                                    <div className="bg-white dark:bg-[#1e1e24] p-6 rounded-[2.5rem] shadow-sm border border-gray-100 dark:border-white/5 animate-slide-up overflow-hidden relative">
                                        <div className="flex items-center justify-between mb-4">
                                            <h3 className="font-black dark:text-white uppercase text-[10px] tracking-widest">Прогресс склада</h3>
                                            <span className="text-xl font-black text-sky-500">{overallProgress}%</span>
                                        </div>
                                        <div className="w-full h-3 bg-gray-100 dark:bg-white/5 rounded-full overflow-hidden">
                                            <div className="h-full bg-gradient-to-r from-sky-400 to-indigo-500 transition-all duration-1000 ease-spring" style={{ width: `${overallProgress}%` }}></div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-x-6 gap-y-4 mt-6 border-t border-gray-50 dark:border-white/5 pt-6">
                                            {activeCycle.sheets.map(s => {
                                                const filled = s.items.filter(i => i.actual !== undefined).length;
                                                const total = s.items.length;
                                                const sP = total > 0 ? Math.round((filled / total) * 100) : 0;
                                                return (
                                                    <div key={s.id} className="space-y-1.5">
                                                        <div className="flex justify-between items-center text-[8px] font-black uppercase text-gray-400 tracking-tighter">
                                                            <span className="truncate pr-1">{s.title}</span>
                                                            <span className={sP === 100 ? 'text-emerald-500' : ''}>{sP}%</span>
                                                        </div>
                                                        <div className="h-1 bg-gray-50 dark:bg-white/5 rounded-full overflow-hidden">
                                                            <div className={`h-full transition-all duration-1000 ${sP === 100 ? 'bg-emerald-500' : 'bg-sky-400'}`} style={{ width: `${sP}%` }}></div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                <div className="grid grid-cols-4 gap-2">
                                    <div onClick={() => document.getElementById('xl-station')?.click()} className="col-span-1 bg-sky-100 dark:bg-sky-500/10 rounded-2xl p-2 text-sky-600 flex flex-col items-center justify-center gap-1.5 h-20 active:scale-95 transition cursor-pointer">
                                        <input type="file" id="xl-station" className="hidden" accept=".xlsx,.xls" onChange={handleExcelImport} />
                                        <span className="text-lg">📄</span>
                                        <h3 className="font-bold text-[7px] uppercase text-center">Импорт</h3>
                                    </div>
                                    <div onClick={() => setViewMode('summary')} className="col-span-1 bg-emerald-100 dark:bg-emerald-500/10 rounded-2xl p-2 text-emerald-600 flex flex-col items-center justify-center gap-1.5 h-20 active:scale-95 transition cursor-pointer">
                                        <span className="text-lg">📊</span>
                                        <h3 className="font-bold text-[7px] uppercase text-center">Отчет</h3>
                                    </div>
                                    {isAdmin && (
                                        <div onClick={() => setViewMode('manage')} className="col-span-1 bg-purple-100 dark:bg-purple-500/10 rounded-2xl p-2 text-purple-600 flex flex-col items-center justify-center gap-1.5 h-20 active:scale-95 transition cursor-pointer">
                                            <span className="text-lg">⚙️</span>
                                            <h3 className="font-bold text-[7px] uppercase text-center">Админ</h3>
                                        </div>
                                    )}
                                     <div onClick={() => setIsGlobalImportOpen(true)} className="col-span-1 bg-amber-100 dark:bg-amber-500/10 rounded-2xl p-2 text-amber-600 flex flex-col items-center justify-center gap-1.5 h-20 active:scale-95 transition cursor-pointer">
                                        <span className="text-lg">📦</span>
                                        <h3 className="font-bold text-[7px] uppercase text-center">База</h3>
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    {activeCycle?.sheets.map(sheet => {
                                        const filled = sheet.items.filter(i => i.actual !== undefined).length;
                                        const total = sheet.items.length;
                                        const pct = total > 0 ? Math.round((filled/total)*100) : 0;
                                        return (
                                            <div key={sheet.id} onClick={() => handleOpenSheet(sheet.id)} className="bg-white dark:bg-[#1e1e24] p-4 rounded-[2rem] shadow-sm border border-gray-100 dark:border-white/5 active:scale-[0.98] transition cursor-pointer flex items-center justify-between relative overflow-hidden">
                                                <div className="absolute bottom-0 left-0 h-1 bg-sky-500/20" style={{ width: `${pct}%` }}></div>
                                                <div className="flex items-center gap-4 relative z-10">
                                                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl ${sheet.status === 'submitted' ? 'bg-emerald-100 text-emerald-600' : 'bg-sky-50 text-sky-500 dark:bg-sky-500/10'}`}>
                                                        {sheet.status === 'submitted' ? '✅' : '🔪'}
                                                    </div>
                                                    <div>
                                                        <h4 className="font-black text-gray-900 dark:text-white uppercase text-[11px] tracking-tight truncate max-w-[120px]">{sheet.title}</h4>
                                                        <p className="text-[8px] text-gray-400 font-bold uppercase mt-1">{filled} / {total} поз. • {pct}%</p>
                                                    </div>
                                                </div>
                                                {sheet.lockedBy && (
                                                    <div className={`px-2.5 py-1 rounded-full text-[8px] font-black uppercase border animate-pulse ${sheet.lockedBy.id === user?.id ? 'bg-green-50 text-green-600 border-green-100' : 'bg-red-50 text-red-600 border-red-100'}`}>
                                                        {sheet.lockedBy.id === user?.id ? 'У меня' : sheet.lockedBy.name}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                    {isAdmin && activeCycle?.sheets.every(s => s.status === 'submitted') && (
                                        <button onClick={finalizeCycle} className="w-full py-5 bg-gradient-to-r from-emerald-600 to-green-500 text-white font-black rounded-3xl shadow-xl shadow-emerald-600/30 uppercase tracking-[0.1em] text-[10px] active:scale-95 transition">
                                            Завершить инвентаризацию
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}

                        {viewMode === 'audit' && activeCycle && (
                            <div className="animate-slide-up space-y-3 pb-20">
                                {activeCycle.auditLog?.slice().reverse().map((entry, idx) => (
                                    <div key={idx} className="bg-white dark:bg-[#1e1e24] p-4 rounded-3xl border border-gray-100 dark:border-white/5 shadow-sm">
                                        <div className="flex justify-between items-start mb-2">
                                            <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest">{entry.userName}</span>
                                            <span className="text-[8px] text-gray-400 font-bold">{new Date(entry.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                                        </div>
                                        <h5 className="text-[11px] font-black dark:text-white uppercase mb-1">{entry.itemName}</h5>
                                        <div className="flex items-center gap-2 text-[9px] font-bold">
                                            <span className="text-gray-400">{entry.oldValue}</span>
                                            <span className="text-gray-300">→</span>
                                            <span className="text-indigo-500 font-black">{entry.newValue}</span>
                                            <span className="ml-auto text-gray-400 italic text-[8px]">{entry.sheetTitle}</span>
                                        </div>
                                    </div>
                                ))}
                                <button onClick={() => setViewMode('list')} className="w-full py-4 bg-gray-900 text-white rounded-2xl font-black uppercase text-[10px]">Вернуться</button>
                            </div>
                        )}

                        {viewMode === 'filling' && activeSheetId && activeCycle && (
                            <div className="space-y-1 pb-32 animate-fade-in">
                                {filteredSheetItems.map(item => (
                                    <InventoryItemRow 
                                        key={item.id} item={item} cycleId={activeCycle.id} sheetId={activeSheetId}
                                        onSync={handleActualSync} onDelete={handleItemDelete}
                                        readOnly={!isLockedByMe && !isAdmin} 
                                    />
                                ))}
                                {filteredSheetItems.length === 0 && (
                                     <div className="text-center py-20 opacity-30 italic text-sm">Ничего не найдено</div>
                                )}
                                <div className="fixed bottom-6 left-4 right-4 z-[60] bg-white/90 dark:bg-[#1e1e24]/90 backdrop-blur-xl p-3 rounded-[2.5rem] shadow-2xl border border-gray-100 dark:border-white/5">
                                    {(isLockedByMe || isAdmin) ? (
                                        <button onClick={submitSheet} disabled={isSaving} className="w-full py-4 bg-gray-900 dark:bg-white text-white dark:text-black font-black rounded-3xl uppercase text-[10px] tracking-[0.1em] active:scale-95 transition shadow-lg">Сдать бланк</button>
                                    ) : (
                                        <button onClick={startInventory} className="w-full py-4 bg-sky-500 text-white font-black rounded-3xl uppercase text-[10px] tracking-[0.1em] active:scale-95 transition shadow-sky-500/30">Начать инвентаризацию</button>
                                    )}
                                </div>
                            </div>
                        )}

                        {viewMode === 'summary' && activeCycle && (
                            <div className="space-y-3 pb-20 animate-fade-in">
                                {activeCycle.sheets.flatMap(s => s.items)
                                    .filter(i => summarySearchTerm === '' || i.name.toLowerCase().includes(summarySearchTerm.toLowerCase()))
                                    .map(it => (
                                        <div key={it.id} className="bg-white dark:bg-[#1e1e24] p-4 rounded-3xl shadow-sm border border-gray-100 dark:border-white/5 flex justify-between items-center">
                                            <div>
                                                <h4 className="font-bold dark:text-white text-xs uppercase">{it.name}</h4>
                                                <p className="text-[8px] text-gray-400 font-bold uppercase">{it.code || 'нет кода'}</p>
                                            </div>
                                            <div className="text-right">
                                                <span className="font-black text-indigo-500 text-sm">{it.actual ?? '—'}</span>
                                                <span className="text-[8px] text-gray-400 ml-1 uppercase">{it.unit}</span>
                                            </div>
                                        </div>
                                    ))
                                }
                            </div>
                        )}

                        {viewMode === 'manage' && isAdmin && (
                            <div className="space-y-4 animate-slide-up pb-20">
                                <button onClick={() => setIsAddingSheet(true)} className="w-full py-4 bg-sky-500 text-white font-black rounded-2xl uppercase text-[10px] tracking-widest shadow-lg shadow-sky-500/20">Добавить бланк вручную</button>
                                <button onClick={() => navigate('/inventory/archive')} className="w-full py-4 bg-white dark:bg-white/5 dark:text-white border border-gray-100 dark:border-white/10 rounded-2xl font-black uppercase text-[10px] tracking-widest">Архив прошлых циклов</button>
                                
                                {activeCycle?.sheets.map(sheet => (
                                    <div key={sheet.id} className="bg-white dark:bg-[#1e1e24] p-4 rounded-3xl border border-gray-100 dark:border-white/5 flex items-center justify-between shadow-sm">
                                        <div className="min-w-0 flex-1">
                                            <h4 className="font-black dark:text-white truncate uppercase text-xs tracking-tight">{sheet.title}</h4>
                                            <p className="text-[9px] text-gray-400 font-bold uppercase">{sheet.items.length} позиций</p>
                                        </div>
                                        <button onClick={() => {
                                            if(confirm("Удалить станцию?")) {
                                                const updated = {...activeCycle, sheets: activeCycle.sheets.filter(s => s.id !== sheet.id)};
                                                apiFetch('/api/inventory/cycle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updated) });
                                                setActiveCycle(updated);
                                            }
                                        }} className="w-10 h-10 rounded-2xl bg-red-50 dark:bg-red-500/10 text-red-500 flex items-center justify-center active:scale-90 transition">
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M14.74 9l-.346 9m-4.788 0L9.26 9" strokeWidth={2.5}/></svg>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>
            
            <Modal isOpen={isAddingSheet} onClose={() => setIsAddingSheet(false)} title="Новый бланк">
                <div className="space-y-4">
                    <div className="space-y-1">
                        <label className="text-[9px] uppercase font-black text-gray-400 tracking-widest ml-1">Название станции</label>
                        <input 
                            className="w-full bg-gray-50 dark:bg-black/20 p-4 rounded-2xl outline-none border-2 border-transparent focus:border-sky-500 font-bold dark:text-white transition-all" 
                            placeholder="Напр. Склад или Кухня"
                            value={newSheetTitle}
                            onChange={e => setNewSheetTitle(e.target.value)}
                        />
                    </div>
                    <button 
                        onClick={async () => {
                            if(!newSheetTitle.trim()) return;
                            const cycle = activeCycle || { id: uuidv4(), date: Date.now(), sheets: [], isFinalized: false, createdBy: user?.first_name || 'Admin' };
                            const newSheet: InventorySheet = { id: uuidv4(), title: newSheetTitle.trim(), items: [], status: 'active' };
                            const updated = { ...cycle, sheets: [...cycle.sheets, newSheet] };
                            await apiFetch('/api/inventory/cycle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updated) });
                            setIsAddingSheet(false);
                            setNewSheetTitle('');
                            loadData();
                            addToast("Бланк создан", "success");
                        }} 
                        className="w-full py-4 bg-gray-900 dark:bg-white text-white dark:text-black font-black rounded-2xl uppercase text-[10px] tracking-widest shadow-xl"
                    >
                        Создать
                    </button>
                </div>
            </Modal>
        </div>
    );
};

export default Inventory;
