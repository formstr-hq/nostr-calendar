import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import RefreshIcon from "@mui/icons-material/Refresh";
import {
  Box,
  IconButton,
  ListItem,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { useState } from "react";
import { useIntl } from "react-intl";
import type { RelayConnectionInfo } from "../../../nostr/relayConnection";
import { RelayStatusIndicator } from "./RelayStatusIndicator";

interface RelayRowProps {
  relay: string;
  statusInfo: RelayConnectionInfo;
  onTest: (relay: string) => void;
  onEdit: (oldUrl: string, newUrl: string) => boolean;
  onRemove: (relay: string) => void;
}

export function RelayRow({
  relay,
  statusInfo,
  onTest,
  onEdit,
  onRemove,
}: RelayRowProps) {
  const intl = useIntl();
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(relay);

  const handleSaveEdit = () => {
    const trimmed = editValue.trim();
    if (trimmed === relay) {
      setIsEditing(false);
      return;
    }
    const success = onEdit(relay, trimmed);
    if (success) {
      setIsEditing(false);
    }
  };

  const isTesting = statusInfo.status === "testing";

  return (
    <ListItem
      data-testid="relay-row"
      data-relay={relay}
      sx={{
        py: 1,
        px: 1,
        mb: 0.5,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        borderRadius: 1,
        "&:hover": {
          bgcolor: "action.hover",
        },
      }}
    >
      {isEditing ? (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            width: "100%",
            gap: 1,
          }}
        >
          <TextField
            autoFocus
            fullWidth
            size="small"
            data-testid="edit-relay-input"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleSaveEdit();
              } else if (e.key === "Escape") {
                setIsEditing(false);
                setEditValue(relay);
              }
            }}
          />
          <Tooltip title={intl.formatMessage({ id: "relay.saveEdit" })}>
            <IconButton
              size="small"
              color="primary"
              aria-label="save relay edit"
              onClick={handleSaveEdit}
            >
              <CheckIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title={intl.formatMessage({ id: "relay.cancelEdit" })}>
            <IconButton
              size="small"
              aria-label="cancel relay edit"
              onClick={() => {
                setIsEditing(false);
                setEditValue(relay);
              }}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      ) : (
        <>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              minWidth: 0,
              flex: 1,
              mr: 1,
            }}
          >
            <RelayStatusIndicator
              status={statusInfo.status}
              latencyMs={statusInfo.latencyMs}
              errorMessage={statusInfo.errorMessage}
            />
            <Typography
              variant="body2"
              sx={{
                ml: 1.5,
                overflowWrap: "anywhere",
                wordBreak: "break-all",
                color: "text.primary",
              }}
            >
              {relay}
            </Typography>
          </Box>

          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 0.5,
              flexShrink: 0,
            }}
          >
            <Tooltip title={intl.formatMessage({ id: "relay.testConnection" })}>
              <span>
                <IconButton
                  size="small"
                  aria-label="test relay"
                  data-testid="test-relay-button"
                  onClick={() => onTest(relay)}
                  disabled={isTesting}
                  sx={{ color: "text.secondary" }}
                >
                  <RefreshIcon
                    fontSize="small"
                    sx={
                      isTesting
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
                </IconButton>
              </span>
            </Tooltip>

            <Tooltip title={intl.formatMessage({ id: "relay.editRelay" })}>
              <IconButton
                size="small"
                aria-label="edit relay"
                data-testid="edit-relay-button"
                onClick={() => {
                  setEditValue(relay);
                  setIsEditing(true);
                }}
                sx={{ color: "text.secondary" }}
              >
                <EditOutlinedIcon fontSize="small" />
              </IconButton>
            </Tooltip>

            <Tooltip title={intl.formatMessage({ id: "common.delete" })}>
              <IconButton
                size="small"
                aria-label="remove relay"
                data-testid="remove-relay-button"
                onClick={() => onRemove(relay)}
                sx={{ color: "error.main" }}
              >
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        </>
      )}
    </ListItem>
  );
}
