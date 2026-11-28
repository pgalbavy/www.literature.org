// Share cards (og:image) for social media link previews: one for the site,
// one per author and one per book, 1200x630 PNG, written to
// hugo/static/images/og/ (site.png, <author>.png, <author>/<book>.png).
// Chapters use their book's card (hugo/layouts/partials/head.html).
//
// Cloudflare's build runs Hugo only, so the PNGs are committed. Run after
// adding, removing or renaming authors or books:
//
//   cd tools/og-cards && bun install && bun og-cards.ts
//
// A card is only rewritten when its image changes, and cards for authors or
// books that no longer exist are deleted. Readers never download these: only
// the preview crawlers of social sites fetch og:image.

import { Resvg } from "@resvg/resvg-js";
import { decompress } from "wawoff2";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join, relative } from "path";

const hugo = join(import.meta.dir, "../../hugo");
const contentDir = join(hugo, "content/authors");
const outDir = join(hugo, "static/images/og");

// resvg reads TTF/OTF only, so unpack the site's Literata woff2 files
const fontTmp = mkdtempSync(join(tmpdir(), "og-cards-"));
const fontFiles: string[] = [];
for (const f of ["literata-latin-700-normal", "literata-latin-400-italic"]) {
  const path = join(fontTmp, `${f}.ttf`);
  writeFileSync(path, await decompress(readFileSync(join(hugo, "static/fonts", `${f}.woff2`))));
  fontFiles.push(path);
}
const fontOptions = { fontFiles, loadSystemFonts: false };

const teal = "#00796b", dark = "#004d40", paper = "#f7f3ea", ink = "#1b1b1b";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Width in pixels of one line of text, measured by resvg itself
const widths = new Map<string, number>();
function measure(text: string, size: number, attrs: string): number {
  const key = `${size}|${attrs}|${text}`;
  let w = widths.get(key);
  if (w === undefined) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="4000" height="300"><text x="0" y="200" font-family="Literata" font-size="${size}" ${attrs}>${esc(text)}</text></svg>`;
    w = new Resvg(svg, { font: fontOptions }).getBBox()?.width ?? 0;
    widths.set(key, w);
  }
  return w;
}

// Wrap greedily at the largest size that fits in maxLines; at the smallest
// size, cut the last line short with an ellipsis
function fit(text: string, width: number, sizes: number[], maxLines: number, attrs: string) {
  const words = text.split(/\s+/);
  for (const size of sizes) {
    const lines: string[] = [];
    let cur = "";
    for (const word of words) {
      const next = cur ? `${cur} ${word}` : word;
      if (cur && measure(next, size, attrs) > width) { lines.push(cur); cur = word; } else cur = next;
    }
    lines.push(cur);
    if (lines.length <= maxLines) return { size, lines };
    if (size === sizes[sizes.length - 1]) {
      const kept = lines.slice(0, maxLines);
      let last = `${kept[maxLines - 1]} ${lines[maxLines]}`;
      while (last.includes(" ") && measure(`${last}…`, size, attrs) > width) last = last.slice(0, last.lastIndexOf(" "));
      kept[maxLines - 1] = `${last.replace(/[,;:.]$/, "")}…`;
      return { size, lines: kept };
    }
  }
  throw new Error("unreachable");
}

// Names are stored as "Jane AUSTEN"; cards show "Jane Austen"
const nameExceptions: Record<string, string> = { MCKISHNIE: "McKishnie" };
const displayName = (s: string) =>
  s.split(" ").map((w) => {
    if (nameExceptions[w]) return nameExceptions[w];
    return /^\p{Lu}{2,}$/u.test(w) ? w[0] + w.slice(1).toLowerCase() : w;
  }).join(" ");

const bookIcon = (x: number, y: number, s: number) => `
<g transform="translate(${x} ${y}) scale(${s})">
  <path d="M150 60 C110 30 50 22 0 30 L0 280 C50 272 110 280 150 310 Z" fill="${teal}"/>
  <path d="M150 60 C190 30 250 22 300 30 L300 280 C250 272 190 280 150 310 Z" fill="${dark}"/>
  <g stroke="${paper}" stroke-width="7" stroke-linecap="round" fill="none" opacity="0.85">
    ${[80, 115, 150, 185, 220].map((y) => `<path d="M30 ${y} C70 ${y - 8} 105 ${y - 4} 128 ${y + 10}"/><path d="M270 ${y} C230 ${y - 8} 195 ${y - 4} 172 ${y + 10}"/>`).join("")}
  </g>
  <path d="M150 60 L150 310" stroke="${paper}" stroke-width="6"/>
</g>`;

const svgOpen = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><rect width="1200" height="630" fill="${paper}"/>`;

function siteCard(): string {
  return `${svgOpen}
<rect y="600" width="1200" height="30" fill="${teal}"/>
${bookIcon(110, 165, 1)}
<text x="490" y="320" font-family="Literata" font-weight="700" font-size="92" fill="${ink}">literature.org</text>
<text x="494" y="395" font-family="Literata" font-style="italic" font-size="40" fill="${dark}">Classic works of English literature,</text>
<text x="494" y="447" font-family="Literata" font-style="italic" font-size="40" fill="${dark}">free to read online</text>
</svg>`;
}

// Author or book: the name or title in bold with an italic line beneath
function card(main: string, sub: string): string {
  const X = 450, W = 690, subSize = 38, gap = 30;
  const bold = `font-weight="700"`, italic = `font-style="italic"`;
  const { size, lines } = fit(main, W, [88, 76, 66, 58, 50, 44], 4, bold);
  const subLine = fit(sub, W, [subSize], 1, italic).lines[0];
  const lh = size * 1.15;
  const blockH = lines.length * lh + gap + subSize;
  const y = 300 - blockH / 2 + size * 0.8;
  const title = lines.map((l, i) => `<text x="${X}" y="${(y + i * lh).toFixed(1)}" font-family="Literata" ${bold} font-size="${size}" fill="${ink}">${esc(l)}</text>`).join("");
  const sy = y + (lines.length - 1) * lh + gap + subSize + 8;
  return `${svgOpen}
${bookIcon(90, 175, 0.95)}
${title}
<text x="${X + 2}" y="${sy.toFixed(1)}" font-family="Literata" ${italic} font-size="${subSize}" fill="${dark}">${esc(subLine)}</text>
<rect y="570" width="1200" height="60" fill="${teal}"/>
<text x="1140" y="611" text-anchor="end" font-family="Literata" ${bold} font-size="30" fill="${paper}">literature.org</text>
</svg>`;
}

// Front matter fields used here are double-quoted YAML scalars, which read as JSON strings
function frontMatter(path: string, key: string): string | undefined {
  const m = readFileSync(path, "utf8").match(new RegExp(`^${key}:\\s*(".*")\\s*$`, "m"));
  return m ? JSON.parse(m[1]) : undefined;
}

const isDir = (p: string) => statSync(p).isDirectory();
const wanted = new Map<string, string>(); // output path -> svg
wanted.set(join(outDir, "site.png"), siteCard());

for (const author of readdirSync(contentDir).filter((d) => isDir(join(contentDir, d))).sort()) {
  const authorIndex = join(contentDir, author, "_index.md");
  if (!existsSync(authorIndex)) continue;
  const authorName = frontMatter(authorIndex, "title") ?? author;
  const books = readdirSync(join(contentDir, author))
    .filter((d) => isDir(join(contentDir, author, d)) && existsSync(join(contentDir, author, d, "_index.md")))
    .sort();
  wanted.set(join(outDir, `${author}.png`),
    card(displayName(authorName), `${books.length} ${books.length === 1 ? "book" : "books"} · free to read online`));
  for (const book of books) {
    const bookIndex = join(contentDir, author, book, "_index.md");
    const title = frontMatter(bookIndex, "title") ?? book;
    const byline = frontMatter(bookIndex, "book_author") ?? authorName;
    wanted.set(join(outDir, author, `${book}.png`), card(title, `by ${displayName(byline)}`));
  }
}

let written = 0, removed = 0;
for (const [path, svg] of wanted) {
  const png = new Resvg(svg, { font: fontOptions }).render().asPng();
  if (existsSync(path) && Buffer.compare(readFileSync(path), png) === 0) continue;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, png);
  written++;
}

// Remove cards for authors and books that are gone
function prune(dir: string) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (isDir(p)) {
      prune(p);
      if (readdirSync(p).length === 0) rmSync(p, { recursive: true });
    } else if (!wanted.has(p)) {
      rmSync(p);
      removed++;
    }
  }
}
prune(outDir);
rmSync(fontTmp, { recursive: true });

console.log(`${wanted.size} cards: ${written} written, ${wanted.size - written} unchanged, ${removed} removed (${relative(process.cwd(), outDir)})`);
