
import React, { createContext, useContext, useState, useEffect } from 'react';
import { HomeSettings } from '../types';
import { apiFetch } from '../services/api';
import { useTelegram } from './TelegramContext';

interface SettingsContextType {
    settings: HomeSettings;
    updateSettings: (newSettings: Partial<HomeSettings>) => Promise<void>;
    isLoadingSettings: boolean;
}

const DEFAULT_SETTINGS: HomeSettings = {
    showInventory: true,
    showSchedule: true,
    showWastage: true,
    showArchive: true
};

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [settings, setSettings] = useState<HomeSettings>(DEFAULT_SETTINGS);
    const [isLoadingSettings, setIsLoadingSettings] = useState(true);
    const { initialData, isInitialized } = useTelegram();

    useEffect(() => {
        if (isInitialized) {
            if (initialData?.settings) {
                const { _id, __v, botId, ...cleanSettings } = initialData.settings as any;
                setSettings({ ...DEFAULT_SETTINGS, ...cleanSettings });
            }
            setIsLoadingSettings(false);
        }
    }, [isInitialized, initialData]);

    const updateSettings = async (newSettings: Partial<HomeSettings>) => {
        const updated = { ...settings, ...newSettings };
        setSettings(updated);
        try {
            await apiFetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updated)
            });
        } catch (e) {
            console.error("Failed to sync settings", e);
        }
    };

    return (
        <SettingsContext.Provider value={{ settings, updateSettings, isLoadingSettings }}>
            {children}
        </SettingsContext.Provider>
    );
};

export const useSettings = () => {
    const context = useContext(SettingsContext);
    if (context === undefined) {
        throw new Error('useSettings must be used within a SettingsProvider');
    }
    return context;
};
