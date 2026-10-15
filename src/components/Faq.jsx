import { useState } from 'react';
import { AnimatePresence } from 'motion/react';
import * as m from 'motion/react-m';
import Icon from './Icon.jsx';
import SectionHead from './SectionHead.jsx';
import { EASE, reveal } from './motion.js';
import { FAQ } from '../data/content.js';
import './Faq.css';

export default function Faq() {
  const [open, setOpen] = useState(null);
  return (
    <section className="section" id="faq" aria-labelledby="faq-title">
      <div className="container faq">
        <SectionHead id="faq-title" title="Частые вопросы" />
        <ul className="faq__list">
          {FAQ.map((item, i) => {
            const isOpen = open === i;
            return (
              <m.li key={item.q} className={'faq__item' + (isOpen ? ' is-open' : '')} {...reveal(Math.min(i, 4) * 0.06, 0.5)}>
                <h3>
                  <button
                    type="button"
                    className="faq__q"
                    aria-expanded={isOpen}
                    aria-controls={`faq-a-${i}`}
                    onClick={() => setOpen(isOpen ? null : i)}
                  >
                    {item.q}
                    <Icon name="plus" size={22} />
                  </button>
                </h3>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <m.div
                      id={`faq-a-${i}`}
                      className="faq__a"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.35, ease: EASE }}
                    >
                      <p>{item.a}</p>
                    </m.div>
                  )}
                </AnimatePresence>
              </m.li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
