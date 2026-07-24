import type { Dayjs } from "dayjs";
import type { SelectChangeEvent } from "@mui/material";
import type { ICalendarEvent, RelayStatusMap } from "../../../utils/types";
import type { ICalendarList } from "../../../utils/calendarListTypes";
import type { RepeatingFrequency } from "../../../utils/types";
import type { RecurrenceEndMode } from "../../../utils/repeatingEventsHelper";
import type { CUSTOM_RECURRENCE_VALUE } from "../../../components/RecurrenceSelector";

/** Shared props for EventEditDesktopForm/EventEditMobileForm — the full content
 * block (header + sections + footer) each renders inside whatever chrome
 * (Dialog/BottomSheet/page Box) EventEditor picks for the current display mode. */
export interface EventEditFormProps {
  mode: "create" | "edit";
  display: "modal" | "page";

  eventDetails: ICalendarEvent;
  updateField: <K extends keyof ICalendarEvent>(
    key: K,
    value: ICalendarEvent[K],
  ) => void;
  isPrivate: boolean;

  selectedCalendarId: string;
  setSelectedCalendarId: (id: string) => void;
  calendars: ICalendarList[];

  allDay: boolean;
  onToggleAllDay: (checked: boolean) => void;
  beginDate: Dayjs;
  beginTime: Dayjs;
  endDate: Dayjs;
  endTime: Dayjs;
  onBeginDateChange: (date: Dayjs | null) => void;
  onBeginTimeChange: (time: Dayjs | null) => void;
  onEndDateChange: (date: Dayjs | null) => void;
  onEndTimeChange: (time: Dayjs | null) => void;

  recurrenceSelectValue: RepeatingFrequency | typeof CUSTOM_RECURRENCE_VALUE;
  isCustomRecurrence: boolean;
  customRule: string | null;
  recurrenceEndMode: RecurrenceEndMode;
  recurrenceCount: number;
  recurrenceUntilDate: Dayjs | null;
  onFrequencyChange: (event: SelectChangeEvent<string>) => void;
  onEndModeChange: (event: SelectChangeEvent<string>) => void;
  onCountChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onUntilDateChange: (date: Dayjs | null) => void;
  onEditCustom: () => void;

  moreOpen: boolean;
  onToggleMore: () => void;

  publishBusy: boolean;
  supportsBusyListPublish: boolean;
  onPublishBusyChange: (value: boolean) => void;

  notificationOffsets: number[];
  setNotificationOffsets: (offsets: number[]) => void;

  processing: boolean;
  buttonDisabled: boolean;
  handleClose: () => void;
  handleSave: () => void;

  relayDotsLabel: string;
  publishingRelays: string[];
  relayStatus: RelayStatusMap;
  showRelayDetailsButton: boolean;
  partialSaveRelayIssues: boolean;
  setRelayDetailsOpen: (open: boolean) => void;
  hasSignedEventForRetry: boolean;
  acceptedCount: number;
  failedCount: number;
  totalCount: number;
}
