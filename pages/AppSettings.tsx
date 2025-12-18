
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTelegram } from '../context/TelegramContext';
import { useToast } from '../context/ToastContext';
import { apiFetch } from '../services/api';
import { AppSettings as SettingsType } from '../types';

const AppSettings: React.FC = () => {
    const navigate = useNavigate();
    const { isAdmin } = useTelegram();
    const { addToast } = useToast();
    const [settings, setSettings] = useState<SettingsType>({
        showSchedule: true,
        showWastage: true,
        showInventory: true,
        showArchive: true
    });
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (!isAdmin) { navigate('/'); return; }
        
        apiFetch('/api/settings')
            .then(res => res.json())
            .then(data => {
                if (data && typeof data === 'object') {
                    setSettings(prev => ({ ...prev, ...data }));
                }
            })
            .catch(() => console.log("Using default settings"));
    }, [isAdmin, navigate]);

    const handleToggle = (key: keyof SettingsType) => {
        setSettings(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await apiFetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settings)
            });
            addToast("Настройки обновлены", "success");
            navigate('/profile');
        } catch (e) {
            addToast("Ошибка сохранения", "error");
        } finally {
            setIsSaving(false);
        }
    };

    const SettingItem = ({ label, icon, value, onChange }: { label: string, icon: string, value: boolean, onChange: () => void }) => (
        <div onClick={onChange} className="flex items-center justify-between p-4 bg-white dark:bg-[#1e1e24] rounded-2xl border border-gray-100 dark:border-white/5 active:scale-[0.98] transition-transform cursor-pointer">
            <div className="flex items-center gap-3">
                <span className="text-xl">{icon}</span>
                <span className="font-bold text-gray-900 dark:text-white">{label}</span>
            </div>
            <div className={`w-12 h-7 rounded-full p-1 transition-colors ${value ? 'bg-sky-500' : 'bg-gray-200 dark:bg-white/10'}`}>
                <div className={`w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${value ? 'translate-x-5' : 'translate-x-0'}`}></div>
            </div>
        </div>
    );

    return (
        <div className="pb-28 animate-fade-in min-h-screen bg-[#f2f4f7] dark:bg-[#0f1115]">
            <div className="pt-safe-top px-5 pb-4">
                <div className="flex items-center gap-3 pt-4 mb-6">
                    <button onClick={() => navigate('/profile')} className="w-10 h-10 rounded-full bg-white dark:bg-[#1e1e24] shadow-sm flex items-center justify-center text-gray-900 dark:text-white">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
                    </button>
                    <h1 className="text-2xl font-black text-gray-900 dark:text-white leading-none">Настройки</h1>
                </div>

                <div className="space-y-3">
                    <SettingItem label="График смен" icon="📅" value={settings.showSchedule} onChange={() => handleToggle('showSchedule')} />
                    <SettingItem label="Списания" icon="🗑️" value={settings.showWastage} onChange={() => handleToggle('showWastage')} />
                    <SettingItem label="Инвентаризация" icon="📋" value={settings.showInventory} onChange={() => handleToggle('showInventory')} />
                    <SettingItem label="Архив техкарт" icon="📦" value={settings.showArchive} onChange={() => handleToggle('showArchive')} />
                </div>

                <button 
                    onClick={handleSave} 
                    disabled={isSaving}
                    className="w-full mt-10 bg-gray-900 dark:bg-white text-white dark:text-black font-bold py-4 rounded-2xl shadow-xl active:scale-95 transition flex items-center justify-center"
                >
                    {isSaving ? 'Сохранение...' : 'Сохранить изменения'}
                </button>
            </div>
        </div>
    );
};

export default AppSettings;
