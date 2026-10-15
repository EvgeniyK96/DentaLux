import { createContext, useContext } from 'react';

export const BookingContext = createContext(null);

// open(service?) открывает окно записи; service — значение из BOOKING_SERVICES
export const useBooking = () => useContext(BookingContext);
