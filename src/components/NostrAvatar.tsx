import { type FC , memo } from "react";
import Avatar from '@mui/material/Avatar';
import UserIcon from "@mui/icons-material/Person";
import { IUser } from "../stores/user";

interface NostrAvatarProps {
    user : IUser | null;
}

export const NostrAvatar : FC<NostrAvatarProps> = memo(({ user }) => {    
    return user?.picture ? (
        <Avatar src={user.picture} alt={user?.name} />
    ) : (
        <Avatar sx={{ bgcolor: "transparent" }}>
            <UserIcon sx={{ color: "grey.500" }} />
        </Avatar>
    );
});