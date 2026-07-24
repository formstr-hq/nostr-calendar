import { Box, Button, IconButton, Typography } from "@mui/material";
import SettingsInputAntennaIcon from "@mui/icons-material/SettingsInputAntenna";
import { useIntl } from "react-intl";
import { useNavigate } from "react-router";
import { RelayDots } from "../../../components/RelayDots";
import { getRelays } from "../../../common/relayConfig";
import type { RelayStatusMap } from "../../../utils/types";

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
  publishingRelays: string[];
  relayStatus: RelayStatusMap;
  showRelayDetailsButton: boolean;
  partialSaveRelayIssues: boolean;
  setRelayDetailsOpen: (open: boolean) => void;
  hasSignedEventForRetry: boolean;
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
  relayDotsLabel,
  publishingRelays,
  relayStatus,
  showRelayDetailsButton,
  partialSaveRelayIssues,
  setRelayDetailsOpen,
  hasSignedEventForRetry,
  acceptedCount,
  failedCount,
  totalCount,
}: EventEditFooterProps) {
  const intl = useIntl();
  const navigate = useNavigate();
  const isPublishing = publishingRelays.length > 0;
  const relaysToShow = isPublishing ? publishingRelays : getRelays();

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
          <IconButton
            size="small"
            aria-label={intl.formatMessage({ id: "settings.relays" })}
            onClick={() => navigate("/settings/relays")}
          >
            <SettingsInputAntennaIcon fontSize="small" />
          </IconButton>
          <RelayDots
            relays={relaysToShow}
            relayStatus={relayStatus}
            label={relayDotsLabel}
            idle={!isPublishing}
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
              disabled={!hasSignedEventForRetry}
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
