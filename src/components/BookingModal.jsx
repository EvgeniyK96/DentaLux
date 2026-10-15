import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence } from 'motion/react';
import * as m from 'motion/react-m';
import Icon from './Icon.jsx';
import { BOOKING_SERVICES, CLINIC } from '../data/content.js';
import { formatPhone, isPhoneComplete } from '../utils/phone.js';
import './BookingModal.css';

const FOCUSABLE = 'button:not([disabled]), input, select, textarea, a[href]';

function validate(form) {
  const errors = {};
  if (form.name.trim().length < 2) errors.name = 'Напишите, как к вам обращаться';
  if (!isPhoneComplete(form.phone)) errors.phone = 'Введите номер полностью: +7 (7XX) XXX-XX-XX';
  return errors;
}

function Dialog({ service, onClose }) {
  const dialogRef = useRef(null);
  const ids = useId();
  const [form, setForm] = useState({ name: '', phone: '', service });
  const [errors, setErrors] = useState({});
  const [sent, setSent] = useState(false);

  // Фокус внутри окна, Esc, блокировка прокрутки страницы, возврат фокуса после закрытия
  useEffect(() => {
    const opener = document.activeElement;
    const root = document.documentElement;
    const prevOverflow = root.style.overflow;
    root.style.overflow = 'hidden';
    dialogRef.current.querySelector('input')?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key !== 'Tab') return;
      const items = [...dialogRef.current.querySelectorAll(FOCUSABLE)];
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      root.style.overflow = prevOverflow;
      opener?.focus?.({ preventScroll: true });
    };
  }, [onClose]);

  useEffect(() => {
    if (sent) dialogRef.current.querySelector('.modal__done button')?.focus();
  }, [sent]);

  const update = (field, value) => {
    const next = { ...form, [field]: value };
    setForm(next);
    if (errors[field]) setErrors((e) => ({ ...e, [field]: validate(next)[field] }));
  };

  const submit = (e) => {
    e.preventDefault();
    const found = validate(form);
    setErrors(found);
    const firstInvalid = Object.keys(found)[0];
    if (firstInvalid) {
      dialogRef.current.querySelector(`[name="${firstInvalid}"]`)?.focus();
      return;
    }
    // Демо: заявка никуда не уходит. Подключите отправку (CRM, Telegram-бот, почта) здесь.
    setSent(true);
  };

  return (
    <div className="modal" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <m.div
        className="modal__backdrop"
        aria-hidden="true"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
      />
      <m.div
        ref={dialogRef}
        className="modal__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${ids}-title`}
        initial={{ opacity: 0, y: 28, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
      >
        <button type="button" className="modal__close" onClick={onClose} aria-label="Закрыть окно записи">
          <Icon name="close" size={22} />
        </button>

        {sent ? (
          <div className="modal__done">
            <svg className="modal__check" viewBox="0 0 52 52" aria-hidden="true">
              <circle cx="26" cy="26" r="24" />
              <m.path d="M15 27l7 7 15-16" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.5, delay: 0.15 }} />
            </svg>
            <h2 id={`${ids}-title`}>Заявка отправлена</h2>
            <p>
              Администратор перезвонит на номер {form.phone} в течение 15 минут
              {form.service ? <> и запишет вас: «{form.service}»</> : null}.
            </p>
            <button type="button" className="btn btn--primary btn--block" onClick={onClose}>Хорошо</button>
          </div>
        ) : (
          <form className="modal__form" onSubmit={submit} noValidate>
            <h2 id={`${ids}-title`}>Запись на приём</h2>
            <p className="modal__lead">Оставьте контакты — перезвоним в течение 15 минут и подберём удобное время.</p>

            <div className="field">
              <label htmlFor={`${ids}-name`}>Ваше имя</label>
              <input
                id={`${ids}-name`}
                name="name"
                type="text"
                autoComplete="name"
                placeholder="Как к вам обращаться"
                value={form.name}
                onChange={(e) => update('name', e.target.value)}
                aria-invalid={!!errors.name}
                aria-describedby={errors.name ? `${ids}-name-err` : undefined}
              />
              {errors.name && <span className="field__error" id={`${ids}-name-err`}>{errors.name}</span>}
            </div>

            <div className="field">
              <label htmlFor={`${ids}-phone`}>Телефон</label>
              <input
                id={`${ids}-phone`}
                name="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="+7 (7__) ___-__-__"
                value={form.phone}
                onChange={(e) => update('phone', formatPhone(e.target.value))}
                aria-invalid={!!errors.phone}
                aria-describedby={errors.phone ? `${ids}-phone-err` : undefined}
              />
              {errors.phone && <span className="field__error" id={`${ids}-phone-err`}>{errors.phone}</span>}
            </div>

            <div className="field">
              <label htmlFor={`${ids}-service`}>Услуга</label>
              <select id={`${ids}-service`} name="service" value={form.service} onChange={(e) => update('service', e.target.value)}>
                <option value="">Пока не знаю — нужна консультация</option>
                {BOOKING_SERVICES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <button type="submit" className="btn btn--primary btn--lg btn--block">Отправить заявку</button>
            <p className="modal__policy">Нажимая кнопку, вы соглашаетесь с политикой обработки персональных данных.</p>
            <p className="modal__call">Или позвоните: <a href={CLINIC.phoneHref}>{CLINIC.phone}</a></p>
          </form>
        )}
      </m.div>
    </div>
  );
}

export default function BookingModal({ open, service, onClose }) {
  return createPortal(
    <AnimatePresence>{open && <Dialog key="booking" service={service} onClose={onClose} />}</AnimatePresence>,
    document.body,
  );
}
