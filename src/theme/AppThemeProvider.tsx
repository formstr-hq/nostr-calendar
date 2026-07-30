import { ReactNode, useEffect, useRef } from "react";
import { ThemeProvider, useColorScheme } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import { theme } from "./theme";
import { useSettings } from "../stores/settings";
import { accentPresets, AccentPresetName, getContrastText } from "./tokens";

function isPreset(accent: string): accent is AccentPresetName {
  return accent in accentPresets;
}

function ColorSchemeSync() {
  const { setMode } = useColorScheme();
  const themeMode = useSettings((s) => s.settings.themeMode);
  const accent = useSettings((s) => s.settings.accent);

  // MUI recreates `setMode`'s identity whenever its own `mode` changes,
  // including when another tab's mode syncs in via its storage listener.
  // Depending on `setMode` here would re-push our (possibly stale) local
  // themeMode in response to that sync, fighting the other tab in a loop.
  const setModeRef = useRef(setMode);
  setModeRef.current = setMode;

  useEffect(() => {
    setModeRef.current(themeMode);
  }, [themeMode]);

  useEffect(() => {
    const hex = isPreset(accent) ? accentPresets[accent] : accent;
    const root = document.documentElement.style;
    root.setProperty("--cal-accent", hex);
    root.setProperty("--mui-palette-primary-main", hex);
    root.setProperty(
      "--mui-palette-primary-contrastText",
      getContrastText(hex),
    );
  }, [accent]);

  return null;
}

export function AppThemeProvider({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider theme={theme} defaultMode="system">
      <CssBaseline />
      <ColorSchemeSync />
      {children}
    </ThemeProvider>
  );
}
