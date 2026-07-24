import { Box, Checkbox, FormControlLabel, Typography } from "@mui/material";
import { useIntl } from "react-intl";

interface EventPrivacySettingsProps {
  publishBusy: boolean;
  supportsBusyListPublish: boolean;
  onPublishBusyChange: (publishBusy: boolean) => void;
}

export function EventPrivacySettings({
  publishBusy,
  supportsBusyListPublish,
  onPublishBusyChange,
}: EventPrivacySettingsProps) {
  const intl = useIntl();

  if (!supportsBusyListPublish) {
    return null;
  }

  return (
    <Box style={{ paddingLeft: 12, paddingRight: 12 }}>
      <FormControlLabel
        control={
          <Checkbox
            checked={publishBusy}
            onChange={(e) => onPublishBusyChange(e.target.checked)}
            size="small"
          />
        }
        label={
          <Typography variant="body2">
            {intl.formatMessage({ id: "busyList.publishToggle" })}
          </Typography>
        }
      />
      <Typography
        variant="caption"
        color="text.secondary"
        style={{ display: "block", marginLeft: 32 }}
      >
        {intl.formatMessage({ id: "busyList.helperText" })}
      </Typography>
    </Box>
  );
}
