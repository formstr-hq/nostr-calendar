import { useState } from "react";
import { Box, Button, Link, TextField, Typography } from "@mui/material";
import { useIntl } from "react-intl";
import { FormstrSDK, type MyFormSummary } from "@formstr/sdk";
import { parseFormInput } from "../utils/formLink";
import type { IFormAttachment } from "../utils/types";
import { signerManager } from "../common/signer";
import { useRelayStore } from "../stores/relays";
import { toFormsSigner } from "../utils/toFormsSigner";

interface EventFormAttachmentsProps {
  attachedForms: IFormAttachment[];
  onAdd: (form: IFormAttachment) => void;
  onRemove: (naddr: string) => void;
  /** Maximum number of forms that can be attached. Omit for no limit. */
  maxAttachments?: number;
}

export function EventFormAttachments({
  attachedForms,
  onAdd,
  onRemove,
  maxAttachments,
}: EventFormAttachmentsProps) {
  const intl = useIntl();
  const [formInput, setFormInput] = useState("");
  const [formInputError, setFormInputError] = useState<string | null>(null);
  const [myForms, setMyForms] = useState<MyFormSummary[] | null>(null);
  const [myFormsOpen, setMyFormsOpen] = useState(false);
  const [myFormsLoading, setMyFormsLoading] = useState(false);
  const relays = useRelayStore((state) => state.relays);
  const canAddAttachment =
    maxAttachments === undefined || attachedForms.length < maxAttachments;

  const handleAddForm = () => {
    const parsed = parseFormInput(formInput);
    if (!parsed) {
      setFormInputError(intl.formatMessage({ id: "form.invalidInput" }));
      return;
    }
    if (attachedForms.some((f) => f.naddr === parsed.naddr)) {
      setFormInputError(intl.formatMessage({ id: "form.duplicateAttachment" }));
      return;
    }
    onAdd(parsed);
    setFormInput("");
    setFormInputError(null);
  };

  const loadMyForms = async () => {
    setMyFormsLoading(true);
    try {
      const signer = await signerManager.getSigner();
      const forms = await new FormstrSDK().fetchMyForms(
        toFormsSigner(signer),
        relays,
      );
      setMyForms(forms);
    } catch {
      // The empty state intentionally covers unavailable forms and relay errors.
      setMyForms([]);
    } finally {
      setMyFormsLoading(false);
    }
  };

  const handleMyFormsClick = () => {
    const nextOpen = !myFormsOpen;
    setMyFormsOpen(nextOpen);
    if (nextOpen && myForms === null) void loadMyForms();
  };

  const addMyForm = (summary: MyFormSummary) => {
    // nkeys can contain the owner's edit secret as well as the share view key.
    // parseFormInput deliberately extracts only the safe view key.
    const parsed = parseFormInput(`${summary.naddr}#${summary.nkeys ?? ""}`);
    if (!parsed) return;
    if (attachedForms.some((form) => form.naddr === parsed.naddr)) {
      setFormInputError(intl.formatMessage({ id: "form.duplicateAttachment" }));
      return;
    }
    onAdd(parsed);
    setMyFormsOpen(false);
  };

  return (
    <Box style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Typography variant="body2" style={{ fontWeight: 500 }}>
        {intl.formatMessage({ id: "form.attachments" })}
      </Typography>

      {attachedForms.length > 0 && (
        <Box style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {attachedForms.map((form) => (
            <Box
              key={form.naddr}
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                px: 1.5,
                py: 1,
                bgcolor: "action.hover",
                borderRadius: 1,
                gap: 1,
              }}
            >
              <Typography
                variant="body2"
                style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  flex: 1,
                  fontFamily: "monospace",
                }}
                title={form.naddr}
              >
                {form.naddr}
              </Typography>
              <Button
                size="small"
                color="error"
                onClick={() => onRemove(form.naddr)}
              >
                {intl.formatMessage({ id: "form.removeAttachment" })}
              </Button>
            </Box>
          ))}
        </Box>
      )}

      {canAddAttachment && (
        <Box sx={{ display: "flex", gap: 1, alignItems: "stretch" }}>
          <TextField
            fullWidth
            size="small"
            placeholder={intl.formatMessage({ id: "form.inputPlaceholder" })}
            value={formInput}
            onChange={(e) => {
              setFormInput(e.target.value);
              if (formInputError) setFormInputError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAddForm();
              }
            }}
            error={!!formInputError}
            helperText={formInputError ?? undefined}
            sx={{ flex: 1, "& .MuiInputBase-root": { height: 36 } }}
          />
          <Button
            variant="outlined"
            size="small"
            onClick={handleAddForm}
            disabled={!formInput.trim()}
            sx={{ minWidth: 76, height: 36, whiteSpace: "nowrap" }}
          >
            {intl.formatMessage({ id: "form.addAttachment" })}
          </Button>
          <Button
            variant="outlined"
            size="small"
            onClick={handleMyFormsClick}
            sx={{ minWidth: 104, height: 36, whiteSpace: "nowrap" }}
          >
            {intl.formatMessage({ id: "form.myForms" })}
          </Button>
        </Box>
      )}

      {myFormsOpen && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
          {myFormsLoading ? (
            <Typography variant="body2" color="text.secondary">
              {intl.formatMessage({ id: "form.loadingMyForms" })}
            </Typography>
          ) : myForms?.length ? (
            myForms.map((form) => (
              <Button
                key={form.naddr}
                variant="outlined"
                onClick={() => addMyForm(form)}
                sx={{ justifyContent: "flex-start", textTransform: "none" }}
              >
                {form.name}
              </Button>
            ))
          ) : (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                flexWrap: "wrap",
              }}
            >
              <Typography variant="body2" color="text.secondary">
                {intl.formatMessage({ id: "form.noMyFormsBefore" })}{" "}
                <Link
                  href="https://formstr.app"
                  target="_blank"
                  rel="noreferrer"
                >
                  https://formstr.app
                </Link>{" "}
                {intl.formatMessage({ id: "form.noMyFormsAfter" })}
              </Typography>
              <Button size="small" onClick={() => void loadMyForms()}>
                {intl.formatMessage({ id: "form.retryMyForms" })}
              </Button>
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}
