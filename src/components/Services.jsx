import * as m from 'motion/react-m';
import Icon from './Icon.jsx';
import SectionHead from './SectionHead.jsx';
import { reveal, rowDelay } from './motion.js';
import { SERVICES, tenge } from '../data/content.js';
import './Services.css';

export default function Services({ onShowScenario }) {
  return (
    <section className="section" id="services" aria-labelledby="services-title">
      <div className="container">
        <SectionHead
          id="services-title"
          title="Полный спектр стоматологии"
          lead="От профилактики до сложной имплантации — всё в одной клинике на современном оборудовании."
        />
        <ul className="services">
          {SERVICES.map((s, i) => (
            <m.li key={s.title} className="service" {...reveal(rowDelay(i, 3))}>
              <span className="service__icon"><Icon name={s.icon} size={26} /></span>
              <h3 className="service__title">{s.title}</h3>
              <p className="service__text">{s.text}</p>
              <div className="service__foot">
                <span className="service__price">{tenge(s.from, true)}</span>
                {s.scenario && (
                  <button type="button" className="link-btn" onClick={() => onShowScenario(s.scenario)}>
                    <Icon name="cube" size={18} />
                    Смотреть в 3D
                  </button>
                )}
              </div>
            </m.li>
          ))}
        </ul>
      </div>
    </section>
  );
}
