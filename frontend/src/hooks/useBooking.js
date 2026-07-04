import { useCallback, useMemo, useState } from 'react';
import { useToast } from '../components/ToastProvider';
import { api } from '../services/api';

const PENDING_BOOKING_STORAGE_KEY = 'eventiq:pendingBookingId';

const getCheckoutErrorMessage = (error) =>
  error.response?.data?.message ||
  error.message ||
  'We could not start checkout with your current seat selection.';

export function useBooking({ eventId, tierId, lockedSeats, eventTitle, expectedAmount }) {
  const toast = useToast();
  const [isCheckoutLoading, setIsCheckoutLoading] = useState(false);
  const [isReserveReminderVisible, setIsReserveReminderVisible] = useState(false);

  const normalizedLockedSeats = useMemo(
    () =>
      (lockedSeats || []).map((seat) => ({
        seatId: seat.seatId || seat._id,
        seatNumber: seat.seatNumber,
        lockExpiry: seat.lockExpiry || null
      })),
    [lockedSeats]
  );

  const lockedSeatIds = useMemo(
    () => normalizedLockedSeats.map((seat) => seat.seatId).filter(Boolean),
    [normalizedLockedSeats]
  );

  const startCheckout = useCallback(async () => {
    if (!eventId || !tierId || lockedSeatIds.length === 0) {
      toast.error('Select and lock at least one seat before starting checkout.', {
        title: 'Checkout unavailable'
      });
      return false;
    }

    setIsCheckoutLoading(true);

    try {
      const response = await api.post('/api/v1/bookings/initiate', {
        eventId,
        tierId,
        seatIds: lockedSeatIds
      });

      const bookingSession = response.data?.data;

      if (!bookingSession?.invoiceUrl || !bookingSession?.bookingId) {
        throw new Error('Invalid booking initiation response');
      }

      setIsReserveReminderVisible(false);

      if (
        Number.isFinite(expectedAmount) &&
        Number(bookingSession.amount || 0) !== Number(expectedAmount)
      ) {
        throw new Error('Booking total changed before payment could start');
      }

      if (typeof window === 'undefined') {
        throw new Error('Checkout redirect can only run in the browser');
      }

      window.sessionStorage.setItem(PENDING_BOOKING_STORAGE_KEY, bookingSession.bookingId);
      window.location.assign(bookingSession.invoiceUrl);
      return true;
    } catch (error) {
      setIsReserveReminderVisible(false);
      toast.error(getCheckoutErrorMessage(error), {
        title: 'Checkout unavailable'
      });
      return false;
    } finally {
      setIsCheckoutLoading(false);
    }
  }, [
    eventId,
    expectedAmount,
    lockedSeatIds,
    tierId,
    toast
  ]);

  return {
    lockedSeats: normalizedLockedSeats,
    isCheckoutLoading,
    isAwaitingConfirmation: false,
    isReserveReminderVisible,
    dismissReserveReminder: () => setIsReserveReminderVisible(false),
    startCheckout
  };
}
