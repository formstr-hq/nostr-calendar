import type { CSSObject, Theme } from "@mui/material/styles";
import { mailTokens } from "./tokens";

/**
 * Resolve the warm "email guest" palette for the *live* color scheme.
 *
 * This app themes via MUI CSS variables (`colorSchemeSelector: "class"`), so
 * `theme.palette.mode` inside a style function is the static default scheme,
 * not the user's toggle — reading it directly yields light values in dark mode.
 * `theme.applyStyles("dark", …)` compiles to the same scheme selector the rest
 * of the theme uses (see theme.ts, EventChip.tsx). Returns an array because
 * that is the composition `applyStyles` requires to layer correctly.
 */
export type MailTokenSet = typeof mailTokens.light;

export function mailModeStyles(
  theme: Theme,
  styles: (tokens: MailTokenSet) => CSSObject,
): CSSObject[] {
  return [
    styles(mailTokens.light),
    theme.applyStyles("dark", styles(mailTokens.dark)) as CSSObject,
  ];
}
