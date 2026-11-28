"use strict";
// hugo-nav.ts — Navigation drawer, swipe gestures, and session state for Hugo site
// Compiled output: hugo/static/js/hugo-nav.js
const navigationStateKey = "literatureReaderNavigationOpen";
// Sent by page-loader.ts after it swaps another page into this one; the
// scripts set up the new page's parts. (reader-settings.ts spells it out, as
// it is also loaded on its own by the legacy pages.)
const PAGE_LOADED_EVENT = "literature-page-loaded";
function initializeNavigationDrawer() {
    const sidebar = document.getElementById("sidebar");
    if (!sidebar || sidebar.dataset.drawerInitialized)
        return sidebar;
    sidebar.dataset.drawerInitialized = "true";
    // Escape key closes drawer
    document.addEventListener("keydown", event => {
        if (event.key === "Escape" && sidebar.dataset.open === "true") {
            event.preventDefault();
            w3_close();
        }
    });
    // Sync toggle state on resize
    const desktopRail = window.matchMedia("(min-width: 641px)");
    const updateDrawerAccess = () => setNavigationToggleState(sidebar.dataset.open === "true");
    if (desktopRail.addEventListener) {
        desktopRail.addEventListener("change", updateDrawerAccess);
    }
    else {
        desktopRail.addListener(updateDrawerAccess);
    }
    // Initialize state
    setNavigationToggleState(readNavigationToggleState() && !(narrowScreen() && showingChapter()));
    return sidebar;
}
function readNavigationToggleState() {
    try {
        return window.sessionStorage.getItem(navigationStateKey) === "true";
    }
    catch (error) {
        console.error("Could not read navigation state in this tab.", error);
        return false;
    }
}
function setNavigationToggleState(open) {
    const sidebar = document.getElementById("sidebar");
    try {
        window.sessionStorage.setItem(navigationStateKey, String(open));
    }
    catch (error) {
        console.error("Could not save navigation state in this tab.", error);
    }
    if (sidebar) {
        sidebar.dataset.open = String(open);
        const drawerInteractive = open || window.matchMedia("(min-width: 641px)").matches;
        sidebar.setAttribute("aria-hidden", String(!drawerInteractive));
        sidebar.inert = !drawerInteractive;
    }
    document.documentElement.dataset.readerNavigationOpen = String(open);
    document.body.classList.toggle("reader-navigation-open", open);
    document.querySelectorAll(".reader-menu-toggle").forEach(toggle => {
        const btn = toggle;
        btn.setAttribute("aria-expanded", String(open));
        btn.setAttribute("aria-label", open ? "Close navigation menu" : "Open navigation menu");
        btn.title = open ? "Close navigation menu" : "Open navigation menu";
    });
}
// A chapter of a book is showing (not the Contact page, which shares the
// chapter layout)
function showingChapter() {
    const parts = window.location.pathname.split("/").filter(Boolean);
    return parts.length >= 4 && parts[0] === "authors" &&
        document.querySelector("body > article.reader-content") !== null;
}
// On narrow screens the open drawer covers the text, so it closes when a
// chapter opens; on author, book and other pages it stays open for choosing
function narrowScreen() {
    return !window.matchMedia("(min-width: 641px)").matches;
}
// Public window globals for Hugo templates
function w3_open() {
    const sidebar = initializeNavigationDrawer();
    if (!sidebar || sidebar.dataset.open === "true")
        return;
    setNavigationToggleState(true);
    document.querySelector(".reader-menu-toggle")?.focus();
}
function w3_close() {
    const sidebar = initializeNavigationDrawer();
    if (!sidebar || sidebar.dataset.open !== "true")
        return;
    const restoreFocus = sidebar.contains(document.activeElement);
    setNavigationToggleState(false);
    if (restoreFocus)
        document.querySelector(".reader-menu-toggle")?.focus();
}
function w3_toggle() {
    const sidebar = initializeNavigationDrawer();
    if (sidebar?.dataset.open === "true")
        w3_close();
    else
        w3_open();
}
// Assign to window for Hugo template onclick handlers
if (typeof window !== "undefined") {
    window.w3_open = w3_open;
    window.w3_close = w3_close;
    window.w3_toggle = w3_toggle;
}
// "Skip to the text" (baseof.html): focus the text without the #fragment
// a plain link would leave in the address bar, and without page mode
// turning to the start of the chapter. Registered before page-loader.ts,
// which leaves clicks another script has handled.
document.addEventListener("click", (event) => {
    const link = event.target instanceof Element ? event.target.closest(".reader-skip-link") : null;
    const article = document.querySelector("body > article");
    if (!link || !article)
        return;
    event.preventDefault();
    if (!article.hasAttribute("tabindex"))
        article.tabIndex = -1;
    article.focus({ preventScroll: document.documentElement.dataset.readerPaged === "true" });
});
// Swipe between chapters in scroll mode. On the page's <article>, which is
// kept when pages load in place, so it checks for a chapter each time.
function initializeSwipeNavigation() {
    const article = document.querySelector("body > article");
    if (!article)
        return;
    let start;
    article.addEventListener("touchstart", (event) => {
        // In page mode reader-mode.js turns pages (and chapters at the ends)
        if (!article.classList.contains("reader-content") ||
            document.documentElement.dataset.readerPaged === "true" ||
            event.touches.length !== 1 || event.target.closest("a, button, input, select, textarea")) {
            start = undefined;
            return;
        }
        const touch = event.touches[0];
        start = { x: touch.pageX, y: touch.pageY, time: Date.now() };
    }, { passive: true });
    article.addEventListener("touchend", (event) => {
        if (!start)
            return;
        if (event.touches.length !== 0) {
            start = undefined;
            return;
        }
        const touch = event.changedTouches[0];
        const deltaX = touch.pageX - start.x;
        const deltaY = touch.pageY - start.y;
        const elapsed = Date.now() - start.time;
        start = undefined;
        // Only trigger if swipe is fast enough, long enough, and horizontal
        if (elapsed > 1000 || Math.abs(deltaX) < 80 || Math.abs(deltaX) < Math.abs(deltaY) * 1.3)
            return;
        // Looked up now: loading a chapter in place replaces the links
        const link = document.querySelector(deltaX < 0 ? 'a[rel="next"]' : 'a[rel="prev"]');
        if (!link)
            return;
        if (window.literatureNavigate)
            window.literatureNavigate(link.href);
        else
            window.location.assign(link.href);
    }, { passive: true });
    article.addEventListener("touchcancel", () => {
        start = undefined;
    }, { passive: true });
}
// Toolbar drop-downs (book and chapter): open below their menu item, shifted
// left only as far as needed to stay on screen; only one open at a time.
// Menus are looked up when used, because loading a page in place
// (page-loader.ts) replaces the toolbar; bindCrumbMenus() wires the new ones.
function crumbMenus() {
    return [...document.querySelectorAll(".reader-crumb-menu")];
}
function positionCrumbMenu(menu) {
    const list = menu.querySelector(".reader-crumb-menu-list");
    if (!list || !menu.open)
        return;
    list.style.left = "0px";
    const margin = 8;
    const bounds = list.getBoundingClientRect();
    const overflow = bounds.right - (window.innerWidth - margin);
    const shift = Math.min(Math.max(overflow, 0), bounds.left - margin);
    if (shift > 0)
        list.style.left = `${-shift}px`;
}
function bindCrumbMenus() {
    for (const menu of crumbMenus()) {
        if (menu.dataset.crumbMenuBound)
            continue;
        menu.dataset.crumbMenuBound = "true";
        menu.addEventListener("toggle", () => {
            if (!menu.open)
                return;
            crumbMenus().forEach(other => { if (other !== menu)
                other.open = false; });
            positionCrumbMenu(menu);
        });
    }
}
function initializeCrumbMenus() {
    bindCrumbMenus();
    window.addEventListener("resize", () => crumbMenus().forEach(positionCrumbMenu));
    // Click elsewhere or Escape closes an open menu
    document.addEventListener("click", event => {
        crumbMenus().forEach(menu => {
            if (menu.open && !menu.contains(event.target))
                menu.open = false;
        });
    });
    document.addEventListener("keydown", event => {
        if (event.key !== "Escape")
            return;
        const open = crumbMenus().find(menu => menu.open);
        if (!open)
            return;
        open.open = false;
        open.querySelector("summary")?.focus();
    });
}
// Breadcrumb labels: the CSS container queries choose which labels to show,
// but flexbox can still squeeze a shown label down to a character or two.
// Hide any label truncated below a readable width so its crumb is icon-only.
// Labels give way in the same order as their flex-shrink weights (author,
// then book, then chapter), re-measuring after each so a hidden label's
// space goes to the others.
function updateCrumbLabels() {
    const crumbs = document.querySelector(".reader-breadcrumbs");
    if (!crumbs)
        return;
    const squeezed = "reader-breadcrumb-label--squeezed";
    const minimumEms = 4;
    const labels = [...crumbs.querySelectorAll(".reader-breadcrumb-label")];
    labels.forEach(label => label.classList.remove(squeezed));
    const weight = (label) => {
        const crumb = label.closest(".reader-breadcrumbs > *");
        return crumb ? parseFloat(getComputedStyle(crumb).flexShrink) || 0 : 0;
    };
    labels.sort((a, b) => weight(b) - weight(a));
    for (const label of labels) {
        const style = getComputedStyle(label);
        if (style.display === "none")
            continue;
        const minimum = parseFloat(style.fontSize) * minimumEms;
        if (label.scrollWidth > label.clientWidth && label.clientWidth < minimum) {
            label.classList.add(squeezed);
        }
    }
}
// The toolbar's width does not depend on the labels, so hiding one cannot
// trigger another resize. Called again for the new toolbar after a page
// loads in place.
let crumbObserver;
let crumbToolbarWidth = -1;
function observeCrumbToolbar() {
    const toolbar = document.querySelector(".reader-breadcrumbs")?.parentElement;
    if (!toolbar || typeof ResizeObserver !== "function")
        return;
    crumbObserver ?? (crumbObserver = new ResizeObserver(entries => {
        const next = entries[entries.length - 1].contentRect.width;
        if (next === crumbToolbarWidth)
            return;
        crumbToolbarWidth = next;
        updateCrumbLabels();
    }));
    crumbObserver.disconnect();
    crumbToolbarWidth = -1;
    crumbObserver.observe(toolbar);
}
function initializeCrumbLabels() {
    observeCrumbToolbar();
    document.fonts?.ready.then(updateCrumbLabels);
}
// Info dialog (partials/info-dialog.html): opened by the info buttons in the
// top bar and the drawer; the close button, Escape and a click on the
// backdrop close it, returning focus to the button that opened it. The
// buttons and the dialog's contents are replaced when a page loads in place,
// so clicks are matched as they happen rather than bound once.
function initializeInfoDialog() {
    const dialog = document.querySelector("#reader-info");
    if (!dialog)
        return;
    let opener = null;
    document.addEventListener("click", event => {
        const button = event.target instanceof Element ? event.target.closest(".reader-info-toggle") : null;
        if (!button || dialog.open)
            return;
        opener = button;
        dialog.showModal();
    });
    dialog.addEventListener("click", event => {
        if (event.target instanceof Element && event.target.closest(".reader-info-close")) {
            dialog.close();
            return;
        }
        if (event.target !== dialog)
            return;
        const bounds = dialog.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right ||
            event.clientY < bounds.top || event.clientY > bounds.bottom) {
            dialog.close();
        }
    });
    dialog.addEventListener("close", () => {
        // The drawer may have closed meanwhile; only refocus a visible button
        if (opener && opener.offsetParent !== null)
            opener.focus();
        opener = null;
    });
}
// Initialize on DOM ready
document.addEventListener("DOMContentLoaded", () => {
    initializeNavigationDrawer();
    initializeSwipeNavigation();
    initializeCrumbMenus();
    initializeCrumbLabels();
    initializeInfoDialog();
    // page-loader.ts swapped another page into this one
    window.addEventListener(PAGE_LOADED_EVENT, () => {
        const sidebar = document.getElementById("sidebar");
        const open = sidebar?.dataset.open === "true" && !(narrowScreen() && showingChapter());
        setNavigationToggleState(open); // also updates the new menu button
        bindCrumbMenus();
        observeCrumbToolbar();
    });
});
