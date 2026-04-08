import { ICalendarEvent } from "../utils/types";
import dayjs from "dayjs";
import weekday from "dayjs/plugin/weekday";
import isSameOrBefore from "dayjs/plugin/isSameOrBefore";
import isSameOrAfter from "dayjs/plugin/isSameOrAfter";
import { PX_PER_MINUTE } from "../utils/constants";
import { RefObject } from "react";
import { getNextOccurrenceInRange } from "../utils/repeatingEventsHelper";

dayjs.extend(weekday);
dayjs.extend(isSameOrBefore);
dayjs.extend(isSameOrAfter);

const DAY_MINUTES = 24 * 60;
const DAY_MS = DAY_MINUTES * 60 * 1000;

export interface CalendarEventSegment extends ICalendarEvent {
  renderKey: string;
  renderBegin: number;
  renderEnd: number;
}

export interface PositionedEvent extends CalendarEventSegment {
  top: number;
  height: number;
  col: number;
  colSpan: number;
}

const buildSegment = (
  event: ICalendarEvent,
  dayStart: number,
  occurrenceBegin: number,
  occurrenceEnd: number,
): CalendarEventSegment | null => {
  const renderBegin = Math.max(occurrenceBegin, dayStart);
  const renderEnd = Math.min(occurrenceEnd, dayStart + DAY_MS);

  if (renderEnd <= renderBegin) {
    return null;
  }

  return {
    ...event,
    renderKey: `${event.eventId || event.id}:${occurrenceBegin}:${dayStart}`,
    renderBegin,
    renderEnd,
  };
};

export function getEventSegmentForDay(
  event: ICalendarEvent,
  dayStart: number,
): CalendarEventSegment | null {
  const duration = event.end - event.begin;

  if (duration <= 0) {
    return null;
  }

  if (!event.repeat?.rrule) {
    return buildSegment(event, dayStart, event.begin, event.end);
  }

  const occurrenceStart = getNextOccurrenceInRange(
    event,
    dayStart - duration,
    dayStart + DAY_MS - 1,
  );

  if (occurrenceStart === null) {
    return null;
  }

  return buildSegment(
    event,
    dayStart,
    occurrenceStart,
    occurrenceStart + duration,
  );
}

export function getEventSegmentsForDay(
  events: ICalendarEvent[],
  dayStart: number,
): CalendarEventSegment[] {
  return events.flatMap((event) => {
    const segment = getEventSegmentForDay(event, dayStart);
    return segment ? [segment] : [];
  });
}

export function layoutDayEvents(
  events: CalendarEventSegment[],
): PositionedEvent[] {
  const sorted = [...events].sort(
    (a, b) => dayjs(a.renderBegin).valueOf() - dayjs(b.renderBegin).valueOf(),
  );
  const columns: CalendarEventSegment[][] = [];

  sorted.forEach((event) => {
    let placed = false;
    for (const col of columns) {
      if (
        dayjs(col[col.length - 1].renderEnd).isSameOrBefore(
          dayjs(event.renderBegin),
        )
      ) {
        col.push(event);
        placed = true;
        break;
      }
    }
    if (!placed) columns.push([event]);
  });

  const colSpan = columns.length;

  return columns.flatMap((col, colIndex) =>
    col.map((e) => {
      const startMinutes =
        dayjs(e.renderBegin).hour() * 60 + dayjs(e.renderBegin).minute();
      const rawDuration = dayjs(e.renderEnd).diff(dayjs(e.renderBegin), "minute");

      const clippedDuration = Math.max(
        0,
        Math.min(rawDuration, DAY_MINUTES - startMinutes),
      );
      return {
        ...e,
        col: colIndex,
        colSpan,
        top: dayjs(e.renderBegin).hour() * 60 + dayjs(e.renderBegin).minute(),
        height: clippedDuration * PX_PER_MINUTE,
      };
    }),
  );
}

export const getTimeFromCell = (
  event: React.MouseEvent<HTMLDivElement>,
  containerRef: RefObject<HTMLDivElement | null>,
  offsetHours = 0,
) => {
  if (containerRef.current) {
    // Calculate date/time from click position
    const rect = containerRef.current.getBoundingClientRect();
    const clickY = event.clientY - rect.top;

    // Assuming 60px per hour
    const hour = Math.floor(clickY / 60) - offsetHours;
    const minute = Math.floor((clickY % 60) / 30) * 30; // Round to nearest 30 min

    // Get date from the cell's data
    const cellDate = new Date(event.currentTarget.dataset.date!);
    const clickedDate = new Date(
      cellDate.getFullYear(),
      cellDate.getMonth(),
      cellDate.getDate(),
      hour,
      minute,
    );

    return clickedDate.getTime();
  }
  return null;
};
