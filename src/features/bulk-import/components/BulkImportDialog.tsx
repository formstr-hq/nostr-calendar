import { useState, useMemo, useEffect, useCallback } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputLabel,
  LinearProgress,
  MenuItem,
  Select,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { useIntl } from "react-intl";
import { useCalendarLists } from "../../../stores/calendarLists";
import { useBulkImport } from "../../../stores/bulkImport";
import { useBulkImportSave } from "../hooks/useBulkImportSave";
import { BulkImportEventItem } from "./BulkImportEventItem";
import { buttonHeight, radius } from "../../../theme/tokens";
import dayjs from "dayjs";
import { useDateWithRouting } from "../../../hooks/useDateWithRouting";
import { useLayout } from "../../../hooks/useLayout";
import { getNextOccurrenceInRange } from "../../../utils/repeatingEventsHelper";
import type { DestinationCalendarDraft } from "../../../stores/bulkImport";
import {
  DEFAULT_CALENDAR_COLOR,
  DEFAULT_CALENDAR_TITLE,
} from "../../../utils/calendarListTypes";

export function BulkImportDialog() {
  const intl = useIntl();
  const { isOpen, events, sourceFileName, destinationCalendars, close } =
    useBulkImport();
  const calendars = useCalendarLists((s) => s.calendars);
  const { setDate } = useDateWithRouting();
  const { layout } = useLayout();

  const [selectedCalendarId, setSelectedCalendarId] = useState<string>("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [wasCancelled, setWasCancelled] = useState(false);

  const fallbackCalendarTitle = useMemo(() => {
    return (
      (sourceFileName
        ? sourceFileName
            .replace(/\.(zip|ics|ical)$/i, "")
            .replace(/\.ical$/i, "")
        : "") || DEFAULT_CALENDAR_TITLE
    );
  }, [sourceFileName]);

  const {
    isImporting,
    isCancelling,
    progress,
    error,
    importEvents,
    cancelImport,
  } = useBulkImportSave();

  // Initialize or reset selections when events change
  useEffect(() => {
    if (events.length > 0) {
      setSelectedIds(new Set(events.map((e) => e.id)));
      setSuccessMessage(null);
      setWasCancelled(false);
    }
  }, [events]);

  // Set default calendar
  useEffect(() => {
    if (!selectedCalendarId && calendars.length > 0) {
      const defaultCal =
        calendars.find((c) => c.id === "default") || calendars[0];
      setSelectedCalendarId(defaultCal.id);
    }
  }, [calendars, selectedCalendarId]);

  const allSelected = useMemo(
    () => events.length > 0 && selectedIds.size === events.length,
    [events.length, selectedIds.size],
  );

  const handleToggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(events.map((e) => e.id)));
    }
  };

  const handleToggleOne = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const eventIdToDestCal = useMemo(() => {
    const map = new Map<string, DestinationCalendarDraft>();
    for (const cal of destinationCalendars) {
      for (const id of cal.eventIds) {
        map.set(id, cal);
      }
    }
    return map;
  }, [destinationCalendars]);

  const selectedEvents = useMemo(
    () => events.filter((e) => selectedIds.has(e.id)),
    [events, selectedIds],
  );

  const handleImport = async () => {
    if (selectedEvents.length === 0) return;

    let targetCalendarId = selectedCalendarId;
    if (destinationCalendars.length <= 1) {
      if (!targetCalendarId) {
        if (calendars.length > 0) {
          targetCalendarId = calendars[0].id;
          setSelectedCalendarId(targetCalendarId);
        } else {
          const newCal = await useCalendarLists
            .getState()
            .createCalendar(fallbackCalendarTitle);
          targetCalendarId = newCal.id;
          setSelectedCalendarId(targetCalendarId);
        }
      }
    }

    await importEvents(
      selectedEvents,
      targetCalendarId,
      () => {
        setSuccessMessage(
          intl.formatMessage(
            { id: "bulkImport.importSuccess" },
            { count: selectedEvents.length },
          ),
        );
        setWasCancelled(false);
      },
      () => setWasCancelled(true),
      destinationCalendars.length > 1 ? destinationCalendars : undefined,
    );
  };

  const handleClose = () => {
    if (!isImporting) {
      if (successMessage && selectedEvents.length > 0) {
        const now = Date.now();
        const sorted = [...selectedEvents].sort((a, b) => a.begin - b.begin);
        const upcoming = sorted.find(
          (e) => e.end >= now || (e.repeat?.rrule && e.begin <= now),
        );
        let targetTimestamp: number | null = null;
        if (upcoming) {
          if (upcoming.repeat?.rrule) {
            const nextOcc = getNextOccurrenceInRange(
              upcoming,
              now,
              now + 365 * 24 * 60 * 60 * 1000,
            );
            targetTimestamp = nextOcc ?? upcoming.begin;
          } else {
            targetTimestamp = upcoming.begin;
          }
        } else {
          targetTimestamp = sorted[sorted.length - 1].begin;
        }

        if (targetTimestamp) {
          setDate(dayjs(targetTimestamp), layout);
        }
      }
      close();
    }
  };

  return (
    <Dialog
      open={isOpen}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: `${radius.modal}px`,
          maxHeight: "85vh",
        },
      }}
    >
      <DialogTitle
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          pb: 1,
        }}
      >
        <Box>
          <Typography variant="h6" component="span" sx={{ fontWeight: 700 }}>
            {intl.formatMessage({ id: "bulkImport.title" })}
          </Typography>
          {sourceFileName && (
            <Typography
              variant="caption"
              color="text.secondary"
              display="block"
            >
              {sourceFileName}
            </Typography>
          )}
        </Box>
        <IconButton
          onClick={handleClose}
          disabled={isImporting}
          size="small"
          aria-label="Close"
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent
        dividers
        sx={{ p: 2, display: "flex", flexDirection: "column", gap: 2 }}
      >
        {error && <Alert severity="error">{error}</Alert>}
        {successMessage && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            <Alert severity="success">{successMessage}</Alert>
            {destinationCalendars.length > 0 && (
              <Box
                sx={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 1,
                  p: 1.25,
                  borderRadius: `${radius.card}px`,
                  bgcolor: "action.hover",
                  border: "1px solid",
                  borderColor: "divider",
                }}
              >
                {destinationCalendars.map((cal) => {
                  const count = cal.eventIds.filter((id) =>
                    selectedIds.has(id),
                  ).length;
                  if (count === 0) return null;
                  return (
                    <Box
                      key={cal.name}
                      sx={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 1,
                        px: 1.25,
                        py: 0.5,
                        borderRadius: `${radius.sm}px`,
                        bgcolor: "background.paper",
                      }}
                    >
                      <Box
                        sx={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          bgcolor: cal.color,
                          flexShrink: 0,
                        }}
                      />
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {cal.name}:
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {intl.formatMessage(
                          { id: "bulkImport.eventsFound" },
                          { count },
                        )}
                      </Typography>
                    </Box>
                  );
                })}
              </Box>
            )}
          </Box>
        )}
        {wasCancelled && (
          <Alert severity="info">
            {intl.formatMessage({ id: "bulkImport.importCancelled" })}
          </Alert>
        )}

        {isImporting && (
          <Box sx={{ my: 1 }}>
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                mb: 0.75,
              }}
            >
              <Typography variant="body2" color="text.secondary">
                {intl.formatMessage({ id: "bulkImport.importing" })}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {progress.current} / {progress.total}
              </Typography>
            </Box>
            <LinearProgress
              variant="determinate"
              value={
                progress.total > 0
                  ? (progress.current / progress.total) * 100
                  : 0
              }
              sx={{ borderRadius: `${radius.sm}px`, height: 6 }}
            />
          </Box>
        )}

        {destinationCalendars.length > 1 ? (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ fontWeight: 500 }}
            >
              {intl.formatMessage({ id: "bulkImport.destinationCalendars" })}
            </Typography>
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
              {destinationCalendars.map((cal) => (
                <Box
                  key={cal.name}
                  sx={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 1,
                    px: 1.5,
                    py: 0.75,
                    borderRadius: `${radius.card}px`,
                    border: "1px solid",
                    borderColor: "divider",
                    bgcolor: "action.hover",
                  }}
                >
                  <Box
                    sx={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      bgcolor: cal.color,
                      flexShrink: 0,
                    }}
                  />
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {cal.name}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Box>
        ) : calendars.length > 0 ? (
          <FormControl fullWidth size="small">
            <InputLabel id="bulk-import-cal-label">
              {intl.formatMessage({ id: "event.calendar" })}
            </InputLabel>
            <Select
              labelId="bulk-import-cal-label"
              value={selectedCalendarId}
              label={intl.formatMessage({ id: "event.calendar" })}
              onChange={(e) => setSelectedCalendarId(e.target.value)}
              disabled={isImporting}
            >
              {calendars.map((cal) => (
                <MenuItem key={cal.id} value={cal.id}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <Box
                      sx={{
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        bgcolor: cal.color,
                        flexShrink: 0,
                      }}
                    />
                    <Typography variant="body2">{cal.title}</Typography>
                  </Box>
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        ) : (
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1.5,
              px: 1.5,
              py: 1,
              borderRadius: `${radius.card}px`,
              border: "1px dashed",
              borderColor: "divider",
              bgcolor: "action.hover",
            }}
          >
            <Box
              sx={{
                width: 12,
                height: 12,
                borderRadius: "50%",
                bgcolor: DEFAULT_CALENDAR_COLOR,
                flexShrink: 0,
              }}
            />
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {fallbackCalendarTitle}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {intl.formatMessage({ id: "bulkImport.newCalendarNotice" })}
              </Typography>
            </Box>
          </Box>
        )}

        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            pt: 0.5,
          }}
        >
          <Typography variant="body2" color="text.secondary">
            {intl.formatMessage(
              { id: "bulkImport.eventsFound" },
              { count: events.length },
            )}
          </Typography>
          <Button
            size="small"
            onClick={handleToggleAll}
            disabled={isImporting || events.length === 0}
            sx={{ textTransform: "none" }}
          >
            {allSelected
              ? intl.formatMessage({ id: "bulkImport.deselectAll" })
              : intl.formatMessage({ id: "bulkImport.selectAll" })}
          </Button>
        </Box>

        <Box
          sx={{
            flex: 1,
            overflowY: "auto",
            maxHeight: "360px",
            border: "1px solid",
            borderColor: "divider",
            borderRadius: `${radius.card}px`,
            p: 0.5,
          }}
        >
          {events.map((event) => {
            const destCal = eventIdToDestCal.get(event.id);
            return (
              <BulkImportEventItem
                key={event.id}
                event={event}
                selected={selectedIds.has(event.id)}
                onToggle={() => handleToggleOne(event.id)}
                disabled={isImporting}
                destinationName={destCal?.name}
                destinationColor={destCal?.color}
              />
            );
          })}
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 2.5, py: 1.5, gap: 1 }}>
        {successMessage || wasCancelled ? (
          <Button
            onClick={handleClose}
            disabled={isImporting}
            variant="contained"
            sx={{
              borderRadius: `${radius.card}px`,
              height: buttonHeight.sm,
            }}
          >
            {intl.formatMessage({
              id: successMessage ? "bulkImport.finish" : "bulkImport.close",
            })}
          </Button>
        ) : (
          <>
            <Button
              onClick={isImporting ? cancelImport : handleClose}
              disabled={isImporting && isCancelling}
              variant="outlined"
              sx={{ borderRadius: `${radius.card}px` }}
            >
              {isImporting
                ? intl.formatMessage({
                    id: isCancelling
                      ? "bulkImport.cancelling"
                      : "bulkImport.cancelImport",
                  })
                : intl.formatMessage({ id: "navigation.cancel" })}
            </Button>
            <Button
              onClick={handleImport}
              disabled={isImporting || selectedEvents.length === 0}
              variant="contained"
              sx={{
                borderRadius: `${radius.card}px`,
                height: buttonHeight.sm,
                minWidth: 140,
              }}
            >
              {isImporting ? (
                <CircularProgress size={20} color="inherit" />
              ) : (
                intl.formatMessage(
                  { id: "bulkImport.importSelected" },
                  { count: selectedEvents.length },
                )
              )}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
