// functions to create a epub from template files
"use strict";

class EPub {
	tmplFiles = [{
		source: "/templates/epub/META-INF/container.xml",
		path: "META-INF/container.xml",
		mimetype: 'text/xml'
	},
	{
		source: "/css/literature.css",
		path: "EPUB/css/literature.css",
		mimetype: 'text/css'
	},
	{
		source: "/css/w3.css",
		path: "EPUB/css/w3.css",
		mimetype: 'text/css'
	},
	{
		source: "/css/icon.css",
		path: "EPUB/css/icon.css",
		mimetype: 'text/css'
	},
	{
		source: "/fonts/karla-v13-latin-regular.woff",
		path: "EPUB/fonts/karla-v13-latin-regular.woff",
		mimetype: 'application/font-woff'
	},
	{
		source: "/fonts/karla-v13-latin-regular.woff2",
		path: "EPUB/fonts/karla-v13-latin-regular.woff2",
		mimetype: 'application/octet-stream'
	},
	{
		source: "/fonts/open-sans-v17-latin-regular.woff",
		path: "EPUB/fonts/open-sans-v17-latin-regular.woff",
		mimetype: 'application/font-woff'
	},
	{
		source: "/fonts/open-sans-v17-latin-regular.woff2",
		path: "EPUB/fonts/open-sans-v17-latin-regular.woff2",
		mimetype: 'application/octet-stream'
	},
	];

	constructor(contents) {
		this.zip = new JSZip();
		this.contents = contents;

		// mimetype must be the first file in the ZIP
		this.zip.file("mimetype", "application/epub+zip");
		for (let file of this.tmplFiles) {
			let text = fetchAsText(file.source);
			this.zip.file(file.path, text);
		}
		for (let chapter of this.contents.chapters) {
			let html = fetchAsHTML(chapter.href)
				.then(html => Include(html))
				// override default visibility, as reveal JS doesn't run
				.then(html => { html.body.style.display = 'block'; return html })
				.then(html => {
					let article = html.body.getElementsByTagName('article')[0];
					// console.log(article);
					prependElement(document, article, 'h1', chapter.title);
					return html;
				})
				// strip absolute path for CSS, however paths inside CSS to fonts are already relative
				.then(html => html.documentElement.outerHTML.replaceAll('/css/', 'css/').replaceAll('/js/', 'js/'))
				// create an XHTML file, which is what EPUB3 requires
				.then(text => { let doc = new DOMParser().parseFromString(text, 'text/html'); return new XMLSerializer().serializeToString(doc); })
			this.zip.file(`EPUB/${chapter.href}`, html);
		}
	}

	async CreatePackage(pageurl, path) {
		// namespace is added after xslt to prettify output
		// let opf = document.implementation.createDocument('http://www.idpf.org/2007/opf', 'package', null);
		let opf = document.implementation.createDocument(null, 'package', null);
		let doc = opf.documentElement;
		doc.setAttribute('version', '3.0');
		doc.setAttribute('unique-identifier', 'pub-id');
		doc.setAttribute('xml:lang', 'en-US');

		let metadata = opf.createElement('metadata');
		metadata.setAttribute('xmlns:dc', 'http://purl.org/dc/elements/1.1/');

		let uuid = await uuidFromHash(location);

		appendElement(opf, metadata, 'dc:identifier', `urn:uuid:${uuid}`, [['id', 'pub-id']]);
		if (this.contents.lastmodified !== undefined) {
			appendElement(metadata, 'meta', this.contents.lastmodified, [['property', 'dcterms:modified']])
		}
		appendElement(opf, metadata, 'dc:title', this.contents.title);
		appendElement(opf, metadata, 'dc:creator', this.contents.author);
		appendElement(opf, metadata, 'dc:source', pageurl);
		appendElement(opf, metadata, 'dc:source', this.contents.source);
		appendElement(opf, metadata, 'dc:language', 'en');
		appendElement(opf, metadata, 'dc:publisher', 'https://www.literature.org');
		appendElement(opf, metadata, 'dc:date', new Date().toISOString());

		let manifest = opf.createElement('manifest');
		for (let file of this.tmplFiles) {
			if (file.path.startsWith('META-INF/')) {
				continue;
			}
			appendElement(opf, manifest, 'item', null, [
				['id', file.path.split('/').reverse()[0]],
				['href', file.path.replace('EPUB/', '')],
				['media-type', file.mimetype]
			])
		}
		// add css, fonts, toc etc.
		this.CreateTOC('EPUB/toc.html');
		appendElement(opf, manifest, 'item', null, [
			['id', 'toc'],
			['properties', 'nav'],
			['href', 'toc.html'],
			['media-type', 'application/xhtml+xml']
		]);

		let spine = opf.createElement('spine');

		for (let chapter of this.contents.chapters) {
			appendElement(opf, manifest, 'item', null, [
				['id', chapter.href],
				['href', chapter.href],
				['media-type', 'application/xhtml+xml']
			])

			appendElement(opf, spine, 'itemref', null, [
				['idref', chapter.href],
				['linear', 'yes']
			])
		}

		doc.appendChild(metadata);
		doc.appendChild(manifest);
		doc.appendChild(spine);

		let text = prettifyXml(doc, 'http://www.idpf.org/2007/opf');
		this.zip.file(path, '<?xml version="1.0" encoding="UTF-8"?>\n' + text);
	}

	CreateTOC(path) {
		let toc = document.implementation.createHTMLDocument(this.contents.title);
		toc.documentElement.setAttribute('xmlns:epub', "http://www.idpf.org/2007/ops");
		let body = toc.createElement('body');
		toc.documentElement.appendChild(body);

		let section = appendElement(toc, body, 'section', null, [
			['epub:type', 'frontmatter toc']
		]);
		let header = appendElement(toc, section, 'header', null);
		appendElement(toc, header, 'h1', 'Contents');
		let nav = appendElement(toc, section, 'nav', null, [
			['xmlns:epub', "http://www.idpf.org/2007/ops"],
			['epub:type', 'toc'],
			['id', 'toc']
		])
		let ol = appendElement(toc, nav, 'ol', null);
		for (let chapter of this.contents.chapters) {
			let li = appendElement(toc, ol, 'li', null, [
				['class', 'toc'],
				['id', chapter.href]
			]);
			appendElement(toc, li, 'a', chapter.title, [
				['href', chapter.href],
				['class', 'w3-bar-item w3-button litleft']
			])
		}

		this.zip.file(path, '<?xml version="1.0" encoding="UTF-8"?>\n' + prettifyXHTML(toc));
	}

	DownloadEPub() {
		return this.zip.generateAsync({
			type: 'blob',
			mimeType: 'application/epub+zip',
			compression: 'DEFLATE'
		});
	}
}

async function uuidFromHash(message) {
	let h = await digestMessage(message);
	return h.substr(0, 8) + '-' + h.substr(7, 4) + '-4' + h.substr(11, 3) + '-8' + h.substr(14, 3) + '-' + h.substr(17, 12);
}

async function digestMessage(message) {
	const msgUint8 = new TextEncoder().encode(message);                           // encode as (utf-8) Uint8Array
	const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);           // hash the message
	const hashArray = Array.from(new Uint8Array(hashBuffer));                     // convert buffer to byte array
	const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join(''); // convert bytes to hex string
	return hashHex;
}

// from https://stackoverflow.com/a/47317538
function prettifyXml(doc, ns) {
	var xsltDoc = new DOMParser().parseFromString([
		// describes how we want to modify the XML - indent everything
		`<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
			<xsl:output omit-xml-declaration="no" indent="yes" method="xml"/>
			<xsl:template match="/">
				<xsl:copy-of select="@*|node()"/>
			</xsl:template>
			<xsl:template match="@*">
				<xsl:attribute name="{name()}" namespace="{namespace-uri()}">
					some new value here
				</xsl:attribute>
			</xsl:template>
		</xsl:stylesheet>`,
	].join('\n'), 'application/xml');

	var xsltProcessor = new XSLTProcessor();
	xsltProcessor.importStylesheet(xsltDoc);
	var resultDoc = xsltProcessor.transformToDocument(doc);
	resultDoc.documentElement.setAttribute('xmlns', ns);
	var resultXml = new XMLSerializer().serializeToString(resultDoc);
	return resultXml;
};

function prettifyXHTML(doc) {
	var xsltDoc = new DOMParser().parseFromString([
		`<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
			<xsl:output omit-xml-declaration="yes" indent="yes" method="html"/>
			<xsl:template match="node()|@*">
				<xsl:copy>
					<xsl:apply-templates select="node()|@*"/>
				</xsl:copy>
			</xsl:template>
		</xsl:stylesheet>`,
	].join('\n'), 'application/xml');

	var xsltProcessor = new XSLTProcessor();
	xsltProcessor.importStylesheet(xsltDoc);
	var resultDoc = xsltProcessor.transformToDocument(doc);
	var resultXml = new XMLSerializer().serializeToString(resultDoc);
	return resultXml;
};
