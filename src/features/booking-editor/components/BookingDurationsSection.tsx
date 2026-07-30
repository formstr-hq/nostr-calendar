import { Box, Chip, IconButton, TextField } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { useIntl } from "react-intl";

const PRESET_DURATIONS = [15, 30, 60];

function durationLabel(mins: number) {
  return mins >= 60 ? `${mins / 60}h` : `${mins}m`;
}

interface BookingDurationsSectionProps {
  slotDurations: number[];
  toggleDuration: (mins: number) => void;
  customDuration: string;
  setCustomDuration: (value: string) => void;
  addCustomDuration: () => void;
}

export function BookingDurationsSection({
  slotDurations,
  toggleDuration,
  customDuration,
  setCustomDuration,
  addCustomDuration,
}: BookingDurationsSectionProps) {
  const intl = useIntl();
  return (
    <Box
      sx={{
        display: "flex",
        flexWrap: "wrap",
        gap: 1,
        alignItems: "center",
      }}
    >
      {PRESET_DURATIONS.map((mins) => (
        <Chip
          key={mins}
          label={durationLabel(mins)}
          color={slotDurations.includes(mins) ? "primary" : "default"}
          variant={slotDurations.includes(mins) ? "filled" : "outlined"}
          onClick={() => toggleDuration(mins)}
        />
      ))}
      {slotDurations
        .filter((m) => !PRESET_DURATIONS.includes(m))
        .map((mins) => (
          <Chip
            key={mins}
            label={durationLabel(mins)}
            color="primary"
            onDelete={() => toggleDuration(mins)}
          />
        ))}
      <TextField
        type="number"
        size="small"
        label={intl.formatMessage({ id: "scheduling.customDuration" })}
        placeholder={intl.formatMessage({
          id: "scheduling.customDurationPlaceholder",
        })}
        value={customDuration}
        onChange={(e) => setCustomDuration(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            addCustomDuration();
          }
        }}
        sx={{ width: 170 }}
        slotProps={{ htmlInput: { min: 1 } }}
      />
      <IconButton
        size="small"
        onClick={addCustomDuration}
        disabled={!customDuration}
      >
        <AddIcon fontSize="small" />
      </IconButton>
    </Box>
  );
}
