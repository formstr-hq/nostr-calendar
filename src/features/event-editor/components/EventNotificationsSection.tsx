import { Box } from "@mui/material";
import { useIntl } from "react-intl";
import { NotificationPreferenceEditor } from "../../../components/NotificationPreferenceEditor";
import { SectionLabel } from "../../../components/ui/SectionLabel";
import { GroupCard, sectionLabelSx } from "./styled";

interface EventNotificationsSectionProps {
  variant: "desktop" | "mobile";
  offsets: number[];
  onChange: (offsets: number[]) => void;
}

export function EventNotificationsSection({
  variant,
  offsets,
  onChange,
}: EventNotificationsSectionProps) {
  const intl = useIntl();
  const editor = (
    <NotificationPreferenceEditor offsets={offsets} onChange={onChange} />
  );

  if (variant === "mobile") {
    return (
      <GroupCard sx={{ p: 2 }}>
        <SectionLabel sx={sectionLabelSx}>
          {intl.formatMessage({ id: "event.notifications" })}
        </SectionLabel>
        {editor}
      </GroupCard>
    );
  }

  return (
    <Box sx={{ mb: 3 }}>
      <SectionLabel sx={sectionLabelSx}>
        {intl.formatMessage({ id: "event.notifications" })}
      </SectionLabel>
      {editor}
    </Box>
  );
}
