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
		let header = appendElement(document, section, 'header', null, [
			[ 'class', 'w3-container w3-teal' ]
		]);
		let h3 = appendElement(document, header, 'h3', 'Recently Added Books');
		appendElement(document, h3, 'span', ' (Latest First)', [
			[ 'class', 'w3-hide-small' ]
		]);
		let ul = appendElement(document, section, 'ul', null, [
			[ 'class', 'w3-bar-block w3-ul w3-hoverable' ]
		]);

		for (let c of changelogs.sort(lastUpdatedSort).slice(0, 5)) {
			let d = new Date(c.lastupdated);

			let li = appendElement(document, ul, 'li', null, [
				[ 'class', 'w3-bar-item w3-border w3-padding-small' ]
			]);
			let ahref = appendElement(document, li, 'a', " " + nameCapsHTML(c.title), [
				[ 'href', c.href ],
				[ 'class', 'w3-bar-item litleft w3-button w3-large w3-padding-small' ]
			]);
			appendElement(document, ahref, 'span', " (added " + d.toLocaleDateString('en-GB') + ")", [
				[ 'class', 'w3-hide-small w3-hide-medium' ]
			]);
			prependElement(document, ahref, 'i', 'menu_book', [
				[ 'class', 'material-icons md-lit w3-margin-right' ]
			]);
		}

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