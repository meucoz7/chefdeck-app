
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { Checklist, ChecklistType } from '../types';
import { useToast } from '../context/ToastContext';
import { scopedStorage } from '../services/storage';
import { uploadImage } from '../services/uploadService';

const DEFAULT_CHECKLISTS: Checklist[] = [
    {
        id: 'hygiene', title: 'Гигиенический журнал', subtitle: 'Здоровье персонала', type: 'log', icon: '🏥',
        items: [
            { id: '1', text: 'Шеф-повар', completed: false, inputType: 'health', value: 'Здоров' },
            { id: '2', text: 'Су-шеф', completed: false, inputType: 'health', value: 'Здоров' },
            { id: '3', text: 'Повар Г/Ц', completed: false, inputType: 'health', value: 'Здоров' }
        ]
    },
    {
        id: 'fridge', title: 'Температурный журнал', subtitle: 'Холодильное оборудование', type: 'log', icon: '❄️',
        items: [
            { id: '1', text: 'Холодильник (Овощи)', completed: false, inputType: 'number', value: '4.0' },
            { id: '2', text: 'Холодильник (Мясо)', completed: false, inputType: 'number', value: '2.0' },
            { id: '3', text: 'Морозилка (Рыба)', completed: false, inputType: 'number', value: '-18.0' }
        ]
    },
    {
        id: 'open', title: 'Открытие смены', subtitle: 'Чек-лист поваров', type: 'task', icon: '☀️',
        items: [
            { id: '1', text: 'Включить вытяжку и оборудование', completed: false, inputType: 'boolean' },
            { id: '2', text: 'Проверить маркировки заготовок', completed: false, requiresPhoto: true, inputType: 'boolean' },
            { id: '3', text: 'Заполнить станцию инвентарем', completed: false, inputType: 'boolean' },
            { id: '4', text: 'Проверить чистоту пола', completed: false, inputType: 'boolean' },
        ]
    }
];

const Checklists: React.FC = () => {
    const navigate = useNavigate();
    const { addToast } = useToast();
    
    const [lists, setLists] = useState<Checklist[]>([]);
    const [activeTab, setActiveTab] = useState<ChecklistType>('log'); 
    const [expandedListId, setExpandedListId] = useState<string | null>(null);
    const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
    const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const activeUploadRef = useRef<{listId: string, itemId: string} | null>(null);

    useEffect(() => {
        const saved = scopedStorage.getJson<Checklist[] | null>('pro_checklists', null);
        if (saved) setLists(saved);
        else setLists(DEFAULT_CHECKLISTS);
    }, []);

    useEffect(() => { 
        if(lists.length > 0) scopedStorage.setJson('pro_checklists', lists); 
    }, [lists]);

    const isCompletedToday = (list: Checklist) => {
        if (!list.lastCompleted) return false;
        const today = new Date().toDateString();
        const last = new Date(list.lastCompleted).toDateString();
        return today === last;
    };

    const updateItem = (listId: string, itemId: string, updates: any) => {
        setLists(prev => prev.map(l => l.id !== listId ? l : {
            ...l, items: l.items.map(i => i.id !== itemId ? i : { ...i, ...updates })
        }));
    };

    const handleNumberChange = (listId: string, itemId: string, val: string) => {
        updateItem(listId, itemId, { value: val, completed: val.trim() !== '' });
    };
    
    const adjustNumber = (listId: string, itemId: string, currentVal: string, delta: number) => {
        const num = parseFloat(currentVal) || 0;
        const newVal = (num + delta).toFixed(1);
        updateItem(listId, itemId, { value: newVal, completed: true });
    };

    const handleTextChange = (listId: string, itemId: string, val: string) => {
        updateItem(listId, itemId, { value: val, completed: val.trim() !== '' });
    };

    const toggleHealth = (listId: string, itemId: string, currentVal: string) => {
         const newVal = currentVal === 'Здоров' ? 'Отстранен' : 'Здоров';
         updateItem(listId, itemId, { value: newVal, completed: true });
    };

    const toggleTask = (listId: string, itemId: string, currentStatus: boolean, requiresPhoto: boolean, photoUrl?: string) => {
        if (requiresPhoto && !photoUrl && !currentStatus) {
            addToast("Требуется фото подтверждение!", "error");
            activeUploadRef.current = { listId, itemId };
            fileInputRef.current?.click();
            return;
        }
        updateItem(listId, itemId, { completed: !currentStatus });
    };

    const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !activeUploadRef.current) return;
        const { listId, itemId } = activeUploadRef.current;
        
        setIsUploadingPhoto(true);
        try {
            const url = await uploadImage(file, 'checklists');
            updateItem(listId, itemId, { completed: true, photoUrl: url });
            addToast("Фото подтверждено", "success");
            activeUploadRef.current = null;
        } catch (e) {
            addToast("Ошибка при загрузке фото", "error");
        } finally {
            setIsUploadingPhoto(false);
        }
    };

    const markAllTasks = (listId: string) => {
        setLists(prev => prev.map(l => l.id !== listId ? l : {
            ...l, items: l.items.map(i => {
                if (i.requiresPhoto && !i.photoUrl) return i; 
                return { ...i, completed: true };
            })
        }));
        addToast("Все задачи отмечены", "success");
    };

    const saveReport = (list: Checklist) => {
        const incomplete = list.items.filter(i => {
            if (i.inputType === 'boolean' && !i.completed) return true;
            if (i.inputType === 'number' && (!i.value || i.value === '')) return true;
            if (i.requiresPhoto && !i.photoUrl) return true;
            return false;
        });

        if (incomplete.length > 0) {
            addToast(`Заполните все поля (${incomplete.length} ост.)`, "error");
            return;
        }

        if (confirm("Завершить журнал и сохранить отчет?")) {
             setLists(prev => prev.map(l => l.id !== list.id ? l : {
                 ...l, 
                 lastCompleted: Date.now()
             }));
             setExpandedListId(null);
             addToast("Отчет сохранен успешно", "success");
        }
    };
    
    const reopenReport = (listId: string) => {
        if (confirm("Открыть журнал для внесения правок?")) {
            setLists(prev => prev.map(l => l.id !== listId ? l : {
                 ...l, 
                 lastCompleted: undefined
             }));
             setExpandedListId(listId);
        }
    };

    const deleteList = (id: string) => {
        if(confirm("Удалить этот журнал навсегда?")) {
             setLists(prev => prev.filter(l => l.id !== id));
             addToast("Журнал удален", "info");
        }
    };

    const filteredLists = lists.filter(l => (l.type || 'task') === activeTab);

    return (
        <div className="pb-24 animate-fade-in min-h-screen">
             <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handlePhotoUpload} />
             
             {isUploadingPhoto && createPortal(
                <div className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-md flex items-center justify-center animate-fade-in">
                    <div className="bg-white dark:bg-[#1e1e24] p-6 rounded-3xl flex flex-col items-center">
                        <div className="animate-spin text-sky-500 mb-2">
                             <svg className="w-8 h-8" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                        </div>
                        <p className="text-xs font-bold dark:text-white uppercase tracking-wider">Загрузка фото подтверждения...</p>
                    </div>
                </div>, document.body
             )}

             {lightboxUrl && createPortal(
                 <div className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-4 animate-fade-in" onClick={() => setLightboxUrl(null)}>
                     <button className="absolute top-10 right-5 text-white bg-white/20 p-2 rounded-full"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button>
                     <img src={lightboxUrl} className="max-w-full max-h-[80vh] rounded-lg shadow-2xl" />
                 </div>, document.body
             )}

             <div className="pt-safe-top px-5 pb-2 bg-[#f2f4f7] dark:bg-[#0f1115] sticky top-0 z-40 transition-colors duration-300">
                <div className="flex items-center justify-between pt-4 mb-4">
                    <div className="flex items-center gap-3">
                        <button onClick={() => navigate('/')} className="w-10 h-10 rounded-full bg-white dark:bg-[#1e1e24] shadow-sm flex items-center justify-center text-gray-900 dark:text-white border border-gray-100 dark:border-white/5 active:scale-95 transition"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg></button>
                        <div>
                            <h1 className="text-2xl font-black text-gray-900 dark:text-white leading-none">Журналы</h1>
                            <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">HACCP Контроль</p>
                        </div>
                    </div>
                    <button onClick={() => navigate('/checklists/new')} className="w-10 h-10 rounded-full bg-sky-500 text-white flex items-center justify-center shadow-lg shadow-sky-500/30 active:scale-95 transition hover:bg-sky-600"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6"><path fillRule="evenodd" d="M12 3.75a.75.75 0 01.75.75v6.75h6.75a.75.75 0 010 1.5h-6.75v6.75a.75.75 0 01-1.5 0v-6.75H4.5a.75.75 0 010-1.5h6.75V4.5a.75.75 0 01.75-.75z" clipRule="evenodd" /></svg></button>
                </div>

                <div className="flex p-1.5 bg-white dark:bg-[#1e1e24] rounded-2xl shadow-sm border border-gray-100 dark:border-white/5 mb-2">
                    <button onClick={() => setActiveTab('log')} className={`flex-1 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${activeTab === 'log' ? 'bg-gray-900 text-white dark:bg-white dark:text-black shadow-md' : 'text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5'}`}>Журналы (HACCP)</button>
                    <button onClick={() => setActiveTab('task')} className={`flex-1 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${activeTab === 'task' ? 'bg-gray-900 text-white dark:bg-white dark:text-black shadow-md' : 'text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5'}`}>Чек-листы</button>
                </div>
             </div>

             <div className="px-5 space-y-4 pt-2">
                 {filteredLists.length === 0 && (
                     <div className="text-center py-20 opacity-50">
                         <p className="text-sm font-bold dark:text-white">Нет журналов</p>
                         <p className="text-xs text-gray-400">Создайте новый кнопкой +</p>
                     </div>
                 )}
                 
                 {filteredLists.map(list => {
                     const isExpanded = expandedListId === list.id;
                     const completed = isCompletedToday(list);
                     
                     const completedCount = list.items.filter(i => i.completed).length;
                     const totalCount = list.items.length;
                     const progress = Math.round((completedCount / totalCount) * 100) || 0;

                     if (completed) {
                         return (
                            <div key={list.id} className="bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 rounded-[2rem] p-6 flex flex-col items-center text-center shadow-sm animate-fade-in relative overflow-hidden">
                                <div className="absolute top-0 left-0 w-full h-1.5 bg-emerald-500"></div>
                                <div className="w-14 h-14 bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center text-2xl mb-3 shadow-sm">
                                    ✅
                                </div>
                                <h3 className="font-bold text-lg text-gray-900 dark:text-white">{list.title}</h3>
                                <p className="text-xs text-emerald-600 dark:text-emerald-400 font-bold uppercase tracking-wide mb-4">Отчет сохранен сегодня</p>
                                <button onClick={() => reopenReport(list.id)} className="text-[10px] font-bold text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 uppercase tracking-widest border-b border-dashed border-gray-300">
                                    Внести исправления
                                </button>
                            </div>
                         );
                     }

                     return (
                         <div key={list.id} className={`bg-white dark:bg-[#1e1e24] rounded-[2rem] overflow-hidden shadow-sm transition-all duration-300 ${isExpanded ? 'ring-2 ring-sky-500/20 shadow-xl scale-[1.01]' : 'border border-gray-100 dark:border-white/5'}`}>
                             
                             <div className="p-5 flex items-center justify-between cursor-pointer active:bg-gray-50 dark:active:bg-white/5" onClick={() => setExpandedListId(isExpanded ? null : list.id)}>
                                 <div className="flex items-center gap-4">
                                     <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl bg-gray-50 dark:bg-white/5">
                                         {list.icon}
                                     </div>
                                     <div>
                                         <h3 className="font-bold text-lg leading-none mb-1.5 text-gray-900 dark:text-white">{list.title}</h3>
                                         <p className="text-xs text-gray-400 font-medium">{list.items.length} пунктов • {list.type === 'log' ? 'Данные' : 'Задачи'}</p>
                                     </div>
                                 </div>
                                 {progress > 0 ? (
                                    <span className="text-xs font-bold text-sky-500">{progress}%</span>
                                 ) : (
                                    <svg className={`w-5 h-5 text-gray-300 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
                                 )}
                             </div>

                             {isExpanded && (
                                 <div className="border-t border-gray-100 dark:border-white/5 bg-gray-50/50 dark:bg-black/20 p-4 space-y-4 animate-fade-in">
                                     
                                     {list.type === 'task' && (
                                         <div className="flex justify-end">
                                             <button onClick={() => markAllTasks(list.id)} className="text-xs font-bold text-sky-600 bg-sky-100 dark:bg-sky-500/10 px-3 py-1.5 rounded-lg hover:bg-sky-200 transition">
                                                 Отметить все
                                             </button>
                                         </div>
                                     )}

                                     {list.items.map(item => (
                                         <div key={item.id} className={`bg-white dark:bg-[#1e1e24] p-3.5 rounded-2xl shadow-sm border transition-all ${item.completed ? 'border-green-200 dark:border-green-500/20' : 'border-transparent'}`}>
                                             
                                             <div className="flex justify-between items-start mb-3">
                                                 <span className={`text-sm font-bold leading-tight ${item.completed ? 'text-gray-500 line-through decoration-2 decoration-green-500/30' : 'text-gray-900 dark:text-white'}`}>
                                                     {item.text}
                                                 </span>
                                                 {item.requiresPhoto && (
                                                     <div className="flex-shrink-0 ml-2">
                                                         {item.photoUrl ? (
                                                             <div onClick={() => setLightboxUrl(item.photoUrl!)} className="w-10 h-10 rounded-lg overflow-hidden border-2 border-green-500 cursor-pointer shadow-sm">
                                                                 <img src={item.photoUrl} className="w-full h-full object-cover" />
                                                             </div>
                                                         ) : (
                                                             <button onClick={() => { activeUploadRef.current = { listId: list.id, itemId: item.id }; fileInputRef.current?.click(); }} className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-white/5 text-gray-400 border-2 border-dashed border-gray-300 dark:border-white/10 flex items-center justify-center hover:text-sky-500 hover:border-sky-500 transition">
                                                                 <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" /><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" /></svg>
                                                             </button>
                                                         )}
                                                     </div>
                                                 )}
                                             </div>
                                             
                                             {item.inputType === 'health' && (
                                                 <div className="flex gap-2">
                                                     <button 
                                                        onClick={() => item.value !== 'Здоров' && toggleHealth(list.id, item.id, item.value || '')}
                                                        className={`flex-1 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wide border-2 transition-all ${item.value === 'Здоров' ? 'bg-green-500 text-white border-green-500 shadow-md' : 'bg-transparent border-gray-100 dark:border-white/10 text-gray-400'}`}
                                                     >
                                                         Здоров
                                                     </button>
                                                     <button 
                                                        onClick={() => item.value !== 'Отстранен' && toggleHealth(list.id, item.id, item.value || '')}
                                                        className={`flex-1 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wide border-2 transition-all ${item.value === 'Отстранен' ? 'bg-red-500 text-white border-red-500 shadow-md' : 'bg-transparent border-gray-100 dark:border-white/10 text-gray-400'}`}
                                                     >
                                                         Отстранен
                                                     </button>
                                                 </div>
                                             )}

                                             {item.inputType === 'number' && (
                                                 <div className="flex items-center gap-2">
                                                     <button onClick={() => adjustNumber(list.id, item.id, item.value || '0', -0.5)} className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-white/5 text-gray-500 font-bold hover:bg-gray-200 active:scale-95 transition flex items-center justify-center text-lg">-</button>
                                                     <input 
                                                        type="number" 
                                                        placeholder="0.0" 
                                                        className="flex-1 bg-gray-50 dark:bg-black/20 p-2.5 rounded-xl text-center text-lg font-black tracking-wider outline-none focus:ring-2 focus:ring-sky-500/30 dark:text-white" 
                                                        value={item.value || ''} 
                                                        onChange={e => handleNumberChange(list.id, item.id, e.target.value)} 
                                                     />
                                                     <button onClick={() => adjustNumber(list.id, item.id, item.value || '0', 0.5)} className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-white/5 text-gray-500 font-bold hover:bg-gray-200 active:scale-95 transition flex items-center justify-center text-lg">+</button>
                                                 </div>
                                             )}

                                             {item.inputType === 'text' && (
                                                  <input 
                                                    type="text" 
                                                    placeholder="Комментарий..." 
                                                    className="w-full bg-gray-50 dark:bg-black/20 p-3 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-sky-500/30 dark:text-white border border-transparent focus:bg-white dark:focus:bg-[#2a2a35] transition-all" 
                                                    value={item.value || ''} 
                                                    onChange={e => handleTextChange(list.id, item.id, e.target.value)} 
                                                  />
                                             )}

                                             {item.inputType === 'boolean' && (
                                                 <button 
                                                    onClick={() => toggleTask(list.id, item.id, item.completed, !!item.requiresPhoto, item.photoUrl)} 
                                                    className={`w-full py-3 rounded-xl font-bold text-xs uppercase tracking-widest transition-all shadow-sm active:scale-[0.98] ${item.completed ? 'bg-green-500 text-white shadow-green-500/30' : 'bg-gray-100 text-gray-400 dark:bg-white/5 hover:bg-gray-200'}`}
                                                 >
                                                     {item.completed ? '✓ Выполнено' : 'Отметить'}
                                                 </button>
                                             )}
                                         </div>
                                     ))}

                                     <div className="flex gap-2 pt-2 border-t border-gray-100 dark:border-white/5">
                                         <button onClick={() => deleteList(list.id)} className="px-4 py-3 bg-red-50 dark:bg-red-500/10 text-red-500 rounded-xl hover:bg-red-100 transition">
                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                                         </button>
                                         <button onClick={() => saveReport(list)} className="flex-1 py-3 bg-gray-900 dark:bg-white text-white dark:text-black text-sm font-bold rounded-xl transition hover:shadow-lg active:scale-95 flex items-center justify-center gap-2">
                                            ✅ Завершить и Сохранить
                                         </button>
                                     </div>
                                 </div>
                             )}
                         </div>
                     );
                 })}
             </div>
        </div>
    );
};

export default Checklists;
