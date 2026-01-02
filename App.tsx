
import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { RecipeProvider } from './context/RecipeContext';
import { ToastProvider } from './context/ToastContext';
import { TelegramProvider } from './context/TelegramContext';
import { SettingsProvider } from './context/SettingsContext';
import Layout from './components/Layout';
import Home from './pages/Home';
import Details from './pages/Details';
import Editor from './pages/Editor';
import Profile from './pages/Profile';
import Schedule from './pages/Schedule';
import Archive from './pages/Archive';
import Users from './pages/Users';
import AppSettings from './pages/AppSettings';
import Checklists from './pages/Checklists';
import CreateChecklist from './pages/CreateChecklist';
import MenuPlanner from './pages/MenuPlanner';
import Tools from './pages/Tools';
import ShoppingList from './pages/ShoppingList';
import Wastage from './pages/Wastage';
import Inventory from './pages/Inventory';
import InventoryArchive from './pages/InventoryArchive';

const App: React.FC = () => {
  return (
    <TelegramProvider>
        <SettingsProvider>
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
                        <Route path="/archive" element={<Archive />} />
                        <Route path="/users" element={<Users />} />
                        <Route path="/app-settings" element={<AppSettings />} />
                        <Route path="/checklists" element={<Checklists />} />
                        <Route path="/checklists/new" element={<CreateChecklist />} />
                        <Route path="/menu" element={<MenuPlanner />} />
                        <Route path="/tools" element={<Tools />} />
                        <Route path="/shopping" element={<ShoppingList />} />
                        <Route path="/wastage" element={<Wastage />} />
                        <Route path="/inventory" element={<Inventory />} />
                        <Route path="/inventory/archive" element={<InventoryArchive />} />
                        <Route path="*" element={<Navigate to="/" replace />} />
                      </Routes>
                    </Layout>
                  </HashRouter>
                </RecipeProvider>
              </ToastProvider>
            </ThemeProvider>
        </SettingsProvider>
    </TelegramProvider>
  );
};

export default App;
