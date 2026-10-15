import { useCallback, useMemo, useState } from 'react';
import { BookingContext } from './context.js';
import BookingModal from '../components/BookingModal.jsx';

export default function BookingProvider({ children }) {
  const [state, setState] = useState({ open: false, service: '' });
  const open = useCallback((service = '') => setState({ open: true, service }), []);
  const close = useCallback(() => setState((s) => ({ ...s, open: false })), []);
  const value = useMemo(() => ({ open, close }), [open, close]);
  return (
    <BookingContext value={value}>
      {children}
      <BookingModal open={state.open} service={state.service} onClose={close} />
    </BookingContext>
  );
}
