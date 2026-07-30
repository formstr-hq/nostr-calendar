/**
 * Design tokens transcribed from designs/redesign/00-design-system.html
 * ("calm paper, loud ink"). See docs/REDESIGN_MASTER_PLAN.md D1.
 */

export const lightTokens = {
  canvas: "#f4f4f3",
  surface: "#ffffff",
  border: "#e4e4e2",
  borderStrong: "#d8d8d6",
  text: "#0b0b0c",
  text2: "#686865",
  text3: "#9a9a97",
  accentSoft: "#f0f0ef",
  otherMonthBg: "#f5f5f4",
  otherMonthText: "#b0b0ad",
  segmentTrack: "#ececea",
};

export const darkTokens = {
  canvas: "#121212",
  surface: "#1a1a1a",
  raised: "#242424",
  border: "#2c2c2c",
  borderStrong: "#3a3a3a",
  text: "#f2f2f0",
  text2: "#a8a49b",
  text3: "#8a8a86",
  accentSoft: "#242424",
  otherMonthBg: "#181818",
  otherMonthText: "#5a5a57",
  segmentTrack: "#242424",
};

export type AccentPresetName =
  | "ember"
  | "ocean"
  | "forest"
  | "grape"
  | "rose"
  | "ink";

export const accentPresets: Record<AccentPresetName, string> = {
  ember: "#111111",
  ocean: "#0ea5e9",
  forest: "#10b981",
  grape: "#8b5cf6",
  rose: "#f43f5e",
  ink: "#0b0b0c",
};

export const defaultAccent: AccentPresetName = "ember";

/** Default per-calendar colors. Public-event tint = color @ 12% (16% on dark). */
export const calendarColors = {
  personal: "#111111",
  work: "#3b82f6",
  family: "#10b981",
  meetups: "#8b5cf6",
  deadlines: "#f43f5e",
};

export const publicTint = {
  light: 0.12,
  dark: 0.16,
};

export const typography = {
  fontFamily: [
    "Inter",
    "-apple-system",
    "BlinkMacSystemFont",
    "system-ui",
    "sans-serif",
  ].join(","),
  viewTitle: { fontSize: 28, fontWeight: 800, letterSpacing: -0.6 },
  eventTitle: { fontSize: 18, fontWeight: 700 },
  body: { fontSize: 13.5, fontWeight: 400 },
  secondary: { fontSize: 12, fontWeight: 400 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 1.5,
    textTransform: "uppercase" as const,
  },
};

export const radius = {
  sm: 6,
  control: 10,
  card: 12,
  popover: 14,
  modal: 16,
  pill: 20,
};

export const buttonHeight = {
  sm: 40,
  md: 44,
};

export const shadow = {
  popover: "0 8px 24px rgba(11,11,12,.12)",
  modal: "0 16px 48px rgba(11,11,12,.18)",
};

export const spacing = 8;

/** Cheap WCAG-ish luminance check — good enough for picking black/white text on an accent swatch. */
export function getContrastText(hex: string): string {
  const clean = hex.replace("#", "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  const r = parseInt(full.slice(0, 2), 16) || 0;
  const g = parseInt(full.slice(2, 4), 16) || 0;
  const b = parseInt(full.slice(4, 6), 16) || 0;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#0b0b0c" : "#ffffff";
}
