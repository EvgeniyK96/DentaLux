import * as m from 'motion/react-m';
import Icon from './Icon.jsx';
import { reveal } from './motion.js';
import { useBooking } from '../booking/context.js';
import { CLINIC } from '../data/content.js';
import './CtaBand.css';

export default function CtaBand() {
  const booking = useBooking();
  return (
    <section className="cta" id="contacts" aria-labelledby="cta-title">
      <div className="container">
        <m.div className="cta__inner" {...reveal()}>
        <div className="cta__text">
          <h2 id="cta-title">Запишитесь на бесплатную консультацию</h2>
          <p>Оставьте контакты — администратор перезвонит в течение 15 минут, ответит на вопросы и подберёт удобное время визита.</p>
          <button type="button" className="btn btn--light btn--lg" onClick={() => booking.open('Консультация')}>
            Записаться на приём
          </button>
        </div>
        <ul className="cta__contacts">
          <li><Icon name="pin" size={22} /><span>{CLINIC.address}</span></li>
          <li><Icon name="clock" size={22} /><span>{CLINIC.hours}</span></li>
          <li><Icon name="phone" size={22} /><a href={CLINIC.phoneHref}>{CLINIC.phone}</a></li>
        </ul>
        </m.div>
      </div>
    </section>
  );
}
