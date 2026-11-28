// reader-settings.ts — reading Settings dialog, last-location resume, share,
// and font-size gestures. Compiled output: hugo/assets/js/reader-settings.js
//
// This script is the single owner of the reader Settings. Other scripts read
// and change them through window.literatureReader and listen for the
// "reader-settings-changed" event.
"use strict";

// ── Icons ──────────────────────────────────────────────────────────────

// Markup for an icon from the SVG sprite file, whose hashed address the
// Hugo layouts put on <html data-icon-sprite>
// (hugo/layouts/partials/icon-sprite-url.html). Also used by reader-mode.ts.
function iconMarkup(name: string, className = ""): string {
  const classes = className ? `icon ${className}` : "icon";
  const sprite = document.documentElement.dataset.iconSprite ?? "";
  return `<svg class="${classes}" aria-hidden="true" focusable="false"><use href="${sprite}#icon-${name}"></use></svg>`;
}

// ── Constants ──────────────────────────────────────────────────────────

const STORAGE_KEY = "literature.org.readerSettings";
const LAST_LOCATION_KEY = "literature.org.lastReadingLocation";
const HOME_VISITED_KEY = "literature.org.home-visited";
const SETTINGS_EVENT = "reader-settings-changed";
const PAGE_EVENT = "reader-page-changed";
const MIN_SIZE = 6;
const MAX_SIZE = 32;
const DEFAULTS: ReaderSettings = {
  width: "normal",
  font: "open-sans",
  size: 16,
  theme: "system",
  resumeLastLocation: true,
  mode: "page",
  bookMode: false,
};
const LEGACY_SIZES: { [key: string]: number } = { small: 14, medium: 16, large: 20 };
const ALLOWED: { [key: string]: readonly string[] } = {
  width: ["narrow", "normal", "wide"],
  font: ["open-sans", "karla", "literata", "georgia", "times", "arial", "verdana", "opendyslexic"],
  theme: ["light", "dark", "system"],
  mode: ["scroll", "page"],
};

// The font choices in Settings. Each entry is styled in its own face, which
// desktop Chrome and Firefox show as a preview (other browsers draw their
// own plain menu). The families match --reader-font-family in literature.css.
const FONT_CHOICES: [ReaderSettings["font"], string, string, string][] = [
  ["arial", "Arial", "sans-serif", "Arial, sans-serif"],
  ["georgia", "Georgia", "serif", "Georgia, serif"],
  ["karla", "Karla", "", "Karla, sans-serif"],
  ["literata", "Literata", "serif, made for reading on screen", "Literata, Georgia, serif"],
  ["opendyslexic", "Open Dyslexic", "dyslexia-friendly", "'OpenDyslexic', sans-serif"],
  ["open-sans", "Open Sans", "default", "'Open Sans', Karla, sans-serif"],
  ["times", "Times New Roman", "serif", "'Times New Roman', serif"],
  ["verdana", "Verdana", "sans-serif", "Verdana, sans-serif"],
];

// ── State ──────────────────────────────────────────────────────────────

let readerSettings: ReaderSettings = { ...DEFAULTS };
let dialog: HTMLDialogElement | undefined;
let readerStatus: HTMLElement | undefined;
let loadError = false;

// ── Helpers ────────────────────────────────────────────────────────────

function readerArticle(): HTMLElement | null {
  return document.querySelector("article.reader-content");
}

function clampSize(size: number): number {
  return Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round(size)));
}

function isAllowed(key: string, value: unknown): boolean {
  if (key === "size") return Number.isInteger(value) && (value as number) >= MIN_SIZE && (value as number) <= MAX_SIZE;
  if (key === "resumeLastLocation" || key === "bookMode") return typeof value === "boolean";
  const allowed = ALLOWED[key];
  return allowed !== undefined && allowed.includes(value as string);
}

function setStatus(message: string): void {
  if (readerStatus) readerStatus.textContent = message;
}

function applySettings(): void {
  const root = document.documentElement;
  root.dataset.readerWidth = readerSettings.width;
  root.dataset.readerFont = readerSettings.font;
  root.dataset.readerSize = String(readerSettings.size);
  root.dataset.readerTheme = readerSettings.theme;
  root.dataset.readerMode = readerSettings.mode;
  root.dataset.readerBookmode = String(readerSettings.bookMode);
  root.style.setProperty("--reader-font-size", `${readerSettings.size}pt`);
}

function loadSettings(): void {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === null) return;

    const parsed = JSON.parse(saved);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Saved reader Settings are not an object.");
    }

    for (const key of Object.keys(DEFAULTS) as (keyof ReaderSettings)[]) {
      const value = key === "size" && typeof parsed.size === "string" &&
        Object.prototype.hasOwnProperty.call(LEGACY_SIZES, parsed.size)
        ? LEGACY_SIZES[parsed.size]
        : parsed[key];
      if (isAllowed(key, value)) (readerSettings as any)[key] = value;
    }
  } catch (error) {
    console.error("Could not read saved reader Settings.", error);
    loadError = true;
  }
}

function saveSettings(successMessage: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(readerSettings));
    setStatus(successMessage);
  } catch (error) {
    console.error("Could not save reader Settings in this browser.", error);
    setStatus("Settings apply for this visit, but could not be saved in this browser.");
  }
}

// Apply, save and announce a change. Invalid values are ignored.
function updateSettings(changes: Partial<ReaderSettings>, message = "Settings saved in this browser."): void {
  const changed: (keyof ReaderSettings)[] = [];
  for (const key of Object.keys(changes) as (keyof ReaderSettings)[]) {
    const value = changes[key];
    if (!isAllowed(key, value) || readerSettings[key] === value) continue;
    (readerSettings as any)[key] = value;
    changed.push(key);
  }
  if (changed.length === 0) return;
  applySettings();
  syncControls();
  saveSettings(message);
  window.dispatchEvent(new CustomEvent(SETTINGS_EVENT, {
    detail: { settings: { ...readerSettings }, changed },
  }));
  if (changed.includes("resumeLastLocation")) initializeLastLocation();
}

function resetSettings(): void {
  const changed = (Object.keys(DEFAULTS) as (keyof ReaderSettings)[])
    .filter((key) => readerSettings[key] !== DEFAULTS[key]);
  readerSettings = { ...DEFAULTS };
  applySettings();
  syncControls();
  saveSettings("Reading Settings reset to defaults.");
  window.dispatchEvent(new CustomEvent(SETTINGS_EVENT, {
    detail: { settings: { ...readerSettings }, changed },
  }));
  initializeLastLocation();
}

// Give every paragraph a stable id so a location can be saved and shared.
function ensureParagraphIds(): HTMLParagraphElement[] {
  const article = readerArticle();
  if (!article) return [];
  const paragraphs = [...article.querySelectorAll<HTMLParagraphElement>("p")];
  paragraphs.forEach((paragraph, index) => {
    if (!paragraph.id) paragraph.id = `reader-paragraph-${index + 1}`;
  });
  return paragraphs;
}

function isPaged(): boolean {
  return document.documentElement.dataset.readerPaged === "true";
}

// The area of the screen the text is read in: the page box in page mode,
// otherwise the viewport below the toolbar.
function readingBounds(): { top: number; bottom: number; left: number; right: number } {
  const article = readerArticle();
  if (isPaged() && article) {
    const box = article.getBoundingClientRect();
    return { top: box.top, bottom: box.bottom, left: box.left, right: box.right };
  }
  const toolbarBottom = document.querySelector(".reader-toolbar")?.getBoundingClientRect().bottom ?? 0;
  return { top: Math.max(0, toolbarBottom), bottom: window.innerHeight, left: 0, right: window.innerWidth };
}

function visibleParagraph(): HTMLParagraphElement | undefined {
  const area = readingBounds();
  return ensureParagraphIds().find((paragraph) =>
    [...paragraph.getClientRects()].some((rect) =>
      rect.bottom > area.top && rect.top < area.bottom &&
      rect.right > area.left && rect.left < area.right));
}

function syncControls(): void {
  if (!dialog) return;
  dialog.querySelectorAll<HTMLInputElement>("[name]").forEach((el) => {
    const value = readerSettings[el.name as keyof ReaderSettings];
    if (el.type === "checkbox") el.checked = Boolean(value);
    else if (el.type === "radio") el.checked = el.value === String(value);
    else el.value = String(value);
  });
  const sizeValue = dialog.querySelector<HTMLElement>("#reader-settings-size-value");
  if (sizeValue) sizeValue.textContent = `${readerSettings.size} pt`;
  const sizeSlider = dialog.querySelector<HTMLInputElement>("#reader-settings-size");
  if (sizeSlider) sizeSlider.setAttribute("aria-valuetext", `${readerSettings.size} points`);
}

// ── Dialog ─────────────────────────────────────────────────────────────

function createDialog(): void {
  dialog = document.createElement("dialog");
  dialog.className = "reader-settings-dialog";
  dialog.setAttribute("aria-labelledby", "reader-settings-title");
  dialog.innerHTML = `
    <div class="reader-settings-heading">
      <h2 id="reader-settings-title">Reading Settings</h2>
      <button class="w3-button" type="button" aria-label="Close reading Settings">
        ${iconMarkup("close", "md-lit")}
      </button>
    </div>
    <fieldset>
      <legend>Reading width</legend>
      <div class="reader-width-options">
        <label><input type="radio" name="width" value="narrow">
          ${iconMarkup("format_indent_decrease")} Narrow</label>
        <label><input type="radio" name="width" value="normal">
          ${iconMarkup("format_align_justify")} Normal</label>
        <label><input type="radio" name="width" value="wide">
          ${iconMarkup("format_indent_increase")} Wide</label>
      </div>
    </fieldset>
    <fieldset>
      <legend>Reading mode</legend>
      <div class="reader-width-options">
        <label><input type="radio" name="mode" value="page">
          ${iconMarkup("import_contacts")} Page</label>
        <label><input type="radio" name="mode" value="scroll">
          ${iconMarkup("vertical_align_bottom")} Scroll</label>
      </div>
    </fieldset>
    <label class="reader-settings-resume">
      <input type="checkbox" name="bookMode">
      In page mode, show two pages side by side on wide screens
    </label>
    <label class="reader-settings-field" for="reader-settings-font">Font</label>
    <select id="reader-settings-font" name="font">${FONT_CHOICES.map(([value, name, note, family]) => `
      <option value="${value}" style="font-family: ${family}">${name}${note ? ` (${note})` : ""}</option>`).join("")}
    </select>
    <label class="reader-settings-field" for="reader-settings-size">Font size
      <output id="reader-settings-size-value" for="reader-settings-size">16 pt</output>
    </label>
    <input id="reader-settings-size" name="size" type="range" min="${MIN_SIZE}" max="${MAX_SIZE}" step="1" value="16"
      list="reader-settings-size-ticks" aria-describedby="reader-settings-size-value reader-settings-size-limits">
    <datalist id="reader-settings-size-ticks">
      <option value="6"></option><option value="8"></option><option value="10"></option>
      <option value="12"></option><option value="14"></option><option value="16"></option>
      <option value="18"></option><option value="20"></option><option value="22"></option>
      <option value="24"></option><option value="26"></option><option value="28"></option>
      <option value="30"></option><option value="32"></option>
    </datalist>
    <div id="reader-settings-size-limits" class="reader-settings-size-limits" aria-hidden="true">
      <span>${MIN_SIZE} pt</span><span>${MAX_SIZE} pt</span>
    </div>
    <label class="reader-settings-field" for="reader-settings-theme">Theme</label>
    <select id="reader-settings-theme" name="theme">
      <option value="light">Light</option>
      <option value="dark">Dark</option>
      <option value="system">Follow browser / system</option>
    </select>
    <label class="reader-settings-resume">
      <input type="checkbox" name="resumeLastLocation">
      Return to your last reading location when opening the home page
    </label>
    <p class="reader-settings-privacy">Your reading settings and last reading location are stored only in this browser and are never sent to literature.org. <a href="#" class="reader-settings-reset-link">Reset to defaults</a>.</p>
    <p class="reader-settings-status" role="status" aria-live="polite"></p>
  `;
  document.body.appendChild(dialog);
  readerStatus = dialog.querySelector<HTMLElement>(".reader-settings-status") ?? undefined;
  if (loadError) setStatus("Saved Settings could not be read. Defaults are being used.");

  dialog.querySelector(".reader-settings-heading button")
    ?.addEventListener("click", () => dialog!.close());

  dialog.querySelector(".reader-settings-reset-link")?.addEventListener("click", (event) => {
    event.preventDefault();
    resetSettings();
  });

  // Click on the backdrop closes the dialog
  dialog.addEventListener("click", (event) => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right ||
        event.clientY < bounds.top || event.clientY > bounds.bottom) {
      dialog.close();
    }
  });

  dialog.addEventListener("change", (event) => {
    const control = event.target as HTMLInputElement;
    if (!control.name) return;
    const value = control.type === "checkbox"
      ? control.checked
      : control.name === "size" ? Number(control.value) : control.value;
    updateSettings({ [control.name]: value } as Partial<ReaderSettings>);
  });

  // Live preview while the size slider is dragged; "change" saves it.
  dialog.addEventListener("input", (event) => {
    const control = event.target as HTMLInputElement;
    if (control.name !== "size") return;
    updateSettings({ size: Number(control.value) });
  });
}

// ── Font-size gestures ─────────────────────────────────────────────────

// Pinch and Ctrl+wheel set the text size on every page. Set up once: the
// page's <article> is kept when pages load in place (page-loader.ts).
function initializeFontSizeGestures(): void {
  const article = document.querySelector<HTMLElement>("body > article");
  if (!article || article.dataset.fontSizeGesturesInitialized) return;
  article.dataset.fontSizeGesturesInitialized = "true";

  // Two-finger pinch
  let pinch: { distance: number; size: number } | undefined;
  const distanceBetweenTouches = (touches: TouchList): number => {
    if (touches.length < 2) return 0;
    return Math.hypot(touches[0].pageX - touches[1].pageX, touches[0].pageY - touches[1].pageY);
  };

  article.addEventListener("touchstart", (event: TouchEvent) => {
    if (event.touches.length !== 2) {
      pinch = undefined;
      return;
    }
    if (event.target instanceof Element && event.target.closest("a, button, input, select, textarea")) return;
    const distance = distanceBetweenTouches(event.touches);
    if (distance > 0) pinch = { distance, size: readerSettings.size };
  }, { passive: true });

  article.addEventListener("touchmove", (event: TouchEvent) => {
    if (!pinch || event.touches.length !== 2) return;
    event.preventDefault();
    updateSettings({ size: clampSize(pinch.size * distanceBetweenTouches(event.touches) / pinch.distance) });
  }, { passive: false });

  const finishPinch = (): void => { pinch = undefined; };
  article.addEventListener("touchend", (event: TouchEvent) => {
    if (event.touches.length < 2) finishPinch();
  }, { passive: true });
  article.addEventListener("touchcancel", finishPinch, { passive: true });

  // Ctrl/Cmd + mouse wheel anywhere on the page, instead of browser zoom
  let wheelDelta = 0;
  document.addEventListener("wheel", (event: WheelEvent) => {
    if (!event.ctrlKey && !event.metaKey) return;
    if (Math.abs(event.deltaY) < Math.abs(event.deltaX)) return;
    event.preventDefault();
    wheelDelta -= event.deltaY * 0.02;
    const steps = Math.trunc(wheelDelta);
    if (steps === 0) return;
    wheelDelta -= steps;
    updateSettings({ size: clampSize(readerSettings.size + steps) });
  }, { passive: false });
}

// ── Settings button ────────────────────────────────────────────────────

function addSettingsButton(drawer: HTMLElement): void {
  if (drawer.querySelector(".reader-settings-button")) return;
  const menu = drawer.querySelector("#sidebar-links") || drawer;
  const button = document.createElement("button");
  button.className = "w3-bar-item w3-button reader-settings-button";
  button.type = "button";
  button.title = "Reading Settings";
  button.setAttribute("aria-label", "Reading Settings");
  button.innerHTML = `${iconMarkup("settings", "md-lit")}<span class="reader-drawer-label">Reading Settings</span>`;
  button.addEventListener("click", openSettings);
  menu.appendChild(button);
}

function openSettings(): void {
  if (!dialog || dialog.open) return;
  syncControls();
  dialog.showModal();
}

// ── Last location ──────────────────────────────────────────────────────

// atLoad: a real page load. Only that may send the home page on to the last
// location; the reader going home within the site (page-loader.ts) or
// changing the setting must stay there.
function initializeLastLocation(atLoad = false): void {
  if (!readerSettings.resumeLastLocation) return;

  // On the home page, offer to continue where the reader left off
  if ((window.location.pathname === "/" || window.location.pathname === "/index.html") &&
      !window.location.search && !window.location.hash) {
    if (!atLoad) return;
    try {
      // Don't redirect if the reader explicitly navigated home in this tab
      if (sessionStorage.getItem(HOME_VISITED_KEY)) return;
      if (document.referrer && new URL(document.referrer).origin === window.location.origin) return;
      const savedLocation = localStorage.getItem(LAST_LOCATION_KEY);
      if (!savedLocation) return;
      const destination = new URL(savedLocation, window.location.origin);
      if (destination.origin !== window.location.origin || destination.pathname === "/") return;
      window.location.replace(destination.href);
    } catch (error) {
      console.error("Could not restore the last reading location.", error);
    }
    return;
  }

  const article = readerArticle();
  if (!article || article.dataset.lastLocationInitialized) return;
  article.dataset.lastLocationInitialized = "true";
  ensureParagraphIds();

  // In page mode, reader-mode.js turns to the page holding the fragment.
  if (window.location.hash && readerSettings.mode !== "page") {
    let fragment: string;
    try {
      fragment = decodeURIComponent(window.location.hash.slice(1));
    } catch (error) {
      fragment = window.location.hash.slice(1);
    }
    document.getElementById(fragment)?.scrollIntoView({ block: "start" });
  }

  let savePending = false;
  const saveVisibleParagraph = (): void => {
    savePending = false;
    if (!readerSettings.resumeLastLocation) return;
    const paragraph = visibleParagraph();
    if (!paragraph) return;
    try {
      const destination = new URL(window.location.href);
      destination.hash = paragraph.id;
      localStorage.setItem(LAST_LOCATION_KEY, `${destination.pathname}${destination.search}${destination.hash}`);
    } catch (error) {
      console.error("Could not save the last reading location.", error);
    }
  };
  const scheduleSave = (): void => {
    if (savePending) return;
    savePending = true;
    window.requestAnimationFrame(saveVisibleParagraph);
  };

  window.addEventListener("scroll", scheduleSave, { passive: true });
  window.addEventListener(PAGE_EVENT, scheduleSave);
  window.addEventListener("pagehide", saveVisibleParagraph);
  scheduleSave();
}

// ── Share button ───────────────────────────────────────────────────────

// What the Share button shares on this page, from its address:
// /, /authors/, /authors/<author>/, /authors/<author>/<book>/ and chapters
// below that. Only chapters share a paragraph-level reading location.
function shareTarget(): { label: string; chapter: boolean } {
  const parts = window.location.pathname.split("/").filter(Boolean);
  if (parts.length === 0 || (parts.length === 1 && parts[0] === "index.html")) {
    return { label: "Share literature.org", chapter: false };
  }
  if (parts[0] === "authors") {
    if (parts.length === 1) return { label: "Share the authors list", chapter: false };
    if (parts.length === 2) return { label: "Share this author", chapter: false };
    if (parts.length === 3) return { label: "Share this book", chapter: false };
    if (readerArticle()) return { label: "Share this location", chapter: true };
  }
  return { label: "Share this page", chapter: false };
}

// In the drawer, just above Contact, on every page
function initializeShareButton(drawer: HTMLElement): void {
  const menu = drawer.querySelector("#sidebar-links") || drawer;
  if (menu.querySelector(".reader-share-button")) return;
  const target = shareTarget();

  const button = document.createElement("button");
  button.className = "w3-bar-item w3-button reader-share-button";
  button.type = "button";
  button.title = target.label;
  button.setAttribute("aria-label", target.label);
  button.innerHTML = `${iconMarkup("share", "md-lit")}<span class="reader-drawer-label">${target.label}</span>`;
  const statusEl = document.createElement("span");
  statusEl.className = "reader-share-status";
  statusEl.setAttribute("role", "status");
  statusEl.setAttribute("aria-live", "polite");
  const contact = menu.querySelector(".reader-drawer-contact");
  menu.insertBefore(button, contact);
  menu.insertBefore(statusEl, contact);

  button.addEventListener("click", async () => {
    const destination = new URL(window.location.href);
    destination.hash = "";
    if (target.chapter) {
      const paragraph = visibleParagraph();
      if (paragraph) destination.hash = paragraph.id;
    }
    const shareUrl = destination.href;

    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: document.title, url: shareUrl });
      } catch (error: unknown) {
        if ((error as Error).name === "AbortError") return;
        console.error("Could not share this page.", error);
        statusEl.textContent = "Could not share this page.";
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      statusEl.textContent = "Link copied to clipboard.";
      setTimeout(() => { statusEl.textContent = ""; }, 2000);
    } catch (error: unknown) {
      console.error("Could not copy the link to this page.", error);
      statusEl.textContent = "Copy: " + shareUrl;
    }
  });
}

// ── Public API ─────────────────────────────────────────────────────────

// Called from the drawer's home link so the home page does not redirect
window.__literatureHomeClick = function (): void {
  try { sessionStorage.setItem(HOME_VISITED_KEY, "true"); } catch (_) { /* noop */ }
};

window.literatureReader = {
  getSettings: () => ({ ...readerSettings }),
  updateSettings,
  visibleParagraph,
  ensureParagraphIds,
  openSettings,
};

window.initializeReaderSettings = function (drawer: HTMLElement | null): void {
  if (!document.body || !drawer) return;
  if (!dialog) {
    createDialog();
    syncControls();
    initializeLastLocation(true);
  }
  initializeFontSizeGestures();
  initializeShareButton(drawer);
  addSettingsButton(drawer);
};

// ── Initialization ─────────────────────────────────────────────────────

// Apply saved Settings as soon as this deferred script runs, before
// reader-mode.js lays out the page.
loadSettings();
applySettings();

function startReaderSettings(): void {
  window.initializeReaderSettings(document.getElementById("sidebar"));
  // page-loader.ts swapped another page in (PAGE_LOADED_EVENT, hugo-nav.ts):
  // Share and Settings go back into the new drawer links, and a chapter may
  // now need its paragraphs and gestures
  window.addEventListener(PAGE_LOADED_EVENT, () => {
    window.initializeReaderSettings(document.getElementById("sidebar"));
    initializeLastLocation();   // once a chapter is shown; no-op after that
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startReaderSettings);
} else {
  startReaderSettings();
}
