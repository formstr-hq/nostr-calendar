import { Box } from "@mui/material";
import type { ReactNode } from "react";

/** Bordered card shell matching the sidebar's grouping — see 26-settings-calendars-desktop.html. */
export function GroupCardShell({ children }: { children: ReactNode }) {
  return (
    <Box
      sx={{
        bgcolor: "background.paper",
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 2,
        px: { xs: 2, sm: 3 },
        py: 1,
        mb: 2.5,
      }}
    >
      {children}
    </Box>
  );
}
