export enum ROUTES {
  EventPage = "/event/:naddr",
  WeekCalendar = "/w/:year/:weekNumber",
  DayCalendar = "/d/:year/:month/:day",
  MonthCalendar = "/m/:year/:monthNumber",
  Notifications = "/notifications",
}

export function getEventPage(naddr: string, viewKey?: string) {
  const urlParam = new URLSearchParams();
  if (viewKey) {
    urlParam.append("viewKey", viewKey);
  }
  return `/event/${naddr}?${urlParam.toString()}`;
}
