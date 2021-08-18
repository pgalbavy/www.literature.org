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

async function Changelog() {
	const ATTR = "changelog";
	for (let section of document.getElementsByTagName("section")) {
		if (!section.hasAttribute(ATTR)) {
			continue;
		}
		let file = section.getAttribute(ATTR);
		let changelogs = await fetchAsJSON(file);
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

		// Remove the attribute, and call this function once again
		// Not necessary but maintains same pattern as other functions
		section.removeAttribute(ATTR);
		Changelog();
	}
}

async function fetchAsJSON(url) {
	return fetch(url)
		.then(response => response.json());
}