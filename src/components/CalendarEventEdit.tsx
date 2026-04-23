import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Box,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  IconButton,
  SelectChangeEvent,
  Divider,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { ICalendarEvent, RepeatingFrequency } from "../utils/types";
import {
  buildRecurrenceRule,
  parseRecurrenceRule,
  type RecurrenceEndMode,
} from "../utils/repeatingEventsHelper";
import { ParticipantAdd } from "./ParticipantAdd";
import { useIntl } from "react-intl";
import ScheduleIcon from "@mui/icons-material/Schedule";
import { Participant } from "./Participant";
import {
  editPrivateCalendarEvent,
  publishPrivateCalendarEvent,
  publishPublicCalendarEvent,
} from "../common/nostr";
import { EventKinds } from "../common/EventConfigs";
import { DateTimePicker } from "@mui/x-date-pickers/DateTimePicker";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import dayjs, { Dayjs } from "dayjs";
import { RRule } from "rrule";
import LocationPinIcon from "@mui/icons-material/LocationPin";
import EventRepeatIcon from "@mui/icons-material/EventRepeat";
import PeopleIcon from "@mui/icons-material/People";
import DescriptionIcon from "@mui/icons-material/Description";
import NotificationsActiveIcon from "@mui/icons-material/NotificationsActive";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import { EventAttributeEditContainer } from "./StyledComponents";
import LockIcon from "@mui/icons-material/Lock";
import PublicIcon from "@mui/icons-material/Public";
import SettingsInputAntennaIcon from "@mui/icons-material/SettingsInputAntenna";
import { getRelays } from "../common/nostr";
import { useRelayStore } from "../stores/relays";
import { useCalendarLists } from "../stores/calendarLists";
import { useTimeBasedEvents } from "../stores/events";
import { CalendarListSelect } from "./CalendarListSelect";
import { v4 as uuid } from "uuid";
import {
  areNotificationOffsetsEqual,
  clearNotificationPreference,
  DEFAULT_NOTIFICATION_OFFSETS,
  getNotificationPreference,
  normalizeNotificationOffsets,
  setNotificationPreference,
  shouldScheduleNotifications,
} from "../utils/notificationPreferences";
import {
  cancelEventNotifications,
  scheduleEventNotifications,
} from "../utils/notifications";
import { useNotifications } from "../stores/notifications";

interface CalendarEventEditProps {
  open: boolean;
  event: ICalendarEvent | null;
  initialDateTime?: number;
  onClose: () => void;
  onSave?: (event: ICalendarEvent) => void;
  mode?: "create" | "edit";
  display?: "modal" | "page";
}

const CUSTOM_RECURRENCE_VALUE = "__custom_rule__";

type CustomUnit = "day" | "week";
type CustomEndMode = "never" | "until" | "count";

interface CustomRecurrenceDraft {
  interval: number;
  unit: CustomUnit;
  weekDays: string[];
  endMode: CustomEndMode;
  endDate: Dayjs | null;
  count: number;
}

const WEEKDAY_OPTIONS: Array<{ code: string; label: string }> = [
  { code: "SU", label: "S" },
  { code: "MO", label: "M" },
  { code: "TU", label: "T" },
  { code: "WE", label: "W" },
  { code: "TH", label: "T" },
  { code: "FR", label: "F" },
  { code: "SA", label: "S" },
];

function toRRuleBody(rule: string): string {
  const trimmed = rule.trim();
  if (trimmed.toUpperCase().startsWith("RRULE:")) {
    return trimmed.slice(6).trim();
  }

  return trimmed;
}

function summarizeRecurrenceRule(rule: string): string {
  const normalizedRule = toRRuleBody(rule);
  if (!normalizedRule) {
    return rule;
  }

  try {
    const semanticLabel = RRule.fromString(`RRULE:${normalizedRule}`).toText();
    if (!semanticLabel) {
      return normalizedRule;
    }

    return semanticLabel.charAt(0).toUpperCase() + semanticLabel.slice(1);
  } catch {
    return normalizedRule;
  }
}

function parseRuleParts(rule: string): Record<string, string> {
  const parsed: Record<string, string> = {};

  for (const part of toRRuleBody(rule).split(";")) {
    const [rawKey, rawValue] = part.split("=", 2);
    if (!rawKey || !rawValue) {
      continue;
    }

    parsed[rawKey.toUpperCase()] = rawValue.toUpperCase();
  }

  return parsed;
}

function parseUntilDate(untilValue?: string): Dayjs | null {
  if (!untilValue) {
    return null;
  }

  const value = untilValue.trim().toUpperCase();

  if (/^\d{8}T\d{6}Z$/.test(value)) {
    return dayjs(
      new Date(
        Date.UTC(
          Number.parseInt(value.slice(0, 4), 10),
          Number.parseInt(value.slice(4, 6), 10) - 1,
          Number.parseInt(value.slice(6, 8), 10),
          Number.parseInt(value.slice(9, 11), 10),
          Number.parseInt(value.slice(11, 13), 10),
          Number.parseInt(value.slice(13, 15), 10),
        ),
      ),
    ).startOf("day");
  }

  if (/^\d{8}T\d{6}$/.test(value)) {
    return dayjs(
      new Date(
        Number.parseInt(value.slice(0, 4), 10),
        Number.parseInt(value.slice(4, 6), 10) - 1,
        Number.parseInt(value.slice(6, 8), 10),
        Number.parseInt(value.slice(9, 11), 10),
        Number.parseInt(value.slice(11, 13), 10),
        Number.parseInt(value.slice(13, 15), 10),
      ),
    ).startOf("day");
  }

  if (/^\d{8}$/.test(value)) {
    return dayjs(
      new Date(
        Number.parseInt(value.slice(0, 4), 10),
        Number.parseInt(value.slice(4, 6), 10) - 1,
        Number.parseInt(value.slice(6, 8), 10),
      ),
    ).startOf("day");
  }

  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.startOf("day") : null;
}

function formatUntilDate(date: Dayjs): string {
  return `${
    date.endOf("day").toDate().toISOString().replace(/[-:]/g, "").split(".")[0]
  }Z`;
}

function createDefaultCustomDraft(baseDate: Dayjs): CustomRecurrenceDraft {
  return {
    interval: 1,
    unit: "week",
    weekDays: ["MO"],
    endMode: "never",
    endDate: baseDate.startOf("day"),
    count: 1,
  };
}

function getCustomDraftFromRule(
  rule: string,
  fallbackDate: Dayjs,
): CustomRecurrenceDraft {
  const draft = createDefaultCustomDraft(fallbackDate);
  const parsed = parseRuleParts(rule);

  if (parsed.FREQ === "DAILY") {
    draft.unit = "day";
  } else if (parsed.FREQ === "WEEKLY") {
    draft.unit = "week";
  }

  const interval = Number.parseInt(parsed.INTERVAL ?? "1", 10);
  draft.interval = Number.isFinite(interval) && interval > 0 ? interval : 1;

  if (draft.unit === "week") {
    const weekDays = (parsed.BYDAY ?? "")
      .split(",")
      .map((part) => part.trim())
      .filter((part) =>
        WEEKDAY_OPTIONS.some((weekday) => weekday.code === part),
      );

    if (weekDays.length > 0) {
      draft.weekDays = Array.from(new Set(weekDays));
    }
  }

  const count = Number.parseInt(parsed.COUNT ?? "", 10);
  if (Number.isFinite(count) && count > 0) {
    draft.endMode = "count";
    draft.count = count;
  } else {
    const untilDate = parseUntilDate(parsed.UNTIL);
    if (untilDate) {
      draft.endMode = "until";
      draft.endDate = untilDate;
    }
  }

  return draft;
}

function buildCustomRecurrenceRule(draft: CustomRecurrenceDraft): string {
  const parts = [draft.unit === "day" ? "FREQ=DAILY" : "FREQ=WEEKLY"];

  if (draft.interval > 1) {
    parts.push(`INTERVAL=${draft.interval}`);
  }

  if (draft.unit === "week") {
    const weekDays = (draft.weekDays.length > 0 ? draft.weekDays : ["MO"]).join(
      ",",
    );
    parts.push(`BYDAY=${weekDays}`);
  }

  if (draft.endMode === "count") {
    parts.push(`COUNT=${Math.max(1, draft.count)}`);
  } else if (draft.endMode === "until" && draft.endDate) {
    parts.push(`UNTIL=${formatUntilDate(draft.endDate)}`);
  }

  return parts.join(";");
}

export function CalendarEventEdit({
  open,
  event: initialEvent,
  initialDateTime,
  onClose,
  onSave,
  mode = "create",
  display = "modal",
}: CalendarEventEditProps) {
  const intl = useIntl();
  const initialRule = initialEvent?.repeat.rrule ?? null;
  const initialRecurrence = parseRecurrenceRule(initialRule);
  const initialIsCustom = !!initialRule && initialRecurrence.frequency === null;
  const [processing, setProcessing] = useState(false);
  const [isPrivate, setIsPrivate] = useState(
    initialEvent?.isPrivateEvent ?? true,
  );
  const { calendars } = useCalendarLists();
  const [selectedCalendarId, setSelectedCalendarId] = useState<string>(
    initialEvent?.calendarId || calendars[0]?.id || "",
  );

  const [eventDetails, setEventDetails] = useState<ICalendarEvent>(() => {
    if (initialEvent) {
      return { ...initialEvent };
    }

    const begin = initialDateTime || Date.now();
    const end = begin + 60 * 60 * 1000;

    return {
      begin,
      end,
      id: "",
      eventId: "",
      kind: 0,
      title: "",
      createdAt: Date.now(),
      description: "",
      location: [],
      categories: [],
      reference: [],
      geoHash: [],
      participants: [],
      rsvpResponses: [],
      website: "",
      user: "",
      isPrivateEvent: true,
      repeat: {
        rrule: null,
      },
    } as ICalendarEvent;
  });
  const [notificationOffsets, setNotificationOffsets] = useState<number[]>(
    DEFAULT_NOTIFICATION_OFFSETS,
  );
  const [notificationPreferencesLoaded, setNotificationPreferencesLoaded] =
    useState(!initialEvent?.id);
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
    initialIsCustom && initialRule ? toRRuleBody(initialRule) : null,
  );
  const [customDialogOpen, setCustomDialogOpen] = useState(false);
  const [customDraft, setCustomDraft] = useState<CustomRecurrenceDraft>(() =>
    initialIsCustom && initialRule
      ? getCustomDraftFromRule(initialRule, dayjs(eventDetails.begin))
      : createDefaultCustomDraft(dayjs(eventDetails.begin)),
  );

  const handleClose = () => {
    onClose();
  };

  const theme = useTheme();

  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  const updateField = <K extends keyof ICalendarEvent>(
    key: K,
    value: ICalendarEvent[K],
  ) => {
    setEventDetails((prev) => ({ ...prev, [key]: value }));
  };

  useEffect(() => {
    let active = true;

    if (!open) {
      return () => {
        active = false;
      };
    }

    if (!initialEvent?.id) {
      setNotificationOffsets(DEFAULT_NOTIFICATION_OFFSETS);
      setNotificationPreferencesLoaded(true);
      return () => {
        active = false;
      };
    }

    setNotificationPreferencesLoaded(false);
    getNotificationPreference(initialEvent.id)
      .then((preference) => {
        if (!active) {
          return;
        }

        if (preference) {
          setNotificationOffsets(preference.offsetsMinutes);
        } else {
          setNotificationOffsets(DEFAULT_NOTIFICATION_OFFSETS);
        }
        setNotificationPreferencesLoaded(true);
      })
      .catch((error) => {
        console.warn("Failed to load notification preferences", error);
        if (!active) {
          return;
        }
        setNotificationOffsets(DEFAULT_NOTIFICATION_OFFSETS);
        setNotificationPreferencesLoaded(true);
      });

    return () => {
      active = false;
    };
  }, [initialEvent?.id, open]);

  const handleNotificationOffsetChange = (
    index: number,
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const parsed = Number.parseInt(e.target.value, 10);
    setNotificationOffsets((previousOffsets) =>
      previousOffsets.map((offset, currentIndex) =>
        currentIndex === index
          ? Number.isFinite(parsed)
            ? Math.max(0, parsed)
            : 0
          : offset,
      ),
    );
  };

  const addNotificationOffset = () => {
    setNotificationOffsets((previousOffsets) => [...previousOffsets, 0]);
  };

  const removeNotificationOffset = (index: number) => {
    setNotificationOffsets((previousOffsets) =>
      previousOffsets.filter((_, currentIndex) => currentIndex !== index),
    );
  };

  const openCustomDialog = () => {
    setCustomDraft(
      customRule
        ? getCustomDraftFromRule(customRule, dayjs(eventDetails.begin))
        : createDefaultCustomDraft(dayjs(eventDetails.begin)),
    );
    setCustomDialogOpen(true);
  };

  const closeCustomDialog = () => {
    setCustomDialogOpen(false);
    if (!customRule) {
      setIsCustomRecurrence(false);
      setRecurrenceFrequency(RepeatingFrequency.None);
    }
  };

  const applyCustomRule = () => {
    const nextRule = buildCustomRecurrenceRule(customDraft);
    setCustomRule(nextRule);
    setIsCustomRecurrence(true);
    setRecurrenceFrequency(RepeatingFrequency.None);
    setCustomDialogOpen(false);
  };

  const handleSave = async () => {
    setProcessing(true);
    try {
      const normalizedNotificationOffsets =
        normalizeNotificationOffsets(notificationOffsets);
      const rrule = isCustomRecurrence
        ? customRule
        : buildRecurrenceRule({
            frequency: recurrenceFrequency,
            endMode: recurrenceEndMode,
            count: recurrenceCount,
            untilDate: recurrenceUntilDate?.valueOf() ?? null,
            eventStart: eventDetails.begin,
          });
      const eventId = eventDetails.id || uuid();
      const eventToSave = {
        ...eventDetails,
        id: eventId,
        isPrivateEvent: isPrivate,
        repeat: { rrule },
      };

      if (isPrivate) {
        if (mode === "edit") {
          const updates = await editPrivateCalendarEvent(
            eventToSave,
            selectedCalendarId,
          );

          useTimeBasedEvents
            .getState()
            .updateEvent({ ...updates.event, calendarId: updates.calendarId });
        } else {
          await publishPrivateCalendarEvent(eventToSave, selectedCalendarId);
        }
      } else {
        const { id: savedId, pubKey } =
          await publishPublicCalendarEvent(eventToSave);
        useTimeBasedEvents.getState().updateEvent({
          ...eventToSave,
          id: savedId,
          kind: EventKinds.PublicCalendarEvent,
          user: pubKey,
          isPrivateEvent: false,
        });
      }

      if (
        areNotificationOffsetsEqual(
          normalizedNotificationOffsets,
          DEFAULT_NOTIFICATION_OFFSETS,
        )
      ) {
        await clearNotificationPreference(eventId);
      } else {
        await setNotificationPreference(eventId, normalizedNotificationOffsets);
      }

      if (mode === "create" && isPrivate) {
        await cancelEventNotifications(eventId);
        useNotifications.getState().removeNotifications(eventId);

        const calendarPreference = calendars.find(
          (calendar) => calendar.id === selectedCalendarId,
        )?.notificationPreference;

        if (
          shouldScheduleNotifications(
            eventToSave.notificationPreference,
            calendarPreference,
          )
        ) {
          const notifications = await scheduleEventNotifications({
            ...eventToSave,
            calendarId: selectedCalendarId,
          });
          useNotifications.getState().setNotifications(eventId, notifications);
        }
      }

      if (onSave) {
        onSave(eventToSave);
      }

      setProcessing(false);
      onClose();
    } catch (e) {
      console.error(e instanceof Error ? e.message : "Unknown error");
      setProcessing(false);
    }
  };

  const onChangeBeginDate = (value: Dayjs | null) => {
    if (!value) return;
    updateField("begin", value.unix() * 1000);

    const beginDay = value.startOf("day");
    if (
      recurrenceEndMode === "until" &&
      recurrenceUntilDate &&
      recurrenceUntilDate.isBefore(beginDay, "day")
    ) {
      setRecurrenceUntilDate(beginDay);
    }

    if (isCustomRecurrence && customDraft.endMode === "until") {
      setCustomDraft((prev) => {
        if (!prev.endDate || !prev.endDate.isBefore(beginDay, "day")) {
          return prev;
        }

        return {
          ...prev,
          endDate: beginDay,
        };
      });
    }
  };

  const onChangeEndDate = (value: Dayjs | null) => {
    if (!value) return;
    updateField("end", value.unix() * 1000);
  };

  const handleFrequencyChange = (event: SelectChangeEvent<string>) => {
    const value = event.target.value;

    if (value === CUSTOM_RECURRENCE_VALUE) {
      setIsCustomRecurrence(true);
      openCustomDialog();
      return;
    }

    setIsCustomRecurrence(false);
    setRecurrenceFrequency(value as RepeatingFrequency);
  };

  const notificationsValid =
    notificationPreferencesLoaded &&
    notificationOffsets.every(
      (offset) =>
        Number.isInteger(offset) && Number.isFinite(offset) && offset >= 0,
    );
  const handleRecurrenceEndModeChange = (e: SelectChangeEvent<string>) => {
    const value = e.target.value as RecurrenceEndMode;
    setRecurrenceEndMode(value);

    if (value === "count" && recurrenceCount < 1) {
      setRecurrenceCount(1);
    }

    if (value === "until" && !recurrenceUntilDate) {
      setRecurrenceUntilDate(dayjs(eventDetails.begin).startOf("day"));
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
          !recurrenceUntilDate.isBefore(
            dayjs(eventDetails.begin).startOf("day"),
          )));
  const recurrenceSelectValue = isCustomRecurrence
    ? CUSTOM_RECURRENCE_VALUE
    : recurrenceFrequency;
  const customDraftValid =
    customDraft.interval >= 1 &&
    (customDraft.unit !== "week" || customDraft.weekDays.length > 0) &&
    (customDraft.endMode !== "until" || !!customDraft.endDate) &&
    (customDraft.endMode !== "count" || customDraft.count >= 1);

  const buttonDisabled = !(
    !processing &&
    eventDetails.title &&
    eventDetails.begin &&
    eventDetails.end &&
    eventDetails.begin < eventDetails.end &&
    recurrenceValid &&
    notificationsValid
  );

  if (!open || !eventDetails) {
    return null;
  }

  const titleBar = (
    <Box
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <Typography variant="h6" style={{ fontWeight: 600 }}>
        {mode === "edit"
          ? intl.formatMessage({ id: "event.editEvent" })
          : intl.formatMessage({ id: "event.createNewEvent" })}
      </Typography>
      {display === "modal" && (
        <IconButton onClick={handleClose} size="small">
          <CloseIcon />
        </IconButton>
      )}
    </Box>
  );

  const formContent = (
    <Box style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <Box>
        <TextField
          fullWidth
          placeholder={intl.formatMessage({ id: "event.enterTitle" })}
          value={eventDetails.title}
          onChange={(e) => {
            updateField("title", e.target.value);
          }}
          required
          size="small"
        />
      </Box>

      {/* Image URL */}
      <Box>
        <TextField
          fullWidth
          placeholder={intl.formatMessage({
            id: "event.imageUrlPlaceholder",
          })}
          value={eventDetails.image || ""}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
            updateField("image", e.target.value);
          }}
          size="small"
        />
      </Box>
      <Divider />
      {/* Date and Time */}

      <EventAttributeEditContainer>
        <ScheduleIcon />
        <DateTimePicker
          sx={{
            width: "100%",
          }}
          value={dayjs(eventDetails.begin)}
          onChange={onChangeBeginDate}
        />
        {!isMobile && "-"}
        <DateTimePicker
          sx={{
            width: "100%",
          }}
          onChange={onChangeEndDate}
          value={dayjs(eventDetails.end)}
        />
      </EventAttributeEditContainer>

      <Dialog
        open={customDialogOpen}
        onClose={closeCustomDialog}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>
          {intl.formatMessage({ id: "event.customRecurrenceTitle" })}
        </DialogTitle>
        <DialogContent
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: 2,
            pt: "8px !important",
          }}
        >
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            <Typography variant="body2" color="text.secondary">
              {intl.formatMessage({ id: "event.repeatEvery" })}
            </Typography>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <TextField
                size="small"
                type="number"
                value={customDraft.interval}
                onChange={(event) => {
                  const parsed = Number.parseInt(event.target.value, 10);
                  setCustomDraft((prev) => ({
                    ...prev,
                    interval:
                      Number.isFinite(parsed) && parsed > 0 ? parsed : 1,
                  }));
                }}
                inputProps={{ min: 1 }}
                sx={{ width: 84 }}
              />
              <FormControl size="small" sx={{ minWidth: 116 }}>
                <Select
                  value={customDraft.unit}
                  onChange={(event) => {
                    const nextUnit = event.target.value as CustomUnit;
                    setCustomDraft((prev) => ({
                      ...prev,
                      unit: nextUnit,
                      weekDays:
                        nextUnit === "week" && prev.weekDays.length === 0
                          ? ["MO"]
                          : prev.weekDays,
                    }));
                  }}
                >
                  <MenuItem value="day">
                    {intl.formatMessage({ id: "navigation.day" })}
                  </MenuItem>
                  <MenuItem value="week">
                    {intl.formatMessage({ id: "navigation.week" })}
                  </MenuItem>
                </Select>
              </FormControl>
            </Box>
          </Box>

          {customDraft.unit === "week" && (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              <Typography variant="body2" color="text.secondary">
                {intl.formatMessage({ id: "event.repeatOn" })}
              </Typography>
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                {WEEKDAY_OPTIONS.map((weekday) => {
                  const selected = customDraft.weekDays.includes(weekday.code);

                  return (
                    <Button
                      key={weekday.code}
                      variant={selected ? "contained" : "outlined"}
                      onClick={() => {
                        setCustomDraft((prev) => {
                          const hasDay = prev.weekDays.includes(weekday.code);
                          const nextDays = hasDay
                            ? prev.weekDays.filter(
                                (day) => day !== weekday.code,
                              )
                            : [...prev.weekDays, weekday.code];

                          return {
                            ...prev,
                            weekDays: nextDays,
                          };
                        });
                      }}
                      sx={{
                        minWidth: 34,
                        width: 34,
                        height: 34,
                        borderRadius: "999px",
                        p: 0,
                        textTransform: "none",
                      }}
                    >
                      {weekday.label}
                    </Button>
                  );
                })}
              </Box>
            </Box>
          )}

          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            <Typography variant="body2" color="text.secondary">
              {intl.formatMessage({ id: "event.recurrenceEnds" })}
            </Typography>

            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Button
                variant={
                  customDraft.endMode === "never" ? "contained" : "outlined"
                }
                size="small"
                onClick={() => {
                  setCustomDraft((prev) => ({ ...prev, endMode: "never" }));
                }}
              >
                {intl.formatMessage({ id: "event.recurrenceEndsNever" })}
              </Button>
            </Box>

            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Button
                variant={
                  customDraft.endMode === "until" ? "contained" : "outlined"
                }
                size="small"
                onClick={() => {
                  setCustomDraft((prev) => ({ ...prev, endMode: "until" }));
                }}
              >
                {intl.formatMessage({ id: "event.recurrenceEndsOnDate" })}
              </Button>
              <DatePicker
                value={customDraft.endDate}
                disabled={customDraft.endMode !== "until"}
                minDate={dayjs(eventDetails.begin).startOf("day")}
                onChange={(value) => {
                  setCustomDraft((prev) => ({
                    ...prev,
                    endMode: "until",
                    endDate: value ? value.startOf("day") : prev.endDate,
                  }));
                }}
                slotProps={{
                  textField: {
                    size: "small",
                    sx: { width: 152 },
                  },
                }}
              />
            </Box>

            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Button
                variant={
                  customDraft.endMode === "count" ? "contained" : "outlined"
                }
                size="small"
                onClick={() => {
                  setCustomDraft((prev) => ({ ...prev, endMode: "count" }));
                }}
              >
                {intl.formatMessage({ id: "event.recurrenceEndsAfter" })}
              </Button>
              <TextField
                size="small"
                type="number"
                value={customDraft.count}
                disabled={customDraft.endMode !== "count"}
                onChange={(event) => {
                  const parsed = Number.parseInt(event.target.value, 10);
                  setCustomDraft((prev) => ({
                    ...prev,
                    endMode: "count",
                    count: Number.isFinite(parsed) && parsed > 0 ? parsed : 1,
                  }));
                }}
                inputProps={{ min: 1 }}
                sx={{ width: 86 }}
              />
              <Typography variant="body2" color="text.secondary">
                {intl.formatMessage({ id: "event.recurrenceOccurrences" })}
              </Typography>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={closeCustomDialog}>
            {intl.formatMessage({ id: "navigation.cancel" })}
          </Button>
          <Button
            variant="contained"
            onClick={applyCustomRule}
            disabled={!customDraftValid}
          >
            {intl.formatMessage({ id: "navigation.save" })}
          </Button>
        </DialogActions>
      </Dialog>
      <Divider />
      {/* Location */}
      <EventAttributeEditContainer>
        <LocationPinIcon />
        <TextField
          fullWidth
          placeholder={intl.formatMessage({ id: "event.enterLocation" })}
          value={eventDetails.location.join(", ")}
          onChange={(e) => {
            updateField(
              "location",
              e.target.value.split(",").map((loc) => loc.trim()),
            );
          }}
          size="small"
        />
      </EventAttributeEditContainer>
      <Divider />
      {/* Recurrence */}
      <EventAttributeEditContainer>
        <EventRepeatIcon />
        <Box
          sx={{
            width: "100%",
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          <FormControl fullWidth size="small">
            <InputLabel>
              {intl.formatMessage({ id: "event.selectRecurrence" })}
            </InputLabel>
            <Select
              value={recurrenceSelectValue}
              label={intl.formatMessage({ id: "event.selectRecurrence" })}
              onChange={handleFrequencyChange}
              renderValue={(selected) => {
                if (selected === CUSTOM_RECURRENCE_VALUE) {
                  return customRule
                    ? summarizeRecurrenceRule(customRule)
                    : intl.formatMessage({ id: "event.customRecurrence" });
                }

                const labels: Record<string, string> = {
                  [RepeatingFrequency.None]: intl.formatMessage({
                    id: "event.doesNotRepeat",
                  }),
                  [RepeatingFrequency.Daily]: intl.formatMessage({
                    id: "event.daily",
                  }),
                  [RepeatingFrequency.Weekly]: intl.formatMessage({
                    id: "event.weekly",
                  }),
                  [RepeatingFrequency.Weekday]: intl.formatMessage({
                    id: "event.weekdays",
                  }),
                  [RepeatingFrequency.Monthly]: intl.formatMessage({
                    id: "event.monthly",
                  }),
                  [RepeatingFrequency.Quarterly]: intl.formatMessage({
                    id: "event.quarterly",
                  }),
                  [RepeatingFrequency.Yearly]: intl.formatMessage({
                    id: "event.yearly",
                  }),
                };

                return labels[selected] ?? String(selected);
              }}
            >
              <MenuItem value={RepeatingFrequency.None}>
                {intl.formatMessage({ id: "event.doesNotRepeat" })}
              </MenuItem>
              <MenuItem value={RepeatingFrequency.Daily}>
                {intl.formatMessage({ id: "event.daily" })}
              </MenuItem>
              <MenuItem value={RepeatingFrequency.Weekly}>
                {intl.formatMessage({ id: "event.weekly" })}
              </MenuItem>
              <MenuItem value={RepeatingFrequency.Weekday}>
                {intl.formatMessage({ id: "event.weekdays" })}
              </MenuItem>
              <MenuItem value={RepeatingFrequency.Monthly}>
                {intl.formatMessage({ id: "event.monthly" })}
              </MenuItem>
              <MenuItem value={RepeatingFrequency.Quarterly}>
                {intl.formatMessage({ id: "event.quarterly" })}
              </MenuItem>
              <MenuItem value={RepeatingFrequency.Yearly}>
                {intl.formatMessage({ id: "event.yearly" })}
              </MenuItem>
              <MenuItem value={CUSTOM_RECURRENCE_VALUE}>
                {intl.formatMessage({ id: "event.customRecurrence" })}
              </MenuItem>
            </Select>
          </FormControl>

          {isCustomRecurrence && customRule && (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 1,
              }}
            >
              <Typography variant="body2" color="text.secondary">
                {summarizeRecurrenceRule(customRule)}
              </Typography>
              <Button size="small" onClick={openCustomDialog}>
                {intl.formatMessage({ id: "event.customRecurrence" })}
              </Button>
            </Box>
          )}

          {recurrenceEnabled && !isCustomRecurrence && (
            <Box
              sx={{
                display: "flex",
                gap: 2,
                flexDirection: { xs: "column", sm: "row" },
              }}
            >
              <FormControl size="small" sx={{ minWidth: { sm: 180 } }}>
                <InputLabel>
                  {intl.formatMessage({ id: "event.recurrenceEnds" })}
                </InputLabel>
                <Select
                  value={recurrenceEndMode}
                  label={intl.formatMessage({ id: "event.recurrenceEnds" })}
                  onChange={handleRecurrenceEndModeChange}
                >
                  <MenuItem value="never">
                    {intl.formatMessage({ id: "event.recurrenceEndsNever" })}
                  </MenuItem>
                  <MenuItem value="count">
                    {intl.formatMessage({ id: "event.recurrenceEndsAfter" })}
                  </MenuItem>
                  <MenuItem value="until">
                    {intl.formatMessage({ id: "event.recurrenceEndsOnDate" })}
                  </MenuItem>
                </Select>
              </FormControl>

              {recurrenceEndMode === "count" && (
                <TextField
                  size="small"
                  type="number"
                  label={intl.formatMessage({
                    id: "event.recurrenceOccurrences",
                  })}
                  value={recurrenceCount}
                  onChange={handleRecurrenceCountChange}
                  inputProps={{ min: 1 }}
                  sx={{ flex: 1 }}
                />
              )}

              {recurrenceEndMode === "until" && (
                <DatePicker
                  sx={{ flex: 1 }}
                  label={intl.formatMessage({ id: "event.recurrenceEndDate" })}
                  value={recurrenceUntilDate}
                  onChange={(value) =>
                    setRecurrenceUntilDate(value ? value.startOf("day") : null)
                  }
                  minDate={dayjs(eventDetails.begin).startOf("day")}
                  slotProps={{
                    textField: {
                      size: "small",
                      fullWidth: true,
                    },
                  }}
                />
              )}
            </Box>
          )}
        </Box>
      </EventAttributeEditContainer>
      <Divider />
      <EventAttributeEditContainer>
        <NotificationsActiveIcon />
        <Box
          sx={{
            width: "100%",
            display: "flex",
            flexDirection: "column",
            gap: 1.5,
          }}
        >
          <Typography variant="subtitle2">
            {intl.formatMessage({ id: "event.notifications" })}
          </Typography>

          {notificationOffsets.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              {intl.formatMessage({ id: "event.noNotifications" })}
            </Typography>
          ) : (
            notificationOffsets.map((offset, index) => (
              <Box
                key={`notification-offset-${index}`}
                sx={{
                  display: "flex",
                  gap: 1,
                  alignItems: "center",
                }}
              >
                <TextField
                  fullWidth
                  size="small"
                  type="number"
                  label={intl.formatMessage({
                    id: "event.reminderMinutesBefore",
                  })}
                  value={offset}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    handleNotificationOffsetChange(index, e)
                  }
                  inputProps={{ min: 0 }}
                />
                <IconButton
                  aria-label={intl.formatMessage({ id: "navigation.remove" })}
                  onClick={() => removeNotificationOffset(index)}
                  size="small"
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Box>
            ))
          )}

          <Button
            size="small"
            startIcon={<AddIcon />}
            onClick={addNotificationOffset}
            sx={{ alignSelf: "flex-start" }}
          >
            {intl.formatMessage({ id: "event.addReminder" })}
          </Button>
        </Box>
      </EventAttributeEditContainer>
      <Divider />
      {/* Participants */}
      <Box>
        <PeopleIcon />
        <Box style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <ParticipantAdd
            onAdd={(pubKey) => {
              const newParticipants = Array.from(
                new Set([...eventDetails.participants, pubKey]),
              );
              updateField("participants", newParticipants);
            }}
          />

          {eventDetails.participants.length > 0 && (
            <Box style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {eventDetails.participants.map((participant) => (
                <Box
                  key={participant}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "8px 12px",
                    backgroundColor: "#f5f5f5",
                    borderRadius: 4,
                  }}
                >
                  <Participant pubKey={participant} />
                  <Button
                    size="small"
                    color="error"
                    onClick={() => {
                      const newParticipants = eventDetails.participants.filter(
                        (pubKey) => pubKey !== participant,
                      );
                      updateField("participants", newParticipants);
                    }}
                  >
                    {intl.formatMessage({ id: "navigation.remove" })}
                  </Button>
                </Box>
              ))}
            </Box>
          )}
        </Box>
      </Box>
      <Divider />
      {/* Description */}
      <Box>
        <DescriptionIcon />
        <TextField
          fullWidth
          multiline
          rows={4}
          placeholder={intl.formatMessage({ id: "event.addDescription" })}
          value={eventDetails.description}
          onChange={(e) => {
            updateField("description", e.target.value);
          }}
          size="small"
        />
      </Box>

      {/* Calendar Selector */}
      <Box>
        <CalendarListSelect
          value={selectedCalendarId}
          onChange={setSelectedCalendarId}
          label={intl.formatMessage({ id: "event.calendar" })}
        />
      </Box>
      <Divider />

      {/* Privacy Toggle */}
      <Box
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: 12,
          backgroundColor: "#f9f9f9",
          borderRadius: 4,
        }}
      >
        <Typography variant="body2" style={{ fontWeight: 500 }}>
          {intl.formatMessage({ id: "event.eventType" })}
        </Typography>
        <Button
          variant={isPrivate ? "contained" : "outlined"}
          size="small"
          onClick={() => setIsPrivate(!isPrivate)}
          style={{ minWidth: 100 }}
          startIcon={isPrivate ? <LockIcon /> : <PublicIcon />}
        >
          {isPrivate
            ? intl.formatMessage({ id: "event.private" })
            : intl.formatMessage({ id: "event.public" })}
        </Button>
      </Box>
    </Box>
  );

  const actions = (
    <>
      <Box
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
        }}
      >
        <IconButton
          size="small"
          onClick={() => useRelayStore.getState().updateRelayModal(true)}
        >
          <SettingsInputAntennaIcon fontSize="small" />
        </IconButton>
        <Typography variant="caption" color="textSecondary">
          {intl.formatMessage(
            { id: "event.publishingToRelays" },
            { count: getRelays().length },
          )}
        </Typography>
      </Box>
      <Button onClick={handleClose} color="inherit">
        {intl.formatMessage({ id: "navigation.cancel" })}
      </Button>
      <Button
        onClick={handleSave}
        variant="contained"
        disabled={buttonDisabled}
      >
        {processing
          ? intl.formatMessage({ id: "event.saving" })
          : intl.formatMessage({ id: "event.saveEvent" })}
      </Button>
    </>
  );

  if (display === "page") {
    return (
      <Box
        style={{
          maxWidth: 900,
          margin: "0 auto",
          padding: 24,
        }}
      >
        <Box style={{ marginBottom: 24 }}>{titleBar}</Box>
        <Box style={{ marginBottom: 24 }}>{formContent}</Box>
        <Box
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 8,
            padding: "16px 0",
          }}
        >
          {actions}
        </Box>
      </Box>
    );
  }

  return (
    <Dialog
      fullScreen={isMobile}
      open={open}
      onClose={handleClose}
      maxWidth="md"
      fullWidth
    >
      <DialogTitle>{titleBar}</DialogTitle>
      <DialogContent dividers>{formContent}</DialogContent>
      <DialogActions style={{ padding: 16 }}>{actions}</DialogActions>
    </Dialog>
  );
}

export default CalendarEventEdit;
