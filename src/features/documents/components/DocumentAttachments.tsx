import { useState } from "react";
import {
  Alert,
  Button,
  Checkbox,
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
import { documentAddress } from "../../../utils/documentLink";
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
  const [input, setInput] = useState("");
  const [authorize, setAuthorize] = useState(false);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const picker = useDocumentPicker(documents, onChange, isPrivate);
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
            color="error"
            disabled={picker.checking}
            onClick={() =>
              onChange(documents.filter((d) => d.naddr !== doc.naddr))
            }
          >
            {msg("navigation.remove")}
          </Button>
        </Stack>
      ))}
      <TextField
        fullWidth
        size="small"
        label={msg("documents.url")}
        value={input}
        onChange={(e) => {
          setInput(e.target.value);
          setAuthorize(false);
        }}
      />
      {isPrivate && input.includes("#") && (
        <FormControlLabel
          control={
            <Checkbox
              checked={authorize}
              onChange={(e) => setAuthorize(e.target.checked)}
            />
          }
          label={msg("documents.authorize")}
        />
      )}
      <Stack direction="row" spacing={1}>
        <Button
          variant="outlined"
          disabled={!input.trim() || picker.checking}
          onClick={async () => {
            if (await picker.addUrl(input, authorize)) {
              setInput("");
              setAuthorize(false);
            }
          }}
        >
          {msg(picker.checking ? "documents.checking" : "navigation.add")}
        </Button>
        <Button
          variant="outlined"
          disabled={picker.checking}
          onClick={() => {
            setOpen(true);
            setSelected(new Set());
            void picker.load();
          }}
        >
          {msg("documents.myDocs")}
        </Button>
      </Stack>
      {picker.error && <Alert severity="error">{msg(picker.error)}</Alert>}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>{msg("documents.myDocs")}</DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            <TextField
              label={msg("documents.search")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              fullWidth
            />
            {picker.loading ? (
              <Typography role="status">{msg("documents.loading")}</Typography>
            ) : (
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
          <Button
            onClick={addSelected}
            disabled={picker.loading || !selected.size}
          >
            {msg("documents.addSelected")}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
