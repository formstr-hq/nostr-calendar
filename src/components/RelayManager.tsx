import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Box,
  Typography,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Snackbar,
  Alert,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import DeleteIcon from "@mui/icons-material/Delete";
import AddIcon from "@mui/icons-material/Add";
import { useRelayStore } from "../stores/relays";
import { defaultRelays, getRelays, publishRelayList } from "../common/nostr";
import { useIntl } from "react-intl";

export function RelayManager() {
  const { showRelayModal, updateRelayModal } = useRelayStore();
  const intl = useIntl();
  const [localRelays, setLocalRelays] = useState<string[]>([]);
  const [newRelay, setNewRelay] = useState("");
  const [saving, setSaving] = useState(false);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: "success" | "error";
  }>({ open: false, message: "", severity: "success" });

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  useEffect(() => {
    if (showRelayModal) {
      setLocalRelays([...getRelays()]);
      setNewRelay("");
    }
  }, [showRelayModal]);

  const handleClose = () => {
    updateRelayModal(false);
  };

  const handleAdd = () => {
    const url = newRelay.trim();
    if (!url) return;
    if (!url.startsWith("wss://") && !url.startsWith("ws://")) {
      setSnackbar({
        open: true,
        message: intl.formatMessage({ id: "relay.relayUrlError" }),
        severity: "error",
      });
      return;
    }
    if (localRelays.includes(url)) {
      setSnackbar({
        open: true,
        message: intl.formatMessage({ id: "relay.relayAlreadyInList" }),
        severity: "error",
      });
      return;
    }
    setLocalRelays([...localRelays, url]);
    setNewRelay("");
  };

  const handleRemove = (url: string) => {
    setLocalRelays(localRelays.filter((r) => r !== url));
  };

  const handleResetToDefaults = () => {
    setLocalRelays([...defaultRelays]);
  };

  const handleSave = async () => {
    if (localRelays.length === 0) {
      setSnackbar({
        open: true,
        message: intl.formatMessage({ id: "relay.atLeastOneRelay" }),
        severity: "error",
      });
      return;
    }
    setSaving(true);
    try {
      useRelayStore.getState().setRelays(localRelays);
      await publishRelayList(localRelays);
      setSnackbar({
        open: true,
        message: intl.formatMessage({ id: "relay.relaySavedAndPublished" }),
        severity: "success",
      });
      handleClose();
    } catch (e) {
      console.error("Failed to publish relay list:", e);
      // Still save locally even if publish fails
      useRelayStore.getState().setRelays(localRelays);
      setSnackbar({
        open: true,
        message: intl.formatMessage({ id: "relay.savedLocallyFailedPublish" }),
        severity: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAdd();
    }
  };

  return (
    <>
      <Dialog
        fullScreen={isMobile}
        open={showRelayModal}
        onClose={handleClose}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          <Box
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Typography variant="h6" style={{ fontWeight: 600 }}>
              {intl.formatMessage({ id: "relay.manageRelays" })}
            </Typography>
            <IconButton onClick={handleClose} size="small">
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>

        <DialogContent dividers>
          <Box style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Add relay section */}
            <Box
              style={{
                display: "flex",
                gap: 8,
                flexDirection: isMobile ? "column" : "row",
              }}
            >
              <TextField
                fullWidth
                size="small"
                placeholder="wss://relay.example.com"
                value={newRelay}
                onChange={(e) => setNewRelay(e.target.value)}
                onKeyDown={handleKeyDown}
              />
              <Button
                variant="contained"
                onClick={handleAdd}
                startIcon={<AddIcon />}
                style={{ minWidth: isMobile ? undefined : 100 }}
              >
                {intl.formatMessage({ id: "navigation.add" })}
              </Button>
            </Box>

            {/* Relay list */}
            <List disablePadding>
              {localRelays.map((relay) => (
                <ListItem
                  key={relay}
                  secondaryAction={
                    <IconButton
                      edge="end"
                      onClick={() => handleRemove(relay)}
                      size="small"
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  }
                  style={{
                    backgroundColor: "#f5f5f5",
                    borderRadius: 4,
                    marginBottom: 4,
                  }}
                >
                  <ListItemText
                    primary={relay}
                    primaryTypographyProps={{
                      variant: "body2",
                      style: {
                        wordBreak: "break-all",
                      },
                    }}
                  />
                </ListItem>
              ))}
            </List>

            {localRelays.length === 0 && (
              <Typography
                variant="body2"
                color="textSecondary"
                style={{ textAlign: "center", padding: 16 }}
              >
                {intl.formatMessage({ id: "relay.noRelaysConfigured" })}
              </Typography>
            )}

            <Button
              size="small"
              color="inherit"
              onClick={handleResetToDefaults}
            >
              {intl.formatMessage({ id: "relay.resetToDefaults" })}
            </Button>
          </Box>
        </DialogContent>

        <DialogActions style={{ padding: 16 }}>
          <Button onClick={handleClose} color="inherit">
            {intl.formatMessage({ id: "navigation.cancel" })}
          </Button>
          <Button
            onClick={handleSave}
            variant="contained"
            disabled={saving || localRelays.length === 0}
          >
            {saving ? intl.formatMessage({ id: "event.saving" }) : intl.formatMessage({ id: "navigation.save" })}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          severity={snackbar.severity}
          sx={{ width: "100%" }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </>
  );
}

export default RelayManager;
