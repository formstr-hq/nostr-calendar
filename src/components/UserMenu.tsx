import { IconButton, Menu } from "@mui/material";
import { useState } from "react";
import { Auth } from "./Auth";
import { useUser } from "../stores/user";
import { NostrAvatar } from "./NostrAvatar";

export const UserMenu = () => {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);
  const { user } = useUser((state) => state);

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  };
  const handleClose = () => {
    setAnchorEl(null);
  };

  return (
    <>
      <IconButton onClick={handleClick} sx={{ color: "grey.700" }}>
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
        <Auth />
      </Menu>
    </>
  );
};
