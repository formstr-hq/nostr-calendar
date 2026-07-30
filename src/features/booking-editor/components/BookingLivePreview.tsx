import { useState } from "react";
import {
  Avatar,
  Box,
  Button,
  Chip,
  Divider,
  Paper,
  TextField,
  Typography,
} from "@mui/material";
import { SegmentedControl } from "../../../components/ui/SegmentedControl";
import { useUser } from "../../../stores/user";
import type { UseSchedulingPageFormReturn } from "../hooks/useSchedulingPageForm";

type PreviewDevice = "desktop" | "mobile";

function durationLabel(minutes: number) {
  return minutes >= 60 ? `${minutes / 60} hour` : `${minutes} min`;
}

/** A deliberately lightweight, live-synced preview of the public booking page. */
export function BookingLivePreview({
  form,
}: {
  form: UseSchedulingPageFormReturn;
}) {
  const [device, setDevice] = useState<PreviewDevice>("desktop");
  const user = useUser((state) => state.user);
  const hostName = user?.name || "Your calendar";
  const previewTitle = form.formData.title.trim() || "Schedule a meeting";
  const durations = form.formData.slotDurations.length
    ? form.formData.slotDurations
    : [30];

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          mb: 2,
        }}
      >
        <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
          Live preview
        </Typography>
        <SegmentedControl
          aria-label="Preview device"
          value={device}
          onChange={setDevice}
          options={[
            { value: "desktop", label: "Desktop" },
            { value: "mobile", label: "Mobile" },
          ]}
        />
      </Box>
      <Box
        sx={{
          mx: "auto",
          width: device === "mobile" ? 280 : "100%",
          minHeight: device === "mobile" ? 470 : 370,
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 2,
          bgcolor: "background.default",
          p: device === "mobile" ? 2 : 3,
          transition: "width 0.2s ease",
          // This is a visual model of the public page, not a second editor.
          // The device switch remains available above it, while every control
          // inside the model is deliberately inert.
          pointerEvents: "none",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, mb: 3 }}>
          <Avatar src={user?.picture} sx={{ width: 36, height: 36 }}>
            {hostName.slice(0, 1)}
          </Avatar>
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
              {hostName}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Booking page
            </Typography>
          </Box>
        </Box>
        <Typography
          variant="h6"
          sx={{ fontWeight: 800, lineHeight: 1.2, mb: 1 }}
        >
          {previewTitle}
        </Typography>
        {form.formData.description && (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ mb: 2, whiteSpace: "pre-wrap" }}
          >
            {form.formData.description}
          </Typography>
        )}
        {form.formData.location && (
          <Chip size="small" label={form.formData.location} sx={{ mb: 2 }} />
        )}
        <Typography
          variant="caption"
          sx={{ display: "block", fontWeight: 800, letterSpacing: 1, mb: 1 }}
        >
          SELECT A DURATION
        </Typography>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {durations.map((duration) => (
            <Button
              key={duration}
              variant="outlined"
              color="inherit"
              sx={{ justifyContent: "space-between", textTransform: "none" }}
            >
              {durationLabel(duration)} <Box component="span">›</Box>
            </Button>
          ))}
        </Box>
        <Button fullWidth variant="contained" disabled sx={{ mt: 2 }}>
          Continue
        </Button>
        {device === "mobile" && (
          <Box sx={{ mt: 3 }}>
            <Divider sx={{ mb: 2 }} />
            <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1 }}>
              Confirm your booking
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Tue, May 14 · 10:00–10:30
            </Typography>
            <TextField
              fullWidth
              size="small"
              label="Meeting title"
              sx={{ mt: 1.5 }}
            />
            <TextField
              fullWidth
              size="small"
              label="Note (optional)"
              sx={{ mt: 1 }}
            />
            <Button fullWidth variant="contained" disabled sx={{ mt: 1.5 }}>
              {form.formData.formAttachments.length
                ? "Answer some questions and confirm"
                : "Request booking"}
            </Button>
          </Box>
        )}
      </Box>
    </Paper>
  );
}
