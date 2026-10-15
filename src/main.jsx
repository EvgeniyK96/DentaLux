import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Базовые стили первыми: компонентные CSS (импортируются из App) должны их перекрывать
import './styles/global.css';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
