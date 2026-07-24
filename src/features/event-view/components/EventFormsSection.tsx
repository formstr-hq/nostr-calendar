import { useState } from "react";
import { Stack, Typography } from "@mui/material";
import { useIntl } from "react-intl";
import { ICalendarEvent, IFormAttachment } from "../../../utils/types";
import { FormAttachmentRow } from "../../../components/FormAttachmentRow";
import { FormFillerDialog } from "../../../components/FormFillerDialog";

export function EventFormsSection({
  event,
  forms,
}: {
  event: ICalendarEvent;
  forms: IFormAttachment[];
}) {
  const intl = useIntl();
  const [activeForm, setActiveForm] = useState<IFormAttachment | null>(null);

  if (forms.length === 0) return null;

  return (
    <>
      <Typography variant="subtitle1">
        {intl.formatMessage({ id: "form.attachments" })}
      </Typography>
      <Stack spacing={1}>
        {forms.map((attachment) => (
          <FormAttachmentRow
            key={attachment.naddr}
            attachment={attachment}
            eventAuthor={event.user}
            onFill={setActiveForm}
          />
        ))}
      </Stack>
      {activeForm && (
        <FormFillerDialog
          open
          attachment={activeForm}
          onClose={() => setActiveForm(null)}
          onSubmitted={() => setActiveForm(null)}
        />
      )}
    </>
  );
}
