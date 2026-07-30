import { Typography, TypographyProps } from "@mui/material";

/** Uppercase small-caps label for grouping sidebar sections ("MY CALENDARS"). */
export function SectionLabel({ sx, ...props }: TypographyProps) {
  return (
    <Typography
      component="div"
      variant="overline"
      sx={{ color: "text.disabled", ...sx }}
      {...props}
    />
  );
}
