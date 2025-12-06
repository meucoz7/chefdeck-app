
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
            tg.expand();
            
            setWebApp(tg);
            setIsTwa(!!tg.initData);
            
            if (tg.initDataUnsafe?.user) {
                const tgUser = tg.initDataUnsafe.user;
                setUser(tgUser);
                setIsAdmin(ADMIN_IDS.includes(tgUser.id));

                // SYNC USER WITH BACKEND
                fetch('/api/sync-user', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(tgUser)
                }).catch(err => console.error("Sync failed", err));

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
