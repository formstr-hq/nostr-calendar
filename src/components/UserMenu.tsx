import { Alert, IconButton, Menu, Snackbar } from "@mui/material";
import { useState } from "react";
import { useIntl } from "react-intl";
import { Auth } from "./Auth";
import { useUser } from "../stores/user";
import { NostrAvatar } from "./NostrAvatar";

export const UserMenu = () => {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [copied, setCopied] = useState(false);
  const open = Boolean(anchorEl);
  const intl = useIntl();
  const { user } = useUser((state) => state);

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  };
  const handleClose = () => {
    setAnchorEl(null);
  };

  return (
    <>
      <IconButton onClick={handleClick} data-testid="user-avatar">
        <NostrAvatar user={user} />
      </IconButton>
      <Menu open={open} anchorEl={anchorEl} onClose={handleClose}>
        <Auth onClose={handleClose} onCopied={() => setCopied(true)} />
      </Menu>
      <Snackbar
        open={copied}
        autoHideDuration={2000}
        onClose={() => setCopied(false)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          onClose={() => setCopied(false)}
          severity="success"
          sx={{ width: "100%" }}
        >
          {intl.formatMessage({ id: "navigation.copied" })}
        </Alert>
      </Snackbar>
    </>
  );
};
