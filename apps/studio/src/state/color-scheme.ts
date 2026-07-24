export type ColorScheme = "light" | "dark";

export const COLOR_SCHEME_KEY = "okeytokey.color-scheme";

interface ColorSchemeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface ThemeRoot {
  dataset: DOMStringMap;
  style: CSSStyleDeclaration;
}

function browserStorage(): ColorSchemeStorage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

function systemPrefersDark(): boolean {
  const browserGlobal = globalThis as unknown as {
    matchMedia?: (query: string) => { matches: boolean };
  };
  return browserGlobal.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

function browserRoot(): ThemeRoot | undefined {
  const browserGlobal = globalThis as unknown as {
    document?: { documentElement: ThemeRoot };
  };
  return browserGlobal.document?.documentElement;
}

export function readColorScheme(
  storage: ColorSchemeStorage | undefined = browserStorage(),
): ColorScheme {
  try {
    const stored = storage?.getItem(COLOR_SCHEME_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // A blocked localStorage should not prevent Studio from starting.
  }

  return systemPrefersDark() ? "dark" : "light";
}

export function applyColorScheme(
  scheme: ColorScheme,
  root: ThemeRoot | undefined = browserRoot(),
): void {
  if (!root) return;
  root.dataset.colorScheme = scheme;
  root.style.colorScheme = scheme;
}

export function saveColorScheme(
  scheme: ColorScheme,
  storage: ColorSchemeStorage | undefined = browserStorage(),
): void {
  try {
    storage?.setItem(COLOR_SCHEME_KEY, scheme);
  } catch {
    // The preference remains active for this session when storage is blocked.
  }
  applyColorScheme(scheme);
}
