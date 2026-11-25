import { DocumentAttachments } from "../../documents/components/DocumentAttachments";
import { useState } from "react";
import { Box } from "@mui/material";
import { useIntl } from "react-intl";
import { EventFormAttachments } from "../../../components/EventFormAttachments";
import { SectionLabel } from "../../../components/ui/SectionLabel";
import type {
  IFormAttachment,
  IDocumentAttachment,
} from "../../../utils/types";
import {
  AdvancedBox,
  GroupCard,
  CollapseToggle,
  sectionLabelSx,
} from "./styled";

interface EventAttachmentsSectionProps {
  variant: "desktop" | "mobile";
  documents: IDocumentAttachment[];
  onDocumentsChange: (docs: IDocumentAttachment[]) => void;
  isPrivate: boolean;
  attachedForms: IFormAttachment[];
  onAdd: (form: IFormAttachment) => void;
  onRemove: (naddr: string) => void;
}

export function EventAttachmentsSection({
  variant,
  documents,
  onDocumentsChange,
  isPrivate,
  attachedForms,
  onAdd,
  onRemove,
}: EventAttachmentsSectionProps) {
  const intl = useIntl();
  const [open, setOpen] = useState(attachedForms.length + documents.length > 0);
  const toggleLabel = intl.formatMessage({ id: "event.attachmentsToggle" });
  const countSuffix =
    !open && attachedForms.length + documents.length > 0
      ? ` · ${attachedForms.length + documents.length}`
      : "";

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
            {isPrivate && (
              <EventFormAttachments
                attachedForms={attachedForms}
                onAdd={onAdd}
                onRemove={onRemove}
              />
            )}
            <DocumentAttachments
              documents={documents}
              onChange={onDocumentsChange}
              isPrivate={isPrivate}
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
            {intl.formatMessage({ id: "event.attachmentsToggle" })}
          </SectionLabel>
          {isPrivate && (
            <EventFormAttachments
              attachedForms={attachedForms}
              onAdd={onAdd}
              onRemove={onRemove}
            />
          )}
          <DocumentAttachments
            documents={documents}
            onChange={onDocumentsChange}
            isPrivate={isPrivate}
          />
        </AdvancedBox>
      )}
    </Box>
  );
}
