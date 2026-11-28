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

interface JSZipGenerateOptions {
  type: 'blob' | 'base64' | 'string' | 'uint8array' | 'arraybuffer' | 'nodebuffer';
  mimeType?: string;
  compression?: 'STORE' | 'DEFLATE';
}

interface JSZip {
  file(path: string, data: string | Promise<string> | Blob): JSZip;
  generateAsync(options: JSZipGenerateOptions): Promise<Blob>;
}

declare var JSZip: {
  new (): JSZip;
};

declare function fetchAsText(url: string): Promise<string>;
declare function fetchAsHTML(url: string): Promise<Document>;
declare function fetchAsXML(url: string): Promise<Document>;
declare function fetchAsJSON<T = any>(url: string): Promise<T>;
declare function fetchAsBlob(url: string): Promise<Blob>;
declare function Include(element: Element): Promise<Element>;
declare function appendElement(doc: Document, node: Node, elemName: string, value: string | null, attr?: string[][]): HTMLElement;
declare function prependElement(doc: Document, node: Node, elemName: string, value: string | null, attr?: string[][]): HTMLElement;
