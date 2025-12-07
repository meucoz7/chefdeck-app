
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
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
    const [isFullscreen, setIsFullscreen] = useState(false);
    
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
                setStaff(data || []);
                setIsLoading(false);
            })
            .catch(() => {
                setStaff([]);
                setIsLoading(false);
            });
    }, []);

    const handleSave = async () => {
        if (staff.some(s => !s.name.trim())) {
            addToast("Имя сотрудника не может быть пустым", "error");
            return;
        }
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
        setStaff([...staff, { id: uuidv4(), name: 'Сотрудник', station: 'Должность', shifts: {} }]);
    };

    const removeChef = (id: string) => {
        if(confirm("Удалить сотрудника из графика?")) {
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
            
            // Cycle: Empty -> Work -> Sick -> Vacation -> Empty
            let next: ShiftType = 'work';
            
            if (current === 'empty') next = 'work';
            else if (current === 'work') next = 'sick';
            else if (current === 'sick') next = 'vacation';
            else if (current === 'vacation') next = 'empty';
            else next = 'empty'; // fallback
            
            const newShifts = { ...chef.shifts };
            if (next === 'empty') delete newShifts[dateStr];
            else newShifts[dateStr] = next;
            return { ...chef, shifts: newShifts };
        }));
    };

    const getShiftCount = (shifts: Record<string, ShiftType>, type: ShiftType) => {
        if (!shifts) return 0;
        return Object.values(shifts).filter(s => s === type).length;
    };

    // Component for the Table Content to reuse or render in portal
    const ScheduleContent = (
        <div className={`flex flex-col h-full ${isFullscreen ? 'bg-[#f2f4f7] dark:bg-[#0f1115]' : ''}`}>
             {/* Header */}
             <div className={`pt-safe-top px-4 pb-2 bg-[#f2f4f7]/95 dark:bg-[#0f1115]/95 backdrop-blur-md z-50 shadow-sm border-b border-gray-100 dark:border-white/5 flex-shrink-0 ${isFullscreen ? 'px-6' : ''}`}>
                <div className="flex items-center justify-between pt-4 mb-2">
                    <div className="flex items-center gap-3">
                        {!isFullscreen && (
                            <button onClick={() => navigate('/')} className="w-10 h-10 rounded-full bg-white dark:bg-[#1e1e24] shadow-sm flex items-center justify-center text-gray-900 dark:text-white border border-gray-100 dark:border-white/5 active:scale-95 transition">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
                            </button>
                        )}
                        <div>
                            <h1 className="text-xl font-black text-gray-900 dark:text-white leading-none">График</h1>
                            <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">
                                {today.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}
                            </p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        {/* Fullscreen Toggle */}
                        <button 
                            onClick={() => setIsFullscreen(!isFullscreen)}
                            className="w-10 h-10 rounded-full bg-white dark:bg-[#1e1e24] shadow-sm flex items-center justify-center text-gray-900 dark:text-white border border-gray-100 dark:border-white/10 active:scale-95 transition"
                        >
                            {isFullscreen ? (
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5M15 15l5.25 5.25" /></svg>
                            ) : (
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" /></svg>
                            )}
                        </button>

                        {isAdmin && (
                            <button 
                            onClick={() => editMode ? handleSave() : setEditMode(true)}
                            className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition shadow-sm ${editMode ? 'bg-green-500 text-white shadow-green-500/30' : 'bg-white dark:bg-[#1e1e24] text-gray-900 dark:text-white border border-gray-100 dark:border-white/10'}`}
                            >
                                {editMode ? 'Сохранить' : 'Редактировать'}
                            </button>
                        )}
                    </div>
                </div>
                
                {/* Legend */}
                <div className="flex gap-4 pb-2 px-1">
                    <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded-md bg-green-500"></div>
                        <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase">Смена</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded-md bg-orange-500"></div>
                        <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase">Больничный</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded-md bg-blue-500 flex items-center justify-center text-[8px] text-white font-bold leading-none">О</div>
                        <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase">Отпуск</span>
                    </div>
                     <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded-md border border-gray-300 dark:border-white/20"></div>
                        <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase">Выходной</span>
                    </div>
                </div>
             </div>

             {/* Content */}
             <div className="flex-1 overflow-hidden relative flex flex-col">
                {isLoading ? (
                    <div className="flex items-center justify-center h-40"><div className="animate-spin text-sky-500">⏳</div></div>
                ) : (
                    <>
                        {staff.length === 0 && !editMode ? (
                             <div className="flex flex-col items-center justify-center mt-20 opacity-60">
                                <div className="text-4xl mb-2">📅</div>
                                <p className="font-bold dark:text-white">График пуст</p>
                                {isAdmin && <p className="text-xs text-gray-500">Нажмите "Редактировать", чтобы создать</p>}
                             </div>
                        ) : (
                            <div className="flex-1 overflow-auto">
                                <table className="border-separate border-spacing-0 min-w-full">
                                    <thead className="bg-[#f2f4f7] dark:bg-[#0f1115] sticky top-0 z-30">
                                        <tr>
                                            <th scope="col" className="sticky left-0 z-40 bg-[#f2f4f7] dark:bg-[#0f1115] py-3 pl-4 pr-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-200 dark:border-white/10 min-w-[160px] max-w-[180px] shadow-[4px_0_10px_-5px_rgba(0,0,0,0.05)] border-r border-gray-200 dark:border-white/10 h-14">
                                                Сотрудник
                                            </th>
                                            {days.map(d => (
                                                <th key={d.dayNum} scope="col" className={`px-1 py-2 text-center text-xs font-bold border-b border-gray-200 dark:border-white/10 min-w-[45px] h-14 ${d.isWeekend ? 'bg-red-50/50 dark:bg-red-500/10' : 'bg-[#f2f4f7] dark:bg-[#0f1115]'}`}>
                                                    <div className="flex flex-col items-center justify-center h-full">
                                                        <span className={`text-[9px] uppercase mb-0.5 leading-none ${d.isWeekend ? 'text-red-400' : 'text-gray-400'}`}>{d.weekday}</span>
                                                        <span className={`text-sm leading-none ${d.isWeekend ? 'text-red-500' : 'text-gray-900 dark:text-white'}`}>{d.dayNum}</span>
                                                    </div>
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white dark:bg-[#1e1e24]">
                                        {staff.map((person) => (
                                            <tr key={person.id} className="group hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                                                {/* Sticky Employee Column */}
                                                <td className="sticky left-0 z-20 bg-white dark:bg-[#1e1e24] py-3 pl-4 pr-4 border-b border-gray-100 dark:border-white/5 shadow-[4px_0_10px_-5px_rgba(0,0,0,0.05)] border-r border-gray-100 dark:border-white/5 group-hover:bg-gray-50 dark:group-hover:bg-[#25252b] transition-colors align-middle h-16">
                                                    {editMode ? (
                                                        <div className="flex flex-col gap-1.5 w-full">
                                                            <div className="flex items-center gap-2">
                                                                <button onClick={() => removeChef(person.id)} className="w-5 h-5 rounded bg-red-100 text-red-500 flex items-center justify-center hover:bg-red-200 shadow-sm flex-shrink-0 text-xs font-bold">✕</button>
                                                                <input 
                                                                    value={person.name} 
                                                                    onChange={e => updateChef(person.id, 'name', e.target.value)} 
                                                                    className="w-full bg-gray-100 dark:bg-[#2a2a35] border border-transparent focus:border-sky-500 px-2 py-1 rounded text-sm font-bold shadow-inner outline-none text-gray-900 dark:text-white" 
                                                                    placeholder="Имя"
                                                                />
                                                            </div>
                                                            <input 
                                                                value={person.station} 
                                                                onChange={e => updateChef(person.id, 'station', e.target.value)} 
                                                                className="w-full bg-gray-50 dark:bg-[#2a2a35] border border-transparent focus:border-sky-500 px-2 py-1 rounded text-xs shadow-inner outline-none ml-7" 
                                                                placeholder="Должность"
                                                            />
                                                        </div>
                                                    ) : (
                                                        <div className="flex flex-col justify-center h-full">
                                                            <div className="font-bold text-sm text-gray-900 dark:text-white leading-tight mb-0.5">{person.name}</div>
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wide truncate max-w-[80px]">{person.station}</span>
                                                                <span className="text-[10px] bg-green-50 dark:bg-green-500/10 text-green-600 px-1.5 rounded font-bold whitespace-nowrap">
                                                                    {getShiftCount(person.shifts, 'work')} см
                                                                </span>
                                                            </div>
                                                        </div>
                                                    )}
                                                </td>
                                                
                                                {/* Calendar Days */}
                                                {days.map(d => {
                                                    const status = person.shifts[d.dateStr] || 'empty';
                                                    return (
                                                        <td 
                                                            key={d.dateStr} 
                                                            onClick={() => toggleShift(person.id, d.dateStr)}
                                                            className={`border-b border-gray-100 dark:border-white/5 text-center p-1 relative h-16 align-middle ${editMode ? 'cursor-pointer hover:bg-black/5 dark:hover:bg-white/5' : ''} ${d.isWeekend ? 'bg-red-50/30 dark:bg-red-500/5' : ''}`}
                                                        >
                                                            {status === 'work' && (
                                                                <div className="w-full h-10 bg-green-500 rounded-lg shadow-sm mx-auto max-w-[36px]"></div>
                                                            )}
                                                            {status === 'sick' && (
                                                                <div className="w-full h-10 bg-orange-500 rounded-lg shadow-sm mx-auto max-w-[36px] flex items-center justify-center text-white font-bold text-xs">Б</div>
                                                            )}
                                                            {status === 'vacation' && (
                                                                <div className="w-full h-10 bg-blue-500 rounded-lg shadow-sm mx-auto max-w-[36px] flex items-center justify-center text-white font-bold text-xs">О</div>
                                                            )}
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        
                        {/* FIXED FLOATING ADD BUTTON */}
                        {editMode && (
                            <div className="fixed bottom-[90px] left-4 right-4 z-[60] flex justify-center animate-slide-up pointer-events-none">
                                <button 
                                    onClick={addChef} 
                                    className="pointer-events-auto w-full max-w-sm bg-gray-900 dark:bg-white text-white dark:text-black font-bold py-3.5 px-6 rounded-2xl shadow-xl active:scale-95 transition flex items-center justify-center gap-2 border border-white/10"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                                    Добавить сотрудника
                                </button>
                            </div>
                        )}
                    </>
                )}
             </div>
        </div>
    );

    // If Fullscreen, render via Portal to document.body
    if (isFullscreen) {
        return createPortal(
            <div className="fixed inset-0 z-[100] bg-[#f2f4f7] dark:bg-[#0f1115] animate-fade-in overflow-hidden">
                {ScheduleContent}
            </div>,
            document.body
        );
    }

    return <div className="pb-32 animate-fade-in min-h-screen bg-[#f2f4f7] dark:bg-[#0f1115] flex flex-col h-screen overflow-hidden">{ScheduleContent}</div>;
};

export default Schedule;
