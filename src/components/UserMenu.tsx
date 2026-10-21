import {
  Alert,
  Divider,
  IconButton,
  Menu,
  MenuItem,
  Snackbar,
} from "@mui/material";
import { useState } from "react";
import { useIntl } from "react-intl";
import { Auth } from "./Auth";
import { useUser } from "../stores/user";
import { NostrAvatar } from "./NostrAvatar";
import AppsIcon from "@mui/icons-material/Apps";
import { useAppDesk } from "@formstr/common-ui";

export const UserMenu = () => {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [copied, setCopied] = useState(false);
  const open = Boolean(anchorEl);
  const intl = useIntl();
  const { user } = useUser((state) => state);
  const openDesk = useAppDesk();

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  };
  const handleClose = () => {
    setAnchorEl(null);
  };

  return (
    <>
      <IconButton
        onClick={handleClick}
        data-testid="user-avatar"
        aria-label="User menu"
      >
        <NostrAvatar user={user} />
      </IconButton>
      <Menu
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        disableScrollLock
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
      >
        <MenuItem
          onClick={() => {
            if (anchorEl) openDesk(anchorEl);
            handleClose();
          }}
        >
          <AppsIcon fontSize="small" sx={{ mr: 1 }} />
          Apps
        </MenuItem>
        <Divider />
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
