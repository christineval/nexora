"use client";

import { useSyncExternalStore } from "react";
import { createTheme, ThemeProvider as MuiThemeProvider } from "@mui/material/styles";
import { getServerTheme, getTheme, subscribeTheme } from "@/lib/theme";

const lightTheme = createTheme({
  palette: { mode: "light", primary: { main: "#b91c1c" } },
  typography: { fontFamily: "Arial, Helvetica, sans-serif" },
});
const darkTheme = createTheme({
  palette: {
    mode: "dark",
    primary: { main: "#f87171" },
    background: { default: "#101010", paper: "#191919" },
    text: { primary: "#f5f5f5", secondary: "#aaaaaa" },
    divider: "#303030",
  },
  typography: { fontFamily: "Arial, Helvetica, sans-serif" },
});

export function useTheme() {
  return useSyncExternalStore(subscribeTheme, getTheme, getServerTheme);
}

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  return <MuiThemeProvider theme={theme === "dark" ? darkTheme : lightTheme}>{children}</MuiThemeProvider>;
}
