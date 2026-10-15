import { useEffect, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import * as m from 'motion/react-m';
import Logo from './Logo.jsx';
import Icon from './Icon.jsx';
import { useBooking } from '../booking/context.js';
import { CLINIC } from '../data/content.js';
import './Header.css';

const NAV = [
  { href: '#services', label: 'Услуги' },
  { href: '#treatment', label: 'Лечение в 3D' },
  { href: '#doctors', label: 'Врачи' },
  { href: '#prices', label: 'Цены' },
  { href: '#reviews', label: 'Отзывы' },
  { href: '#faq', label: 'Вопросы' },
];

export default function Header() {
  const booking = useBooking();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e) => e.key === 'Escape' && setMenuOpen(false);
    const onResize = () => window.innerWidth > 960 && setMenuOpen(false);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
    };
  }, [menuOpen]);

  return (
    <header className={'header' + (scrolled || menuOpen ? ' is-scrolled' : '')}>
      <div className="container header__inner">
        <Logo />
        <nav className="header__nav" aria-label="Главное меню">
          {NAV.map((item) => (
            <a key={item.href} href={item.href} className="header__link">{item.label}</a>
          ))}
        </nav>
        <div className="header__actions">
          <a href={CLINIC.phoneHref} className="header__phone">
            <Icon name="phone" size={18} />
            <span>{CLINIC.phone}</span>
          </a>
          <button type="button" className="btn btn--primary btn--sm header__cta" onClick={() => booking.open()}>
            Записаться
          </button>
          <button
            type="button"
            className={'burger' + (menuOpen ? ' is-open' : '')}
            aria-label={menuOpen ? 'Закрыть меню' : 'Открыть меню'}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            onClick={() => setMenuOpen((v) => !v)}
          >
            <span /><span /><span />
          </button>
        </div>
      </div>

      <AnimatePresence>
        {menuOpen && (
          <m.nav
            id="mobile-menu"
            className="mobile-menu"
            aria-label="Меню"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25 }}
          >
            <div className="container mobile-menu__inner">
              {NAV.map((item) => (
                <a key={item.href} href={item.href} className="mobile-menu__link" onClick={() => setMenuOpen(false)}>
                  {item.label}
                </a>
              ))}
              <a href={CLINIC.phoneHref} className="mobile-menu__phone">
                <Icon name="phone" size={18} /> {CLINIC.phone}
              </a>
              <button
                type="button"
                className="btn btn--primary btn--block"
                onClick={() => {
                  setMenuOpen(false);
                  booking.open();
                }}
              >
                Записаться на приём
              </button>
            </div>
          </m.nav>
        )}
      </AnimatePresence>
    </header>
  );
}
