
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useSettings } from '../context/SettingsContext';
import { useTelegram } from '../context/TelegramContext';
import { useToast } from '../context/ToastContext';

const AppSettings: React.FC = () => {
    const navigate = useNavigate();
    const { settings, updateSettings } = useSettings();
    const { isAdmin } = useTelegram();
    const { addToast } = useToast();

    if (!isAdmin) {
        navigate('/');
        return null;
    }

    const toggle = (key: keyof typeof settings) => {
        updateSettings({ [key]: !settings[key] });
        addToast("Настройки обновлены", "success");
    };

    const SettingRow = ({ label, description, icon, value, onClick, color }: { label: string, description: string, icon: React.ReactNode, value: boolean, onClick: () => void, color: string }) => (
        <div onClick={onClick} className="p-5 flex items-center justify-between cursor-pointer active:bg-gray-50 dark:active:bg-white/5 transition">
            <div className="flex items-center gap-4 min-w-0">
                <div className={`w-11 h-11 rounded-2xl flex items-center justify-center text-white shadow-sm flex-shrink-0 ${color}`}>
                    {icon}
                </div>
                <div className="min-w-0">
                    <span className="font-bold dark:text-white text-base block">{label}</span>
                    <span className="text-[11px] text-gray-400 font-medium leading-tight block truncate">{description}</span>
                </div>
            </div>
            {/* Custom Modern Switch */}
            <div className={`w-12 h-7 rounded-full p-1 transition-all duration-300 relative flex items-center ${value ? color : 'bg-gray-200 dark:bg-white/10'}`}>
                <div className={`w-5 h-5 bg-white rounded-full shadow-md transform transition-transform duration-300 ease-spring ${value ? 'translate-x-5' : 'translate-x-0'}`}></div>
            </div>
        </div>
    );

    return (
        <div className="pb-28 animate-fade-in min-h-screen bg-[#f2f4f7] dark:bg-[#0f1115]">
             {/* Header */}
             <div className="pt-safe-top px-5 pb-4 sticky top-0 z-40 bg-[#f2f4f7]/85 dark:bg-[#0f1115]/85 backdrop-blur-md transition-colors duration-300">
                <div className="flex items-center gap-3 pt-4 mb-2">
                    <button onClick={() => navigate('/profile')} className="w-10 h-10 rounded-full bg-white dark:bg-[#1e1e24] shadow-sm border border-gray-100 dark:border-white/5 flex items-center justify-center text-gray-900 dark:text-white active:scale-90 transition-transform">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
                    </button>
                    <div>
                        <h1 className="text-xl font-black text-gray-900 dark:text-white leading-none">Настройки кнопок</h1>
                        <p className="text-xs text-gray-400 font-bold uppercase tracking-wider mt-1">Главный экран</p>
                    </div>
                </div>
             </div>

             <div className="px-5 space-y-6">
                 <div className="bg-white dark:bg-[#1e1e24] rounded-[2rem] shadow-sm border border-gray-100 dark:border-white/5 overflow-hidden divide-y divide-gray-100 dark:divide-white/5">
                     
                     <SettingRow 
                        label="Инвентаризация" 
                        description="Кнопка снятия остатков на станциях"
                        icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" /></svg>}
                        value={settings.showInventory}
                        onClick={() => toggle('showInventory')}
                        color="bg-sky-500"
                     />

                     <SettingRow 
                        label="График" 
                        description="Расписание смен персонала"
                        icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>}
                        value={settings.showSchedule}
                        onClick={() => toggle('showSchedule')}
                        color="bg-indigo-500"
                     />

                     <SettingRow 
                        label="Списания" 
                        description="Журнал актов списания потерь"
                        icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>}
                        value={settings.showWastage}
                        onClick={() => toggle('showWastage')}
                        color="bg-red-500"
                     />

                     <SettingRow 
                        label="Архив" 
                        description="Список удаленных техкарт"
                        icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3.25a2.25 2.25 0 012.25-2.25h2.906a2.25 2.25 0 012.25 2.25v2.452a2.25 2.25 0 01-2.25 2.25H12a2.25 2.25 0 01-2.25-2.25V10.75z" /></svg>}
                        value={settings.showArchive}
                        onClick={() => toggle('showArchive')}
                        color="bg-slate-500"
                     />
                 </div>
                 <div className="px-4 text-center">
                    <p className="text-[10px] text-gray-400 font-medium leading-relaxed uppercase tracking-widest">
                        Отключенные инструменты будут скрыты <br /> для всех пользователей этого бота.
                    </p>
                 </div>
             </div>
        </div>
    );
};

export default AppSettings;
