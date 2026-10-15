import { useEffect, useState } from 'react';

// Прелоадер (разметка в index.html) убираем, когда страница загрузилась, шрифты готовы
// и анимация зуба успела отыграть. Дольше MAX_MS не держим ни при каких условиях.
const MIN_MS = 1900;
const MAX_MS = 4500;

function hidePreloader() {
  const el = document.getElementById('preloader');
  if (!el) return;
  el.classList.add('is-done');
  setTimeout(() => el.remove(), 700);
}

export function usePageReady() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const wait = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));
    const loaded = document.readyState === 'complete' ? Promise.resolve() : new Promise((r) => window.addEventListener('load', r, { once: true }));
    const fonts = document.fonts ? document.fonts.ready : Promise.resolve();
    // performance.now() отсчитывается от начала навигации — тогда же стартует анимация прелоадера
    const all = Promise.all([loaded, fonts, wait((reduced ? 300 : MIN_MS) - performance.now())]);
    Promise.race([all, wait(MAX_MS - performance.now())]).then(() => {
      if (cancelled) return;
      hidePreloader();
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return ready;
}
