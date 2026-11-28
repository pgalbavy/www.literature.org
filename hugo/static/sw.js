// sw.ts — the service worker, for reading offline. Compiled output:
// hugo/static/sw.js (tsconfig.sw.json), served from the site root so it
// covers every page. Registered by offline.ts.
//
// Pages come from the network whenever it answers, so updates to the site
// show at once; a copy is the fallback when it does not:
//
//   - Saved books (offline.ts, "Save for offline reading") are in BOOKS_CACHE,
//     and refreshed here whenever one of their pages is read online.
//   - The last RECENT_LIMIT other pages read are in PAGES_CACHE, so the page
//     in front of the reader survives a dropped connection.
//   - The CSS and JS bundles, fonts and icon sprite are in ASSETS_CACHE,
//     taken from there first: their names change when their content does.
//     Only the newest of each bundle is kept; a saved page that asks for an
//     older one gets the newest instead.
//   - A page that was never saved gets the Saved books page, which says
//     the reader is offline and lists what can be read (offline.ts).
//
// The cache names are shared with offline.ts.
"use strict";
const worker = self;
const BOOKS_CACHE = "literature-books-v1";
const PAGES_CACHE = "literature-pages-v1";
const ASSETS_CACHE = "literature-assets-v1";
const LIBRARY_CACHE = "literature-library-v1"; // saved books' details (offline.ts)
const KNOWN_CACHES = [BOOKS_CACHE, PAGES_CACHE, ASSETS_CACHE, LIBRARY_CACHE];
const SAVED_PAGE = "/saved/";
const SEARCH_INDEX = "/search-index.json";
const RECENT_LIMIT = 60;
// A saved page is shown if the network has not answered by then
const NETWORK_TIMEOUT_MS = 6000;
// Pages of this site: directories and chapters (no extension, or .html under
// hugo server), as page-loader.ts decides
function isPagePath(pathname) {
    const last = pathname.slice(pathname.lastIndexOf("/") + 1);
    return last === "" || last.endsWith(".html") || !last.includes(".");
}
function isAsset(pathname) {
    return pathname.startsWith("/bundle/") || pathname.startsWith("/fonts/");
}
// A response that can be stored and served for any request. The browser
// refuses a stored redirect as the answer to a page request, so a redirected
// response (an old .html address) is copied into a plain one.
async function storable(response) {
    if (!response.redirected)
        return response;
    return new Response(await response.blob(), {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
    });
}
// /bundle/site.min.<hash>.css → "/bundle/site.min.*.css": the same bundle
// in another version
function bundleFamily(pathname) {
    const match = /^(\/bundle\/.+)\.[0-9a-f]{16,}(\.[a-z0-9]+)$/.exec(pathname);
    return match ? `${match[1]}.*${match[2]}` : null;
}
async function sameFamily(cache, pathname) {
    const family = bundleFamily(pathname);
    if (!family)
        return [];
    const keys = await cache.keys();
    return keys.filter(key => bundleFamily(new URL(key.url).pathname) === family);
}
async function cacheFirst(request) {
    const cache = await caches.open(ASSETS_CACHE);
    const cached = await cache.match(request);
    if (cached)
        return cached;
    const url = new URL(request.url);
    try {
        const response = await fetch(request);
        if (response.ok) {
            const older = await sameFamily(cache, url.pathname);
            await cache.put(request, (await storable(response.clone())));
            await Promise.all(older.filter(key => key.url !== request.url).map(key => cache.delete(key)));
        }
        return response;
    }
    catch (error) {
        // Offline, asked for an older bundle by a page saved before the site changed
        const [newest] = await sameFamily(cache, url.pathname);
        const fallback = newest && await cache.match(newest);
        if (fallback)
            return fallback;
        throw error;
    }
}
async function keepRecent(cache) {
    const keys = await cache.keys();
    // Oldest first: keys come back in the order they were added
    await Promise.all(keys.slice(0, Math.max(0, keys.length - RECENT_LIMIT)).map(key => cache.delete(key)));
}
// The other address of a chapter: with .html and without
function otherAddress(url) {
    if (url.pathname.endsWith("/"))
        return null;
    const other = new URL(url.href);
    other.pathname = url.pathname.endsWith(".html") ? url.pathname.slice(0, -5) : `${url.pathname}.html`;
    other.hash = "";
    return other.href;
}
async function cachedPage(url) {
    const address = new URL(url.href);
    address.hash = "";
    for (const name of [BOOKS_CACHE, PAGES_CACHE]) {
        const cache = await caches.open(name);
        const found = await cache.match(address.href) ??
            (otherAddress(address) ? await cache.match(otherAddress(address)) : undefined);
        if (found)
            return found;
    }
    return undefined;
}
function timeout(ms) {
    return new Promise((_, reject) => setTimeout(() => reject(new Error("timed out")), ms));
}
async function networkFirst(event, request) {
    const url = new URL(request.url);
    const saved = await cachedPage(url);
    const network = fetch(request);
    try {
        const response = await (saved ? Promise.race([network, timeout(NETWORK_TIMEOUT_MS)]) : network);
        if (response.ok && response.type === "basic") {
            // Keep the copy current: a saved book's page where it is, others as recent
            const copy = response.clone();
            event.waitUntil((async () => {
                const books = await caches.open(BOOKS_CACHE);
                const inBook = await books.match(request.url);
                const cache = inBook ? books : await caches.open(PAGES_CACHE);
                if (!inBook)
                    await cache.delete(request.url); // re-added as the newest
                await cache.put(request.url, await storable(copy));
                if (!inBook)
                    await keepRecent(cache);
            })().catch(() => undefined));
        }
        return response;
    }
    catch (error) {
        if (saved)
            return saved;
        // Not saved: the Saved books page explains (offline.ts). Also for
        // page-loader.ts, whose fetch() of a page is not a navigation.
        const fallback = await caches.match(SAVED_PAGE, { cacheName: ASSETS_CACHE });
        if (fallback)
            return fallback;
        throw error;
    }
}
async function networkFirstAsset(request) {
    const cache = await caches.open(ASSETS_CACHE);
    try {
        const response = await fetch(request);
        if (response.ok)
            await cache.put(request, await storable(response.clone()));
        return response;
    }
    catch (error) {
        const cached = await cache.match(request);
        if (cached)
            return cached;
        throw error;
    }
}
// The Saved books page and what it needs, so that it can always be shown
async function cacheSavedPage() {
    const cache = await caches.open(ASSETS_CACHE);
    const response = await fetch(SAVED_PAGE, { cache: "no-cache" });
    if (!response.ok)
        return;
    const html = await response.clone().text();
    await cache.put(SAVED_PAGE, await storable(response));
    // Its stylesheet, script and icons, found in the page as the browser would
    const assets = new Set();
    for (const match of html.matchAll(/(?:href|src|data-icon-sprite)=["']?(\/(?:bundle|fonts)\/[^"' >]+)/g)) {
        assets.add(match[1]);
    }
    await Promise.all([...assets].map(asset => cacheFirst(new Request(asset)).catch(() => undefined)));
}
worker.addEventListener("install", (event) => {
    event.waitUntil(cacheSavedPage().catch(() => undefined).then(() => worker.skipWaiting()));
});
worker.addEventListener("activate", (event) => {
    event.waitUntil((async () => {
        for (const name of await caches.keys()) {
            if (name.startsWith("literature-") && !KNOWN_CACHES.includes(name))
                await caches.delete(name);
        }
        await worker.clients.claim();
    })());
});
worker.addEventListener("fetch", (event) => {
    const request = event.request;
    if (request.method !== "GET")
        return;
    const url = new URL(request.url);
    if (url.origin !== worker.location.origin)
        return;
    if (isAsset(url.pathname)) {
        event.respondWith(cacheFirst(request));
    }
    else if (url.pathname === SAVED_PAGE) {
        event.respondWith(networkFirstAsset(request));
    }
    else if (url.pathname === SEARCH_INDEX) {
        event.respondWith(networkFirstAsset(request));
    }
    else if (isPagePath(url.pathname) && url.pathname !== "/sw.js") {
        event.respondWith(networkFirst(event, request));
    }
});
// offline.ts asks for the Saved books page to be refreshed after a save
worker.addEventListener("message", (event) => {
    if (event.data === "cache-saved-page")
        event.waitUntil(cacheSavedPage().catch(() => undefined));
});
