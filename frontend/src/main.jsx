import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'sonner';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { registerSW } from 'virtual:pwa-register';
import './index.css';

// Remove the initial HTML loader once React takes over
const loader = document.getElementById('initial-loader');
if (loader) {
  loader.style.opacity = '0';
  setTimeout(() => {
    loader.remove();
  }, 300);
}

// Register the service worker. `registerSW` from vite-plugin-pwa handles updates.
registerSW({ immediate: true });

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
        {/* Custom Toaster styles to match the new premium design */}
        <Toaster 
          position="top-center" 
          richColors 
          closeButton 
          toastOptions={{
            className: 'font-sans',
            style: {
              borderRadius: '12px',
              boxShadow: '0 10px 40px -10px rgba(0,0,0,0.1)',
            }
          }}
        />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);