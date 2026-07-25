import { Box, Button, Divider } from "@mui/material";
import { useIntl } from "react-intl";
import { RelayDots } from "../../../components/RelayDots";
import type { RelayStatusMap } from "../../../utils/types";

interface BookingEditFooterProps {
  isEditMode: boolean;
  savedNAddr: string | null;
  processing: boolean;
  canSave: boolean;
  onCancel: () => void;
  onSave: () => void;
  relayDotsLabel: string;
  publishingRelays: string[];
  relayStatus: RelayStatusMap;
  isPublishing: boolean;
}

export function BookingEditFooter({
  isEditMode,
  savedNAddr,
  processing,
  canSave,
  onCancel,
  onSave,
  relayDotsLabel,
  publishingRelays,
  relayStatus,
  isPublishing,
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
        {isPublishing && (
          <RelayDots
            relays={publishingRelays}
            relayStatus={relayStatus}
            label={relayDotsLabel}
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
