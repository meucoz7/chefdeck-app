
import React, { createContext, useContext, useState, useEffect } from 'react';
import { HomeSettings } from '../types';
import { scopedStorage } from '../services/storage';

interface SettingsContextType {
    settings: HomeSettings;
    updateSettings: (newSettings: Partial<HomeSettings>) => void;
}

const DEFAULT_SETTINGS: HomeSettings = {
    showInventory: true,
    showSchedule: true,
    showWastage: true,
    showArchive: true
};

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [settings, setSettings] = useState<HomeSettings>(() => {
        return scopedStorage.getJson<HomeSettings>('app_home_settings', DEFAULT_SETTINGS);
    });

    const updateSettings = (newSettings: Partial<HomeSettings>) => {
        const updated = { ...settings, ...newSettings };
        setSettings(updated);
        scopedStorage.setJson('app_home_settings', updated);
    };

    return (
        <SettingsContext.Provider value={{ settings, updateSettings }}>
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
