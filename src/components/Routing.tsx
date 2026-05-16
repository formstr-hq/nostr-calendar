import type { ReactNode } from "react";
import { Route, Routes } from "react-router";
import { ViewEventPage } from "./ViewEventPage";
import { EditEventPage } from "./EditEventPage";
import { DuplicateEventPage } from "./DuplicateEventPage";
import { NotificationEventPage } from "./NotificationEventPage";
import { ROUTES } from "../utils/routingHelper";
import { Index } from "./Index";
import Calendar from "./Calendar";
import { InvitationPanel } from "./InvitationPanel";
import { SchedulingPageEdit } from "./SchedulingPageEdit";
import { BookingPage } from "./BookingPage";
import { BookingNotifications } from "./BookingNotifications";
import { useUser } from "../stores/user";

const Protected = ({ children }: { children: ReactNode }) => {
  const { user, isInitialized } = useUser();

  if (!isInitialized || !user) {
    return null;
  }

  return <>{children}</>;
};

export const Routing = () => {
  return (
    <Routes>
      <Route path={ROUTES.EventPage} element={<ViewEventPage />} />
      <Route
        path={ROUTES.SchedulingPagePublic}
        element={<BookingPage />}
      />

      <Route
        path={ROUTES.EditEventPage}
        element={
          <Protected>
            <EditEventPage />
          </Protected>
        }
      />
      <Route
        path={ROUTES.DuplicateEventPage}
        element={
          <Protected>
            <DuplicateEventPage />
          </Protected>
        }
      />
      <Route
        path="/notification-event/:eventId"
        element={
          <Protected>
            <NotificationEventPage />
          </Protected>
        }
      />
      <Route
        path={ROUTES.Notifications}
        element={
          <Protected>
            <InvitationPanel />
          </Protected>
        }
      />
      <Route
        path={ROUTES.SchedulingPageEdit}
        element={
          <Protected>
            <SchedulingPageEdit />
          </Protected>
        }
      />
      <Route
        path={ROUTES.SchedulingPageCreate}
        element={
          <Protected>
            <SchedulingPageEdit />
          </Protected>
        }
      />
      <Route
        path={ROUTES.Bookings}
        element={
          <Protected>
            <BookingNotifications />
          </Protected>
        }
      />
      <Route
        path={ROUTES.WeekCalendar}
        element={
          <Protected>
            <Calendar />
          </Protected>
        }
      />
      <Route
        path={ROUTES.MonthCalendar}
        element={
          <Protected>
            <Calendar />
          </Protected>
        }
      />
      <Route
        path={ROUTES.DayCalendar}
        element={
          <Protected>
            <Calendar />
          </Protected>
        }
      />
      <Route
        path="*"
        element={
          <Protected>
            <Index />
          </Protected>
        }
      />
    </Routes>
  );
};
