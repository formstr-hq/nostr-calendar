import { type FC, memo, useState } from "react";
import Avatar from "@mui/material/Avatar";
import UserIcon from "@mui/icons-material/Person";
import { IUser } from "../stores/user";

interface NostrAvatarProps {
  user: IUser | null;
}

export const NostrAvatar: FC<NostrAvatarProps> = memo(({ user }) => {
  const [imgFailed, setImgFailed] = useState(false);

  if (user?.picture && !imgFailed) {
    return (
      <Avatar
        src={user.picture}
        alt={user?.name}
        onError={() => setImgFailed(true)}
      />
    );
  }

  return (
    <Avatar sx={{ bgcolor: "transparent" }}>
      <UserIcon sx={{ color: "grey.700" }} />
    </Avatar>
  );
});
