/*
 * The original repo can be found at:
 * https://github.com/pgalbavy/www.literature.org
 */
"use strict";

function loadchangelog() {
	Changelog();
}

function lastUpdatedSort(a, b) {
	let date1 = new Date(a.lastupdated)
	let date2 = new Date(b.lastupdated)

	return date1 == date2 ? 0 : date1 > date2 ? -1 : 1
}

function Changelog() {
	const ATTR = "changelog";
	for (let section of document.getElementsByTagName("section")) {
		let file = section.getAttribute(ATTR);
		if (file) {
			/* Make an HTTP request using the attribute value as the file name: */
			let req = new XMLHttpRequest();
			req.onreadystatechange = function () {
				if (this.readyState == 4) {
					if (this.status == 200) {
						// process JSON	
						let changelogs = JSON.parse(this.responseText);
						let html = "";
						html += "<header class=\"w3-container w3-teal\"><h3>Recently Added Books<span class=\"w3-hide-small\">";
						html += " (Latest First)</span></h3></header>";
						html += "<ul class=\"w3-bar-block w3-ul w3-hoverable\">";

						for (let c of changelogs.sort(lastUpdatedSort).slice(0, 5)) {
							let d = new Date(c.lastupdated);

							html += "<li class=\"w3-bar-item w3-border w3-padding-small\">";
							html += "<a href=\"" + c.href + "\" class=\"w3-bar-item litleft w3-button w3-large w3-padding-small\">";
							html += "<i class=\"material-icons md-lit w3-margin-right\">menu_book</i> ";

							html += nameCapsHTML(c.title);
							html += "<span class=\"w3-hide-small w3-hide-medium\"> (added " + d.toLocaleDateString() + ")</span>";
							html += "</a></li>";
						}

						html += "</ul>";

						section.innerHTML = html;
					}
					// Remove the attribute, and call this function once again
					// Not necessary but maintains same pattern as other functions
					section.removeAttribute(ATTR);
					loadchangelog();
				}
			}
			req.open("GET", file, true);
			req.send();
			/* Exit the function: */
			return;
		}
	}
}
