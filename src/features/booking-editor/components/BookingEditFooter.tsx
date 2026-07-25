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
    <>
      <Divider sx={{ my: 2 }} />
      {isPublishing && (
        <Box sx={{ mb: 1.5 }}>
          <RelayDots
            relays={publishingRelays}
            relayStatus={relayStatus}
            label={relayDotsLabel}
          />
        </Box>
      )}
      <Box
        sx={{
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
          gap: 1,
          pb: 4,
          flexWrap: "wrap",
        }}
      >
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
    </>
  );
}
