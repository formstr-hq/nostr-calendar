import {
  Box,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { useIntl } from "react-intl";

const MAX_ADVANCE_OPTIONS = [
  { label: "7 days", value: 604800 },
  { label: "14 days", value: 1209600 },
  { label: "30 days", value: 2592000 },
  { label: "60 days", value: 5184000 },
  { label: "90 days", value: 7776000 },
];

const BUFFER_OPTIONS = [
  { label: "None", value: 0 },
  { label: "5 min", value: 300 },
  { label: "10 min", value: 600 },
  { label: "15 min", value: 900 },
  { label: "30 min", value: 1800 },
];

interface BookingSettingsSectionProps {
  maxAdvance: number;
  buffer: number;
  onMaxAdvanceChange: (value: number) => void;
  onBufferChange: (value: number) => void;
}

export function BookingSettingsSection({
  maxAdvance,
  buffer,
  onMaxAdvanceChange,
  onBufferChange,
}: BookingSettingsSectionProps) {
  const intl = useIntl();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
        gap: 2,
      }}
    >
      <FormControl fullWidth size="small">
        <InputLabel>
          {intl.formatMessage({ id: "scheduling.maxAdvanceBooking" })}
        </InputLabel>
        <Select
          value={maxAdvance}
          label={intl.formatMessage({ id: "scheduling.maxAdvanceBooking" })}
          onChange={(e) => onMaxAdvanceChange(Number(e.target.value))}
        >
          {MAX_ADVANCE_OPTIONS.map((opt) => (
            <MenuItem key={opt.value} value={opt.value}>
              {opt.label}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      <FormControl fullWidth size="small">
        <InputLabel>
          {intl.formatMessage({ id: "scheduling.bufferBetween" })}
        </InputLabel>
        <Select
          value={buffer}
          label={intl.formatMessage({ id: "scheduling.bufferBetween" })}
          onChange={(e) => onBufferChange(Number(e.target.value))}
        >
          {BUFFER_OPTIONS.map((opt) => (
            <MenuItem key={opt.value} value={opt.value}>
              {opt.label}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
    </Box>
  );
}
