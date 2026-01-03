
import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { WastageLog, WastageItem, WastageReason, ImageUrls } from '../types';
import { useToast } from '../context/ToastContext';
import { useTelegram } from '../context/TelegramContext';
import { apiFetch } from '../services/api';
import { uploadImage } from '../services/uploadService';
import { scopedStorage } from '../services/storage';

const REASONS: { value: WastageReason; label: string; icon: string }[] = [
    { value: 'spoilage', label: 'Порча', icon: '🥀' },
    { value: 'expired', label: 'Срок годности', icon: '⏰' },
    { value: 'mistake', label: 'Ошибка', icon: '🥣' },
    { value: 'training', label: 'Обучение', icon: '🎓' },
    { value: 'staff', label: 'Питание', icon: '🥗' },
    { value: 'employee', label: 'Сотрудник', icon: '👤' },
    { value: 'other', label: 'Другое', icon: '❓' }
];

const Wastage: React.FC = () => {
    const navigate = useNavigate();
    const { addToast } = useToast();
    const { user, isAdmin } = useTelegram();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [logs, setLogs] = useState<WastageLog[]>([]);
    const [isAdding, setIsAdding] = useState(false);
    const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

    // New Entry State
    const [newItem, setNewItem] = useState<Partial<WastageItem>>({
        reason: 'spoilage',
        unit: 'кг'
    });
    const [actPhoto, setActPhoto] = useState<string>('');
    const [actPhotos, setActPhotos] = useState<ImageUrls | null>(null);

    useEffect(() => {
        const cached = scopedStorage.getJson<WastageLog[]>('wastage_logs', []);
        if (cached && cached.length > 0) {
            setLogs(cached);
        }
        
        apiFetch('/api/wastage')
            .then(res => {
                if (!res.ok) throw new Error();
                return res.json();
            })
            .then(data => {
                if (Array.isArray(data)) {
                    setLogs(data);
                    scopedStorage.setJson('wastage_logs', data);
                }
            })
            .catch(() => {
                console.warn("Wastage API unavailable, using local cache.");
            });
    }, []);

    const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setIsUploadingPhoto(true);
            try {
                // Загружаем в папку 'wastages'
                const urls = await uploadImage(file, 'wastages');
                setActPhoto(urls.original);
                setActPhotos(urls);
                addToast("Фото прикреплено", "success");
            } catch (err: any) {
                addToast(err.message || "Ошибка при загрузке фото", "error");
            } finally {
                setIsUploadingPhoto(false);
            }
        }
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleSave = async () => {
        if (!newItem.ingredientName || !newItem.amount) {
            addToast("Заполните название и количество", "error");
            return;
        }

        const item: WastageItem = {
            id: uuidv4(),
            ingredientName: newItem.ingredientName!,
            amount: newItem.amount!,
            unit: newItem.unit || 'кг',
            reason: newItem.reason || 'spoilage',
            comment: newItem.comment,
            photoUrl: actPhoto,
            photoUrls: actPhotos || undefined
        };

        const newLog: WastageLog = {
            id: uuidv4(),
            date: Date.now(),
            items: [item],
            createdBy: user ? `${user.first_name} ${user.last_name || ''}` : 'Unknown'
        };

        try {
            const res = await apiFetch('/api/wastage', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newLog)
            });
            
            if (!res.ok) throw new Error();

            setLogs(prev => {
                const updated = [newLog, ...prev];
                scopedStorage.setJson('wastage_logs', updated);
                return updated;
            });

            addToast("Списание сохранено", "success");
            setIsAdding(false);
            setNewItem({ reason: 'spoilage', unit: 'кг' });
            setActPhoto('');
            setActPhotos(null);
        } catch (err) {
            addToast("Ошибка сохранения", "error");
        }
    };

    return (
        <div className="pb-28 animate-fade-in min-h-screen bg-[#f2f4f7] dark:bg-[#0f1115]">
            <div className="pt-safe-top px-5 pb-4 sticky top-0 z-40 bg-[#f2f4f7]/85 dark:bg-[#0f1115]/85 backdrop-blur-md border-b border-gray-100 dark:border-white/5">
                <div className="flex items-center justify-between pt-4">
                    <div className="flex items-center gap-3">
                        <button onClick={() => navigate('/')} className="w-10 h-10 rounded-full bg-white dark:bg-[#1e1e24] shadow-sm flex items-center justify-center dark:text-white border border-gray-100 dark:border-white/5 active:scale-95 transition">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
                        </button>
                        <div>
                            <h1 className="text-xl font-black text-gray-900 dark:text-white leading-none">Списания</h1>
                            <p className="text-[10px] text-gray-400 font-bold uppercase mt-1 tracking-widest">Журнал потерь</p>
                        </div>
                    </div>
                    {isAdmin && !isAdding && (
                        <button onClick={() => setIsAdding(true)} className="w-10 h-10 rounded-full bg-red-500 text-white flex items-center justify-center shadow-lg shadow-red-500/30 active:scale-95 transition">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                        </button>
                    )}
                </div>
            </div>

            <div className="px-5 pt-6 space-y-4">
                {isAdding ? (
                    <div className="bg-white dark:bg-[#1e1e24] p-6 rounded-[2.5rem] shadow-xl border border-gray-100 dark:border-white/5 space-y-5 animate-slide-up">
                        <div className="flex justify-between items-center">
                            <h2 className="text-lg font-black dark:text-white uppercase">Новый акт</h2>
                            <button onClick={() => setIsAdding(false)} className="text-gray-400">✕</button>
                        </div>

                        <div className="space-y-4">
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-gray-400 uppercase ml-2">Ингредиент</label>
                                <input 
                                    type="text" 
                                    className="w-full bg-gray-50 dark:bg-black/20 rounded-2xl px-4 py-3 text-sm font-bold dark:text-white outline-none focus:ring-2 focus:ring-red-500/20"
                                    placeholder="Напр. Томаты"
                                    value={newItem.ingredientName || ''}
                                    onChange={e => setNewItem({...newItem, ingredientName: e.target.value})}
                                />
                            </div>

                            <div className="flex gap-3">
                                <div className="flex-1 space-y-1">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase ml-2">Кол-во</label>
                                    <input 
                                        type="text" 
                                        inputMode="decimal"
                                        className="w-full bg-gray-50 dark:bg-black/20 rounded-2xl px-4 py-3 text-sm font-bold dark:text-white outline-none focus:ring-2 focus:ring-red-500/20"
                                        placeholder="0.5"
                                        value={newItem.amount || ''}
                                        onChange={e => setNewItem({...newItem, amount: e.target.value})}
                                    />
                                </div>
                                <div className="w-24 space-y-1">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase ml-2">Ед. изм.</label>
                                    <select 
                                        className="w-full bg-gray-50 dark:bg-black/20 rounded-2xl px-4 py-3 text-sm font-bold dark:text-white outline-none appearance-none"
                                        value={newItem.unit || 'кг'}
                                        onChange={e => setNewItem({...newItem, unit: e.target.value})}
                                    >
                                        <option value="кг">кг</option>
                                        <option value="г">г</option>
                                        <option value="л">л</option>
                                        <option value="мл">мл</option>
                                        <option value="шт">шт</option>
                                    </select>
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-gray-400 uppercase ml-2">Причина</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {REASONS.map(r => (
                                        <button 
                                            key={r.value}
                                            onClick={() => setNewItem({...newItem, reason: r.value})}
                                            className={`py-2.5 rounded-xl text-[10px] font-bold uppercase transition-all flex items-center justify-center gap-1.5 border-2 ${newItem.reason === r.value ? 'bg-red-500 text-white border-red-500 shadow-md' : 'bg-transparent text-gray-400 border-gray-100 dark:border-white/5'}`}
                                        >
                                            <span>{r.icon}</span> {r.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-gray-400 uppercase ml-2">Комментарий</label>
                                <textarea 
                                    className="w-full bg-gray-50 dark:bg-black/20 rounded-2xl px-4 py-3 text-sm dark:text-white outline-none resize-none h-20"
                                    placeholder="Детали списания..."
                                    value={newItem.comment || ''}
                                    onChange={e => setNewItem({...newItem, comment: e.target.value})}
                                />
                            </div>

                            <div className="flex gap-3">
                                <div 
                                    onClick={() => fileInputRef.current?.click()}
                                    className={`flex-1 h-14 rounded-2xl border-2 border-dashed flex items-center justify-center gap-2 cursor-pointer transition-all ${actPhoto ? 'border-green-500 bg-green-500/5' : 'border-gray-200 dark:border-white/10'}`}
                                >
                                    {isUploadingPhoto ? (
                                        <div className="animate-spin text-sky-500">⏳</div>
                                    ) : actPhoto ? (
                                        <div className="flex items-center gap-2 text-green-600 font-bold text-xs">✅ Фото готово</div>
                                    ) : (
                                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">📷 Прикрепить фото</span>
                                    )}
                                </div>
                                <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handlePhotoUpload} />
                            </div>

                            <button onClick={handleSave} className="w-full py-4 bg-red-600 text-white font-black rounded-2xl shadow-lg shadow-red-600/20 active:scale-95 transition-all text-xs tracking-widest uppercase">
                                Создать акт списания
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {logs.length === 0 ? (
                            <div className="text-center py-20 opacity-50 flex flex-col items-center">
                                <span className="text-6xl mb-4">📝</span>
                                <h3 className="font-bold dark:text-white">Журнал пуст</h3>
                                <p className="text-xs text-gray-400 mt-2 px-10 leading-tight uppercase">Все акты списания будут отображаться здесь</p>
                            </div>
                        ) : (
                            logs.map(log => (
                                <div key={log.id} className="bg-white dark:bg-[#1e1e24] p-5 rounded-[2rem] shadow-sm border border-gray-100 dark:border-white/5 animate-slide-up">
                                    <div className="flex justify-between items-start mb-4">
                                        <div>
                                            <h4 className="font-bold text-gray-900 dark:text-white">{new Date(log.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</h4>
                                            <p className="text-[9px] text-gray-400 font-black uppercase mt-1">{log.createdBy}</p>
                                        </div>
                                        <div className="w-8 h-8 rounded-full bg-red-50 dark:bg-red-500/10 flex items-center justify-center text-red-500">
                                            📉
                                        </div>
                                    </div>
                                    <div className="space-y-3">
                                        {log.items.map(item => (
                                            <div key={item.id} className="bg-gray-50 dark:bg-black/20 p-4 rounded-2xl flex gap-4">
                                                {(item.photoUrls?.small || item.photoUrl) && (
                                                    <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 bg-white shadow-sm cursor-pointer" onClick={() => window.open(item.photoUrls?.original || item.photoUrl, '_blank')}>
                                                        <img src={item.photoUrls?.small || item.photoUrl} className="w-full h-full object-cover" />
                                                    </div>
                                                )}
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex justify-between items-start">
                                                        <h5 className="font-bold text-sm dark:text-white truncate">{item.ingredientName}</h5>
                                                        <span className="font-black text-red-500 text-xs whitespace-nowrap ml-2">{item.amount} {item.unit}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <span className="text-[8px] font-black bg-red-100 dark:bg-red-500/20 text-red-600 px-1.5 py-0.5 rounded uppercase">{REASONS.find(r => r.value === item.reason)?.label || item.reason}</span>
                                                        {item.comment && <p className="text-[10px] text-gray-400 truncate italic">"{item.comment}"</p>}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default Wastage;
