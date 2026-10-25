import { create } from "zustand";
import type { ICalendarEvent } from "../utils/types";

export interface DestinationCalendarDraft {
  name: string;
  color: string;
  eventIds: string[];
}

interface BulkImportState {
  isOpen: boolean;
  events: ICalendarEvent[];
  sourceFileName?: string;
  destinationCalendars: DestinationCalendarDraft[];
  openWithEvents: (
    events: ICalendarEvent[],
    sourceFileName?: string,
    destinationCalendars?: DestinationCalendarDraft[],
  ) => void;
  close: () => void;
}

export const useBulkImport = create<BulkImportState>((set) => ({
  isOpen: false,
  events: [],
  sourceFileName: undefined,
  destinationCalendars: [],
  openWithEvents: (events, sourceFileName, destinationCalendars = []) =>
    set({ isOpen: true, events, sourceFileName, destinationCalendars }),
  close: () =>
    set({
      isOpen: false,
      events: [],
      sourceFileName: undefined,
      destinationCalendars: [],
    }),
}));
