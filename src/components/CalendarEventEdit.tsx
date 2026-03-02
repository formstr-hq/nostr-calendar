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
  frequencyToRRule,
  rruleToFrequency,
} from "../utils/repeatingEventsHelper";
import { ParticipantAdd } from "./ParticipantAdd";
import ScheduleIcon from "@mui/icons-material/Schedule";
import { Participant } from "./Participant";
import {
  publishPrivateCalendarEvent,
  publishPublicCalendarEvent,
} from "../common/nostr";
import { DateTimePicker } from "@mui/x-date-pickers/DateTimePicker";
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

interface CalendarEventEditProps {
  open: boolean;
  event: ICalendarEvent | null;
  initialDateTime?: number;
  onClose: () => void;
  onSave?: (event: ICalendarEvent) => void;
  mode?: "create" | "edit";
}

export function CalendarEventEdit({
  open,
  event: initialEvent,
  initialDateTime,
  onClose,
  onSave,
  mode = "create",
}: CalendarEventEditProps) {
  const [processing, setProcessing] = useState(false);
  const [isPrivate, setIsPrivate] = useState(
    initialEvent?.isPrivateEvent ?? true,
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

  const handleSave = async () => {
    setProcessing(true);
    try {
      const eventToSave = { ...eventDetails, isPrivateEvent: isPrivate };

      if (isPrivate) {
        await publishPrivateCalendarEvent(eventToSave);
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
    updateField("begin", value.unix() * 1000);
  };

  const onChangeEndDate = (value: Dayjs | null) => {
    if (!value) return;
    updateField("end", value.unix() * 1000);
  };

  const handleFrequencyChange = (e: SelectChangeEvent<string>) => {
    const value = e.target.value as RepeatingFrequency;
    updateField("repeat", {
      rrule: value !== RepeatingFrequency.None ? frequencyToRRule(value) : null,
    });
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

  return (
    <Dialog
      fullScreen={isMobile}
      open={open}
      onClose={handleClose}
      maxWidth="md"
      fullWidth
    >
      <DialogTitle>
        <Box
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Typography variant="h6" style={{ fontWeight: 600 }}>
            {mode === "edit" ? "Edit Event" : "Create New Event"}
          </Typography>
          <IconButton onClick={handleClose} size="small">
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent dividers>
        <Box style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <Box>
            <TextField
              fullWidth
              placeholder="Enter event title"
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
              placeholder="Image URL eg. https://example.com/image.jpg"
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
              placeholder="Enter location"
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
            <FormControl fullWidth size="small">
              <InputLabel>Select recurrence pattern</InputLabel>
              <Select
                value={
                  (eventDetails.repeat.rrule
                    ? rruleToFrequency(eventDetails.repeat.rrule)
                    : null) || RepeatingFrequency.None
                }
                label="Select recurrence pattern"
                onChange={handleFrequencyChange}
              >
                <MenuItem value={RepeatingFrequency.None}>
                  Does not repeat
                </MenuItem>
                <MenuItem value={RepeatingFrequency.Daily}>Daily</MenuItem>
                <MenuItem value={RepeatingFrequency.Weekly}>Weekly</MenuItem>
                <MenuItem value={RepeatingFrequency.Weekday}>
                  Weekdays (Mon-Fri)
                </MenuItem>
                <MenuItem value={RepeatingFrequency.Monthly}>Monthly</MenuItem>
                <MenuItem value={RepeatingFrequency.Quarterly}>
                  Quarterly
                </MenuItem>
                <MenuItem value={RepeatingFrequency.Yearly}>Yearly</MenuItem>
              </Select>
            </FormControl>
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
                <Box
                  style={{ display: "flex", flexDirection: "column", gap: 8 }}
                >
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
                          const newParticipants =
                            eventDetails.participants.filter(
                              (pubKey) => pubKey !== participant,
                            );
                          updateField("participants", newParticipants);
                        }}
                      >
                        Remove
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
              placeholder="Add event description..."
              value={eventDetails.description}
              onChange={(e) => {
                updateField("description", e.target.value);
              }}
              size="small"
            />
          </Box>

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
              Event Type
            </Typography>
            <Button
              variant={isPrivate ? "contained" : "outlined"}
              size="small"
              onClick={() => setIsPrivate(!isPrivate)}
              style={{ minWidth: 100 }}
              startIcon={isPrivate ? <LockIcon /> : <PublicIcon />}
            >
              {isPrivate ? "Private" : "Public"}
            </Button>
          </Box>
        </Box>
      </DialogContent>

      <DialogActions style={{ padding: 16 }}>
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
            Publishing to {getRelays().length} relay(s)
          </Typography>
        </Box>
        <Button onClick={handleClose} color="inherit">
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          variant="contained"
          disabled={buttonDisabled}
        >
          {processing ? "Saving..." : "Save Event"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default CalendarEventEdit;
