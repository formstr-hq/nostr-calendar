import { CreateDocumentDialog } from "./CreateDocumentDialog";
import { useState } from "react";
import {
  Alert,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import DescriptionOutlined from "@mui/icons-material/DescriptionOutlined";
import { useIntl } from "react-intl";
import type { IDocumentAttachment } from "../../../utils/types";
import { documentAddress, buildDocumentUrl } from "../../../utils/documentLink";
import { useDocumentPicker } from "../hooks/useDocumentPicker";

export function DocumentAttachments({
  documents,
  onChange,
  isPrivate,
}: {
  documents: IDocumentAttachment[];
  onChange: (docs: IDocumentAttachment[]) => void;
  isPrivate: boolean;
}) {
  const intl = useIntl();
  const msg = (id: string) => intl.formatMessage({ id });
  const [createOpen, setCreateOpen] = useState(false);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const picker = useDocumentPicker(documents, onChange);
  const addSelected = () => {
    const existing = new Set(documents.map((d) => documentAddress(d.naddr)));
    const additions = picker.documents
      .filter(
        (d) => selected.has(d.naddr) && !existing.has(documentAddress(d.naddr)),
      )
      .map((d) => ({ naddr: d.naddr, title: d.title }));
    onChange([...documents, ...additions]);
    setOpen(false);
    setSelected(new Set());
  };
  return (
    <Stack spacing={2}>
      <Typography variant="subtitle2">{msg("documents.heading")}</Typography>
      <Alert severity="info">{msg("documents.accessWarning")}</Alert>
      {!isPrivate && (
        <Alert severity="info">{msg("documents.publicWarning")}</Alert>
      )}
      {documents.map((doc) => (
        <Stack key={doc.naddr} direction="row" spacing={1} alignItems="center">
          <DescriptionOutlined />
          <Typography sx={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>
            {doc.title || msg("documents.untitled")}
          </Typography>
          <Button
            component="a"
            href={buildDocumentUrl(doc, isPrivate) ?? undefined}
            target="_blank"
            rel="noopener noreferrer"
          >
            {msg("documents.open")}
          </Button>
          <Button
            color="error"
            disabled={picker.creating}
            onClick={() =>
              onChange(documents.filter((d) => d.naddr !== doc.naddr))
            }
          >
            {msg("navigation.remove")}
          </Button>
        </Stack>
      ))}
      <Stack direction="row" spacing={1}>
        <Button
          variant="outlined"
          disabled={picker.creating}
          onClick={() => setCreateOpen(true)}
        >
          {msg("documents.create")}
        </Button>
        <Button
          variant="outlined"
          disabled={picker.creating}
          onClick={() => {
            setOpen(true);
            setSelected(new Set());
            void picker.load();
          }}
        >
          {msg("documents.myDocs")}
        </Button>
      </Stack>
      {picker.queued && (
        <Alert severity="info">{msg("documents.queued")}</Alert>
      )}
      {createOpen && (
        <CreateDocumentDialog
          open={createOpen}
          busy={picker.creating}
          error={picker.error}
          onClose={() => setCreateOpen(false)}
          onCreate={async (title, body) => {
            if (await picker.create(title, body)) setCreateOpen(false);
          }}
        />
      )}
      {picker.error && <Alert severity="error">{msg(picker.error)}</Alert>}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>
          <Stack
            component="span"
            direction="row"
            spacing={1}
            alignItems="center"
          >
            <span>{msg("documents.myDocs")}</span>
            {picker.loading && (
              <CircularProgress
                size="1em"
                aria-hidden="true"
                sx={{
                  "@media (prefers-reduced-motion: reduce)": {
                    animation: "none",
                    "& .MuiCircularProgress-circle": { animation: "none" },
                  },
                }}
              />
            )}
          </Stack>
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            <TextField
              label={msg("documents.search")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              fullWidth
            />
            {picker.loading && (
              <Typography
                role="status"
                variant="caption"
                color="text.secondary"
              >
                {msg("documents.loading")}
              </Typography>
            )}
            {(!picker.loading || picker.documents.length > 0) && (
              <>
                {picker.error && (
                  <Alert severity="error">{msg(picker.error)}</Alert>
                )}
                {picker.incomplete && (
                  <Alert severity="info">{msg("documents.incomplete")}</Alert>
                )}
                {!picker.documents.filter((d) =>
                  (d.title || msg("documents.untitled"))
                    .toLowerCase()
                    .includes(query.toLowerCase()),
                ).length && <Typography>{msg("documents.empty")}</Typography>}
                {picker.documents
                  .filter((d) =>
                    (d.title || msg("documents.untitled"))
                      .toLowerCase()
                      .includes(query.toLowerCase()),
                  )
                  .map((doc) => {
                    const exists = documents.some(
                      (d) =>
                        documentAddress(d.naddr) === documentAddress(doc.naddr),
                    );
                    return (
                      <FormControlLabel
                        key={doc.naddr}
                        control={
                          <Checkbox
                            checked={exists || selected.has(doc.naddr)}
                            disabled={exists}
                            onChange={(e) =>
                              setSelected((prev) => {
                                const next = new Set(prev);
                                if (e.target.checked) next.add(doc.naddr);
                                else next.delete(doc.naddr);
                                return next;
                              })
                            }
                          />
                        }
                        label={`${doc.title || msg("documents.untitled")} · ${msg(`documents.${doc.source}`)}`}
                      />
                    );
                  })}
              </>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => void picker.load()} disabled={picker.loading}>
            {msg("documents.retry")}
          </Button>
          <Button onClick={() => setOpen(false)}>
            {msg("navigation.cancel")}
          </Button>
          <Button onClick={addSelected} disabled={!selected.size}>
            {msg("documents.addSelected")}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
