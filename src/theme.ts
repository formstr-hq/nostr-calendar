import { createTheme } from "@mui/material/styles";
import { alpha } from "@mui/material/styles";

declare module "@mui/material/IconButton" {
  interface IconButtonOwnProps {
    variant?: "highlighted";
  }
}

export const theme = createTheme({
  cssVariables: true,
  components: {
    MuiButtonBase: {
      defaultProps: {
        disableRipple: true,
      },
    },
    MuiTooltip: {
      defaultProps: {
        arrow: true,
      },
    },
    MuiIconButton: {
      variants: [
        {
          props: {
            variant: "highlighted",
          },
          style: ({ theme }) => ({
            background: theme.palette.primary.main,
            color: theme.palette.primary.contrastText,
            [":hover"]: {
              background: alpha(theme.palette.primary.main, 0.3),
            },
          }),
        },
      ],
    },
    MuiDialog: {
      styleOverrides: {
        // Make ALL dialogs full-screen on mobile, regardless of the
        // `fullScreen` prop being passed. Done once here in the theme so
        // we never have to touch each individual dialog component.
        paper: {
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
        // On mobile, keep the title clear of the iOS status bar / notch.
        // Dialogs that already set this explicitly via `sx` win (higher
        // specificity), so this only fills in for those that don't.
        root: {
          "@media (max-width:599.95px)": {
            paddingTop: "calc(16px + var(--safe-area-top))",
          },
        },
      },
    },
  },
  palette: {
    primary: {
      main: "#000000ff",
    },
    secondary: {
      main: "#163f5e",
    },
    info: {
      main: "#3e63dd",
    },
    error: {
      main: "#d32f2f",
    },
  },
  typography: {
    subtitle1: {
      fontWeight: "bold",
    },
    body2: {
      color: "hsl(215.4 16.3% 46.9%)",
    },
    h5: {
      fontWeight: "bold",
    },
    fontFamily: [
      "Menlo",
      "Monaco",
      "Consolas",
      "Liberation Mono",
      "system-ui",
      "Avenir",
      "Helvetica",
      "Arial",
      "sans-serif",
    ].join(","),
  },
});
