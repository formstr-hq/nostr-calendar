import { Alert, Button, Stack, Typography } from "@mui/material";
import DescriptionOutlined from "@mui/icons-material/DescriptionOutlined";
import { useIntl } from "react-intl";
import { buildDocumentUrl } from "../../../utils/documentLink";
import type { IDocumentAttachment } from "../../../utils/types";

export function EventDocuments({
  documents = [],
  isPrivate,
}: {
  documents?: IDocumentAttachment[];
  isPrivate: boolean;
}) {
  const intl = useIntl();
  if (!documents.length) return null;
  return (
    <Stack spacing={1}>
      <Typography variant="subtitle2">
        {intl.formatMessage({ id: "documents.heading" })}
      </Typography>
      {documents.map((doc) => {
        const url = buildDocumentUrl(doc, isPrivate);
        return (
          <Stack key={doc.naddr} spacing={1}>
            <Stack direction="row" spacing={1} alignItems="center">
              <DescriptionOutlined />
              <Typography
                sx={{ overflowWrap: "anywhere", minWidth: 0, flex: 1 }}
              >
                {isPrivate && doc.title
                  ? doc.title
                  : intl.formatMessage({ id: "documents.untitled" })}
              </Typography>
              {url && (
                <Button
                  component="a"
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  referrerPolicy="no-referrer"
                >
                  {intl.formatMessage({ id: "documents.open" })}
                </Button>
              )}
            </Stack>
            <Typography variant="caption">
              {intl.formatMessage({ id: "documents.brand" })}
            </Typography>
          </Stack>
        );
      })}
      <Alert severity="info">
        {intl.formatMessage({ id: "documents.detailNotice" })}
      </Alert>
    </Stack>
  );
}
