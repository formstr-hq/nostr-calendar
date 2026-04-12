import { type FC , useState , useEffect, memo } from "react";
import Avatar from '@mui/material/Avatar';
import { SimplePool } from "nostr-tools";
import { defaultRelays } from "../common/nostr";
import UserIcon from "@mui/icons-material/Person";

interface NostrAvatarProps {
    pubkey? : string;
}

interface Profile {
    name? : string;
    picture? : string;
}

export const NostrAvatar : FC<NostrAvatarProps> = memo(({ pubkey }) => {
    const [profile , setProfile] = useState<Profile | undefined>(undefined);

    useEffect(() => {
        if(!pubkey) return;

        const pool = new SimplePool();
        async function getProfile() {
            let filter = {
                kinds: [0],
                authors : [pubkey!],
            };
            const profile = await pool.get(defaultRelays, filter);
            if(profile){
                setProfile(JSON.parse(profile.content));
            }
        }
        getProfile()

        return () => {
            pool.close(defaultRelays);
        }
    },[pubkey]);
    
    return profile?.picture ? (
        <Avatar src={profile.picture} alt={profile?.name} />
    ) : (
        <Avatar sx={{ bgcolor: "transparent" }}>
            <UserIcon sx={{ color: "grey.500" }} />
        </Avatar>
    );
});