import { Box, Button, Divider } from "@mui/material";
import { useIntl } from "react-intl";
import { PublishActivityPanel } from "../../../components/PublishActivityPanel";
import type { PublishStepState } from "../../../stores/publishActivity";

interface BookingEditFooterProps {
  isEditMode: boolean;
  savedNAddr: string | null;
  processing: boolean;
  canSave: boolean;
  onCancel: () => void;
  onSave: () => void;
  steps: PublishStepState[];
  hasRelayErrors: boolean;
  onDetailsClick: () => void;
}

export function BookingEditFooter({
  isEditMode,
  savedNAddr,
  processing,
  canSave,
  onCancel,
  onSave,
  steps,
  hasRelayErrors,
  onDetailsClick,
}: BookingEditFooterProps) {
  const intl = useIntl();

  return (
    <Box sx={{ mt: "auto" }}>
      <Divider sx={{ my: 2 }} />
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 1,
          flexWrap: "wrap",
        }}
      >
        {steps.length > 0 && (
          <PublishActivityPanel
            steps={steps}
            showCompleted
            onDetailsClick={hasRelayErrors ? onDetailsClick : undefined}
            detailsLabel={
              hasRelayErrors
                ? intl.formatMessage({ id: "event.relayDetails" })
                : undefined
            }
          />
        )}
        <Button color="inherit" onClick={onCancel}>
          Cancel
        </Button>
        {(isEditMode || !savedNAddr) && (
          <Button variant="contained" disabled={!canSave} onClick={onSave}>
            {processing
              ? intl.formatMessage({ id: "scheduling.saving" })
              : isEditMode
                ? intl.formatMessage({ id: "scheduling.updatePageButton" })
                : intl.formatMessage({
                    id: "scheduling.createSchedulingPageButton",
                  })}
          </Button>
        )}
      </Box>
    </Box>
  );
}
