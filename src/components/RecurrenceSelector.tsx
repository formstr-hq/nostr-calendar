import {
  Box,
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  SelectChangeEvent,
  TextField,
  Typography,
} from "@mui/material";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import dayjs, { Dayjs } from "dayjs";
import { useIntl } from "react-intl";
import { RepeatingFrequency } from "../utils/types";
import {
  summarizeRecurrenceRule,
  type RecurrenceEndMode,
} from "../utils/repeatingEventsHelper";

export const CUSTOM_RECURRENCE_VALUE = "__custom_rule__";

interface RecurrenceSelectorProps {
  value: RepeatingFrequency | typeof CUSTOM_RECURRENCE_VALUE;
  isCustomRecurrence: boolean;
  customRule: string | null;
  endMode: RecurrenceEndMode;
  count: number;
  untilDate: Dayjs | null;
  eventStart: number;
  onFrequencyChange: (event: SelectChangeEvent<string>) => void;
  onEndModeChange: (event: SelectChangeEvent<string>) => void;
  onCountChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onUntilDateChange: (date: Dayjs | null) => void;
  onEditCustom: () => void;
  /**
   * Which piece to render. Omitted (or "full") renders everything in one
   * block (frequency select + end-mode/custom-summary), the original
   * layout. "trigger" renders only the compact frequency select (for a
   * pill-styled placement, e.g. inline next to a Calendar pill); "details"
   * renders only the custom-rule-summary/end-mode sub-controls (for a
   * separate "More options" advanced box). Both pieces share the same
   * props/handlers — this is a pure render split, no behavior change, and
   * the `data-testid="recurrence-select"`/`"recurrence-end-mode"` contract
   * stays on whichever piece contains that control.
   */
  section?: "trigger" | "details" | "full";
}

const FREQUENCY_LABELS = (
  intl: ReturnType<typeof useIntl>,
): Record<string, string> => ({
  [RepeatingFrequency.None]: intl.formatMessage({ id: "event.doesNotRepeat" }),
  [RepeatingFrequency.Daily]: intl.formatMessage({ id: "event.daily" }),
  [RepeatingFrequency.Weekly]: intl.formatMessage({ id: "event.weekly" }),
  [RepeatingFrequency.Weekday]: intl.formatMessage({ id: "event.weekdays" }),
  [RepeatingFrequency.Monthly]: intl.formatMessage({ id: "event.monthly" }),
  [RepeatingFrequency.Quarterly]: intl.formatMessage({
    id: "event.quarterly",
  }),
  [RepeatingFrequency.Yearly]: intl.formatMessage({ id: "event.yearly" }),
});

function FrequencySelect({
  value,
  customRule,
  onFrequencyChange,
  compact,
}: Pick<
  RecurrenceSelectorProps,
  "value" | "customRule" | "onFrequencyChange"
> & {
  compact?: boolean;
}) {
  const intl = useIntl();
  const labels = FREQUENCY_LABELS(intl);

  const select = (
    <Select
      value={value}
      data-testid="recurrence-select"
      onChange={onFrequencyChange}
      {...(compact
        ? {
            "aria-label": intl.formatMessage({ id: "event.selectRecurrence" }),
            size: "small" as const,
            sx: {
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 600,
              "& .MuiSelect-select": { py: "8px", px: "14px" },
            },
          }
        : { label: intl.formatMessage({ id: "event.selectRecurrence" }) })}
      renderValue={(selected) => {
        if (selected === CUSTOM_RECURRENCE_VALUE) {
          return customRule
            ? summarizeRecurrenceRule(customRule)
            : intl.formatMessage({ id: "event.customRecurrence" });
        }
        return labels[selected] ?? String(selected);
      }}
    >
      <MenuItem value={RepeatingFrequency.None}>
        {intl.formatMessage({ id: "event.doesNotRepeat" })}
      </MenuItem>
      <MenuItem value={RepeatingFrequency.Daily}>
        {intl.formatMessage({ id: "event.daily" })}
      </MenuItem>
      <MenuItem value={RepeatingFrequency.Weekly}>
        {intl.formatMessage({ id: "event.weekly" })}
      </MenuItem>
      <MenuItem value={RepeatingFrequency.Weekday}>
        {intl.formatMessage({ id: "event.weekdays" })}
      </MenuItem>
      <MenuItem value={RepeatingFrequency.Monthly}>
        {intl.formatMessage({ id: "event.monthly" })}
      </MenuItem>
      <MenuItem value={RepeatingFrequency.Quarterly}>
        {intl.formatMessage({ id: "event.quarterly" })}
      </MenuItem>
      <MenuItem value={RepeatingFrequency.Yearly}>
        {intl.formatMessage({ id: "event.yearly" })}
      </MenuItem>
      <MenuItem value={CUSTOM_RECURRENCE_VALUE}>
        {intl.formatMessage({ id: "event.customRecurrence" })}
      </MenuItem>
    </Select>
  );

  if (compact) {
    return select;
  }

  return (
    <FormControl fullWidth size="small">
      <InputLabel>
        {intl.formatMessage({ id: "event.selectRecurrence" })}
      </InputLabel>
      {select}
    </FormControl>
  );
}

function RecurrenceDetails({
  isCustomRecurrence,
  customRule,
  onEditCustom,
  value,
  endMode,
  count,
  untilDate,
  eventStart,
  onEndModeChange,
  onCountChange,
  onUntilDateChange,
}: Omit<RecurrenceSelectorProps, "onFrequencyChange" | "section">) {
  const intl = useIntl();
  const recurrenceEnabled = isCustomRecurrence
    ? !!customRule
    : value !== RepeatingFrequency.None;

  if (isCustomRecurrence && customRule) {
    return (
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1,
        }}
      >
        <Typography variant="body2" color="text.secondary">
          {summarizeRecurrenceRule(customRule)}
        </Typography>
        <Button size="small" onClick={onEditCustom}>
          {intl.formatMessage({ id: "event.customRecurrence" })}
        </Button>
      </Box>
    );
  }

  if (!recurrenceEnabled || isCustomRecurrence) {
    return null;
  }

  return (
    <Box
      sx={{
        display: "flex",
        gap: 2,
        flexDirection: { xs: "column", sm: "row" },
      }}
    >
      <FormControl size="small" sx={{ minWidth: { sm: 180 } }}>
        <InputLabel>
          {intl.formatMessage({ id: "event.recurrenceEnds" })}
        </InputLabel>
        <Select
          value={endMode}
          label={intl.formatMessage({ id: "event.recurrenceEnds" })}
          data-testid="recurrence-end-mode"
          onChange={onEndModeChange}
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

      {endMode === "count" && (
        <TextField
          size="small"
          type="number"
          label={intl.formatMessage({ id: "event.recurrenceOccurrences" })}
          value={count}
          onChange={onCountChange}
          inputProps={{ min: 1 }}
          sx={{ flex: 1 }}
        />
      )}

      {endMode === "until" && (
        <DatePicker
          sx={{ flex: 1 }}
          label={intl.formatMessage({ id: "event.recurrenceEndDate" })}
          value={untilDate}
          onChange={(value) =>
            onUntilDateChange(value ? value.startOf("day") : null)
          }
          minDate={dayjs(eventStart).startOf("day")}
          slotProps={{
            textField: {
              size: "small",
              fullWidth: true,
            },
          }}
        />
      )}
    </Box>
  );
}

export function RecurrenceSelector(props: RecurrenceSelectorProps) {
  const { section = "full" } = props;

  if (section === "trigger") {
    return (
      <FrequencySelect
        value={props.value}
        customRule={props.customRule}
        onFrequencyChange={props.onFrequencyChange}
        compact
      />
    );
  }

  if (section === "details") {
    return <RecurrenceDetails {...props} />;
  }

  return (
    <Box
      sx={{ width: "100%", display: "flex", flexDirection: "column", gap: 2 }}
    >
      <FrequencySelect
        value={props.value}
        customRule={props.customRule}
        onFrequencyChange={props.onFrequencyChange}
      />
      <RecurrenceDetails {...props} />
    </Box>
  );
}
