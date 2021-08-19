// functions to create a epub from template files
"use strict";


class EPub {
	epubFiles = [{
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

	constructor() {
    		this.zip = new JSZip();
		this.chapters = [ ];

    		this.zip.file("mimetype", "application/epub+zip");
		for (let file of this.epubFiles) {
			fetchAsText(file.source).then(text => this.zip.file(file.path, text));
		}
	}

	AddChapter(chapter, text) {
		this.zip.file(chapter.href, text);
		// add c.title to index
		this.chapters.push(chapter);
	}

}

async function epubOPF(title, author, url) {
    let opf = await fetchAsXML("/templates/epub/EPUB/book.opf");

    if (opf.parseError && opf.parseError.errorCode != 0) {
                errorMsg = "XML Parsing Error: " + opf.parseError.reason
                          + " at line " + opf.parseError.line
                          + " at position " + opf.parseError.linepos;
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
