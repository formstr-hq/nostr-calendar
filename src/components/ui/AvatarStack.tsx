import { Avatar, Box } from "@mui/material";

export interface AvatarStackItem {
  src?: string;
  name?: string;
}

interface AvatarStackProps {
  items: AvatarStackItem[];
  size?: number;
  max?: number;
}

function initials(name?: string): string {
  if (!name) return "?";
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

/** Overlapping row of avatars (e.g. attendees). Not yet consumed by the shell. */
export function AvatarStack({ items, size = 32, max = 4 }: AvatarStackProps) {
  const visible = items.slice(0, max);
  const overflow = items.length - visible.length;

  return (
    <Box sx={{ display: "flex" }}>
      {visible.map((item, i) => (
        <Avatar
          key={i}
          src={item.src}
          alt={item.name}
          sx={{
            width: size,
            height: size,
            fontSize: size * 0.4,
            border: "2px solid",
            borderColor: "background.paper",
            ml: i === 0 ? 0 : `-${size * 0.3}px`,
          }}
        >
          {!item.src && initials(item.name)}
        </Avatar>
      ))}
      {overflow > 0 && (
        <Avatar
          sx={{
            width: size,
            height: size,
            fontSize: size * 0.35,
            fontWeight: 700,
            border: "2px solid",
            borderColor: "background.paper",
            ml: `-${size * 0.3}px`,
            bgcolor: "action.selected",
            color: "text.secondary",
          }}
        >
          +{overflow}
        </Avatar>
      )}
    </Box>
  );
}
