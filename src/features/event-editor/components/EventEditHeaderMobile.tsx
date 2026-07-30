import { Box, IconButton, Typography } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import CloseIcon from "@mui/icons-material/Close";
import LockIcon from "@mui/icons-material/Lock";
import { useIntl } from "react-intl";

interface EventEditHeaderMobileProps {
  mode: "create" | "edit";
  display: "modal" | "page";
  isPrivate: boolean;
  onClose: () => void;
}

export function EventEditHeaderMobile({
  mode,
  display,
  isPrivate,
  onClose,
}: EventEditHeaderMobileProps) {
  const intl = useIntl();
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
      {isPrivate && <LockIcon fontSize="small" />}
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
