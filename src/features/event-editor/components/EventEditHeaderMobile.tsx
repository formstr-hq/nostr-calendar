import { Box, IconButton, Typography } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import CloseIcon from "@mui/icons-material/Close";
import LockIcon from "@mui/icons-material/Lock";
import PhoneIphoneIcon from "@mui/icons-material/PhoneIphone";
import { useIntl } from "react-intl";

interface EventEditHeaderMobileProps {
  mode: "create" | "edit";
  display: "modal" | "page";
  isPrivate: boolean;
  isDeviceTarget: boolean;
  onClose: () => void;
}

export function EventEditHeaderMobile({
  mode,
  display,
  isPrivate,
  isDeviceTarget,
  onClose,
}: EventEditHeaderMobileProps) {
  const intl = useIntl();
  const statusIcon = isDeviceTarget ? (
    <PhoneIphoneIcon fontSize="small" />
  ) : isPrivate ? (
    <LockIcon fontSize="small" />
  ) : null;
  const title = (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, minWidth: 0 }}>
      <Typography
        variant="subtitle1"
        sx={{ fontWeight: 700, overflowWrap: "anywhere" }}
      >
        {mode === "edit"
          ? intl.formatMessage({ id: "event.editEvent" })
          : intl.formatMessage({ id: "event.createNewEvent" })}
      </Typography>
      {statusIcon}
    </Box>
  );

  if (display === "page") {
    return (
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, py: 1 }}>
        <IconButton onClick={onClose} size="small">
          <ArrowBackIcon />
        </IconButton>
        {title}
      </Box>
    );
  }

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: "40px 1fr 40px",
        alignItems: "center",
        py: 1,
      }}
    >
      <Box />
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 0.75,
          minWidth: 0,
        }}
      >
        {title}
      </Box>
      <IconButton onClick={onClose} size="small" sx={{ justifySelf: "end" }}>
        <CloseIcon />
      </IconButton>
    </Box>
  );
}
