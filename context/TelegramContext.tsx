
import React, { createContext, useContext, useEffect, useState } from 'react';
import { WebApp, TelegramUser, TechCard, HomeSettings } from '../types';
import { ADMIN_IDS } from '../config';
import { apiFetch } from '../services/api';

interface TelegramContextType {
    webApp?: WebApp;
    user?: TelegramUser;
    isAdmin: boolean;
    isTwa: boolean;
    initialData?: {
        recipes: TechCard[];
        settings: HomeSettings;
    };
    isInitialized: boolean;
}

const TelegramContext = createContext<TelegramContextType | undefined>(undefined);

export const TelegramProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [webApp, setWebApp] = useState<WebApp | undefined>();
    const [user, setUser] = useState<TelegramUser | undefined>();
    const [isTwa, setIsTwa] = useState(false);
    const [isAdmin, setIsAdmin] = useState(false);
    const [isInitialized, setIsInitialized] = useState(false);
    const [initialData, setInitialData] = useState<{recipes: TechCard[], settings: HomeSettings} | undefined>();

    useEffect(() => {
        if (window.Telegram && window.Telegram.WebApp) {
            const tg = window.Telegram.WebApp;
            tg.ready();
            
            try {
                if (tg.isVersionAtLeast && tg.isVersionAtLeast('7.7')) {
                    if (['android', 'ios'].includes(tg.platform)) {
                        if (typeof tg.requestFullscreen === 'function') tg.requestFullscreen();
                    }
                    if (typeof tg.disableVerticalSwipes === 'function') tg.disableVerticalSwipes();
                } else {
                    tg.expand();
                }
            } catch (e) {
                console.warn('UI API not fully supported:', e);
                tg.expand();
            }
            
            setWebApp(tg);
            setIsTwa(!!tg.initData);
            
            if (tg.initDataUnsafe?.user) {
                const tgUser = tg.initDataUnsafe.user;
                
                // Консолидированный запрос инициализации
                apiFetch('/api/init-app', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(tgUser)
                })
                .then(res => res.json())
                .then(data => {
                    if (data.success) {
                        setUser(data.user);
                        setIsAdmin(ADMIN_IDS.includes(tgUser.id) || !!data.user.isAdmin);
                        setInitialData({
                            recipes: data.recipes,
                            settings: data.settings
                        });
                    }
                    setIsInitialized(true);
                })
                .catch(err => {
                    console.error("Initialization failed", err);
                    setUser(tgUser);
                    setIsAdmin(ADMIN_IDS.includes(tgUser.id));
                    setIsInitialized(true);
                });
            } else {
                setIsInitialized(true);
            }
        } else {
            setIsInitialized(true);
        }
    }, []);

    return (
        <TelegramContext.Provider value={{ webApp, user, isAdmin, isTwa, initialData, isInitialized }}>
            {children}
        </TelegramContext.Provider>
    );
};

export const useTelegram = () => {
    const context = useContext(TelegramContext);
    if (context === undefined) {
        throw new Error('useTelegram must be used within a TelegramProvider');
    }
    return context;
};
