import React, { createContext, useContext, useEffect, useState } from 'react';
import { Theme } from '../types';
import { useTelegram } from './TelegramContext';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { webApp, isTwa } = useTelegram();
  
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('theme');
    return (saved as Theme) || 'light';
  });

  // Sync with Telegram Theme
  useEffect(() => {
    if (isTwa && webApp) {
        setTheme(webApp.colorScheme);
    }
  }, [isTwa, webApp, webApp?.colorScheme]);

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
    localStorage.setItem('theme', theme);
    
    // Sync meta tag color
    const metaThemeColor = document.querySelector("meta[name=theme-color]");
    if (metaThemeColor) {
        metaThemeColor.setAttribute("content", theme === 'dark' ? '#0f1115' : '#f2f4f7');
    }
    
    // Update Telegram Header Color if in TWA
    if (isTwa && webApp) {
        webApp.setHeaderColor(theme === 'dark' ? '#0f1115' : '#f2f4f7');
        webApp.setBackgroundColor(theme === 'dark' ? '#0f1115' : '#f2f4f7');
    }

  }, [theme, isTwa, webApp]);

  const toggleTheme = () => {
    // If inside Telegram, we usually prefer to respect the OS/App theme, 
    // but allowing toggle is fine for override.
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
