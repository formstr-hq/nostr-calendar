import { Route, Routes } from "react-router";
import { ViewEventPage } from "./ViewEventPage";
import { EditEventPage } from "./EditEventPage";
import { NotificationEventPage } from "./NotificationEventPage";
import { ROUTES } from "../utils/routingHelper";
import { Index } from "./Index";
import Calendar from "./Calendar";
import { InvitationPanel } from "./InvitationPanel";
import { SchedulingPageEdit } from "./SchedulingPageEdit";
import { SchedulingPagePublic } from "./SchedulingPagePublic";
import { BookingsPage } from "./BookingsPage";

export const Routing = () => {
  return (
    <Routes>
      <Route path={ROUTES.EditEventPage} element={<EditEventPage />} />
      <Route path={ROUTES.EventPage} element={<ViewEventPage />} />
      <Route
        path="/notification-event/:eventId"
        element={<NotificationEventPage />}
      />
      <Route path={ROUTES.Notifications} element={<InvitationPanel />} />
      <Route
        path={ROUTES.SchedulingPageCreate}
        element={<SchedulingPageEdit />}
      />
      <Route
        path={ROUTES.SchedulingPageEdit}
        element={<SchedulingPageEdit />}
      />
      <Route
        path={ROUTES.SchedulingPagePublic}
        element={<SchedulingPagePublic />}
      />
      <Route path={ROUTES.Bookings} element={<BookingsPage />} />
      <Route path={ROUTES.WeekCalendar} element={<Calendar />} />
      <Route path={ROUTES.MonthCalendar} element={<Calendar />} />
      <Route path={ROUTES.DayCalendar} element={<Calendar />} />
      <Route path="*" element={<Index />} />
    </Routes>
  );
};
