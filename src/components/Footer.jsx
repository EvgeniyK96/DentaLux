import * as m from 'motion/react-m';
import Logo from './Logo.jsx';
import { reveal } from './motion.js';
import { CLINIC } from '../data/content.js';
import './Footer.css';

export default function Footer() {
  return (
    <footer className="footer on-dark">
      <div className="container footer__inner">
        <m.div className="footer__brand" {...reveal(0, 0.4)}>
          <Logo light />
          <p>Современная стоматология полного цикла. Заботимся о вашей улыбке с {CLINIC.since} года.</p>
        </m.div>
        <m.nav className="footer__col" aria-label="Услуги" {...reveal(0.08, 0.4)}>
          <h4>Услуги</h4>
          <a href="#services">Терапия</a>
          <a href="#services">Имплантация</a>
          <a href="#services">Виниры</a>
          <a href="#services">Отбеливание</a>
        </m.nav>
        <m.nav className="footer__col" aria-label="Клиника" {...reveal(0.16, 0.4)}>
          <h4>Клиника</h4>
          <a href="#treatment">Лечение в 3D</a>
          <a href="#doctors">Врачи</a>
          <a href="#prices">Цены</a>
          <a href="#faq">Вопросы</a>
        </m.nav>
        <m.div className="footer__col" {...reveal(0.24, 0.4)}>
          <h4>Контакты</h4>
          <a href={CLINIC.phoneHref}>{CLINIC.phone}</a>
          <a href={`mailto:${CLINIC.email}`}>{CLINIC.email}</a>
          <span>{CLINIC.address}</span>
          <span>{CLINIC.hours}</span>
        </m.div>
      </div>
      <div className="container">
        <div className="footer__bottom">
          <span>© {new Date().getFullYear()} {CLINIC.name}. Все права защищены.</span>
          <span>{CLINIC.license}</span>
        </div>
      </div>
    </footer>
  );
}
