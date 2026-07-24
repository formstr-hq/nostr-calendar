import { Box, TextField } from "@mui/material";
import { useIntl } from "react-intl";
import { SectionLabel } from "../../../components/ui/SectionLabel";
import { GroupCard, sectionLabelSx } from "./styled";

interface EventNotesSectionProps {
  variant: "desktop" | "mobile";
  value: string;
  onChange: (value: string) => void;
}

export function EventNotesSection({
  variant,
  value,
  onChange,
}: EventNotesSectionProps) {
  const intl = useIntl();
  const field = (
    <TextField
      fullWidth
      multiline
      rows={4}
      variant={variant === "mobile" ? "standard" : "outlined"}
      placeholder={intl.formatMessage({ id: "event.addDescription" })}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      size="small"
      slotProps={
        variant === "mobile" ? { input: { disableUnderline: true } } : undefined
      }
    />
  );

  if (variant === "mobile") {
    return (
      <GroupCard sx={{ p: 2 }}>
        <SectionLabel sx={sectionLabelSx}>
          {intl.formatMessage({ id: "event.notesLabel" })}
        </SectionLabel>
        {field}
      </GroupCard>
    );
  }

  return (
    <Box sx={{ mb: 3 }}>
      <SectionLabel sx={sectionLabelSx}>
        {intl.formatMessage({ id: "event.notesLabel" })}
      </SectionLabel>
      {field}
    </Box>
  );
}
