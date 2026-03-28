import { useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Box,
  Typography,
  IconButton,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import CircleIcon from "@mui/icons-material/Circle";
import type { ICalendarList } from "../utils/calendarListTypes";
import { useIntl } from "react-intl";

const PRESET_COLORS = [
  "#4285f4", // Blue
  "#0b8043", // Green
  "#8e24aa", // Purple
  "#d50000", // Red
  "#f4511e", // Orange
  "#f6bf26", // Yellow
  "#039be5", // Light Blue
  "#616161", // Grey
  "#e67c73", // Pink
  "#33b679", // Teal
];

interface CalendarManageDialogProps {
  open: boolean;
  onClose: () => void;
  calendar?: ICalendarList;
  onSave: (data: { title: string; description: string; color: string }) => void;
  onDelete?: () => void;
  /** When true, the dialog cannot be dismissed — used for onboarding when no calendars exist. */
  blocking?: boolean;
}

export function CalendarManageDialog({
  open,
  onClose,
  calendar,
  onSave,
  onDelete,
  blocking = false,
}: CalendarManageDialogProps) {
  const [title, setTitle] = useState(calendar?.title || "");
  const [description, setDescription] = useState(calendar?.description || "");
  const [color, setColor] = useState(calendar?.color || PRESET_COLORS[0]);
  const intl = useIntl();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  const handleSave = () => {
    if (!title.trim()) return;
    onSave({ title: title.trim(), description: description.trim(), color });
    onClose();
  };

  const isEdit = !!calendar;

  return (
    <Dialog
      fullScreen={isMobile}
      open={open}
      onClose={blocking ? undefined : onClose}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Typography variant="h6" fontWeight={600}>
            {isEdit
              ? intl.formatMessage({ id: "calendarManage.editCalendar" })
              : intl.formatMessage({ id: "calendarManage.newCalendar" })}
          </Typography>
          {!blocking && (
            <IconButton onClick={onClose} size="small">
              <CloseIcon />
            </IconButton>
          )}
        </Box>
      </DialogTitle>

      <DialogContent dividers>
        <Box display="flex" flexDirection="column" gap={3}>
          {blocking && (
            <Typography variant="body2" color="text.secondary">
              {intl.formatMessage({
                id: "calendarManage.onboardingExplanation",
              })}
            </Typography>
          )}
          <TextField
            fullWidth
            label={intl.formatMessage({ id: "calendarManage.calendarName" })}
            placeholder={intl.formatMessage({
              id: "calendarManage.calendarNamePlaceholder",
            })}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            size="small"
          />

          <TextField
            fullWidth
            label={intl.formatMessage({ id: "navigation.description" })}
            placeholder={intl.formatMessage({
              id: "calendarManage.optionalDescription",
            })}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            multiline
            rows={2}
            size="small"
          />

          <Box>
            <Typography variant="body2" mb={1} fontWeight={500}>
              {intl.formatMessage({ id: "calendarManage.color" })}
            </Typography>
            <Box display="flex" gap={1} flexWrap="wrap">
              {PRESET_COLORS.map((presetColor) => (
                <IconButton
                  key={presetColor}
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
        </Box>
      </DialogContent>

      <DialogActions sx={{ padding: 2 }}>
        {isEdit && onDelete && (
          <Button color="error" onClick={onDelete} sx={{ mr: "auto" }}>
            {intl.formatMessage({ id: "navigation.delete" })}
          </Button>
        )}
        {!blocking && (
          <Button onClick={onClose} color="inherit">
            {intl.formatMessage({ id: "navigation.cancel" })}
          </Button>
        )}
        <Button
          onClick={handleSave}
          variant="contained"
          disabled={!title.trim()}
        >
          {isEdit
            ? intl.formatMessage({ id: "navigation.save" })
            : intl.formatMessage({ id: "navigation.create" })}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
