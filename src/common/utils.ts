import { sha256 } from "@noble/hashes/sha2.js";
import { utf8ToBytes } from "@noble/hashes/utils.js";
import { bytesToHex } from "nostr-tools/utils";
import { ICalendarEvent } from "../stores/events";
import { saveTextFile } from "../plugins/keyBackup";
import { isNative } from "../utils/platform";
import { NestedObject } from "./dictionary";

export function flattenMessages(
  nestedMessages: NestedObject,
  prefix = "",
): Record<string, string> {
  return (
    nestedMessages &&
    Object.keys(nestedMessages).reduce<Record<string, string>>(
      (messages, key) => {
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

export const exportICS = async (
  calendarEvent: ICalendarEvent,
): Promise<void> => {
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

  const fileName = `${title.replace(/[\\/:*?"<>|]/g, "_")}.ics`;
  const mimeType = "text/calendar;charset=utf-8";
  if (isNative) {
    await saveTextFile(icsContent, fileName, mimeType);
    return;
  }

  const blob = new Blob([icsContent], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
};

export const isMobile =
  typeof window !== "undefined" &&
  window.innerWidth <= 800 &&
  window.innerHeight <= 1000;

function unfoldICSLines(raw: string): string {
  return raw
    .replace(/\r\n[ \t]/g, "")
    .replace(/\n[ \t]/g, "")
    .replace(/\r/g, "");
}

function parseICSDuration(value: string): number {
  const match = value.match(
    /P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?/i,
  );
  if (!match) return 0;
  const weeks = parseInt(match[1] || "0", 10);
  const days = parseInt(match[2] || "0", 10);
  const hours = parseInt(match[3] || "0", 10);
  const minutes = parseInt(match[4] || "0", 10);
  const seconds = parseInt(match[5] || "0", 10);
  return (
    weeks * 7 * 86400000 +
    days * 86400000 +
    hours * 3600000 +
    minutes * 60000 +
    seconds * 1000
  );
}

function parseICSDate(value: string): number {
  // Handle formats: 20250101T120000Z, 20250101T120000, 20250101
  const clean = value.replace(/[^0-9TZ]/g, "");
  if (clean.length < 8) return 0;
  const year = parseInt(clean.substring(0, 4), 10);
  const month = parseInt(clean.substring(4, 6), 10) - 1;
  const day = parseInt(clean.substring(6, 8), 10);
  const hour = clean.length >= 11 ? parseInt(clean.substring(9, 11), 10) : 0;
  const minute = clean.length >= 13 ? parseInt(clean.substring(11, 13), 10) : 0;
  const second = clean.length >= 15 ? parseInt(clean.substring(13, 15), 10) : 0;

  if (isNaN(year) || isNaN(month) || isNaN(day)) return 0;

  if (clean.endsWith("Z")) {
    return Date.UTC(year, month, day, hour, minute, second);
  }
  return new Date(year, month, day, hour, minute, second).getTime();
}

interface ParsedVEventResult {
  event: Omit<ICalendarEvent, "id">;
  uid?: string;
  recurrenceId?: string;
}

function parseVEvent(eventLines: string[]): ParsedVEventResult | null {
  let title = "";
  let description = "";
  let begin = 0;
  let end = 0;
  let durationMs = 0;
  let location: string[] = [];
  let rrule: string | null = null;
  let image: string | undefined;
  let uid = "";
  let recurrenceId = "";
  let isAllDay = false;

  for (const line of eventLines) {
    const trimmed = line.trim();

    // Split on first colon, but handle properties with parameters (e.g. DTSTART;TZID=...)
    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) continue;
    const key = trimmed.substring(0, colonIdx);
    const value = trimmed.substring(colonIdx + 1);

    const propName = key.split(";")[0].toUpperCase();

    switch (propName) {
      case "STATUS":
        if (value.trim().toUpperCase() === "CANCELLED") return null;
        break;
      case "UID":
        uid = value.trim();
        break;
      case "RECURRENCE-ID":
        recurrenceId = value.trim();
        break;
      case "SUMMARY":
        title = value
          .replace(/\\,/g, ",")
          .replace(/\\;/g, ";")
          .replace(/\\\\/g, "\\");
        break;
      case "DESCRIPTION":
        description = value.replace(/\\n/g, "\n").replace(/\\,/g, ",");
        break;
      case "DTSTART":
        if (
          value.replace(/[^0-9TZ]/g, "").length === 8 ||
          key.toUpperCase().includes("VALUE=DATE")
        ) {
          isAllDay = true;
        }
        begin = parseICSDate(value);
        break;
      case "DTEND":
        end = parseICSDate(value);
        break;
      case "DURATION":
        durationMs = parseICSDuration(value);
        break;
      case "LOCATION":
        location = value
          .split(",")
          .map((l) => l.replace(/\\,/g, ",").trim())
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
  if (!end) {
    if (durationMs > 0) end = begin + durationMs;
    else if (isAllDay) end = begin + 24 * 60 * 60 * 1000;
    else end = begin + 60 * 60 * 1000;
  }
  if (end <= begin) {
    end = begin + (isAllDay ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000);
  }

  return {
    uid: uid || undefined,
    recurrenceId: recurrenceId || undefined,
    event: {
      begin,
      end,
      allDay: isAllDay,
      eventId: "",
      kind: 0,
      calendarId: "",
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
    },
  };
}

export function parseICS(icsContent: string): ICalendarEvent | null {
  const text = unfoldICSLines(icsContent);
  const lines = text.split("\n");

  // Collect lines for the first VEVENT block
  let inEvent = false;
  const eventLines: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "BEGIN:VEVENT") {
      inEvent = true;
      continue;
    }
    if (trimmed === "END:VEVENT") break;
    if (inEvent) eventLines.push(line);
  }

  const parsed = parseVEvent(eventLines);
  if (!parsed) return null;

  const event: ICalendarEvent = { ...parsed.event, id: "" };
  const dTagRoot = parsed.uid
    ? `ics-${parsed.uid}`
    : `${JSON.stringify(event)}-${Date.now()}`;
  const dTag = bytesToHex(sha256(utf8ToBytes(dTagRoot))).substring(0, 30);
  event.id = dTag;
  return event;
}

export function parseICSMultiple(icsContent: string): ICalendarEvent[] {
  const text = unfoldICSLines(icsContent);
  const lines = text.split("\n");

  // Collect line ranges for every VEVENT block
  const veventBlocks: string[][] = [];
  let currentBlock: string[] | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "BEGIN:VEVENT") {
      currentBlock = [];
      continue;
    }
    if (trimmed === "END:VEVENT") {
      if (currentBlock) veventBlocks.push(currentBlock);
      currentBlock = null;
      continue;
    }
    if (currentBlock) currentBlock.push(line);
  }

  const now = Date.now();
  const events: ICalendarEvent[] = [];

  for (let i = 0; i < veventBlocks.length; i++) {
    const parsed = parseVEvent(veventBlocks[i]);
    if (!parsed) continue;

    const event: ICalendarEvent = { ...parsed.event, id: "" };
    const seed = parsed.uid
      ? parsed.recurrenceId
        ? `ics-${parsed.uid}-${parsed.recurrenceId}`
        : `ics-${parsed.uid}`
      : `${JSON.stringify(event)}-${now}-${i}`;
    const dTag = bytesToHex(sha256(utf8ToBytes(seed))).substring(0, 30);
    event.id = dTag;
    events.push(event);
  }

  return events;
}
