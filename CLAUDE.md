# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Landing site for the dental clinic «ДентаЛюкс» (Almaty, Kazakhstan; prices in tenge ₸). It is built with React 19, Vite and the `motion` animation library, and has a lightweight 3D jaw block made with three.js. The user writes in Russian. All site content, alt text and most code comments are in Russian, so keep new user-facing text in Russian.

## Commands

```bash
npm install
npm run dev       # http://127.0.0.1:5174
npm run build     # dist/
npm run preview
npm run lint      # ESLint 10 flat config (react-hooks v7 + react-refresh)
npm run bake      # regenerate src/jaw3d/data/jaw.{bin,json} from tools/jaw-anatomy (~10 s)
```

There are no tests. To verify a change, run the site and check it with the Playwright MCP browser; the `preview-site` skill describes how, including the screenshot pitfalls. Changes to the 3D block are covered by the `jaw-scenario` skill.

## Architecture

- `index.html` contains an **inline SVG/CSS tooth preloader**, so it shows before any JS loads. `src/hooks/usePageReady.js` removes it once these are all true: the page has loaded, fonts are ready, and at least 1.9 s have passed (hard cap 4.5 s). The resulting `ready` flag also starts the hero entrance animation.
- `src/main.jsx` imports `styles/global.css` **before** `App`. Component CSS files (`src/components/*.css`, BEM class names) must come later in the bundle so they can override the global `.btn` and similar rules. Keep that import order.
- `src/data/content.js` is the single source of all texts, prices (numbers formatted by `tenge()`), doctors, FAQ and the list of booking services. `CLINIC` holds the address and phone.
- Animation: the app is wrapped in `<LazyMotion features={domAnimation} strict>`, so use `import * as m from 'motion/react-m'` and `m.div`. `motion.div` throws in strict mode. Every content block reveals on its own when scrolled into view: spread `{...reveal(delay)}` from `src/components/motion.js` onto the `m.*` element, and use `rowDelay(i, columns)` for a cascade within a grid row. Avoid parent-level stagger, which reveals a whole column at once on mobile. The hero photo's 3D tilt (`TiltMedia` in `Hero.jsx`) uses motion values and springs, so it doesn't re-render React. It reacts only to `pointerType === 'mouse'`. `MotionConfig reducedMotion="user"` is on, and `global.css` also cuts CSS animations under `prefers-reduced-motion`.
- Booking is a modal, not a page section. `src/booking/BookingProvider.jsx` renders `BookingModal` through a portal. Any component calls `useBooking().open(service?)`, where `service` must be a value from `BOOKING_SERVICES`. The form is a demo: submitting only shows a success state. The submission hook-up point is marked in `BookingModal.jsx`. The phone mask is in `src/utils/phone.js` (`+7 (7XX) XXX-XX-XX`).
- 3D block. `App` holds `selection` (`{ id }`, a new object on every pick so that re-selecting restarts the scenario). Services' «Смотреть в 3D» links and the topic tabs set it.
  - `JawSection.jsx` mounts the lazy `jaw3d/JawCanvas.jsx` only when the section is within 800 px of the viewport. Stage autoplay is driven by the CSS progress-bar animation's `onAnimationEnd`, which keeps pause and resume in sync.
  - `jaw3d/JawScene.js` is an imperative three.js scene. It renders only while visible, has no post-processing, and shows no user controls: the camera flies and sways by itself.
  - The heavy procedural generator is **not** shipped. `scripts/bake-jaw.mjs` meshes the SDFs from `tools/jaw-anatomy/`, which is copied from `/home/evgeniy/СайтыФриланс/jaw`. It simplifies and quantizes the meshes and meshopt-encodes them into one ~0.95 MB `.bin`. `loadJawData.js` decodes it with three's `MeshoptDecoder`.
- `public/` holds the favicon only. Hero and doctor photos are hot-linked from Unsplash, with gradient or initials fallbacks.

## Gotchas

- `scenarios.js` stays in the main bundle, so it must not import three.js. Only `JawCanvas.jsx` may pull in `JawScene`, `loadJawData` or `three`.
- Toggling a material's `transparent` flag (X-ray, fades) switches three's `OPAQUE` shader variant. `JawScene.warmup()` precompiles both variants and the extras. Add any new material or extra there as well, or it will stutter on first use.
- At breakpoints, grid children that hold horizontal scrollers need `min-width: 0`, and flex/grid properties such as `align-items` carry over from wider media queries. Both caused mobile horizontal overflow before.
- `tools/` is excluded from ESLint and from the browser bundle. It is used only at bake time.
