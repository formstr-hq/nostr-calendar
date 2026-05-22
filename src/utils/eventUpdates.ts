import type { ICalendarEvent } from "./types";

export interface EventUpdateSummary {
  changedAttributes: string[];
  hasParticipantRemoval: boolean;
  addedParticipants: string[];
  timeChanged: boolean;
  shouldNotify: boolean;
  body: string;
}

const unique = (values: string[]) =>
  Array.from(
    new Set(values.filter(Boolean).map((value) => value.trim().toLowerCase())),
  );

const sorted = (values: string[]) => [...values].sort();

const sameStringList = (a: string[], b: string[]) => {
  const left = sorted(unique(a));
  const right = sorted(unique(b));
  return (
    left.length === right.length && left.every((value, i) => value === right[i])
  );
};

const formatDateTime = (timestamp: number) =>
  new Date(timestamp).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

function getAddedParticipants(
  previous: ICalendarEvent,
  fresh: ICalendarEvent,
): string[] {
  const previousParticipants = new Set(unique(previous.participants));
  return unique(fresh.participants).filter(
    (participant) => !previousParticipants.has(participant),
  );
}

function hasParticipantRemoval(
  previous: ICalendarEvent,
  fresh: ICalendarEvent,
): boolean {
  const freshParticipants = new Set(unique(fresh.participants));
  return unique(previous.participants).some(
    (participant) => !freshParticipants.has(participant),
  );
}

export function getEventUpdateSummary(
  previous: ICalendarEvent,
  fresh: ICalendarEvent,
): EventUpdateSummary {
  const changedAttributes: string[] = [];
  const addedParticipants = getAddedParticipants(previous, fresh);
  const participantRemoved = hasParticipantRemoval(previous, fresh);
  const timeChanged =
    previous.begin !== fresh.begin ||
    previous.end !== fresh.end ||
    previous.allDay !== fresh.allDay;

  if (timeChanged) {
    changedAttributes.push("date/time");
  }
  if (previous.title !== fresh.title) {
    changedAttributes.push("title");
  }
  if (previous.description !== fresh.description) {
    changedAttributes.push("description");
  }
  if (!sameStringList(previous.location, fresh.location)) {
    changedAttributes.push("location");
  }
  if (previous.image !== fresh.image) {
    changedAttributes.push("image");
  }
  if (previous.repeat?.rrule !== fresh.repeat?.rrule) {
    changedAttributes.push("recurrence");
  }
  if (!sameStringList(previous.categories, fresh.categories)) {
    changedAttributes.push("categories");
  }
  if (addedParticipants.length > 0) {
    changedAttributes.push("participants");
  }

  const shouldNotify = changedAttributes.length > 0;
  let body = "";
  if (timeChanged) {
    body = `New time: ${formatDateTime(fresh.begin)} - ${formatDateTime(fresh.end)}`;
  } else if (addedParticipants.length > 0 && changedAttributes.length === 1) {
    body =
      addedParticipants.length === 1
        ? "A participant was added"
        : `${addedParticipants.length} participants were added`;
  } else if (shouldNotify) {
    body = `Updated: ${changedAttributes.join(", ")}`;
  }

  return {
    changedAttributes,
    hasParticipantRemoval: participantRemoved,
    addedParticipants,
    timeChanged,
    shouldNotify,
    body,
  };
}
