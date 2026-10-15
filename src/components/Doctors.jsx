import { useState } from 'react';
import * as m from 'motion/react-m';
import SectionHead from './SectionHead.jsx';
import { reveal, rowDelay } from './motion.js';
import { DOCTORS } from '../data/content.js';
import './Doctors.css';

function Photo({ src, name }) {
  const [failed, setFailed] = useState(false);
  const initials = name.split(' ').map((w) => w[0]).join('');
  return (
    <div className="doctor__photo">
      {failed ? (
        <span className="doctor__initials" aria-hidden="true">{initials}</span>
      ) : (
        <img src={src} alt={name} loading="lazy" onError={() => setFailed(true)} />
      )}
    </div>
  );
}

export default function Doctors() {
  return (
    <section className="section section--tint" id="doctors" aria-labelledby="doctors-title">
      <div className="container">
        <SectionHead
          id="doctors-title"
          title="Врачи, которым доверяют"
          lead="Опытные специалисты с профильным образованием, которые регулярно повышают квалификацию."
        />
        <ul className="doctors">
          {DOCTORS.map((d, i) => (
            <m.li key={d.name} className="doctor" {...reveal(rowDelay(i, 4))}>
              <Photo src={d.photo} name={d.name} />
              <h3>{d.name}</h3>
              <span className="doctor__role">{d.role}</span>
              <p className="doctor__exp">{d.exp}</p>
            </m.li>
          ))}
        </ul>
      </div>
    </section>
  );
}
