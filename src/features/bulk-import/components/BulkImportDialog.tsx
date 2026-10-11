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

export function BulkImportDialog() {
  const intl = useIntl();
  const { isOpen, events, sourceFileName, close } = useBulkImport();
  const calendars = useCalendarLists((s) => s.calendars);

  const [selectedCalendarId, setSelectedCalendarId] = useState<string>("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [wasCancelled, setWasCancelled] = useState(false);

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

  const selectedEvents = useMemo(
    () => events.filter((e) => selectedIds.has(e.id)),
    [events, selectedIds],
  );

  const handleImport = async () => {
    if (!selectedCalendarId || selectedEvents.length === 0) return;

    await importEvents(
      selectedEvents,
      selectedCalendarId,
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
    );
  };

  const handleClose = () => {
    if (!isImporting) {
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
        {successMessage && <Alert severity="success">{successMessage}</Alert>}
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

        {calendars.length > 0 && (
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
          {events.map((event) => (
            <BulkImportEventItem
              key={event.id}
              event={event}
              selected={selectedIds.has(event.id)}
              onToggle={() => handleToggleOne(event.id)}
              disabled={isImporting}
            />
          ))}
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
