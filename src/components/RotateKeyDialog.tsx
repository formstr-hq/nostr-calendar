/**
 * Rotate Key Dialog
 *
 * Lets the event author rotate the event's view key to regain control after
 * the key (or a shared `?viewKey=` link) leaked. The author chooses whether
 * the new key is re-shared with only the invited participants, or also with
 * people who RSVP'd (who may have arrived via a shared URL).
 *
 * Rotating re-encrypts the event under a fresh key and republishes it, so
 * anyone still holding the old key — including old shared links — loses access
 * to the current and future version.
 */

import { useMemo, useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  IconButton,
  RadioGroup,
  Radio,
  FormControlLabel,
  Alert,
  useMediaQuery,
  useTheme,
  CircularProgress,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { useIntl } from "react-intl";
import type { ICalendarEvent } from "../utils/types";
import { rotatePrivateEventKey } from "../common/nostr";
import { resolveRotationRecipients } from "../utils/calendarListTypes";
import { useTimeBasedEvents } from "../stores/events";
import { useUser } from "../stores/user";
import { useEventRsvps } from "../hooks/useEventRsvps";

type RotateScope = "invited" | "invitedAndResponders";

interface RotateKeyDialogProps {
  open: boolean;
  onClose: () => void;
  event: ICalendarEvent;
  calendarId: string;
}

export function RotateKeyDialog({
  open,
  onClose,
  event,
  calendarId,
}: RotateKeyDialogProps) {
  const intl = useIntl();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const { user } = useUser();
  const { updateEvent } = useTimeBasedEvents();
  const { byPubkey } = useEventRsvps(event);

  const [scope, setScope] = useState<RotateScope>("invited");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const selfPubkey = user?.pubkey ?? "";

  // Invited participants are the event's `p` tags minus the author.
  const invitedParticipants = useMemo(
    () => (event.participants ?? []).filter((p) => p !== selfPubkey),
    [event.participants, selfPubkey],
  );

  // RSVP responders that are not already invited and not the author.
  const responderPubkeys = useMemo(
    () => Object.keys(byPubkey).filter((p) => p !== selfPubkey),
    [byPubkey, selfPubkey],
  );
  const extraResponders = useMemo(() => {
    const invited = new Set(invitedParticipants);
    return responderPubkeys.filter((p) => !invited.has(p));
  }, [responderPubkeys, invitedParticipants]);

  const recipients = useMemo(
    () =>
      resolveRotationRecipients({
        invitedParticipants,
        rsvpResponders: responderPubkeys,
        includeRsvpResponders: scope === "invitedAndResponders",
        selfPubkey,
      }),
    [invitedParticipants, responderPubkeys, scope, selfPubkey],
  );

  const handleRotate = async () => {
    setLoading(true);
    setError(false);
    try {
      const { viewKey, relayHint } = await rotatePrivateEventKey(
        event,
        calendarId,
        recipients,
      );
      // Reflect the new key locally so subsequent shares/links use it.
      updateEvent({
        ...event,
        viewKey,
        relayHint: relayHint || event.relayHint,
      });
      onClose();
    } catch (e) {
      console.error("Failed to rotate event key:", e);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      fullScreen={isMobile}
      open={open}
      onClose={loading ? undefined : onClose}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Typography variant="h6" fontWeight={600}>
            {intl.formatMessage({ id: "rotateKey.title" })}
          </Typography>
          <IconButton onClick={onClose} size="small" disabled={loading}>
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent dividers>
        <Box display="flex" flexDirection="column" gap={2}>
          <Alert severity="warning">
            {intl.formatMessage({ id: "rotateKey.warning" })}
          </Alert>

          <Typography variant="body2" color="text.secondary">
            {intl.formatMessage({ id: "rotateKey.shareQuestion" })}
          </Typography>

          <RadioGroup
            value={scope}
            onChange={(e) => setScope(e.target.value as RotateScope)}
          >
            <FormControlLabel
              value="invited"
              control={<Radio />}
              label={
                <Box>
                  <Typography fontWeight={500}>
                    {intl.formatMessage({ id: "rotateKey.invitedOnly" })}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {intl.formatMessage(
                      { id: "rotateKey.invitedOnlyCount" },
                      { count: invitedParticipants.length },
                    )}
                  </Typography>
                </Box>
              }
            />
            <FormControlLabel
              value="invitedAndResponders"
              control={<Radio />}
              label={
                <Box>
                  <Typography fontWeight={500}>
                    {intl.formatMessage({
                      id: "rotateKey.invitedAndResponders",
                    })}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {intl.formatMessage(
                      { id: "rotateKey.invitedAndRespondersCount" },
                      {
                        count:
                          invitedParticipants.length + extraResponders.length,
                      },
                    )}
                  </Typography>
                </Box>
              }
            />
          </RadioGroup>

          {error && (
            <Alert severity="error">
              {intl.formatMessage({ id: "rotateKey.error" })}
            </Alert>
          )}
        </Box>
      </DialogContent>

      <DialogActions sx={{ padding: 2 }}>
        <Button onClick={onClose} color="inherit" disabled={loading}>
          {intl.formatMessage({ id: "navigation.cancel" })}
        </Button>
        <Button
          onClick={handleRotate}
          variant="contained"
          disabled={loading}
          startIcon={loading ? <CircularProgress size={16} /> : undefined}
        >
          {loading
            ? intl.formatMessage({ id: "rotateKey.rotating" })
            : intl.formatMessage({ id: "rotateKey.rotate" })}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
