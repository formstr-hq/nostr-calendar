import { Box, Button, Typography } from "@mui/material";
import { useIntl } from "react-intl";
import { PublishActivityPanel } from "../../../components/PublishActivityPanel";
import type { PublishStepState } from "../../../stores/publishActivity";

interface EventEditFooterProps {
  /** Show the Save button (bottom-right). */
  showActionButtons: boolean;
  /** Show the Cancel button next to Save. False on mobile "modal" display,
   * where the header's close (X) icon already covers cancel — the footer
   * there only carries Save, unless a partial-publish issue needs its own
   * Details/Close buttons (shown regardless of this flag). */
  showCancelButton?: boolean;
  processing: boolean;
  buttonDisabled: boolean;
  handleClose: () => void;
  handleSave: () => void;
  relayDotsLabel: string;
  steps: PublishStepState[];
  showRelayDetailsButton: boolean;
  partialSaveRelayIssues: boolean;
  setRelayDetailsOpen: (open: boolean) => void;
  acceptedCount: number;
  failedCount: number;
  totalCount: number;
}

export function EventEditFooter({
  showActionButtons,
  showCancelButton = true,
  processing,
  buttonDisabled,
  handleClose,
  handleSave,
  steps,
  showRelayDetailsButton,
  partialSaveRelayIssues,
  setRelayDetailsOpen,
  acceptedCount,
  failedCount,
  totalCount,
}: EventEditFooterProps) {
  const intl = useIntl();

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: 1.5,
        pt: 2,
        borderTop: "1px solid",
        borderColor: "divider",
      }}
    >
      {partialSaveRelayIssues && (
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ lineHeight: 1.5 }}
        >
          <Box component="span" sx={{ fontWeight: 600, color: "text.primary" }}>
            {intl.formatMessage({ id: "event.eventSaved" })}:{" "}
          </Box>
          {intl.formatMessage(
            { id: "event.partialPublishHint" },
            { acceptedCount, failedCount, totalCount },
          )}
        </Typography>
      )}
      <Box
        sx={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 1,
          flexWrap: "wrap",
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "flex-start",
            minWidth: 0,
            flex: 1,
          }}
        >
          <PublishActivityPanel
            steps={steps}
            onDetailsClick={
              showRelayDetailsButton && !partialSaveRelayIssues
                ? () => setRelayDetailsOpen(true)
                : undefined
            }
            detailsLabel={intl.formatMessage({ id: "event.relayDetails" })}
          />
        </Box>
        {partialSaveRelayIssues ? (
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              flexWrap: "wrap",
              justifyContent: "flex-end",
            }}
          >
            <Button
              variant="contained"
              onClick={() => setRelayDetailsOpen(true)}
              color="primary"
            >
              {intl.formatMessage({ id: "event.relayDetails" })}
            </Button>
            <Button variant="outlined" onClick={handleClose} color="primary">
              {intl.formatMessage({ id: "event.closeEditor" })}
            </Button>
          </Box>
        ) : (
          showActionButtons && (
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              {showCancelButton && (
                <Button onClick={handleClose} color="inherit">
                  {intl.formatMessage({ id: "navigation.cancel" })}
                </Button>
              )}
              <Button
                onClick={handleSave}
                variant="contained"
                disabled={buttonDisabled}
              >
                {processing
                  ? intl.formatMessage({ id: "event.saving" })
                  : intl.formatMessage({ id: "event.saveEvent" })}
              </Button>
            </Box>
          )
        )}
      </Box>
    </Box>
  );
}
