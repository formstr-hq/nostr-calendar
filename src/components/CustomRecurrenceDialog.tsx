import { useEffect, useState } from "react";
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
  Select,
  MenuItem,
} from "@mui/material";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { Dayjs } from "dayjs";
import { useIntl } from "react-intl";
import {
  WEEKDAY_OPTIONS,
  createDefaultCustomDraft,
  getCustomDraftFromRule,
  buildCustomRecurrenceRule,
  type CustomRecurrenceDraft,
  type CustomUnit,
} from "../utils/customRecurrence";

interface CustomRecurrenceDialogProps {
  open: boolean;
  baseDate: Dayjs;
  initialRule: string | null;
  onClose: () => void;
  onApply: (rule: string) => void;
}

export function CustomRecurrenceDialog({
  open,
  baseDate,
  initialRule,
  onClose,
  onApply,
}: CustomRecurrenceDialogProps) {
  const intl = useIntl();
  const [customDraft, setCustomDraft] = useState<CustomRecurrenceDraft>(() =>
    initialRule
      ? getCustomDraftFromRule(initialRule, baseDate)
      : createDefaultCustomDraft(baseDate),
  );

  useEffect(() => {
    if (!open) return;
    setCustomDraft(
      initialRule
        ? getCustomDraftFromRule(initialRule, baseDate)
        : createDefaultCustomDraft(baseDate),
    );
    // Re-seed the draft only when the dialog opens, not on every baseDate tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const customDraftValid =
    customDraft.interval >= 1 &&
    (customDraft.unit !== "week" || customDraft.weekDays.length > 0) &&
    (customDraft.endMode !== "until" || !!customDraft.endDate) &&
    (customDraft.endMode !== "count" || customDraft.count >= 1);

  const applyCustomRule = () => {
    onApply(buildCustomRecurrenceRule(customDraft));
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
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
                  interval: Number.isFinite(parsed) && parsed > 0 ? parsed : 1,
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
                          ? prev.weekDays.filter((day) => day !== weekday.code)
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
              minDate={baseDate.startOf("day")}
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
        <Button onClick={onClose}>
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
  );
}
