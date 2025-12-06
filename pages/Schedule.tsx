import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { ChefScheduleItem, ShiftType } from '../types';
import { useTelegram } from '../context/TelegramContext';
import { useToast } from '../context/ToastContext';

const Schedule: React.FC = () => {
    const navigate = useNavigate();
    const { isAdmin } = useTelegram();
    const { addToast } = useToast();
    
    const [staff, setStaff] = useState<ChefScheduleItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [editMode, setEditMode] = useState(false);
    
    // Dates Logic (Current Month)
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    
    const days = Array.from({ length: daysInMonth }, (_, i) => {
        const date = new Date(currentYear, currentMonth, i + 1);
        return {
            dateStr: date.toISOString().split('T')[0], // YYYY-MM-DD
            dayNum: i + 1,
            weekday: date.toLocaleDateString('ru-RU', { weekday: 'short' }),
            isWeekend: date.getDay() === 0 || date.getDay() === 6
        };
    });

    // Fetch Schedule
    useEffect(() => {
        fetch('/api/schedule')
            .then(res => res.json())
            .then(data => {
                setStaff(data);
                setIsLoading(false);
            })
            .catch(() => {
                addToast("Ошибка загрузки", "error");
                setIsLoading(false);
            });
    }, []);

    const handleSave = async () => {
        try {
            await fetch('/api/schedule', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(staff)
            });
            setEditMode(false);
            addToast("График сохранен", "success");
        } catch (e) {
            addToast("Ошибка сохранения", "error");
        }
    };

    const addChef = () => {
        setStaff([...staff, { id: uuidv4(), name: 'Новый повар', station: 'Холодный цех', shifts: {} }]);
    };

    const removeChef = (id: string) => {
        if(confirm("Удалить сотрудника?")) {
            setStaff(staff.filter(s => s.id !== id));
        }
    };

    const updateChef = (id: string, field: keyof ChefScheduleItem, val: string) => {
        setStaff(staff.map(s => s.id === id ? { ...s, [field]: val } : s));
    };

    const toggleShift = (chefId: string, dateStr: string) => {
        if (!editMode) return;
        
        setStaff(prev => prev.map(chef => {
            if (chef.id !== chefId) return chef;
            
            const current = chef.shifts[dateStr] || 'empty';
            let next: ShiftType = 'work';
            
            if (current === 'empty') next = 'work';
            else if (current === 'work') next = 'off';
            else if (current === 'off') next = 'sick';
            else if (current === 'sick') next = 'empty';
            
            const newShifts = { ...chef.shifts };
            if (next === 'empty') delete newShifts[dateStr];
            else newShifts[dateStr] = next;
            
            return { ...chef, shifts: newShifts };
        }));
    };

    const getCellColor = (type?: ShiftType) => {
        switch(type) {
            case 'work': return 'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-300 border-green-200 dark:border-green-500/30';
            case 'off': return 'bg-red-50 dark:bg-red-500/20 text-red-500 border-red-100 dark:border-red-500/30';
            case 'sick': return 'bg-orange-100 dark:bg-orange-500/20 text-orange-600 border-orange-200 dark:border-orange-500/30';
            default: return 'bg-white dark:bg-[#1e1e24]';
        }
    };

    const getCellText = (type?: ShiftType) => {
        switch(type) {
            case 'work': return 'Р';
            case 'off': return 'В';
            case 'sick': return 'Б';
            default: return '';
        }
    };

    return (
        <div className="pb-safe-bottom animate-fade-in min-h-screen bg-[#f2f4f7] dark:bg-[#0f1115] flex flex-col">
             {/* Header */}
             <div className="pt-safe-top px-4 pb-2 bg-[#f2f4f7]/90 dark:bg-[#0f1115]/90 backdrop-blur-md sticky top-0 z-40">
                <div className="flex items-center justify-between pt-4 mb-2">
                    <div className="flex items-center gap-3">
                        <button onClick={() => navigate('/')} className="w-10 h-10 rounded-full bg-white dark:bg-[#1e1e24] shadow-sm flex items-center justify-center text-gray-900 dark:text-white border border-gray-100 dark:border-white/5 active:scale-95 transition">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
                        </button>
                        <div>
                            <h1 className="text-xl font-black text-gray-900 dark:text-white leading-none">График</h1>
                            <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">
                                {today.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}
                            </p>
                        </div>
                    </div>
                    {isAdmin && (
                        <button 
                           onClick={() => editMode ? handleSave() : setEditMode(true)}
                           className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition shadow-sm ${editMode ? 'bg-green-500 text-white' : 'bg-white dark:bg-[#1e1e24] text-gray-900 dark:text-white'}`}
                        >
                            {editMode ? 'Сохранить' : 'Редактировать'}
                        </button>
                    )}
                </div>
             </div>

             {/* Content */}
             <div className="flex-1 overflow-hidden flex flex-col relative">
                {isLoading ? (
                    <div className="flex items-center justify-center h-40"><div className="animate-spin text-sky-500">⏳</div></div>
                ) : (
                    <div className="flex-1 overflow-auto pb-20 no-scrollbar">
                        <div className="inline-block min-w-full align-middle">
                            <table className="min-w-full border-separate border-spacing-0">
                                <thead className="bg-[#f2f4f7] dark:bg-[#0f1115] sticky top-0 z-30">
                                    <tr>
                                        <th scope="col" className="sticky left-0 z-20 bg-[#f2f4f7] dark:bg-[#0f1115] py-3.5 pl-4 pr-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-200 dark:border-white/10 min-w-[120px]">
                                            Сотрудник
                                        </th>
                                        <th scope="col" className="sticky left-[120px] z-20 bg-[#f2f4f7] dark:bg-[#0f1115] py-3.5 px-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-200 dark:border-white/10 min-w-[100px] border-r border-gray-200 dark:border-white/10 shadow-[4px_0_10px_-5px_rgba(0,0,0,0.1)]">
                                            Станция
                                        </th>
                                        {days.map(d => (
                                            <th key={d.dayNum} scope="col" className={`px-2 py-3 text-center text-xs font-bold border-b border-gray-200 dark:border-white/10 min-w-[40px] ${d.isWeekend ? 'text-red-400 bg-red-50/50 dark:bg-red-500/5' : 'text-gray-500 dark:text-gray-400'}`}>
                                                <div className="flex flex-col items-center">
                                                    <span className="opacity-50 text-[9px] uppercase">{d.weekday}</span>
                                                    <span className="text-sm">{d.dayNum}</span>
                                                </div>
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="bg-white dark:bg-[#1e1e24]">
                                    {staff.map((person, personIdx) => (
                                        <tr key={person.id} className="group">
                                            {/* Sticky Name */}
                                            <td className="sticky left-0 z-10 bg-white dark:bg-[#1e1e24] py-3 pl-4 pr-3 text-sm font-bold text-gray-900 dark:text-white border-b border-gray-100 dark:border-white/5 whitespace-nowrap">
                                                {editMode ? (
                                                    <div className="flex items-center gap-2">
                                                        <button onClick={() => removeChef(person.id)} className="text-red-500 bg-red-50 p-1 rounded">✕</button>
                                                        <input value={person.name} onChange={e => updateChef(person.id, 'name', e.target.value)} className="w-24 bg-gray-50 dark:bg-black/20 px-2 py-1 rounded text-xs" />
                                                    </div>
                                                ) : person.name}
                                            </td>
                                            
                                            {/* Sticky Station */}
                                            <td className="sticky left-[120px] z-10 bg-white dark:bg-[#1e1e24] py-3 px-3 text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-white/5 whitespace-nowrap border-r border-gray-100 dark:border-white/5 shadow-[4px_0_10px_-5px_rgba(0,0,0,0.05)]">
                                                 {editMode ? (
                                                    <input value={person.station} onChange={e => updateChef(person.id, 'station', e.target.value)} className="w-20 bg-gray-50 dark:bg-black/20 px-2 py-1 rounded text-xs" />
                                                ) : person.station}
                                            </td>

                                            {/* Days Grid */}
                                            {days.map(d => {
                                                const status = person.shifts[d.dateStr] || 'empty';
                                                return (
                                                    <td 
                                                        key={d.dateStr} 
                                                        onClick={() => toggleShift(person.id, d.dateStr)}
                                                        className={`border-b border-gray-100 dark:border-white/5 text-center p-1 relative transition-colors ${editMode ? 'cursor-pointer hover:bg-gray-50' : ''}`}
                                                    >
                                                        {status !== 'empty' && (
                                                            <div className={`w-8 h-8 mx-auto rounded-lg flex items-center justify-center text-xs font-bold border ${getCellColor(status)}`}>
                                                                {getCellText(status)}
                                                            </div>
                                                        )}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                    
                                    {/* Add Chef Row */}
                                    {editMode && (
                                        <tr>
                                            <td colSpan={days.length + 2} className="p-4 text-center sticky left-0">
                                                <button onClick={addChef} className="bg-sky-50 text-sky-600 px-6 py-2 rounded-xl text-xs font-bold border border-dashed border-sky-300 hover:bg-sky-100 transition">
                                                    + Добавить сотрудника
                                                </button>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
             </div>
        </div>
    );
};

export default Schedule;
