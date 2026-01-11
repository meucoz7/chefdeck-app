
import React, { createContext, useContext, useState, useEffect } from 'react';
import { HomeSettings } from '../types';
import { apiFetch } from '../services/api';

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

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const res = await apiFetch('/api/settings');
                if (res.ok) {
                    const data = await res.json();
                    if (data) {
                        // Ensure we use the clean data without mongo fields
                        const { _id, __v, botId, ...cleanSettings } = data;
                        setSettings({ ...DEFAULT_SETTINGS, ...cleanSettings });
                    }
                }
            } catch (e) {
                console.error("Failed to load settings from server", e);
            } finally {
                setIsLoadingSettings(false);
            }
        };

        fetchSettings();
    }, []);

    const updateSettings = async (newSettings: Partial<HomeSettings>) => {
        // Optimistic UI update
        const updated = { ...settings, ...newSettings };
        setSettings(updated);

        try {
            await apiFetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updated)
            });
        } catch (e) {
            console.error("Failed to sync settings to server", e);
            // Optionally revert on error? 
            // For now keep optimistic for better UX
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
