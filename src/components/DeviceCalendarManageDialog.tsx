import { useEffect, useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  IconButton,
  useMediaQuery,
  useTheme,
  CircularProgress,
  Alert,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import CircleIcon from "@mui/icons-material/Circle";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import { useIntl } from "react-intl";
import type { DeviceCalendarInfo } from "../plugins/deviceCalendar";
import { useDeviceCalendars } from "../stores/deviceCalendars";
import { deviceCalendarColor } from "../utils/deviceCalendarAdapter";
import { PRESET_COLORS } from "../utils/calendarColorPresets";

interface DeviceCalendarManageDialogProps {
  open: boolean;
  onClose: () => void;
  deviceCalendar: DeviceCalendarInfo;
  onSaveColor: (color: string) => Promise<void>;
}

/**
 * Color-only manage dialog for device (OS-calendar) calendars — name/account
 * are read-only, no notification preference (no per-calendar concept for
 * device calendars), no delete action. See `CalendarManageDialog` for the
 * full Nostr calendar create/edit dialog this mirrors the shell of.
 */
export function DeviceCalendarManageDialog({
  open,
  onClose,
  deviceCalendar,
  onSaveColor,
}: DeviceCalendarManageDialogProps) {
  const intl = useIntl();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const colorOverrides = useDeviceCalendars((s) => s.colorOverrides);
  const resolvedColor = deviceCalendarColor(
    deviceCalendar,
    colorOverrides[deviceCalendar.id],
  );

  const [color, setColor] = useState(resolvedColor);
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState(false);

  useEffect(() => {
    if (!open) return;
    setColor(resolvedColor);
    setPending(false);
    setActionError(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceCalendar, open]);

  const handleSave = async () => {
    setPending(true);
    setActionError(false);
    try {
      await onSaveColor(color);
      onClose();
    } catch (error) {
      console.error("Failed to save device calendar color", error);
      setActionError(true);
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog
      fullScreen={isMobile}
      open={open}
      onClose={pending ? undefined : onClose}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle
        sx={{ pt: isMobile ? "calc(16px + var(--safe-area-top))" : 2 }}
      >
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Box display="flex" alignItems="center" gap={1}>
            <CircleIcon sx={{ fontSize: 16, color }} />
            <Typography variant="h6" fontWeight={600}>
              {deviceCalendar.name.trim() ||
                intl.formatMessage({ id: "deviceCalendar.unnamed" })}
            </Typography>
          </Box>
          <IconButton onClick={onClose} size="small" disabled={pending}>
            <CloseIcon />
          </IconButton>
        </Box>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ pl: 3.5, display: "block" }}
        >
          {deviceCalendar.accountName ||
            intl.formatMessage({ id: "deviceCalendar.localDevice" })}
          {" · "}
          {deviceCalendar.canWrite
            ? intl.formatMessage({ id: "calendarManage.readWrite" })
            : intl.formatMessage({ id: "calendarManage.readOnly" })}
        </Typography>
      </DialogTitle>

      <DialogContent dividers>
        <Box display="flex" flexDirection="column" gap={3}>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              bgcolor: "action.hover",
              borderRadius: 2,
              px: 1.5,
              py: 1,
            }}
          >
            <InfoOutlinedIcon sx={{ fontSize: 16, color: "text.secondary" }} />
            <Typography variant="caption" color="text.secondary">
              {intl.formatMessage({ id: "calendarManage.deviceReadOnlyNote" })}
            </Typography>
          </Box>

          <Box>
            <Typography variant="body2" mb={1} fontWeight={500}>
              {intl.formatMessage({ id: "calendarManage.color" })}
            </Typography>
            <Box display="flex" gap={1} flexWrap="wrap">
              {PRESET_COLORS.map((presetColor) => (
                <IconButton
                  key={presetColor}
                  aria-label={`${intl.formatMessage({
                    id: "calendarManage.color",
                  })} ${presetColor}`}
                  aria-pressed={color === presetColor}
                  data-color={presetColor}
                  onClick={() => setColor(presetColor)}
                  sx={{
                    p: 0.5,
                    border:
                      color === presetColor
                        ? `2px solid ${presetColor}`
                        : "2px solid transparent",
                    borderRadius: "50%",
                  }}
                >
                  <CircleIcon sx={{ fontSize: 24, color: presetColor }} />
                </IconButton>
              ))}
            </Box>
          </Box>

          <Typography
            variant="caption"
            color="text.secondary"
            sx={{
              bgcolor: "action.hover",
              borderRadius: 2,
              p: 1.5,
              lineHeight: 1.5,
            }}
          >
            {intl.formatMessage({
              id: "calendarManage.deviceColorFallbackNote",
            })}
          </Typography>
          {actionError ? (
            <Alert severity="error">
              {intl.formatMessage({ id: "calendarManage.actionFailed" })}
            </Alert>
          ) : null}
        </Box>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} color="inherit" disabled={pending}>
          {intl.formatMessage({ id: "navigation.cancel" })}
        </Button>
        <Button
          onClick={handleSave}
          variant="contained"
          disabled={pending}
          startIcon={
            pending ? <CircularProgress size={16} color="inherit" /> : undefined
          }
        >
          {intl.formatMessage({ id: "navigation.save" })}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
