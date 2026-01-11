
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { v4 as uuidv4 } from 'uuid';
import { ChefScheduleItem, ShiftType } from '../types';
import { useTelegram } from '../context/TelegramContext';
import { useToast } from '../context/ToastContext';
import { apiFetch } from '../services/api';

// Extended Palette
const PASTEL_PALETTE = [
    '#3b82f6', // Blue
    '#10b981', // Emerald
    '#f59e0b', // Amber
    '#ef4444', // Red
    '#8b5cf6', // Violet
    '#ec4899', // Pink
    '#06b6d4', // Cyan
    '#64748b', // Slate
    '#84cc16', // Lime
    '#14b8a6', // Teal
    '#f43f5e', // Rose
    '#a855f7', // Purple
    '#eab308', // Yellow
    '#6366f1', // Indigo
    '#f97316', // Orange
    '#0ea5e9', // Sky
    '#d946ef', // Fuchsia
    '#4338ca', // Dark Indigo
    '#be123c', // Rose Red
    '#0f766e', // Dark Teal
    '#b45309', // Dark Amber
    '#475569', // Blue Grey
    '#57534e', // Stone
    '#78716c', // Warm Grey
    '#2dd4bf', // Teal 400
    '#fbbf24', // Amber 400
    '#a3e635', // Lime 400
];

const Schedule: React.FC = () => {
    const navigate = useNavigate();
    const { isAdmin, user } = useTelegram();
    const { addToast } = useToast();
    
    const [staff, setStaff] = useState<ChefScheduleItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [editMode, setEditMode] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isSending, setIsSending] = useState(false);
    
    // Popover State for Color Picker
    const [pickerState, setPickerState] = useState<{ id: string; top: number; left: number } | null>(null);
    
    const todayHeaderRef = useRef<HTMLTableHeaderCellElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const tableRef = useRef<HTMLTableElement>(null);

    // Dates Logic (Current Month)
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    
    const days = Array.from({ length: daysInMonth }, (_, i) => {
        const date = new Date(currentYear, currentMonth, i + 1);
        const dStr = date.toISOString().split('T')[0];
        return {
            dateStr: dStr, // YYYY-MM-DD
            dayNum: i + 1,
            weekday: date.toLocaleDateString('ru-RU', { weekday: 'short' }),
            isWeekend: date.getDay() === 0 || date.getDay() === 6,
            isToday: dStr === todayStr
        };
    });

    // Fetch Schedule
    useEffect(() => {
        apiFetch('/api/schedule')
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

    // Auto-scroll to today
    useEffect(() => {
        if (!isLoading && todayHeaderRef.current) {
            setTimeout(() => {
                todayHeaderRef.current?.scrollIntoView({ 
                    behavior: 'smooth', 
                    inline: 'center',
                    block: 'nearest'
                });
            }, 300);
        }
    }, [isLoading, isFullscreen]);

    const handleSave = async () => {
        if (staff.some(s => !s.name.trim())) {
            addToast("Имя сотрудника не может быть пустым", "error");
            return;
        }
        try {
            await apiFetch('/api/schedule', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(staff)
            });
            setEditMode(false);
            setPickerState(null);
            addToast("График сохранен", "success");
        } catch (e) {
            addToast("Ошибка сохранения", "error");
        }
    };

    const handleShare = async () => {
        if (!user) {
            addToast("Недоступно", "error");
            return;
        }
        if (!tableRef.current) return;
        
        setIsSending(true);
        addToast("Создаю снимок...", "info");

        try {
            const html2canvas = (window as any).html2canvas;
            if (!html2canvas) throw new Error("Library not loaded");

            // Clone the table
            const originalTable = tableRef.current;
            const clone = originalTable.cloneNode(true) as HTMLElement;
            
            // 1. Remove sticky positioning explicitly to prevent "falling" headers in the canvas
            // We use inline styles to override any classes
            const stickyElements = clone.querySelectorAll('.sticky');
            stickyElements.forEach((el: any) => {
                el.classList.remove('sticky', 'top-0', 'left-0');
                el.style.position = 'static';
            });
            
            // 2. Setup wrapper
            const wrapper = document.createElement('div');
            wrapper.style.position = 'absolute';
            wrapper.style.top = '-9999px';
            wrapper.style.left = '0';
            wrapper.style.width = 'max-content'; // Ensure full width (fixes cut off names)
            wrapper.style.height = 'auto';
            wrapper.style.background = '#ffffff';
            wrapper.style.padding = '0'; // Remove white borders
            
            // Ensure clone is visible and laid out correctly
            clone.style.width = '100%'; 
            clone.style.border = 'none';
            // Force text colors to black/light theme for contrast in snapshot
            clone.classList.remove('dark');
            clone.classList.add('light');
            
            wrapper.appendChild(clone);
            document.body.appendChild(wrapper);

            // 3. Generate with high scale
            const canvas = await html2canvas(wrapper, {
                scale: 3, // High resolution
                backgroundColor: '#ffffff',
                logging: false,
                useCORS: true,
                onclone: (clonedDoc: Document) => {
                    const html = clonedDoc.documentElement;
                    html.classList.remove('dark');
                    html.classList.add('light');
                    // Reset body background
                    clonedDoc.body.style.backgroundColor = '#ffffff';
                    
                    // Force specific styles on the cloned table
                    const tbl = clonedDoc.querySelector('table');
                    if(tbl) {
                        tbl.style.color = '#000000';
                        tbl.style.background = '#ffffff';
                    }
                }
            });

            document.body.removeChild(wrapper);
            const imageBase64 = canvas.toDataURL('image/png');

            await apiFetch('/api/schedule/share', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image: imageBase64, userId: user.id })
            });

            addToast("График отправлен в чат!", "success");

        } catch (e: any) {
            console.error(e);
            addToast("Ошибка отправки", "error");
        } finally {
            setIsSending(false);
        }
    };

    const addChef = () => {
        setStaff([...staff, { id: uuidv4(), name: 'Сотрудник', station: 'Должность', shifts: {}, color: '#3b82f6' }]);
    };

    const removeChef = (id: string) => {
        if(confirm("Удалить сотрудника из графика?")) {
            setStaff(staff.filter(s => s.id !== id));
        }
    };

    const updateChef = (id: string, field: keyof ChefScheduleItem, val: string) => {
        setStaff(prev => prev.map(s => s.id === id ? { ...s, [field]: val } : s));
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

    const handleColorClick = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (pickerState?.id === id) {
            setPickerState(null);
        } else {
            const rect = (e.target as HTMLElement).getBoundingClientRect();
            setPickerState({
                id,
                top: rect.bottom + window.scrollY + 5,
                left: rect.left + window.scrollX
            });
        }
    };

    // Component for the Table Content to reuse or render in portal
    const ScheduleContent = (
        <div className={`flex flex-col ${isFullscreen ? 'fixed inset-0 z-[100] bg-[#f2f4f7] dark:bg-[#0f1115]' : 'h-full'}`}>
             
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
                         {/* Share Button (Only View Mode) */}
                        {!editMode && (
                             <button 
                                onClick={handleShare}
                                disabled={isSending}
                                className="w-10 h-10 rounded-full bg-white dark:bg-[#1e1e24] shadow-sm flex items-center justify-center text-sky-500 border border-gray-100 dark:border-white/10 active:scale-95 transition disabled:opacity-50"
                            >
                                {isSending ? (
                                    <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                ) : (
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" /></svg>
                                )}
                            </button>
                        )}

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
                            <div className="flex gap-2">
                                {editMode ? (
                                    <>
                                        <button 
                                            onClick={() => setEditMode(false)}
                                            className="w-10 h-10 rounded-full bg-gray-200 dark:bg-white/10 shadow-sm flex items-center justify-center text-gray-600 dark:text-gray-300 border border-transparent active:scale-95 transition"
                                        >
                                           <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                                        </button>
                                        <button 
                                            onClick={handleSave}
                                            className="w-10 h-10 rounded-full bg-green-500 shadow-lg shadow-green-500/30 flex items-center justify-center text-white border border-transparent active:scale-95 transition"
                                        >
                                           <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                                        </button>
                                    </>
                                ) : (
                                    <button 
                                        onClick={() => setEditMode(true)}
                                        className="w-10 h-10 rounded-full bg-white dark:bg-[#1e1e24] shadow-sm flex items-center justify-center text-gray-900 dark:text-white border border-gray-100 dark:border-white/10 active:scale-95 transition"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" /></svg>
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </div>
                
                {/* Legend */}
                <div className="flex gap-4 pb-2 px-1 overflow-x-auto no-scrollbar">
                    <div className="flex items-center gap-1.5 whitespace-nowrap">
                        <div className="w-3 h-3 rounded-md border border-gray-300 dark:border-white/20 bg-gray-100 dark:bg-white/10"></div>
                        <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase">Смена (Цвет)</span>
                    </div>
                    <div className="flex items-center gap-1.5 whitespace-nowrap">
                        <div className="w-3 h-3 rounded-md bg-orange-500 flex items-center justify-center text-[8px] text-white font-bold leading-none">Б</div>
                        <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase">Больничный</span>
                    </div>
                    <div className="flex items-center gap-1.5 whitespace-nowrap">
                        <div className="w-3 h-3 rounded-md bg-blue-500 flex items-center justify-center text-[8px] text-white font-bold leading-none">О</div>
                        <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase">Отпуск</span>
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
                                {isAdmin && <p className="text-xs text-gray-500">Нажмите карандаш, чтобы создать</p>}
                             </div>
                        ) : (
                            <div ref={scrollContainerRef} className="flex-1 overflow-auto bg-white dark:bg-[#1e1e24] scrollbar-thin">
                                <table ref={tableRef} className="border-separate border-spacing-0 min-w-full">
                                    <thead className="bg-[#f2f4f7] dark:bg-[#0f1115] sticky top-0 z-30">
                                        <tr>
                                            <th scope="col" className="sticky left-0 z-40 bg-[#f2f4f7] dark:bg-[#0f1115] py-3 pl-4 pr-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-200 dark:border-white/10 min-w-[160px] max-w-[180px] shadow-[4px_0_10px_-5px_rgba(0,0,0,0.05)] border-r border-gray-200 dark:border-white/10 h-12">
                                                Сотрудник
                                            </th>
                                            {days.map(d => (
                                                <th 
                                                    key={d.dayNum} 
                                                    ref={d.isToday ? todayHeaderRef : null}
                                                    scope="col" 
                                                    className={`px-1 py-1 text-center text-xs font-bold border-b border-gray-200 dark:border-white/10 border-r min-w-[42px] h-12 transition-colors ${d.isToday ? 'bg-sky-50 dark:bg-sky-500/10' : (d.isWeekend ? 'bg-red-50/30 dark:bg-red-500/5' : 'bg-[#f2f4f7] dark:bg-[#0f1115]')}`}
                                                >
                                                    <div className="flex flex-col items-center justify-center h-full">
                                                        <span className={`text-[9px] uppercase mb-0.5 leading-none ${d.isToday ? 'text-sky-600' : (d.isWeekend ? 'text-red-400' : 'text-gray-400')}`}>{d.weekday}</span>
                                                        <span className={`text-sm leading-none ${d.isToday ? 'text-sky-600 font-black' : (d.isWeekend ? 'text-red-500' : 'text-gray-900 dark:text-white')}`}>{d.dayNum}</span>
                                                    </div>
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white dark:bg-[#1e1e24]">
                                        {staff.map((person) => {
                                            const rowStyle = person.color ? { backgroundColor: `${person.color}08` } : {};
                                            // Apply mixed background for sticky column: white base + color tint
                                            const stickyStyle = person.color ? { 
                                                backgroundImage: `linear-gradient(${person.color}08, ${person.color}08), linear-gradient(var(--bg-color), var(--bg-color))` 
                                            } : {};

                                            return (
                                                <tr key={person.id} className="group transition-colors" style={rowStyle}>
                                                    {/* Sticky Employee Column */}
                                                    <td 
                                                        className="sticky left-0 z-20 py-2 pl-4 pr-3 border-b border-gray-100 dark:border-white/5 shadow-[4px_0_10px_-5px_rgba(0,0,0,0.05)] border-r border-gray-200 dark:border-white/10 min-h-[3rem] transition-colors align-middle relative overflow-visible"
                                                        style={{
                                                            '--bg-color': '#ffffff',
                                                            ...stickyStyle,
                                                            backgroundColor: 'var(--bg-color)' // Fallback
                                                        } as unknown as React.CSSProperties}
                                                    >
                                                        {/* Dark mode override via class */}
                                                        <div className="absolute inset-0 bg-white dark:bg-[#1e1e24] -z-10"></div>
                                                        <div className="absolute inset-0 -z-10" style={{ backgroundColor: person.color ? `${person.color}08` : 'transparent' }}></div>

                                                        {/* Color Marker Strip */}
                                                        <div className="absolute top-0 left-0 bottom-0 w-1" style={{ backgroundColor: person.color || '#3b82f6' }}></div>
                                                        
                                                        {editMode ? (
                                                            <div className="flex flex-col gap-2 w-full relative">
                                                                <input 
                                                                    value={person.name} 
                                                                    onChange={e => updateChef(person.id, 'name', e.target.value)} 
                                                                    className="w-full bg-gray-100 dark:bg-[#2a2a35] border border-transparent focus:border-sky-500 px-2 py-1.5 rounded text-sm font-bold shadow-inner outline-none text-gray-900 dark:text-white" 
                                                                    placeholder="Имя"
                                                                />
                                                                
                                                                <div className="flex gap-2 items-center">
                                                                    <input 
                                                                        value={person.station} 
                                                                        onChange={e => updateChef(person.id, 'station', e.target.value)} 
                                                                        className="flex-1 min-w-0 bg-gray-50 dark:bg-[#2a2a35] border border-transparent focus:border-sky-500 px-2 py-1.5 rounded text-xs shadow-inner outline-none text-gray-700 dark:text-gray-300" 
                                                                        placeholder="Должность"
                                                                    />
                                                                    
                                                                    {/* Color Picker Trigger */}
                                                                    <div 
                                                                        onClick={(e) => handleColorClick(e, person.id)}
                                                                        className="w-7 h-7 rounded-full cursor-pointer shadow-sm border-2 border-white dark:border-gray-700 hover:scale-110 transition flex-shrink-0"
                                                                        style={{ backgroundColor: person.color || '#3b82f6' }}
                                                                    ></div>

                                                                    <button onClick={() => removeChef(person.id)} className="w-7 h-7 rounded bg-red-100 dark:bg-red-500/20 text-red-500 flex items-center justify-center hover:bg-red-200 shadow-sm flex-shrink-0 text-xs font-bold">✕</button>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div className="flex flex-col justify-center h-full pl-1">
                                                                <div className="font-bold text-sm text-gray-900 dark:text-white leading-tight mb-0.5">{person.name}</div>
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wide truncate max-w-[80px]">{person.station}</span>
                                                                    <span className="text-[9px] bg-green-50 dark:bg-green-500/10 text-green-600 px-1.5 rounded font-bold whitespace-nowrap">
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
                                                                className={`border-b border-gray-100 dark:border-white/5 border-r dark:border-r-white/5 text-center p-0.5 relative align-middle 
                                                                    ${editMode ? 'cursor-pointer hover:bg-black/5 dark:hover:bg-white/5' : ''} 
                                                                    ${d.isToday ? 'bg-sky-50/50 dark:bg-sky-500/5' : (d.isWeekend ? 'bg-red-50/30 dark:bg-red-500/5' : '')}
                                                                `}
                                                            >
                                                                {status === 'work' && (
                                                                    <div 
                                                                        className="w-full h-8 rounded-md shadow-sm mx-auto max-w-[32px] opacity-90"
                                                                        style={{ backgroundColor: person.color || '#3b82f6' }}
                                                                    ></div>
                                                                )}
                                                                {status === 'sick' && (
                                                                    <div className="w-full h-8 bg-orange-500 rounded-md shadow-sm mx-auto max-w-[32px] flex items-center justify-center text-white font-bold text-[10px]">Б</div>
                                                                )}
                                                                {status === 'vacation' && (
                                                                    <div className="w-full h-8 bg-blue-500 rounded-md shadow-sm mx-auto max-w-[32px] flex items-center justify-center text-white font-bold text-[10px]">О</div>
                                                                )}
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                            );
                                        })}
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

             {/* COLOR PICKER PORTAL */}
             {pickerState && createPortal(
                 <>
                    {/* Backdrop to close */}
                    <div className="fixed inset-0 z-[9998]" onClick={() => setPickerState(null)}></div>
                    {/* Popover */}
                    <div 
                        className="fixed z-[9999] bg-white dark:bg-[#1e1e24] p-4 rounded-3xl shadow-2xl border border-gray-100 dark:border-white/10 grid grid-cols-6 gap-3 animate-scale-in max-w-[300px]"
                        style={{ top: pickerState.top, left: Math.min(pickerState.left, window.innerWidth - 300) }}
                    >
                        {PASTEL_PALETTE.map(c => (
                            <div 
                                key={c}
                                onClick={() => { updateChef(pickerState.id, 'color', c); setPickerState(null); }}
                                className="w-8 h-8 rounded-full cursor-pointer hover:scale-110 transition border-2 border-transparent hover:border-gray-300 dark:hover:border-white/50 shadow-sm"
                                style={{ backgroundColor: c }}
                            ></div>
                        ))}
                    </div>
                 </>,
                 document.body
             )}
        </div>
    );

    return isFullscreen ? createPortal(ScheduleContent, document.body) : ScheduleContent;
};

export default Schedule;
