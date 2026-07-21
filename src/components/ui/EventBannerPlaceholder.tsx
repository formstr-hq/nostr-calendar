import { useId } from "react";
import { alpha, useColorScheme, useTheme } from "@mui/material";
import { darkTokens, lightTokens } from "../../theme/tokens";

/**
 * Generic calm banner shown behind an event when it has no `image` tag —
 * a soft gradient fading into the surrounding background plus a faint
 * calendar-grid motif and a minimal calendar glyph. This app themes via MUI
 * CSS variables (`colorSchemeSelector: "class"`, see theme.ts), so
 * `theme.palette.*` reflects the static default scheme, not the live
 * light/dark toggle — resolve mode via `useColorScheme()` instead, same
 * pattern as `EventChip.tsx`'s `publicTint` lookup.
 */
export function EventBannerPlaceholder() {
  const theme = useTheme();
  const { mode, systemMode } = useColorScheme();
  const resolvedMode = mode === "system" ? systemMode : mode;
  const tokens = resolvedMode === "dark" ? darkTokens : lightTokens;
  const gradientId = useId();
  const gridId = useId();
  const background = tokens.surface;
  const tint = alpha(
    theme.palette.primary.main,
    resolvedMode === "dark" ? 0.16 : 0.1,
  );
  const lineColor = alpha(tokens.text, resolvedMode === "dark" ? 0.08 : 0.05);
  const glyphColor = alpha(tokens.text, resolvedMode === "dark" ? 0.18 : 0.1);

  return (
    <svg
      viewBox="0 0 1200 400"
      preserveAspectRatio="xMidYMid slice"
      role="presentation"
      aria-hidden="true"
      style={{ width: "100%", height: "100%", display: "block" }}
    >
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={tint} />
          <stop offset="65%" stopColor={background} />
          <stop offset="100%" stopColor={background} />
        </linearGradient>
        <pattern
          id={gridId}
          width="60"
          height="60"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M 60 0 L 0 0 0 60"
            fill="none"
            stroke={lineColor}
            strokeWidth="1"
          />
        </pattern>
      </defs>

      <rect width="1200" height="400" fill={`url(#${gradientId})`} />
      <rect width="1200" height="400" fill={`url(#${gridId})`} />

      {/* Minimal calendar glyph, off-center so it reads as decoration. */}
      <g
        transform="translate(860, 120)"
        fill="none"
        stroke={glyphColor}
        strokeWidth="6"
      >
        <rect x="0" y="24" width="160" height="140" rx="16" />
        <path d="M0 68 H160" />
        <path d="M40 0 V40" strokeLinecap="round" />
        <path d="M120 0 V40" strokeLinecap="round" />
        <circle cx="40" cy="108" r="8" fill={glyphColor} stroke="none" />
      </g>
    </svg>
  );
}
