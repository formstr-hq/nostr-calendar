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
      <IconButton onClick={handleClick}>
        <NostrAvatar pubkey={user?.pubkey} />
      </IconButton>
      <Menu open={open} anchorEl={anchorEl} onClose={handleClose}>
        <Auth />
      </Menu>
    </>
  );
};
