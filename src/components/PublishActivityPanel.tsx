import { Box, Button, Typography } from "@mui/material";
import { useIntl } from "react-intl";
import { RelayDots } from "./RelayDots";
import type { PublishStepState } from "../stores/publishActivity";

interface PublishActivityPanelProps {
  steps: PublishStepState[];
  /** True when no flow is in flight (e.g. before Save is pressed). */
  idle?: boolean;
  /** Keep the final successful step visible after a completed flow. */
  showCompleted?: boolean;
  onDetailsClick?: () => void;
  detailsLabel?: string;
}

export function PublishActivityPanel({
  steps,
  idle,
  showCompleted = false,
  onDetailsClick,
  detailsLabel,
}: PublishActivityPanelProps) {
  const intl = useIntl();

  // Show only the first step that hasn't finished successfully — completed
  // steps drop out of view as the flow progresses, so at most one row is
  // visible at a time. Some save screens remain open after a successful flow;
  // those can opt into retaining the final confirmation row.
  const currentStep =
    steps.find((step) => step.status !== "ok") ??
    (showCompleted ? steps.at(-1) : undefined);

  if (!currentStep) {
    return null;
  }

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: 0.75,
        flex: 1,
        minWidth: 0,
      }}
    >
      <RelayDots
        relays={currentStep.relays}
        relayStatus={currentStep.relayStatus}
        label={intl.formatMessage({ id: currentStep.labelId })}
        idle={idle}
      />
      {onDetailsClick && detailsLabel && (
        <Button
          size="small"
          sx={{
            alignSelf: "flex-start",
            minWidth: "auto",
            p: 0.5,
            textTransform: "none",
          }}
          onClick={onDetailsClick}
        >
          <Typography variant="caption">{detailsLabel}</Typography>
        </Button>
      )}
    </Box>
  );
}
