import React, { useState } from "react";
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
  MenuItem,
  Select,
  SelectChangeEvent,
  IconButton,
  Divider,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { ICalendarEvent } from "../utils/types";
import {
  buildRecurrenceRule,
  getEventRRules,
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
import { DateTimePicker } from "@mui/x-date-pickers/DateTimePicker";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import dayjs, { Dayjs } from "dayjs";
import LocationPinIcon from "@mui/icons-material/LocationPin";
import EventRepeatIcon from "@mui/icons-material/EventRepeat";
import PeopleIcon from "@mui/icons-material/People";
import DescriptionIcon from "@mui/icons-material/Description";
import { EventAttributeEditContainer } from "./StyledComponents";
import LockIcon from "@mui/icons-material/Lock";
import PublicIcon from "@mui/icons-material/Public";
import SettingsInputAntennaIcon from "@mui/icons-material/SettingsInputAntenna";
import { getRelays } from "../common/nostr";
import { useRelayStore } from "../stores/relays";
import { useCalendarLists } from "../stores/calendarLists";
import { useTimeBasedEvents } from "../stores/events";
import { CalendarListSelect } from "./CalendarListSelect";
import { RecurrenceEditor } from "./RecurrenceEditor";

interface CalendarEventEditProps {
  open: boolean;
  event: ICalendarEvent | null;
  initialDateTime?: number;
  onClose: () => void;
  onSave?: (event: ICalendarEvent) => void;
  mode?: "create" | "edit";
  display?: "modal" | "page";
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
      const recurrenceRules = getEventRRules(initialEvent.repeat);
      return {
        ...initialEvent,
        repeat: {
          rrules: recurrenceRules,
        },
      };
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
        rrules: [],
      },
    } as ICalendarEvent;
  });
  const initialRecurrence = parseRecurrenceRule(
    getEventRRules(initialEvent?.repeat)[0] ?? null,
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

  const syncRecurrenceStateFromRules = (rules: string[]) => {
    const parsed = parseRecurrenceRule(rules[0] ?? null);
    setRecurrenceEndMode(parsed.endMode);
    setRecurrenceCount(parsed.count ?? 1);
    setRecurrenceUntilDate(parsed.untilDate ? dayjs(parsed.untilDate) : null);
  };

  const withRecurrenceEndMode = (
    rules: string[],
    endMode: RecurrenceEndMode,
    count: number,
    untilDate: Dayjs | null,
    eventStart: number = eventDetails.begin,
  ): string[] => {
    if (rules.length !== 1) {
      return rules;
    }

    const parsed = parseRecurrenceRule(rules[0]);
    if (!parsed.frequency) {
      return rules;
    }

    const nextRule = buildRecurrenceRule({
      frequency: parsed.frequency,
      endMode,
      count,
      untilDate: untilDate?.valueOf() ?? null,
      eventStart,
    });

    if (!nextRule) {
      return [];
    }

    return [nextRule];
  };

  const applyRecurrenceEndMode = (
    endMode: RecurrenceEndMode,
    count: number,
    untilDate: Dayjs | null,
    eventStart: number = eventDetails.begin,
  ) => {
    const currentRules = getEventRRules(eventDetails.repeat);
    const nextRules = getEventRRules({
      rrules: withRecurrenceEndMode(
        currentRules,
        endMode,
        count,
        untilDate,
        eventStart,
      ),
    });

    updateField("repeat", {
      rrules: nextRules,
    });
    syncRecurrenceStateFromRules(nextRules);
  };

  const handleSave = async () => {
    setProcessing(true);
    try {
      const eventToSave = { ...eventDetails, isPrivateEvent: isPrivate };

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
        await publishPublicCalendarEvent(eventToSave);
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

    const nextBegin = value.unix() * 1000;
    updateField("begin", nextBegin);

    if (recurrenceEndMode === "until" && recurrenceUntilDate) {
      const beginDay = value.startOf("day");
      const boundedUntil = recurrenceUntilDate.isBefore(beginDay, "day")
        ? beginDay
        : recurrenceUntilDate;

      if (boundedUntil !== recurrenceUntilDate) {
        setRecurrenceUntilDate(boundedUntil);
      }

      applyRecurrenceEndMode(
        recurrenceEndMode,
        recurrenceCount,
        boundedUntil,
        nextBegin,
      );
    }
  };

  const onChangeEndDate = (value: Dayjs | null) => {
    if (!value) return;
    updateField("end", value.unix() * 1000);
  };

  const setRecurrenceRules = (rules: string[]) => {
    const normalizedRules = getEventRRules({ rrules: rules });
    const normalizedWithEndMode = getEventRRules({
      rrules: withRecurrenceEndMode(
        normalizedRules,
        recurrenceEndMode,
        recurrenceCount,
        recurrenceUntilDate,
      ),
    });

    updateField("repeat", {
      rrules: normalizedWithEndMode,
    });
    syncRecurrenceStateFromRules(normalizedWithEndMode);
  };

  const handleRecurrenceEndModeChange = (event: SelectChangeEvent<string>) => {
    const nextMode = event.target.value as RecurrenceEndMode;
    let nextCount = recurrenceCount;
    let nextUntilDate = recurrenceUntilDate;

    if (nextMode === "count" && nextCount < 1) {
      nextCount = 1;
      setRecurrenceCount(1);
    }

    if (nextMode === "until" && !nextUntilDate) {
      nextUntilDate = dayjs(eventDetails.begin).startOf("day");
      setRecurrenceUntilDate(nextUntilDate);
    }

    setRecurrenceEndMode(nextMode);
    applyRecurrenceEndMode(nextMode, nextCount, nextUntilDate);
  };

  const handleRecurrenceCountChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const parsed = Number.parseInt(event.target.value, 10);
    const nextCount = Number.isFinite(parsed) ? Math.max(1, parsed) : 1;
    setRecurrenceCount(nextCount);
    applyRecurrenceEndMode(recurrenceEndMode, nextCount, recurrenceUntilDate);
  };

  const handleRecurrenceUntilDateChange = (value: Dayjs | null) => {
    const normalizedValue = value ? value.startOf("day") : null;
    setRecurrenceUntilDate(normalizedValue);
    applyRecurrenceEndMode(
      recurrenceEndMode,
      recurrenceCount,
      normalizedValue,
    );
  };

  const buttonDisabled = !(
    !processing &&
    eventDetails.title &&
    eventDetails.begin &&
    eventDetails.end &&
    eventDetails.begin < eventDetails.end
  );

  if (!open || !eventDetails) {
    return null;
  }

  const recurrenceRules = getEventRRules(eventDetails.repeat);
  const primaryRecurrence = parseRecurrenceRule(recurrenceRules[0] ?? null);
  const showRecurrenceEndControls =
    recurrenceRules.length === 1 && primaryRecurrence.frequency !== null;

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
      <EventAttributeEditContainer sx={{ alignItems: "flex-start" }}>
        <EventRepeatIcon />
        <Box
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            width: "100%",
          }}
        >
          <RecurrenceEditor
            rules={recurrenceRules}
            onChange={setRecurrenceRules}
          />
          {showRecurrenceEndControls && (
            <Box
              sx={{
                display: "flex",
                gap: 2,
                flexDirection: { xs: "column", sm: "row" },
              }}
            >
              <FormControl
                size="small"
                sx={{
                  minWidth: { sm: 180 },
                  flex: { xs: "1 1 auto", sm: "0 0 180px" },
                }}
              >
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
                  inputProps={{ min: 1 }}
                  label={intl.formatMessage({
                    id: "event.recurrenceOccurrences",
                  })}
                  value={recurrenceCount}
                  onChange={handleRecurrenceCountChange}
                  sx={{ flex: 1 }}
                />
              )}

              {recurrenceEndMode === "until" && (
                <DatePicker
                  sx={{ flex: 1 }}
                  label={intl.formatMessage({ id: "event.recurrenceEndDate" })}
                  value={recurrenceUntilDate}
                  minDate={dayjs(eventDetails.begin).startOf("day")}
                  onChange={handleRecurrenceUntilDateChange}
                  slotProps={{ textField: { size: "small", fullWidth: true } }}
                />
              )}
            </Box>
          )}
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

      {/* Calendar Selector — only shown for private events */}
      {isPrivate && (
        <Box>
          <CalendarListSelect
            value={selectedCalendarId}
            onChange={setSelectedCalendarId}
            label={intl.formatMessage({ id: "event.calendar" })}
          />
        </Box>
      )}
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
