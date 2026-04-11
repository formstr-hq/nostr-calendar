import {
  Box,
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  SelectChangeEvent,
} from "@mui/material";
import { useState } from "react";
import { useIntl } from "react-intl";
import { RepeatingFrequency } from "../utils/types";
import {
  frequencyToRRule,
  getEventRRules,
} from "../utils/repeatingEventsHelper";

interface RecurrenceEditorProps {
  rules: string[];
  onChange: (rules: string[]) => void;
}

const NO_REPEAT_VALUE = "__does_not_repeat__";
const SELECT_RULE_VALUE = "__select_recurrence_rule__";

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

export function RecurrenceEditor({ rules, onChange }: RecurrenceEditorProps) {
  const intl = useIntl();
  const [pendingRuleSlots, setPendingRuleSlots] = useState(0);

  const normalizedRules = getEventRRules({ rrules: rules });

  const updateRules = (nextRules: string[]) => {
    onChange(getEventRRules({ rrules: nextRules }));
  };

  const replaceRuleAt = (index: number, value: string) => {
    const nextRules = [...normalizedRules];
    nextRules[index] = value;
    updateRules(nextRules);
  };

  const removeRuleAt = (index: number) => {
    const nextRules = normalizedRules.filter(
      (_rule, currentIndex) => currentIndex !== index,
    );
    updateRules(nextRules);
    if (nextRules.length === 0) {
      setPendingRuleSlots(0);
    }
  };

  const handleExistingRuleChange = (
    index: number,
    event: SelectChangeEvent<string>,
  ) => {
    const selectedValue = event.target.value;
    if (selectedValue === NO_REPEAT_VALUE) {
      removeRuleAt(index);
      return;
    }

    replaceRuleAt(index, selectedValue);
  };

  const handleInitialRuleChange = (event: SelectChangeEvent<string>) => {
    const selectedValue = event.target.value;
    if (selectedValue === NO_REPEAT_VALUE) {
      updateRules([]);
      return;
    }

    updateRules([selectedValue]);
    setPendingRuleSlots(0);
  };

  const handlePendingRuleChange = (event: SelectChangeEvent<string>) => {
    const selectedValue = event.target.value;
    if (selectedValue === SELECT_RULE_VALUE) {
      return;
    }

    updateRules([...normalizedRules, selectedValue]);
    setPendingRuleSlots(0);
  };

  const handleAddRule = () => {
    if (normalizedRules.length === 0 || pendingRuleSlots > 0) {
      return;
    }

    setPendingRuleSlots(1);
  };

  const selectedRules = new Set(normalizedRules);
  const totalAvailableOptions = recurrenceOptions.length;
  const canAddRule =
    normalizedRules.length > 0 &&
    pendingRuleSlots === 0 &&
    selectedRules.size < totalAvailableOptions;

  return (
    <Box
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        width: "100%",
      }}
    >
      {normalizedRules.length === 0 ? (
        <Box style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          <FormControl fullWidth size="small">
            <InputLabel>
              {intl.formatMessage({ id: "event.selectRecurrence" })}
            </InputLabel>
            <Select
              value={NO_REPEAT_VALUE}
              label={intl.formatMessage({ id: "event.selectRecurrence" })}
              onChange={handleInitialRuleChange}
            >
              <MenuItem value={NO_REPEAT_VALUE}>
                {intl.formatMessage({ id: "event.doesNotRepeat" })}
              </MenuItem>
              {recurrenceOptions.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {intl.formatMessage({ id: option.labelId })}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>
      ) : null}

      {normalizedRules.map((rule, index) => {
        const isCustomRule =
          !!rule && !recurrenceOptions.some((option) => option.value === rule);

        return (
          <Box
            key={`rule-${index}-${rule}`}
            style={{ display: "flex", gap: 8, alignItems: "flex-start" }}
          >
            <FormControl fullWidth size="small">
              <InputLabel>
                {intl.formatMessage({ id: "event.selectRecurrence" })}
              </InputLabel>
              <Select
                value={rule}
                label={intl.formatMessage({ id: "event.selectRecurrence" })}
                onChange={(event) => handleExistingRuleChange(index, event)}
              >
                <MenuItem value={NO_REPEAT_VALUE}>
                  {intl.formatMessage({ id: "event.doesNotRepeat" })}
                </MenuItem>
                {recurrenceOptions.map((option) => (
                  <MenuItem
                    key={option.value}
                    value={option.value}
                    disabled={
                      option.value !== rule && selectedRules.has(option.value)
                    }
                  >
                    {intl.formatMessage({ id: option.labelId })}
                  </MenuItem>
                ))}
                {isCustomRule && <MenuItem value={rule}>{rule}</MenuItem>}
              </Select>
            </FormControl>
            {normalizedRules.length > 1 && (
              <Button
                color="error"
                onClick={() => removeRuleAt(index)}
                sx={{ mt: 0.5 }}
              >
                {intl.formatMessage({ id: "navigation.remove" })}
              </Button>
            )}
          </Box>
        );
      })}

      {pendingRuleSlots > 0 && (
        <Box style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          <FormControl fullWidth size="small">
            <InputLabel>
              {intl.formatMessage({ id: "event.selectRecurrenceRule" })}
            </InputLabel>
            <Select
              value={SELECT_RULE_VALUE}
              label={intl.formatMessage({ id: "event.selectRecurrenceRule" })}
              onChange={handlePendingRuleChange}
            >
              <MenuItem value={SELECT_RULE_VALUE}>
                {intl.formatMessage({ id: "event.selectRecurrenceRule" })}
              </MenuItem>
              {recurrenceOptions.map((option) => (
                <MenuItem
                  key={`pending-${option.value}`}
                  value={option.value}
                  disabled={selectedRules.has(option.value)}
                >
                  {intl.formatMessage({ id: option.labelId })}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Button
            color="error"
            onClick={() => setPendingRuleSlots(0)}
            sx={{ mt: 0.5 }}
          >
            {intl.formatMessage({ id: "navigation.remove" })}
          </Button>
        </Box>
      )}

      <Box>
        <Button
          variant="outlined"
          size="small"
          onClick={handleAddRule}
          disabled={!canAddRule}
        >
          {intl.formatMessage({ id: "event.addMoreRecurrenceRules" })}
        </Button>
      </Box>
    </Box>
  );
}
