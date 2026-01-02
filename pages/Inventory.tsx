
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { v4 as uuidv4 } from 'uuid';
import * as XLSX from 'xlsx';
import { InventoryCycle, InventorySheet, InventoryItem, GlobalInventoryItem } from '../types';
import { useToast } from '../context/ToastContext';
import { useTelegram } from '../context/TelegramContext';
import { apiFetch } from '../services/api';

// --- UTILS ---

/**
 * Рекурсивно удаляет технические поля MongoDB (_id, __v) из объекта или массива.
 */
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

// --- ROW COMPONENT (MEMOIZED FOR SPEED) ---

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

    const [startX, setStartX] = useState(0);
    const [offsetX, setOffsetX] = useState(0);
    const [isSwiping, setIsSwiping] = useState(false);
    const { webApp } = useTelegram();
    const syncTimerRef = useRef<any>(null);

    useEffect(() => {
        if (!syncTimerRef.current) {
            const parentVal = item.actual?.toString() || '';
            if (parentVal !== localValue) {
                setLocalValue(parentVal);
                localStorage.removeItem(draftKey);
            }
        }
    }, [item.actual]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let val = e.target.value.replace(',', '.');
        if (/^[0-9]*\.?[0-9]*$/.test(val)) {
            setLocalValue(val);
            localStorage.setItem(draftKey, val);
            if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
            syncTimerRef.current = setTimeout(() => {
                onSync(item.id, val);
                syncTimerRef.current = null;
            }, 800);
        }
    };

    const handleTouchStart = (e: React.TouchEvent) => {
        if (readOnly) return;
        setStartX(e.touches[0].clientX);
        setIsSwiping(false);
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (readOnly) return;
        const currentX = e.touches[0].clientX;
        const diff = currentX - startX;
        if (Math.abs(diff) > 10) setIsSwiping(true);
        if (diff < 0) setOffsetX(Math.max(diff, -100));
        else setOffsetX(Math.min(diff, 0));
    };

    const handleTouchEnd = () => {
        if (readOnly) return;
        if (offsetX < -60) {
            setOffsetX(-90);
            if (webApp?.HapticFeedback) webApp.HapticFeedback.impactOccurred('light');
        } else {
            setOffsetX(0);
        }
        setTimeout(() => setIsSwiping(false), 100);
    };

    return (
        <div className="relative overflow-hidden rounded-[2rem] mb-2.5 group bg-white dark:bg-[#1e1e24] shadow-sm border border-gray-100 dark:border-white/5">
            {!readOnly && (
                <div 
                    className="absolute inset-y-0 right-0 w-[90px] bg-red-500 flex flex-col items-center justify-center cursor-pointer z-0 transition-opacity"
                    onClick={() => onDelete(item.id)}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5 text-white mb-1"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9" /></svg>
                    <span className="text-[8px] text-white font-black uppercase tracking-tighter">Удалить</span>
                </div>
            )}
            <div 
                style={{ transform: `translateX(${offsetX}px)`, touchAction: isSwiping ? 'pan-x' : 'pan-y' }}
                className="relative bg-white dark:bg-[#1e1e24] p-4 flex items-center justify-between transition-transform duration-200 ease-out z-10"
                onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}
            >
                <div className="flex-1 min-w-0 pr-4">
                    <h4 className="font-bold text-gray-900 dark:text-white truncate text-sm leading-tight uppercase tracking-tight">{item.name}</h4>
                    <div className="flex items-center gap-2 mt-1">
                        <span className="text-[9px] text-gray-400 font-black uppercase tracking-tighter">{item.unit}</span>
                        {item.code && <span className="text-[8px] text-sky-500 font-bold bg-sky-50 dark:bg-sky-500/10 px-1.5 py-0.5 rounded-md">{item.code}</span>}
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <input 
                        type="text" 
                        inputMode="decimal" 
                        readOnly={readOnly}
                        className={`w-24 bg-gray-50 dark:bg-black/40 border-2 border-transparent focus:border-sky-500 rounded-2xl px-2 py-3 text-center font-black text-lg dark:text-white outline-none transition-all ${readOnly ? 'opacity-50 cursor-not-allowed' : ''}`}
                        placeholder="0" 
                        value={localValue} 
                        onChange={handleInputChange}
                    />
                </div>
            </div>
        </div>
    );
});

// --- MAIN COMPONENT ---
const Inventory: React.FC = () => {
    const navigate = useNavigate();
    const { isAdmin, user } = useTelegram();
    const { addToast } = useToast();

    const [cycles, setCycles] = useState<InventoryCycle[]>([]);
    const [globalItems, setGlobalItems] = useState<GlobalInventoryItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [activeCycle, setActiveCycle] = useState<InventoryCycle | null>(null);
    const [viewMode, setViewMode] = useState<'list' | 'filling' | 'manage' | 'summary'>('list');
    const [activeSheetId, setActiveSheetId] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [summarySearchTerm, setSummarySearchTerm] = useState('');
    const [modalSearchTerm, setModalSearchTerm] = useState('');
    
    const [confirmModal, setConfirmModal] = useState<{isOpen: boolean, type?: any, title: string, message: string, onConfirm: () => void} | null>(null);
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [isGlobalImportOpen, setIsGlobalImportOpen] = useState(false);
    const [importSheets, setImportSheets] = useState<ImportSheet[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const [importProgress, setImportProgress] = useState(0);
    const [globalFiles, setGlobalFiles] = useState<{file1?: File, file2?: File}>({});
    const [isAddingSheet, setIsAddingSheet] = useState(false);
    
    const [newSheetTitle, setNewSheetTitle] = useState('');
    const [selectedGlobalIds, setSelectedGlobalIds] = useState<Set<string>>(new Set());
    const [initialAmount, setInitialAmount] = useState('');
    const [renamingSheet, setRenamingSheet] = useState<{id: string, title: string} | null>(null);

    // Ref to block sync during user actions (prevents data "rollback" UI glitch)
    const syncLockRef = useRef<boolean>(false);

    const lockSyncTemporarily = () => {
        syncLockRef.current = true;
        setTimeout(() => { syncLockRef.current = false; }, 3000);
    };

    useEffect(() => { 
        loadData(); 
        fetchGlobalItems(); 
        const interval = setInterval(loadDataSilent, 7000);
        return () => clearInterval(interval);
    }, []);

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
        // Skip if saving, adding something, or if we recently did a write action
        if (isSaving || isAddingSheet || syncLockRef.current) return;
        try {
            const res = await apiFetch('/api/inventory');
            const data = await res.json();
            setCycles(data);
            const currentActive = data.find((c: any) => !c.isFinalized);
            setActiveCycle(currentActive || null);
        } catch (e) {}
    };

    const handleStationUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
            const bstr = evt.target?.result;
            const wb = XLSX.read(bstr, { type: 'binary' });
            const sheets: ImportSheet[] = wb.SheetNames.map((name, idx) => {
                const sheet = wb.Sheets[name];
                const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
                
                let codeCol = -1;
                let nameCol = 0;
                let unitCol = 1;
                let found = false;
                
                for(let r=0; r < Math.min(rawData.length, 15); r++) {
                    const row = rawData[r];
                    if(!row) continue;
                    for(let c=0; c < row.length; c++) {
                        const cell = String(row[c] || '').toLowerCase();
                        if(cell.includes('наименование') || cell.includes('товар')) {
                            nameCol = c;
                            unitCol = c + 1;
                            found = true;
                            break;
                        }
                    }
                    if(found) break;
                }

                return { 
                    name, data: rawData, isSummary: idx === 0, isSelected: true,
                    mapping: { code: codeCol, name: nameCol, unit: unitCol }
                };
            });
            setImportSheets(sheets); setIsImportModalOpen(true);
        };
        reader.readAsBinaryString(file);
        if (e.target) e.target.value = '';
    };

    const handleGlobalImportStart = async () => {
        const files = [globalFiles.file1, globalFiles.file2].filter(Boolean) as File[];
        if (files.length === 0) { addToast("Выберите хотя бы один файл", "error"); return; }
        setIsSaving(true);
        setImportProgress(10);
        try {
            const allNewItems: GlobalInventoryItem[] = [];
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const data = await file.arrayBuffer();
                const wb = XLSX.read(data);
                wb.SheetNames.forEach(name => {
                    const sheet = wb.Sheets[name];
                    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
                    let cIdx = 1, nIdx = 2, uIdx = 5;
                    rows.forEach((row, ridx) => {
                        if (ridx < 5) {
                           const rowStr = row.join(' ').toLowerCase();
                           if (rowStr.includes('код')) cIdx = row.findIndex(c => String(c).toLowerCase().includes('код'));
                           if (rowStr.includes('наименование')) nIdx = row.findIndex(c => String(c).toLowerCase().includes('наименование'));
                           if (rowStr.includes('ед')) uIdx = row.findIndex(c => String(c).toLowerCase().includes('ед'));
                        }
                        const code = String(row[cIdx] || '').trim();
                        const name = String(row[nIdx] || '').trim();
                        const unit = String(row[uIdx] || '').trim();
                        if (code && name && unit && !name.toLowerCase().includes('наименование') && code.length > 1) {
                            allNewItems.push({ botId: '', code, name, unit });
                        }
                    });
                });
                setImportProgress(10 + Math.round(((i + 1) / files.length) * 40));
            }
            await apiFetch('/api/inventory/global-items/upsert', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ items: allNewItems })
            });
            setImportProgress(100);
            addToast(`База обновлена!`, "success");
            fetchGlobalItems();
            setTimeout(() => { setIsGlobalImportOpen(false); setIsSaving(false); setImportProgress(0); setGlobalFiles({}); }, 500);
        } catch (e) { addToast("Ошибка базы", "error"); setIsSaving(false); setImportProgress(0); }
    };

    const confirmStationImport = async () => {
        if (importSheets.length === 0) return;
        setIsSaving(true);
        setImportProgress(20);
        try {
            const selected = importSheets.filter(s => s.isSelected && !s.isSummary);
            const newSheets: InventorySheet[] = selected.map((s, idx) => {
                const items: InventoryItem[] = s.data.map(row => {
                    const name = String(row[s.mapping.name] || '').trim();
                    const unit = String(row[s.mapping.unit] || '').trim();
                    const code = s.mapping.code !== -1 ? String(row[s.mapping.code] || '').trim() : '';
                    if (name && unit && name.length > 2 && !name.toLowerCase().includes('наименование')) return { id: uuidv4(), code, name, unit };
                    return null;
                }).filter(Boolean) as InventoryItem[];
                setImportProgress(20 + Math.round(((idx + 1) / selected.length) * 60));
                return { id: uuidv4(), title: s.name, items, status: 'active' };
            });

            let updated: InventoryCycle;
            if (activeCycle) {
                updated = { ...activeCycle, sheets: [...activeCycle.sheets, ...newSheets] };
            } else {
                updated = { id: uuidv4(), date: Date.now(), sheets: newSheets, isFinalized: false, createdBy: user?.first_name || 'Admin' };
            }

            await apiFetch('/api/inventory/cycle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updated) });
            setImportProgress(100);
            setActiveCycle(updated); loadData(); addToast("Бланки добавлены", "success");
        } catch (e) { addToast("Ошибка импорта", "error"); } 
        finally { setTimeout(() => { setIsImportModalOpen(false); setIsSaving(false); setImportProgress(0); }, 500); }
    };

    const handleOpenSheet = (sheetId: string) => {
        if (!activeCycle) return;
        setActiveSheetId(sheetId); 
        setViewMode('filling');
        setSearchTerm('');
    };

    const startInventory = async () => {
        if (!activeCycle || !activeSheetId) return;
        try {
            const res = await apiFetch('/api/inventory/lock', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cycleId: activeCycle.id, sheetId: activeSheetId, user: { id: user?.id, name: user?.first_name } })
            });
            const data = await res.json();
            if (data.success) { addToast("Бланк взят в работу", "success"); loadDataSilent(); } 
            else { addToast(`Занято: ${data.lockedBy.name}`, "error"); }
        } catch (e) { addToast("Ошибка", "error"); }
    };

    const handleActualSync = useCallback((itemId: string, val: string) => {
        lockSyncTemporarily(); // Block polling
        setActiveCycle(prev => {
            if (!prev || !activeSheetId) return prev;
            const numeric = parseFloat(val);
            const updated = { ...prev };
            const sheet = updated.sheets.find(s => s.id === activeSheetId);
            if (sheet) {
                sheet.items = sheet.items.map(i => i.id === itemId ? { ...i, actual: isNaN(numeric) ? undefined : numeric } : i);
                apiFetch('/api/inventory/cycle', { 
                    method: 'POST', 
                    headers: { 'Content-Type': 'application/json' }, 
                    body: JSON.stringify(updated) 
                }).then(() => {
                    localStorage.removeItem(`inv_draft_${prev.id}_${activeSheetId}_${itemId}`);
                });
                return updated;
            }
            return prev;
        });
    }, [activeSheetId]);

    const handleItemDelete = useCallback((id: string) => {
        if (!activeCycle || !activeSheetId) return;
        lockSyncTemporarily(); // Block polling
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
        setConfirmModal({
            isOpen: true,
            title: "Сдать бланк?",
            message: "Вы завершили ввод данных по этой станции? Бланк будет помечен как готовый.",
            onConfirm: async () => {
                const updated = { ...activeCycle };
                const target = updated.sheets.find(s => s.id === activeSheetId);
                if (target) target.status = 'submitted';
                try {
                    await apiFetch('/api/inventory/cycle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updated) });
                    await apiFetch('/api/inventory/unlock', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cycleId: activeCycle.id, sheetId: activeSheetId }) });
                    setActiveSheetId(null); setViewMode('list'); loadData();
                    addToast("Бланк сдан!", "success");
                } catch (e) { addToast("Ошибка", "error"); }
            }
        });
    };

    const finalizeCycle = async () => {
        if (!activeCycle) return;
        setConfirmModal({
            isOpen: true,
            type: 'success',
            title: "Финализировать?",
            message: "Все бланки будут перенесены в архив. В архив попадут ТОЛЬКО позиции с остатком > 0. Текущие бланки обнулятся.",
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

                    const archiveRes = await apiFetch('/api/inventory/cycle', { 
                        method: 'POST', 
                        headers: { 'Content-Type': 'application/json' }, 
                        body: JSON.stringify(archiveCycle) 
                    });

                    if (!archiveRes.ok) throw new Error("Failed to save archive");

                    const resetCycle = { 
                        ...cleanedActive, 
                        sheets: cleanedActive.sheets.map((s: any) => ({ 
                            ...s, 
                            status: 'active', 
                            lockedBy: undefined,
                            items: s.items.map((i: any) => ({ ...i, actual: undefined })) 
                        }))
                    };

                    await apiFetch('/api/inventory/cycle', { 
                        method: 'POST', 
                        headers: { 'Content-Type': 'application/json' }, 
                        body: JSON.stringify(resetCycle) 
                    });

                    setActiveCycle(resetCycle); 
                    setViewMode('list'); 
                    loadData();
                    addToast("Инвентаризация завершена и в архиве!", "success");
                } catch (e) { 
                    console.error("Finalization error:", e);
                    addToast("Ошибка при сохранении архива", "error"); 
                }
                finally { setIsSaving(false); }
            }
        });
    };

    const exportSummary = () => {
        if (!activeCycle) return;
        const agg: Record<string, { name: string; unit: string; total: number; code: string }> = {};
        globalItems.forEach(gi => { agg[`${gi.name}_${gi.unit}`] = { name: gi.name, unit: gi.unit, total: 0, code: gi.code }; });
        activeCycle.sheets.forEach(s => s.items.forEach(i => {
            const key = `${i.name}_${i.unit}`;
            if (agg[key]) agg[key].total += (i.actual || 0);
        }));
        const data = Object.values(agg).map(d => ({ "Код": d.code, "Товар": d.name, "Ед.изм": d.unit, "Остаток ФАКТ": d.total }));
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Сводная");
        XLSX.writeFile(wb, `Inv_Summary_${new Date().toLocaleDateString()}.xlsx`);
    };

    const handleCreateSheet = async () => {
        if (!newSheetTitle.trim()) return;
        setIsSaving(true);
        const selectedItems: InventoryItem[] = globalItems
            .filter(gi => selectedGlobalIds.has(`${gi.code}_${gi.name}`))
            .map(gi => ({ id: uuidv4(), name: gi.name, unit: gi.unit, code: gi.code }));
        const newSheet: InventorySheet = { id: uuidv4(), title: newSheetTitle.trim(), items: selectedItems, status: 'active' };
        let updated = activeCycle 
            ? { ...activeCycle, sheets: [...activeCycle.sheets, newSheet] }
            : { id: uuidv4(), date: Date.now(), sheets: [newSheet], isFinalized: false, createdBy: user?.first_name || 'Admin' };
        
        try {
            await apiFetch('/api/inventory/cycle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updated) });
            setActiveCycle(updated); setIsAddingSheet(false); setNewSheetTitle(''); setSelectedGlobalIds(new Set()); setModalSearchTerm('');
            addToast("Бланк создан", "success");
            lockSyncTemporarily();
        } catch (e) { addToast("Ошибка создания", "error"); }
        finally { setIsSaving(false); }
    };

    const currentSheet = activeCycle?.sheets.find(s => s.id === activeSheetId);
    const isLockedByMe = currentSheet?.lockedBy?.id === user?.id;
    const isLockedByOthers = currentSheet?.lockedBy && currentSheet.lockedBy.id !== user?.id;

    const filteredSheetItems = useMemo(() => {
        if (!currentSheet || !searchTerm) return currentSheet?.items || [];
        const s = searchTerm.toLowerCase();
        return currentSheet.items.filter(i => i.name.toLowerCase().includes(s) || (i.code && i.code.toLowerCase().includes(s)));
    }, [currentSheet, searchTerm]);

    const filteredGlobalForAdding = useMemo(() => {
        const existingNames = new Set(currentSheet?.items.map(i => `${i.name}_${i.unit}`) || []);
        return globalItems
            .filter(gi => !existingNames.has(`${gi.name}_${gi.unit}`))
            .filter(gi => !modalSearchTerm || gi.name.toLowerCase().includes(modalSearchTerm.toLowerCase()));
    }, [globalItems, currentSheet, modalSearchTerm]);

    const filteredSummaryItems = useMemo(() => {
        if (!summarySearchTerm) return globalItems;
        const s = summarySearchTerm.toLowerCase();
        return globalItems.filter(gi => gi.name.toLowerCase().includes(s) || gi.code.toLowerCase().includes(s));
    }, [globalItems, summarySearchTerm]);

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
                        <button onClick={() => viewMode === 'list' ? navigate('/') : setViewMode('list')} className="w-10 h-10 rounded-full bg-white dark:bg-[#1e1e24] shadow-sm flex items-center justify-center dark:text-white border border-gray-100 dark:border-white/5 active:scale-95 transition flex-shrink-0">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
                        </button>
                        <div className="min-w-0 flex-1">
                            <h1 className="text-xl font-black text-gray-900 dark:text-white leading-none truncate">
                                {viewMode === 'filling' ? currentSheet?.title : viewMode === 'summary' ? 'Сводная' : 'Инвентаризация'}
                            </h1>
                            <p className="text-[10px] text-gray-400 font-bold uppercase mt-1 tracking-widest leading-none">
                                {activeCycle ? 'Активный цикл' : 'Цикл не начат'}
                            </p>
                        </div>
                    </div>
                    
                    <div className="flex gap-2 flex-shrink-0 ml-2">
                        {viewMode === 'filling' && (isLockedByMe || isAdmin) && (
                             <button onClick={() => { setIsAddingSheet(true); setModalSearchTerm(''); }} className="w-10 h-10 rounded-full bg-sky-500 text-white shadow-lg shadow-sky-500/30 flex items-center justify-center active:scale-95 transition">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                             </button>
                        )}
                        {viewMode === 'list' && (
                            <button onClick={() => navigate('/inventory/archive')} className="w-10 h-10 rounded-full bg-white dark:bg-[#1e1e24] shadow-sm flex items-center justify-center text-gray-500 border border-gray-100 dark:border-white/10 active:scale-95 transition">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>
                            </button>
                        )}
                    </div>
                </div>

                {(viewMode === 'filling' || viewMode === 'summary') && (
                    <div className="mt-4 relative animate-slide-up">
                        <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-gray-400">
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
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
                        {[1, 2, 3, 4, 5].map(i => (
                             <div key={i} className="bg-white dark:bg-[#1e1e24] p-4 rounded-3xl border border-gray-100 dark:border-white/5 animate-pulse mb-3 shadow-sm h-20"></div>
                        ))}
                    </div>
                ) : (
                    <>
                        {viewMode === 'list' && (
                            <div className="space-y-6">
                                {isAdmin && (
                                    <div className="grid grid-cols-4 gap-2 mb-2">
                                        <div onClick={() => document.getElementById('xl-station')?.click()} className="col-span-1 bg-sky-100 dark:bg-sky-500/20 rounded-2xl p-2 text-sky-600 flex flex-col items-center justify-center gap-1.5 h-24 active:scale-95 transition cursor-pointer">
                                            <input type="file" id="xl-station" className="hidden" accept=".xlsx,.xls" onChange={handleStationUpload} />
                                            <div className="w-9 h-9 rounded-full bg-white dark:bg-black/20 flex items-center justify-center shadow-sm text-lg">📄</div>
                                            <h3 className="font-bold text-[8px] uppercase tracking-tighter text-center">Импорт Бланка</h3>
                                        </div>
                                        <div onClick={() => { setIsGlobalImportOpen(true); setGlobalFiles({}); }} className="col-span-1 bg-amber-100 dark:bg-amber-500/20 rounded-2xl p-2 text-amber-600 flex flex-col items-center justify-center gap-1.5 h-24 active:scale-95 transition cursor-pointer">
                                            <div className="w-9 h-9 rounded-full bg-white dark:bg-black/20 flex items-center justify-center shadow-sm text-lg">📦</div>
                                            <h3 className="font-bold text-[8px] uppercase tracking-tighter text-center">База товаров</h3>
                                        </div>
                                        <div onClick={() => { setViewMode('summary'); setSummarySearchTerm(''); }} className="col-span-1 bg-emerald-100 dark:bg-emerald-500/20 rounded-2xl p-2 text-emerald-600 flex flex-col items-center justify-center gap-1.5 h-24 active:scale-95 transition cursor-pointer">
                                            <div className="w-9 h-9 rounded-full bg-white dark:bg-black/20 flex items-center justify-center shadow-sm text-lg">📊</div>
                                            <h3 className="font-bold text-[8px] uppercase tracking-tighter text-center">Сводная</h3>
                                        </div>
                                        <div onClick={() => setViewMode('manage')} className="col-span-1 bg-purple-100 dark:bg-purple-500/20 rounded-2xl p-2 text-purple-600 flex flex-col items-center justify-center gap-1.5 h-24 active:scale-95 transition cursor-pointer">
                                            <div className="w-9 h-9 rounded-full bg-white dark:bg-black/20 flex items-center justify-center shadow-sm text-lg">⚙️</div>
                                            <h3 className="font-bold text-[8px] uppercase tracking-tighter text-center">Управление</h3>
                                        </div>
                                    </div>
                                )}

                                {(!activeCycle || activeCycle.sheets.length === 0) ? (
                                    <div className="text-center py-20 flex flex-col items-center animate-fade-in">
                                        <span className="text-6xl mb-4 grayscale-[0.5]">📦</span>
                                        <h3 className="font-black dark:text-white text-lg">Нет бланков инвентаризации</h3>
                                        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-2 uppercase tracking-widest mb-6 text-center font-bold leading-tight">Создайте первый бланк вручную <br/> или импортируйте из Excel</p>
                                        {isAdmin && (
                                            <button onClick={() => { setIsAddingSheet(true); setModalSearchTerm(''); }} className="px-8 py-4 bg-gray-900 dark:bg-white text-white dark:text-black font-black rounded-3xl shadow-xl active:scale-95 transition-all text-[11px] uppercase tracking-widest">
                                                + Создать вручную
                                            </button>
                                        )}
                                    </div>
                                ) : (
                                    <div className="space-y-3 animate-slide-up">
                                        <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Активные бланки</h3>
                                        {activeCycle.sheets.map(sheet => {
                                            const filled = sheet.items.filter(i => i.actual !== undefined).length;
                                            const total = sheet.items.length;
                                            const pct = total > 0 ? Math.round((filled/total)*100) : 0;
                                            return (
                                                <div key={sheet.id} onClick={() => handleOpenSheet(sheet.id)} className="bg-white dark:bg-[#1e1e24] p-4 rounded-[2rem] shadow-sm border border-gray-100 dark:border-white/5 active:scale-[0.98] transition cursor-pointer flex items-center justify-between relative overflow-hidden group">
                                                    <div className="absolute bottom-0 left-0 h-1 bg-sky-500 transition-all duration-500" style={{ width: `${pct}%`, opacity: 0.3 }}></div>
                                                    <div className="flex items-center gap-4 relative z-10">
                                                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl shadow-inner ${sheet.status === 'submitted' ? 'bg-emerald-100 text-emerald-600' : 'bg-sky-50 text-sky-500 dark:bg-sky-500/10'}`}>
                                                            {sheet.status === 'submitted' ? '✅' : '🔪'}
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                            <h4 className="font-black text-gray-900 dark:text-white leading-tight uppercase text-xs tracking-tight truncate">{sheet.title}</h4>
                                                            <div className="flex items-center gap-2 mt-1">
                                                                <p className="text-[9px] text-gray-400 font-black uppercase tracking-tighter">{filled} / {total} поз.</p>
                                                                <span className="w-1 h-1 rounded-full bg-gray-200"></span>
                                                                <p className="text-[9px] text-sky-500 font-black">{pct}%</p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    {sheet.lockedBy && (
                                                        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[8px] font-black uppercase shadow-sm border ${sheet.lockedBy.id === user?.id ? 'bg-green-50 text-green-600 border-green-100' : 'bg-red-50 text-red-600 border-red-100'}`}>
                                                            <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse"></span>
                                                            <span>{sheet.lockedBy.id === user?.id ? 'В работе' : `${sheet.lockedBy.name}`}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                        {isAdmin && activeCycle.sheets.every(s => s.status === 'submitted') && (
                                            <div className="pt-8 px-4 animate-slide-up">
                                                <button onClick={finalizeCycle} disabled={isSaving} className="w-full py-5 bg-gradient-to-r from-emerald-600 to-green-500 text-white font-black rounded-[2rem] shadow-2xl shadow-emerald-600/30 uppercase tracking-[0.2em] text-[10px] active:scale-95 transition disabled:opacity-50">
                                                    {isSaving ? "Сохранение..." : "Завершить инвентаризацию"}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {viewMode === 'summary' && activeCycle && (
                            <div className="animate-slide-up space-y-5">
                                <button onClick={exportSummary} className="w-full py-4 bg-emerald-600 text-white rounded-[1.5rem] text-[10px] font-black uppercase shadow-lg shadow-emerald-600/20 active:scale-95 transition">Экспорт Excel</button>
                                <div className="bg-white dark:bg-[#1e1e24] rounded-[2.5rem] shadow-xl overflow-hidden border border-gray-100 dark:border-white/5">
                                    <div className="overflow-x-auto">
                                        <table className="w-full border-collapse">
                                            <thead className="bg-gray-50 dark:bg-black/20 text-[9px] font-black uppercase text-gray-400">
                                                <tr><th className="p-5 text-left tracking-widest">Товар</th><th className="p-5 text-right tracking-widest">Итог Факт</th></tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-50 dark:divide-white/5">
                                                {filteredSummaryItems.map((gi, i) => {
                                                    const total = activeCycle.sheets.reduce((acc, s) => {
                                                        const item = s.items.find(it => it.name === gi.name && it.unit === gi.unit);
                                                        return acc + (item?.actual || 0);
                                                    }, 0);
                                                    return (
                                                        <tr key={i} className="hover:bg-emerald-50/30 dark:hover:bg-emerald-500/5 transition-colors group">
                                                            <td className="p-5">
                                                                <div className="font-bold text-xs dark:text-white leading-none group-hover:text-emerald-600 transition-colors uppercase">{gi.name}</div>
                                                                <div className="text-[9px] text-gray-400 font-black mt-1.5 uppercase tracking-tighter">{gi.code} • {gi.unit}</div>
                                                            </td>
                                                            <td className={`p-5 text-right font-black text-sm ${total > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-200 dark:text-white/5'}`}>{total.toFixed(3).replace(/\.?0+$/, '')}</td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        )}

                        {viewMode === 'manage' && (
                            <div className="animate-slide-up space-y-4">
                                <div className="flex justify-between items-center px-1">
                                    <h3 className="text-[10px] font-black text-purple-600 uppercase tracking-widest">Управление бланками</h3>
                                    <button onClick={() => { setIsAddingSheet(true); setModalSearchTerm(''); }} className="px-5 py-2.5 bg-purple-600 text-white rounded-2xl text-[9px] font-black uppercase shadow-lg shadow-purple-500/20 transition active:scale-95">+ Создать бланк</button>
                                </div>
                                {activeCycle?.sheets.map(sheet => (
                                    <div key={sheet.id} className="bg-white dark:bg-[#1e1e24] p-4 pl-5 rounded-[2rem] border border-gray-100 dark:border-white/5 flex items-center justify-between shadow-sm group">
                                        <div className="min-w-0 flex-1 flex items-center gap-3">
                                            <div className="min-w-0 flex-1">
                                                <h4 className="font-black dark:text-white truncate uppercase text-xs tracking-tight">{sheet.title}</h4>
                                                <p className="text-[9px] text-gray-400 font-black uppercase mt-1 tracking-tighter">
                                                    {sheet.items.length} позиций 
                                                    {sheet.lockedBy && <span className="text-red-500 ml-1.5">• Блок: {sheet.lockedBy.name}</span>}
                                                </p>
                                            </div>
                                            <button onClick={() => setRenamingSheet({id: sheet.id, title: sheet.title})} className="w-8 h-8 rounded-full bg-gray-50 dark:bg-white/5 text-gray-400 hover:text-sky-500 transition-colors flex items-center justify-center">
                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" /></svg>
                                            </button>
                                        </div>
                                        <div className="flex gap-1 ml-2">
                                            {sheet.lockedBy && (
                                                <button onClick={async () => {
                                                    await apiFetch('/api/inventory/unlock', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cycleId: activeCycle!.id, sheetId: sheet.id }) });
                                                    loadDataSilent();
                                                    addToast("Блокировка снята", "info");
                                                }} className="w-10 h-10 rounded-2xl bg-amber-50 dark:bg-amber-500/10 text-amber-500 flex items-center justify-center active:scale-90 transition" title="Разблокировать"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M13.5 10.5V6.75a4.5 4.5 0 119 0v3.75M3.75 21.75h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H3.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" /></svg></button>
                                            )}
                                            <button onClick={() => { 
                                                setConfirmModal({
                                                    isOpen: true,
                                                    type: 'danger',
                                                    title: "Удалить бланк?",
                                                    message: `Вы действительно хотите безвозвратно удалить бланк "${sheet.title}"?`,
                                                    onConfirm: () => {
                                                        const updated = {...activeCycle!, sheets: activeCycle!.sheets.filter(s=>s.id!==sheet.id)};
                                                        apiFetch('/api/inventory/cycle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updated) });
                                                        setActiveCycle(updated); addToast("Удалено", "info");
                                                        lockSyncTemporarily();
                                                    }
                                                });
                                            }} className="w-10 h-10 rounded-2xl bg-red-50 dark:bg-red-500/10 text-red-500 flex items-center justify-center active:scale-90 transition"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M14.74 9l-.346 9m-4.788 0L9.26 9" /></svg></button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {viewMode === 'filling' && activeSheetId && activeCycle && (
                            <div className="space-y-1 pb-32 animate-fade-in">
                                {filteredSheetItems.map(item => (
                                    <InventoryItemRow 
                                        key={item.id} 
                                        item={item} 
                                        cycleId={activeCycle.id}
                                        sheetId={activeSheetId}
                                        onSync={handleActualSync} 
                                        onDelete={handleItemDelete}
                                        readOnly={!isLockedByMe && !isAdmin} 
                                    />
                                ))}
                                {filteredSheetItems.length === 0 && (
                                     <div className="text-center py-10 opacity-40 italic text-sm">Ничего не найдено</div>
                                )}
                                <div className="fixed bottom-6 left-4 right-4 z-[60] bg-white/80 dark:bg-[#1e1e24]/80 backdrop-blur-xl p-3 rounded-[2.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.15)] border border-gray-100 dark:border-white/5">
                                    {isLockedByOthers && !isAdmin ? (
                                        <button disabled className="w-full py-4 bg-gray-100 text-gray-400 font-black rounded-3xl uppercase text-[10px] tracking-widest opacity-50">Бланк занят ({currentSheet?.lockedBy?.name})</button>
                                    ) : (isLockedByMe || isAdmin) ? (
                                        <button onClick={submitSheet} className="w-full py-4 bg-gray-900 dark:bg-white text-white dark:text-black font-black rounded-3xl uppercase text-[10px] tracking-[0.2em] active:scale-95 transition shadow-xl">Сдать заполненный бланк</button>
                                    ) : (
                                        <button onClick={startInventory} className="w-full py-4 bg-sky-500 text-white font-black rounded-3xl uppercase text-[10px] tracking-[0.2em] active:scale-95 transition shadow-xl shadow-sky-500/30">Начать инвентаризацию</button>
                                    )}
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>

            <Modal isOpen={isImportModalOpen} onClose={() => setIsImportModalOpen(false)} title="Импорт станций" subtitle="Проверьте данные перед загрузкой" maxWidth="max-w-md">
                <div className="space-y-4">
                    {importSheets.map((s, i) => (
                        <div key={i} 
                             onClick={() => { const ns = [...importSheets]; ns[i].isSelected = !ns[i].isSelected; setImportSheets(ns); }}
                             className={`rounded-[2rem] border-2 transition-all overflow-hidden cursor-pointer ${s.isSelected ? 'border-sky-500 bg-sky-500/5 shadow-lg' : 'border-gray-100 dark:border-white/5 opacity-40 grayscale'}`}>
                            <div className="p-5 flex items-center gap-4">
                                <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${s.isSelected ? 'bg-sky-500 border-sky-500 shadow-sm' : 'border-gray-200 dark:border-white/10'}`}>
                                    {s.isSelected && <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={4}><path d="M5 13l4 4L19 7" /></svg>}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <h4 className="font-black text-xs dark:text-white uppercase tracking-tight truncate">{s.name}</h4>
                                    <p className="text-[9px] text-gray-400 font-bold uppercase mt-0.5">{s.data.length} строк найдено</p>
                                </div>
                            </div>
                            {s.isSelected && (
                                <div className="px-5 pb-5 animate-fade-in">
                                    <div className="bg-white/50 dark:bg-black/20 rounded-2xl p-3 border border-gray-100 dark:border-white/5">
                                        <p className="text-[8px] font-black text-gray-400 uppercase mb-2 tracking-widest leading-none">Первые строки:</p>
                                        <div className="space-y-1.5">
                                            {s.data.slice(0, 3).map((row, ridx) => (
                                                <div key={ridx} className="flex justify-between text-[9px] text-gray-600 dark:text-gray-400 font-medium">
                                                    <span className="truncate pr-2">{String(row[s.mapping.name] || '—')}</span>
                                                    <span className="font-black uppercase text-sky-500 whitespace-nowrap">{String(row[s.mapping.unit] || '')}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                    {isSaving && (
                        <div className="space-y-2 px-2">
                            <div className="h-1.5 w-full bg-gray-100 dark:bg-white/10 rounded-full overflow-hidden">
                                <div className="h-full bg-sky-500 transition-all duration-300" style={{ width: `${importProgress}%` }}></div>
                            </div>
                            <p className="text-[9px] text-center text-sky-500 font-black uppercase tracking-widest animate-pulse">Генерация бланков... {importProgress}%</p>
                        </div>
                    )}
                </div>
                <div className="grid grid-cols-2 gap-3 mt-8">
                    <button onClick={() => setIsImportModalOpen(false)} className="py-4 bg-gray-100 dark:bg-white/5 rounded-[1.5rem] font-bold text-gray-500 uppercase text-[10px] tracking-widest active:scale-95 transition">Отмена</button>
                    <button onClick={confirmStationImport} disabled={isSaving} className="py-4 bg-sky-600 text-white font-black rounded-[1.5rem] shadow-xl shadow-sky-500/20 uppercase text-[10px] tracking-widest active:scale-95 transition disabled:opacity-30">Импортировать</button>
                </div>
            </Modal>

            <Modal isOpen={isGlobalImportOpen} onClose={() => setIsGlobalImportOpen(false)} title="База товаров" subtitle="Загрузка справочника">
                <div className="space-y-5">
                    <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed text-center font-medium">Выберите файлы Excel для обновления базы. Файлы будут объединены и обработаны автоматически.</p>
                    <div className="space-y-3">
                        {[1, 2].map(num => {
                            const file = num === 1 ? globalFiles.file1 : globalFiles.file2;
                            return (
                                <div key={num} onClick={() => document.getElementById(`xl-global-${num}`)?.click()} className={`h-20 rounded-3xl border-2 border-dashed flex items-center px-5 gap-4 cursor-pointer transition-all active:scale-[0.98] ${file ? 'border-amber-500 bg-amber-500/5 shadow-inner' : 'border-gray-100 dark:border-white/10 hover:border-amber-400'}`}>
                                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-xl shadow-sm ${file ? 'bg-amber-500 text-white' : 'bg-gray-100 dark:bg-white/5'}`}>{file ? '✅' : '📁'}</div>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Файл {num}</p>
                                        <p className="text-xs font-bold dark:text-white truncate leading-none mt-1">{file ? file.name : 'Нажмите для выбора'}</p>
                                    </div>
                                    <input type="file" id={`xl-global-${num}`} className="hidden" accept=".xlsx,.xls" onChange={e => setGlobalFiles(p => ({...p, [`file${num}`]: e.target.files?.[0]}))} />
                                </div>
                            );
                        })}
                    </div>
                    {isSaving && (
                        <div className="mt-6 space-y-2">
                            <div className="h-1.5 w-full bg-gray-100 dark:bg-white/10 rounded-full overflow-hidden">
                                <div className="h-full bg-amber-500 transition-all duration-300" style={{ width: `${importProgress}%` }}></div>
                            </div>
                            <p className="text-[9px] text-center text-amber-500 font-black uppercase tracking-widest animate-pulse">Синхронизация... {importProgress}%</p>
                        </div>
                    )}
                </div>
                <div className="grid grid-cols-2 gap-3 mt-8">
                    <button onClick={() => { setIsGlobalImportOpen(false); setGlobalFiles({}); }} className="py-3.5 bg-gray-100 dark:bg-white/5 rounded-2xl font-bold text-gray-500 uppercase text-[10px] tracking-widest">Отмена</button>
                    <button onClick={handleGlobalImportStart} disabled={isSaving || (!globalFiles.file1 && !globalFiles.file2)} className="py-3.5 bg-amber-500 text-white font-black rounded-2xl uppercase text-[10px] tracking-widest shadow-lg shadow-amber-500/30 disabled:opacity-30">Начать Импорт</button>
                </div>
            </Modal>

            <Modal isOpen={isAddingSheet} onClose={() => { setIsAddingSheet(false); setInitialAmount(''); setSelectedGlobalIds(new Set()); setModalSearchTerm(''); }} title={viewMode === 'filling' ? 'Добавить товары' : 'Новый бланк'} subtitle="Выберите из базы">
                <div className="space-y-6">
                    {viewMode !== 'filling' && (
                        <div className="bg-gray-50 dark:bg-black/40 rounded-2xl px-5 py-4 border-2 border-transparent focus-within:border-purple-500/20 transition-all shadow-inner">
                            <label className="text-[9px] uppercase font-black tracking-widest text-gray-400 mb-1.5 block">Название станции</label>
                            <input type="text" placeholder="Напр. Холодный цех" className="w-full bg-transparent font-black text-lg dark:text-white outline-none" value={newSheetTitle} onChange={e => setNewSheetTitle(e.target.value)} />
                        </div>
                    )}
                    <div className="relative group">
                        <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-gray-400 group-focus-within:text-sky-500 transition-colors">
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                        </div>
                        <input type="text" placeholder="Поиск товара..." className="w-full bg-gray-50 dark:bg-black/40 rounded-2xl py-3.5 pl-12 pr-4 text-sm font-bold dark:text-white outline-none shadow-inner border-2 border-transparent focus:border-sky-500/20 transition-all" value={modalSearchTerm} onChange={e => setModalSearchTerm(e.target.value)} />
                    </div>
                    {viewMode === 'filling' && (
                         <div className="bg-sky-50 dark:bg-sky-500/5 rounded-2xl p-4 border border-sky-100 dark:border-sky-500/20">
                            <label className="text-[9px] uppercase font-black tracking-widest text-sky-600 dark:text-sky-400 mb-1.5 block">Общий остаток для всех (опц.)</label>
                            <input 
                                type="text" 
                                inputMode="decimal"
                                placeholder="0.00" 
                                className="w-full bg-transparent font-black text-2xl text-sky-600 dark:text-sky-400 outline-none" 
                                value={initialAmount} 
                                onChange={e => {
                                    const val = e.target.value.replace(',', '.');
                                    if(/^[0-9]*\.?[0-9]*$/.test(val)) setInitialAmount(val);
                                }} 
                            />
                         </div>
                    )}
                    <div className="space-y-1.5 max-h-[40vh] overflow-y-auto no-scrollbar pr-1">
                        {filteredGlobalForAdding.length === 0 ? (
                            <p className="text-center text-xs text-gray-400 py-4 italic">Товары не найдены или уже в списке</p>
                        ) : filteredGlobalForAdding.map(gi => {
                            const key = `${gi.code}_${gi.name}`;
                            const selected = selectedGlobalIds.has(key);
                            return (
                                <div key={key} onClick={() => { 
                                    const n = new Set(selectedGlobalIds);
                                    if(selected) n.delete(key);
                                    else n.add(key);
                                    setSelectedGlobalIds(n);
                                }} className={`p-4 rounded-2xl flex items-center gap-4 transition-all cursor-pointer border-2 ${selected ? 'bg-sky-600 border-sky-500 text-white shadow-lg' : 'bg-gray-50 dark:bg-white/5 border-transparent hover:bg-gray-100 dark:hover:bg-white/10'}`}>
                                    <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${selected ? 'bg-white border-white' : 'border-gray-200 dark:border-white/10'}`}>
                                        {selected && <svg className="w-4 h-4 text-sky-600 font-bold" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={4}><path d="M5 13l4 4L19 7" /></svg>}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-[11px] font-black leading-tight truncate uppercase tracking-tight">{gi.name}</p>
                                        <p className={`text-[8px] font-black uppercase mt-1 tracking-widest ${selected ? 'text-white/60' : 'text-gray-400'}`}>{gi.code} • {gi.unit}</p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-3 mt-8">
                    <button onClick={() => { setIsAddingSheet(false); setSelectedGlobalIds(new Set()); setInitialAmount(''); setModalSearchTerm(''); }} className="py-4 bg-gray-100 dark:bg-white/5 rounded-[1.5rem] font-bold text-gray-500 uppercase text-[10px] tracking-widest">Отмена</button>
                    <button 
                        onClick={async () => {
                            if (viewMode === 'filling') {
                                const updated = {...activeCycle!};
                                const s = updated.sheets.find(sh => sh.id === activeSheetId);
                                if (s) { 
                                    setIsSaving(true);
                                    const num = parseFloat(initialAmount);
                                    const selectedItemsFromGlobal = globalItems.filter(gi => selectedGlobalIds.has(`${gi.code}_${gi.name}`));
                                    selectedItemsFromGlobal.forEach(gi => {
                                        s.items.push({ id: uuidv4(), name: gi.name, unit: gi.unit, code: gi.code, actual: isNaN(num) ? undefined : num });
                                    });
                                    try {
                                        await apiFetch('/api/inventory/cycle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updated) });
                                        setActiveCycle(updated); 
                                        setIsAddingSheet(false); setInitialAmount(''); setSelectedGlobalIds(new Set()); setModalSearchTerm('');
                                        addToast(`Добавлено позиций: ${selectedGlobalIds.size}`, "success");
                                        lockSyncTemporarily();
                                    } catch (e) { addToast("Ошибка добавления", "error"); }
                                    finally { setIsSaving(false); }
                                }
                            } else {
                                handleCreateSheet();
                            }
                        }} 
                        disabled={isSaving || (viewMode === 'filling' && selectedGlobalIds.size === 0) || (viewMode !== 'filling' && !newSheetTitle)}
                        className="py-4 bg-gray-900 dark:bg-white text-white dark:text-black font-black rounded-[1.5rem] shadow-xl uppercase text-[10px] tracking-widest active:scale-95 transition disabled:opacity-30"
                    >
                        {isSaving ? '...' : (viewMode === 'filling' ? `Добавить (${selectedGlobalIds.size})` : 'Создать')}
                    </button>
                </div>
            </Modal>

            {renamingSheet && (
                <Modal isOpen={true} onClose={() => setRenamingSheet(null)} title="Переименовать" subtitle="Название станции">
                    <div className="space-y-4">
                        <input 
                            autoFocus
                            type="text" 
                            className="w-full bg-gray-50 dark:bg-black/20 rounded-xl px-4 py-3 text-lg font-bold dark:text-white outline-none focus:ring-2 focus:ring-sky-500/20 transition-all"
                            value={renamingSheet.title}
                            onChange={e => setRenamingSheet({...renamingSheet, title: e.target.value})}
                        />
                        <button 
                            onClick={async () => {
                                const updated = {...activeCycle!};
                                const s = updated.sheets.find(sh => sh.id === renamingSheet.id);
                                if(s) s.title = renamingSheet.title;
                                setIsSaving(true);
                                try {
                                    await apiFetch('/api/inventory/cycle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updated) });
                                    setActiveCycle(updated);
                                    setRenamingSheet(null);
                                    addToast("Название обновлено", "success");
                                    lockSyncTemporarily();
                                } catch (e) { addToast("Ошибка", "error"); }
                                finally { setIsSaving(false); }
                            }}
                            disabled={isSaving}
                            className="w-full py-4 bg-sky-500 text-white font-black rounded-2xl shadow-lg shadow-sky-500/30 active:scale-95 transition-all text-xs tracking-widest uppercase disabled:opacity-50"
                        >
                            {isSaving ? '...' : 'Сохранить'}
                        </button>
                    </div>
                </Modal>
            )}
        </div>
    );
};

export default Inventory;
