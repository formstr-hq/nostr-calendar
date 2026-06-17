import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import {
  Box,
  Button,
  IconButton,
  MenuItem,
  Select,
  TextField,
  Typography,
} from "@mui/material";
import React from "react";
import { useIntl } from "react-intl";

type ReminderUnit = "minutes" | "hours" | "days";

interface NotificationPreferenceEditorProps {
  offsets: number[];
  onChange: (offsets: number[]) => void;
}

const UNIT_TO_MINUTES: Record<ReminderUnit, number> = {
  minutes: 1,
  hours: 60,
  days: 24 * 60,
};

function getDisplayUnit(offsetMinutes: number): ReminderUnit {
  if (offsetMinutes > 0 && offsetMinutes % UNIT_TO_MINUTES.days === 0) {
    return "days";
  }

  if (offsetMinutes > 0 && offsetMinutes % UNIT_TO_MINUTES.hours === 0) {
    return "hours";
  }

  return "minutes";
}

function getDisplayValue(offsetMinutes: number, unit: ReminderUnit): string {
  return String(Math.floor(offsetMinutes / UNIT_TO_MINUTES[unit]));
}

export function NotificationPreferenceEditor({
  offsets,
  onChange,
}: NotificationPreferenceEditorProps) {
  const intl = useIntl();

  const updateOffset = (index: number, offsetMinutes: number) => {
    onChange(
      offsets.map((offset, currentIndex) =>
        currentIndex === index ? Math.max(0, offsetMinutes) : offset,
      ),
    );
  };

  const handleValueChange = (
    index: number,
    unit: ReminderUnit,
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const rawValue = e.target.value;
    if (rawValue === "") {
      updateOffset(index, 0);
      return;
    }

    const parsed = Number.parseInt(rawValue, 10);
    updateOffset(
      index,
      Number.isFinite(parsed) ? parsed * UNIT_TO_MINUTES[unit] : 0,
    );
  };

  const handleUnitChange = (index: number, unit: ReminderUnit) => {
    const currentUnit = getDisplayUnit(offsets[index]);
    const displayValue = Number.parseInt(
      getDisplayValue(offsets[index], currentUnit),
      10,
    );

    updateOffset(
      index,
      Number.isFinite(displayValue) ? displayValue * UNIT_TO_MINUTES[unit] : 0,
    );
  };

  const addOffset = () => {
    onChange([...offsets, 0]);
  };

  const removeOffset = (index: number) => {
    onChange(offsets.filter((_, currentIndex) => currentIndex !== index));
  };

  return (
    <Box
      sx={{
        width: "100%",
        display: "flex",
        flexDirection: "column",
        gap: 1.5,
      }}
    >
      {offsets.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          {intl.formatMessage({ id: "event.noNotifications" })}
        </Typography>
      ) : (
        offsets.map((offset, index) => {
          const unit = getDisplayUnit(offset);

          return (
            <Box
              key={`notification-offset-${index}`}
              sx={{
                display: "flex",
                gap: 1,
                alignItems: "center",
              }}
            >
              <TextField
                size="small"
                type="number"
                label={intl.formatMessage({
                  id: "event.reminderValue",
                })}
                value={getDisplayValue(offset, unit)}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  handleValueChange(index, unit, e)
                }
                inputProps={{ min: 0 }}
                sx={{ flex: 1 }}
              />
              <Select
                size="small"
                value={unit}
                onChange={(e) =>
                  handleUnitChange(index, e.target.value as ReminderUnit)
                }
                sx={{ minWidth: 130 }}
              >
                <MenuItem value="minutes">
                  {intl.formatMessage({ id: "event.reminderUnitMinutes" })}
                </MenuItem>
                <MenuItem value="hours">
                  {intl.formatMessage({ id: "event.reminderUnitHours" })}
                </MenuItem>
                <MenuItem value="days">
                  {intl.formatMessage({ id: "event.reminderUnitDays" })}
                </MenuItem>
              </Select>
              <IconButton
                aria-label={intl.formatMessage({ id: "navigation.remove" })}
                onClick={() => removeOffset(index)}
                size="small"
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Box>
          );
        })
      )}

      <Button
        size="small"
        startIcon={<AddIcon />}
        onClick={addOffset}
        sx={{ alignSelf: "flex-start" }}
      >
        {intl.formatMessage({ id: "event.addReminder" })}
      </Button>
    </Box>
  );
}
