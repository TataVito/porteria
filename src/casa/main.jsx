import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import '@fontsource/dm-sans/700.css';
import '@fontsource/dm-mono/400.css';
import '@fontsource/dm-mono/500.css';
import '../index.css';
import CasaApp from './CasaApp.jsx';

// Mismo service worker que Portería (vive en la raíz y cubre ambas apps).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('../sw.js', { scope: '../' }).catch(() => {}));
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <CasaApp />
  </StrictMode>,
);
