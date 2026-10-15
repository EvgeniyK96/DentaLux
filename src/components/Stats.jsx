import { useEffect, useRef } from 'react';
import { useInView, useReducedMotion } from 'motion/react';
import * as m from 'motion/react-m';
import { reveal, rowDelay } from './motion.js';
import { STATS } from '../data/content.js';
import './Stats.css';

const format = new Intl.NumberFormat('ru-RU');

function Counter({ value, suffix = '' }) {
  const ref = useRef(null);
  const seen = useInView(ref, { once: true, margin: '0px 0px -10% 0px' });
  const reduced = useReducedMotion();
  useEffect(() => {
    const el = ref.current;
    if (!seen || reduced) {
      el.textContent = format.format(value) + suffix;
      return;
    }
    // счётчик на rAF: easeOutExpo за 1.6 с
    const start = performance.now();
    let raf = 0;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / 1600);
      const k = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
      el.textContent = format.format(Math.round(value * k)) + suffix;
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [seen, reduced, value, suffix]);
  return <strong ref={ref} className="stat__value">{format.format(value) + suffix}</strong>;
}

export default function Stats() {
  return (
    <section className="stats on-dark" aria-label="Клиника в цифрах">
      <ul className="container stats__grid">
        {STATS.map((s, i) => (
          <m.li key={s.label} className="stat" {...reveal(rowDelay(i, 4))}>
            <Counter value={s.value} suffix={s.suffix} />
            <span className="stat__label">{s.label}</span>
          </m.li>
        ))}
      </ul>
    </section>
  );
}
