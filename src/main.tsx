import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.js';
import './App.css';
import { syncTime } from './lib/ntp.js';

// Transparent background when inside an iframe (Sphere)
if (window.self !== window.top) {
  document.documentElement.classList.add('in-iframe');
}

// Sync local clock with a remote time source (best-effort, non-blocking)
syncTime();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
