import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { RecipeProvider } from './context/RecipeContext';
import { ToastProvider } from './context/ToastContext';
import { TelegramProvider } from './context/TelegramContext';
import Layout from './components/Layout';
import Home from './pages/Home';
import Details from './pages/Details';
import Editor from './pages/Editor';
import Profile from './pages/Profile';
import Schedule from './pages/Schedule';

const App: React.FC = () => {
  return (
    <TelegramProvider>
        <ThemeProvider>
          <ToastProvider>
            <RecipeProvider>
              <HashRouter>
                <Layout>
                  <Routes>
                    <Route path="/" element={<Home />} />
                    <Route path="/favorites" element={<Home favoritesOnly={true} />} />
                    <Route path="/recipe/:id" element={<Details />} />
                    <Route path="/add" element={<Editor />} />
                    <Route path="/edit/:id" element={<Editor />} />
                    <Route path="/profile" element={<Profile />} />
                    <Route path="/schedule" element={<Schedule />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </Layout>
              </HashRouter>
            </RecipeProvider>
          </ToastProvider>
        </ThemeProvider>
    </TelegramProvider>
  );
};

export default App;
