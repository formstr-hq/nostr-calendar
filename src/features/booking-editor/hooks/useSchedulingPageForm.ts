import { useEffect, useState } from "react";
import dayjs from "dayjs";
import localeData from "dayjs/plugin/localeData";
dayjs.extend(localeData);
import type {
  IAvailabilityWindow,
  IFormAttachment,
  ISchedulingPage,
} from "../../../utils/types";

export const DAY_NAMES = dayjs.weekdays();

export interface TimeRange {
  startTime: string;
  endTime: string;
}

export interface RecurringDayConfig {
  enabled: boolean;
  ranges: TimeRange[];
}

export type WeeklyAvailability = RecurringDayConfig[];

export interface OneOffWindow {
  date: string; // YYYY-MM-DD
  startTime: string;
  endTime: string;
}

export interface BlockedWindow {
  date: string; // YYYY-MM-DD
  startTime: string;
  endTime: string;
}

type SchedulingFormData = Pick<
  ISchedulingPage,
  | "title"
  | "description"
  | "location"
  | "slotDurations"
  | "blockedDates"
  | "maxAdvance"
  | "buffer"
  | "expiry"
> & {
  eventTitle: string;
  image: string;
  formAttachments: IFormAttachment[];
};

const DEFAULT_WEEKLY: WeeklyAvailability = DAY_NAMES.map((_, i) => ({
  enabled: i >= 1 && i <= 5, // Mon-Fri enabled by default
  ranges: [{ startTime: "09:00", endTime: "17:00" }],
}));

const DEFAULT_FORM_DATA: SchedulingFormData = {
  title: "",
  eventTitle: "",
  description: "",
  location: "",
  image: "",
  slotDurations: [30],
  blockedDates: [],
  maxAdvance: 2592000,
  buffer: 900,
  expiry: 0,
  formAttachments: [],
};

export function parseBlockedDateEntry(entry: string): BlockedWindow {
  const [date, startTime, endTime] = entry.split("|");
  if (date && startTime && endTime) {
    return { date, startTime, endTime };
  }
  return {
    date: entry,
    startTime: "00:00",
    endTime: "23:59",
  };
}

export function serializeBlockedWindow(bw: BlockedWindow): string {
  if (bw.startTime === "00:00" && bw.endTime === "23:59") {
    return bw.date;
  }
  return `${bw.date}|${bw.startTime}|${bw.endTime}`;
}

export function useSchedulingPageForm(existingPage: ISchedulingPage | null) {
  const [formData, setFormData] =
    useState<SchedulingFormData>(DEFAULT_FORM_DATA);
  const updateField = <K extends keyof SchedulingFormData>(
    field: K,
    value: SchedulingFormData[K],
  ) => setFormData((prev) => ({ ...prev, [field]: value }));

  const [weekly, setWeekly] = useState<WeeklyAvailability>(DEFAULT_WEEKLY);
  const [oneOffWindows, setOneOffWindows] = useState<OneOffWindow[]>([]);
  const [blockedWindows, setBlockedWindows] = useState<BlockedWindow[]>([]);
  const [customDuration, setCustomDuration] = useState("");

  // Load existing page data into form
  useEffect(() => {
    if (!existingPage) return;
    setFormData({
      title: existingPage.title,
      eventTitle: existingPage.eventTitle || "",
      description: existingPage.description,
      location: existingPage.location,
      image: existingPage.image || "",
      slotDurations:
        existingPage.slotDurations.length > 0
          ? existingPage.slotDurations
          : [30],
      blockedDates: existingPage.blockedDates,
      maxAdvance: existingPage.maxAdvance,
      buffer: existingPage.buffer,
      expiry: existingPage.expiry,
      formAttachments: existingPage.formAttachments ?? [],
    });

    // Parse availability windows into weekly (grouping same-day ranges) + one-off
    const newWeekly: WeeklyAvailability = DAY_NAMES.map(() => ({
      enabled: false,
      ranges: [],
    }));
    const newOneOff: OneOffWindow[] = [];

    for (const w of existingPage.availabilityWindows) {
      if (w.type === "recurring" && w.dayOfWeek !== undefined) {
        newWeekly[w.dayOfWeek] = {
          enabled: true,
          ranges: [
            ...newWeekly[w.dayOfWeek].ranges,
            { startTime: w.startTime, endTime: w.endTime },
          ],
        };
      } else if (w.type === "date" && w.date) {
        newOneOff.push({
          date: w.date,
          startTime: w.startTime,
          endTime: w.endTime,
        });
      }
    }
    // Days with no persisted ranges but toggled off keep a single default
    // range in local state, so re-enabling starts from something sane.
    newWeekly.forEach((day, i) => {
      if (day.ranges.length === 0) {
        newWeekly[i] = {
          ...day,
          ranges: [{ startTime: "09:00", endTime: "17:00" }],
        };
      }
    });

    setWeekly(newWeekly);
    setOneOffWindows(newOneOff);
    setBlockedWindows(existingPage.blockedDates.map(parseBlockedDateEntry));
  }, [existingPage]);

  const buildAvailabilityWindows = (): IAvailabilityWindow[] => {
    const windows: IAvailabilityWindow[] = [];
    weekly.forEach((day, index) => {
      if (!day.enabled) return;
      day.ranges.forEach((range) => {
        windows.push({
          type: "recurring",
          dayOfWeek: index,
          startTime: range.startTime,
          endTime: range.endTime,
        });
      });
    });
    oneOffWindows.forEach((w) => {
      windows.push({
        type: "date",
        date: w.date,
        startTime: w.startTime,
        endTime: w.endTime,
      });
    });
    return windows;
  };

  const toggleDuration = (mins: number) => {
    setFormData((prev) => ({
      ...prev,
      slotDurations: prev.slotDurations.includes(mins)
        ? prev.slotDurations.filter((d) => d !== mins)
        : [...prev.slotDurations, mins],
    }));
  };

  const addCustomDuration = () => {
    const mins = parseInt(customDuration.trim(), 10);
    if (!isNaN(mins) && mins > 0) {
      setFormData((prev) => ({
        ...prev,
        slotDurations: prev.slotDurations.includes(mins)
          ? prev.slotDurations
          : [...prev.slotDurations, mins].sort((a, b) => a - b),
      }));
      setCustomDuration("");
    }
  };

  const updateWeeklyDay = (
    dayIndex: number,
    updates: Partial<Omit<RecurringDayConfig, "ranges">>,
  ) => {
    setWeekly((prev) =>
      prev.map((d, i) => (i === dayIndex ? { ...d, ...updates } : d)),
    );
  };

  const addWeeklyRange = (dayIndex: number) => {
    setWeekly((prev) =>
      prev.map((d, i) => {
        if (i !== dayIndex) return d;
        const last = d.ranges[d.ranges.length - 1];
        return {
          ...d,
          ranges: [
            ...d.ranges,
            { startTime: last?.endTime ?? "09:00", endTime: "17:00" },
          ],
        };
      }),
    );
  };

  const updateWeeklyRange = (
    dayIndex: number,
    rangeIndex: number,
    updates: Partial<TimeRange>,
  ) => {
    setWeekly((prev) =>
      prev.map((d, i) =>
        i !== dayIndex
          ? d
          : {
              ...d,
              ranges: d.ranges.map((r, ri) =>
                ri === rangeIndex ? { ...r, ...updates } : r,
              ),
            },
      ),
    );
  };

  const removeWeeklyRange = (dayIndex: number, rangeIndex: number) => {
    setWeekly((prev) =>
      prev.map((d, i) =>
        i !== dayIndex
          ? d
          : { ...d, ranges: d.ranges.filter((_, ri) => ri !== rangeIndex) },
      ),
    );
  };

  const addOneOffWindow = () => {
    setOneOffWindows((prev) => [
      ...prev,
      {
        date: dayjs().format("YYYY-MM-DD"),
        startTime: "09:00",
        endTime: "17:00",
      },
    ]);
  };

  const updateOneOffWindow = (
    index: number,
    updates: Partial<OneOffWindow>,
  ) => {
    setOneOffWindows((prev) =>
      prev.map((w, i) => (i === index ? { ...w, ...updates } : w)),
    );
  };

  const removeOneOffWindow = (index: number) => {
    setOneOffWindows((prev) => prev.filter((_, i) => i !== index));
  };

  const addBlockedWindow = () => {
    setBlockedWindows((prev) => [
      ...prev,
      {
        date: dayjs().format("YYYY-MM-DD"),
        // A "blocked date" should mean the whole day by default. Hosts can
        // still narrow it to a time range in the editor when needed.
        startTime: "00:00",
        endTime: "23:59",
      },
    ]);
  };

  const updateBlockedWindow = (
    index: number,
    updates: Partial<BlockedWindow>,
  ) => {
    setBlockedWindows((prev) =>
      prev.map((w, i) => (i === index ? { ...w, ...updates } : w)),
    );
  };

  const removeBlockedWindow = (index: number) => {
    setBlockedWindows((prev) => prev.filter((_, i) => i !== index));
  };

  const addForm = (form: IFormAttachment) => {
    setFormData((prev) => ({
      ...prev,
      formAttachments:
        prev.formAttachments.length === 0 ? [form] : prev.formAttachments,
    }));
  };

  const removeForm = (naddr: string) => {
    setFormData((prev) => ({
      ...prev,
      formAttachments: prev.formAttachments.filter((f) => f.naddr !== naddr),
    }));
  };

  const hasAvailability =
    weekly.some((d) => d.enabled) || oneOffWindows.length > 0;

  return {
    formData,
    updateField,
    weekly,
    oneOffWindows,
    blockedWindows,
    customDuration,
    setCustomDuration,
    hasAvailability,
    buildAvailabilityWindows,
    toggleDuration,
    addCustomDuration,
    updateWeeklyDay,
    addWeeklyRange,
    updateWeeklyRange,
    removeWeeklyRange,
    addOneOffWindow,
    updateOneOffWindow,
    removeOneOffWindow,
    addBlockedWindow,
    updateBlockedWindow,
    removeBlockedWindow,
    addForm,
    removeForm,
  };
}

export type UseSchedulingPageFormReturn = ReturnType<
  typeof useSchedulingPageForm
>;
