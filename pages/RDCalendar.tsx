
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { v4 as uuidv4 } from 'uuid';
import { RDTask, RDStatus } from '../types';
import { useToast } from '../context/ToastContext';
import { scopedStorage } from '../services/storage';
import { uploadImage } from '../services/uploadService';

const RDCalendar: React.FC = () => {
    const navigate = useNavigate();
    const { addToast } = useToast();
    const fileInputRef = useRef<HTMLInputElement>(null);
    
    // --- STATE ---
    const [tasks, setTasks] = useState<RDTask[]>([]);
    const [activeTab, setActiveTab] = useState<RDStatus>('idea');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    
    // New/Edit Task State
    const [currentTask, setCurrentTask] = useState<Partial<RDTask>>({});

    // --- LOAD/SAVE ---
    useEffect(() => {
        const saved = scopedStorage.getJson<RDTask[] | null>('rd_tasks', null);
        if (saved) {
            setTasks(saved);
        } else {
            setTasks([{ id: '1', title: 'Острый соус из манго', notes: 'Нужен хабанеро', status: 'idea', createdAt: Date.now() }]);
        }
    }, []);

    useEffect(() => {
        if (tasks.length > 0) scopedStorage.setJson('rd_tasks', tasks);
    }, [tasks]);

    // --- ACTIONS ---
    const handleSaveTask = () => {
        if (!currentTask.title?.trim()) { addToast("Введите название", "error"); return; }
        
        if (currentTask.id) {
            setTasks(prev => prev.map(t => t.id === currentTask.id ? { ...t, ...currentTask } as RDTask : t));
        } else {
            const newTask: RDTask = {
                id: uuidv4(),
                title: currentTask.title,
                notes: currentTask.notes || '',
                status: activeTab,
                imageUrl: currentTask.imageUrl,
                imageUrls: currentTask.imageUrls,
                tastingRating: currentTask.tastingRating,
                tastingFeedback: currentTask.tastingFeedback,
                createdAt: Date.now()
            };
            setTasks(prev => [...prev, newTask]);
        }
        setIsModalOpen(false);
        setCurrentTask({});
        addToast("Сохранено", "success");
    };

    const handleDelete = (id: string) => {
        if(confirm('Удалить эту идею?')) {
            setTasks(prev => prev.filter(t => t.id !== id));
            setIsModalOpen(false);
            addToast("Удалено", "info");
        }
    };

    const moveTask = (task: Partial<RDTask>, direction: 'next' | 'prev') => {
        const statuses: RDStatus[] = ['idea', 'work', 'tasting', 'done'];
        const currentIdx = statuses.indexOf(task.status || 'idea');
        const newIdx = direction === 'next' ? currentIdx + 1 : currentIdx - 1;
        
        if (newIdx >= 0 && newIdx < statuses.length) {
            const newStatus = statuses[newIdx];
            const updatedTask = { ...task, status: newStatus };
            setCurrentTask(updatedTask);
            
            if (task.id) {
                setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus } : t));
            }
        }
    };

    const getStatusLabel = (s: string) => {
        switch(s) {
            case 'idea': return 'Идеи';
            case 'work': return 'В работе';
            case 'tasting': return 'Дегустация';
            case 'done': return 'В меню';
            default: return s;
        }
    };

    const getStatusColor = (s: string) => {
        switch(s) {
            case 'idea': return 'text-gray-500 bg-gray-100 dark:bg-gray-800 dark:text-gray-400';
            case 'work': return 'text-blue-600 bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400';
            case 'tasting': return 'text-orange-600 bg-orange-100 dark:bg-orange-900/30 dark:text-orange-400';
            case 'done': return 'text-green-600 bg-green-100 dark:bg-green-900/30 dark:text-green-400';
            default: return 'text-gray-500';
        }
    };
    
    const getStatusDot = (s: string) => {
        switch(s) {
            case 'idea': return 'bg-gray-400';
            case 'work': return 'bg-blue-500';
            case 'tasting': return 'bg-orange-500';
            case 'done': return 'bg-green-500';
            default: return 'bg-gray-400';
        }
    };
    
    // Fix: extract original URL from ImageUrls to match string property and store full ImageUrls object
    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setIsUploading(true);
            try {
                const url = await uploadImage(file, 'rd');
                setCurrentTask(prev => ({ ...prev, imageUrl: url.original, imageUrls: url }));
                addToast("Фото прикреплено", "success");
            } catch (e) {
                addToast("Ошибка при загрузке фото", "error");
            } finally {
                setIsUploading(false);
            }
        }
    };

    const filteredTasks = tasks.filter(t => t.status === activeTab);

    return (
        <div className="px-5 pt-safe-top pb-24 animate-fade-in min-h-screen relative z-10">
            <div className="flex items-center justify-between pt-6 mb-6">
                 <div className="flex items-center gap-3">
                    <button onClick={() => navigate(-1)} className="p-2 bg-white dark:bg-white/10 rounded-full shadow-sm hover:scale-105 transition">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5 dark:text-white"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                        </svg>
                    </button>
                    <div>
                        <h1 className="text-2xl font-black text-gray-900 dark:text-white leading-none">R&D</h1>
                        <p className="text-xs text-gray-400 font-bold tracking-wider uppercase">Календарь проработок</p>
                    </div>
                 </div>
                 <button onClick={() => { setCurrentTask({ status: activeTab }); setIsModalOpen(true); }} className="w-10 h-10 bg-indigo-500 rounded-full flex items-center justify-center text-white shadow-lg shadow-indigo-500/30 active:scale-90 transition hover:bg-indigo-600">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                 </button>
            </div>

            <div className="flex bg-white dark:bg-[#1e1e24] p-1 rounded-xl shadow-sm border border-gray-100 dark:border-white/5 mb-6 overflow-x-auto no-scrollbar">
                {(['idea', 'work', 'tasting', 'done'] as RDStatus[]).map(status => (
                    <button
                        key={status}
                        onClick={() => setActiveTab(status)}
                        className={`flex-1 py-2 px-4 rounded-lg text-xs font-bold uppercase tracking-wider whitespace-nowrap transition-all ${
                            activeTab === status 
                            ? 'bg-indigo-500 text-white shadow-md' 
                            : 'text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5'
                        }`}
                    >
                        {getStatusLabel(status)}
                        <span className={`ml-1.5 py-0.5 px-1.5 rounded-md text-[9px] ${activeTab === status ? 'bg-white/20' : 'bg-gray-100 dark:bg-white/10 text-gray-500'}`}>
                            {tasks.filter(t => t.status === status).length}
                        </span>
                    </button>
                ))}
            </div>

            <div className="space-y-3">
                {filteredTasks.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 opacity-50">
                        <div className="w-16 h-16 bg-gray-100 dark:bg-white/5 rounded-full flex items-center justify-center text-3xl mb-3">💡</div>
                        <p className="text-gray-500 font-bold">Здесь пока пусто</p>
                        <p className="text-xs text-gray-400">Добавьте новую идею кнопкой +</p>
                    </div>
                ) : (
                    filteredTasks.map(task => (
                        <div key={task.id} onClick={() => { setCurrentTask(task); setIsModalOpen(true); }} className="bg-white dark:bg-[#1e1e24] p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-white/5 active:scale-[0.98] transition-transform cursor-pointer hover:shadow-md hover:border-indigo-500/30">
                            <div className="flex gap-4">
                                {(task.imageUrls?.small || task.imageUrl) && (
                                    <div className="w-16 h-16 rounded-xl bg-gray-100 overflow-hidden flex-shrink-0">
                                        <img src={task.imageUrls?.small || task.imageUrl} className="w-full h-full object-cover" />
                                    </div>
                                )}
                                <div className="flex-1 min-w-0 flex flex-col justify-center">
                                    <h3 className="font-bold text-gray-900 dark:text-white text-lg leading-tight mb-1 truncate">{task.title}</h3>
                                    <p className="text-xs text-gray-500 line-clamp-2">{task.notes || 'Нет заметок'}</p>
                                    
                                    {task.tastingRating && (
                                        <div className="flex gap-0.5 mt-2">
                                            {[1,2,3,4,5].map(star => (
                                                <svg key={star} className={`w-3 h-3 ${star <= task.tastingRating! ? 'text-yellow-400' : 'text-gray-200 dark:text-gray-700'}`} fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <div className="flex items-center text-gray-300">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {isModalOpen && createPortal(
                <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white dark:bg-[#1e1e24] w-full max-w-md rounded-t-[2rem] sm:rounded-[2rem] shadow-2xl animate-slide-up overflow-hidden flex flex-col max-h-[90vh] h-full sm:h-auto">
                        <div className="px-5 py-4 border-b border-gray-100 dark:border-white/5 flex justify-between items-center bg-white dark:bg-[#1e1e24] flex-shrink-0 z-10">
                            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${getStatusColor(currentTask.status || 'idea')}`}>
                                <span className={`w-2 h-2 rounded-full ${getStatusDot(currentTask.status || 'idea')}`}></span>
                                <span className="text-xs font-bold uppercase tracking-wide">{getStatusLabel(currentTask.status || 'idea')}</span>
                            </div>

                            <button onClick={() => setIsModalOpen(false)} className="bg-gray-100 dark:bg-white/10 p-2 rounded-full text-gray-500 hover:bg-gray-200 dark:hover:bg-white/20 transition">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                        
                        <div className="p-5 overflow-y-auto flex-1 no-scrollbar space-y-6">
                             
                             <input type="file" ref={fileInputRef} accept="image/*" className="hidden" onChange={handleImageUpload} />
                             
                             {isUploading ? (
                                <div className="w-full h-40 rounded-2xl bg-gray-50 dark:bg-black/20 flex flex-col items-center justify-center gap-3">
                                    <div className="animate-spin text-sky-500"><svg className="w-8 h-8" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg></div>
                                    <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Загрузка фото...</span>
                                </div>
                             ) : (currentTask.imageUrls?.medium || currentTask.imageUrl) ? (
                                 <div className="relative w-full h-40 rounded-2xl overflow-hidden group mb-2 shadow-sm border border-gray-100 dark:border-white/5">
                                     <img src={currentTask.imageUrls?.medium || currentTask.imageUrl} className="w-full h-full object-cover" />
                                     <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                        <button onClick={() => fileInputRef.current?.click()} className="bg-white text-black text-xs font-bold px-4 py-2 rounded-xl shadow-lg transform hover:scale-105 transition">📷 Изменить фото</button>
                                     </div>
                                 </div>
                             ) : (
                                 <button onClick={() => fileInputRef.current?.click()} className="w-full h-32 rounded-2xl border-2 border-dashed border-gray-200 dark:border-white/10 flex flex-col items-center justify-center gap-2 text-gray-400 hover:text-indigo-500 hover:border-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/10 transition-all group">
                                     <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-white/5 flex items-center justify-center group-hover:scale-110 transition">
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" /><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" /></svg>
                                     </div>
                                     <span className="text-xs font-bold uppercase tracking-wide">Добавить фото</span>
                                 </button>
                             )}

                             <div className="group">
                                <label className="text-[10px] uppercase font-bold text-gray-400 mb-1.5 flex items-center gap-1">Название блюда</label>
                                <input 
                                    className="w-full bg-gray-50 dark:bg-black/20 rounded-xl px-4 py-3 text-lg font-bold text-gray-900 dark:text-white outline-none placeholder-gray-400 focus:ring-2 focus:ring-indigo-500/20 focus:bg-white dark:focus:bg-[#2a2a35] transition-all" 
                                    placeholder="Введите название..." 
                                    value={currentTask.title || ''} 
                                    onChange={e => setCurrentTask(prev => ({...prev, title: e.target.value}))} 
                                />
                             </div>
                             
                             <div className="group">
                                <label className="text-[10px] uppercase font-bold text-gray-400 mb-1.5 flex items-center gap-1">👨‍🍳 Заметки и проработки</label>
                                <textarea 
                                    className="w-full bg-gray-50 dark:bg-black/20 rounded-xl px-4 py-3 text-sm leading-relaxed text-gray-700 dark:text-gray-300 outline-none resize-none placeholder-gray-400 min-h-[140px] focus:ring-2 focus:ring-indigo-500/20 focus:bg-white dark:focus:bg-[#2a2a35] transition-all" 
                                    placeholder="Опишите состав, что изменить, что добавить..." 
                                    value={currentTask.notes || ''} 
                                    onChange={e => setCurrentTask(prev => ({...prev, notes: e.target.value}))} 
                                />
                             </div>

                             {(currentTask.status === 'tasting' || currentTask.status === 'done') && (
                                 <div className="mt-4 pt-4 border-t border-gray-100 dark:border-white/5 animate-fade-in">
                                     <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                                        <span className="w-1.5 h-1.5 bg-orange-500 rounded-full"></span>
                                        Вердикт дегустации
                                     </h4>
                                     <div className="bg-orange-50 dark:bg-orange-500/5 p-4 rounded-2xl border border-orange-100 dark:border-orange-500/10">
                                         <div className="flex gap-4 mb-3 justify-center">
                                             {[1,2,3,4,5].map(star => (
                                                 <button key={star} onClick={() => setCurrentTask(prev => ({...prev, tastingRating: star}))} className="hover:scale-125 transition active:scale-95 p-1">
                                                     <svg className={`w-8 h-8 ${star <= (currentTask.tastingRating || 0) ? 'text-orange-400 drop-shadow-sm' : 'text-gray-300 dark:text-gray-700'}`} fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
                                                 </button>
                                             ))}
                                         </div>
                                         <input 
                                            className="w-full bg-white dark:bg-black/20 rounded-xl px-3 py-2 text-sm text-center outline-none dark:text-white placeholder-gray-400 focus:ring-1 focus:ring-orange-400" 
                                            placeholder="Напишите итог дегустации..." 
                                            value={currentTask.tastingFeedback || ''} 
                                            onChange={e => setCurrentTask(prev => ({...prev, tastingFeedback: e.target.value}))} 
                                        />
                                     </div>
                                 </div>
                             )}
                        </div>

                        <div className="p-4 border-t border-gray-100 dark:border-white/5 bg-white/95 dark:bg-[#1e1e24]/95 backdrop-blur-sm flex-shrink-0 space-y-3" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}>
                            {currentTask.id && (
                                <div className="grid grid-cols-2 gap-3">
                                    <button onClick={() => moveTask(currentTask, 'prev')} disabled={currentTask.status === 'idea'} className="py-3 flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-white/10 rounded-xl disabled:opacity-30 transition">← Назад</button>
                                    <button onClick={() => moveTask(currentTask, 'next')} disabled={currentTask.status === 'done'} className="py-3 flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 dark:bg-indigo-500/10 rounded-xl disabled:opacity-30 transition">Вперед →</button>
                                </div>
                            )}

                            <div className="flex gap-3">
                                {currentTask.id && (
                                    <button onClick={() => handleDelete(currentTask.id!)} className="p-4 rounded-xl bg-red-50 dark:bg-red-500/10 text-red-500 font-bold transition">
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                                    </button>
                                )}
                                <button onClick={handleSaveTask} disabled={isUploading} className="flex-1 bg-indigo-500 text-white font-bold py-4 rounded-xl shadow-lg shadow-indigo-500/30 active:scale-95 transition text-lg disabled:opacity-50">
                                    {currentTask.id ? 'Сохранить' : 'Создать идею'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};

export default RDCalendar;
