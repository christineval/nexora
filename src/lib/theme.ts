export type Theme = "light" | "dark";

const themeKey = "nexora-theme";
const previousThemeKey = "erp-lite-theme";
const legacyThemeKey = "erp-lite-login-theme";
const themeEvent = "nexora-theme-change";

// Apply the saved palette before paint; the server cannot read localStorage.
export const themeInitializationScript = `(() => {
  let theme = "dark";
  try {
    const saved = localStorage.getItem("${themeKey}") ?? localStorage.getItem("${previousThemeKey}") ?? localStorage.getItem("${legacyThemeKey}");
    if (saved === "light" || saved === "dark") theme = saved;
  } catch {}
  document.documentElement.dataset.theme = theme;
})();`;

export function getTheme(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

export function getServerTheme(): Theme {
  return "dark";
}

export function setTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(themeKey, theme);
  } catch {
    // Theme switching remains usable when storage is blocked.
  }
  window.dispatchEvent(new Event(themeEvent));
}

export function subscribeTheme(callback: () => void) {
  function onStorage(event: StorageEvent) {
    if (event.key !== themeKey && event.key !== previousThemeKey && event.key !== legacyThemeKey && event.key !== null) return;
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(themeKey) ?? localStorage.getItem(previousThemeKey) ?? localStorage.getItem(legacyThemeKey);
    } catch {
      return;
    }
    document.documentElement.dataset.theme = saved === "light" ? "light" : "dark";
    callback();
  }

  window.addEventListener("storage", onStorage);
  window.addEventListener(themeEvent, callback);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(themeEvent, callback);
  };
}
