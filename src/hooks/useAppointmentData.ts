import { useEffect } from "react";
import { useUser } from "../stores/user";
import { useSchedulingPages } from "../stores/schedulingPages";
import { useBookingRequests } from "../stores/bookingRequests";

/**
 * Fetches scheduling pages and booking request data.
 * Intended to be called when the sidebar mounts so this data is loaded lazily
 * rather than eagerly on app startup.
 */
export function useAppointmentData() {
  const { user, isInitialized } = useUser();

  useEffect(() => {
    if (!user || !isInitialized) return;
    useSchedulingPages.getState().fetchPages();
    useBookingRequests.getState().fetchIncomingRequests();
    useBookingRequests.getState().fetchOutgoingBookings();
  }, [user, isInitialized]);
}
