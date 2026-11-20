import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

// Register Service Worker for offline PWA in production
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        const notifyUpdate = () => {
          window.dispatchEvent(
            new CustomEvent('maicitos:sw-updated', { detail: registration })
          );
        };

        if (registration.waiting) {
          notifyUpdate();
        }

        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              notifyUpdate();
            }
          });
        });

        navigator.serviceWorker.ready.then(() => {
          window.dispatchEvent(new CustomEvent('maicitos:offline-ready'));
        });
      })
      .catch((err) => {
        console.warn('SW registration error:', err);
      });
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
