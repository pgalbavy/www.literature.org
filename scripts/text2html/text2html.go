package text2html

import (
	"html"
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

var otherchars []swapchars

func init() {
	parasplit = regexp.MustCompile(`(?m)(\r?\n){2,}`)
	indented = regexp.MustCompile(`(?m)^(\t| {4,})`)
	joindashedlines = regexp.MustCompile(`(?m)-\r?\n`)
	joinlines = regexp.MustCompile(`(?m)\r?\n`)
	wordwrap = regexp.MustCompile(`(.{1,60})\s(\S)`)

	otherchars = []swapchars{
		swapchars { pattern: regexp.MustCompile(`--`), replace: "&mdash;" },
		swapchars { pattern: regexp.MustCompile(`[“”“”]`), replace: "&quot;" },
	}
}

func ReplaceChars(text string) (string) {
	for _, swap := range otherchars {
		text = swap.pattern.ReplaceAllString(text, swap.replace)
	}
	return text
}

func ConvertString(text string) (string) {
	paras := parasplit.Split(text, -1)

	for p, para := range paras {
		if indented.MatchString(para) {
			para = joinlines.ReplaceAllString(para, "<br/>\n")

			para = html.EscapeString(para)
			para = ReplaceChars(para)

			paras[p] = "<blockquote>\n" + para + "\n</blockquote>\n"
		} else {
			para = joindashedlines.ReplaceAllString(para, "")
			para = joinlines.ReplaceAllString(para, " ")
			para = wordwrap.ReplaceAllString(para, "$1\n\t$2")
			para = html.EscapeString(para)
			para = ReplaceChars(para)
			paras[p] = "<p>\n\t" + para + "\n</p>\n"
		}

		

	}
	return strings.Join(paras, "")
}