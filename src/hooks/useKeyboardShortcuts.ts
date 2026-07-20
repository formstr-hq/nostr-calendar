import { useEffect } from "react";
import type { CalendarTopBarProps } from "./useCalendarTopBarProps";

interface KeyboardShortcutsOptions {
  onNewEvent: () => void;
  onFocusSearch: () => void;
  topBar: CalendarTopBarProps;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.isContentEditable
  );
}

/** Global shortcuts: C new event, T today, M/W/D view, arrows prev/next, Cmd/Ctrl+K search. */
export function useKeyboardShortcuts({
  onNewEvent,
  onFocusSearch,
  topBar,
}: KeyboardShortcutsOptions) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onFocusSearch();
        return;
      }

      if (e.metaKey || e.ctrlKey || e.altKey) return;

      switch (e.key) {
        case "c":
        case "C":
          onNewEvent();
          break;
        case "t":
        case "T":
          topBar.onToday?.();
          break;
        case "m":
        case "M":
          topBar.onViewChange?.("month");
          break;
        case "w":
        case "W":
          topBar.onViewChange?.("week");
          break;
        case "d":
        case "D":
          topBar.onViewChange?.("day");
          break;
        case "ArrowLeft":
          topBar.onPrev?.();
          break;
        case "ArrowRight":
          topBar.onNext?.();
          break;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onNewEvent, onFocusSearch, topBar]);
}
