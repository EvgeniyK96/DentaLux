export default function Logo({ light = false }) {
  return (
    <a href="#top" className={'logo' + (light ? ' logo--light' : '')} aria-label="ДентаЛюкс — на главную">
      <svg className="logo__mark" viewBox="0 0 100 120" width="26" height="31" aria-hidden="true">
        <path fill="currentColor" d="M50 22C58 12 70 8 78 14C88 22 88 40 84 52C81 60 79 66 78 74C76 88 72 104 66 108C61 111 58 104 57 96C56 86 54 78 50 76C46 78 44 86 43 96C42 104 39 111 34 108C28 104 24 88 22 74C21 66 19 60 16 52C12 40 12 22 22 14C30 8 42 12 50 22Z" />
      </svg>
      <span className="logo__text">Дента<b>Люкс</b></span>
    </a>
  );
}
