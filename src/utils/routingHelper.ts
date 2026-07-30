import {
  OCCURRENCE_END_PARAM,
  OCCURRENCE_START_PARAM,
  type EventOccurrenceRange,
} from "./eventOccurrence";

export enum ROUTES {
  EventPage = "/event/:naddr",
  EditEventPage = "/event/edit/:naddr",
  DuplicateEventPage = "/event/duplicate/:naddr",
  WeekCalendar = "/w/:year/:startDayOfWeek",
  DayCalendar = "/d/:year/:month/:day",
  MonthCalendar = "/m/:year/:monthNumber",
  Notifications = "/notifications",
  // Appointment Scheduling
  SchedulingPageCreate = "/schedule/create",
  SchedulingPageEdit = "/schedule/edit/:naddr",
  SchedulingPagePublic = "/schedule/:naddr",
  Bookings = "/bookings",
  Settings = "/settings",
}

export function getEventPage(
  naddr: string,
  viewKey?: string,
  occurrenceRange?: EventOccurrenceRange,
) {
  const urlParam = new URLSearchParams();
  if (viewKey) {
    urlParam.append("viewKey", viewKey);
  }
  if (occurrenceRange) {
    urlParam.append(OCCURRENCE_START_PARAM, String(occurrenceRange.begin));
    urlParam.append(OCCURRENCE_END_PARAM, String(occurrenceRange.end));
  }

  const query = urlParam.toString();
  return `/event/${naddr}${query ? `?${query}` : ""}`;
}

export function getEditEventPage(naddr: string, viewKey?: string) {
  const urlParam = new URLSearchParams();
  if (viewKey) {
    urlParam.append("viewKey", viewKey);
  }
  return `/event/edit/${naddr}?${urlParam.toString()}`;
}

export function getDuplicateEventPage(naddr: string, viewKey?: string) {
  const urlParam = new URLSearchParams();
  if (viewKey) {
    urlParam.append("viewKey", viewKey);
  }
  return `/event/duplicate/${naddr}?${urlParam.toString()}`;
}

export function getSchedulingPagePublicUrl(naddr: string) {
  return `/schedule/${naddr}`;
}

export function getSchedulingPageEditUrl(naddr: string) {
  return `/schedule/edit/${naddr}`;
}
