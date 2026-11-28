// epub.ts — a book as an EPUB file, made in the browser. Compiled output:
// hugo/assets/js/epub.js (bundled after offline.js, whose BookInfo and
// fetchBookPage() it uses)
//
// Each chapter page is fetched (from the saved copy when the book is saved
// for offline reading), and the text of its <article> is copied into a
// clean XHTML file: only text elements (paragraphs, emphasis, quotations,
// lists and the like), no classes, scripts or site furniture. With a title
// page, the EPUB 3 contents (nav.xhtml), the EPUB 2 one (toc.ncx) for older
// readers, a small stylesheet and the package file, it is zipped and handed
// to the browser as a download. Reading apps style the text themselves.
"use strict";
const XHTML_NS = "http://www.w3.org/1999/xhtml";
const EPUB_NS = "http://www.idpf.org/2007/ops";
const EPUB_FETCH_CONCURRENCY = 4;
// Elements kept from a chapter; others are dropped (DROP) or replaced by
// their contents
const EPUB_KEEP = new Set(["p", "em", "strong", "i", "b", "u", "br", "hr", "blockquote", "q", "cite",
    "ul", "ol", "li", "dl", "dt", "dd", "h2", "h3", "h4", "h5", "h6", "sup", "sub", "small", "pre", "code",
    "abbr", "a", "div", "section", "table", "thead", "tbody", "tr", "th", "td"]);
const EPUB_DROP = new Set(["script", "style", "svg", "button", "nav", "form", "input", "select",
    "textarea", "img", "picture", "video", "audio", "iframe", "noscript", "template"]);
const EPUB_STYLE = `body { margin: 0 4%; line-height: 1.5; }
h1 { margin: 2em 0 1.5em; font-size: 1.4em; font-weight: normal; text-align: center; }
p { margin: 0 0 0.8em; }
blockquote { margin: 1em 2em; }
hr { margin: 1.5em 25%; border: 0; border-top: 1px solid; }
.title-page { margin-top: 20%; text-align: center; }
.title-page h1 { margin: 0 0 0.5em; font-size: 2em; }
.title-page .author { margin-bottom: 3em; font-size: 1.3em; }
.title-page .also { margin-top: -2em; margin-bottom: 3em; font-style: italic; }
.about { margin-top: 3em; font-size: 0.9em; }
.about h2 { font-size: 1.1em; font-weight: bold; }
.about dt { float: left; clear: left; width: 7em; font-weight: bold; }
.about dd { margin: 0 0 0.4em 7.5em; }
.about .links { clear: left; margin-top: 1em; }
nav ol { list-style: none; padding: 0; }
nav li { margin: 0.3em 0; }
`;
function xmlEscape(text) {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function chapterFile(index) {
    return `chapter-${String(index + 1).padStart(3, "0")}.xhtml`;
}
// ── XHTML ──────────────────────────────────────────────────────────────
function xhtmlDocument(title) {
    const doc = document.implementation.createDocument(XHTML_NS, "html", null);
    const html = doc.documentElement;
    html.replaceChildren(); // some DOMs add an empty head and body here
    html.setAttributeNS("http://www.w3.org/2000/xmlns/", "xmlns:epub", EPUB_NS);
    html.setAttribute("lang", "en");
    html.setAttributeNS("http://www.w3.org/XML/1998/namespace", "xml:lang", "en");
    const head = doc.createElementNS(XHTML_NS, "head");
    const titleElement = doc.createElementNS(XHTML_NS, "title");
    titleElement.textContent = title;
    const style = doc.createElementNS(XHTML_NS, "link");
    style.setAttribute("rel", "stylesheet");
    style.setAttribute("type", "text/css");
    style.setAttribute("href", "style.css");
    head.append(titleElement, style);
    const body = doc.createElementNS(XHTML_NS, "body");
    html.append(head, body);
    return { doc, body };
}
// XML knows no &nbsp;, which some serializers write for the poems' indents
function serializeXhtml(doc) {
    const xml = new XMLSerializer().serializeToString(doc).replace(/&nbsp;/g, "&#160;");
    return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n${xml}\n`;
}
function xhtmlElement(doc, name, text, attributes = {}) {
    const element = doc.createElementNS(XHTML_NS, name);
    for (const [key, value] of Object.entries(attributes))
        element.setAttribute(key, value);
    if (text !== undefined)
        element.textContent = text;
    return element;
}
// Copies a chapter's nodes into the XHTML document, keeping only text
// elements. Links to other chapters of the book point to their files; other
// links to the site become full addresses.
function copyChapterNodes(source, target, doc, base, chapterFiles) {
    for (const node of source.childNodes) {
        if (node.nodeType === Node.TEXT_NODE) {
            target.append(doc.createTextNode(node.textContent ?? ""));
            continue;
        }
        if (node.nodeType !== Node.ELEMENT_NODE)
            continue;
        const element = node;
        const name = element.localName.toLowerCase();
        if (EPUB_DROP.has(name) || element.hasAttribute("hidden") || element.getAttribute("aria-hidden") === "true")
            continue;
        if (!EPUB_KEEP.has(name)) {
            copyChapterNodes(element, target, doc, base, chapterFiles);
            continue;
        }
        const copy = doc.createElementNS(XHTML_NS, name);
        if (name === "a") {
            const href = element.getAttribute("href");
            if (href) {
                try {
                    const url = new URL(href, base);
                    const file = chapterFiles.get(url.origin + url.pathname.replace(/\.html$/, ""));
                    if (file)
                        copy.setAttribute("href", file + (url.hash ?? ""));
                    else if (/^https?:$/.test(url.protocol))
                        copy.setAttribute("href", url.href);
                }
                catch (_) { /* a link that is not an address: keep the text */ }
            }
        }
        copyChapterNodes(element, copy, doc, base, chapterFiles);
        target.append(copy);
    }
}
// A chapter's XHTML, and how many words it has (for the title page)
function chapterXhtml(html, chapter, chapterFiles) {
    const page = new DOMParser().parseFromString(html, "text/html");
    const article = page.querySelector("body > article");
    if (!article)
        throw new Error(`${chapter.url}: no chapter text`);
    // The site's own heading is replaced by the one in the contents
    article.querySelector("h1")?.remove();
    const { doc, body } = xhtmlDocument(chapter.title);
    const section = xhtmlElement(doc, "section");
    section.setAttributeNS(EPUB_NS, "epub:type", "chapter");
    section.append(xhtmlElement(doc, "h1", chapter.title));
    copyChapterNodes(article, section, doc, new URL(chapter.url), chapterFiles);
    body.append(section);
    const words = (article.textContent ?? "").split(/\s+/).filter(word => /[\p{L}\p{N}]/u.test(word)).length;
    return { xhtml: serializeXhtml(doc), words };
}
function formatEpubDate(date) {
    return date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}
// The title page, then what the Info dialog says about the book and its
// author (partials/info-book.html, info-author.html), with its size
function titlePageXhtml(book, stats) {
    const { doc, body } = xhtmlDocument(book.title);
    const title = xhtmlElement(doc, "section", undefined, { class: "title-page" });
    title.setAttributeNS(EPUB_NS, "epub:type", "titlepage");
    title.append(xhtmlElement(doc, "h1", book.title));
    if (book.author)
        title.append(xhtmlElement(doc, "p", book.author, { class: "author" }));
    if (book.penNames?.length)
        title.append(xhtmlElement(doc, "p", `also known as ${book.penNames.join(", ")}`, { class: "also" }));
    body.append(title);
    const about = xhtmlElement(doc, "section", undefined, { class: "about" });
    about.append(xhtmlElement(doc, "h2", "About this book"));
    const details = xhtmlElement(doc, "dl");
    const detail = (term, ...values) => {
        const dd = xhtmlElement(doc, "dd");
        dd.append(...values);
        details.append(xhtmlElement(doc, "dt", term), dd);
    };
    const link = (text, href) => xhtmlElement(doc, "a", text, { href });
    if (book.year)
        detail("Published", book.year);
    detail("Chapters", String(book.chapters.length));
    if (stats.words) {
        // About 250 words a minute
        const hours = stats.words / 250 / 60;
        const reading = hours < 1 ? `about ${Math.max(1, Math.round(hours * 60))} minutes` :
            `about ${Math.round(hours)} ${Math.round(hours) === 1 ? "hour" : "hours"}`;
        detail("Words", `${stats.words.toLocaleString("en-GB")} (${reading} of reading)`);
    }
    if (book.source) {
        const gutenberg = /gutenberg\.org\//.test(book.source);
        detail("Source text", link(gutenberg ? "Project Gutenberg" : new URL(book.source).host, book.source));
    }
    if (book.updated)
        detail("Last updated", formatEpubDate(new Date(book.updated)));
    detail("Read online", link(book.canonicalUrl.replace(/^https?:\/\//, "").replace(/\/$/, ""), book.canonicalUrl));
    detail("This EPUB", `made ${formatEpubDate(stats.made)} at literature.org`);
    about.append(details);
    // Links, as in the Info dialog
    const links = (name, list) => {
        if (!list?.length)
            return;
        const p = xhtmlElement(doc, "p", `More about ${name}: `, { class: "links" });
        list.forEach((item, index) => {
            if (index)
                p.append(doc.createTextNode(" · "));
            p.append(link(item.label, item.href));
        });
        about.append(p);
    };
    links(book.author, book.authorLinks);
    links(book.title, book.bookLinks);
    body.append(about);
    return serializeXhtml(doc);
}
function navXhtml(book) {
    const { doc, body } = xhtmlDocument("Contents");
    const nav = xhtmlElement(doc, "nav", undefined, { id: "toc" });
    nav.setAttributeNS(EPUB_NS, "epub:type", "toc");
    nav.append(xhtmlElement(doc, "h1", "Contents"));
    const list = xhtmlElement(doc, "ol");
    book.chapters.forEach((chapter, index) => {
        const item = xhtmlElement(doc, "li");
        item.append(xhtmlElement(doc, "a", chapter.title, { href: chapterFile(index) }));
        list.append(item);
    });
    nav.append(list);
    body.append(nav);
    return serializeXhtml(doc);
}
function tocNcx(book, identifier) {
    const points = book.chapters.map((chapter, index) => `    <navPoint id="nav-${index + 1}" playOrder="${index + 1}">
      <navLabel><text>${xmlEscape(chapter.title)}</text></navLabel>
      <content src="${chapterFile(index)}"/>
    </navPoint>`).join("\n");
    return `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1" xml:lang="en">
  <head>
    <meta name="dtb:uid" content="${xmlEscape(identifier)}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>${xmlEscape(book.title)}</text></docTitle>
  <navMap>
${points}
  </navMap>
</ncx>
`;
}
function packageOpf(book, identifier) {
    const modified = (book.updated && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(book.updated)
        ? book.updated : new Date().toISOString().replace(/\.\d+Z$/, "Z"));
    const metadata = [
        `<dc:identifier id="book-id">${xmlEscape(identifier)}</dc:identifier>`,
        `<dc:title>${xmlEscape(book.title)}</dc:title>`,
        ...(book.author ? [
            `<dc:creator id="author">${xmlEscape(book.author)}</dc:creator>`,
            `<meta refines="#author" property="file-as">${xmlEscape(book.authorFileAs || book.author)}</meta>`,
            `<meta refines="#author" property="role" scheme="marc:relators">aut</meta>`,
        ] : []),
        `<dc:language>en</dc:language>`,
        `<dc:publisher>literature.org</dc:publisher>`,
        ...(book.year && /^\d{4}$/.test(book.year) ? [`<dc:date>${book.year}</dc:date>`] : []),
        ...(book.source ? [`<dc:source>${xmlEscape(book.source)}</dc:source>`] : []),
        `<meta property="dcterms:modified">${modified}</meta>`,
    ];
    const items = [
        `<item id="title-page" href="title.xhtml" media-type="application/xhtml+xml"/>`,
        `<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>`,
        `<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>`,
        `<item id="style" href="style.css" media-type="text/css"/>`,
        ...book.chapters.map((_, index) => `<item id="chapter-${index + 1}" href="${chapterFile(index)}" media-type="application/xhtml+xml"/>`),
    ];
    const spine = [
        `<itemref idref="title-page"/>`,
        ...book.chapters.map((_, index) => `<itemref idref="chapter-${index + 1}"/>`),
    ];
    return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id" xml:lang="en">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    ${metadata.join("\n    ")}
  </metadata>
  <manifest>
    ${items.join("\n    ")}
  </manifest>
  <spine toc="ncx">
    ${spine.join("\n    ")}
  </spine>
</package>
`;
}
const CONTAINER_XML = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/package.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
`;
// The same book always gets the same identifier, so reading apps treat a
// new download as the same book: a name-based UUID from its address
async function bookIdentifier(url) {
    let bytes;
    try {
        bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(url)));
    }
    catch (_) {
        bytes = new Uint8Array(16);
        for (let i = 0; i < url.length; i++)
            bytes[i % 16] = (bytes[i % 16] * 31 + url.charCodeAt(i)) & 255;
    }
    bytes[6] = (bytes[6] & 0x0f) | 0x50; // version 5 style (name-based)
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes.slice(0, 16)].map(b => b.toString(16).padStart(2, "0")).join("");
    return `urn:uuid:${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
let crcTable;
function crc32(data) {
    if (!crcTable) {
        crcTable = new Uint32Array(256);
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++)
                c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
            crcTable[n] = c >>> 0;
        }
    }
    let crc = 0xffffffff;
    for (let i = 0; i < data.length; i++)
        crc = crcTable[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
}
async function deflateRaw(data) {
    if (typeof CompressionStream !== "function")
        return null;
    try {
        const stream = new Blob([data]).stream().pipeThrough(new CompressionStream("deflate-raw"));
        return new Uint8Array(await new Response(stream).arrayBuffer());
    }
    catch (_) {
        return null; // this browser has no raw deflate: store instead
    }
}
async function zipFiles(files) {
    const now = new Date();
    const time = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
    const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    const parts = [];
    const central = [];
    let centralSize = 0;
    let offset = 0;
    for (const file of files) {
        const name = new TextEncoder().encode(file.name);
        const crc = crc32(file.data);
        const deflated = file.store ? null : await deflateRaw(file.data);
        const useDeflate = deflated !== null && deflated.length < file.data.length;
        const body = useDeflate ? deflated : file.data;
        const method = useDeflate ? 8 : 0;
        const local = new DataView(new ArrayBuffer(30));
        local.setUint32(0, 0x04034b50, true);
        local.setUint16(4, 20, true); // version needed
        local.setUint16(6, 0x0800, true); // names are UTF-8
        local.setUint16(8, method, true);
        local.setUint16(10, time, true);
        local.setUint16(12, date, true);
        local.setUint32(14, crc, true);
        local.setUint32(18, body.length, true);
        local.setUint32(22, file.data.length, true);
        local.setUint16(26, name.length, true);
        local.setUint16(28, 0, true);
        parts.push(local.buffer, name, body);
        const entry = new DataView(new ArrayBuffer(46));
        entry.setUint32(0, 0x02014b50, true);
        entry.setUint16(4, 20, true); // version made by
        entry.setUint16(6, 20, true); // version needed
        entry.setUint16(8, 0x0800, true);
        entry.setUint16(10, method, true);
        entry.setUint16(12, time, true);
        entry.setUint16(14, date, true);
        entry.setUint32(16, crc, true);
        entry.setUint32(20, body.length, true);
        entry.setUint32(24, file.data.length, true);
        entry.setUint16(28, name.length, true);
        entry.setUint32(42, offset, true); // where its local header is
        central.push(entry.buffer, name);
        centralSize += 46 + name.length;
        offset += 30 + name.length + body.length;
    }
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, centralSize, true);
    end.setUint32(16, offset, true);
    return new Blob([...parts, ...central, end.buffer], { type: "application/epub+zip" });
}
// ── Making and downloading ─────────────────────────────────────────────
async function makeEpub(book, report) {
    if (book.chapters.length === 0)
        throw new Error("The book has no chapters");
    const chapterFiles = new Map();
    book.chapters.forEach((chapter, index) => {
        const url = new URL(chapter.url);
        chapterFiles.set(url.origin + url.pathname.replace(/\.html$/, ""), chapterFile(index));
    });
    const texts = new Array(book.chapters.length);
    let next = 0;
    let done = 0;
    let words = 0;
    report(`Making the EPUB: chapter 0 of ${book.chapters.length}…`);
    const fetcher = async () => {
        while (next < book.chapters.length) {
            const index = next++;
            const chapter = book.chapters[index];
            const converted = chapterXhtml(await fetchBookPage(chapter.url), chapter, chapterFiles);
            texts[index] = converted.xhtml;
            words += converted.words;
            report(`Making the EPUB: chapter ${++done} of ${book.chapters.length}…`);
        }
    };
    await Promise.all(Array.from({ length: Math.min(EPUB_FETCH_CONCURRENCY, book.chapters.length) }, fetcher));
    const identifier = await bookIdentifier(book.canonicalUrl);
    const encode = (text) => new TextEncoder().encode(text);
    return zipFiles([
        { name: "mimetype", data: encode("application/epub+zip"), store: true },
        { name: "META-INF/container.xml", data: encode(CONTAINER_XML) },
        { name: "OEBPS/package.opf", data: encode(packageOpf(book, identifier)) },
        { name: "OEBPS/nav.xhtml", data: encode(navXhtml(book)) },
        { name: "OEBPS/toc.ncx", data: encode(tocNcx(book, identifier)) },
        { name: "OEBPS/style.css", data: encode(EPUB_STYLE) },
        { name: "OEBPS/title.xhtml", data: encode(titlePageXhtml(book, { words, made: new Date() })) },
        ...texts.map((text, index) => ({ name: `OEBPS/${chapterFile(index)}`, data: encode(text) })),
    ]);
}
function epubFileName(book) {
    const name = book.author ? `${book.title} - ${book.author}` : book.title;
    return `${name.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim()}.epub`;
}
async function downloadEpub(book, report) {
    const blob = await makeEpub(book, report);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = epubFileName(book);
    link.hidden = true;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    report(`EPUB downloaded: ${link.download} (${(blob.size / 1024).toFixed(0)} KB).`);
}
