import { create } from "zustand";
import type { ICalendarEvent } from "../utils/types";

interface BulkImportState {
  isOpen: boolean;
  events: ICalendarEvent[];
  sourceFileName?: string;
  openWithEvents: (events: ICalendarEvent[], sourceFileName?: string) => void;
  close: () => void;
}

export const useBulkImport = create<BulkImportState>((set) => ({
  isOpen: false,
  events: [],
  sourceFileName: undefined,
  openWithEvents: (events, sourceFileName) =>
    set({ isOpen: true, events, sourceFileName }),
  close: () => set({ isOpen: false, events: [], sourceFileName: undefined }),
}));
