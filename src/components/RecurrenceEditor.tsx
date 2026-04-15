import {
  Box,
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  SelectChangeEvent,
} from "@mui/material";
import { useIntl } from "react-intl";
import { RepeatingFrequency } from "../utils/types";
import {
  frequencyToRRule,
  getEventRRules,
  normalizeRRule,
} from "../utils/repeatingEventsHelper";

interface RecurrenceReplaceContext {
  index: number;
  previousRule: string;
  nextRule: string;
  rules: string[];
}

interface RecurrenceEditorProps {
  rules: string[];
  onChange: (rules: string[]) => void;
  onReplaceRule?: (
    context: RecurrenceReplaceContext,
  ) => string[] | undefined;
}

const recurrenceOptions: Array<{ value: string; labelId: string }> = [
  {
    value: frequencyToRRule(RepeatingFrequency.Daily)!,
    labelId: "event.daily",
  },
  {
    value: frequencyToRRule(RepeatingFrequency.Weekly)!,
    labelId: "event.weekly",
  },
  {
    value: frequencyToRRule(RepeatingFrequency.Weekday)!,
    labelId: "event.weekdays",
  },
  {
    value: frequencyToRRule(RepeatingFrequency.Monthly)!,
    labelId: "event.monthly",
  },
  {
    value: frequencyToRRule(RepeatingFrequency.Quarterly)!,
    labelId: "event.quarterly",
  },
  {
    value: frequencyToRRule(RepeatingFrequency.Yearly)!,
    labelId: "event.yearly",
  },
];

export function RecurrenceEditor({
  rules,
  onChange,
  onReplaceRule,
}: RecurrenceEditorProps) {
  const intl = useIntl();

  const normalizedRules = getEventRRules({ rrules: rules });
  const displayedRules = normalizedRules.length > 0 ? normalizedRules : [""];

  const updateRules = (nextRules: string[]) => {
    onChange(getEventRRules({ rrules: nextRules }));
  };

  const handleRuleChange = (index: number, event: SelectChangeEvent<string>) => {
    const selectedRule = normalizeRRule(event.target.value);
    const editableRules = [...displayedRules];
    const previousRule = editableRules[index] ?? "";

    editableRules[index] = selectedRule;
    const nextRules = editableRules.filter(Boolean);

    const replacedRules = onReplaceRule?.({
      index,
      previousRule,
      nextRule: selectedRule,
      rules: nextRules,
    });

    updateRules(replacedRules ?? nextRules);
  };

  const handleAddRule = () => {
    const defaultRule = frequencyToRRule(RepeatingFrequency.Daily);
    if (!defaultRule) {
      return;
    }

    updateRules([...normalizedRules, defaultRule]);
  };

  const handleRemoveRule = (index: number) => {
    updateRules(normalizedRules.filter((_, currentIndex) => currentIndex !== index));
  };

  return (
    <Box style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%" }}>
      {displayedRules.map((rule, index) => {
        const isCustomRule =
          !!rule && !recurrenceOptions.some((option) => option.value === rule);

        return (
          <Box
            key={`${rule || "none"}-${index}`}
            style={{ display: "flex", gap: 8, alignItems: "center" }}
          >
            <FormControl fullWidth size="small">
              <InputLabel>
                {intl.formatMessage({ id: "event.selectRecurrence" })}
              </InputLabel>
              <Select
                value={rule}
                label={intl.formatMessage({ id: "event.selectRecurrence" })}
                onChange={(event) => handleRuleChange(index, event)}
              >
                <MenuItem value="">
                  {intl.formatMessage({ id: "event.doesNotRepeat" })}
                </MenuItem>
                {recurrenceOptions.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {intl.formatMessage({ id: option.labelId })}
                  </MenuItem>
                ))}
                {isCustomRule && <MenuItem value={rule}>{rule}</MenuItem>}
              </Select>
            </FormControl>
            {displayedRules.length > 1 && (
              <Button color="error" onClick={() => handleRemoveRule(index)}>
                {intl.formatMessage({ id: "navigation.remove" })}
              </Button>
            )}
          </Box>
        );
      })}

      <Box>
        <Button onClick={handleAddRule}>
          {intl.formatMessage({ id: "navigation.add" })}
        </Button>
      </Box>
    </Box>
  );
}
