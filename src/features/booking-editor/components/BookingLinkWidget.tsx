import {
  Box,
  Button,
  IconButton,
  Paper,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { QRCodeCanvas } from "qrcode.react";

interface BookingLinkWidgetProps {
  url: string;
  onCopy: () => void;
  compact?: boolean;
}

/** The only link shown is the view-key-bearing URL; a bare naddr cannot open a private page. */
export function BookingLinkWidget({
  url,
  onCopy,
  compact = false,
}: BookingLinkWidgetProps) {
  return (
    <Paper variant="outlined" sx={{ p: compact ? 1.5 : 2 }}>
      {!compact && (
        <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 0.5 }}>
          Share your booking page
        </Typography>
      )}
      {!compact && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Anyone with this link can request a time with you.
        </Typography>
      )}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <TextField
          value={url}
          size="small"
          fullWidth
          slotProps={{
            input: { readOnly: true },
            htmlInput: { "aria-label": "booking page link" },
          }}
          sx={{ "& .MuiInputBase-input": { fontSize: "0.75rem" } }}
        />
        <Tooltip title="Copy link">
          <IconButton aria-label="Copy share link" onClick={onCopy}>
            <ContentCopyIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        {!compact && (
          <Tooltip title="Open link">
            <IconButton
              component="a"
              href={url}
              target="_blank"
              rel="noopener noreferrer"
            >
              <OpenInNewIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Box>
      {!compact && (
        <Box sx={{ display: "flex", justifyContent: "center", pt: 2 }}>
          <QRCodeCanvas
            value={url}
            size={136}
            aria-label="Booking page QR code"
          />
        </Box>
      )}
      {compact && (
        <Button
          size="small"
          startIcon={<ContentCopyIcon />}
          onClick={onCopy}
          sx={{ mt: 1 }}
        >
          Copy link
        </Button>
      )}
    </Paper>
  );
}
