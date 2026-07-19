/* ДентаЛюкс — интерактив лендинга */
(function () {
  'use strict';

  /* --- Header тень при скролле --- */
  const header = document.getElementById('header');
  const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 8);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  /* --- Мобильное меню --- */
  const burger = document.getElementById('burger');
  const nav = document.getElementById('nav');
  const toggleNav = (open) => {
    const isOpen = open ?? !nav.classList.contains('is-open');
    nav.classList.toggle('is-open', isOpen);
    burger.classList.toggle('is-open', isOpen);
    burger.setAttribute('aria-expanded', String(isOpen));
  };
  burger.addEventListener('click', () => toggleNav());
  nav.addEventListener('click', (e) => { if (e.target.matches('.nav__link')) toggleNav(false); });

  /* --- Before / After слайдеры --- */
  document.querySelectorAll('[data-ba]').forEach((item) => {
    const range = item.querySelector('.ba__range');
    const before = item.querySelector('.ba__before');
    const handle = item.querySelector('.ba__handle');
    const update = () => {
      const v = range.value;
      before.style.clipPath = 'inset(0 ' + (100 - v) + '% 0 0)';
      handle.style.left = v + '%';
    };
    range.addEventListener('input', update);
    update();
  });

  /* --- Карусель отзывов --- */
  const track = document.getElementById('reviews-track');
  const prev = document.getElementById('rev-prev');
  const next = document.getElementById('rev-next');
  if (track && prev && next) {
    const step = () => {
      const card = track.querySelector('.review');
      return card ? card.getBoundingClientRect().width + 24 : 320;
    };
    prev.addEventListener('click', () => track.scrollBy({ left: -step(), behavior: 'smooth' }));
    next.addEventListener('click', () => track.scrollBy({ left: step(), behavior: 'smooth' }));
  }

  /* --- Маска телефона --- */
  const phone = document.getElementById('phone');
  if (phone) {
    phone.addEventListener('input', () => {
      let d = phone.value.replace(/\D/g, '');
      if (d.startsWith('8')) d = '7' + d.slice(1);
      if (!d.startsWith('7')) d = '7' + d;
      d = d.slice(0, 11);
      let out = '+7';
      if (d.length > 1) out += ' (' + d.slice(1, 4);
      if (d.length >= 4) out += ') ' + d.slice(4, 7);
      if (d.length >= 7) out += '-' + d.slice(7, 9);
      if (d.length >= 9) out += '-' + d.slice(9, 11);
      phone.value = out;
    });
  }

  /* --- Отправка формы (демо) --- */
  const form = document.getElementById('booking-form');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!form.reportValidity()) return;
      const success = document.getElementById('form-success');
      form.querySelector('button[type="submit"]').disabled = true;
      if (success) success.hidden = false;
      form.reset();
      setTimeout(() => { form.querySelector('button[type="submit"]').disabled = false; }, 4000);
    });
  }

  /* --- Плавное появление секций --- */
  if ('IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.style.opacity = '1';
          entry.target.style.transform = 'none';
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });

    document.querySelectorAll('.service-card, .why__card, .doctor, .ba__item, .stat').forEach((el, i) => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(24px)';
      el.style.transition = `opacity .5s ease ${(i % 6) * 60}ms, transform .5s ease ${(i % 6) * 60}ms`;
      io.observe(el);
    });
  }
})();
