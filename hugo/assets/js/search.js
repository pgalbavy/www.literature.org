// search.ts — the Search dialog: authors, books and named chapters.
// Compiled output: hugo/assets/js/search.js
//
// Opened by the search buttons (top bar and drawer, partials/topbar.html and
// header.html) or the "/" key. The index, /search-index.json
// (layouts/index.searchindex.json), is fetched the first time and searched
// here as the reader types: every word typed must begin a word of the
// entry (its title, or the author's name and pen names), ignoring case and
// accents, so "bronte jane" finds Jane Eyre. The service worker keeps a copy
// for offline use.
"use strict";
const SEARCH_INDEX_URL = "/search-index.json";
const SEARCH_MIN_LENGTH = 2;
const SEARCH_LIMITS = { author: 8, book: 25, chapter: 25 };
let searchEntries;
let searchDialog;
let searchOpener = null;
// "Brontë's" → "brontes": lower case, no accents or apostrophes, words
// separated by single spaces
function searchNormalize(text) {
    return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()
        .replace(/['’]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}
function loadSearchIndex() {
    searchEntries ?? (searchEntries = (async () => {
        const response = await fetch(SEARCH_INDEX_URL, { credentials: "same-origin" });
        if (!response.ok)
            throw new Error(`HTTP ${response.status}`);
        const index = await response.json();
        const entries = [];
        const bookCounts = new Map();
        index.b.forEach(([, , author]) => bookCounts.set(author, (bookCounts.get(author) ?? 0) + 1));
        index.a.forEach(([name, url, penNames], i) => {
            const books = bookCounts.get(i) ?? 0;
            const also = penNames.length ? ` · also known as ${penNames.join(", ")}` : "";
            entries.push({
                kind: "author", title: name, url,
                detail: `${books} ${books === 1 ? "book" : "books"}${also}`,
                key: searchNormalize(name),
                text: ` ${searchNormalize([name, ...penNames].join(" "))}`,
            });
        });
        index.b.forEach(([title, url, authorIndex]) => {
            const [author, , penNames] = index.a[authorIndex] ?? ["", "", []];
            entries.push({
                kind: "book", title, url, detail: author,
                key: searchNormalize(title),
                text: ` ${searchNormalize([title, author, ...penNames].join(" "))}`,
            });
        });
        index.c.forEach(([title, bookIndex, slug]) => {
            const [bookTitle, bookUrl, authorIndex] = index.b[bookIndex] ?? ["", "/", 0];
            const author = index.a[authorIndex]?.[0] ?? "";
            entries.push({
                kind: "chapter", title, url: bookUrl + slug,
                detail: author ? `${bookTitle} · ${author}` : bookTitle,
                key: searchNormalize(title),
                text: ` ${searchNormalize(`${title} ${bookTitle}`)}`,
            });
        });
        return entries;
    })());
    searchEntries.catch(() => { searchEntries = undefined; }); // try again next time
    return searchEntries;
}
function searchScore(entry, words, phrase) {
    for (const word of words) {
        if (!entry.text.includes(` ${word}`))
            return 0;
    }
    const key = ` ${entry.key}`;
    // A chapter must match by its own title, not only its book's: otherwise a
    // book's name lists every chapter of it
    if (entry.kind === "chapter" && !words.some(word => key.includes(` ${word}`)))
        return 0;
    let score = words.every(word => key.includes(` ${word}`)) ? 2 : 1; // else matched by author or book
    if (entry.key === phrase)
        score += 4;
    else if (entry.key.startsWith(phrase))
        score += 2;
    return score + (entry.kind === "author" ? 0.5 : entry.kind === "book" ? 0.3 : 0);
}
function searchMatches(entries, query) {
    const phrase = searchNormalize(query);
    const words = phrase.split(" ").filter(Boolean);
    const scored = new Map([["author", []], ["book", []], ["chapter", []]]);
    if (words.length) {
        for (const entry of entries) {
            const score = searchScore(entry, words, phrase);
            if (score > 0)
                scored.get(entry.kind).push({ entry, score });
        }
    }
    const results = new Map();
    for (const [kind, list] of scored) {
        list.sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title));
        results.set(kind, { entries: list.slice(0, SEARCH_LIMITS[kind]).map(item => item.entry), total: list.length });
    }
    return results;
}
// ── The dialog ─────────────────────────────────────────────────────────
const SEARCH_GROUPS = [
    ["author", "Authors", "person"],
    ["book", "Books", "menu_book"],
    ["chapter", "Chapters", "format_list_numbered"],
];
function searchElements() {
    const dialog = searchDialog;
    return {
        input: dialog.querySelector("#reader-search-input"),
        status: dialog.querySelector(".reader-search-status"),
        results: dialog.querySelector(".reader-search-results"),
    };
}
let searchRun = 0;
async function runSearch() {
    const { input, status, results } = searchElements();
    const query = input.value.trim();
    const run = ++searchRun;
    if (searchNormalize(query).length < SEARCH_MIN_LENGTH) {
        results.replaceChildren();
        status.textContent = "";
        return;
    }
    let entries;
    try {
        if (!searchEntries)
            status.textContent = "Loading…";
        entries = await loadSearchIndex();
    }
    catch (error) {
        console.error("Could not load the search index.", error);
        if (run === searchRun)
            status.textContent = "Search could not be loaded. Please check the connection and try again.";
        return;
    }
    if (run !== searchRun)
        return; // the reader has typed more meanwhile
    const matches = searchMatches(entries, query);
    const groups = [];
    let shown = 0;
    for (const [kind, heading, icon] of SEARCH_GROUPS) {
        const { entries: found, total } = matches.get(kind);
        if (!found.length)
            continue;
        shown += total;
        const group = document.createElement("section");
        group.className = "reader-search-group";
        const title = document.createElement("h3");
        title.textContent = total > found.length ? `${heading} (first ${found.length} of ${total})` : heading;
        const list = document.createElement("ul");
        for (const entry of found) {
            const item = document.createElement("li");
            const link = document.createElement("a");
            link.href = entry.url;
            link.className = "reader-search-result";
            link.innerHTML = iconMarkup(icon, "md-lit");
            const text = document.createElement("span");
            text.className = "reader-search-text";
            const name = document.createElement("span");
            name.className = "reader-search-title";
            name.textContent = entry.title;
            const detail = document.createElement("span");
            detail.className = "reader-search-detail";
            detail.textContent = entry.detail;
            text.append(name, detail);
            link.append(text);
            item.append(link);
            list.append(item);
        }
        group.append(title, list);
        groups.push(group);
    }
    results.replaceChildren(...groups);
    status.textContent = shown === 0 ? `Nothing found for “${query}”.` : `${shown} found.`;
}
function createSearchDialog() {
    const dialog = document.createElement("dialog");
    dialog.id = "reader-search";
    dialog.className = "reader-settings-dialog reader-search-dialog";
    dialog.setAttribute("aria-labelledby", "reader-search-title");
    dialog.innerHTML = `
    <div class="reader-settings-heading">
      <h2 id="reader-search-title">Search</h2>
      <button class="w3-button reader-search-close" type="button" aria-label="Close">${iconMarkup("close", "md-lit")}</button>
    </div>
    <form class="reader-search-form" role="search">
      <label class="reader-visually-hidden" for="reader-search-input">Search for authors, books and chapters</label>
      <input id="reader-search-input" type="search" placeholder="Authors, books and chapters" autocomplete="off" spellcheck="false" enterkeyhint="go">
    </form>
    <p class="reader-search-status" role="status" aria-live="polite"></p>
    <div class="reader-search-results"></div>`;
    document.body.append(dialog);
    searchDialog = dialog;
    const { input, results } = searchElements();
    input.addEventListener("input", () => { void runSearch(); });
    // Enter opens the first result
    dialog.querySelector("form").addEventListener("submit", event => {
        event.preventDefault();
        results.querySelector("a.reader-search-result")?.click();
    });
    // Up and down move between the input and the results
    dialog.addEventListener("keydown", event => {
        if (event.key !== "ArrowDown" && event.key !== "ArrowUp")
            return;
        const links = [...results.querySelectorAll("a.reader-search-result")];
        if (!links.length)
            return;
        const at = links.indexOf(document.activeElement);
        event.preventDefault();
        if (event.key === "ArrowDown")
            links[Math.min(at + 1, links.length - 1)].focus();
        else if (at <= 0)
            input.focus();
        else
            links[at - 1].focus();
    });
    dialog.addEventListener("click", event => {
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest(".reader-search-close")) {
            dialog.close();
            return;
        }
        // A result: page-loader.ts follows the link; the dialog gets out of the way
        if (target?.closest("a.reader-search-result")) {
            searchOpener = null;
            dialog.close();
            return;
        }
        if (target !== dialog)
            return;
        const bounds = dialog.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right ||
            event.clientY < bounds.top || event.clientY > bounds.bottom)
            dialog.close();
    });
    dialog.addEventListener("close", () => {
        if (searchOpener && searchOpener.offsetParent !== null)
            searchOpener.focus();
        searchOpener = null;
    });
    return dialog;
}
function openSearch(opener) {
    const dialog = searchDialog ?? createSearchDialog();
    if (dialog.open)
        return;
    searchOpener = opener;
    dialog.showModal();
    const { input } = searchElements();
    input.focus();
    input.select();
    void loadSearchIndex().catch(() => undefined); // ready by the time a word is typed
}
function initializeSearch() {
    document.addEventListener("click", event => {
        const button = event.target instanceof Element ? event.target.closest(".reader-search-toggle") : null;
        if (!button)
            return;
        event.preventDefault();
        openSearch(button);
    });
    // "/" opens search, unless typing somewhere or a dialog is open
    document.addEventListener("keydown", event => {
        if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey)
            return;
        const target = event.target;
        if (target?.closest("input, textarea, select, [contenteditable]") || document.querySelector("dialog[open]"))
            return;
        event.preventDefault();
        openSearch(null);
    });
}
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeSearch);
}
else {
    initializeSearch();
}
