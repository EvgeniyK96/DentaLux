import { lazy, Suspense, useRef, useState } from 'react';
import { AnimatePresence, useInView, useReducedMotion } from 'motion/react';
import * as m from 'motion/react-m';
import Icon from './Icon.jsx';
import SectionHead from './SectionHead.jsx';
import { reveal } from './motion.js';
import { SCENARIOS, STAGE_MS } from '../jaw3d/scenarios.js';
import { useBooking } from '../booking/context.js';
import './JawSection.css';

// three.js и модель — отдельный чанк, грузится только рядом с блоком
const JawCanvas = lazy(() => import('../jaw3d/JawCanvas.jsx'));

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

export default function JawSection({ selection, onSelect }) {
  const booking = useBooking();
  const reduced = useReducedMotion();
  const scenario = SCENARIOS.find((s) => s.id === selection.id) || SCENARIOS[0];
  const last = scenario.stages.length - 1;

  const [stage, setStage] = useState(0);
  // auto — автопоказ; paused — пауза (прогресс шага замирает); manual — пользователь листает сам
  const [mode, setMode] = useState('auto');
  const [run, setRun] = useState(0); // перезапуск анимации прогресса шага
  const [prevSelection, setPrevSelection] = useState(selection);
  if (prevSelection !== selection) {
    setPrevSelection(selection);
    setStage(0);
    setMode('auto');
    setRun((r) => r + 1);
  }

  const stageRef = useRef(null);
  const near = useInView(stageRef, { once: true, margin: '800px 0px' });
  const visible = useInView(stageRef);
  const [webgl] = useState(hasWebGL);
  const [status, setStatus] = useState(webgl ? 'loading' : 'unsupported');
  const [progress, setProgress] = useState(0);

  const ready = status === 'ready' || status === 'unsupported';
  const atEnd = stage >= last;
  const timed = !reduced && mode !== 'manual' && !atEnd;
  const running = timed && mode === 'auto' && ready && visible;
  const current = scenario.stages[stage];

  const goTo = (i) => {
    setStage(i);
    setMode('manual');
  };
  const togglePlay = () => {
    if (atEnd) setStage(0);
    if (atEnd || mode === 'manual') setRun((r) => r + 1);
    setMode(mode === 'auto' && !atEnd ? 'paused' : 'auto');
  };

  return (
    <section className="section section--tint jaw" id="treatment" aria-labelledby="treatment-title">
      <div className="container">
        <SectionHead
          id="treatment-title"
          title="Как мы лечим — в 3D"
          lead="Выберите тему: модель сама повернётся к нужному зубу и покажет лечение шаг за шагом."
        />

        <div className="jaw__layout">
          <m.div className="jaw__stage" ref={stageRef} {...reveal(0, 0.15)}>
            {webgl && near && (
              <Suspense fallback={null}>
                <JawCanvas
                  scenario={scenario}
                  stageIndex={stage}
                  active={visible}
                  onProgress={setProgress}
                  onReady={() => setStatus('ready')}
                  onError={() => setStatus('error')}
                />
              </Suspense>
            )}
            <AnimatePresence>
              {status !== 'ready' && (
                <m.div className="jaw__placeholder" initial={false} exit={{ opacity: 0 }} transition={{ duration: 0.5 }}>
                  <Icon name="tooth" size={48} strokeWidth={1.4} />
                  {status === 'loading' && (
                    <>
                      <span>Загружаем 3D-модель</span>
                      <span className="jaw__progress" aria-hidden="true">
                        <span style={{ transform: `scaleX(${Math.max(0.04, progress)})` }} />
                      </span>
                    </>
                  )}
                  {status === 'unsupported' && <span>Ваш браузер не показывает 3D. Описание лечения — рядом.</span>}
                  {status === 'error' && <span>Не удалось загрузить 3D-модель. Обновите страницу, чтобы попробовать снова.</span>}
                </m.div>
              )}
            </AnimatePresence>
          </m.div>

          <div className="jaw__panel">
            <m.div className="jaw__topics" role="tablist" aria-label="Темы лечения" {...reveal(0.1)}>
              {SCENARIOS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  role="tab"
                  id={`jaw-tab-${s.id}`}
                  aria-selected={s.id === scenario.id}
                  aria-controls="jaw-panel"
                  className={'jaw__topic' + (s.id === scenario.id ? ' is-active' : '')}
                  onClick={() => onSelect(s.id)}
                >
                  <span className="jaw__topic-title">{s.title}</span>
                  <span className="jaw__topic-hint">{s.hint}</span>
                </button>
              ))}
            </m.div>

            <m.div className="jaw__info" id="jaw-panel" role="tabpanel" aria-labelledby={`jaw-tab-${scenario.id}`} {...reveal(0.2)}>
              <ol className="jaw__steps">
                {scenario.stages.map((st, i) => (
                  <li key={st.title}>
                    <button
                      type="button"
                      className={'jaw__step' + (i < stage ? ' is-done' : '') + (i === stage ? ' is-current' : '')}
                      aria-label={`Шаг ${i + 1}: ${st.title}`}
                      aria-current={i === stage ? 'step' : undefined}
                      onClick={() => goTo(i)}
                    >
                      {i === stage && timed && (
                        <span
                          key={`${scenario.id}-${i}-${run}`}
                          className="jaw__step-fill"
                          style={{ animationDuration: `${STAGE_MS}ms`, animationPlayState: running ? 'running' : 'paused' }}
                          onAnimationEnd={() => setStage((s) => Math.min(s + 1, last))}
                        />
                      )}
                    </button>
                  </li>
                ))}
              </ol>

              <AnimatePresence mode="wait" initial={false}>
                <m.div
                  key={scenario.id + stage}
                  className="jaw__text"
                  aria-live="polite"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.3 }}
                >
                  <span className="jaw__count">Шаг {stage + 1} из {last + 1}</span>
                  <h3>{current.title}</h3>
                  <p>{current.text}</p>
                </m.div>
              </AnimatePresence>

              <div className="jaw__controls">
                <button type="button" className="jaw__play" onClick={togglePlay} aria-label={atEnd ? 'Показать заново' : mode === 'auto' ? 'Пауза' : 'Продолжить показ'}>
                  <Icon name={atEnd ? 'replay' : mode === 'auto' ? 'pause' : 'play'} size={20} strokeWidth={2} />
                </button>
                <div className="jaw__nav">
                  <button type="button" className="jaw__arrow" onClick={() => goTo(stage - 1)} disabled={stage === 0} aria-label="Предыдущий шаг">
                    <Icon name="left" size={20} />
                  </button>
                  <button type="button" className="jaw__arrow" onClick={() => goTo(stage + 1)} disabled={atEnd} aria-label="Следующий шаг">
                    <Icon name="right" size={20} />
                  </button>
                </div>
                {scenario.service && (
                  <button type="button" className="btn btn--primary btn--sm jaw__book" onClick={() => booking.open(scenario.service)}>
                    Записаться
                  </button>
                )}
              </div>
            </m.div>
          </div>
        </div>
      </div>
    </section>
  );
}
