import { createTheme, alpha } from "@mui/material/styles";
import {
  lightTokens,
  darkTokens,
  accentPresets,
  defaultAccent,
  typography,
  radius,
  buttonHeight,
  shadow,
} from "./tokens";

declare module "@mui/material/IconButton" {
  interface IconButtonOwnProps {
    variant?: "highlighted";
  }
}

declare module "@mui/material/styles" {
  interface TypeBackground {
    /** Warm-neutral backdrop for secondary panels (sidebar, mobile nav sheet) — the main content area uses `default`/`paper` instead. */
    canvas: string;
  }
}

const accentMain = accentPresets[defaultAccent];

export const theme = createTheme({
  cssVariables: {
    colorSchemeSelector: "class",
  },
  colorSchemes: {
    light: {
      palette: {
        mode: "light",
        primary: { main: accentMain, contrastText: "#ffffff" },
        secondary: { main: accentMain },
        background: {
          default: lightTokens.surface,
          paper: lightTokens.surface,
          canvas: lightTokens.canvas,
        },
        text: {
          primary: lightTokens.text,
          secondary: lightTokens.text2,
          disabled: lightTokens.text3,
        },
        divider: lightTokens.border,
        error: { main: "#d32f2f" },
        info: { main: "#3e63dd" },
      },
    },
    dark: {
      palette: {
        mode: "dark",
        primary: { main: darkTokens.text, contrastText: "#0b0b0c" },
        secondary: { main: darkTokens.text },
        background: {
          default: darkTokens.canvas,
          paper: darkTokens.surface,
          canvas: darkTokens.surface,
        },
        text: {
          primary: darkTokens.text,
          secondary: darkTokens.text2,
          disabled: darkTokens.text3,
        },
        divider: darkTokens.border,
        error: { main: "#ef5350" },
        info: { main: "#5b8def" },
      },
    },
  },
  shape: {
    borderRadius: radius.control,
  },
  typography: {
    fontFamily: typography.fontFamily,
    h1: typography.viewTitle,
    h2: typography.eventTitle,
    body1: typography.body,
    body2: typography.secondary,
    overline: {
      ...typography.sectionLabel,
      lineHeight: 1.4,
    },
  },
  components: {
    MuiButtonBase: {
      defaultProps: { disableRipple: true },
    },
    MuiTooltip: {
      defaultProps: { arrow: true },
    },
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          fontFeatureSettings: '"cv11", "ss01"',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          height: buttonHeight.sm,
          borderRadius: radius.control,
          textTransform: "none",
          fontSize: 13.5,
          fontWeight: 600,
          boxShadow: "none",
          "&:hover": { boxShadow: "none" },
        },
        outlined: ({ theme }) => ({
          borderWidth: 1.5,
          borderColor: theme.vars.palette.divider,
          "&:hover": { borderWidth: 1.5 },
        }),
        text: {
          color: "var(--mui-palette-text-secondary)",
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          borderRadius: radius.control,
        },
      },
      variants: [
        {
          props: { variant: "highlighted" },
          style: ({ theme }) => ({
            background: theme.vars.palette.primary.main,
            color: theme.vars.palette.primary.contrastText,
            "&:hover": {
              background: alpha(theme.palette.primary.main, 0.3),
            },
          }),
        },
      ],
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
        },
        outlined: ({ theme }) => ({
          borderColor: theme.vars.palette.divider,
        }),
        rounded: {
          borderRadius: radius.card,
        },
      },
    },
    MuiCard: {
      defaultProps: { variant: "outlined" },
      styleOverrides: {
        root: {
          borderRadius: radius.card,
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        // Make ALL dialogs full-screen on mobile, regardless of the
        // `fullScreen` prop being passed. Done once here in the theme so
        // we never have to touch each individual dialog component.
        paper: {
          borderRadius: radius.modal,
          boxShadow: shadow.modal,
          "@media (max-width:599.95px)": {
            margin: 0,
            width: "100%",
            maxWidth: "100%",
            height: "100dvh",
            maxHeight: "100dvh",
            borderRadius: 0,
            overflow: "hidden",
          },
        },
      },
    },
    MuiDialogContent: {
      styleOverrides: {
        root: {
          "@media (max-width:599.95px)": {
            overflowY: "auto",
            overflowX: "hidden",
            overscrollBehavior: "contain",
            WebkitOverflowScrolling: "touch",
          },
        },
      },
    },
    MuiDialogTitle: {
      styleOverrides: {
        root: {
          "html.ios-native &": {
            "@media (max-width:599.95px)": {
              paddingTop: "var(--iphone-safe-area)",
            },
          },
        },
      },
    },
    MuiDialogActions: {
      styleOverrides: {
        root: {
          "html.ios-native &": {
            "@media (max-width:599.95px)": {
              paddingBottom: "var(--iphone-safe-area-bottom)",
            },
          },
        },
      },
    },
    MuiModal: {
      styleOverrides: {
        // vaul (the mobile BottomSheet's drawer library) sets
        // `document.body.style.pointerEvents = "none"` while a sheet is
        // open, as its own focus-containment strategy, and only its own
        // Drawer content reclaims `auto` for itself. Every MUI Dialog/Menu/
        // Popover/Select etc. (all built on Modal) portals to
        // `document.body` too — a separate tree vaul doesn't know about —
        // so without this, any of them opened from inside a bottom sheet
        // silently inherits `pointer-events: none` and becomes completely
        // unclickable (backdrop, content, everything) despite rendering
        // fine visually. Reclaiming `auto` here, once, covers every modal
        // in the app instead of requiring a per-component workaround.
        root: {
          pointerEvents: "auto",
        },
      },
    },
    MuiPopover: {
      styleOverrides: {
        paper: {
          borderRadius: radius.popover,
          boxShadow: shadow.popover,
        },
      },
    },
    MuiMenu: {
      styleOverrides: {
        paper: {
          borderRadius: radius.popover,
          boxShadow: shadow.popover,
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: ({ theme }) => ({
          borderRadius: radius.control,
          fontSize: 12.5,
          "& .MuiOutlinedInput-notchedOutline": {
            borderWidth: 1.5,
            borderColor: theme.vars.palette.divider,
          },
          "&:hover .MuiOutlinedInput-notchedOutline": {
            borderColor: theme.vars.palette.text.secondary,
          },
          "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
            borderWidth: 1.8,
            borderColor: theme.vars.palette.primary.main,
          },
        }),
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: radius.sm,
          fontWeight: 600,
        },
      },
    },
    MuiSwitch: {
      styleOverrides: {
        root: {
          width: 44,
          height: 24,
          padding: 0,
        },
        switchBase: {
          padding: 2,
          "&.Mui-checked": {
            transform: "translateX(20px)",
          },
        },
        thumb: {
          width: 20,
          height: 20,
        },
        track: ({ theme }) => ({
          borderRadius: 12,
          opacity: 1,
          backgroundColor: theme.vars.palette.divider,
        }),
      },
    },
    MuiCheckbox: {
      styleOverrides: {
        root: {
          borderRadius: 6,
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        root: {
          minHeight: 36,
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: "none",
          fontSize: 12.5,
          fontWeight: 600,
          minHeight: 36,
        },
      },
    },
  },
  zIndex: {
    // vaul's mobile BottomSheet drawer content sits at z-index 1301 (see
    // BottomSheet.tsx) — outside MUI's own z-index scale entirely, since
    // vaul/Radix isn't a MUI component. Any MUI modal (Dialog/Menu/Popover/
    // Select/…) opened from inside a bottom sheet needs a base higher than
    // that to render above it. 1350 clears vaul's 1301 while staying below
    // MUI's own defaults for snackbar (1400) and tooltip (1500), so this
    // doesn't tie or invert against them — and MUI's own stacking
    // increments for multiple simultaneously-open modals still apply on
    // top of this base, unaffected.
    modal: 1350,
  },
});
