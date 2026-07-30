import { Box, IconButton, Typography } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import CloseIcon from "@mui/icons-material/Close";
import LockIcon from "@mui/icons-material/Lock";
import { useIntl } from "react-intl";

interface EventEditHeaderDesktopProps {
  mode: "create" | "edit";
  display: "modal" | "page";
  isPrivate: boolean;
  onClose: () => void;
}

export function EventEditHeaderDesktop({
  mode,
  display,
  isPrivate,
  onClose,
}: EventEditHeaderDesktopProps) {
  const intl = useIntl();

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 1,
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}>
        {display === "page" && (
          <IconButton onClick={onClose} size="small">
            <ArrowBackIcon />
          </IconButton>
        )}
        <Typography
          variant="h6"
          sx={{ fontWeight: 600, overflowWrap: "anywhere" }}
        >
          {mode === "edit"
            ? intl.formatMessage({ id: "event.editEvent" })
            : intl.formatMessage({ id: "event.createNewEvent" })}
        </Typography>
      </Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        {isPrivate && (
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 0.5,
              color: "text.secondary",
            }}
          >
            <LockIcon fontSize="small" />
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {intl.formatMessage({ id: "event.private" })}
            </Typography>
          </Box>
        )}
        {display === "modal" && (
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        )}
      </Box>
    </Box>
  );
}
