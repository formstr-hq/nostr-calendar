import { PRESET_COLORS } from "../../../utils/calendarColorPresets";
import type { ICalendarList } from "../../../utils/calendarListTypes";
import type { ICalendarEvent } from "../../../utils/types";
import type { DestinationCalendarDraft } from "../../../stores/bulkImport";

/**
 * Strips Google Calendar Takeout unique IDs, email suffixes, and keys from calendar names.
 * Examples:
 * - "Family_family06727983610196800049@group.calendar.google.com" -> "Family"
 * - "Birthdays_dashmanas521@gmail.com" -> "Birthdays"
 * - "Holidays in India_en.indian#holiday@group.v.calendar.google.com" -> "Holidays in India"
 * - "Work_0123456789abcdef0123456789abcdef" -> "Work"
 * - "dashmanas521@gmail.com" -> "dashmanas521@gmail.com"
 * - "Family" -> "Family"
 */
export function cleanCalendarName(name: string): string {
  const trimmed = name.trim();

  // Pattern: <CalendarTitle>_<emailOrGoogleGroupCalendarId>
  // e.g. "Family_family06727983610196800049@group.calendar.google.com" -> "Family"
  // e.g. "Birthdays_dashmanas521@gmail.com" -> "Birthdays"
  const emailOrIdMatch = trimmed.match(
    /^(.+?)_[a-zA-Z0-9._%+#-]+@[a-zA-Z0-9.-]+$/,
  );
  if (emailOrIdMatch && emailOrIdMatch[1].trim()) {
    return emailOrIdMatch[1].trim();
  }

  // Pattern: <CalendarTitle>_<longUniqueHexOrNumericId> (Google Takeout 16+ char IDs)
  const longIdMatch = trimmed.match(/^(.+?)_[a-zA-Z0-9]{16,}$/);
  if (longIdMatch && longIdMatch[1].trim()) {
    return longIdMatch[1].trim();
  }

  return trimmed;
}

/**
 * Extracts X-WR-CALNAME from the VCALENDAR header if present.
 */
export function extractCalendarTitleFromICS(icsContent: string): string | null {
  const match = icsContent.match(/^X-WR-CALNAME(?:;[^:]*)?:(.*)$/im);
  if (match) {
    const raw = match[1].replace(/\\,/g, ",").replace(/\\;/g, ";").trim();
    if (raw) {
      return cleanCalendarName(raw);
    }
  }
  return null;
}

/**
 * Finds an existing calendar by case-insensitive name, also matching
 * singular/plural forms for common calendars like "Birthday" and "Birthdays".
 */
export function findMatchingCalendar(
  existingCalendars: ICalendarList[],
  name: string,
): ICalendarList | undefined {
  const trimmed = name.trim().toLowerCase();
  const exact = existingCalendars.find(
    (c) => c.title.trim().toLowerCase() === trimmed,
  );
  if (exact) return exact;

  if (trimmed === "birthdays") {
    return existingCalendars.find(
      (c) => c.title.trim().toLowerCase() === "birthday",
    );
  }
  if (trimmed === "birthday") {
    return existingCalendars.find(
      (c) => c.title.trim().toLowerCase() === "birthdays",
    );
  }

  return undefined;
}

/**
 * Extracts a clean calendar name from filename and optional ICS content.
 * Prioritizes the filename prefix for Google Takeout archives (e.g. Birthdays_..., Family_...),
 * falling back to X-WR-CALNAME only when the filename is an email or generic.
 */
export function getCalendarName(filename: string, icsContent?: string): string {
  const base = filename.split(/[/\\]/).pop() || filename;
  const decoded = decodeURIComponent(base)
    .replace(/\.ics$/i, "")
    .trim();
  const fromFilename = cleanCalendarName(decoded);

  const isEmail = /^[a-zA-Z0-9._%+#-]+@[a-zA-Z0-9.-]+$/.test(fromFilename);
  const isGeneric = /^(calendar|events|export|untitled)$/i.test(fromFilename);

  // If filename provided a clean, non-email calendar name, use it!
  if (!isEmail && !isGeneric && fromFilename) {
    return fromFilename;
  }

  // Otherwise, fallback to X-WR-CALNAME from ICS content if available
  if (icsContent) {
    const calName = extractCalendarTitleFromICS(icsContent);
    if (calName) {
      return calName;
    }
  }

  return fromFilename || "Imported Calendar";
}

/**
 * Builds destination calendar drafts for each distinct calendar in a ZIP,
 * reusing existing calendars by name or auto-assigning distinct preset colors.
 */
export function buildDestinationCalendars(
  icsFiles: {
    filename: string;
    content?: string;
    events: ICalendarEvent[];
  }[],
  existingCalendars: ICalendarList[],
): DestinationCalendarDraft[] {
  const existingColors = new Set(
    existingCalendars.map((c) => c.color.toLowerCase()),
  );

  // Group events by cleaned calendar name
  const eventsByCalName = new Map<string, string[]>();
  for (const { filename, content, events } of icsFiles) {
    if (events.length === 0) continue;
    const name = getCalendarName(filename, content);
    const list = eventsByCalName.get(name) || [];
    for (const e of events) {
      list.push(e.id);
    }
    eventsByCalName.set(name, list);
  }

  const assignedColors = new Set(existingColors);
  let colorIndex = 0;

  const getNextAvailableColor = (): string => {
    for (let i = 0; i < PRESET_COLORS.length; i++) {
      const idx = (colorIndex + i) % PRESET_COLORS.length;
      const color = PRESET_COLORS[idx];
      if (!assignedColors.has(color.toLowerCase())) {
        colorIndex = idx + 1;
        assignedColors.add(color.toLowerCase());
        return color;
      }
    }
    const fallbackColor = PRESET_COLORS[colorIndex % PRESET_COLORS.length];
    colorIndex++;
    return fallbackColor;
  };

  const drafts: DestinationCalendarDraft[] = [];
  for (const [name, eventIds] of eventsByCalName.entries()) {
    const existing = findMatchingCalendar(existingCalendars, name);
    const color = existing ? existing.color : getNextAvailableColor();
    drafts.push({
      name: existing ? existing.title : name,
      color,
      eventIds,
    });
  }

  return drafts;
}
