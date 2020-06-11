function literatureFuncs() {
	includeHTML();
	contentsJSON();
	literatureNav();
}

function includeHTML() {
	var z, i, elmnt, file, xhttp;
	/* Loop through a collection of all HTML elements: */
	z = document.getElementsByTagName("*");
	for (i = 0; i < z.length; i++) {
	elmnt = z[i];
	/*search for elements with a certain atrribute:*/
	file = elmnt.getAttribute("w3-include-html");
	if (file) {
		/* Make an HTTP request using the attribute value as the file name: */
		xhttp = new XMLHttpRequest();
		xhttp.onreadystatechange = function() {
		if (this.readyState == 4) {
			if (this.status == 200) {elmnt.innerHTML = this.responseText;}
			if (this.status == 404) {elmnt.innerHTML = "Page not found.";}
			/* Remove the attribute, and call this function once more: */
			elmnt.removeAttribute("w3-include-html");
			literatureFuncs();
		}
		}
	
		xhttp.open("GET", file, true);
		xhttp.send();
		/* Exit the function: */
		return;
	}
	}
}

function contentsJSON() {
	var z, i, elmnt, file, xhttp;
	/* Loop through a collection of all HTML elements: */
	z = document.getElementsByTagName("*");
	for (i = 0; i < z.length; i++) {
	elmnt = z[i];
	/*search for elements with a certain atrribute:*/
	file = elmnt.getAttribute("contents-json");
	if (file) {
		/* Make an HTTP request using the attribute value as the file name: */
		xhttp = new XMLHttpRequest();
		xhttp.onreadystatechange = function() {
		if (this.readyState == 4) {
			if (this.status == 200) {
			// process JSON	
			var contents = JSON.parse(this.responseText);
			var html = "<ul class=\"w3-bar-block w3-ul w3-hoverable\">";

			for (var c of contents.chapters) {
				html += "<li><a href=\"" + c.href + "\" class=\"w3-bar-item w3-button\">";
				
				if (c.href == "authors") {
					html += "<i class=\"material-icons md-lit\">people</i> ";
				} else if (contents.title == "Authors") {
					html += "<i class=\"material-icons md-lit\">person</i> ";
				} else if (c.href && c.href.endsWith(".html")) {
					html += "<i class=\"material-icons md-lit\">library_books</i> ";
				} else {
					html += "<i class=\"material-icons md-lit\">menu_book</i> ";
				}
				
				html += c.title + "</a></li>";
			}
			html += "</ul>";
			
			elmnt.innerHTML = html;
			}
			/* Remove the attribute, and call this function once more: */
			elmnt.removeAttribute("contents-json");
			literatureFuncs();
		}
		}
		xhttp.open("GET", file, true);
		xhttp.send();
		/* Exit the function: */
		return;
	}
	}
}

function literatureNav() {
	var z, i, elmnt, file, xhttp;
	/* Loop through a collection of all HTML elements: */
	z = document.getElementsByTagName("*");
	for (i = 0; i < z.length; i++) {
	elmnt = z[i];
	/*search for elements with a certain atrribute:*/
	file = elmnt.getAttribute("lit-nav");
	if (file) {
		/* Make an HTTP request using the attribute value as the file name: */
		xhttp = new XMLHttpRequest();
		xhttp.onreadystatechange = function() {
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
						title = contents.author + " at " + title;
					}

					if (f && f != "index.html" && f != "authors") {
						html += "<a href=\"index.html\" class=\"w3-bar-item w3-button\"><i class=\"material-icons\">menu_book</i> " + contents.title + "</a>";
						title = contents.title + " - " + title;
						if (f.endsWith(".html")) {
							var chapter = contents.chapters.findIndex(o => o.href === f);
							// dropdown here
							html += "<button class=\"w3-bar-item w3-button\" onclick=\"w3_close()\"><i class=\"material-icons\">library_books</i></a>" + contents.chapters[chapter].title + "</button>";
						}
					}

					html += "</nav>";

					// top bar
					html += "<nav class=\"w3-bar\">";
					html += "<button class=\"w3-bar-item w3-button\" onclick=\"w3_open()\"><i class=\"material-icons\">menu</i></button>";

					if (f && f != "index.html") {
						var chapter = contents.chapters.findIndex(o => o.href === f);

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

						if (chapter > 0) {
							// there is a valid previous page
							prev = contents.chapters[chapter-1].href;
							html += "<a href=\"" + prev +
											"\" class=\"w3-bar-item w3-button\"><i class=\"material-icons\">arrow_back</i></a>";
						} else {
							html += "<div class=\"w3-bar-item w3-button w3-disabled\"><i class=\"material-icons\">arrow_back</i></div>";
						}

						if (chapter < contents.chapters.length - 1 && contents.author != "") {
							// there is a valid next page
							next = contents.chapters[chapter+1].href
							html += "<a href=\"" + next +
											"\" class=\"w3-bar-item w3-button\"><i class=\"material-icons\">arrow_forward</i></a>";
						} else {
							html += "<div class=\"w3-bar-item w3-button w3-disabled\"><i class=\"material-icons\">arrow_forward</i></div>";
						}

						// update link rel="next" values
						var links = document.head.getElementsByTagName("link");
						for (var l = 0; l < links.length; l++) {
							var gotnext = false, gotprev = false;
							if (links[l].rel == "next") {
								gotnext = true;
							} else if (links[i].rel == "prev") {
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
						var g = contents.chapters.find(o => o.href === f);
						if (g) {
							html += "<div class=\"w3-bar-item w3-button w3-hide-small\">" + g.title + "</div>";
							title = g.title + " - " + title;
						} else {
							html += "<a href=\"index.html\" class=\"w3-bar-item w3-button w3-hide-small\">" + contents.title + "</a>";
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
				elmnt.removeAttribute("lit-nav");
				document.title = title;
				literatureFuncs();
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