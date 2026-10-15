import * as m from 'motion/react-m';
import Icon from './Icon.jsx';
import SectionHead from './SectionHead.jsx';
import { reveal, rowDelay } from './motion.js';
import { REASONS } from '../data/content.js';
import './Reasons.css';

export default function Reasons() {
  return (
    <section className="section" id="why" aria-labelledby="why-title">
      <div className="container">
        <SectionHead id="why-title" title="Почему пациенты выбирают нас" />
        <ul className="reasons">
          {REASONS.map((r, i) => (
            <m.li key={r.title} className="reason" {...reveal(rowDelay(i, 3))}>
              <Icon name={r.icon} size={28} />
              <h3>{r.title}</h3>
              <p>{r.text}</p>
            </m.li>
          ))}
        </ul>
      </div>
    </section>
  );
}
