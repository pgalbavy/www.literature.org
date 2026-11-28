// page-loader.ts — loads pages of this site in place. Compiled output:
// hugo/static/js/page-loader.js (bundled last, after reader-mode.js)
//
// A page load always ends browser full screen, so links within the site
// fetch the new page and swap its parts into this one instead: the title,
// the toolbar, the drawer's links, the article and the Info dialog. The
// <article> element itself is kept, because scripts listen on it; only its
// class and contents change. The address bar follows (history.pushState),
// so Back, Forward, bookmarks and sharing behave as before.
//
// After a swap, "literature-page-loaded" (PAGE_LOADED_EVENT, hugo-nav.ts)
// tells the other scripts to set up the new page. Anything this cannot load
// (other sites, files, a failed request) gets a normal page load.
"use strict";

let pageRequest: AbortController | undefined;
let shownPage = new URL(window.location.href);   // the page this document shows

function pageArticle(): HTMLElement | null {
  return document.querySelector<HTMLElement>("body > article");
}

// Same page apart from the #fragment
function samePage(a: URL, b: URL): boolean {
  return a.pathname === b.pathname && a.search === b.search;
}

// Pages of this site, which all share the same layout: directories and
// chapters, not files such as contents.json or the legacy /templates.
// Chapters are linked without .html (Cloudflare Pages serves chapter-01.html
// at /…/chapter-01), or with it under hugo server: a last part with no
// extension, or .html.
function isPagePath(pathname: string): boolean {
  const last = pathname.slice(pathname.lastIndexOf("/") + 1);
  return last === "" || last.endsWith(".html") || !last.includes(".");
}

function loadableInPlace(url: URL): boolean {
  return url.origin === window.location.origin &&
    isPagePath(url.pathname) &&
    !url.pathname.startsWith("/templates/") &&
    pageArticle() !== null &&
    typeof fetch === "function" && typeof DOMParser === "function" &&
    typeof history.pushState === "function";
}

function loadPageNormally(url: URL, openAtEnd: boolean): void {
  if (openAtEnd) {
    try { sessionStorage.setItem(OPEN_AT_END_KEY, url.pathname); } catch (_) { /* noop */ }
  }
  window.location.assign(url.href);
}

// Keep the scroll position of the page being left, for Back
function rememberScroll(): void {
  try {
    history.replaceState({ ...(history.state ?? {}), scrollY: window.scrollY }, "");
  } catch (_) { /* noop */ }
}

function navigate(href: string, options: { openAtEnd?: boolean } = {}): void {
  const url = new URL(href, window.location.href);
  const openAtEnd = options.openAtEnd ?? false;
  if (!loadableInPlace(url)) {
    loadPageNormally(url, openAtEnd);
    return;
  }
  if (samePage(url, shownPage)) {
    if (url.hash) window.location.hash = url.hash;
    return;
  }
  rememberScroll();
  void loadPage(url, { openAtEnd, addToHistory: true });
}

async function loadPage(url: URL, options: { openAtEnd: boolean; addToHistory: boolean; scrollY?: number }): Promise<void> {
  pageRequest?.abort();
  const request = new AbortController();
  pageRequest = request;
  const fallBack = (): void => {
    if (options.addToHistory) loadPageNormally(url, options.openAtEnd);
    else window.location.reload();
  };

  let page: Document;
  try {
    const response = await fetch(url.href, { signal: request.signal, credentials: "same-origin" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    // An old .html address, redirected to the one without: show that one
    if (response.redirected && response.url) {
      const final = new URL(response.url);
      if (final.origin === url.origin) {
        final.hash = url.hash;
        url = final;
      }
    }
    page = new DOMParser().parseFromString(await response.text(), "text/html");
  } catch (error) {
    if ((error as Error).name === "AbortError") return;
    console.error("Could not load the page in place; loading it normally.", error);
    fallBack();
    return;
  }
  if (pageRequest !== request) return;   // overtaken by a later request
  pageRequest = undefined;

  if (!page.querySelector("body > article") || !page.querySelector(".reader-toolbar")) {
    fallBack();
    return;
  }
  if (options.addToHistory) history.pushState({ literaturePage: true }, "", url.href);
  // Back and Forward restore positions themselves (see popstate below)
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  shownPage = url;

  swapPage(page);
  window.dispatchEvent(new CustomEvent(PAGE_LOADED_EVENT, { detail: { openAtEnd: options.openAtEnd } }));

  // Page mode positions itself (reader-mode.ts); everything else scrolls
  if (document.documentElement.dataset.readerPaged !== "true") {
    let target: HTMLElement | null = null;
    if (url.hash) {
      try { target = document.getElementById(decodeURIComponent(url.hash.slice(1))); } catch (_) { /* noop */ }
    }
    if (target) target.scrollIntoView({ block: "start" });
    else window.scrollTo(0, options.scrollY ?? 0);
  }
  announcePage();
}

// The link that was followed has gone with the old page, which leaves focus
// at the start of the document and screen readers silent. Moving focus to
// the new page's heading reads it out, and Tab carries on from there. Focus
// that survived the swap (the toolbar arrow just used) stays where it is.
function announcePage(): void {
  const active = document.activeElement;
  if (active && active !== document.body && document.contains(active)) return;
  const article = pageArticle();
  const heading = article?.querySelector<HTMLElement>("h1") ?? article;
  if (!heading) return;
  if (!heading.hasAttribute("tabindex")) heading.tabIndex = -1;
  heading.focus({ preventScroll: true });
}

// Copies the parts of a fetched page that differ between pages into this
// one, keeping the elements that scripts are attached to.
function swapPage(page: Document): void {
  const adopt = <T extends Node>(node: T): T => document.importNode(node, true);
  const adoptChildren = (from: Element): Node[] => [...from.childNodes].map(adopt);

  document.title = page.title;
  const description = page.querySelector<HTMLMetaElement>('meta[name="description"]');
  const ownDescription = document.querySelector<HTMLMetaElement>('meta[name="description"]');
  if (description && ownDescription) ownDescription.content = description.content;

  // Toolbar: keep focus on the arrow the reader just used
  const toolbar = document.querySelector(".reader-toolbar");
  const newToolbar = page.querySelector(".reader-toolbar");
  if (toolbar && newToolbar) {
    const focusedRel = toolbar.contains(document.activeElement)
      ? document.activeElement?.getAttribute("rel") : null;
    const replacement = adopt(newToolbar);
    toolbar.replaceWith(replacement);
    if (focusedRel) replacement.querySelector<HTMLElement>(`[rel="${focusedRel}"]`)?.focus({ preventScroll: true });
  }

  const article = pageArticle();
  const newArticle = page.querySelector("body > article");
  if (article && newArticle) {
    article.className = newArticle.className;
    article.replaceChildren(...adoptChildren(newArticle));
  }

  // The drawer's links; reader-settings.ts adds Share and Settings again
  const links = document.getElementById("sidebar-links");
  const newLinks = page.getElementById("sidebar-links");
  if (links && newLinks) links.replaceChildren(...adoptChildren(newLinks));

  const info = document.getElementById("reader-info") as HTMLDialogElement | null;
  const newInfo = page.getElementById("reader-info");
  if (info && newInfo) {
    if (info.open) info.close();
    info.replaceChildren(...adoptChildren(newInfo));
  }
}

function initializePageLoader(): void {
  window.literatureNavigate = navigate;

  // Links within the site, unless the reader wants them elsewhere (new tab
  // or window) or another script has already handled the click
  document.addEventListener("click", (event: MouseEvent) => {
    if (event.defaultPrevented || event.button !== 0 ||
        event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
    if (!link || (link.target && link.target !== "_self") || link.hasAttribute("download")) return;
    const url = new URL(link.href, window.location.href);
    if (!loadableInPlace(url) || samePage(url, shownPage)) return;   // other sites; #fragments
    event.preventDefault();
    navigate(url.href);
  });

  window.addEventListener("popstate", (event: PopStateEvent) => {
    const url = new URL(window.location.href);
    if (samePage(url, shownPage)) return;   // only the #fragment changed
    if (!loadableInPlace(url)) {
      window.location.reload();
      return;
    }
    void loadPage(url, { openAtEnd: false, addToHistory: false, scrollY: event.state?.scrollY ?? 0 });
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializePageLoader);
} else {
  initializePageLoader();
}
