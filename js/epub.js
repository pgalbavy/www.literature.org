// functions to create a epub from template files
"use strict";


class EPub {
	tmplFiles = [{
			source: "/templates/epub/META-INF/container.xml",
			path: "META-INF/container.xml"
		},
		{
			source: "/css/literature.css",
			path: "EPUB/css/literature.css"
		},
		{
			source: "/css/w3.css",
			path: "EPUB/css/w3.css"
		},
		{
			source: "/css/icon.css",
			path: "EPUB/css/icon.css"
		},
		{
			source: "/fonts/karla-v13-latin-regular.woff",
			path: "EPUB/fonts/karla-v13-latin-regular.woff"
		},
		{
			source: "/fonts/karla-v13-latin-regular.woff2",
			path: "EPUB/fonts/karla-v13-latin-regular.woff2"
		},
		{
			source: "/fonts/open-sans-v17-latin-regular.woff",
			path: "EPUB/fonts/open-sans-v17-latin-regular.woff"
		},
		{
			source: "/fonts/open-sans-v17-latin-regular.woff2",
			path: "EPUB/fonts/open-sans-v17-latin-regular.woff2"
		},
	];

	constructor(contents) {
		this.zip = new JSZip();
		this.contents = contents;
		// this.chapters = chapters;

		this.zip.file("mimetype", "application/epub+zip");
		for (let file of this.tmplFiles) {
			fetchAsText(file.source).then(text => this.zip.file(file.path, text));
		}
		for (let chapter of this.contents.chapters) {
			let text = fetchAsHTML(chapter.href).then(html => Include(html))
					   .then(html => html.body.outerHTML.replaceAll('/css/', 'css/').replaceAll('/js/', 'js/'));
			this.zip.file(chapter.href, text);
			// this.chapters.push(chapter);
		}
	}

	AddChapter(chapter, text) {
		this.zip.file(chapter.href, text);
		// add c.title to index
		this.chapters.push(chapter);
	}

	CreateOPF() {
		let opf = document.implementation.createDocument('http://www.idpf.org/2007/opf', 'package', null);
		let doc = opf.documentElement;
		doc.setAttribute('version', '3.0');
		doc.setAttribute('unique-identifiers', 'uid');
		doc.setAttribute('xml:lang', 'en-US');
		doc.setAttribute('prefix', 'blah');

		let metadata = opf.createElement('metadata');
		metadata.setAttribute('xmlns:dc', 'http://purl.org/dc/elements/1.1/');

		let title = opf.createElement('dc:title')
		title.innerHTML = this.contents.title;
		metadata.appendChild(title);

		let author = opf.createElement('dc:creator');
		author.innerHTML = this.contents.author;
		metadata.appendChild(author);

		let source = opf.createElement('dc:source')
		source.innerHTML = this.contents.source;
		metadata.appendChild(source);

		let manifest = opf.createElement('manifest');
		// add toc etc.
		let spine = opf.createElement('spine');

		for (let chapter of this.contents.chapters) {
			let item = opf.createElement('item');
			item.setAttribute('id', chapter.href);
			item.setAttribute('href', chapter.href);
			item.setAttribute('media-type', 'application/xhtml+xml');
			manifest.appendChild(item);

			let itemref = opf.createElement('itemref');
			itemref.setAttribute('itemref', chapter.href);
			itemref.setAttribute('linear', 'yes');
			spine.appendChild(itemref);

		}

		opf.documentElement.appendChild(metadata);
		opf.documentElement.appendChild(manifest);
		opf.documentElement.appendChild(spine);
		console.log(opf.documentElement);
	}
}

async function epubOPF(title, author, url) {
	let opf = await fetchAsXML("/templates/epub/EPUB/book.opf");

	if (opf.parseError && opf.parseError.errorCode != 0) {
		errorMsg = "XML Parsing Error: " + opf.parseError.reason +
			" at line " + opf.parseError.line +
			" at position " + opf.parseError.linepos;
		console.log(errorMsg)
	}

	console.log(opf.documentElement.innerHTML);
	let nodes = opf.evaluate("/package/metadata", opf.documentElement, null, XPathResult.ANY_TYPE, null);
	// console.log(nodes.snapshotLength);
	let node;
	while (node = nodes.iterateNext()) {
		console.log(node)
		//node = nodes.iterateNext();
	}

	return opf;
}


async function epubAddFiles(blob) {
	const jszip = new JSZip();

	// re-open zip, add css and fonts
	await jszip.loadAsync(blob);

	let css1 = await fetchAsText("/css/literature.css")
	jszip.file("OEBPS/css/literature.css", css1);
	let css2 = await fetchAsText("/css/w3.css")
	jszip.file("OEBPS/css/w3.css", css2);
	let css3 = await fetchAsText("/css/icon.css")
	jszip.file("OEBPS/css/icon.css", css3);

	let font1 = await fetchAsBlob("/fonts/karla-v13-latin-regular.woff");
	let font2 = await fetchAsBlob("/fonts/karla-v13-latin-regular.woff2");
	let font3 = await fetchAsBlob("/fonts/open-sans-v17-latin-regular.woff");
	let font4 = await fetchAsBlob("/fonts/open-sans-v17-latin-regular.woff2");
	jszip.file("OEBPS/fonts/karla-v13-latin-regular.woff", font1);
	jszip.file("OEBPS/fonts/karla-v13-latin-regular.woff2", font2);
	jszip.file("OEBPS/fonts/open-sans-v17-latin-regular.woff", font3);
	jszip.file("OEBPS/fonts/open-sans-v17-latin-regular.woff2", font4);

	//let js1 = await fetchAsText("/js/include.js");
	jszip.file("OEBPS/js/include.js", "function loadsitecode() {};");

	//let cont1 = await fetchAsText("contents.json");
	//jszip.file("OEBPS/contents.json", cont1);

	blob = await jszip.generateAsync({
		type: "blob"
	});

	return blob;
}