/*
 * The original repo can be found at:
 * https://github.com/pgalbavy/www.literature.org
 */
"use strict";

let single = false;
let epub = false;

document.addEventListener('DOMContentLoaded', (event) => {
	loadsitecode();
});

loadcss("/css/w3.css");
loadcss("/css/icon.css");
loadcss("/css/literature.css");

function loadcss(path) {
	let link = document.createElement("link");

	link.setAttribute("rel", "stylesheet");
	link.setAttribute("href", path);
	link.setAttribute("async", "");

	document.head.appendChild(link);
}

async function loadsitecode() {
	let body = document.body;

	await Include(body)
			.then(body => Contents(body))
			.then(body => Navigate(body));

	let params = new URLSearchParams(location.search);
	let path = location.pathname;
	let parts = path.split('/');
	let last = parts[parts.length - 1];

	if (params.has("single")) {
		single = true;
	} else if (params.has('epub')) {
		epub = true;
	}

	// path has to be an index page, check last element of path either for no '.' or that it's index.html
	if (parts.length > 4 && (!last.includes('.') || last == 'index.html')) {
		if (single) {
			// render book as a single page, for printing or saving offline
			single = true;
			await Single(body);
		} else if (epub) {
			// late loading of extra epub code only if asked for
			// generate an ePub in broswer
			loadScript('/js/jszip.min.js')
				.then(body => loadScript('/js/epub.js'))
				.then(body => {
					CreateEPub(body);
				})
		}
	}

	// once we are done we can reveal the page
	if (body.className == "hide") {
		body.className = "reveal";
	}
}

// load the contents.json and pull in the article innerHTMLs with anchors from the contents etc.
async function Single(element) {
	let article = findFirst(element, 'article', 'contents');
	if (article === undefined) {
		return element;
	}
	let contents = await fetchAsJSON(article.getAttribute('contents'));
	let header = element.getElementsByTagName("header")[0];

	if (contents.chapters === undefined) {
		return element;
	}

	for (let c of contents.chapters) {
		// fetch first <article> in each chapter
		let html = await fetchAsHTML(c.href);
		let chap = html.documentElement.getElementsByTagName('article')[0].innerHTML;
		let ahref = document.getElementById(c.href);

		// append text with headings and anchors, update contents link to anchor and no another page
		let div = appendElement(document, element, 'article', chap, [
			['id', c.title],
			['class', 'w3-container w3-justify']
		]);
		prependElement(document, div, 'h2', c.title, [
			['class', 'w3-container litleft'],
			['style', 'page-break-before: always']
		]);
		// the easiest way to avoid the header is to insert a blank bar before each h2
		prependElement(document, div, 'div', '&nbsp;', [
			['class', 'w3-bar'],
			['style', 'height: 4em']
		])
		ahref.setAttribute("href", "#" + c.title)
	}
	return element;
}

// check all DIV elements for an attribute of type include-html
// and replace contents with file
async function Include(element) {
	const TAG = "div";
	const ATTR = "include-html";

	for (let div of element.getElementsByTagName(TAG)) {
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
	let article = findFirst(element, 'article', 'contents');
	if (article === undefined) {
		return element;
	}
	let contents = await fetchAsJSON(article.getAttribute('contents'));

	let ul = appendElement(document, article, 'ul', null, [
		['id', 'contents'],
		['class', 'w3-row w3-bar-block w3-ul w3-border w3-hoverable']
	]);

	if (contents.authors === undefined) {
		contents.authors = [];
	}
	for (let a of contents.authors.sort(hrefSort)) {
		let li = appendElement(document, ul, 'li', null, [
			['class', 'w3-col s12 m6 l4']
		]);
		let ahref = appendElement(document, li, 'a', nameCapsHTML(a.name), [
			['href', a.href],
			['class', 'w3-bar-item litleft w3-button']
		]);
		let i = prependElement(document, ahref, 'i', 'person', [
			['class', 'material-icons md-lit w3-margin-right']
		]);
	}

	if (contents.books === undefined) {
		contents.books = [];
	} else if (contents.title !== undefined) {
		let aliases = "";
		if (contents.aliases !== undefined) {
			// list aliases here (maybe basic bio too, but then move this outside the test)
			aliases = " - also known as: ";
			for (let alias of contents.aliases) {
				aliases += nameCapsHTML(alias) + ", ";
			}
			aliases = aliases.substring(0, aliases.length - 2)
		}
		let li = appendElement(document, ul, 'li', null, [
			['class', 'w3-col w3-hover-none']
		]);
		let span = appendElement(document, li, 'span', nameCapsHTML(contents.title) + aliases, [
			['class', 'w3-bar-item']
		]);
		prependElement(document, span, 'i', 'person', [
			['class', 'material-icons md-lit w3-margin-right']
		]);
	}

	for (let b of contents.books.sort(bookSort)) {
		let li = appendElement(document, ul, 'li', null, [
			['class', 'w3-col s12 m6 l4']
		]);

		let ahref = appendElement(document, li, 'a', nameCapsHTML(b.title) + (b.year !== undefined ? ' (' + b.year + ')' : ''), [
			['href', b.href],
			['class', 'w3-bar-item litleft w3-button']
		]);
		let i = prependElement(document, ahref, 'i', 'menu_book', [
			['class', 'material-icons md-lit w3-margin-right']
		]);
	}

	if (contents.chapters === undefined) {
		contents.chapters = [];
	}
	for (let c of contents.chapters) {
		let li = appendElement(document, ul, 'li', null);
		let ahref = appendElement(document, li, 'a', nameCapsHTML(c.title), [
			['href', c.href],
			['id', c.href],
			['class', 'w3-bar-item w3-button litleft']
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
			['class', 'material-icons md-lit w3-margin-right']
		]);
	}

	// add other content here
	if (contents.links !== undefined && Object.keys(contents.links) != 0) {
		ul = appendElement(document, article, 'ul', null, [
			['class', 'w3-row w3-bar-block w3-ul w3-border w3-hoverable']
		]);
		let li = appendElement(document, ul, 'li', null, [
			['class', 'w3-hover-none']
		]);

		appendElement(document, li, 'h2', 'External Links');

		appendLinkImg(document, ul, contents.links.wikipedia, 'Wikipedia', '/images/Wikipedia-logo-v2.svg');
		appendLinkImg(document, ul, contents.links.goodreads, 'Goodreads', '/images/1454549125-1454549125_goodreads_misc.png');
		appendLinkImg(document, ul, contents.links.gutenberg, 'Gutenberg', '/images/Project_Gutenberg_logo.svg');

		if (contents.links.other) {
			for (let l of contents.links.other) {
				appendLinkImg(document, ul, l.href, l.title)
			}
		}
	}
	return element;
}

async function Navigate(element) {
	let nav = findFirst(element, 'nav', 'navigate');
	if (nav === undefined) {
		return;
	}
	let contents = await fetchAsJSON(nav.getAttribute('navigate'));
	nav.removeAttribute('navigate');

	let title = "literature.org";

	// this breaks if there is more than one article
	let articles = document.getElementsByTagName("article")
	let article = articles[0];

	let sidebar = appendElement(document, nav, 'nav', null, [
		['class', 'w3-sidebar w3-bar-block w3-large'],
		['style', 'width:66%; max-width: 400px; display:none'],
		['id', 'sidebar']
	]);
	let button = appendElement(document, sidebar, 'button', ' Close', [
		['class', 'w3-bar-item w3-button'],
		['onclick', 'w3_close()']
	]);
	prependElement(document, button, 'i', 'close', [
		['class', 'material-icons md-lit']
	]);
	let ahref = appendElement(document, sidebar, 'a', ' literature.org', [
		['href', '/'],
		['class', 'w3-bar-item w3-button']
	]);
	prependElement(document, ahref, 'i', 'home', [
		['class', 'material-icons md-lit']
	]);
	ahref = appendElement(document, sidebar, 'a', ' Authors', [
		['href', '/authors'],
		['class', 'w3-bar-item w3-button']
	]);
	prependElement(document, ahref, 'i', 'people', [
		['class', 'material-icons md-lit']
	]);

	// sidebar
	if (contents.author) {
		ahref = appendElement(document, sidebar, 'a', ` ${contents.author}`, [
			['href', '../'],
			['class', 'w3-bar-item w3-button litleft']
		]);
		prependElement(document, ahref, 'i', 'person', [
			['class', 'material-icons md-lit']
		]);
		title = titleCase(contents.author) + " at " + title;
	}

	let parts = location.pathname.split('/');
	parts.reverse();
	let final = parts.find(function (value, index, array) { return value != "index.html" && value != "" });

	if (final && final != "authors") {
		ahref = appendElement(document, sidebar, 'a', ` ${contents.title}`, [
			['href', 'index.html'],
			['class', 'w3-bar-item w3-button litleft']
		]);
		prependElement(document, ahref, 'i', 'menu_book', [
			['class', 'material-icons md-lit']
		]);

		if (contents.chapters !== undefined) {
			if (final.endsWith(".html")) {
				let chapter = contents.chapters.findIndex(o => o.href === final);
				// dropdown here
				button = appendElement(document, sidebar, 'button', ` ${contents.chapters[chapter].title}`, [
					['class', 'w3-bar-item w3-button litleft'],
					['onclick', 'w3_close()']
				]);
				prependElement(document, button, 'i', 'library_books', [
					['class', 'material-icons md-lit']
				]);
			} else {
				ahref = appendElement(document, sidebar, 'a', ` Single Page View`, [
					['href', `?single`],
					['class', 'w3-bar-item w3-button litleft']
				]);
				prependElement(document, ahref, 'i', 'description', [
					['class', 'material-icons md-lit']
				]);
				ahref = appendElement(document, sidebar, 'a', ` Download ePub`, [
					['href', `?epub`],
					['class', 'w3-bar-item w3-button litleft']
				]);
				prependElement(document, ahref, 'i', 'cloud_download', [
					['class', 'material-icons md-lit']
				]);
			}
		}

		if (title == "literature.org") {
			title = titleCase(contents.title) + " at " + title;
		} else {
			title = titleCase(contents.title) + " by " + title;
		}
	}

	// top bar
	let navbar = appendElement(document, nav, 'nav', null, [
		['class', 'w3-bar'],
		['style', 'font-size:24px; white-space: nowrap;']
	]);
	button = appendElement(document, navbar, 'button', null, [
		['class', 'w3-bar-item w3-button'],
		['onclick', 'w3_open()']
	]);
	appendElement(document, button, 'i', 'menu', [
		['class', 'material-icons md-lit']
	]);

	// pick one and exactly one list of links, in this order
	let list;
	if (contents.authors !== undefined && contents.authors.length > 0) {
		list = contents.authors
	} else if (contents.books !== undefined && contents.books.length > 0) {
		list = contents.books
	} else {
		list = contents.chapters
	}

	if (list && final) {
		let page = list.findIndex(o => o.href === final);

		if (final == "authors") {
			addNavButton(document, navbar, '/', 'home', 'Home', 'w3-left');
		} else {
			if (typeof contents.author === 'undefined' || contents.author == "") {
				addNavButton(document, navbar, '/authors', 'people', 'Authors', 'w3-left');
			} else {
				// author
				addNavButton(document, navbar, '../', 'person', 'Author', 'w3-left');
			}

			// contents page
			if (!(contents.title != "Authors" && (contents.author === undefined || contents.author == ""))) {
				if (final.endsWith(".html")) {
					addNavButton(document, navbar, 'index.html', 'menu_book', 'Contents', 'w3-left');
				} else {
					if (single) {
						addNavButton(document, navbar, 'index.html', 'menu_book', 'Contents', 'w3-left');
					} else {
						addNavButton(document, navbar, '?single', 'description', 'Single Page', 'w3-left');
					}
					addNavButton(document, navbar, '?epub', 'cloud_download', 'Download ePub', 'w3-left');
				}
			}
		}

		let prev, next;

		if (single) {
			addNavButton(document, navbar, '#top', 'arrow_upward', 'Previous');
		} else if (page > 0) {
			// there is a valid previous page
			prev = list[page - 1].href;
			addNavButton(document, navbar, prev, 'arrow_back', 'Previous');
		} else {
			addNavButtonDisabled(document, navbar, 'arrow_back', 'Previous');
		}

		if (is_touch_enabled() === true) {
			addNavButtonDisabled(document, navbar, 'touch_app', 'lit-narrow');
		}

		if (single) {
			addNavButton(document, navbar, '#top', 'arrow_downward', 'Next');
		} else if (page < list.length - 1 && contents.author != "") {
			// there is a valid next page
			next = list[page + 1].href
			addNavButton(document, navbar, next, 'arrow_forward', 'Next');
		} else {
			addNavButtonDisabled(document, navbar, 'arrow_forward', 'Next');
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

		if (list[page]) {
			prependElement(document, article, 'h3', list[page].title, [
				['class', 'w3-hide-medium w3-hide-large w3-left-align'],
				['id', 'heading']
			]);
			appendElement(document, navbar, 'div', list[page].title, [
				['class', 'w3-bar-item lit w3-hide-small']
			]);

			title = list[page].title + " - " + title;
		} else {
			if (contents.title == "Authors" || contents.author !== undefined) {
				let ul = prependElement(document, article, 'ul', null, [
					['class', 'w3-row w3-bar-block w3-ul w3-hide-medium w3-hide-large']
				]);
				let li = appendElement(document, ul, 'li', null);
				let span = appendElement(document, li, 'span', nameCapsHTML(contents.title), [
					['class', 'w3-bar-item w3-button litleft w3-hover-none']
				]);
				prependElement(document, span, 'i', 'menu_books', [
					['class', 'material-icons md-lit w3-margin-right'],
					['style', 'width: 24px']
				]);
			}
			appendElement(document, navbar, 'div', nameCapsHTML(contents.title), [
				['class', 'w3-bar-item lit w3-hide-small']
			]);
		}

		if (list[page]) {
			appendElement(document, navbar, 'div', (page + 1) + "/" + list.length, [
				['class', 'w3-bar-item lit w3-hide-medium w3-hide-large']
			]);
		}

	} else if (final != null) {
		// author
		addNavButton(document, navbar, '../', 'person', 'Author', 'w3-left');

		appendElement(document, navbar, 'a', contents.title, [
			['href', 'index.html']
		]);

		title = contents.title + " - " + title;
	}

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

	let existing = document.head.querySelector('meta[name="description"]');
	if (existing) {
		existing.content = firstpara
	} else {
		let meta = document.createElement('meta');
		meta.name = 'description';
		meta.content = firstpara;
		document.head.appendChild(meta);
	}

	document.title = title;
}

// very much WIP - build an epub for the current directory
async function CreateEPub(element) {
	let article = findFirst(element, 'article', 'contents');
	if (article === undefined) {
		return;
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

	await epub.CreatePackage(pageurl, "EPUB/book.opf");

	let url = URL.createObjectURL(await epub.DownloadEPub());
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

function findFirst(element, tag, attr) {
	let elem
	for (elem of element.getElementsByTagName(tag)) {
		if (!elem.hasAttribute(attr)) {
			continue;
		}
	}
	if (elem === undefined || !elem.hasAttribute(attr)) {
		return undefined;
	}

	return elem;
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

// convenience functions to fetch specific types from URLs
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
	node.insertAdjacentElement('afterbegin', elem);

	return elem;
}

function appendLinkImg(doc, elem, href, title, image) {
	if (href === undefined) {
		return;
	}
	let li = appendElement(doc, elem, 'li', null, [
		['class', 'w3-col s12 m6 l4']
	]);
	let ahref = appendElement(doc, li, 'a', `&nbsp;${title}`, [
		['href', href],
		['class', 'w3-bar-item litleft w3-button'],
		['target', '_blank']
	]);
	if (image !== undefined) {
		prependElement(doc, ahref, 'img', null, [
			['src', image],
			['style', 'width: 32px']
		]);
	}
	let i = prependElement(doc, ahref, 'i', 'launch', [
		['class', 'material-icons md-lit w3-margin-right']
	]);
}

function addNavButton(document, elem, link, icon, title, classextra) {
	let ahref = appendElement(document, elem, 'a', null, [
		['id', icon],
		['href', link],
		['title', title],
		['onclick', `return navClick('${icon}');`],
		['class', `w3-bar-item w3-button ${classextra}`]
	]);
	appendElement(document, ahref, 'i', icon, [
		['class', 'material-icons md-lit']
	]);
}

function addNavButtonDisabled(document, elem, icon, classextra) {
	let div = appendElement(document, elem, 'div', null, [
		['id', icon],
		['class', `w3-bar-item w3-button w3-disabled ${classextra}`]
	]);
	appendElement(document, div, 'i', icon, [
		['class', 'material-icons md-lit']
	]);
}

function navClick(icon) {
	switch (icon) {
		case 'arrow_downward':
			nextChapter('article');
			break;
		case 'arrow_upward':
			prevChapter('article');
			break;
		default:
			return true;
	}
	return false;
}

function nextChapter(tag) {
	let elems = document.getElementsByTagName(tag);
	let i = firstVisible(elems);

	if (i === undefined || i == elems.length - 1) {
		elems[elems.length - 1].scrollIntoView({ block: 'center' });
	} else {
		elems[i + 1].scrollIntoView({ block: 'start' });
		elems[i + 1].scrollTo(100, 100);
	}
}

function prevChapter(tag) {
	let elems = document.getElementsByTagName(tag);
	let i = firstVisible(elems);

	if (i === undefined || i == 0) {
		elems[0].scrollIntoView(false);
	} else {
		elems[i - 1].scrollIntoView({ block: 'start' });
	}
}

// this is ONLY valid once display style is set to visible (obvious, but...)
function firstVisible(elems) {
	if (elems === undefined) {
		return 0;
	}
	for (let i = 0; i < elems.length; i++) {
		let rect = elems[i].getBoundingClientRect();
		if (rect.top >= 0) {
			return i;
		}
	}
}

