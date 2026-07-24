import { useState } from "react";
import { Box, Button, TextField, Typography } from "@mui/material";
import { useIntl } from "react-intl";
import { parseFormInput } from "../utils/formLink";
import type { IFormAttachment } from "../utils/types";

interface EventFormAttachmentsProps {
  attachedForms: IFormAttachment[];
  onAdd: (form: IFormAttachment) => void;
  onRemove: (naddr: string) => void;
}

export function EventFormAttachments({
  attachedForms,
  onAdd,
  onRemove,
}: EventFormAttachmentsProps) {
  const intl = useIntl();
  const [formInput, setFormInput] = useState("");
  const [formInputError, setFormInputError] = useState<string | null>(null);

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

      <Box style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
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
        />
        <Button
          variant="outlined"
          size="small"
          onClick={handleAddForm}
          disabled={!formInput.trim()}
          style={{ marginTop: 0, height: "auto" }}
        >
          {intl.formatMessage({ id: "form.addAttachment" })}
        </Button>
      </Box>
    </Box>
  );
}
