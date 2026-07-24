import { Box } from "@mui/material";
import { radius } from "../../theme/tokens";

export interface SegmentedControlOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  options: SegmentedControlOption<T>[];
  value: T;
  onChange: (value: T) => void;
  "aria-label"?: string;
}

/** N-way pill switch — the "ViewSwitcher" primitive in the redesign mockups. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  "aria-label": ariaLabel,
}: SegmentedControlProps<T>) {
  return (
    <Box
      role="radiogroup"
      aria-label={ariaLabel}
      sx={{
        display: "inline-flex",
        bgcolor: "action.hover",
        borderRadius: `${radius.pill}px`,
        p: "3px",
        gap: "2px",
      }}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Box
            key={option.value}
            component="button"
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            sx={{
              border: "none",
              cursor: "pointer",
              px: 1.75,
              py: 0.5,
              fontSize: 13,
              fontWeight: 700,
              fontFamily: "inherit",
              borderRadius: `${radius.pill}px`,
              bgcolor: active ? "background.paper" : "transparent",
              color: active ? "text.primary" : "text.secondary",
              boxShadow: active ? 1 : "none",
              transition: "background-color 0.15s, color 0.15s",
            }}
          >
            {option.label}
          </Box>
        );
      })}
    </Box>
  );
}
