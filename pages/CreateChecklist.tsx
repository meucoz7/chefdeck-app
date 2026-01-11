
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { Checklist, ChecklistItem, ChecklistType, ItemInputType } from '../types';
import { useToast } from '../context/ToastContext';
import { scopedStorage } from '../services/storage';

const TEMPLATES = [
    { id: 'empty', name: 'Свой список', icon: '📝', type: 'task' },
    { id: 'hygiene', name: 'Гигиена (Здоровье)', icon: '🏥', type: 'log', input: 'health' },
    { id: 'fridge', name: 'Температура (Холод)', icon: '❄️', type: 'log', input: 'number' },
    { id: 'cleaning', name: 'Клининг (Чек-лист)', icon: '🧹', type: 'task', input: 'boolean' }
];

const ICONS = ['📋', '🧹', '🌡️', '❄️', '🍗', '🥬', '🧼', '🏥', '🍳', '🔪', '🚚', '📦', '🗑️', '🧴', '👕'];

const CreateChecklist: React.FC = () => {
    const navigate = useNavigate();
    const { addToast } = useToast();

    const [title, setTitle] = useState('');
    const [type, setType] = useState<ChecklistType>('task');
    const [icon, setIcon] = useState('📋');
    const [items, setItems] = useState<Partial<ChecklistItem>[]>([]);
    
    // New Item State
    const [newItemText, setNewItemText] = useState('');
    const [defaultInputType, setDefaultInputType] = useState<ItemInputType>('boolean');
    const [newItemRequiresPhoto, setNewItemRequiresPhoto] = useState(false);

    const applyTemplate = (tmpl: any) => {
        setIcon(tmpl.icon);
        setType(tmpl.type);
        if (tmpl.input) setDefaultInputType(tmpl.input);
        if (tmpl.id === 'hygiene') { setTitle('Журнал Здоровья'); setItems([{id: uuidv4(), text: 'Шеф-повар', inputType: 'health'}, {id: uuidv4(), text: 'Су-шеф', inputType: 'health'}]); }
        if (tmpl.id === 'fridge') { setTitle('Температурный лист'); setItems([{id: uuidv4(), text: 'Холодильник (Овощи)', inputType: 'number'}, {id: uuidv4(), text: 'Морозилка (Мясо)', inputType: 'number'}]); }
        if (tmpl.id === 'cleaning') { setTitle('График уборки'); setItems([{id: uuidv4(), text: 'Помыть полы', inputType: 'boolean'}, {id: uuidv4(), text: 'Протереть столы', inputType: 'boolean'}]); }
        addToast(`Шаблон "${tmpl.name}" применен`, 'info');
    };

    const addItem = () => {
        if (!newItemText.trim()) return;
        setItems([...items, { 
            id: uuidv4(), 
            text: newItemText, 
            completed: false, 
            inputType: defaultInputType, 
            value: '',
            requiresPhoto: newItemRequiresPhoto
        }]);
        setNewItemText('');
        setNewItemRequiresPhoto(false);
    };

    const removeItem = (idx: number) => {
        setItems(items.filter((_, i) => i !== idx));
    };

    const handleSave = () => {
        if (!title.trim()) { addToast("Введите название", "error"); return; }
        if (items.length === 0) { addToast("Добавьте пункты", "error"); return; }

        const newChecklist: Checklist = {
            id: uuidv4(),
            title,
            type,
            icon,
            items: items as ChecklistItem[]
        };

        const lists = scopedStorage.getJson<Checklist[]>('pro_checklists', []);
        scopedStorage.setJson('pro_checklists', [...lists, newChecklist]);
        
        addToast("Журнал создан", "success");
        navigate('/checklists');
    };

    return (
        <div className="pb-24 animate-fade-in min-h-screen bg-[#f2f4f7] dark:bg-[#0f1115]">
            {/* Header */}
            <div className="pt-safe-top px-5 pb-4 sticky top-0 z-40 bg-[#f2f4f7] dark:bg-[#0f1115]">
                <div className="flex items-center gap-3 pt-4 mb-2">
                    <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full bg-white dark:bg-[#1e1e24] shadow-sm flex items-center justify-center text-gray-900 dark:text-white active:scale-90 transition"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg></button>
                    <div>
                        <h1 className="text-2xl font-black text-gray-900 dark:text-white leading-none">Конструктор</h1>
                        <p className="text-xs text-gray-400 font-bold tracking-wider uppercase">Новый журнал</p>
                    </div>
                </div>
            </div>

            <div className="px-5 space-y-6">
                
                {/* 1. Templates */}
                <div>
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 ml-1">Быстрые шаблоны</h3>
                    <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">
                        {TEMPLATES.map(t => (
                            <button key={t.id} onClick={() => applyTemplate(t)} className="flex-shrink-0 flex flex-col items-center justify-center w-24 h-24 bg-white dark:bg-[#1e1e24] rounded-2xl border border-gray-100 dark:border-white/5 shadow-sm active:scale-95 transition hover:border-sky-500/30">
                                <span className="text-2xl mb-2">{t.icon}</span>
                                <span className="text-[10px] font-bold text-gray-600 dark:text-gray-300 text-center leading-tight">{t.name}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* 2. Main Settings */}
                <div className="bg-white dark:bg-[#1e1e24] p-5 rounded-[2rem] shadow-sm border border-gray-100 dark:border-white/5 space-y-5">
                    
                    {/* Icon & Title */}
                    <div className="flex gap-4">
                        <div className="space-y-2">
                             <label className="text-[9px] font-bold text-gray-400 uppercase">Иконка</label>
                             <div className="w-16 h-16 bg-gray-50 dark:bg-black/20 rounded-2xl flex items-center justify-center text-3xl shadow-inner relative group cursor-pointer overflow-hidden">
                                 {icon}
                                 <select className="absolute inset-0 opacity-0 cursor-pointer" value={icon} onChange={e => setIcon(e.target.value)}>
                                     {ICONS.map(i => <option key={i} value={i}>{i}</option>)}
                                 </select>
                             </div>
                        </div>
                        <div className="flex-1 space-y-2">
                             <label className="text-[9px] font-bold text-gray-400 uppercase">Название журнала</label>
                             <input type="text" className="w-full bg-gray-50 dark:bg-black/20 rounded-xl px-4 py-3 text-lg font-bold dark:text-white outline-none focus:ring-2 focus:ring-sky-500/20 transition-all" placeholder="Например: Уборка зала" value={title} onChange={e => setTitle(e.target.value)} />
                        </div>
                    </div>

                    {/* Logic Type */}
                    <div className="p-1 bg-gray-100 dark:bg-black/20 rounded-xl flex">
                         <button onClick={() => setType('task')} className={`flex-1 py-2 rounded-lg text-[10px] font-bold uppercase transition ${type === 'task' ? 'bg-white dark:bg-[#2a2a35] shadow-sm text-gray-900 dark:text-white' : 'text-gray-400'}`}>Чек-лист (Задачи)</button>
                         <button onClick={() => setType('log')} className={`flex-1 py-2 rounded-lg text-[10px] font-bold uppercase transition ${type === 'log' ? 'bg-white dark:bg-[#2a2a35] shadow-sm text-gray-900 dark:text-white' : 'text-gray-400'}`}>Журнал (Данные)</button>
                    </div>
                </div>

                {/* 3. Items Editor */}
                <div className="bg-white dark:bg-[#1e1e24] p-5 rounded-[2rem] shadow-sm border border-gray-100 dark:border-white/5">
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4 flex justify-between items-center">
                        <span>Пункты ({items.length})</span>
                        <span className="text-[9px] bg-sky-50 dark:bg-sky-500/10 text-sky-600 px-2 py-1 rounded-lg">Предпросмотр</span>
                    </h3>
                    
                    {/* List */}
                    <div className="space-y-2 mb-6">
                        {items.length === 0 ? (
                            <div className="text-center py-4 text-gray-400 text-xs italic">Список пока пуст</div>
                        ) : (
                            items.map((item, idx) => (
                                <div key={idx} className="flex justify-between items-center p-3 bg-gray-50 dark:bg-black/20 rounded-xl group">
                                    <div className="flex items-center gap-3">
                                        <div className="w-6 h-6 rounded bg-white dark:bg-white/5 flex items-center justify-center text-xs font-bold text-gray-400 border border-gray-200 dark:border-white/10">{idx + 1}</div>
                                        <div>
                                            <p className="text-sm font-bold dark:text-white leading-none">{item.text}</p>
                                            <div className="flex gap-2 mt-1">
                                                <span className="text-[9px] bg-white dark:bg-white/10 px-1.5 py-0.5 rounded text-gray-500 font-mono uppercase border border-gray-100 dark:border-white/5">{item.inputType === 'boolean' ? 'Галочка' : item.inputType === 'number' ? 'Число' : item.inputType === 'health' ? 'Здоровье' : 'Текст'}</span>
                                                {item.requiresPhoto && <span className="text-[9px] bg-white dark:bg-white/10 px-1.5 py-0.5 rounded text-sky-500 font-bold border border-gray-100 dark:border-white/5">📷 Фото</span>}
                                            </div>
                                        </div>
                                    </div>
                                    <button onClick={() => removeItem(idx)} className="w-8 h-8 flex items-center justify-center text-gray-300 hover:text-red-500 transition">
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                                    </button>
                                </div>
                            ))
                        )}
                    </div>

                    {/* Add New Item */}
                    <div className="bg-gray-50 dark:bg-black/20 rounded-2xl p-4 border border-dashed border-gray-200 dark:border-white/10">
                        <label className="text-[9px] font-bold text-gray-400 uppercase mb-2 block">Добавить новый пункт</label>
                        <div className="flex gap-2 mb-3">
                            <input type="text" className="flex-1 bg-white dark:bg-[#1e1e24] rounded-xl px-4 py-3 text-sm dark:text-white outline-none focus:ring-2 focus:ring-sky-500/20" placeholder="Текст пункта..." value={newItemText} onChange={e => setNewItemText(e.target.value)} onKeyDown={e => e.key === 'Enter' && addItem()} />
                            <button onClick={addItem} className="bg-sky-500 text-white w-12 rounded-xl flex items-center justify-center font-bold text-xl shadow-lg shadow-sky-500/30 active:scale-95 transition">+</button>
                        </div>
                        
                        <div className="flex flex-wrap gap-2 items-center justify-between">
                            <div className="flex gap-1">
                                <button onClick={() => setDefaultInputType('boolean')} className={`px-2 py-1.5 rounded-lg text-[9px] font-bold uppercase border transition ${defaultInputType === 'boolean' ? 'bg-white dark:bg-white/10 border-sky-500 text-sky-600' : 'border-transparent text-gray-400'}`}>Галочка</button>
                                <button onClick={() => setDefaultInputType('number')} className={`px-2 py-1.5 rounded-lg text-[9px] font-bold uppercase border transition ${defaultInputType === 'number' ? 'bg-white dark:bg-white/10 border-sky-500 text-sky-600' : 'border-transparent text-gray-400'}`}>Число</button>
                                <button onClick={() => setDefaultInputType('text')} className={`px-2 py-1.5 rounded-lg text-[9px] font-bold uppercase border transition ${defaultInputType === 'text' ? 'bg-white dark:bg-white/10 border-sky-500 text-sky-600' : 'border-transparent text-gray-400'}`}>Текст</button>
                                <button onClick={() => setDefaultInputType('health')} className={`px-2 py-1.5 rounded-lg text-[9px] font-bold uppercase border transition ${defaultInputType === 'health' ? 'bg-white dark:bg-white/10 border-sky-500 text-sky-600' : 'border-transparent text-gray-400'}`}>Здоровье</button>
                            </div>
                            
                            <label className="flex items-center gap-2 cursor-pointer">
                                <div className={`w-4 h-4 rounded border flex items-center justify-center transition ${newItemRequiresPhoto ? 'bg-sky-500 border-sky-500' : 'border-gray-300 dark:border-gray-600'}`}>
                                    {newItemRequiresPhoto && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                                </div>
                                <input type="checkbox" className="hidden" checked={newItemRequiresPhoto} onChange={e => setNewItemRequiresPhoto(e.target.checked)} />
                                <span className="text-[10px] font-bold text-gray-500 uppercase">Фото</span>
                            </label>
                        </div>
                    </div>
                </div>

                <button onClick={handleSave} className="w-full bg-gray-900 dark:bg-white text-white dark:text-black font-bold py-4 rounded-2xl shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all text-lg">Создать журнал</button>
            </div>
        </div>
    );
};

export default CreateChecklist;
