
import React, { createContext, useContext, useEffect, useState } from 'react';
import { WebApp, TelegramUser } from '../types';
import { ADMIN_IDS } from '../config';

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
            
            // Modern Fullscreen & Swipe Logic (Mini Apps 7.6+)
            try {
                if (typeof tg.requestFullscreen === 'function') {
                    tg.requestFullscreen();
                } else {
                    tg.expand(); // Fallback for older versions
                }

                if (typeof tg.disableVerticalSwipes === 'function') {
                    tg.disableVerticalSwipes();
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
                fetch('/api/sync-user', {
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
