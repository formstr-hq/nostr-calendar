import { MenuItem } from "@mui/material";
import { useUser } from "../stores/user";
import { useIntl } from "react-intl";
import { useEffect } from "react";
import { npubEncode } from "nostr-tools/nip19";
import { useRelayStore } from "../stores/relays";

export const Auth = () => {
  const { user, updateLoginModal, logout, initializeUser } = useUser(
    (state) => state,
  );
  const hasUserLoggedIn = !!user;
  const intl = useIntl();

  useEffect(() => {
    initializeUser();
  }, [initializeUser]);

  const handleLogin = async () => {
    try {
      updateLoginModal(true);
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  const handleLogout = async () => {
    try {
      // await nostrLogout();
      await logout();
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  let npub: string | null = null;
  if (user?.pubkey) {
    npub = npubEncode(user.pubkey);
    npub = `${npub.substring(0, 8)}...${npub.slice(-5)}`;
  }

  const name = user?.name;

  const handleOpenRelays = () => {
    useRelayStore.getState().updateRelayModal(true);
  };

  const logoutElem = (
    <>
      <MenuItem onClick={handleOpenRelays}>{intl.formatMessage({ id: "navigation.relays" })}</MenuItem>
      <MenuItem onClick={handleLogout}>
        {intl.formatMessage({ id: "navigation.logout" })}
        {npub && <>({name || npub})</>}
      </MenuItem>
    </>
  );

  const loginElem = (
    <MenuItem onClick={handleLogin}>
      {intl.formatMessage({ id: "navigation.login" })}
    </MenuItem>
  );

  const toDisplay = hasUserLoggedIn ? logoutElem : loginElem;

  return toDisplay;
};
