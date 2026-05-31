import { useState } from "react";
import { Button, Collapse, Stack, TextField, Typography } from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { useIntl } from "react-intl";

interface AddNoteProps {
  comment: string;
  onCommentChange: (value: string) => void;
  onSave?: () => void;
  isSubmitting?: boolean;
}

export function AddNote({
  comment,
  onCommentChange,
  onSave,
  isSubmitting,
}: AddNoteProps) {
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
          {intl.formatMessage({ id: "rsvp.addNote" })}
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
        <Stack spacing={1}>
          <TextField
            label={intl.formatMessage({ id: "rsvp.comment" })}
            multiline
            minRows={2}
            size="small"
            fullWidth
            value={comment}
            onChange={(e) => onCommentChange(e.target.value)}
          />
          {onSave && (
            <Stack direction="row" justifyContent="flex-end">
              <Button
                size="small"
                variant="outlined"
                disabled={isSubmitting}
                onClick={onSave}
              >
                {intl.formatMessage({ id: "navigation.save" })}
              </Button>
            </Stack>
          )}
        </Stack>
      </Collapse>
    </Stack>
  );
}
