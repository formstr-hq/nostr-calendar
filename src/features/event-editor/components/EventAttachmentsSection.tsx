import { useState } from "react";
import { Box } from "@mui/material";
import { useIntl } from "react-intl";
import { EventFormAttachments } from "../../../components/EventFormAttachments";
import { SectionLabel } from "../../../components/ui/SectionLabel";
import type { IFormAttachment } from "../../../utils/types";
import {
  AdvancedBox,
  GroupCard,
  CollapseToggle,
  sectionLabelSx,
} from "./styled";

interface EventAttachmentsSectionProps {
  variant: "desktop" | "mobile";
  attachedForms: IFormAttachment[];
  onAdd: (form: IFormAttachment) => void;
  onRemove: (naddr: string) => void;
}

export function EventAttachmentsSection({
  variant,
  attachedForms,
  onAdd,
  onRemove,
}: EventAttachmentsSectionProps) {
  const intl = useIntl();
  const [open, setOpen] = useState(attachedForms.length > 0);
  const toggleLabel = intl.formatMessage({ id: "event.attachmentsToggle" });
  const countSuffix =
    !open && attachedForms.length > 0 ? ` · ${attachedForms.length}` : "";

  if (variant === "mobile") {
    return (
      <GroupCard>
        <CollapseToggle
          onClick={() => setOpen((prev) => !prev)}
          fullWidth
          sx={{ px: 2, py: 1.75, justifyContent: "space-between" }}
        >
          <Box component="span">{toggleLabel}</Box>
          <Box component="span">{open ? "▾" : `▸${countSuffix}`}</Box>
        </CollapseToggle>
        {open && (
          <Box sx={{ px: 2, pb: 2, pt: 0.5 }}>
            <EventFormAttachments
              attachedForms={attachedForms}
              onAdd={onAdd}
              onRemove={onRemove}
            />
          </Box>
        )}
      </GroupCard>
    );
  }

  return (
    <Box sx={{ mb: 3 }}>
      <CollapseToggle onClick={() => setOpen((prev) => !prev)} size="small">
        {open ? "▾" : "▸"} {toggleLabel}
        {countSuffix}
      </CollapseToggle>
      {open && (
        <AdvancedBox sx={{ mt: 1.5 }}>
          <SectionLabel sx={sectionLabelSx}>
            {intl.formatMessage({ id: "form.attachments" })}
          </SectionLabel>
          <EventFormAttachments
            attachedForms={attachedForms}
            onAdd={onAdd}
            onRemove={onRemove}
          />
        </AdvancedBox>
      )}
    </Box>
  );
}
