// Общие анимации. Каждый блок проявляется сам, когда доезжает до экрана:
// <m.li {...reveal(delay)}>. delay — небольшой сдвиг для блоков одного ряда.
export const EASE = [0.2, 0.7, 0.2, 1];

export const fadeUp = {
  hidden: { opacity: 0, y: 32 },
  show: (delay = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.75, ease: EASE, delay } }),
};

// amount — какая доля блока должна попасть в экран, чтобы запустить появление
export const reveal = (delay = 0, amount = 0.2) => ({
  variants: fadeUp,
  custom: delay,
  initial: 'hidden',
  whileInView: 'show',
  viewport: { once: true, amount },
});

// Задержка для блоков в сетке: каскад внутри ряда, следующий ряд снова с нуля
export const rowDelay = (index, columns, step = 0.08) => (index % columns) * step;
