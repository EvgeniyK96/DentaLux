import { useMotionTemplate, useMotionValue, useReducedMotion, useSpring, useTransform } from 'motion/react';
import * as m from 'motion/react-m';
import Icon from './Icon.jsx';
import { EASE } from './motion.js';
import { useBooking } from '../booking/context.js';
import './Hero.css';

const TRUST = ['Гарантия на работы', 'Лечение без боли', 'Рассрочка 0%'];

const group = { hidden: {}, show: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } } };
const rise = { hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE } } };
// строки заголовка выезжают из-под маски
const line = { hidden: { y: '105%' }, show: { y: '0%', transition: { duration: 0.85, ease: EASE } } };
const photo = {
  hidden: { clipPath: 'inset(18% 0% 0% 0% round 36px)', scale: 1.06 },
  show: { clipPath: 'inset(0% 0% 0% 0% round 36px)', scale: 1, transition: { duration: 1.1, ease: EASE, delay: 0.15 } },
};
const shade = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 1, delay: 0.6 } } };
const pop = (delay) => ({
  hidden: { opacity: 0, scale: 0.85, y: 12 },
  show: { opacity: 1, scale: 1, y: 0, transition: { type: 'spring', stiffness: 260, damping: 20, delay } },
});

const TILT_SPRING = { stiffness: 150, damping: 16, mass: 0.6 };

// Фото с 3D-наклоном за курсором: карточки висят на разной глубине (параллакс),
// блик следует за указателем, тень уходит в противоположную сторону.
// Только для мыши — на тач-экранах и при «уменьшить движение» фото не наклоняется.
function TiltMedia({ state }) {
  const reduced = useReducedMotion();
  const px = useMotionValue(0); // положение курсора: -0.5…0.5
  const py = useMotionValue(0);
  const hover = useMotionValue(0);
  const rotateX = useSpring(useTransform(py, [-0.5, 0.5], [9, -9]), TILT_SPRING);
  const rotateY = useSpring(useTransform(px, [-0.5, 0.5], [-12, 12]), TILT_SPRING);
  const shadowX = useTransform(rotateY, (v) => -v * 2.4);
  const shadowY = useTransform(rotateX, (v) => v * 2.4);
  const glareX = useTransform(px, [-0.5, 0.5], [0, 100]);
  const glareY = useTransform(py, [-0.5, 0.5], [0, 100]);
  const glareOpacity = useSpring(hover, TILT_SPRING);
  const glare = useMotionTemplate`radial-gradient(circle at ${glareX}% ${glareY}%, rgba(255, 255, 255, 0.32), rgba(255, 255, 255, 0) 58%)`;

  const onMove = (e) => {
    if (reduced || e.pointerType !== 'mouse') return;
    const r = e.currentTarget.getBoundingClientRect();
    px.set((e.clientX - r.left) / r.width - 0.5);
    py.set((e.clientY - r.top) / r.height - 0.5);
    hover.set(1);
  };
  const onLeave = () => {
    px.set(0);
    py.set(0);
    hover.set(0);
  };

  return (
    <div className="hero__media" onPointerMove={onMove} onPointerLeave={onLeave}>
      <m.div className="hero__tilt" initial="hidden" animate={state} style={{ rotateX, rotateY }}>
        <m.span className="hero__shadow" aria-hidden="true" variants={shade} style={{ x: shadowX, y: shadowY, z: -60 }} />
        <m.div className="hero__photo" variants={photo}>
          <img
            src="https://images.unsplash.com/photo-1606811841689-23dfddce3e95?auto=format&fit=crop&w=900&q=80"
            alt="Улыбающаяся пациентка в кресле стоматолога"
            fetchPriority="high"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
          <m.span className="hero__glare" aria-hidden="true" style={{ backgroundImage: glare, opacity: glareOpacity }} />
        </m.div>
        <m.div className="hero__card hero__card--rating" variants={pop(0.75)} style={{ z: 45 }}>
          <strong>4.9</strong>
          <div>
            <div className="stars" aria-label="Рейтинг 4.9 из 5">★★★★★</div>
            <span>2 400+ отзывов</span>
          </div>
        </m.div>
        <m.div className="hero__card hero__card--slots" variants={pop(0.95)} style={{ z: 70 }}>
          <span className="hero__pulse" aria-hidden="true" />
          Есть свободное время сегодня
        </m.div>
      </m.div>
    </div>
  );
}

export default function Hero({ ready }) {
  const booking = useBooking();
  const state = ready ? 'show' : 'hidden';
  return (
    <section className="hero" id="top">
      <div className="container hero__inner">
        <m.div className="hero__content" variants={group} initial="hidden" animate={state}>
          <m.span className="hero__badge" variants={rise}>
            <span className="hero__badge-dot" aria-hidden="true" />
            Более 12 000 счастливых улыбок
          </m.span>
          <h1 className="hero__title">
            <span className="hero__line"><m.span variants={line}>Здоровая улыбка</m.span></span>
            <span className="hero__line"><m.span variants={line}>без боли и стресса</m.span></span>
          </h1>
          <m.p className="hero__lead" variants={rise}>
            Современная стоматология полного цикла в центре Алматы. Лечим бережно, честно
            и с пожизненной гарантией на имплантацию.
          </m.p>
          <m.div className="hero__cta" variants={rise}>
            <button type="button" className="btn btn--primary btn--lg" onClick={() => booking.open('Консультация')}>
              Записаться на приём
            </button>
            <a href="#treatment" className="btn btn--ghost btn--lg">
              <Icon name="cube" size={20} />
              Лечение в 3D
            </a>
          </m.div>
          <m.ul className="hero__trust" variants={rise}>
            {TRUST.map((t) => (
              <li key={t}><Icon name="check" size={18} strokeWidth={2.2} />{t}</li>
            ))}
          </m.ul>
        </m.div>

        <TiltMedia state={state} />
      </div>
    </section>
  );
}
