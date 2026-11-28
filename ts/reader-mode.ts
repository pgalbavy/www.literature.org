// reader-mode.ts — page mode for chapter pages, and full screen on every
// page. Compiled output: hugo/assets/js/reader-mode.js
//
// Pages can be loaded in place (page-loader.ts): activatePage() sets up
// whatever page the document now shows. In page mode the chapter article becomes a fixed box below the toolbar and
// CSS columns flow the text into page-width columns (two per screen in book
// mode). Turning a page moves the box sideways by one screen, so pages always
// break between lines. Settings come from reader-settings.js, which must be
// loaded first.
"use strict";

// ── Constants ──────────────────────────────────────────────────────────

const READER_SETTINGS_EVENT = "reader-settings-changed";
const READER_PAGE_EVENT = "reader-page-changed";
const OPEN_AT_END_KEY = "literature.org.openAtEnd";
const FULLSCREEN_KEY = "literature.org.fullscreen";   // per tab, for a reload on a phone
const MARGIN_ZONE = 0.1;        // fraction of the text width that turns the page on a click or tap
const MARGIN_ZONE_MAX = 80;     // px, so the zones stay narrow on wide screens
const PAGE_EDGE_MARGIN = 2;     // rem between the text and the faint page edges
const PAGE_TURN_MS = 180;       // page-turn slide-and-fade duration
const PAGE_TURN_SHIFT = 16;     // px the new page slides in from
const TAP_MAX_TIME = 300;       // ms a tap may last
const TAP_MAX_MOVE = 12;        // px a tap may move
const TOUCH_GUARD_MS = 700;     // ms after a tap turn in which mouse events are ignored
const SWIPE_DISTANCE = 50;      // px
const SWIPE_MAX_TIME = 800;     // ms
const WHEEL_THRESHOLD = 40;     // accumulated wheel delta per page turn
const WHEEL_COOLDOWN = 350;     // ms between wheel page turns

// ── State ──────────────────────────────────────────────────────────────

let pagedActive = false;
let currentPage = 0;            // 0-based
let pageCount = 1;
// The paragraph fragment at the top of the current page, so relayouts
// (font size, width, window size) keep the reader at the same text.
let pageAnchor: { element: Element; fragment: number } | undefined;
let pageFraction = 0;
let realignTimer: number | undefined;

// ── Layout ─────────────────────────────────────────────────────────────

function pagedArticle(): HTMLElement | null {
  return document.querySelector("article.reader-content");
}

function wantsPaged(): boolean {
  const settings = window.literatureReader?.getSettings();
  return settings?.mode === "page" && pagedArticle() !== null;
}

function columnGap(article: HTMLElement): number {
  const gap = parseFloat(getComputedStyle(article).columnGap);
  return Number.isFinite(gap) ? gap : 0;
}

// Distance between the starts of two consecutive screens of text. Uses the
// exact (fractional) content width: clientWidth is rounded to whole pixels,
// and that error accumulates page by page until the first letters of each
// line are cut off deep into a chapter.
function pageStride(article: HTMLElement): number {
  const style = getComputedStyle(article);
  const px = (value: string): number => parseFloat(value) || 0;
  const box = article.getBoundingClientRect().width;
  const width = box > 0
    ? box - px(style.paddingLeft) - px(style.paddingRight) - px(style.borderLeftWidth) - px(style.borderRightWidth)
    : article.clientWidth;
  return Math.max(1, width + columnGap(article));
}

// With two columns per screen, a chapter ending in an odd column leaves the
// last screen half empty. The browser will not scroll past the content, so
// the last page turn would stop a column short and move the right page to
// the left. A blank full-height block fills the empty column so every
// screen is a whole number of columns. It is unbreakable (inline-block), so
// it always starts a new column rather than sharing the last one.
function fillLastSpread(article: HTMLElement): void {
  let spacer = article.querySelector<HTMLElement>(":scope > .reader-page-spacer");
  if (spacer) spacer.style.display = "none";   // measure the text alone
  const columns = parseInt(getComputedStyle(article).columnCount, 10) || 1;
  if (!pagedActive || columns < 2) return;
  const columnStride = pageStride(article) / columns;
  const used = Math.round((article.scrollWidth + columnGap(article)) / columnStride);
  if (used % columns === 0) return;
  if (!spacer) {
    spacer = document.createElement("div");
    spacer.className = "reader-page-spacer";
    spacer.setAttribute("aria-hidden", "true");
    article.appendChild(spacer);
  }
  spacer.style.display = "";
}

function measurePages(article: HTMLElement): void {
  fillLastSpread(article);
  const stride = pageStride(article);
  pageCount = Math.max(1, Math.ceil((article.scrollWidth + columnGap(article)) / stride - 0.05));
  currentPage = Math.min(currentPage, pageCount - 1);
}

function updateToolbarHeight(): void {
  const toolbar = document.querySelector(".reader-toolbar");
  const height = toolbar ? Math.ceil(toolbar.getBoundingClientRect().height) : 40;
  document.documentElement.style.setProperty("--reader-toolbar-height", `${height}px`);
}

// Faint page edges either side of a single-column page (page or scroll
// mode), PAGE_EDGE_MARGIN outside the text, only when the window has room.
function updatePageFrame(): void {
  const article = pagedArticle();
  let frame = document.querySelector<HTMLElement>(".reader-page-frame");
  const style = article ? getComputedStyle(article) : null;
  const singleColumn = style !== null && (parseInt(style.columnCount, 10) || 1) === 1;
  if (!article || !style || !singleColumn) {
    if (frame) frame.hidden = true;
    return;
  }
  // Mid page-turn the page box is shifted on screen; measure once it settles
  const sliding = article.getAnimations?.().find((animation) => animation.playState === "running");
  if (sliding) {
    sliding.finished.then(updatePageFrame, () => {});
    return;
  }
  if (!pagedActive) updateToolbarHeight();   // page mode keeps it current
  const px = (value: string): number => parseFloat(value) || 0;
  const rem = px(getComputedStyle(document.documentElement).fontSize) || 16;
  const inset = PAGE_EDGE_MARGIN * rem;
  const box = article.getBoundingClientRect();
  // The text box: scroll mode pads the article, page mode does not
  const textLeft = box.left + px(style.paddingLeft);
  const textRight = box.right - px(style.paddingRight);
  // Content starts after the drawer rail, which pads the body
  const areaLeft = px(getComputedStyle(document.body).paddingLeft);
  const left = textLeft - inset;
  const right = textRight + inset;
  const room = left >= areaLeft + 4 && right <= window.innerWidth - 4;
  if (!frame) {
    if (!room) return;
    frame = document.createElement("div");
    frame.className = "reader-page-frame";
    frame.setAttribute("aria-hidden", "true");
    document.body.appendChild(frame);
  }
  frame.hidden = !room;
  if (!room) return;
  frame.style.left = `${left}px`;
  frame.style.width = `${right - left}px`;
}

function updateProgressBar(): void {
  updateNavButtons();
  updatePageFrame();
  const bar = document.querySelector<HTMLElement>(".reader-progress-bar");
  if (!bar) return;
  bar.hidden = !pagedActive;
  const article = pagedArticle();
  if (!pagedActive || !article) return;
  const columns = parseInt(getComputedStyle(article).columnCount, 10) || 1;
  if (columns < 2) {
    delete bar.dataset.spread;
    bar.style.paddingLeft = bar.style.paddingRight = "";
    bar.removeAttribute("aria-label");
    const percent = Math.round(((currentPage + 1) / pageCount) * 100);
    bar.textContent = `Page ${currentPage + 1} of ${pageCount} · ${percent}%`;
    return;
  }
  showSpreadProgress(bar, article, columns);
}

// Two pages side by side: each page's number under its outer edge and the
// percentage between them. A screen is one page turn but two pages, so
// pages are counted one by one; the blank page after a chapter that ends on
// the left (fillLastSpread) has no number.
function showSpreadProgress(bar: HTMLElement, article: HTMLElement, columns: number): void {
  const spacer = article.querySelector<HTMLElement>(":scope > .reader-page-spacer");
  const blank = spacer && spacer.style.display !== "none" ? 1 : 0;
  const total = Math.max(1, pageCount * columns - blank);
  const first = currentPage * columns + 1;
  const last = Math.min(first + columns - 1, total);
  const percent = Math.round((last / total) * 100);
  const cell = (text: string): HTMLSpanElement => {
    const span = document.createElement("span");
    span.textContent = text;
    return span;
  };
  bar.dataset.spread = "true";
  bar.replaceChildren(cell(String(first)), cell(`${percent}%`), cell(last > first ? String(last) : ""));
  bar.setAttribute("aria-label", last > first
    ? `Pages ${first} and ${last} of ${total}, ${percent}%`
    : `Page ${first} of ${total}, ${percent}%`);

  // Line the numbers up with the text above, clear of the faint full screen
  // Settings button in the bottom left corner
  const barBox = bar.getBoundingClientRect();
  const textBox = article.getBoundingClientRect();
  let left = Math.max(0, textBox.left - barBox.left);
  const right = Math.max(0, barBox.right - textBox.right);
  const settings = document.querySelector<HTMLElement>(".reader-fullscreen-settings");
  if (settings && getComputedStyle(settings).display !== "none") {
    left = Math.max(left, settings.getBoundingClientRect().right - barBox.left + 8);
  }
  bar.style.paddingLeft = `${left}px`;
  bar.style.paddingRight = `${right}px`;
}

// ── Toolbar arrows ─────────────────────────────────────────────────────
// The template renders them as chapter links (or disabled spans when there
// is no previous / next chapter). In page mode they turn pages instead and
// only move chapter at the first / last page.

function navButtons(): { back: HTMLElement | null; forward: HTMLElement | null } {
  const buttons = document.querySelectorAll<HTMLElement>(".reader-toolbar-actions .reader-chapter-nav");
  return { back: buttons[0] ?? null, forward: buttons[1] ?? null };
}

function setNavButton(button: HTMLElement | null, label: string, enabled: boolean): void {
  if (!button) return;
  if (button.dataset.chapterLabel === undefined) button.dataset.chapterLabel = button.title;
  button.title = label;
  button.setAttribute("aria-label", label);
  if (button.tagName === "A") return;
  // A disabled span from the template: make it a working button in page mode
  button.classList.toggle("w3-disabled", !enabled);
  button.setAttribute("aria-disabled", String(!enabled));
  if (enabled) {
    button.setAttribute("role", "button");
    button.tabIndex = 0;
  } else {
    button.removeAttribute("role");
    button.removeAttribute("tabindex");
  }
}

function updateNavButtons(): void {
  const { back, forward } = navButtons();
  // Grey margin cursors (literature.css) where a turn has nowhere to go
  const root = document.documentElement.dataset;
  root.readerNoPrev = String(pagedActive && currentPage === 0 && chapterLink("prev") === null);
  root.readerNoNext = String(pagedActive && currentPage >= pageCount - 1 && chapterLink("next") === null);
  if (!pagedActive) {
    // Restore the chapter-only behaviour from the template
    for (const button of [back, forward]) {
      if (!button || button.dataset.chapterLabel === undefined) continue;
      setNavButton(button, button.dataset.chapterLabel, button.tagName === "A");
    }
    return;
  }
  const atStart = currentPage === 0;
  const atEnd = currentPage >= pageCount - 1;
  setNavButton(back, atStart ? (chapterLink("prev") ? "Previous chapter" : "No previous chapter") : "Previous page",
    !atStart || chapterLink("prev") !== null);
  setNavButton(forward, atEnd ? (chapterLink("next") ? "Next chapter" : "No next chapter") : "Next page",
    !atEnd || chapterLink("next") !== null);
}

// Called again for the new arrows after a page loads in place
function initializeNavButtons(): void {
  const { back, forward } = navButtons();
  const wire = (button: HTMLElement | null, turn: () => void): void => {
    if (!button || button.dataset.navWired) return;
    button.dataset.navWired = "true";
    button.addEventListener("click", (event) => {
      if (!pagedActive) return;   // scroll mode: the plain chapter link
      event.preventDefault();
      if (button.getAttribute("aria-disabled") !== "true") turn();
    });
    button.addEventListener("keydown", (event) => {
      if (!pagedActive || button.tagName === "A" || (event.key !== "Enter" && event.key !== " ")) return;
      event.preventDefault();
      if (button.getAttribute("aria-disabled") !== "true") turn();
    });
  };
  wire(back, prevPage);
  wire(forward, nextPage);
}

function findAnchor(article: HTMLElement): { element: Element; fragment: number } | undefined {
  const box = article.getBoundingClientRect();
  const paragraphs = window.literatureReader?.ensureParagraphIds() ?? [];
  for (const paragraph of paragraphs) {
    const fragment = [...paragraph.getClientRects()]
      .findIndex((rect) => rect.width > 0 && rect.right > box.left && rect.left < box.right);
    if (fragment >= 0) return { element: paragraph, fragment };
  }
  return undefined;
}

// A short slide-and-fade in the direction of travel, so a page turn is
// visible without being showy. Skipped when the reader prefers less motion.
function animatePageTurn(article: HTMLElement, direction: number): void {
  if (typeof article.animate !== "function") return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  article.animate([
    { opacity: 0.4, transform: `translateX(${direction * PAGE_TURN_SHIFT}px)` },
    { opacity: 1, transform: "none" },
  ], { duration: PAGE_TURN_MS, easing: "ease-out" });
}

function showPage(page: number, rememberAnchor = true, animate = false): void {
  const article = pagedArticle();
  if (!article || !pagedActive) return;
  const previous = currentPage;
  currentPage = Math.max(0, Math.min(page, pageCount - 1));
  // Rounded per page from the exact stride, so the error never accumulates
  article.scrollLeft = Math.round(currentPage * pageStride(article));
  if (rememberAnchor) {
    pageAnchor = findAnchor(article);
    pageFraction = pageCount > 1 ? currentPage / (pageCount - 1) : 0;
  }
  updateProgressBar();
  window.dispatchEvent(new CustomEvent(READER_PAGE_EVENT, {
    detail: { page: currentPage + 1, pages: pageCount },
  }));
  // Last: the slide moves the page box on screen, so everything above must
  // measure it first (the page edges would otherwise copy the offset)
  if (animate && currentPage !== previous) animatePageTurn(article, Math.sign(currentPage - previous));
}

function pageOfElement(element: Element, fragment = 0): number {
  const article = pagedArticle();
  if (!article) return 0;
  const rects = element.getClientRects();
  const rect = rects[Math.min(fragment, rects.length - 1)] ?? element.getBoundingClientRect();
  const offset = rect.left - article.getBoundingClientRect().left + article.scrollLeft;
  return Math.max(0, Math.floor((offset + 1) / pageStride(article)));
}

function fragmentTarget(): Element | null {
  if (!window.location.hash) return null;
  let fragment = window.location.hash.slice(1);
  try { fragment = decodeURIComponent(fragment); } catch (_) { /* use as is */ }
  return document.getElementById(fragment);
}

// Re-measure after anything that changes the layout, keeping the reader on
// the page that holds the text they were reading.
function relayout(): void {
  const article = pagedArticle();
  if (!article) {
    updateToolbarHeight();
    return;
  }
  if (!pagedActive) {
    // Scroll mode: only the page edges follow layout changes
    updatePageFrame();
    return;
  }
  updateToolbarHeight();
  measurePages(article);
  if (pageAnchor && article.contains(pageAnchor.element)) {
    showPage(pageOfElement(pageAnchor.element, pageAnchor.fragment), false);
  } else {
    showPage(Math.round(pageFraction * (pageCount - 1)), false);
  }
}

// fresh: a chapter just loaded, so honour the URL fragment and a "continue
// from the end" request from the following chapter (openAtEnd when loaded in
// place, sessionStorage after a normal load). Otherwise keep the paragraph
// the reader was looking at in scroll mode.
function enterPaged(fresh: boolean, openAtEnd = false): void {
  const article = pagedArticle();
  if (!article) return;
  const anchor = fresh ? undefined : window.literatureReader?.visibleParagraph();
  pagedActive = true;
  window.scrollTo(0, 0);
  updateToolbarHeight();
  document.documentElement.dataset.readerPaged = "true";
  measurePages(article);

  let startPage = 0;
  if (fresh) {
    try {
      openAtEnd ||= sessionStorage.getItem(OPEN_AT_END_KEY) === window.location.pathname;
      sessionStorage.removeItem(OPEN_AT_END_KEY);
    } catch (_) { /* noop */ }
    const target = fragmentTarget();
    if (target) startPage = pageOfElement(target);
    else if (openAtEnd) startPage = pageCount - 1;
  } else if (anchor) {
    startPage = pageOfElement(anchor);
  }
  showPage(startPage);
}

function leavePaged(): void {
  const article = pagedArticle();
  const anchor = pageAnchor?.element;
  pagedActive = false;
  document.documentElement.dataset.readerPaged = "false";
  if (article) {
    fillLastSpread(article);   // removes the spacer outside page mode
    article.scrollLeft = 0;
  }
  updateProgressBar();
  anchor?.scrollIntoView({ block: "start" });
}

// After a Settings change: switch mode, keeping the reader's place
function applyMode(): void {
  if (wantsPaged()) {
    if (pagedActive) relayout();
    else enterPaged(false);
  } else if (pagedActive) {
    leavePaged();
  } else {
    document.documentElement.dataset.readerPaged = "false";
    updateProgressBar();
  }
}

// ── Page turning ───────────────────────────────────────────────────────

function chapterLink(rel: "next" | "prev"): HTMLAnchorElement | null {
  return document.querySelector<HTMLAnchorElement>(`.reader-toolbar a[rel="${rel}"]`);
}

function nextPage(): void {
  if (!pagedActive) return;
  if (currentPage < pageCount - 1) {
    showPage(currentPage + 1, true, true);
    return;
  }
  const next = chapterLink("next");
  if (next) goToChapter(next.href);
}

function prevPage(): void {
  if (!pagedActive) return;
  if (currentPage > 0) {
    showPage(currentPage - 1, true, true);
    return;
  }
  const previous = chapterLink("prev");
  if (previous) goToChapter(previous.href, true);
}

// Through page-loader.ts, which keeps full screen; a normal load without it
function goToChapter(href: string, openAtEnd = false): void {
  if (window.literatureNavigate) {
    window.literatureNavigate(href, { openAtEnd });
    return;
  }
  if (openAtEnd) {
    try { sessionStorage.setItem(OPEN_AT_END_KEY, new URL(href, window.location.href).pathname); } catch (_) { /* noop */ }
  }
  window.location.assign(href);
}

function isInteractive(target: EventTarget | null): boolean {
  return target instanceof Element &&
    target.closest("a, button, input, select, textarea, summary, [contenteditable]") !== null;
}

// Which page-turn zone, if any, a point is in: left of the text (or its first
// strip) turns back, right of it turns forward. The toolbar, drawer,
// progress bar, dialogs and links are never zones.
function turnZoneAt(x: number, y: number, target: EventTarget | null): "prev" | "next" | null {
  const article = pagedArticle();
  if (!pagedActive || !article || isInteractive(target)) return null;
  if (target instanceof Element &&
      target.closest(".reader-toolbar, #sidebar, .reader-progress-bar, dialog")) return null;
  const box = article.getBoundingClientRect();
  if (y < box.top || y > box.bottom) return null;
  const strip = Math.min(box.width * MARGIN_ZONE, MARGIN_ZONE_MAX);
  if (x < box.left + strip) return "prev";
  if (x > box.right - strip) return "next";
  return null;
}

function turnPage(zone: "prev" | "next"): void {
  window.getSelection()?.removeAllRanges();
  if (zone === "prev") prevPage(); else nextPage();
}

// ── Input handlers ─────────────────────────────────────────────────────

function handleKeyDown(event: KeyboardEvent): void {
  if (!pagedActive || event.defaultPrevented) return;
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  // Only text entry and an open dialog keep the keys; focus left on a drawer
  // or toolbar button (e.g. after closing Settings) must not block paging.
  const target = event.target;
  if (target instanceof Element && target.closest("input, select, textarea, [contenteditable]")) return;
  if (document.querySelector("dialog[open]")) return;

  let handled = true;
  switch (event.key) {
    case "ArrowRight":
    case "PageDown":
      nextPage(); break;
    case "ArrowLeft":
    case "PageUp":
      prevPage(); break;
    case " ":
      if (isInteractive(target)) { handled = false; break; }
      if (event.shiftKey) prevPage(); else nextPage();
      break;
    case "Home":
      showPage(0); break;
    case "End":
      showPage(pageCount - 1); break;
    default:
      handled = false;
  }
  if (handled) event.preventDefault();
}

function initializeInput(article: HTMLElement): void {
  document.addEventListener("keydown", handleKeyDown);

  // Mouse wheel and trackpad: one page per gesture step
  let wheelTotal = 0;
  let lastWheelTurn = 0;
  // On the whole page (text and blank margins), not the toolbar or drawer
  document.addEventListener("wheel", (event: WheelEvent) => {
    if (!pagedActive || event.ctrlKey || event.metaKey) return;
    if (event.target instanceof Element &&
        event.target.closest(".reader-toolbar, #sidebar, dialog")) return;
    event.preventDefault();
    const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
    const now = Date.now();
    if (now - lastWheelTurn < WHEEL_COOLDOWN) return;
    wheelTotal += delta;
    if (Math.abs(wheelTotal) < WHEEL_THRESHOLD) return;
    if (wheelTotal > 0) nextPage(); else prevPage();
    wheelTotal = 0;
    lastWheelTurn = now;
  }, { passive: false });

  // Horizontal swipe
  let swipe: { x: number; y: number; time: number } | undefined;
  article.addEventListener("touchstart", (event: TouchEvent) => {
    if (!pagedActive || event.touches.length !== 1 || isInteractive(event.target)) {
      swipe = undefined;
      return;
    }
    const touch = event.touches[0];
    swipe = { x: touch.clientX, y: touch.clientY, time: Date.now() };
  }, { passive: true });

  article.addEventListener("touchend", (event: TouchEvent) => {
    if (!swipe || event.touches.length !== 0) {
      swipe = undefined;
      return;
    }
    const touch = event.changedTouches[0];
    const dx = touch.clientX - swipe.x;
    const dy = touch.clientY - swipe.y;
    const elapsed = Date.now() - swipe.time;
    swipe = undefined;
    if (elapsed > SWIPE_MAX_TIME || Math.abs(dx) < SWIPE_DISTANCE || Math.abs(dx) < Math.abs(dy) * 1.2) return;
    if (dx < 0) nextPage(); else prevPage();
  }, { passive: true });

  article.addEventListener("touchcancel", () => { swipe = undefined; }, { passive: true });

  // A short click in the margins: the blank space either side of the text
  // plus a narrow strip at each edge of the text. The cursor shows the zone.
  // Only a quick press that does not move counts, so a long press or a drag
  // still selects text there, and a click that ends with text selected
  // (a double-click on a word, say) is left alone.
  let lastTouchTurn = 0;
  let clickStart: { x: number; y: number; time: number } | undefined;
  document.addEventListener("mousedown", (event: MouseEvent) => {
    clickStart = event.button === 0
      ? { x: event.clientX, y: event.clientY, time: Date.now() }
      : undefined;
  }, { passive: true });
  document.addEventListener("click", (event: MouseEvent) => {
    const start = clickStart;
    clickStart = undefined;
    // A tap already turned the page; ignore any copy the browser makes of it
    if (!start || Date.now() - lastTouchTurn < TOUCH_GUARD_MS) return;
    if (event.button !== 0 || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;
    if (Date.now() - start.time > TAP_MAX_TIME ||
        Math.hypot(event.clientX - start.x, event.clientY - start.y) > TAP_MAX_MOVE) return;
    if (!(window.getSelection()?.isCollapsed ?? true)) return;
    const zone = turnZoneAt(event.clientX, event.clientY, event.target);
    if (!zone) return;
    event.preventDefault();
    turnPage(zone);
  });

  // Single tap in the same zones on touch screens. Touch selects text with a
  // long press, so a quick tap that does not move is safe to use; drags,
  // long presses and swipes are not taps.
  let tapStart: { x: number; y: number; time: number } | undefined;
  document.addEventListener("touchstart", (event: TouchEvent) => {
    tapStart = undefined;
    if (!pagedActive || event.touches.length !== 1) return;
    const touch = event.touches[0];
    tapStart = { x: touch.clientX, y: touch.clientY, time: Date.now() };
  }, { passive: true });
  document.addEventListener("touchend", (event: TouchEvent) => {
    const start = tapStart;
    tapStart = undefined;
    if (!start || event.touches.length !== 0) return;
    const touch = event.changedTouches[0];
    const now = Date.now();
    if (now - start.time > TAP_MAX_TIME ||
        Math.hypot(touch.clientX - start.x, touch.clientY - start.y) > TAP_MAX_MOVE) return;
    const zone = turnZoneAt(touch.clientX, touch.clientY, event.target);
    if (!zone) return;
    event.preventDefault();   // no synthetic mouse click after the tap
    lastTouchTurn = now;
    turnPage(zone);
  }, { passive: false });

  document.addEventListener("mousemove", (event: MouseEvent) => {
    const zone = turnZoneAt(event.clientX, event.clientY, event.target) ?? "none";
    if (document.documentElement.dataset.readerTurnZone !== zone) {
      document.documentElement.dataset.readerTurnZone = zone;
    }
  }, { passive: true });

  // Keep pages aligned when the browser scrolls the box itself, for example
  // find-in-page or tabbing to a link on another page.
  article.addEventListener("scroll", () => {
    if (!pagedActive) return;
    window.clearTimeout(realignTimer);
    realignTimer = window.setTimeout(() => {
      const stride = pageStride(article);
      const page = Math.round(article.scrollLeft / stride);
      if (page !== currentPage || Math.abs(article.scrollLeft - page * stride) > 1) showPage(page);
    }, 120);
  }, { passive: true });

  // In-chapter links such as footnotes
  window.addEventListener("hashchange", () => {
    const target = fragmentTarget();
    if (pagedActive && target) showPage(pageOfElement(target));
  });
}

// ── Full screen ────────────────────────────────────────────────────────
// Full screen hides the drawer and toolbar on every page, leaving faint
// menu, full screen, back and forward buttons and a faint Settings button
// (and the progress bar in page mode). It works in page, book and scroll
// mode. Where the browser has a Fullscreen API it is used as well; elsewhere
// (iPhone) the page is still made immersive. data-reader-fullscreen on <html>
// drives the CSS.
//
// Links within the site load in place (page-loader.ts), so full screen lasts
// while the reader moves around. A real page load (reload) always ends
// browser full screen, so the layout follows it out, except where there is
// no Fullscreen API and the layout is all there is. The browser's own full
// screen (F11 when the page does not catch it, or the browser's menu) gives
// no event: it is noticed from the window filling the screen, and the layout
// follows it in and out.

let immersive = false;
let leavingPage = false;
let browserFullscreen = false;   // the browser's own full screen, not the page's

function fullscreenElement(): Element | null {
  return document.fullscreenElement ?? (document as any).webkitFullscreenElement ?? null;
}

function fullscreenSupported(): boolean {
  const root = document.documentElement as any;
  return typeof root.requestFullscreen === "function" || typeof root.webkitRequestFullscreen === "function";
}

function requestBrowserFullscreen(): void {
  if (fullscreenElement() || !fullscreenSupported()) return;
  const root = document.documentElement as any;
  try {
    const result = root.requestFullscreen
      ? root.requestFullscreen({ navigationUI: "hide" })
      : root.webkitRequestFullscreen();
    result?.catch?.(() => { /* refused: stay immersive without it */ });
  } catch (_) { /* noop */ }
}

function exitBrowserFullscreen(): void {
  if (!fullscreenElement()) return;
  const doc = document as any;
  try {
    const result = document.exitFullscreen ? document.exitFullscreen() : doc.webkitExitFullscreen?.();
    result?.catch?.(() => { /* noop */ });
  } catch (_) { /* noop */ }
}

// The browser's own full screen: the display-mode media query where the
// browser reports it, otherwise a desktop window exactly filling the screen
// (phones are left out: their browsers can fill the screen when the address
// bar hides).
function inBrowserFullscreen(): boolean {
  if (fullscreenElement()) return false;   // the page's own request
  if (window.matchMedia?.("(display-mode: fullscreen)").matches) return true;
  if (!window.matchMedia?.("(hover: hover) and (pointer: fine)").matches) return false;
  return Math.abs(window.innerWidth - screen.width) <= 1 && Math.abs(window.innerHeight - screen.height) <= 1;
}

// Called again for the new toolbar after a page loads in place
function updateFullscreenButton(): void {
  const button = document.querySelector<HTMLElement>(".reader-fullscreen-toggle");
  if (!button) return;
  const label = immersive ? "Exit full screen" : "Full screen";
  // The browser's own full screen can only be left with its own key
  const key = immersive && !browserFullscreen ? "Esc" : "F11";
  button.title = `${label} (${key})`;
  button.setAttribute("aria-label", label);
  button.setAttribute("aria-pressed", String(immersive));
  const sprite = document.documentElement.dataset.iconSprite ?? "";
  button.querySelector(".icon use")
    ?.setAttribute("href", `${sprite}#icon-${immersive ? "fullscreen_exit" : "fullscreen"}`);
}

function setImmersive(on: boolean): void {
  if (on === immersive) return;
  immersive = on;
  document.documentElement.dataset.readerFullscreen = String(on);
  try {
    if (on) sessionStorage.setItem(FULLSCREEN_KEY, "true");
    else sessionStorage.removeItem(FULLSCREEN_KEY);
  } catch (_) { /* noop */ }
  if (on && document.getElementById("sidebar")?.dataset.open === "true") window.w3_close?.();
  updateFullscreenButton();
  // The text box grows into the space the drawer rail and toolbar used
  window.requestAnimationFrame(relayout);
}

function enterFullscreen(): void {
  setImmersive(true);
  requestBrowserFullscreen();
}

function exitFullscreen(): void {
  setImmersive(false);
  exitBrowserFullscreen();
}

function toggleFullscreen(): void {
  if (immersive) exitFullscreen(); else enterFullscreen();
}

function handleFullscreenChange(): void {
  if (fullscreenElement()) setImmersive(true);
  else if (!leavingPage && !browserFullscreen) setImmersive(false);   // Esc or the browser's own exit
}

// Follow the browser's own full screen in and out
function checkBrowserFullscreen(): void {
  const now = inBrowserFullscreen();
  if (now === browserFullscreen) return;
  browserFullscreen = now;
  if (now) setImmersive(true);
  else if (!fullscreenElement()) setImmersive(false);
  updateFullscreenButton();
}

function initializeFullscreen(): void {
  // On the document: the toolbar is replaced when a page loads in place
  document.addEventListener("click", (event) => {
    if (!(event.target instanceof Element) || !event.target.closest(".reader-fullscreen-toggle")) return;
    event.preventDefault();
    toggleFullscreen();
  });

  // Faint Settings button, bottom left, shown only in full screen
  const settings = document.createElement("button");
  settings.type = "button";
  settings.className = "reader-fullscreen-settings";
  settings.title = "Reading Settings";
  settings.setAttribute("aria-label", "Reading Settings");
  settings.innerHTML = iconMarkup("settings", "md-lit");
  settings.addEventListener("click", () => window.literatureReader?.openSettings());
  document.body.appendChild(settings);

  document.addEventListener("fullscreenchange", handleFullscreenChange);
  document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
  window.addEventListener("pagehide", () => { leavingPage = true; });
  window.addEventListener("pageshow", () => { leavingPage = false; });

  window.matchMedia?.("(display-mode: fullscreen)").addEventListener?.("change", checkBrowserFullscreen);
  window.addEventListener("resize", checkBrowserFullscreen);

  document.addEventListener("keydown", (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === "F11" && !event.shiftKey && fullscreenSupported()) {
      // In the browser's own full screen, F11 is the browser's way out
      if (browserFullscreen || (!fullscreenElement() && inBrowserFullscreen())) return;
      event.preventDefault();
      toggleFullscreen();
    } else if (event.key === "Escape" && immersive && !document.querySelector("dialog[open]")) {
      // In browser full screen the browser takes Esc itself; this covers the rest
      event.preventDefault();
      exitFullscreen();
    }
  });

  let remembered = false;
  try { remembered = sessionStorage.getItem(FULLSCREEN_KEY) === "true"; } catch (_) { /* noop */ }
  if (remembered && !fullscreenSupported()) setImmersive(true);
  else if (remembered) {
    try { sessionStorage.removeItem(FULLSCREEN_KEY); } catch (_) { /* noop */ }
  }
  checkBrowserFullscreen();
  updateFullscreenButton();
}

// ── Pages ──────────────────────────────────────────────────────────────

function watchImages(article: HTMLElement): void {
  article.querySelectorAll("img").forEach((image) => {
    if (!image.complete) image.addEventListener("load", relayout, { once: true });
  });
}

// Sets up whatever page the document shows: on the first load, and after
// page-loader.ts has swapped in another page. Chapters get page or scroll
// mode; other pages leave page mode.
function activatePage(initial: boolean, openAtEnd = false): void {
  updateToolbarHeight();
  updateFullscreenButton();
  const article = pagedArticle();
  if (!article) {
    pagedActive = false;
    const root = document.documentElement.dataset;
    root.readerPaged = "false";
    root.readerTurnZone = "none";
    const page = document.querySelector<HTMLElement>("body > article");
    if (page) page.scrollLeft = 0;   // it was the paged text box
    updateProgressBar();
    return;
  }
  window.literatureReader?.ensureParagraphIds();
  initializeNavButtons();
  watchImages(article);
  pageAnchor = undefined;
  pageFraction = 0;
  currentPage = 0;
  if (wantsPaged()) {
    pagedActive = false;   // a new chapter: lay it out from the start
    enterPaged(true, openAtEnd);
    // The same slide as a page turn, in the direction of travel
    if (!initial) animatePageTurn(article, openAtEnd ? -1 : 1);
  } else {
    pagedActive = false;
    document.documentElement.dataset.readerPaged = "false";
    updateProgressBar();
  }
}

// ── Public API ─────────────────────────────────────────────────────────

let readerModeInitialized = false;

function initializeReaderMode(): void {
  if (readerModeInitialized) return;
  readerModeInitialized = true;

  // Every page has one <article>; it is kept when pages load in place, so
  // its listeners are set up once and check what the page holds
  const article = document.querySelector<HTMLElement>("body > article");
  if (article) initializeInput(article);
  initializeFullscreen();

  window.addEventListener(READER_SETTINGS_EVENT, (event: Event) => {
    const { changed } = (event as CustomEvent<ReaderSettingsChange>).detail;
    if (changed.some((key) => key !== "theme" && key !== "resumeLastLocation")) applyMode();
  });
  window.addEventListener(PAGE_LOADED_EVENT, (event: Event) => {
    const detail = (event as CustomEvent<{ openAtEnd?: boolean }>).detail;
    activatePage(false, detail?.openAtEnd ?? false);
  });

  // The page box changes size with the window, the drawer and the toolbar
  if (article && typeof ResizeObserver === "function") {
    let pending = false;
    new ResizeObserver(() => {
      if (pending) return;
      pending = true;
      window.requestAnimationFrame(() => { pending = false; relayout(); });
    }).observe(article);
  } else {
    window.addEventListener("resize", relayout);
  }
  // The page can move without changing size (window resize when wider than
  // the page, drawer opening), so keep the page edges in place too
  window.addEventListener("resize", updatePageFrame);
  document.body.addEventListener("transitionend", updatePageFrame);
  new MutationObserver(() => window.requestAnimationFrame(updatePageFrame))
    .observe(document.documentElement, { attributes: true, attributeFilter: ["data-reader-navigation-open"] });
  document.fonts?.ready.then(relayout);

  activatePage(true);
}

window.w3_nextPage = nextPage;
window.w3_prevPage = prevPage;
window.initializeReaderMode = initializeReaderMode;

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeReaderMode);
} else {
  initializeReaderMode();
}
