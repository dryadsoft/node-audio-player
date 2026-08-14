import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "node-audio-player.theme";

interface ThemeSelection {
  theme: Theme;
  followsSystem: boolean;
}

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const isTheme = (value: string | null): value is Theme =>
  value === "light" || value === "dark";

const readStoredTheme = (): Theme | undefined => {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(value) ? value : undefined;
  } catch {
    return undefined;
  }
};

const getSystemTheme = (): Theme =>
  window.matchMedia?.("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";

const getInitialSelection = (): ThemeSelection => {
  const storedTheme = readStoredTheme();
  return storedTheme
    ? { theme: storedTheme, followsSystem: false }
    : { theme: getSystemTheme(), followsSystem: true };
};

const applyTheme = (theme: Theme) => {
  document.documentElement.dataset.theme = theme;

  const themeColor = document.querySelector<HTMLMetaElement>(
    'meta[name="theme-color"]'
  );
  if (themeColor) {
    themeColor.content = theme === "light" ? "#f4f0e6" : "#101615";
  }
};

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [selection, setSelection] = useState<ThemeSelection>(getInitialSelection);

  useEffect(() => {
    applyTheme(selection.theme);
  }, [selection.theme]);

  useEffect(() => {
    if (!selection.followsSystem || !window.matchMedia) return;

    const mediaQuery = window.matchMedia("(prefers-color-scheme: light)");
    const handleChange = (event: MediaQueryListEvent) =>
      setSelection({
        theme: event.matches ? "light" : "dark",
        followsSystem: true,
      });

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [selection.followsSystem]);

  const toggleTheme = useCallback(() => {
    setSelection((current) => {
      const theme = current.theme === "dark" ? "light" : "dark";
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, theme);
      } catch {
        // Keep the selection for this session when storage is unavailable.
      }
      return { theme, followsSystem: false };
    });
  }, []);

  const value = useMemo(
    () => ({ theme: selection.theme, toggleTheme }),
    [selection.theme, toggleTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used within ThemeProvider");
  return value;
};
