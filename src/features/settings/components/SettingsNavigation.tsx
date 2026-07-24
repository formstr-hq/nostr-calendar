import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import {
  Box,
  Button,
  Collapse,
  List,
  ListItemButton,
  ListItemText,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { useIntl } from "react-intl";

const sections = [
  { path: "/settings/general", messageId: "settings.general" },
  { path: "/settings/calendars", messageId: "settings.calendars" },
  { path: "/settings/relays", messageId: "settings.relays" },
] as const;

export function SettingsNavigation() {
  const location = useLocation();
  const navigate = useNavigate();
  const intl = useIntl();
  const theme = useTheme();
  const mobile = useMediaQuery(theme.breakpoints.down("sm"));
  const [open, setOpen] = useState(false);
  const active =
    sections.find((section) => location.pathname.startsWith(section.path)) ??
    sections[0];

  const list = (
    <List disablePadding>
      {sections.map((section) => (
        <ListItemButton
          key={section.path}
          selected={active.path === section.path}
          onClick={() => {
            navigate(section.path);
            setOpen(false);
          }}
          sx={{ borderRadius: 1.25, mb: 0.25 }}
        >
          <ListItemText
            primary={intl.formatMessage({ id: section.messageId })}
            primaryTypographyProps={{
              variant: "body2",
              fontWeight: active.path === section.path ? 700 : 500,
            }}
          />
        </ListItemButton>
      ))}
    </List>
  );

  if (!mobile) {
    return <Box sx={{ width: 240, flexShrink: 0, p: 2 }}>{list}</Box>;
  }

  return (
    <Box sx={{ px: 2, pt: 2 }}>
      <Button
        fullWidth
        variant="outlined"
        onClick={() => setOpen((value) => !value)}
        endIcon={
          <ExpandMoreIcon
            sx={{
              transform: open ? "rotate(180deg)" : "none",
              transition: "transform 150ms",
            }}
          />
        }
        sx={{ justifyContent: "space-between" }}
      >
        {intl.formatMessage({ id: active.messageId })}
      </Button>
      <Collapse in={open}>
        <Box
          sx={{
            mt: 1,
            p: 1,
            bgcolor: "background.paper",
            border: "1px solid",
            borderColor: "divider",
            borderRadius: 1.5,
          }}
        >
          {list}
        </Box>
      </Collapse>
    </Box>
  );
}
