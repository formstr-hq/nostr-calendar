import { Box, type BoxProps, Typography } from "@mui/material";
import type { ReactNode } from "react";
import { SectionLabel } from "../../../components/ui/SectionLabel";

export function SettingsCard({
  label,
  children,
}: {
  label: ReactNode;
  children: ReactNode;
}) {
  return (
    <Box
      sx={{
        bgcolor: "background.paper",
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 2,
        px: { xs: 2, sm: 3 },
        py: 2,
        mb: 2.5,
      }}
    >
      <SectionLabel>{label}</SectionLabel>
      <Box sx={{ mt: 0.75 }}>{children}</Box>
    </Box>
  );
}

export function SettingsRow({
  label,
  hint,
  children,
  ...boxProps
}: {
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
} & BoxProps) {
  return (
    <Box
      {...boxProps}
      sx={{
        display: "flex",
        alignItems: { xs: "stretch", sm: "center" },
        flexDirection: { xs: "column", sm: "row" },
        justifyContent: "space-between",
        gap: { xs: 1, sm: 3 },
        py: 2,
        borderTop: "1px solid",
        borderColor: "divider",
        ...boxProps.sx,
      }}
    >
      <Box>
        <Typography variant="body2" fontWeight={600}>
          {label}
        </Typography>
        {hint && (
          <Typography variant="caption" color="text.secondary">
            {hint}
          </Typography>
        )}
      </Box>
      <Box sx={{ flexShrink: 0 }}>{children}</Box>
    </Box>
  );
}
