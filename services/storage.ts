
import { getBotId } from './api';

const getPrefix = () => `${getBotId()}_`;

export const scopedStorage = {
    getItem: (key: string): string | null => {
        return localStorage.getItem(getPrefix() + key);
    },
    
    setItem: (key: string, value: string): void => {
        try {
            localStorage.setItem(getPrefix() + key, value);
        } catch (e) {
            console.error("Storage Quota Exceeded or Error", e);
        }
    },
    
    removeItem: (key: string): void => {
        localStorage.removeItem(getPrefix() + key);
    },

    // Typed JSON Helpers
    getJson: <T>(key: string, defaultValue: T): T => {
        try {
            const item = localStorage.getItem(getPrefix() + key);
            return item ? JSON.parse(item) : defaultValue;
        } catch (e) {
            console.error(`Error parsing JSON for key ${key}`, e);
            return defaultValue;
        }
    },

    setJson: (key: string, value: any): void => {
        try {
            localStorage.setItem(getPrefix() + key, JSON.stringify(value));
        } catch (e) {
            console.error("Storage Save Error", e);
        }
    },

    // Utility to clear only current bot data
    clearCurrentScope: () => {
        const prefix = getPrefix();
        const keysToRemove: string[] = [];
        
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(prefix)) {
                keysToRemove.push(key);
            }
        }
        
        keysToRemove.forEach(k => localStorage.removeItem(k));
    }
};
