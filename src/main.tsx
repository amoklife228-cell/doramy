import React from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { applyAppearance, loadAppearance } from './lib/appearance';
import './styles.css';

applyAppearance(loadAppearance());
registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
