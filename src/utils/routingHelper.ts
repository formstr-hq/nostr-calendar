export enum ROUTES {
  EventPage = "/event/:naddr",
  EditEventPage = "/event/edit/:naddr",
  DuplicateEventPage = "/event/duplicate/:naddr",
  WeekCalendar = "/w/:year/:weekNumber",
  DayCalendar = "/d/:year/:month/:day",
  MonthCalendar = "/m/:year/:monthNumber",
  Notifications = "/notifications",
  // Appointment Scheduling
  SchedulingPageCreate = "/schedule/create",
  SchedulingPageEdit = "/schedule/edit/:naddr",
  SchedulingPagePublic = "/schedule/:naddr",
  Bookings = "/bookings",
}

export function getEventPage(naddr: string, viewKey?: string) {
  const urlParam = new URLSearchParams();
  if (viewKey) {
    urlParam.append("viewKey", viewKey);
  }
  return `/event/${naddr}?${urlParam.toString()}`;
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
