import { EventFormAttachments } from "../../../components/EventFormAttachments";
import type { IFormAttachment } from "../../../utils/types";

interface BookingIntakeFormSectionProps {
  attachedForms: IFormAttachment[];
  onAdd: (form: IFormAttachment) => void;
  onRemove: (naddr: string) => void;
}

export function BookingIntakeFormSection({
  attachedForms,
  onAdd,
  onRemove,
}: BookingIntakeFormSectionProps) {
  return (
    <EventFormAttachments
      attachedForms={attachedForms}
      onAdd={onAdd}
      onRemove={onRemove}
      maxAttachments={1}
    />
  );
}
