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
