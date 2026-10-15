import { useRef } from 'react';
import * as m from 'motion/react-m';
import Icon from './Icon.jsx';
import SectionHead from './SectionHead.jsx';
import { reveal, rowDelay } from './motion.js';
import { REVIEWS } from '../data/content.js';
import './Reviews.css';

export default function Reviews() {
  const track = useRef(null);
  const scroll = (dir) => {
    const el = track.current;
    const card = el.querySelector('.review');
    el.scrollBy({ left: dir * (card ? card.getBoundingClientRect().width + 20 : 320), behavior: 'smooth' });
  };
  return (
    <section className="section section--tint" id="reviews" aria-labelledby="reviews-title">
      <div className="container">
        <div className="reviews__head">
          <SectionHead id="reviews-title" title="Что говорят пациенты" />
          <div className="reviews__nav">
            <button type="button" className="reviews__btn" onClick={() => scroll(-1)} aria-label="Предыдущие отзывы"><Icon name="left" size={20} /></button>
            <button type="button" className="reviews__btn" onClick={() => scroll(1)} aria-label="Следующие отзывы"><Icon name="right" size={20} /></button>
          </div>
        </div>
        <ul className="reviews" ref={track}>
          {REVIEWS.map((r, i) => (
            <m.li key={r.name} className="review" {...reveal(rowDelay(i, 3))}>
              <blockquote>
                <div className="stars" aria-label="Оценка 5 из 5">★★★★★</div>
                <p>{r.text}</p>
                <footer>
                  <strong>{r.name}</strong>
                  <span>{r.topic}</span>
                </footer>
              </blockquote>
            </m.li>
          ))}
        </ul>
      </div>
    </section>
  );
}
