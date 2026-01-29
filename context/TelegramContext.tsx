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
            
            // Расширяем приложение сразу
            try {
                if (tg.isVersionAtLeast && tg.isVersionAtLeast('7.7')) {
                    if (['android', 'ios'].includes(tg.platform)) {
                        tg.requestFullscreen?.();
                    }
                    tg.disableVerticalSwipes?.();
                } else {
                    tg.expand();
                }
            } catch (e) {
                tg.expand();
            }
            
            setWebApp(tg);
            setIsTwa(!!tg.initData);
            
            if (tg.initDataUnsafe?.user) {
                const tgUser = tg.initDataUnsafe.user;
                
                // КРИТИЧЕСКИЙ ФИКС: Ставим пользователя СРАЗУ.
                // Не ждем ответа от сервера, чтобы UI не висел.
                setUser(tgUser);
                setIsAdmin(ADMIN_IDS.includes(tgUser.id));

                // Фоновая синхронизация
                apiFetch('/api/sync-user', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(tgUser)
                })
                .then(res => res.json())
                .then(data => {
                    if (data.success && data.user) {
                        // Обновляем статус админа, если сервер подтвердил его
                        setIsAdmin(prev => prev || !!data.user.isAdmin);
                    }
                })
                .catch(err => {
                    console.warn("User sync background failed, using local TG data", err);
                });
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
