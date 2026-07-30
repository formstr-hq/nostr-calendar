import type { ReactNode } from "react";
import { Box, ButtonBase, CircularProgress, Typography } from "@mui/material";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";

interface AuthOptionProps {
  icon: ReactNode;
  title: string;
  description: string;
  onClick: () => void;
  expanded?: boolean;
  loading?: boolean;
  disabled?: boolean;
  testId?: string;
}

export function AuthOption({
  icon,
  title,
  description,
  onClick,
  expanded = false,
  loading = false,
  disabled = false,
  testId,
}: AuthOptionProps) {
  return (
    <ButtonBase
      onClick={onClick}
      disabled={disabled || loading}
      aria-label={title}
      data-testid={testId}
      sx={{
        width: "100%",
        display: "flex",
        alignItems: "flex-start",
        gap: 2,
        px: { xs: 2.5, sm: 4 },
        py: 2.25,
        textAlign: "left",
        "&:hover:not(:disabled)": { bgcolor: "action.hover" },
      }}
    >
      <Box sx={{ color: "text.primary", display: "flex", mt: 0.2 }}>
        {loading ? <CircularProgress size={22} color="inherit" /> : icon}
      </Box>
      <Box flex={1} minWidth={0}>
        <Typography fontWeight={700} lineHeight={1.3}>
          {title}
        </Typography>
        <Typography variant="body2" color="text.secondary" mt={0.35}>
          {description}
        </Typography>
      </Box>
      <ChevronRightIcon
        sx={{
          color: "text.disabled",
          mt: 0.25,
          transform: expanded ? "rotate(90deg)" : "none",
          transition: "transform .15s",
        }}
      />
    </ButtonBase>
  );
}
