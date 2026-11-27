import { useState } from "react";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
} from "@mui/material";
import { useIntl } from "react-intl";

export function CreateDocumentDialog({
  open,
  busy,
  error,
  onClose,
  onCreate,
}: {
  open: boolean;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onCreate: (title: string, body: string) => Promise<void>;
}) {
  const intl = useIntl();
  const msg = (id: string) => intl.formatMessage({ id });
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const tooLarge =
    new TextEncoder().encode(`# ${title}\n\n${body}`).length > 60000;
  return (
    <Dialog
      open={open}
      onClose={busy ? undefined : onClose}
      fullWidth
      maxWidth="sm"
    >
      <DialogTitle>{msg("documents.create")}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Alert severity="info">{msg("documents.createNotice")}</Alert>
          <TextField
            autoFocus
            label={msg("documents.title")}
            value={title}
            disabled={busy}
            onChange={(e) => setTitle(e.target.value)}
            slotProps={{ htmlInput: { maxLength: 200 } }}
            fullWidth
          />
          <TextField
            label={msg("documents.content")}
            value={body}
            disabled={busy}
            onChange={(e) => setBody(e.target.value)}
            multiline
            minRows={4}
            fullWidth
            error={tooLarge}
            helperText={tooLarge ? msg("documents.tooLarge") : undefined}
          />
          {error && <Alert severity="error">{msg(error)}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button disabled={busy} onClick={onClose}>
          {msg("navigation.cancel")}
        </Button>
        <Button
          variant="contained"
          disabled={busy || !title.trim() || tooLarge}
          onClick={async () => {
            await onCreate(title, body);
          }}
        >
          {msg(busy ? "documents.creating" : "documents.createAttach")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
