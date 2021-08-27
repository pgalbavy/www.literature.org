/*
 * The original repo can be found at:
 * https://github.com/pgalbavy/www.literature.org
 */
"use strict";

async function loadsitecode() {
	if (window.location.protocol != 'https:') {
		location.href = location.href.replace("http://", "https://");
	}

	// restrict changes to the element we are called from
	let scripts = document.getElementsByTagName('script');
	let script = scripts[scripts.length - 1];
	let parent = script.parentNode;

	await Include(parent);
	await Contents(parent);
	await Navigate(parent);

	// late loading of heavy epub code only if asked for
	// send any ?epub a book ?
	let params = new URLSearchParams(location.search);
	let path = location.pathname;
	let parts = path.split('/');
	let last = parts[parts.length - 1];

	// path has to be an index page, check last element of path either for no '.' or that it's index.html
	if (params.has("epub") && parts.length > 4 && (!last.includes('.') || last == 'index.html')) {
		loadScript('/js/jszip.min.js')
			.then(script => loadScript('/js/epub.js'))
			.then(script => {
				CreateEPub(parent);
			})
	}

	// once we are done we can reveal the page
	parent.style.display = "block";
}

// check all DIV elements for an attribute of type include-html
// and replace contents with file
async function Include(element) {
	const ATTR = "include-html";
	for (let div of element.getElementsByTagName("div")) {
		if (!div.hasAttribute(ATTR)) {
			continue;
		}
		let file = div.getAttribute(ATTR);
		div.innerHTML = await fetchAsText(file);
		div.removeAttribute(ATTR);
		// recurse into just loaded HTML
		Include(div);
	}
	return element;
}

async function Contents(element) {
	const ATTR = "contents";

	/* Loop through a collection of all ARTICLE elements: */
	for (let article of element.getElementsByTagName("article")) {
		if (!article.hasAttribute(ATTR)) {
			continue;
		}
		let file = article.getAttribute(ATTR);
		let contents = await fetchAsJSON(file);
		// do not remove tag as CreateEPub() also needs it now
		// article.removeAttribute(ATTR);

		let ul = appendElement(document, article, 'ul', null, [
			[ 'class', 'w3-row w3-bar-block w3-ul w3-border w3-hoverable' ]
		]);

		if (typeof contents.authors === 'undefined') {
			contents.authors = [];
		}
		for (let a of contents.authors.sort(hrefSort)) {
			let li = appendElement(document, ul, 'li', null, [
				[ 'class', 'w3-col s12 m6 l4' ]
			]);
			let ahref = appendElement(document, li, 'a', nameCapsHTML(a.name), [
				[ 'href', a.href ],
				[ 'class', 'w3-bar-item litleft w3-button' ]
			]);
			let i = prependElement(document, ahref, 'i', 'person', [
				[ 'class', 'material-icons md-lit w3-margin-right' ]
			]);
		}

		if (typeof contents.books === 'undefined') {
			contents.books = [];
		} else if (typeof contents.title !== 'undefined') {
			let aliases = "";
			if (typeof contents.aliases !== 'undefined') {
				// list aliases here (maybe basic bio too, but then move this outside the test)
				aliases = " - also known as: ";
				for (let alias of contents.aliases) {
					aliases += nameCapsHTML(alias) + ", ";
				}
				aliases = aliases.substring(0, aliases.length - 2)
			}
			let li = appendElement(document, ul, 'li', null, [
				[ 'class', 'w3-col w3-hover-none' ]
			]);
			let span = appendElement(document, li, 'span', nameCapsHTML(contents.title) + aliases, [
				[ 'class', 'w3-bar-item' ]
			]);
			let i = appendElement(document, span, 'i', 'person', [
				[ 'class', 'material-icons md-lit w3-margin-right' ]
			]);
		}

		for (let b of contents.books.sort(bookSort)) {
			let li = appendElement(document, ul, 'li', null, [
				[ 'class', 'w3-col s12 m6 l4' ]
			]);

			let ahref = appendElement(document, li, 'a', nameCapsHTML(b.title) + (b.year !== undefined ? ' (' + b.year + ')' : ''), [
				[ 'href', b.href ],
				[ 'class', 'w3-bar-item litleft w3-button' ]
			]);
			let i = prependElement(document, ahref, 'i', 'menu_book', [
				[ 'class', 'material-icons md-lit w3-margin-right' ]
			]);
		}

		if (typeof contents.chapters === 'undefined') {
			contents.chapters = [];
		}
		for (let c of contents.chapters) {
			let li = appendElement(document, ul, 'li', null);
			let ahref = appendElement(document, li, 'a', nameCapsHTML(c.title), [
				[ 'href', c.href ],
				[ 'class', 'w3-bar-item w3-button litleft' ]
			]);

			let icon;
			if (c.href == "authors") {
				icon = 'people';
			} else if (contents.title == "Authors") {
				icon = 'person';
			} else if (c.href && c.href.endsWith(".html")) {
				icon = 'library_books';
			} else {
				icon = 'menu_book';
			}
			prependElement(document, ahref, 'i', icon, [
				[ 'class', 'material-icons md-lit w3-margin-right' ]
			]);
		}


		let html = "";
		// add other content here
		if (typeof contents.links !== 'undefined' && Object.keys(contents.links) != 0) {
			html += "<ul class=\"w3-row w3-bar-block w3-ul w3-border w3-hoverable\">";
			html += "<li class=\"w3-hover-none\"><h2>External Links</h2></li>";
			if (contents.links.wikipedia) {
				html += "<li class=\"w3-col s12 m6 l4\"><a href=\"" + contents.links.wikipedia + "\" class=\"w3-bar-item litleft w3-button\" target=\"_blank\">";
				html += "<i class=\"material-icons md-lit w3-margin-right\">launch</i>&nbsp";
				html += "<img src=\"/images/Wikipedia-logo-v2.svg\" style=\"width:32px\">";
				html += "&nbsp;Wikipedia";
				html += "</a>";
			}
			if (contents.links.goodreads) {
				html += "<li class=\"w3-col s12 m6 l4\"><a href=\"" + contents.links.goodreads + "\" class=\"w3-bar-item litleft w3-button\" target=\"_blank\">";
				html += "<i class=\"material-icons md-lit w3-margin-right\">launch</i>&nbsp";
				html += "<img src=\"/images/1454549125-1454549125_goodreads_misc.png\" style=\"width:32px\">";
				html += "&nbsp;Goodreads"
				html += "</a>";
			}
			if (contents.links.gutenberg) {
				html += "<li class=\"w3-col s12 m6 l4\"><a href=\"" + contents.links.gutenberg + "\" class=\"w3-bar-item litleft w3-button\" target=\"_blank\">";
				html += "<i class=\"material-icons md-lit w3-margin-right\">launch</i>&nbsp";
				html += "<img src=\"/images/Project_Gutenberg_logo.svg\" style=\"width:32px\">";
				html += "&nbsp;Project&nbsp;Gutenberg"
				html += "</a>";
			}
			if (contents.links.other) {
				for (let l of contents.links.other) {
					html += "<li class=\"w3-col s12 m6 l4\"><a href=\"" + l.href + "\" class=\"w3-bar-item w3-button\" litleft target=\"_blank\">";
					html += "<i class=\"material-icons md-lit w3-margin-right\">launch</i>&nbsp";
					html += l.title + "</a>"
					html += "</a>";
				}
			}
			html += "</ul>";
		}

		article.innerHTML = html;
		article.insertAdjacentElement('afterbegin', ul);

	}
}

async function Navigate(element) {
	const ATTR = "navigate";
	for (let nav of element.getElementsByTagName("nav")) {
		if (!nav.hasAttribute(ATTR)) {
			continue;
		}
		let file = nav.getAttribute(ATTR);
		let contents = await fetchAsJSON(file);
		nav.removeAttribute(ATTR);

		let path = location.pathname;
		let parts = path.split('/');
		let final;
		let texthead = "";

		do {
			final = parts.pop();
		}
		while (final != null && (final == "" || final == "index.html"));

		let title = "literature.org";
		let html = "";

		// this breaks if there is more than one article
		let articles = document.getElementsByTagName("article")
		let article = articles[0];

		// sidebar
		html += "<nav class=\"w3-sidebar w3-bar-block w3-large\" style=\"width:66%; max-width: 400px; display:none\" id=\"sidebar\">";
		html += "<button class=\"w3-bar-item w3-button\" onclick=\"w3_close()\"><i class=\"material-icons md-lit\">close</i> Close</button>";
		html += "<a href=\"/\" class=\"w3-bar-item w3-button\"><i class=\"material-icons md-lit\">home</i> literature.org</a>";
		html += "<a href=\"/authors/\" class=\"w3-bar-item w3-button\"><i class=\"material-icons md-lit\">people</i> Authors</a>";
		if (contents.author) {
			html += " <a href=\"../\" class=\"w3-bar-item w3-button litleft\"><i class=\"material-icons md-lit\">person</i> " + contents.author + "</a>";
			title = titleCase(contents.author) + " at " + title;
		}

		if (final && final != "index.html" && final != "authors") {
			html += " <a href=\"index.html\" class=\"w3-bar-item w3-button litleft\"><i class=\"material-icons md-lit\">menu_book</i> " + contents.title + "</a>";
			if (title == "literature.org") {
				title = titleCase(contents.title) + " at " + title;
			} else {
				title = titleCase(contents.title) + " by " + title;
			}
			if (typeof contents.chapters !== 'undefined' && final.endsWith(".html")) {
				let chapter = contents.chapters.findIndex(o => o.href === final);
				// dropdown here
				html += "<button class=\"w3-bar-item w3-button litleft\" onclick=\"w3_close()\"><i class=\"material-icons md-lit\">library_books</i></a>";
				html += " " + contents.chapters[chapter].title + "</button>";
			}
		}

		html += "</nav>";

		// top bar
		html += "<nav class=\"w3-bar\" style=\"font-size:24px; white-space: nowrap;\">";
		html += "<button class=\"w3-bar-item w3-button\" onclick=\"w3_open()\"><i class=\"material-icons md-lit\">menu</i></button>";

		// pick one and exactly one list of links, in this order
		let list;
		if (typeof contents.authors !== 'undefined' && contents.authors.length > 0) {
			list = contents.authors
		} else if (typeof contents.books !== 'undefined' && contents.books.length > 0) {
			list = contents.books
		} else {
			list = contents.chapters
		}

		if (list && final && final != "index.html") {
			let page = list.findIndex(o => o.href === final);

			if (final == "authors") {
				html += "<a href=\"/\" class=\"w3-bar-item w3-button w3-left\"><i class=\"material-icons md-lit\">home</i></a>";
			} else {
				if (typeof contents.author === 'undefined' || contents.author == "") {
					html += "<a href=\"/authors/\" class=\"w3-bar-item w3-button w3-left\"><i class=\"material-icons md-lit\">people</i></a>";
				} else {
					// author
					html += "<a href=\"..\" class=\"w3-bar-item w3-button w3-left\"><i class=\"material-icons md-lit\">person</i></a>";
				}

				// contents page
				if (!(contents.title != "Authors" && (typeof contents.author === 'undefined' || contents.author == ""))) {
					if (final.endsWith(".html")) {
						html += "<a href=\"index.html\" class=\"w3-bar-item w3-button w3-left\"><i class=\"material-icons md-lit\">menu_book</i></a>";
					} else {
						// TODO: when the contents page is open, add an epub download link
						html += "<a href=\"?epub\" class=\"w3-bar-item w3-button w3-left\"><i class=\"material-icons md-lit\">cloud_download</i></a>";
					}
				}
			}

			let prev, next;

			if (page > 0) {
				// there is a valid previous page
				prev = list[page - 1].href;
				html += "<a href=\"" + prev + "\" class=\"w3-bar-item w3-button\"><i class=\"material-icons md-lit\">arrow_back</i></a>";
			} else {
				html += "<div class=\"w3-bar-item w3-button w3-disabled w3-hover-none\"><i class=\"material-icons md-lit\">arrow_back</i></div>";
			}

			if (is_touch_enabled() === true) {
				html += "<div class=\"w3-bar-item w3-button w3-disabled lit-narrow\"><i class=\"material-icons md-lit\">touch_app</i></div>"
			}

			if (page < list.length - 1 && contents.author != "") {
				// there is a valid next page
				next = list[page + 1].href
				html += "<a href=\"" + next + "\" class=\"w3-bar-item w3-button\"><i class=\"material-icons md-lit\">arrow_forward</i></a>";
			} else {
				html += "<div class=\"w3-bar-item w3-button w3-disabled\"><i class=\"material-icons md-lit\">arrow_forward</i></div>";
			}

			// update link rel="next"/"prev" values
			let links = document.head.getElementsByTagName("link");
			let gotnext = false,
				gotprev = false;
			for (let l = 0; l < links.length; l++) {
				if (links[l].rel == "next") {
					gotnext = true;
				} else if (links[l].rel == "prev") {
					gotprev = true;
				}
			}

			if (!gotnext && next) {
				let link = document.createElement('link');
				link.rel = 'next';
				link.href = next;
				document.head.appendChild(link);
			}

			if (!gotprev && prev) {
				let link = document.createElement('link');
				link.rel = 'prev';
				link.href = prev;
				document.head.appendChild(link);
			}

			// touch swipe navigation
			let swipedir;
			swipedetect(article, function (swipedir) {
				if (swipedir == 'left' && next) {
					window.location.href = next;
				} else if (swipedir == 'right' && prev) {
					window.location.href = prev;
				} else {
					// close sidebar if open if we touch but not swipe anywhere on the text
					w3_close();
				}
			})

			// dropdown of pages here (soon)
			html += "<div class=\"w3-bar-item lit w3-hide-small\">";

			if (list[page]) {
				texthead = "<h3 class=\"w3-hide-medium w3-hide-large w3-left-align\" id= \"heading\">" + list[page].title + "</h3>";
				html += list[page].title;

				title = list[page].title + " - " + title;
			} else {
				if (!(contents.title != "Authors" && (typeof contents.author === 'undefined' || contents.author == ""))) {
					texthead = "<ul class=\"w3-row w3-bar-block w3-ul w3-hide-medium w3-hide-large\">";
					texthead += "<li><span class=\"w3-bar-item w3-button litleft w3-hover-none\">";
					// for some reason the size is required in this one instance
					texthead += "<i class=\"material-icons md-lit w3-margin-right\" style=\"width: 24px\">menu_books</i> ";
					texthead += nameCapsHTML(contents.title);
					texthead += "</span></li></ul>";
				}
				html += nameCapsHTML(contents.title);
			}
			html += "</div>";

			if (list[page]) {
				html += "<div class=\"w3-bar-item lit w3-hide-medium w3-hide-large\">";
				// html += "<i class=\"material-icons md-lit w3-margin-right\">library_books</i>";
				html += (page + 1) + "/" + list.length;
				html += "</div>";
			}

		} else if (final != null) {
			// author
			html += "<a href=\"..\" class=\"w3-bar-item w3-button w3-left\"><i class=\"material-icons md-lit\">person</i></a>";

			html += "<a href=\"index.html\" class=\"w3-bar-item w3-button\">" + contents.title + "</a>";

			title = contents.title + " - " + title;
		}
		html += "</nav>";
		nav.innerHTML = html;

		// grab first paragraph and massage it into a meta description,
		// using the title as a suffix and truncating to a length of 160-ish
		let paras = article.getElementsByTagName("p");
		let firstpara = title;
		if (paras[0]) {
			firstpara = paras[0].textContent;
			let tlen = 150 - title.length;
			let trimpara = RegExp('^(.{0,' + tlen + '}\\w*).*');
			firstpara = "'" + firstpara.trim().replace(/\s+/g, ' ').replace(trimpara, '$1');
			firstpara += "...' - " + title;
		}

		let existing = document.head.querySelector('meta[name="description"');
		if (existing) {
			existing.content = firstpara
		} else {
			let meta = document.createElement('meta');
			meta.name = 'description';
			meta.content = firstpara;
			document.head.appendChild(meta);
		}

		// also add a header before the main text for the chapter that is only revealed on screens where the topbar
		// title is hidden (above)
		article.insertAdjacentHTML("afterbegin", texthead);
		document.title = title;
	}
}

// very much WIP - build an epub for the current directory
async function CreateEPub(element) {
	/* Loop through a collection of all ARTICLE elements: */
	for (let article of element.getElementsByTagName("article")) {
		if (!article.hasAttribute("contents")) {
			continue;
		}
		let file = article.getAttribute("contents");
		let contents = await fetchAsJSON(file);

		if (contents == null) {
			console.log("no contents loaded")
			// no json parsed - error
		}

		// remove last component of path, so we point bck to the main contents page of the book
		let pageurl = location.href.replace(/\/[^\/]*$/, '');

		let epub = new EPub(contents);

		await epub.CreatePackage("EPUB/book.opf");

		//let url = URL.createObjectURL(await jepub.generate('blob').then(blob => epubAddFiles(blob)));
		let url = URL.createObjectURL(await epub.CreateEPub());
		document.body.append('Your download should start automatically. If not please click here: ');
		let link = document.createElement('a');
		document.body.appendChild(link);
		link.innerHTML = 'Download';
		link.href = url;

		let path = location.pathname;
		let parts = path.split('/');
		// name the download file author-title.epub
		link.download = parts[2] + '-' + parts[3] + '.epub';
		link.click();
	}
}


// original from http://www.javascriptkit.com/javatutors/touchevents2.shtml
//
// simplified as we are all text and don't want to block link touches
function swipedetect(element, callback) {
	let startX,
		startY,
		threshold = 150, //required min distance traveled to be considered swipe
		restraint = 100, // maximum distance allowed at the same time in perpendicular direction
		allowedTime = 1000, // maximum time allowed to travel that distance
		startTime;

	element.addEventListener('touchstart', function (e) {
		let touchobj = e.changedTouches[0];
		startX = touchobj.pageX;
		startY = touchobj.pageY;
		startTime = new Date().getTime();
	}, {
		passive: true
	})

	element.addEventListener('touchend', function (e) {
		let touchobj = e.changedTouches[0];
		let distX = touchobj.pageX - startX;
		let distY = touchobj.pageY - startY;
		let elapsedTime = new Date().getTime() - startTime;
		let swipedir = 'none';
		if (elapsedTime <= allowedTime) {
			if (Math.abs(distX) >= threshold && Math.abs(distY) <= restraint) {
				swipedir = (distX < 0) ? 'left' : 'right'
			}
		}
		callback(swipedir);
	}, false)
}

function w3_open() {
	document.getElementById("sidebar").style.display = "block";
}

function w3_close() {
	document.getElementById("sidebar").style.display = "none";
}

// sort by year or by title with short prefixes removed
let smallre = /^(the|an|a)\s/i;

function bookSort(a, b) {
	let result = b.year == a.year ? 0 : b.year > a.year ? -1 : 1

	if (result == 0) {
		let c = b.title.replace(smallre, "")
		let d = a.title.replace(smallre, "")
		return c == d ? 0 : c > d ? -1 : 1
	}

	return result;
}

function hrefSort(b, a) {
	return a.href == b.href ? 0 : a.href > b.href ? -1 : 1
}

// from https://www.freecodecamp.org/news/three-ways-to-title-case-a-sentence-in-javascript-676a9175eb27/
function titleCase(str) {
	return str.toLowerCase().split(' ').map(function (word) {
		if (typeof word[0] === 'undefined') {
			return undefined
		}
		word = word.replace(word[0], word[0].toUpperCase());
		// check for Mc, Mac etc. - makes this a lookup table if it gets much longer
		let n = -1;
		if (word.startsWith("Mc")) {
			n = 2;
		}
		if (word.startsWith * "Mac)") {
			n = 3;
		}

		if (n != -1) {
			word = word.replace(word[n], word[n].toUpperCase());
		}

		return word;
	}).join(' ');
}

function nameCapsHTML(name) {
	// convert any word that is all CAPS and longer than one letter
	// to BOLD and Title case
	return name.replace(/(\b[A-Z\u00C0-\u00DC][A-Z\u00C0-\u00DC\b]+\s?)+/, function (match) {
		return "<strong>" + titleCase(match.toLowerCase()) + "</strong>";
	});
}

function is_touch_enabled() {
	return ('ontouchstart' in window) ||
		(navigator.maxTouchPoints > 0) ||
		(navigator.msMaxTouchPoints > 0);
}

async function fetchAsText(url) {
	return fetch(url)
		.then(response => response.text());
}

async function fetchAsHTML(url) {
	return fetch(url)
		.then(response => response.text())
		.then(data => (new DOMParser()).parseFromString(data, "text/html"));
}

async function fetchAsXML(url) {
	return fetch(url)
		.then(response => response.text())
		.then(data => (new DOMParser()).parseFromString(data, "application/xml"));
}

async function fetchAsJSON(url) {
	return fetch(url)
		.then(response => response.json());
}

async function fetchAsBlob(url) {
	return fetch(url)
		.then(response => response.blob());
}

function loadScript(file) {
	return new Promise(function (resolve, result) {
		let script = document.createElement('script');
		script.src = file;

		script.onload = () => resolve(script);
		script.onerror = () => reject(new Error(`could not load ${src}`));
		document.head.append(script);
	});
}

// append element with name and inner HTML value and option atrributes
function appendElement(doc, node, elemName, value, attr) {
	let elem = doc.createElement(elemName)
	if (attr !== undefined) {
		for (let a of attr) {
			elem.setAttribute(a[0], a[1]);
		}
	}
	if (value != "") {
		elem.innerHTML = value;
	}
	node.appendChild(elem);

	return elem;
}

// prepent a chile element with name and inner HTML value and option atrributes
function prependElement(doc, node, elemName, value, attr) {
	let elem = doc.createElement(elemName)
	if (attr !== undefined) {
		for (let a of attr) {
			elem.setAttribute(a[0], a[1]);
		}
	}
	if (value != "") {
		elem.innerHTML = value;
	}

	//let first = node.firstElementChild;
	node.insertAdjacentElement('afterbegin', elem);

	return elem;
}


