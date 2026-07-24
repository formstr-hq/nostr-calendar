import { useState } from "react";
import dayjs, { Dayjs } from "dayjs";
import type { SelectChangeEvent } from "@mui/material";
import { RepeatingFrequency } from "../../../utils/types";
import {
  buildRecurrenceRule,
  parseRecurrenceRule,
  normalizeRule,
  type RecurrenceEndMode,
} from "../../../utils/repeatingEventsHelper";
import { CUSTOM_RECURRENCE_VALUE } from "../../../components/RecurrenceSelector";

/** All recurrence-rule state/handlers for the editor: frequency, custom-rule
 * dialog, and end-mode (never/count/until) — moved verbatim out of the old
 * flat `CalendarEventEdit.tsx` into its own hook so `EventEditor.tsx` stays
 * under the file-size guardrail. */
export function useRecurrenceState(
  initialRule: string | null,
  eventBegin: number,
) {
  const initialRecurrence = parseRecurrenceRule(initialRule);
  const initialIsCustom = !!initialRule && initialRecurrence.frequency === null;

  const [recurrenceFrequency, setRecurrenceFrequency] =
    useState<RepeatingFrequency>(
      initialIsCustom
        ? RepeatingFrequency.None
        : (initialRecurrence.frequency ?? RepeatingFrequency.None),
    );
  const [recurrenceEndMode, setRecurrenceEndMode] = useState<RecurrenceEndMode>(
    initialRecurrence.endMode,
  );
  const [recurrenceCount, setRecurrenceCount] = useState<number>(
    initialRecurrence.count ?? 1,
  );
  const [recurrenceUntilDate, setRecurrenceUntilDate] = useState<Dayjs | null>(
    initialRecurrence.untilDate ? dayjs(initialRecurrence.untilDate) : null,
  );
  const [isCustomRecurrence, setIsCustomRecurrence] =
    useState<boolean>(initialIsCustom);
  const [customRule, setCustomRule] = useState<string | null>(
    initialIsCustom && initialRule ? normalizeRule(initialRule) : null,
  );
  const [customDialogOpen, setCustomDialogOpen] = useState(false);

  const draftRecurrenceRule = isCustomRecurrence
    ? customRule
    : buildRecurrenceRule({
        frequency: recurrenceFrequency,
        endMode: recurrenceEndMode,
        count: recurrenceCount,
        untilDate: recurrenceUntilDate?.valueOf() ?? null,
        eventStart: eventBegin,
      });

  const handleFrequencyChange = (event: SelectChangeEvent<string>) => {
    const value = event.target.value;

    if (value === CUSTOM_RECURRENCE_VALUE) {
      setIsCustomRecurrence(true);
      setCustomDialogOpen(true);
      return;
    }

    setIsCustomRecurrence(false);
    setRecurrenceFrequency(value as RepeatingFrequency);
  };

  const closeCustomDialog = () => {
    setCustomDialogOpen(false);
    if (!customRule) {
      setIsCustomRecurrence(false);
      setRecurrenceFrequency(RepeatingFrequency.None);
    }
  };

  const applyCustomRule = (rule: string) => {
    setCustomRule(rule);
    setIsCustomRecurrence(true);
    setRecurrenceFrequency(RepeatingFrequency.None);
    setCustomDialogOpen(false);
  };

  const handleRecurrenceEndModeChange = (e: SelectChangeEvent<string>) => {
    const value = e.target.value as RecurrenceEndMode;
    setRecurrenceEndMode(value);

    if (value === "count" && recurrenceCount < 1) {
      setRecurrenceCount(1);
    }
    if (value === "until" && !recurrenceUntilDate) {
      setRecurrenceUntilDate(dayjs(eventBegin).startOf("day"));
    }
  };

  const handleRecurrenceCountChange = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const parsed = Number.parseInt(e.target.value, 10);
    setRecurrenceCount(Number.isFinite(parsed) ? parsed : 0);
  };

  const recurrenceEnabled = isCustomRecurrence
    ? !!customRule
    : recurrenceFrequency !== RepeatingFrequency.None;
  const recurrenceValid =
    !recurrenceEnabled ||
    (isCustomRecurrence
      ? !!customRule
      : recurrenceEndMode === "never" ||
        (recurrenceEndMode === "count" &&
          Number.isInteger(recurrenceCount) &&
          recurrenceCount >= 1) ||
        (recurrenceEndMode === "until" &&
          !!recurrenceUntilDate &&
          !recurrenceUntilDate.isBefore(dayjs(eventBegin).startOf("day"))));
  const recurrenceSelectValue:
    | RepeatingFrequency
    | typeof CUSTOM_RECURRENCE_VALUE = isCustomRecurrence
    ? CUSTOM_RECURRENCE_VALUE
    : recurrenceFrequency;

  return {
    initialIsCustom,
    recurrenceFrequency,
    recurrenceEndMode,
    recurrenceCount,
    recurrenceUntilDate,
    setRecurrenceUntilDate,
    isCustomRecurrence,
    customRule,
    customDialogOpen,
    setCustomDialogOpen,
    draftRecurrenceRule,
    handleFrequencyChange,
    closeCustomDialog,
    applyCustomRule,
    handleRecurrenceEndModeChange,
    handleRecurrenceCountChange,
    recurrenceValid,
    recurrenceSelectValue,
  };
}
