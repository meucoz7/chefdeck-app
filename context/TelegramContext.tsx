
import React, { createContext, useContext, useEffect, useState } from 'react';
import { WebApp, TelegramUser } from '../types';
import { ADMIN_IDS } from '../config';
import { apiFetch } from '../services/api';

interface TelegramContextType {
    webApp?: WebApp;
    user?: TelegramUser;
    isAdmin: boolean;
    isTwa: boolean;
}

const TelegramContext = createContext<TelegramContextType | undefined>(undefined);

export const TelegramProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [webApp, setWebApp] = useState<WebApp | undefined>();
    const [user, setUser] = useState<TelegramUser | undefined>();
    const [isTwa, setIsTwa] = useState(false);
    const [isAdmin, setIsAdmin] = useState(false);

    useEffect(() => {
        if (window.Telegram && window.Telegram.WebApp) {
            const tg = window.Telegram.WebApp;
            tg.ready();
            
            // Modern Fullscreen & Swipe Logic (Mini Apps 7.7+)
            try {
                // Check if methods exist AND version is high enough
                if (tg.isVersionAtLeast && tg.isVersionAtLeast('7.7')) {
                    // ONLY request fullscreen on mobile devices to prevent weird desktop behavior
                    if (['android', 'ios'].includes(tg.platform)) {
                        if (typeof tg.requestFullscreen === 'function') {
                            tg.requestFullscreen();
                        }
                    }
                    
                    if (typeof tg.disableVerticalSwipes === 'function') {
                        tg.disableVerticalSwipes();
                    }
                } else {
                    tg.expand(); // Fallback for older versions
                }
            } catch (e) {
                console.warn('Fullscreen/Swipe API not supported:', e);
                tg.expand();
            }
            
            setWebApp(tg);
            setIsTwa(!!tg.initData);
            
            if (tg.initDataUnsafe?.user) {
                const tgUser = tg.initDataUnsafe.user;
                const isConfigAdmin = ADMIN_IDS.includes(tgUser.id);
                
                // SYNC USER WITH BACKEND AND FETCH ADMIN STATUS
                apiFetch('/api/sync-user', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(tgUser)
                })
                .then(res => res.json())
                .then(data => {
                    if (data.success && data.user) {
                        setUser(data.user); // Contains isAdmin from DB
                        setIsAdmin(isConfigAdmin || !!data.user.isAdmin);
                    } else {
                        // Fallback
                        setUser(tgUser);
                        setIsAdmin(isConfigAdmin);
                    }
                })
                .catch(err => {
                    console.error("Sync failed", err);
                    setUser(tgUser);
                    setIsAdmin(isConfigAdmin);
                });

            } else {
                // Dev mode
                 // setIsAdmin(true); 
            }
        }
    }, []);

    return (
        <TelegramContext.Provider value={{ webApp, user, isAdmin, isTwa }}>
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
