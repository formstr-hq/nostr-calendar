import { useEffect, useState } from "react";
import { Box, Button, Typography } from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { FormstrSDK } from "@formstr/sdk";
import { useIntl } from "react-intl";
import { useUser } from "../stores/user";
import { useFormSubmissionStatus } from "../hooks/useFormSubmissionStatus";
import { buildFormstrResponsesUrl } from "../utils/formLink";
import type { IFormAttachment } from "../utils/types";

type FormAttachmentRowProps = {
  attachment: IFormAttachment;
  eventAuthor?: string;
  onFill?: (attachment: IFormAttachment) => void;
};

export function FormAttachmentRow({
  attachment,
  eventAuthor,
  onFill,
}: FormAttachmentRowProps) {
  const intl = useIntl();
  const { user } = useUser();
  const [title, setTitle] = useState<string | null>(null);
  const { status } = useFormSubmissionStatus(
    onFill ? attachment.naddr : undefined,
    user?.pubkey,
  );
  const submitted = status.state === "submitted";
  const hasEditAccess = !!user?.pubkey && eventAuthor === user.pubkey;

  useEffect(() => {
    let cancelled = false;

    setTitle(null);

    const resolveTitle = async () => {
      try {
        const sdk = new FormstrSDK();
        const form = (await (attachment.viewKey
          ? sdk.fetchFormWithViewKey(attachment.naddr, attachment.viewKey)
          : sdk.fetchForm(attachment.naddr))) as { name?: string };
        const nextTitle = form.name?.trim();

        if (!cancelled) {
          setTitle(nextTitle || null);
        }
      } catch {
        if (!cancelled) {
          setTitle(null);
        }
      }
    };

    void resolveTitle();

    return () => {
      cancelled = true;
    };
  }, [attachment.naddr, attachment.viewKey]);

  const fallbackLabel =
    attachment.naddr.length > 24
      ? `${attachment.naddr.slice(0, 12)}…${attachment.naddr.slice(-8)}`
      : attachment.naddr;

  return (
    <Box display="flex" alignItems="center" gap={1} flexWrap="wrap">
      {onFill && (
        <Button
          variant={submitted ? "text" : "outlined"}
          size="small"
          onClick={() => onFill(attachment)}
          startIcon={
            submitted ? <CheckCircleIcon color="success" /> : undefined
          }
        >
          {intl.formatMessage({
            id: submitted ? "form.viewOrUpdate" : "form.fillOut",
          })}
        </Button>
      )}
      {hasEditAccess && (
        <Button
          variant="text"
          size="small"
          href={buildFormstrResponsesUrl(attachment)}
          target="_blank"
          rel="noopener noreferrer"
          endIcon={<OpenInNewIcon fontSize="inherit" />}
        >
          {intl.formatMessage({ id: "formResponses.viewButton" })}
        </Button>
      )}
      <Typography
        variant="caption"
        color="text.secondary"
        sx={
          title
            ? { wordBreak: "break-word" }
            : {
                fontFamily: "monospace",
                wordBreak: "break-all",
              }
        }
      >
        {title ?? fallbackLabel}
      </Typography>
    </Box>
  );
}
