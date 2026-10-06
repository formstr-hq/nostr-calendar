import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import RefreshIcon from "@mui/icons-material/Refresh";
import {
  Alert,
  Box,
  Button,
  IconButton,
  List,
  Snackbar,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useRef, useState } from "react";
import { useIntl } from "react-intl";
import { defaultRelays, getRelays } from "../../common/relayConfig";
import { publishRelayList } from "../../nostr/relays";
import { useRelayStore } from "../../stores/relays";
import { RelayRow } from "./components/RelayRow";
import { SettingsCard } from "./components/SettingsCard";
import { useRelayConnectionTest } from "./hooks/useRelayConnectionTest";

interface RelaySettingsPageProps {
  isDialog?: boolean;
  onClose?: () => void;
}

export function RelaySettingsPage({
  isDialog = false,
  onClose,
}: RelaySettingsPageProps) {
  const intl = useIntl();
  const storeRelays = useRelayStore((state) => state.relays);
  const [relays, setRelays] = useState<string[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newRelay, setNewRelay] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{
    message: string;
    severity: "success" | "error";
  } | null>(null);

  const { getStatus, isTestingAll, testSingleRelay, testAllRelays } =
    useRelayConnectionTest();

  // Load configured relays
  useEffect(() => {
    setRelays([...getRelays()]);
  }, [storeRelays]);

  // Auto-test connections on mount once relays are populated
  const hasAutoTested = useRef(false);
  useEffect(() => {
    if (!hasAutoTested.current && relays.length > 0) {
      hasAutoTested.current = true;
      testAllRelays(relays);
    }
  }, [relays, testAllRelays]);

  const validateRelayUrl = (url: string, currentList: string[]) => {
    if (!url.startsWith("wss://") && !url.startsWith("ws://")) {
      setNotice({
        message: intl.formatMessage({ id: "relay.relayUrlError" }),
        severity: "error",
      });
      return false;
    }
    if (currentList.includes(url)) {
      setNotice({
        message: intl.formatMessage({ id: "relay.relayAlreadyInList" }),
        severity: "error",
      });
      return false;
    }
    return true;
  };

  const handleAddRelay = () => {
    const url = newRelay.trim();
    if (!validateRelayUrl(url, relays)) return;
    setRelays((current) => [...current, url]);
    setNewRelay("");
    setShowAddForm(false);
    testSingleRelay(url);
  };

  const handleEditRelay = (oldUrl: string, newUrl: string): boolean => {
    const otherRelays = relays.filter((r) => r !== oldUrl);
    if (!validateRelayUrl(newUrl, otherRelays)) return false;
    setRelays((current) => current.map((r) => (r === oldUrl ? newUrl : r)));
    testSingleRelay(newUrl);
    return true;
  };

  const handleRemoveRelay = (relayToRemove: string) => {
    setRelays((current) => current.filter((value) => value !== relayToRemove));
  };

  const handleResetToDefaults = () => {
    const defaults = [...defaultRelays];
    setRelays(defaults);
    testAllRelays(defaults);
  };

  const handleTestAll = () => {
    testAllRelays(relays);
  };

  const save = async () => {
    if (!relays.length) return;
    setSaving(true);
    useRelayStore.getState().setRelays(relays);
    try {
      await publishRelayList(relays);
      setNotice({
        message: intl.formatMessage({ id: "relay.relaySavedAndPublished" }),
        severity: "success",
      });
    } catch (error) {
      console.error("Failed to publish relay list", error);
      setNotice({
        message: intl.formatMessage({
          id: "relay.savedLocallyFailedPublish",
        }),
        severity: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const content = (
    <Box sx={{ width: "100%" }}>
      {/* Dashed Add Relay Button or Inline Form */}
      {showAddForm ? (
        <Box
          sx={{
            display: "flex",
            gap: 1,
            mb: 2,
            p: 1.5,
            border: "1.5px dashed",
            borderColor: "primary.main",
            borderRadius: 2,
            alignItems: "center",
          }}
        >
          <TextField
            autoFocus
            fullWidth
            size="small"
            placeholder="wss://relay.example.com"
            value={newRelay}
            onChange={(event) => setNewRelay(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                handleAddRelay();
              } else if (event.key === "Escape") {
                setShowAddForm(false);
                setNewRelay("");
              }
            }}
          />
          <Button
            variant="contained"
            onClick={handleAddRelay}
            sx={{ flexShrink: 0 }}
          >
            {intl.formatMessage({ id: "navigation.add" })}
          </Button>
          <IconButton
            size="small"
            aria-label="cancel add"
            onClick={() => {
              setShowAddForm(false);
              setNewRelay("");
            }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
      ) : (
        <Button
          fullWidth
          variant="outlined"
          startIcon={<AddIcon />}
          onClick={() => setShowAddForm(true)}
          sx={{
            borderStyle: "dashed",
            borderWidth: 1.5,
            borderColor: "primary.main",
            color: "primary.main",
            py: 1.25,
            mb: 2,
            borderRadius: 2,
            fontWeight: 600,
            textTransform: "none",
            "&:hover": {
              borderStyle: "dashed",
              borderWidth: 1.5,
              borderColor: "primary.main",
              bgcolor: "action.hover",
            },
          }}
        >
          {intl.formatMessage({ id: "relay.addNewRelay" })}
        </Button>
      )}

      {/* Relay List */}
      <List disablePadding>
        {relays.map((relay) => (
          <RelayRow
            key={relay}
            relay={relay}
            statusInfo={getStatus(relay)}
            onTest={testSingleRelay}
            onEdit={handleEditRelay}
            onRemove={handleRemoveRelay}
          />
        ))}
      </List>

      {!relays.length && (
        <Typography
          variant="body2"
          color="text.secondary"
          textAlign="center"
          sx={{ py: 3 }}
        >
          {intl.formatMessage({ id: "relay.noRelaysConfigured" })}
        </Typography>
      )}

      {/* Bottom Actions Bar */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 1.5,
          mt: 3,
          pt: 2,
          borderTop: isDialog ? "none" : "1px solid",
          borderColor: "divider",
        }}
      >
        <Button
          color="primary"
          startIcon={
            <RefreshIcon
              sx={
                isTestingAll
                  ? {
                      animation: "spin 1s linear infinite",
                      "@keyframes spin": {
                        "0%": { transform: "rotate(0deg)" },
                        "100%": { transform: "rotate(360deg)" },
                      },
                    }
                  : undefined
              }
            />
          }
          onClick={handleTestAll}
          disabled={isTestingAll || relays.length === 0}
          data-testid="test-all-connections-button"
          sx={{
            color: "primary.main",
            fontWeight: 600,
            textTransform: "none",
          }}
        >
          {isTestingAll
            ? intl.formatMessage({ id: "relay.testingConnections" })
            : intl.formatMessage({ id: "relay.testAllConnections" })}
        </Button>

        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Button color="inherit" onClick={handleResetToDefaults}>
            {intl.formatMessage({ id: "relay.resetToDefaults" })}
          </Button>
          <Button
            variant="contained"
            disabled={saving || !relays.length}
            onClick={save}
          >
            {saving
              ? intl.formatMessage({ id: "event.saving" })
              : intl.formatMessage({ id: "navigation.save" })}
          </Button>
          {isDialog && onClose && (
            <Button
              color="primary"
              onClick={onClose}
              sx={{ fontWeight: 600, textTransform: "none" }}
            >
              {intl.formatMessage({ id: "navigation.close" })}
            </Button>
          )}
        </Box>
      </Box>
    </Box>
  );

  return (
    <>
      <Typography
        id="relay-settings-heading"
        variant="h5"
        fontWeight={800}
        sx={{ mb: isDialog ? 2 : 0.5 }}
      >
        {intl.formatMessage({
          id: isDialog ? "relay.manageRelays" : "settings.relays",
        })}
      </Typography>

      {!isDialog && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
          {intl.formatMessage({ id: "settings.relaysDescription" })}
        </Typography>
      )}

      {isDialog ? (
        content
      ) : (
        <SettingsCard
          label={intl.formatMessage({ id: "settings.connectedRelays" })}
        >
          {content}
        </SettingsCard>
      )}

      <Snackbar
        open={Boolean(notice)}
        autoHideDuration={4000}
        onClose={() => setNotice(null)}
      >
        <Alert
          severity={notice?.severity ?? "success"}
          onClose={() => setNotice(null)}
        >
          {notice?.message}
        </Alert>
      </Snackbar>
    </>
  );
}
