
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { getBotId } from './services/api';

// --- MULTI-TENANCY SETUP ---
// Initialize the bot ID from URL if present
getBotId();

const rootElement = document.getElementById('root');

if (rootElement) {
    try {
        const root = ReactDOM.createRoot(rootElement);
        root.render(
          <React.StrictMode>
            <ErrorBoundary>
                <App />
            </ErrorBoundary>
          </React.StrictMode>
        );
    } catch (e) {
        console.error("Failed to mount React application:", e);
        rootElement.innerHTML = `<div style="padding:20px;text-align:center;color:red;"><h2>Critical Error</h2><p>Failed to initialize application.</p></div>`;
    }
} else {
    console.error("Root element not found");
}
