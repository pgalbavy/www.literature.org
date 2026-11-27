// reader-mode.ts — page mode for chapter pages. Compiled output:
// hugo/static/js/reader-mode.js
//
// In page mode the chapter article becomes a fixed box below the toolbar and
// CSS columns flow the text into page-width columns (two per screen in book
// mode). Turning a page moves the box sideways by one screen, so pages always
// break between lines. Settings come from reader-settings.js, which must be
// loaded first.
"use strict";
// ── Constants ──────────────────────────────────────────────────────────
const READER_SETTINGS_EVENT = "reader-settings-changed";
const READER_PAGE_EVENT = "reader-page-changed";
const OPEN_AT_END_KEY = "literature.org.openAtEnd";
const MARGIN_ZONE = 0.1; // fraction of the text width that turns the page on double-click
const MARGIN_ZONE_MAX = 80; // px, so the zones stay narrow on wide screens
const PAGE_EDGE_MARGIN = 2; // rem between the text and the faint page edges
const PAGE_TURN_MS = 180; // page-turn slide-and-fade duration
const PAGE_TURN_SHIFT = 16; // px the new page slides in from
const TAP_MAX_TIME = 300; // ms a tap may last
const TAP_MAX_MOVE = 12; // px a tap may move
const DOUBLE_TAP_TIME = 350; // ms between the two taps of a double-tap
const DOUBLE_TAP_DISTANCE = 40; // px between the two taps of a double-tap
const SWIPE_DISTANCE = 50; // px
const SWIPE_MAX_TIME = 800; // ms
const WHEEL_THRESHOLD = 40; // accumulated wheel delta per page turn
const WHEEL_COOLDOWN = 350; // ms between wheel page turns
// ── State ──────────────────────────────────────────────────────────────
let pagedActive = false;
let currentPage = 0; // 0-based
let pageCount = 1;
// The paragraph fragment at the top of the current page, so relayouts
// (font size, width, window size) keep the reader at the same text.
let pageAnchor;
let pageFraction = 0;
let realignTimer;
// ── Layout ─────────────────────────────────────────────────────────────
function pagedArticle() {
    return document.querySelector("article.reader-content");
}
function wantsPaged() {
    const settings = window.literatureReader?.getSettings();
    return settings?.mode === "page" && pagedArticle() !== null;
}
function columnGap(article) {
    const gap = parseFloat(getComputedStyle(article).columnGap);
    return Number.isFinite(gap) ? gap : 0;
}
// Distance between the starts of two consecutive screens of text. Uses the
// exact (fractional) content width: clientWidth is rounded to whole pixels,
// and that error accumulates page by page until the first letters of each
// line are cut off deep into a chapter.
function pageStride(article) {
    const style = getComputedStyle(article);
    const px = (value) => parseFloat(value) || 0;
    const box = article.getBoundingClientRect().width;
    const width = box > 0
        ? box - px(style.paddingLeft) - px(style.paddingRight) - px(style.borderLeftWidth) - px(style.borderRightWidth)
        : article.clientWidth;
    return Math.max(1, width + columnGap(article));
}
function measurePages(article) {
    const stride = pageStride(article);
    pageCount = Math.max(1, Math.ceil((article.scrollWidth + columnGap(article)) / stride - 0.05));
    currentPage = Math.min(currentPage, pageCount - 1);
}
function updateToolbarHeight() {
    const toolbar = document.querySelector(".reader-toolbar");
    const height = toolbar ? Math.ceil(toolbar.getBoundingClientRect().height) : 40;
    document.documentElement.style.setProperty("--reader-toolbar-height", `${height}px`);
}
// Faint page edges either side of a single-column page (page or scroll
// mode), PAGE_EDGE_MARGIN outside the text, only when the window has room.
function updatePageFrame() {
    const article = pagedArticle();
    let frame = document.querySelector(".reader-page-frame");
    const style = article ? getComputedStyle(article) : null;
    const singleColumn = style !== null && (parseInt(style.columnCount, 10) || 1) === 1;
    if (!article || !style || !singleColumn) {
        if (frame)
            frame.hidden = true;
        return;
    }
    // Mid page-turn the page box is shifted on screen; measure once it settles
    const sliding = article.getAnimations?.().find((animation) => animation.playState === "running");
    if (sliding) {
        sliding.finished.then(updatePageFrame, () => { });
        return;
    }
    if (!pagedActive)
        updateToolbarHeight(); // page mode keeps it current
    const px = (value) => parseFloat(value) || 0;
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
        if (!room)
            return;
        frame = document.createElement("div");
        frame.className = "reader-page-frame";
        frame.setAttribute("aria-hidden", "true");
        document.body.appendChild(frame);
    }
    frame.hidden = !room;
    if (!room)
        return;
    frame.style.left = `${left}px`;
    frame.style.width = `${right - left}px`;
}
function updateProgressBar() {
    updateNavButtons();
    updatePageFrame();
    const bar = document.querySelector(".reader-progress-bar");
    if (!bar)
        return;
    bar.hidden = !pagedActive;
    if (!pagedActive)
        return;
    const percent = Math.round(((currentPage + 1) / pageCount) * 100);
    bar.textContent = `Page ${currentPage + 1} of ${pageCount} · ${percent}%`;
}
// ── Toolbar arrows ─────────────────────────────────────────────────────
// The template renders them as chapter links (or disabled spans when there
// is no previous / next chapter). In page mode they turn pages instead and
// only move chapter at the first / last page.
function navButtons() {
    const buttons = document.querySelectorAll(".reader-toolbar-actions .reader-chapter-nav");
    return { back: buttons[0] ?? null, forward: buttons[1] ?? null };
}
function setNavButton(button, label, enabled) {
    if (!button)
        return;
    if (button.dataset.chapterLabel === undefined)
        button.dataset.chapterLabel = button.title;
    button.title = label;
    button.setAttribute("aria-label", label);
    if (button.tagName === "A")
        return;
    // A disabled span from the template: make it a working button in page mode
    button.classList.toggle("w3-disabled", !enabled);
    button.setAttribute("aria-disabled", String(!enabled));
    if (enabled) {
        button.setAttribute("role", "button");
        button.tabIndex = 0;
    }
    else {
        button.removeAttribute("role");
        button.removeAttribute("tabindex");
    }
}
function updateNavButtons() {
    const { back, forward } = navButtons();
    if (!pagedActive) {
        // Restore the chapter-only behaviour from the template
        for (const button of [back, forward]) {
            if (!button || button.dataset.chapterLabel === undefined)
                continue;
            setNavButton(button, button.dataset.chapterLabel, button.tagName === "A");
        }
        return;
    }
    const atStart = currentPage === 0;
    const atEnd = currentPage >= pageCount - 1;
    setNavButton(back, atStart ? (chapterLink("prev") ? "Previous chapter" : "No previous chapter") : "Previous page", !atStart || chapterLink("prev") !== null);
    setNavButton(forward, atEnd ? (chapterLink("next") ? "Next chapter" : "No next chapter") : "Next page", !atEnd || chapterLink("next") !== null);
}
function initializeNavButtons() {
    const { back, forward } = navButtons();
    const wire = (button, turn) => {
        if (!button)
            return;
        button.addEventListener("click", (event) => {
            if (!pagedActive)
                return; // scroll mode: the plain chapter link
            event.preventDefault();
            if (button.getAttribute("aria-disabled") !== "true")
                turn();
        });
        button.addEventListener("keydown", (event) => {
            if (!pagedActive || button.tagName === "A" || (event.key !== "Enter" && event.key !== " "))
                return;
            event.preventDefault();
            if (button.getAttribute("aria-disabled") !== "true")
                turn();
        });
    };
    wire(back, prevPage);
    wire(forward, nextPage);
}
function findAnchor(article) {
    const box = article.getBoundingClientRect();
    const paragraphs = window.literatureReader?.ensureParagraphIds() ?? [];
    for (const paragraph of paragraphs) {
        const fragment = [...paragraph.getClientRects()]
            .findIndex((rect) => rect.width > 0 && rect.right > box.left && rect.left < box.right);
        if (fragment >= 0)
            return { element: paragraph, fragment };
    }
    return undefined;
}
// A short slide-and-fade in the direction of travel, so a page turn is
// visible without being showy. Skipped when the reader prefers less motion.
function animatePageTurn(article, direction) {
    if (typeof article.animate !== "function")
        return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches)
        return;
    article.animate([
        { opacity: 0.4, transform: `translateX(${direction * PAGE_TURN_SHIFT}px)` },
        { opacity: 1, transform: "none" },
    ], { duration: PAGE_TURN_MS, easing: "ease-out" });
}
function showPage(page, rememberAnchor = true, animate = false) {
    const article = pagedArticle();
    if (!article || !pagedActive)
        return;
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
    if (animate && currentPage !== previous)
        animatePageTurn(article, Math.sign(currentPage - previous));
}
function pageOfElement(element, fragment = 0) {
    const article = pagedArticle();
    if (!article)
        return 0;
    const rects = element.getClientRects();
    const rect = rects[Math.min(fragment, rects.length - 1)] ?? element.getBoundingClientRect();
    const offset = rect.left - article.getBoundingClientRect().left + article.scrollLeft;
    return Math.max(0, Math.floor((offset + 1) / pageStride(article)));
}
function fragmentTarget() {
    if (!window.location.hash)
        return null;
    let fragment = window.location.hash.slice(1);
    try {
        fragment = decodeURIComponent(fragment);
    }
    catch (_) { /* use as is */ }
    return document.getElementById(fragment);
}
// Re-measure after anything that changes the layout, keeping the reader on
// the page that holds the text they were reading.
function relayout() {
    const article = pagedArticle();
    if (!article)
        return;
    if (!pagedActive) {
        // Scroll mode: only the page edges follow layout changes
        updatePageFrame();
        return;
    }
    updateToolbarHeight();
    measurePages(article);
    if (pageAnchor && article.contains(pageAnchor.element)) {
        showPage(pageOfElement(pageAnchor.element, pageAnchor.fragment), false);
    }
    else {
        showPage(Math.round(pageFraction * (pageCount - 1)), false);
    }
}
// initial: first layout of this page load, so honour the URL fragment and a
// "continue from the end" request from the following chapter. Otherwise keep
// the paragraph the reader was looking at in scroll mode.
function enterPaged(initial) {
    const article = pagedArticle();
    if (!article)
        return;
    const anchor = initial ? undefined : window.literatureReader?.visibleParagraph();
    pagedActive = true;
    window.scrollTo(0, 0);
    updateToolbarHeight();
    document.documentElement.dataset.readerPaged = "true";
    measurePages(article);
    let startPage = 0;
    if (initial) {
        let openAtEnd = false;
        try {
            openAtEnd = sessionStorage.getItem(OPEN_AT_END_KEY) === window.location.pathname;
            sessionStorage.removeItem(OPEN_AT_END_KEY);
        }
        catch (_) { /* noop */ }
        const target = fragmentTarget();
        if (target)
            startPage = pageOfElement(target);
        else if (openAtEnd)
            startPage = pageCount - 1;
    }
    else if (anchor) {
        startPage = pageOfElement(anchor);
    }
    showPage(startPage);
}
function leavePaged() {
    const article = pagedArticle();
    const anchor = pageAnchor?.element;
    pagedActive = false;
    document.documentElement.dataset.readerPaged = "false";
    if (article)
        article.scrollLeft = 0;
    updateProgressBar();
    anchor?.scrollIntoView({ block: "start" });
}
function applyMode(initial = false) {
    if (wantsPaged()) {
        if (pagedActive)
            relayout();
        else
            enterPaged(initial);
    }
    else if (pagedActive) {
        leavePaged();
    }
    else {
        document.documentElement.dataset.readerPaged = "false";
        updateProgressBar();
    }
}
// ── Page turning ───────────────────────────────────────────────────────
function chapterLink(rel) {
    return document.querySelector(`.reader-toolbar a[rel="${rel}"]`);
}
function nextPage() {
    if (!pagedActive)
        return;
    if (currentPage < pageCount - 1) {
        showPage(currentPage + 1, true, true);
        return;
    }
    const next = chapterLink("next");
    if (next)
        window.location.assign(next.href);
}
function prevPage() {
    if (!pagedActive)
        return;
    if (currentPage > 0) {
        showPage(currentPage - 1, true, true);
        return;
    }
    const previous = chapterLink("prev");
    if (!previous)
        return;
    try {
        sessionStorage.setItem(OPEN_AT_END_KEY, new URL(previous.href, window.location.href).pathname);
    }
    catch (_) { /* noop */ }
    window.location.assign(previous.href);
}
function isInteractive(target) {
    return target instanceof Element &&
        target.closest("a, button, input, select, textarea, summary, [contenteditable]") !== null;
}
// Which page-turn zone, if any, a point is in: left of the text (or its first
// strip) turns back, right of it turns forward. The toolbar, drawer,
// progress bar, dialogs and links are never zones.
function turnZoneAt(x, y, target) {
    const article = pagedArticle();
    if (!pagedActive || !article || isInteractive(target))
        return null;
    if (target instanceof Element &&
        target.closest(".reader-toolbar, #sidebar, .reader-progress-bar, dialog"))
        return null;
    const box = article.getBoundingClientRect();
    if (y < box.top || y > box.bottom)
        return null;
    const strip = Math.min(box.width * MARGIN_ZONE, MARGIN_ZONE_MAX);
    if (x < box.left + strip)
        return "prev";
    if (x > box.right - strip)
        return "next";
    return null;
}
function turnPage(zone) {
    window.getSelection()?.removeAllRanges();
    if (zone === "prev")
        prevPage();
    else
        nextPage();
}
// ── Input handlers ─────────────────────────────────────────────────────
function handleKeyDown(event) {
    if (!pagedActive || event.defaultPrevented)
        return;
    if (event.altKey || event.ctrlKey || event.metaKey)
        return;
    // Only text entry and an open dialog keep the keys; focus left on a drawer
    // or toolbar button (e.g. after closing Settings) must not block paging.
    const target = event.target;
    if (target instanceof Element && target.closest("input, select, textarea, [contenteditable]"))
        return;
    if (document.querySelector("dialog[open]"))
        return;
    let handled = true;
    switch (event.key) {
        case "ArrowRight":
        case "PageDown":
            nextPage();
            break;
        case "ArrowLeft":
        case "PageUp":
            prevPage();
            break;
        case " ":
            if (isInteractive(target)) {
                handled = false;
                break;
            }
            if (event.shiftKey)
                prevPage();
            else
                nextPage();
            break;
        case "Home":
            showPage(0);
            break;
        case "End":
            showPage(pageCount - 1);
            break;
        default:
            handled = false;
    }
    if (handled)
        event.preventDefault();
}
function initializeInput(article) {
    document.addEventListener("keydown", handleKeyDown);
    // Mouse wheel and trackpad: one page per gesture step
    let wheelTotal = 0;
    let lastWheelTurn = 0;
    // On the whole page (text and blank margins), not the toolbar or drawer
    document.addEventListener("wheel", (event) => {
        if (!pagedActive || event.ctrlKey || event.metaKey)
            return;
        if (event.target instanceof Element &&
            event.target.closest(".reader-toolbar, #sidebar, dialog"))
            return;
        event.preventDefault();
        const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
        const now = Date.now();
        if (now - lastWheelTurn < WHEEL_COOLDOWN)
            return;
        wheelTotal += delta;
        if (Math.abs(wheelTotal) < WHEEL_THRESHOLD)
            return;
        if (wheelTotal > 0)
            nextPage();
        else
            prevPage();
        wheelTotal = 0;
        lastWheelTurn = now;
    }, { passive: false });
    // Horizontal swipe
    let swipe;
    article.addEventListener("touchstart", (event) => {
        if (!pagedActive || event.touches.length !== 1 || isInteractive(event.target)) {
            swipe = undefined;
            return;
        }
        const touch = event.touches[0];
        swipe = { x: touch.clientX, y: touch.clientY, time: Date.now() };
    }, { passive: true });
    article.addEventListener("touchend", (event) => {
        if (!swipe || event.touches.length !== 0) {
            swipe = undefined;
            return;
        }
        const touch = event.changedTouches[0];
        const dx = touch.clientX - swipe.x;
        const dy = touch.clientY - swipe.y;
        const elapsed = Date.now() - swipe.time;
        swipe = undefined;
        if (elapsed > SWIPE_MAX_TIME || Math.abs(dx) < SWIPE_DISTANCE || Math.abs(dx) < Math.abs(dy) * 1.2)
            return;
        if (dx < 0)
            nextPage();
        else
            prevPage();
    }, { passive: true });
    article.addEventListener("touchcancel", () => { swipe = undefined; }, { passive: true });
    // Double-click in the margins: the blank space either side of the text
    // plus a narrow strip at each edge of the text. The cursor shows the zone.
    // A double-click (not a single click) so clicking and dragging to select
    // text never turns the page; the word a double-click selects is cleared.
    let lastTouchTurn = 0;
    document.addEventListener("dblclick", (event) => {
        // A double-tap already turned the page; ignore the browser's copy of it
        if (Date.now() - lastTouchTurn < DOUBLE_TAP_TIME * 2)
            return;
        const zone = turnZoneAt(event.clientX, event.clientY, event.target);
        if (!zone)
            return;
        event.preventDefault();
        turnPage(zone);
    });
    // Double-tap in the same zones on touch screens. Phones do not reliably
    // send dblclick, so two quick, short, nearby taps are detected here.
    let tapStart;
    let lastTap;
    document.addEventListener("touchstart", (event) => {
        tapStart = undefined;
        if (!pagedActive || event.touches.length !== 1)
            return;
        const touch = event.touches[0];
        tapStart = { x: touch.clientX, y: touch.clientY, time: Date.now() };
    }, { passive: true });
    document.addEventListener("touchend", (event) => {
        const start = tapStart;
        tapStart = undefined;
        if (!start || event.touches.length !== 0)
            return;
        const touch = event.changedTouches[0];
        const now = Date.now();
        if (now - start.time > TAP_MAX_TIME ||
            Math.hypot(touch.clientX - start.x, touch.clientY - start.y) > TAP_MAX_MOVE) {
            lastTap = undefined;
            return;
        }
        const zone = turnZoneAt(touch.clientX, touch.clientY, event.target);
        if (!zone) {
            lastTap = undefined;
            return;
        }
        if (lastTap && lastTap.zone === zone && now - lastTap.time < DOUBLE_TAP_TIME &&
            Math.hypot(touch.clientX - lastTap.x, touch.clientY - lastTap.y) < DOUBLE_TAP_DISTANCE) {
            event.preventDefault(); // no synthetic click, dblclick or zoom
            lastTap = undefined;
            lastTouchTurn = now;
            turnPage(zone);
            return;
        }
        lastTap = { x: touch.clientX, y: touch.clientY, time: now, zone };
    }, { passive: false });
    document.addEventListener("mousemove", (event) => {
        const zone = turnZoneAt(event.clientX, event.clientY, event.target) ?? "none";
        if (document.documentElement.dataset.readerTurnZone !== zone) {
            document.documentElement.dataset.readerTurnZone = zone;
        }
    }, { passive: true });
    // Keep pages aligned when the browser scrolls the box itself, for example
    // find-in-page or tabbing to a link on another page.
    article.addEventListener("scroll", () => {
        if (!pagedActive)
            return;
        window.clearTimeout(realignTimer);
        realignTimer = window.setTimeout(() => {
            const stride = pageStride(article);
            const page = Math.round(article.scrollLeft / stride);
            if (page !== currentPage || Math.abs(article.scrollLeft - page * stride) > 1)
                showPage(page);
        }, 120);
    }, { passive: true });
    // In-chapter links such as footnotes
    window.addEventListener("hashchange", () => {
        const target = fragmentTarget();
        if (pagedActive && target)
            showPage(pageOfElement(target));
    });
}
// ── Public API ─────────────────────────────────────────────────────────
function initializeReaderMode() {
    const article = pagedArticle();
    if (!article || article.dataset.readerModeInitialized === "true")
        return;
    article.dataset.readerModeInitialized = "true";
    window.literatureReader?.ensureParagraphIds();
    initializeInput(article);
    initializeNavButtons();
    window.addEventListener(READER_SETTINGS_EVENT, (event) => {
        const { changed } = event.detail;
        if (changed.some((key) => key !== "theme" && key !== "resumeLastLocation"))
            applyMode();
    });
    // The page box changes size with the window, the drawer and the toolbar
    if (typeof ResizeObserver === "function") {
        let pending = false;
        new ResizeObserver(() => {
            if (pending)
                return;
            pending = true;
            window.requestAnimationFrame(() => { pending = false; relayout(); });
        }).observe(article);
    }
    else {
        window.addEventListener("resize", relayout);
    }
    // The page can move without changing size (window resize when wider than
    // the page, drawer opening), so keep the page edges in place too
    window.addEventListener("resize", updatePageFrame);
    document.body.addEventListener("transitionend", updatePageFrame);
    new MutationObserver(() => window.requestAnimationFrame(updatePageFrame))
        .observe(document.documentElement, { attributes: true, attributeFilter: ["data-reader-navigation-open"] });
    document.fonts?.ready.then(relayout);
    article.querySelectorAll("img").forEach((image) => {
        if (!image.complete)
            image.addEventListener("load", relayout, { once: true });
    });
    applyMode(true);
}
window.w3_nextPage = nextPage;
window.w3_prevPage = prevPage;
window.initializeReaderMode = initializeReaderMode;
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeReaderMode);
}
else {
    initializeReaderMode();
}
