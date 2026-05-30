import { useState } from "react";
import { Button, Collapse, Stack, TextField, Typography } from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { useIntl } from "react-intl";

interface SuggestedTimeProps {
  start: string;
  end: string;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
  onSave?: () => void;
  isSubmitting?: boolean;
}

export function SuggestedTime({
  start,
  end,
  onStartChange,
  onEndChange,
  onSave,
  isSubmitting,
}: SuggestedTimeProps) {
  const intl = useIntl();
  const [expanded, setExpanded] = useState(false);

  return (
    <Stack spacing={1}>
      <Stack
        direction="row"
        alignItems="center"
        gap={0.5}
        onClick={() => setExpanded((prev) => !prev)}
        sx={{ cursor: "pointer", userSelect: "none" }}
      >
        <Typography variant="body2" color="text.secondary">
          {intl.formatMessage({ id: "rsvp.alternateTimeTitle" })}
        </Typography>
        <ExpandMoreIcon
          fontSize="small"
          sx={{
            color: "text.secondary",
            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.2s",
          }}
        />
      </Stack>
      <Collapse in={expanded}>
        <Stack direction="row" gap={1} flexWrap="wrap" alignItems="center">
          <TextField
            label={intl.formatMessage({ id: "rsvp.suggestedStart" })}
            type="datetime-local"
            size="small"
            value={start}
            onChange={(e) => onStartChange(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            label={intl.formatMessage({ id: "rsvp.suggestedEnd" })}
            type="datetime-local"
            size="small"
            value={end}
            onChange={(e) => onEndChange(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          {onSave && (
            <Button
              size="small"
              variant="outlined"
              disabled={isSubmitting}
              onClick={onSave}
            >
              {intl.formatMessage({ id: "navigation.save" })}
            </Button>
          )}
        </Stack>
      </Collapse>
    </Stack>
  );
}
