"use strict";

const navigationStateKey = "literatureReaderNavigationOpen";

function initializeNavigationDrawer() {
  const sidebar = document.getElementById("sidebar");
  if (!sidebar || sidebar.dataset.drawerInitialized) return sidebar;
  sidebar.dataset.drawerInitialized = "true";
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && sidebar.dataset.open === "true") {
      event.preventDefault();
      w3_close();
    }
  });
  const desktopRail = window.matchMedia("(min-width: 641px)");
  const updateDrawerAccess = () => setNavigationToggleState(sidebar.dataset.open === "true");
  if (desktopRail.addEventListener) {
    desktopRail.addEventListener("change", updateDrawerAccess);
  } else {
    desktopRail.addListener(updateDrawerAccess);
  }
  setNavigationToggleState(readNavigationToggleState());
  return sidebar;
}

function readNavigationToggleState() {
  try {
    return window.sessionStorage.getItem(navigationStateKey) === "true";
  } catch (error) {
    console.error("Could not read navigation state in this tab.", error);
    return false;
  }
}

function setNavigationToggleState(open) {
  const sidebar = document.getElementById("sidebar");
  try {
    window.sessionStorage.setItem(navigationStateKey, String(open));
  } catch (error) {
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
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Close navigation menu" : "Open navigation menu");
    toggle.title = open ? "Close navigation menu" : "Open navigation menu";
  });
}

function w3_open() {
  const sidebar = initializeNavigationDrawer();
  if (!sidebar || sidebar.dataset.open === "true") return;
  setNavigationToggleState(true);
  document.querySelector(".reader-menu-toggle")?.focus();
}

function w3_close() {
  const sidebar = initializeNavigationDrawer();
  if (!sidebar || sidebar.dataset.open !== "true") return;
  const restoreFocus = sidebar.contains(document.activeElement);
  setNavigationToggleState(false);
  if (restoreFocus) document.querySelector(".reader-menu-toggle")?.focus();
}

function w3_toggle() {
  const sidebar = initializeNavigationDrawer();
  if (sidebar?.dataset.open === "true") w3_close();
  else w3_open();
}

window.w3_open = w3_open;
window.w3_close = w3_close;
window.w3_toggle = w3_toggle;

function initializeSwipeNavigation() {
  const article = document.querySelector("article.reader-content");
  if (!article) return;

  const previous = document.querySelector('a[rel="prev"]');
  const next = document.querySelector('a[rel="next"]');
  let start;

  article.addEventListener("touchstart", event => {
    if (event.touches.length !== 1 || event.target.closest("a, button, input, select, textarea")) {
      start = undefined;
      return;
    }
    const touch = event.touches[0];
    start = { x: touch.pageX, y: touch.pageY, time: Date.now() };
  }, { passive: true });

  article.addEventListener("touchend", event => {
    if (!start) return;
    if (event.touches.length !== 0) {
      start = undefined;
      return;
    }
    const touch = event.changedTouches[0];
    const deltaX = touch.pageX - start.x;
    const deltaY = touch.pageY - start.y;
    const elapsed = Date.now() - start.time;
    start = undefined;
    if (elapsed > 1000 || Math.abs(deltaX) < 80 || Math.abs(deltaX) < Math.abs(deltaY) * 1.3) return;

    if (deltaX < 0 && next) window.location.assign(next.href);
    else if (deltaX > 0 && previous) window.location.assign(previous.href);
  }, { passive: true });
  article.addEventListener("touchcancel", () => {
    start = undefined;
  }, { passive: true });
}

document.addEventListener("DOMContentLoaded", () => {
  initializeNavigationDrawer();
  initializeSwipeNavigation();
});
