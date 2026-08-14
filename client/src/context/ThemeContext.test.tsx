import "@testing-library/jest-dom";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  THEME_STORAGE_KEY,
  ThemeProvider,
  useTheme,
} from "./ThemeContext";

const listeners = new Set<(event: MediaQueryListEvent) => void>();
let systemPrefersLight = false;

const mockMatchMedia = () =>
  jest.fn().mockImplementation(() => ({
    matches: systemPrefersLight,
    media: "(prefers-color-scheme: light)",
    onchange: null,
    addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) =>
      listeners.add(listener),
    removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) =>
      listeners.delete(listener),
    addListener: jest.fn(),
    removeListener: jest.fn(),
    dispatchEvent: jest.fn(),
  }));

function ThemeProbe() {
  const { theme, toggleTheme } = useTheme();
  return <button onClick={toggleTheme}>{theme}</button>;
}

describe("ThemeProvider", () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete document.documentElement.dataset.theme;
    listeners.clear();
    systemPrefersLight = false;
    window.matchMedia = mockMatchMedia();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("follows the system theme until the user chooses a theme", async () => {
    systemPrefersLight = true;
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>
    );

    expect(screen.getByRole("button", { name: "light" })).toBeInTheDocument();
    await waitFor(() =>
      expect(document.documentElement).toHaveAttribute("data-theme", "light")
    );

    act(() => {
      systemPrefersLight = false;
      listeners.forEach((listener) =>
        listener({ matches: false } as MediaQueryListEvent)
      );
    });

    expect(screen.getByRole("button", { name: "dark" })).toBeInTheDocument();
  });

  it("persists an explicit selection and stops following the system", async () => {
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "dark" }));
    expect(screen.getByRole("button", { name: "light" })).toBeInTheDocument();
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    await waitFor(() => expect(listeners.size).toBe(0));
  });

  it("uses a valid stored selection before the system preference", () => {
    systemPrefersLight = true;
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");

    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>
    );

    expect(screen.getByRole("button", { name: "dark" })).toBeInTheDocument();
  });

  it("keeps working when theme storage is unavailable", () => {
    jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage unavailable");
    });
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "dark" }));
    expect(screen.getByRole("button", { name: "light" })).toBeInTheDocument();
  });
});
