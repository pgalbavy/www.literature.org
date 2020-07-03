/*
 * The original repo can be found at:
 * https://github.com/pgalbavy/www.literature.org
 */

function loadsitecode() {
	if (window.location.protocol != 'https:') {
		location.href = location.href.replace("http://", "https://");
	}

	// restrict changes to the element we are called from
	var scripts = document.getElementsByTagName('script');
	script = scripts[scripts.length - 1];
	var parent = script.parentNode;

	// console.log("parent=", parent)
	Include(parent);
	Contents(parent);
	Navigate(parent);
	// once we are done we can reveal the page
	parent.style.display = "block";
}

// check all DIV elements for an attribute of type include-html
// and replace contents with file
function Include(element) {
	const ATTR = "include-html";
	for (var div of element.getElementsByTagName("div")) {
		var file = div.getAttribute(ATTR);
		if (file) {
			var req = new XMLHttpRequest();

			req.onreadystatechange = function () {
				if (this.readyState == 4) {
					if (this.status == 200) { div.innerHTML = this.responseText; }
					if (this.status == 404) { div.innerHTML = "Page not found."; }
					// Remove the attribute
					div.removeAttribute(ATTR);
					// this is the only function where we call ourselves (and Navigate)
					// again as the header contains the nav tag - the other
					// functions only replace innerHTML with fixed html and no
					// special tags are allowed there
					Include(div);
					Navigate(div);
				}
			}

			req.open("GET", file, true);
			req.send();
			/* Exit the function: */
			return;
		}
	}
}

function Contents(element) {
	const ATTR = "contents";
	/* Loop through a collection of all ARTICLE elements: */
	for (var article of element.getElementsByTagName("article")) {
		var file = article.getAttribute(ATTR);
		if (file) {
			/* Make an HTTP request using the attribute value as the file name: */
			var req = new XMLHttpRequest();
			req.onreadystatechange = function () {
				if (this.readyState == 4) {
					if (this.status == 200) {
						// process JSON	
						var contents = JSON.parse(this.responseText);
						var html = "<ul class=\"w3-row w3-bar-block w3-ul w3-border w3-hoverable\">";

						if (typeof contents.authors === 'undefined') {
							contents.authors = [];
						}
						for (var a of contents.authors.sort(hrefSort)) {
							html += "<li class=\"w3-col s12 m6 l4\"><a href=\"" + a.href + "\" class=\"w3-bar-item litleft w3-button\">";
							html += "<i class=\"material-icons md-lit w3-margin-right\">person</i> ";
							html += nameCapsHTML(a.name);
							html += "</a></li>";
						}

						if (typeof contents.books === 'undefined') {
							contents.books = [];
						} else if (typeof contents.title !== 'undefined') {
							html += "<li class=\"w3-col w3-hover-none\"><span class=\"w3-bar-item\">";
							html += "<i class=\"material-icons md-lit w3-margin-right\">person</i> ";
							html += nameCapsHTML(contents.title);
							if (typeof contents.aliases !== 'undefined') {
								// list aliases here (maybe basic bio too, but then move this outside the test)
								html += " - also known as: ";
								for (var alias of contents.aliases) {
									html += nameCapsHTML(alias) + ", ";
								}
								html = html.substring(0, html.length - 2)
								html += "</span></li>";
							}
						}
						for (var b of contents.books.sort(bookSort)) {
							html += "<li class=\"w3-col s12 m6 l4\"><a href=\"" + b.href + "\" class=\"w3-bar-item litleft w3-button\">";
							html += "<i class=\"material-icons md-lit w3-margin-right\">menu_book</i> ";
							html += nameCapsHTML(b.title);
							if (typeof b.year !== 'undefined') {
								html += " (" + b.year + ")";
							}
							html += "</a></li>";
						}
						if (typeof contents.chapters === 'undefined') {
							contents.chapters = [];
						}
						for (var c of contents.chapters) {
							html += "<li><a href=\"" + c.href + "\" class=\"w3-bar-item w3-button litleft\">";

							if (c.href == "authors") {
								html += "<i class=\"material-icons md-lit w3-margin-right\">people</i> ";
							} else if (contents.title == "Authors") {
								html += "<i class=\"material-icons md-lit w3-margin-right\">person</i> ";
							} else if (c.href && c.href.endsWith(".html")) {
								html += "<i class=\"material-icons md-lit w3-margin-right\">library_books</i> ";
							} else {
								html += "<i class=\"material-icons md-lit w3-margin-right\">menu_book</i> ";
							}

							html += nameCapsHTML(c.title) + "</a></li>";
						}
						html += "</ul>";

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
								for (var l of contents.links.other) {
									html += "<li class=\"w3-col s12 m6 l4\"><a href=\"" + l.href + "\" class=\"w3-bar-item w3-button\" litleft target=\"_blank\">";
									html += "<i class=\"material-icons md-lit w3-margin-right\">launch</i>&nbsp";
									html += l.title + "</a>"
									html += "</a>";
								}
							}
							html += "</ul>";
						}

						article.innerHTML = html;
					}
					// Remove the attribute - no recursion though
					article.removeAttribute(ATTR);
				}
			}
			req.open("GET", file, true);
			req.send();
			/* Exit the function: */
			return;
		}
	}
}

function Navigate(element) {
	const ATTR = "navigate";
	for (var nav of element.getElementsByTagName("nav")) {
		var file = nav.getAttribute(ATTR);
		if (file) {
			/* Make an HTTP request using the attribute value as the file name: */
			req = new XMLHttpRequest();
			req.onreadystatechange = function () {
				if (this.readyState == 4 && this.status == 200) {
					// process JSON	
					var contents = JSON.parse(this.responseText);
					var path = location.pathname;
					var parts = path.split('/');
					var final;
					var texthead = "";

					do {
						final = parts.pop();
					}
					while (final != null && (final == "" || final == "index.html"));

					var title = "literature.org";
					var html = "";

					// this breaks if there is more than one article
					var articles = document.getElementsByTagName("article")
					var article = articles[0];

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
							var chapter = contents.chapters.findIndex(o => o.href === final);
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
					var list;
					if (typeof contents.authors !== 'undefined' && contents.authors.length > 0) {
						list = contents.authors
					} else if (typeof contents.books !== 'undefined' && contents.books.length > 0) {
						list = contents.books
					} else {
						list = contents.chapters
					}

					if (list && final && final != "index.html") {
						var page = list.findIndex(o => o.href === final);

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
									html += "<a href=\"index.html\" class=\"w3-bar-item w3-button w3-left w3-disabled\"><i class=\"material-icons md-lit\">menu_book</i></a>";
								}
							}
						}

						var prev, next;

						if (page > 0) {
							// there is a valid previous page
							prev = list[page - 1].href;
							html += "<a href=\"" + prev + "\" class=\"w3-bar-item w3-buttonm\"><i class=\"material-icons md-lit\">arrow_back</i></a>";
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
						var links = document.head.getElementsByTagName("link");
						var gotnext = false, gotprev = false;
						for (var l = 0; l < links.length; l++) {
							if (links[l].rel == "next") {
								gotnext = true;
							} else if (links[l].rel == "prev") {
								gotprev = true;
							}
						}

						if (!gotnext && next) {
							var link = document.createElement('link');
							link.rel = 'next';
							link.href = next;
							document.head.appendChild(link);
						}

						if (!gotprev && prev) {
							var link = document.createElement('link');
							link.rel = 'prev';
							link.href = prev;
							document.head.appendChild(link);
						}

						// touch swipe navigation
						var swipedir;
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
					var paras = article.getElementsByTagName("p");
					var firstpara = title;
					if (paras[0]) {
						firstpara = paras[0].textContent;
						var tlen = 150 - title.length;
						var trimpara = RegExp('^(.{0,' + tlen + '}\\w*).*');
						firstpara = "'" + firstpara.trim().replace(/\s+/g, ' ').replace(trimpara, '$1');
						firstpara += "...' - " + title;
					}

					var existing = document.head.querySelector('meta[name="description"');
					if (existing) {
						existing.content = firstpara
					} else {
						var meta = document.createElement('meta');
						meta.name = 'description';
						meta.content = firstpara;
						document.head.appendChild(meta);
					}

					// also add a header before the main text for the chapter that is only revealed on screens where the topbar
					// title is hidden (above)
					article.insertAdjacentHTML("afterbegin", texthead);
					document.title = title;
				}

				// Remove the attribute
				nav.removeAttribute(ATTR);
			}
			req.open("GET", file, true);
			req.send();
			/* Exit the function: */
			return;
		}
	}
}

// original from http://www.javascriptkit.com/javatutors/touchevents2.shtml
//
// simplified as we are all text and don't want to block link touches
function swipedetect(element, callback) {
	var startX,
		startY,
		threshold = 150, //required min distance traveled to be considered swipe
		restraint = 100, // maximum distance allowed at the same time in perpendicular direction
		allowedTime = 1000, // maximum time allowed to travel that distance
		startTime;

	element.addEventListener('touchstart', function (e) {
		var touchobj = e.changedTouches[0];
		startX = touchobj.pageX;
		startY = touchobj.pageY;
		startTime = new Date().getTime();
	}, false)

	element.addEventListener('touchend', function (e) {
		var touchobj = e.changedTouches[0];
		var distX = touchobj.pageX - startX;
		var distY = touchobj.pageY - startY;
		var elapsedTime = new Date().getTime() - startTime;
		var swipedir = 'none';
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
var smallre = /^(the|an|a)\s/i;

function bookSort(a, b) {
	var result = b.year == a.year ? 0 : b.year > a.year ? -1 : 1

	if (result == 0) {
		c = b.title.replace(smallre, "")
		d = a.title.replace(smallre, "")
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
		var n = -1;
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
