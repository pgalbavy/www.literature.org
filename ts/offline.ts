// offline.ts — saving books for offline reading, and the Saved books page.
// Compiled output: hugo/assets/js/offline.js (bundled before page-loader.js)
//
// The service worker (sw.ts) serves saved pages when the network does not
// answer; this script registers it and does the saving. A book's contents
// page has a "reader-book-tools" box (partials/book-tools.html) describing
// the book; its chapters are the "reader-chapter-list" below. Saving puts
// the contents page, the author's page and every chapter into BOOKS_CACHE,
// and the book's details into LIBRARY_CACHE, which the Saved books page
// (/saved/, content/saved.md) lists. Everything stays in this browser.
"use strict";

// Shared with sw.ts
const OFFLINE_BOOKS_CACHE = "literature-books-v1";
const OFFLINE_ASSETS_CACHE = "literature-assets-v1";
const OFFLINE_LIBRARY_CACHE = "literature-library-v1";
const SAVED_BOOKS_PATH = "/saved/";
const SAVE_CONCURRENCY = 4;

interface BookChapter { title: string; url: string }
interface BookLink { label: string; href: string; host?: string }

// A book as the book page describes it; also what the EPUB is made from
interface BookInfo {
  title: string;
  author: string;
  authorFileAs: string;
  authorUrl: string;   // absolute, this site
  url: string;         // absolute, this site
  canonicalUrl: string;
  year?: string;
  source?: string;
  updated?: string;
  penNames?: string[];
  authorLinks?: BookLink[];
  bookLinks?: BookLink[];
  chapters: BookChapter[];
}

interface SavedBook extends BookInfo {
  saved: string;       // ISO date
  pages: string[];     // every address stored for it
}

function offlineSupported(): boolean {
  return "serviceWorker" in navigator && typeof caches !== "undefined" && window.isSecureContext;
}

function registerServiceWorker(): void {
  if (!offlineSupported()) return;
  navigator.serviceWorker.register("/sw.js").catch(error => {
    console.error("Could not start offline reading.", error);
  });
}

// ── Books ──────────────────────────────────────────────────────────────

// The book a "reader-book-tools" box describes (partials/book-tools.html).
// Its chapters are the list below it on the book's contents page; in a
// chapter's Info dialog they are fetched when needed (bookChapters()).
function bookFromTools(tools: HTMLElement): BookInfo {
  const data = tools.dataset;
  const here = new URL(window.location.href);
  here.hash = "";
  here.search = "";
  const bookUrl = new URL(data.path ?? here.pathname, here);
  const list = tools.closest("article")?.querySelector(".reader-chapter-list");
  const chapters = list ? chapterLinks(list, bookUrl) : [];
  const json = <T>(text: string | undefined): T | undefined => {
    try { return text ? JSON.parse(text) as T : undefined; } catch (_) { return undefined; }
  };
  return {
    title: data.title ?? document.title,
    author: data.author ?? "",
    authorFileAs: data.authorFileAs ?? data.author ?? "",
    authorUrl: new URL(data.authorUrl ?? "../", bookUrl).href,
    url: bookUrl.href,
    canonicalUrl: data.url ?? bookUrl.href,
    year: data.year,
    source: data.source,
    updated: data.updated,
    penNames: json<string[]>(data.penNames),
    authorLinks: json<BookLink[]>(data.authorLinks),
    bookLinks: json<BookLink[]>(data.bookLinks),
    chapters,
  };
}

function chapterLinks(list: ParentNode, base: URL): BookChapter[] {
  return [...list.querySelectorAll<HTMLAnchorElement>("a[href]")].map(link => ({
    title: (link.textContent ?? "").trim(),
    url: new URL(link.getAttribute("href") ?? "", base).href,
  }));
}

// Fills in the chapters of a book described from a chapter's Info dialog,
// from its contents page (the saved copy when there is one)
async function bookChapters(book: BookInfo): Promise<BookChapter[]> {
  if (book.chapters.length === 0) {
    const page = new DOMParser().parseFromString(await fetchBookPage(book.url), "text/html");
    const list = page.querySelector("body > article .reader-chapter-list");
    if (list) book.chapters = chapterLinks(list, new URL(book.url));
  }
  if (book.chapters.length === 0) throw new Error(`${book.url}: no chapters found`);
  return book.chapters;
}

function libraryKey(bookUrl: string): string {
  const url = new URL(bookUrl);
  url.hash = "";
  url.search = "";
  return url.href;
}

async function savedBook(bookUrl: string): Promise<SavedBook | undefined> {
  if (!offlineSupported()) return undefined;
  const cache = await caches.open(OFFLINE_LIBRARY_CACHE);
  const response = await cache.match(libraryKey(bookUrl));
  return response ? response.json() : undefined;
}

async function savedBooks(): Promise<SavedBook[]> {
  if (!offlineSupported()) return [];
  const cache = await caches.open(OFFLINE_LIBRARY_CACHE);
  const books: SavedBook[] = [];
  for (const key of await cache.keys()) {
    try {
      const response = await cache.match(key);
      if (response) books.push(await response.json());
    } catch (error) {
      console.error("Could not read a saved book's details.", error);
    }
  }
  return books;
}

// A redirected response (an old .html address) cannot be served for a page
// request, so it is stored as a plain copy (as in sw.ts)
async function storableResponse(response: Response): Promise<Response> {
  if (!response.redirected) return response;
  return new Response(await response.blob(), {
    status: response.status, statusText: response.statusText, headers: response.headers,
  });
}

// The stylesheet, script, icons and fonts this page is using, so that saved
// pages look the same offline
function pageAssets(): string[] {
  const found = new Set<string>();
  const add = (address: string | null | undefined): void => {
    if (!address) return;
    const url = new URL(address, window.location.href);
    if (url.origin === window.location.origin && /^\/(bundle|fonts)\//.test(url.pathname)) found.add(url.href);
  };
  document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"], link[rel="preload"]').forEach(link => add(link.href));
  document.querySelectorAll<HTMLScriptElement>("script[src]").forEach(script => add(script.src));
  add(document.documentElement.dataset.iconSprite);
  if (typeof performance?.getEntriesByType === "function") {
    performance.getEntriesByType("resource").forEach(entry => add(entry.name));
  }
  return [...found];
}

async function cacheAssets(): Promise<void> {
  const cache = await caches.open(OFFLINE_ASSETS_CACHE);
  await Promise.all(pageAssets().map(async address => {
    if (await cache.match(address)) return;
    try { await cache.add(address); } catch (_) { /* the next page view caches it */ }
  }));
  // The Saved books page, shown offline for pages that were not saved
  navigator.serviceWorker?.controller?.postMessage("cache-saved-page");
}

async function saveBook(book: BookInfo, progress: (done: number, total: number) => void, signal: AbortSignal): Promise<void> {
  const pages = [book.url, book.authorUrl, ...book.chapters.map(chapter => chapter.url)];
  const cache = await caches.open(OFFLINE_BOOKS_CACHE);
  let done = 0;
  let next = 0;
  progress(done, pages.length);

  const worker = async (): Promise<void> => {
    while (next < pages.length) {
      if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
      const page = pages[next++];
      const response = await fetch(page, { signal, credentials: "same-origin" });
      if (!response.ok) throw new Error(`${page}: HTTP ${response.status}`);
      await cache.put(page, await storableResponse(response));
      progress(++done, pages.length);
    }
  };
  try {
    await Promise.all(Array.from({ length: SAVE_CONCURRENCY }, worker));
  } catch (error) {
    // Nothing half saved: the author's page may belong to another saved book
    const others = await savedBooks();
    await Promise.all(pages.filter(page => !others.some(other => other.pages.includes(page)))
      .map(page => cache.delete(page)));
    throw error;
  }
  await cacheAssets();
  const record: SavedBook = { ...book, saved: new Date().toISOString(), pages };
  const library = await caches.open(OFFLINE_LIBRARY_CACHE);
  await library.put(libraryKey(book.url), new Response(JSON.stringify(record), {
    headers: { "Content-Type": "application/json" },
  }));
  // Ask the browser not to clear saved books when it runs short of space
  try { await navigator.storage?.persist?.(); } catch (_) { /* noop */ }
}

async function removeBook(bookUrl: string): Promise<void> {
  const book = await savedBook(bookUrl);
  const library = await caches.open(OFFLINE_LIBRARY_CACHE);
  await library.delete(libraryKey(bookUrl));
  if (!book) return;
  // An author's page stays while another of their books is saved
  const others = await savedBooks();
  const cache = await caches.open(OFFLINE_BOOKS_CACHE);
  await Promise.all(book.pages.filter(page => !others.some(other => other.pages.includes(page)))
    .map(page => cache.delete(page)));
}

// A page of a book for the EPUB: the saved copy if there is one, so a saved
// book can be exported offline
async function fetchBookPage(url: string): Promise<string> {
  if (offlineSupported()) {
    const saved = await caches.match(url, { cacheName: OFFLINE_BOOKS_CACHE });
    if (saved) return saved.text();
  }
  const response = await fetch(url, { credentials: "same-origin" });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.text();
}

function formatSavedDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  } catch (_) {
    return iso.slice(0, 10);
  }
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

// ── The book page ──────────────────────────────────────────────────────

let saving: AbortController | undefined;

function toolButton(className: string, icon: string, label: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `w3-button reader-book-tool ${className}`;
  button.innerHTML = `${iconMarkup(icon, "md-lit")}<span></span>`;
  button.querySelector("span")!.textContent = label;
  return button;
}

function setToolLabel(button: HTMLButtonElement, icon: string, label: string): void {
  button.innerHTML = `${iconMarkup(icon, "md-lit")}<span></span>`;
  button.querySelector("span")!.textContent = label;
}

// Every book tools box on the page: the contents page's and the Info
// dialog's (replaced when a page loads in place)
function initializeBookTools(): void {
  document.querySelectorAll<HTMLElement>(".reader-book-tools:not([data-tools-ready])")
    .forEach(tools => { void setUpBookTools(tools); });
}

async function setUpBookTools(tools: HTMLElement): Promise<void> {
  const book = bookFromTools(tools);
  tools.dataset.toolsReady = "true";
  tools.replaceChildren();

  const status = document.createElement("p");
  status.className = "reader-book-tools-status";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");

  const epub = toolButton("reader-epub-button", "file_download", "Download EPUB");
  epub.title = "Download this book as an EPUB file for e-readers and reading apps";
  epub.addEventListener("click", async () => {
    if (epub.disabled) return;
    epub.disabled = true;
    try {
      await bookChapters(book);
      await downloadEpub(book, message => { status.textContent = message; });
    } catch (error) {
      console.error("Could not make the EPUB.", error);
      status.textContent = navigator.onLine === false
        ? "Could not make the EPUB while offline: save the book for offline reading first."
        : "Could not make the EPUB. Please try again.";
    } finally {
      epub.disabled = false;
    }
  });

  if (offlineSupported()) {
    const save = toolButton("reader-save-button", "offline_pin", "Save for offline reading");
    const show = async (): Promise<void> => {
      const saved = await savedBook(book.url);
      save.classList.toggle("reader-book-tool--saved", Boolean(saved));
      if (saved) {
        setToolLabel(save, "delete_outline", "Remove from this browser");
        status.textContent = `Saved in this browser for offline reading on ${formatSavedDate(saved.saved)}.`;
      } else {
        setToolLabel(save, "offline_pin", "Save for offline reading");
      }
    };
    save.addEventListener("click", async () => {
      if (saving) {
        saving.abort();
        return;
      }
      if (await savedBook(book.url)) {
        await removeBook(book.url);
        status.textContent = "Removed from this browser.";
        await show();
        return;
      }
      saving = new AbortController();
      setToolLabel(save, "close", "Cancel saving");
      try {
        status.textContent = "Saving…";
        await bookChapters(book);
        await saveBook(book, (done, total) => {
          status.textContent = `Saving: ${done} of ${plural(total, "page")}…`;
        }, saving.signal);
        await show();
        status.textContent = `Saved: ${plural(book.chapters.length, "chapter")}, readable offline in this browser. See Saved books in the menu.`;
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          status.textContent = "Saving cancelled.";
        } else {
          console.error("Could not save the book.", error);
          status.textContent = "Could not save the book. Please check the connection and try again.";
        }
        await show();
      } finally {
        saving = undefined;
      }
    });
    tools.append(save);
    await show();
  }
  tools.append(epub, status);
  tools.hidden = false;
}

// ── The Saved books page ───────────────────────────────────────────────

async function initializeSavedPage(): Promise<void> {
  const page = document.querySelector<HTMLElement>("body > article [data-saved-books]");
  if (!page) return;
  const list = page.querySelector<HTMLElement>(".reader-saved-list");
  const offlineNote = page.querySelector<HTMLElement>(".reader-saved-offline");
  // Served by sw.ts for a page that was never saved
  if (offlineNote) offlineNote.hidden = window.location.pathname === SAVED_BOOKS_PATH;
  if (!list) return;

  if (!offlineSupported()) {
    list.hidden = false;
    list.innerHTML = "<p>This browser cannot save books for offline reading.</p>";
    return;
  }
  const books = (await savedBooks()).sort((a, b) =>
    a.authorFileAs.localeCompare(b.authorFileAs) || a.title.localeCompare(b.title));
  list.replaceChildren();
  list.hidden = false;

  if (books.length === 0) {
    const empty = document.createElement("p");
    empty.className = "reader-saved-empty";
    empty.textContent = "No books are saved in this browser yet.";
    list.append(empty);
    return;
  }

  const items = document.createElement("ul");
  items.className = "reader-saved-books";
  for (const book of books) {
    const item = document.createElement("li");
    item.className = "reader-saved-book";
    const link = document.createElement("a");
    link.className = "reader-saved-title";
    link.href = book.url;
    link.textContent = book.title;
    const details = document.createElement("span");
    details.className = "reader-saved-details";
    details.textContent = `${book.author} · ${plural(book.chapters.length, "chapter")} · saved ${formatSavedDate(book.saved)}`;
    const text = document.createElement("div");
    text.className = "reader-saved-text";
    text.append(link, details);

    const actions = document.createElement("div");
    actions.className = "reader-saved-actions";
    const epub = toolButton("reader-epub-button", "file_download", "EPUB");
    epub.title = `Download ${book.title} as an EPUB file`;
    epub.setAttribute("aria-label", `Download ${book.title} as an EPUB file`);
    epub.addEventListener("click", async () => {
      epub.disabled = true;
      try { await downloadEpub(book, () => undefined); } catch (error) {
        console.error("Could not make the EPUB.", error);
      } finally { epub.disabled = false; }
    });
    const remove = toolButton("reader-remove-button", "delete_outline", "Remove");
    remove.title = `Remove ${book.title} from this browser`;
    remove.setAttribute("aria-label", `Remove ${book.title} from this browser`);
    remove.addEventListener("click", async () => {
      await removeBook(book.url);
      await initializeSavedPage();
    });
    actions.append(epub, remove);
    item.append(text, actions);
    items.append(item);
  }
  list.append(items);

  try {
    const estimate = await navigator.storage?.estimate?.();
    if (estimate?.usage) {
      const usage = document.createElement("p");
      usage.className = "reader-saved-usage";
      usage.textContent = `${plural(books.length, "book")} saved, using about ${(estimate.usage / 1048576).toFixed(1)} MB of this browser's storage.`;
      list.append(usage);
    }
  } catch (_) { /* noop */ }
}

function initializeOfflinePage(): void {
  initializeBookTools();
  void initializeSavedPage();
}

registerServiceWorker();
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeOfflinePage);
} else {
  initializeOfflinePage();
}
window.addEventListener(PAGE_LOADED_EVENT, initializeOfflinePage);
