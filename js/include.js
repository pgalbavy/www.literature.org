/*
 * The original repo can be found at:
 * https://github.com/pgalbavy/www.literature.org
 */

function loadsitecode() {
	Include();
	Contents();
	Navigate();
}

function Include() {
	var z, i, elmnt, file, xhttp;
	/* Loop through a collection of all HTML elements: */
	z = document.getElementsByTagName("*");
	for (i = 0; i < z.length; i++) {
		elmnt = z[i];
		/*search for elements with a certain atrribute:*/
		file = elmnt.getAttribute("include-html");
		if (file) {
			/* Make an HTTP request using the attribute value as the file name: */
			xhttp = new XMLHttpRequest();
			xhttp.onreadystatechange = function () {
				if (this.readyState == 4) {
					if (this.status == 200) { elmnt.innerHTML = this.responseText; }
					if (this.status == 404) { elmnt.innerHTML = "Page not found."; }
					/* Remove the attribute, and call this function once more: */
					elmnt.removeAttribute("include-html");
					loadsitecode();
				}
			}

			xhttp.open("GET", file, true);
			xhttp.send();
			/* Exit the function: */
			return;
		}
	}
}

// sort by year or by title with short prefixes removed
var smallre = /^(the|an|a)\s/i;

function bookSort(a, b) {
	var result = a.year == b.year ? 0 : a.year > b.year ? -1 : 1

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

function Contents() {
	var z, i, elmnt, file, xhttp;
	/* Loop through a collection of all HTML elements: */
	z = document.getElementsByTagName("*");
	for (i = 0; i < z.length; i++) {
		elmnt = z[i];
		/*search for elements with a certain atrribute:*/
		file = elmnt.getAttribute("contents");
		if (file) {
			/* Make an HTTP request using the attribute value as the file name: */
			xhttp = new XMLHttpRequest();
			xhttp.onreadystatechange = function () {
				if (this.readyState == 4) {
					if (this.status == 200) {
						// process JSON	
						var contents = JSON.parse(this.responseText);
						var html = "<ul class=\"w3-bar-block w3-ul w3-hoverable\">";

						if (typeof contents.authors === 'undefined') {
							contents.authors = [];
						}
						for (var a of contents.authors.sort(hrefSort)) {
							html += "<li><a href=\"" + a.href + "\" class=\"w3-bar-item w3-button\">";
							html += "<i class=\"material-icons md-lit w3-margin-right\">person</i> ";
							html += nameCapsHTML(a.name);
							html += "</a></li>";
						}

						if (typeof contents.books === 'undefined') {
							contents.books = [];
						}
						for (var b of contents.books.sort(bookSort)) {
							html += "<li><a href=\"" + b.href + "\" class=\"w3-bar-item w3-button\">";
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
						if (typeof contents.links !== 'undefined' && Object.keys(contents.links) != 0 ) {
							html += "<ul class=\"w3-bar-block w3-ul w3-hoverable\">";
							html += "<li><h2>External Links</h2></li>";
							if (contents.links.wikipedia) {
								html += "<li><a href=\"" + contents.links.wikipedia + "\" class=\"w3-bar-item w3-button\" target=\"_blank\">";
								html += "<i class=\"material-icons md-lit w3-margin-right\">launch</i>&nbsp";
								html += "<img src=\"/images/Wikipedia-logo-v2.svg\" style=\"width:32px\">";
								html += "&nbsp;Wikipedia";
								html += "</a>";
							}
							if (contents.links.goodreads) {
								html += "<li><a href=\"" + contents.links.goodreads + "\" class=\"w3-bar-item w3-button\" target=\"_blank\">";
								html += "<i class=\"material-icons md-lit w3-margin-right\">launch</i>&nbsp";
								html += "<img src=\"/images/1454549125-1454549125_goodreads_misc.png\" style=\"width:32px\">";
								html += "&nbsp;Goodreads"
								html += "</a>";
							}
							if (contents.links.gutenberg) {
								html += "<li><a href=\"" + contents.links.gutenberg + "\" class=\"w3-bar-item w3-button\" target=\"_blank\">";
								html += "<i class=\"material-icons md-lit w3-margin-right\">launch</i>&nbsp";
								html += "<img src=\"/images/Project_Gutenberg_logo.svg\" style=\"width:32px\">";
								html += "&nbsp;Project&nbsp;Gutenberg"
								html += "</a>";
							}
							if (contents.links.other) {
								for (var l of contents.links.other) {
									html += "<li><a href=\"" + l.href + "\" class=\"w3-bar-item w3-button\" target=\"_blank\">";
									html += "<i class=\"material-icons md-lit w3-margin-right\">launch</i>&nbsp";
									html += l.title + "</a>"
									html += "</a>";
								}
							}
							html += "</ul>";
						}

						elmnt.innerHTML = html;
					}
					/* Remove the attribute, and call this function once more: */
					elmnt.removeAttribute("contents");
					loadsitecode();
				}
			}
			xhttp.open("GET", file, true);
			xhttp.send();
			/* Exit the function: */
			return;
		}
	}
}

// from https://www.freecodecamp.org/news/three-ways-to-title-case-a-sentence-in-javascript-676a9175eb27/
function titleCase(str) {
	return str.toLowerCase().split(' ').map(function (word) {
		if (typeof word[0] === 'undefined') {
			return undefined
		}
		return word.replace(word[0], word[0].toUpperCase());
	}).join(' ');
}

function nameCapsHTML(name) {
	// convert any word that is  all CAPS and longer than one letter
	// to BOLD and Title case
	return name.replace(/(\b[A-Z\u00C0-\u00DC][A-Z\u00C0-\u00DC\b]+\s?)+/, function (match) {
		return "<strong>" + titleCase(match.toLowerCase()) + "</strong>";
	});
}

function Navigate() {
	var z, i, elmnt, file, xhttp;
	/* Loop through a collection of all HTML elements: */
	z = document.getElementsByTagName("*");
	for (i = 0; i < z.length; i++) {
		elmnt = z[i];
		/*search for elements with a certain atrribute:*/
		file = elmnt.getAttribute("navigate");
		if (file) {
			/* Make an HTTP request using the attribute value as the file name: */
			xhttp = new XMLHttpRequest();
			xhttp.onreadystatechange = function () {
				if (this.readyState == 4) {
					if (this.status == 200) {
						// process JSON	
						var contents = JSON.parse(this.responseText);
						var path = location.pathname;
						var parts = path.split('/');
						var f;
						do {
							f = parts.pop();
						}
						while (f != null && (f == "" || f == "index.html"));

						var title = "literature.org";
						var html = "";

						// sidebar
						html += "<nav class=\"w3-sidebar w3-bar-block w3-card\" style=\"display:none\" id=\"mySidebar\">" +
							"<button class=\"w3-bar-item w3-button\" onclick=\"w3_close()\"><i class=\"material-icons\">close</i> Close</button>";

						html += "<a href=\"/\" class=\"w3-bar-item w3-button\"><i class=\"material-icons\">home</i> literature.org</a>";

						html += "<a href=\"/authors/\" class=\"w3-bar-item w3-button\"><i class=\"material-icons\">people</i> Authors</a>";
						if (contents.author) {
							html += "<a href=\"../\" class=\"w3-bar-item w3-button\"><i class=\"material-icons\">person</i> " + contents.author + "</a>";
							title = titleCase(contents.author) + " at " + title;
						}

						if (f && f != "index.html" && f != "authors") {
							html += "<a href=\"index.html\" class=\"w3-bar-item w3-button\"><i class=\"material-icons\">menu_book</i> " + contents.title + "</a>";
							if (title == "literature.org") {
								title = titleCase(contents.title) + " at " + title;
							} else {
								title = titleCase(contents.title) + " by " + title;
							}
							if (typeof contents.chapters !== 'undefined' && f.endsWith(".html")) {
								var chapter = contents.chapters.findIndex(o => o.href === f);
								// dropdown here
								html += "<button class=\"w3-bar-item w3-button\" onclick=\"w3_close()\"><i class=\"material-icons\">library_books</i></a>" + contents.chapters[chapter].title + "</button>";
							}
						}

						html += "</nav>";

						// top bar
						html += "<nav class=\"w3-bar\" style=\"font-size:24px; white-space: nowrap;\">";
						html += "<button class=\"w3-bar-item w3-button\" onclick=\"w3_open()\"><i class=\"material-icons\">menu</i></button>";

						var n;
						if (typeof contents.authors !== 'undefined' && contents.authors.length > 0) {
							n = contents.authors
						} else if (typeof contents.books !== 'undefined' && contents.books.length > 0) {
							n = contents.books
						} else {
							n = contents.chapters
						}

						if (n && f && f != "index.html") {
							var i = n.findIndex(o => o.href === f);


							if (f == "authors") {
								html += "<a href=\"/\" class=\"w3-bar-item w3-button w3-left\"><i class=\"material-icons\">home</i></a>";
							} else {
								if (contents.author == "") {
									html += "<a href=\"/authors/\" class=\"w3-bar-item w3-button w3-left\"><i class=\"material-icons\">people</i></a>";
								} else {
									// author
									html += "<a href=\"..\" class=\"w3-bar-item w3-button w3-left\"><i class=\"material-icons\">person</i></a>";
								}

								// contents page
								if (!(contents.title != "Authors" && contents.author == "")) {
									if (f.endsWith(".html")) {
										html += "<a href=\"index.html\" class=\"w3-bar-item w3-button w3-left\"><i class=\"material-icons\">menu_book</i></a>";
									} else {
										html += "<a href=\"index.html\" class=\"w3-bar-item w3-button w3-left w3-disabled\"><i class=\"material-icons\">menu_book</i></a>";
									}
								}
							}

							var prev, next;

							if (i > 0) {
								// there is a valid previous page
								prev = n[i - 1].href;
								html += "<a href=\"" + prev +
									"\" class=\"w3-bar-item w3-button\"><i class=\"material-icons\">arrow_back</i></a>";
							} else {
								html += "<div class=\"w3-bar-item w3-button w3-disabled\"><i class=\"material-icons\">arrow_back</i></div>";
							}

							if (i < n.length - 1 && contents.author != "") {
								// there is a valid next page
								next = n[i + 1].href
								html += "<a href=\"" + next +
									"\" class=\"w3-bar-item w3-button\"><i class=\"material-icons\">arrow_forward</i></a>";
							} else {
								html += "<div class=\"w3-bar-item w3-button w3-disabled\"><i class=\"material-icons\">arrow_forward</i></div>";
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

							// dropdown of pages here
							var g = n.find(o => o.href === f);
							if (g) {
								html += "<div class=\"w3-bar-item lit w3-hide-small\">" + g.title + "</div>";
								title = g.title + " - " + title;
							} else {
								html += "<a href=\"index.html\" class=\"w3-bar-item lit w3-button w3-hide-small\">";
								html += nameCapsHTML(contents.title) + "</a>";
							}

						} else if (f != null) {
							// author
							html += "<a href=\"..\" class=\"w3-bar-item w3-button w3-left\"><i class=\"material-icons\">person</i></a>";

							html += "<a href=\"index.html\" class=\"w3-bar-item w3-button\">" + contents.title + "</a>";

							title = contents.title + " - " + title;
						}
						html += "</nav>";
						elmnt.innerHTML = html;
					}
					/* Remove the attribute, and call this function once more: */
					elmnt.removeAttribute("navigate");
					document.title = title;
					loadsitecode();
				}
			}
			xhttp.open("GET", file, true);
			xhttp.send();
			/* Exit the function: */
			return;
		}
	}
}

function w3_open() {
	document.getElementById("mySidebar").style.display = "block";
}

function w3_close() {
	document.getElementById("mySidebar").style.display = "none";
}