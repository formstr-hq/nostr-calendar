import { ICalendarEvent } from "../stores/events";
import { NestedObject } from "./dictionary";

export function flattenMessages(
  nestedMessages: NestedObject,
  prefix = "",
): Record<string, string> {
  return (
    nestedMessages &&
    Object.keys(nestedMessages).reduce<Record<string, string>>(
      (messages: string | NestedObject, key: string) => {
        const value = nestedMessages[key];
        const prefixedKey = prefix ? `${prefix}.${key}` : key.toString();

        if (typeof value === "string") {
          messages[prefixedKey] = value;
        } else {
          Object.assign(messages, flattenMessages(value, prefixedKey));
        }

        return messages;
      },
      {},
    )
  );
}

export const exportICS = (calendarEvent: ICalendarEvent) => {
  const start =
    new Date(calendarEvent.begin)
      .toISOString()
      .replace(/[-:]/g, "")
      .split(".")[0] + "Z";
  const end =
    new Date(calendarEvent.end)
      .toISOString()
      .replace(/[-:]/g, "")
      .split(".")[0] + "Z";
  const dtstamp =
    new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const uid = `${calendarEvent.id}@calendar.formstr.app`;

  let title = calendarEvent.title?.trim();
  if (!title) {
    title = calendarEvent.description
      ? calendarEvent.description.split(" ").slice(0, 8).join(" ") + "..."
      : "Event";
  }

  let icsContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Formstr Inc//Calendar By Form*//EN
BEGIN:VEVENT
UID:${uid}
DTSTAMP:${dtstamp}
DTSTART:${start}
DTEND:${end}
SUMMARY:${title}
DESCRIPTION:${calendarEvent.description || ""}
`;

  if (calendarEvent.location.length > 0) {
    icsContent += `LOCATION:${calendarEvent.location.join(", ")}\n`;
  }

  if (calendarEvent.image) {
    icsContent += `ATTACH;FMTTYPE=image/jpeg:${calendarEvent.image}\n`;
  }

  if (calendarEvent.repeat?.rrule) {
    icsContent += `RRULE:${calendarEvent.repeat.rrule}\n`;
  }

  icsContent += `END:VEVENT
END:VCALENDAR`;

  const blob = new Blob([icsContent], {
    type: "text/calendar;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${title}.ics`;
  link.click();
  URL.revokeObjectURL(url);
};

export const isMobile = window.innerWidth <= 800 && window.innerHeight <= 1000;
