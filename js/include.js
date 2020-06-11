function literatureFuncs() {
	includeHTML();
	contentsJSON();
	literatureNav();
	literatureHeader();
	replaceTitle();
}

var title = "";

function replaceTitle() {
	window.onload = function() {
		if (title != "") {
			document.getElementsByTagName("title")[0].text = title;
		}
	}
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
			var html = "<ul class=\"w3-ul w3-hoverable\">";
			/*
			html += "<li><h2><a href=\"index.html\">" + contents.title + "</a></h2>";
			html += "<h2><a href=\"../\">" + contents.author + "</a></h2></li>";
			
			<i class=\"material-icons\">home</i>
			
			<i class=\"material-icons\">person</i>
			<i class=\"material-icons\">menu_book</i>
			<i class=\"material-icons\">library_books</i>
			*/
			for (var c of contents.chapters) {
				html += "<li><a href=\"" + c.href + "\">";
				
				if (c.href == "authors") {
					html += "<i class=\"material-icons\">people</i> ";
				} else if (contents.title == "Authors") {
					html += "<i class=\"material-icons\">person</i> ";
				} else if (c.href && c.href.endsWith(".html")) {
					html += "<i class=\"material-icons\">library_books</i> ";
				} else {
					html += "<i class=\"material-icons\">menu_book</i> ";
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

			title = "literature.org";
			var html = "";
			// sidebar
			html += "<nav class=\"w3-sidebar w3-bar-block w3-card\" style=\"display:none\" id=\"mySidebar\">" +
							"<button class=\"w3-bar-item w3-button\" onclick=\"w3_close()\"><i class=\"material-icons\">close</i> Close</button>";

			html += "<a href=\"/\" class=\"w3-bar-item w3-button\"><i class=\"material-icons\">home</i> literature.org</a>";
			
			html += "<a href=\"/authors/\" class=\"w3-bar-item w3-button\"><i class=\"material-icons\">people</i> Authors</a>";
			if (contents.author) {
				html += "<a href=\"../\" class=\"w3-bar-item w3-button\"><i class=\"material-icons\">person</i> " + contents.author + "</a>";
				title = contents.author + " - " + title;
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

				if (chapter > 0) {
					// previous
					html += "<a href=\"" + contents.chapters[chapter-1].href +
									"\" class=\"w3-bar-item w3-button\"><i class=\"material-icons\">arrow_back</i></a>";
				} else {
					html += "<div class=\"w3-bar-item w3-button w3-disabled\"><i class=\"material-icons\">arrow_back</i></div>";
				}

				if (chapter < contents.chapters.length - 1) {
					// next
					html += "<a href=\"" + contents.chapters[chapter+1].href +
									"\" class=\"w3-bar-item w3-button\"><i class=\"material-icons\">arrow_forward</i></a>";
				} else {
					html += "<div class=\"w3-bar-item w3-button w3-disabled\"><i class=\"material-icons\">arrow_forward</i></div>";
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

function literatureHeader() {
  var z, i, elmnt, file, xhttp;
  /* Loop through a collection of all HTML elements: */
  z = document.getElementsByTagName("*");
  for (i = 0; i < z.length; i++) {
    elmnt = z[i];
    /*search for elements with a certain atrribute:*/
    file = elmnt.getAttribute("lit-head");
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
			var f = parts.pop();
			if (f) {
				var title = contents.chapters.find(o => o.href === f).title;
				var contentsHTML = "<header class=\"w3-container\"><h1><a href=\"index.html\">" + contents.title + "</a></h1>";
				contentsHTML += "<h2><a href=\"../\">" + contents.author + "</a></h2>";
				contentsHTML += "<h3>" + title + "</h3>";
				contentsHTML += "</header>";
				elmnt.innerHTML = contentsHTML;
			}
		  }
          /* Remove the attribute, and call this function once more: */
		  elmnt.removeAttribute("lit-head");
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