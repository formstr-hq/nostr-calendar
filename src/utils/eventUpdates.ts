import type { ICalendarEvent } from "./types";

export type EventUpdate = {
  changedAttributes: string[];
  addedParticipants: string[];
  timeChanged: boolean;
  shouldNotify: boolean;
  body: string;
};

const normalizedValues = (values: string[] = []) =>
  Array.from(
    new Set(
      values
        .filter(Boolean)
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean),
    ),
  ).sort();

const areEqual = (left: string[] = [], right: string[] = []) => {
  const normalizedLeft = normalizedValues(left);
  const normalizedRight = normalizedValues(right);
  return (
    normalizedLeft.length === normalizedRight.length &&
    normalizedLeft.every((value, index) => value === normalizedRight[index])
  );
};

const formatTimeRange = (begin: number, end: number) => {
  const start = new Date(begin);
  const finish = new Date(end);
  const sameDay =
    start.getFullYear() === finish.getFullYear() &&
    start.getMonth() === finish.getMonth() &&
    start.getDate() === finish.getDate();
  const date = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });
  const time = new Intl.DateTimeFormat(undefined, { timeStyle: "short" });

  return sameDay
    ? `${date.format(start)}, ${time.format(start)} - ${time.format(finish)}`
    : `${date.format(start)} ${time.format(start)} - ${date.format(finish)} ${time.format(finish)}`;
};

export function getEventUpdate(
  previous: ICalendarEvent,
  fresh: ICalendarEvent,
): EventUpdate {
  const changedAttributes: string[] = [];
  const previousParticipants = new Set(normalizedValues(previous.participants));
  const addedParticipants = normalizedValues(fresh.participants).filter(
    (participant) => !previousParticipants.has(participant),
  );
  const timeChanged =
    previous.begin !== fresh.begin ||
    previous.end !== fresh.end ||
    previous.allDay !== fresh.allDay;

  if (timeChanged) changedAttributes.push("date and time");
  if (previous.title !== fresh.title) changedAttributes.push("title");
  if (previous.description !== fresh.description)
    changedAttributes.push("description");
  if (!areEqual(previous.location, fresh.location)) {
    changedAttributes.push("location");
  }
  if (previous.image !== fresh.image) changedAttributes.push("image");
  if (previous.repeat.rrule !== fresh.repeat.rrule) {
    changedAttributes.push("recurrence");
  }
  if (!areEqual(previous.categories, fresh.categories)) {
    changedAttributes.push("categories");
  }
  if (!areEqual(previous.reference, fresh.reference)) {
    changedAttributes.push("references");
  }
  if (
    JSON.stringify(previous.forms ?? []) !== JSON.stringify(fresh.forms ?? [])
  ) {
    changedAttributes.push("forms");
  }
  if (previous.notificationPreference !== fresh.notificationPreference) {
    changedAttributes.push("notification preference");
  }
  if (addedParticipants.length > 0) changedAttributes.push("participants");

  let body = "";
  if (timeChanged) {
    body = `New time: ${formatTimeRange(fresh.begin, fresh.end)}`;
  } else if (addedParticipants.length > 0 && changedAttributes.length === 1) {
    body =
      addedParticipants.length === 1
        ? "A participant was added"
        : `${addedParticipants.length} participants were added`;
  } else if (changedAttributes.length > 0) {
    body = `Updated: ${changedAttributes.join(", ")}`;
  }

  return {
    changedAttributes,
    addedParticipants,
    timeChanged,
    shouldNotify: changedAttributes.length > 0,
    body,
  };
}

export function shouldNotifyEventUpdate(
  previous: ICalendarEvent,
  fresh: ICalendarEvent,
  currentUserPubkey?: string,
): boolean {
  const currentUser = currentUserPubkey?.toLowerCase();
  if (!currentUser || fresh.user.toLowerCase() === currentUser) return false;

  const previousParticipants = normalizedValues(previous.participants);
  const freshParticipants = new Set(normalizedValues(fresh.participants));
  if (
    previousParticipants.includes(currentUser) &&
    !freshParticipants.has(currentUser)
  ) {
    return false;
  }

  return getEventUpdate(previous, fresh).shouldNotify;
}
