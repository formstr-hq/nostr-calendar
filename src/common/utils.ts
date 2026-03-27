import { sha256 } from "@noble/hashes/sha2";
import { utf8ToBytes } from "@noble/hashes/utils";
import { bytesToHex } from "nostr-tools/utils";
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

function unfoldICSLines(raw: string): string {
  return raw.replace(/\r\n[ \t]/g, "").replace(/\r/g, "");
}

function parseICSDate(value: string): number {
  // Handle formats: 20250101T120000Z, 20250101T120000, 20250101
  const clean = value.replace(/[^0-9TZ]/g, "");
  const year = parseInt(clean.substring(0, 4));
  const month = parseInt(clean.substring(4, 6)) - 1;
  const day = parseInt(clean.substring(6, 8));
  const hour = clean.length >= 13 ? parseInt(clean.substring(9, 11)) : 0;
  const minute = clean.length >= 13 ? parseInt(clean.substring(11, 13)) : 0;
  const second = clean.length >= 15 ? parseInt(clean.substring(13, 15)) : 0;

  if (clean.endsWith("Z")) {
    return Date.UTC(year, month, day, hour, minute, second);
  }
  return new Date(year, month, day, hour, minute, second).getTime();
}

export function parseICS(icsContent: string): ICalendarEvent | null {
  const text = unfoldICSLines(icsContent);
  const lines = text.split("\n");

  let inEvent = false;
  let title = "";
  let description = "";
  let begin = 0;
  let end = 0;
  let location: string[] = [];
  let rrule: string | null = null;
  let image: string | undefined;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "BEGIN:VEVENT") {
      inEvent = true;
      continue;
    }
    if (trimmed === "END:VEVENT") {
      break;
    }
    if (!inEvent) continue;

    // Split on first colon, but handle properties with parameters (e.g. DTSTART;TZID=...)
    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) continue;
    const key = trimmed.substring(0, colonIdx);
    const value = trimmed.substring(colonIdx + 1);

    const propName = key.split(";")[0].toUpperCase();

    switch (propName) {
      case "SUMMARY":
        title = value;
        break;
      case "DESCRIPTION":
        description = value.replace(/\\n/g, "\n").replace(/\\,/g, ",");
        break;
      case "DTSTART":
        begin = parseICSDate(value);
        break;
      case "DTEND":
        end = parseICSDate(value);
        break;
      case "LOCATION":
        location = value
          .split(",")
          .map((l) => l.trim())
          .filter(Boolean);
        break;
      case "RRULE":
        rrule = value;
        break;
      case "ATTACH":
        if (!image) image = value;
        break;
    }
  }

  if (!begin) return null;
  if (!end) end = begin + 60 * 60 * 1000;

  const event = {
    begin,
    end,
    id: "",
    eventId: "",
    kind: 0,
    title: title || "Imported Event",
    createdAt: Date.now(),
    description,
    location,
    categories: [],
    reference: [],
    geoHash: [],
    participants: [],
    rsvpResponses: [],
    website: "",
    user: "",
    isPrivateEvent: true,
    image,
    repeat: { rrule },
  };
  const dTagRoot = `${JSON.stringify(event)}-${Date.now()}`;
  const dTag = bytesToHex(sha256(utf8ToBytes(dTagRoot))).substring(0, 30);
  event.id = dTag;
  return event;
}
