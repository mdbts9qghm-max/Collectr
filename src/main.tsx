import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import './index.css';

/**
 * Den Service Worker der alten Fassung abräumen.
 *
 * Die gelöschte App war eine PWA. Ihr Service Worker liegt auf jedem Gerät, das
 * sie einmal geöffnet hat, und serviert sie aus dem Cache weiter — auch wenn
 * der Server längst etwas anderes ausliefert. Ohne diese Zeilen wäre die App
 * auf dem Handy unverändert da, und zwar auf unbestimmte Zeit.
 *
 * Das hier läuft einmal, meldet ihn ab und leert seine Caches. Wenn die neue
 * Fassung wieder eine PWA wird, registriert sie ihren eigenen — bis dahin ist
 * es richtig, dass keiner läuft.
 */
if ('serviceWorker' in navigator) {
  void navigator.serviceWorker.getRegistrations().then((regs) => {
    for (const reg of regs) void reg.unregister();
  });
  if ('caches' in window) {
    void caches.keys().then((keys) => {
      for (const key of keys) void caches.delete(key);
    });
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
