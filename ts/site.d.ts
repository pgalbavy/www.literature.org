interface Navigator {
  msMaxTouchPoints?: number;
}

interface Window {
  w3_open?: () => void;
  w3_close?: () => void;
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
