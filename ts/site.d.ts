interface Navigator {
  msMaxTouchPoints?: number;
}

// Reader Settings, owned by reader-settings.ts and shared with reader-mode.ts
interface ReaderSettings {
  width: "narrow" | "normal" | "wide";
  font: "open-sans" | "karla" | "literata" | "georgia" | "times" | "arial" | "verdana" | "opendyslexic";
  size: number;
  theme: "light" | "dark" | "system";
  resumeLastLocation: boolean;
  mode: "scroll" | "page";
  bookMode: boolean;
}

// detail of the "reader-settings-changed" window event
interface ReaderSettingsChange {
  settings: ReaderSettings;
  changed: (keyof ReaderSettings)[];
}

interface LiteratureReader {
  getSettings(): ReaderSettings;
  updateSettings(changes: Partial<ReaderSettings>, message?: string): void;
  visibleParagraph(): HTMLParagraphElement | undefined;
  ensureParagraphIds(): HTMLParagraphElement[];
  openSettings(): void;
}

interface Window {
  w3_open?: () => void;
  w3_close?: () => void;
  w3_toggle?: () => void;
  w3_nextPage?: () => void;
  w3_prevPage?: () => void;
  initializeReaderMode?: () => void;
  // Load a page of this site in place (page-loader.ts), so full screen
  // survives; falls back to a normal page load
  literatureNavigate?: (href: string, options?: { openAtEnd?: boolean }) => void;
  __literatureHomeClick?: () => void;
  initializeReaderSettings?: (drawer: HTMLElement | null) => void;
  literatureReader?: LiteratureReader;
}
