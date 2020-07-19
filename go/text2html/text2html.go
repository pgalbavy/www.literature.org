package text2html // import literature.org/go/text2html

import (
	"log"
	"regexp"
	"strings"
)

type Para struct {
	Type string
	Text string
}

var parasplit *regexp.Regexp
var indented *regexp.Regexp
var joindashedlines, joinlines *regexp.Regexp
var wordwrap *regexp.Regexp

type swapchars struct {
	pattern *regexp.Regexp
	replace string
}

var prehtmlrules, charrules, linerules []swapchars

func init() {
	parasplit = regexp.MustCompile(`(?m)(\r?\n){2,}`)
	indented = regexp.MustCompile(`(?m)^(\t| {4,})`)
	joindashedlines = regexp.MustCompile(`(?m)-\r?\n`)
	joinlines = regexp.MustCompile(`(?m)\r?\n`)
	wordwrap = regexp.MustCompile(`(.{60,}?)\s(\S)`)


	prehtmlrules = []swapchars{
		swapchars { pattern: regexp.MustCompile(`(?m)&`), replace: `&amp;` },
		swapchars { pattern: regexp.MustCompile(`(?m)<`), replace: `&lt;` },
		swapchars { pattern: regexp.MustCompile(`(?m)>`), replace: `&gt;` },
		swapchars { pattern: regexp.MustCompile(`(?m)[“”]`), replace: `"` },
	}

	charrules = []swapchars{
		// four or more dashes with a horizontal rule
		swapchars { pattern: regexp.MustCompile(`(?m)-{4,}`), replace: "<hr>" },
		// all remaining pairs of dashes become an HTML mdash
		swapchars { pattern: regexp.MustCompile(`(?m)--`), replace: "&mdash;" },
	}

	linerules = []swapchars{
		// a double dash followed by a capital is the name of an author or reference. move them to a new line
		swapchars { pattern: regexp.MustCompile(`(?m)^([[:blank:]]*)?(.*)--([[:upper:]])`), replace: "$1$2\n$1&mdash;$3" },
		// a sequence of 3 or more capitals (or dots) are emphasised
		swapchars { pattern: regexp.MustCompile(`(?m)([[:upper:]][[:upper:]\.-]{2,}[^[:lower:]]*)\b`), replace: "<em>$1</em>"},
		// underscores at a word boundary enclose emphasised text, hashes mean string
		swapchars { pattern: regexp.MustCompile(`(?ms)\b_(.*?)_\b`), replace: "<em>$1</em>"},
		swapchars { pattern: regexp.MustCompile(`(?ms)\b/(.*?)/\b`), replace: "<em>$1</em>"},
		swapchars { pattern: regexp.MustCompile(`(?ms)\#(.*?)#\b`), replace: "<strong>$1</strong>"},
	}
}

func PreHTMLReplaceChars(text string) (string) {
	return replace(text, prehtmlrules)
}

func ReplaceChars(text string) (string) {
	return replace(text, charrules)
}

func ReplaceLines(text string) (string) {
	return replace(text, linerules)
}


func replace(text string, rules []swapchars) (string) {
	for _, swap := range rules {
		text = swap.pattern.ReplaceAllString(text, swap.replace)
	}
	return text
}

var poemopen = `<div class="w3-container w3-justify poem">` + "\n<span></span>"
var poemclose = `</div>`

/*
	ConvertString - Given a plain text string, return a HTML marked-up one

	This is done in multiple stages;
	1. All single char changes are done (variety of quote styles to play quotes etc.)
	2. HTML escaping is applied to the whole input
	3. The string is split into paragraphs - a black line between blocks of text
	4. Each paragraph is checked if indented, and if so gets special treatmant
	   as it's likely a quote or a poem. Sequenctial indented paragraphs are surrounded
	   by their own <div>
	5. Other paragraphs have rules applied to process specific queues such as emphasis
	   etc.
*/
func ConvertString(text string) (string) {
	// stage 1 - global substitution of character sets as required
	text = PreHTMLReplaceChars(text)

	paras := parasplit.Split(text, -1)

	for p, para := range paras {

		// a line with four or more leading spaces (to avoid paras indented by just two)
		if indented.MatchString(para) {
			para = ReplaceLines(para)
			para = joinlines.ReplaceAllString(para, "<br/>\n")
			para = ReplaceChars(para)

			// if there are deeper indents on lines after the first, force non-breaking
			// spaces after the common indent depth
			// 1. count indent on first line
			// 2. build regexp using prefix based on above
			// 3. replace all other leading whitespace with non-breaking

			indent := regexp.MustCompile(`^[[:space:]]+`) // first line only, no multiline required
			spaces := indent.FindString(para)

			removeSpaces, err := regexp.Compile(`(?m)^` + spaces) // just strip them
			if err != nil {
				log.Fatal("regexp compile failed: %q", spaces)
			}
			para = removeSpaces.ReplaceAllString(para, "")

			lines := strings.Split(para, "\n")
			para = ""
			for _, line := range lines {
				spaces = indent.FindString(line)
				para += strings.Repeat("&nbsp;", len(spaces)) + line[len(spaces):] + "\n"
			}

			// was the previous para also a poem/quote ? if so, merge with a blank line?
			if p > 0 && strings.HasSuffix(paras[p-1], poemclose + "\n") {
				paras[p-1] = paras[p-1][:len(paras[p-1])-len(poemclose)-1]
				paras[p] = strings.Join([]string{ "<p>", para, "</p>", poemclose, "" }, "\n")
			} else {
				paras[p] = strings.Join([]string{ poemopen, "<p>", para, "</p>", poemclose, "" }, "\n")
			}
		} else {
			para = ReplaceLines(para)
			para = joindashedlines.ReplaceAllString(para, "")
			para = joinlines.ReplaceAllString(para, " ")
			para = wordwrap.ReplaceAllString(para, "$1\n$2")
			para = ReplaceChars(para)
			paras[p] = "<p>" + para + "</p>\n\n"
		}
	}
	return strings.Join(paras, "")
}