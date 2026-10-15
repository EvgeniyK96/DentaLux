import { useCallback, useState } from 'react';
import { LazyMotion, MotionConfig, domAnimation } from 'motion/react';
import BookingProvider from './booking/BookingProvider.jsx';
import { usePageReady } from './hooks/usePageReady.js';
import Header from './components/Header.jsx';
import Hero from './components/Hero.jsx';
import Stats from './components/Stats.jsx';
import Services from './components/Services.jsx';
import JawSection from './components/JawSection.jsx';
import Reasons from './components/Reasons.jsx';
import Doctors from './components/Doctors.jsx';
import Prices from './components/Prices.jsx';
import Reviews from './components/Reviews.jsx';
import Faq from './components/Faq.jsx';
import CtaBand from './components/CtaBand.jsx';
import Footer from './components/Footer.jsx';

export default function App() {
  const ready = usePageReady();
  // Выбранный сценарий 3D-блока. Новый объект на каждый выбор — даже повторный клик перезапускает показ.
  const [selection, setSelection] = useState({ id: 'anatomy' });
  const selectScenario = useCallback((id) => setSelection({ id }), []);
  const showScenario = useCallback((id) => {
    setSelection({ id });
    document.getElementById('treatment')?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  return (
    <MotionConfig reducedMotion="user">
      <LazyMotion features={domAnimation} strict>
        <BookingProvider>
          <Header />
          <main>
            <Hero ready={ready} />
            <Stats />
            <Services onShowScenario={showScenario} />
            <JawSection selection={selection} onSelect={selectScenario} />
            <Reasons />
            <Doctors />
            <Prices />
            <Reviews />
            <Faq />
            <CtaBand />
          </main>
          <Footer />
        </BookingProvider>
      </LazyMotion>
    </MotionConfig>
  );
}
