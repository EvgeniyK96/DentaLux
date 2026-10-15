import * as m from 'motion/react-m';
import { reveal } from './motion.js';
import { useBooking } from '../booking/context.js';
import { PRICES, tenge } from '../data/content.js';
import './Prices.css';

export default function Prices() {
  const booking = useBooking();
  return (
    <section className="section" id="prices" aria-labelledby="prices-title">
      <div className="container prices">
        <m.div className="prices__intro" {...reveal()}>
          <h2 className="section-head__title" id="prices-title">Цены на популярные услуги</h2>
          <p className="section-head__lead">Первичная консультация и план лечения — бесплатно. Стоимость фиксируем в договоре до начала лечения.</p>
          <button type="button" className="btn btn--primary prices__cta" onClick={() => booking.open('Консультация')}>
            Записаться на консультацию
          </button>
          <p className="prices__note">Полный прайс уточняйте у администратора. Действует рассрочка 0%.</p>
        </m.div>
        <ul className="price-list">
          {PRICES.map((p, i) => (
            <m.li key={p.name} className={'price' + (p.hit ? ' price--hit' : '') + (p.price === 0 ? ' price--free' : '')} {...reveal(Math.min(i, 4) * 0.05, 0.5)}>
              <span className="price__name">
                {p.name}
                {p.hit && <em className="price__tag">Хит</em>}
              </span>
              <span className="price__dots" aria-hidden="true" />
              <span className="price__value">{tenge(p.price, p.from)}</span>
            </m.li>
          ))}
        </ul>
      </div>
    </section>
  );
}
