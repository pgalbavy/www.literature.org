package main

import (
	"flag"
	"fmt"
	"io"
	"io/ioutil"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	"literature.org/go/literature"
	"literature.org/go/text2html"
)

const defrootdir = ".."

const templates = "templates"
const header = "header.html"
const footer = "footer.html"

var end *regexp.Regexp
var maxtitle int
var writedir string
var prename string

// local struct to hold per-level config and vars
// level[0] => chapters
// level[1] => parts
// etc.
type Level struct {
	title             string
	incTitleMatchFlag bool
	noInferFlag       bool
	skipTitleFlag     bool
	titleNextParaFlag bool
	seperatorRE       *regexp.Regexp
	firstMatchRE      *regexp.Regexp
	parts             []string
	index             int
	chunks            []Chunk
	header            string
	footer            string
}

type Chunk struct {
	title    string
	html     string
	filename string
}

var levels = make([]Level, 2, 5)

var blanklineRE = regexp.MustCompile(`(\r?\n){2,}`)
var dashRE = regexp.MustCompile(`[ _]+`)
var punctRE = regexp.MustCompile(`[[:punct:][:cntrl:]]+`)
var firstRE = regexp.MustCompile(`(?mi)\A(?:the )?project gutenberg(?: e\w+ of|'s| e\w+,) ([\pL\.,!\-’'"\(\) ]+),\s+by\s+([\pL\.\-'\(\) ]+)\,?\r?$`)
var optRE = regexp.MustCompile(`([^/]*)+(/.*/(\w+)*)?`)

func main() {
	var contents literature.Contents

	userconf := literature.LoadConfig("")

	fmt.Printf("read config: %+v\n", userconf)

	var rootdir string
	flag.StringVar(&rootdir, "r", literature.FirstString(userconf.Rootdir, defrootdir), "Root directory of website files")

	// these are overrides, they are taken from the source data normally
	flag.StringVar(&contents.Title, "t", "", "Book title")
	flag.StringVar(&contents.Author, "a", "", "Book author")
	flag.StringVar(&contents.Source, "s", "", "Book URL override - use when processing a local file")

	// ALL regexps will have (?m) flag prefixed as all texts are multiline
	// other, local "flags":

	// flags that can be mixed for both chapters and parts
	// "t" - include match in title (title)
	// "n" - infer number from match (number)
	// "k" - ignore rest of line (skip)
	// "p" - include next paragraph (para)

	flag.StringVar(&levels[0].title, "c", "Chapter", "Text for chapter level splits ('[TEXT][/REGEXP/[FLAGS]]')")
	flag.StringVar(&levels[1].title, "p", "", "Text for part level seperator - empty means ignore ('[TEXT][/REGEXP/[FLAGS]]')")

	var firstmatch, discard string
	flag.StringVar(&firstmatch, "f", "", "firstmatch regexp before reading text")
	flag.StringVar(&discard, "d", `(?i)^.*end of .*project gutenberg`, "Discard regexp to truncate text")
	flag.IntVar(&maxtitle, "m", 60, "Max Title Length (when on another line)")
	flag.StringVar(&writedir, "dir", ".", "Destination directory")

	flag.StringVar(&prename, "pre", "", "Rename chapter-00 to this")
	flag.Usage = func() {
		fmt.Fprintf(flag.CommandLine.Output(), "Usage of %s:\n", os.Args[0])
		flag.PrintDefaults()
		fmt.Fprintf(flag.CommandLine.Output(), `
Flags for -c and -p are:
t - include match in title (title)
n - infer number from match (number) 
k - ignore rest of line (skip)
p - include next paragraph (para)

`)
	}
	flag.Parse()

	levelOpts(&levels[0], "Chapter")
	levelOpts(&levels[1], "Part")

	// save command line, even if it is not much use
	contents.Cmdline = os.Args
	contents.Cmdline[0] = filepath.Base(contents.Cmdline[0])

	var file string
	files := flag.Args()

	if len(files) != 1 {
		log.Fatal("Exactly one source required")
	}
	file = files[0]

	// read header and footer files for later use as they will be added
	// to each generated HTML file
	hd, err := ioutil.ReadFile(filepath.Join(rootdir, templates, header))
	if err != nil {
		log.Fatal(err)
	}
	levels[0].header = string(hd)

	ft, err := ioutil.ReadFile(filepath.Join(rootdir, templates, footer))
	if err != nil {
		log.Fatal(err)
	}
	levels[0].footer = string(ft)

	var f io.ReadCloser
	if strings.HasPrefix(file, "http") {
		fmt.Printf("fetching file %q\n", file)
		res, err := http.Get(file)
		if err != nil {
			log.Fatal(err)
		}
		f = res.Body
		if contents.Source == "" {
			contents.Source = file
		}
	} else {
		var err error
		fmt.Printf("reading file %q\n", file)
		f, err = os.Open(file)
		if err != nil {
			log.Fatal(err)
		}
	}
	var content, _ = ioutil.ReadAll(f)
	f.Close()
	text := string(content)

	// pre-process loaded text

	// skip BOM for UTF8 files
	if len(text) > 3 {
		if text[0] == 0xef && text[1] == 0xbb && text[2] == 0xbf {
			text = text[3:]
		}
	}

	// first check first line for Gutenberg title and author
	n := firstRE.FindStringSubmatch(text)
	if len(n) == 3 {
		if contents.Title == "" {
			contents.Title = n[1]
		}
		if contents.Author == "" {
			aw := strings.Split(n[2], " ")
			aw[len(aw)-1] = strings.ToUpper(aw[len(aw)-1])
			contents.Author = strings.Join(aw, " ")
		}
	}
	fmt.Printf("Processing text: %q by %q\n", contents.Title, contents.Author)

	// just prefix the sep regexp, at the highest enabled level, with a non-capturing prefix?
	// nope XXX
	if firstmatch != "" {
		for l := len(levels) - 1; l >= 0; l-- {
			level := &(levels)[l]
			// skip levels without a prefix
			if level.seperatorRE == nil {
				continue
			}
			level.firstMatchRE = regexp.MustCompile(`(?m)` + firstmatch)
			break
		}
	}

	if discard != "" {
		re, err := regexp.Compile("(?m)" + discard)
		if err != nil {
			log.Fatal(err)
		}

		parts := re.Split(text, 2)
		if len(parts) == 2 {
			text = parts[0]
		}
	}

	// split file starting at the top level and working down to level[0]

	// for each level above 0, split and store the slice of parts in the level and then recurse
	// down for each part to the next lower level

	splitLevel(text, &levels, len(levels)-1, &contents)

	contents.LastUpdated = time.Now().UTC().Format(time.RFC3339)
	literature.WriteJSON(filepath.Join(writedir, "contents.json"), contents)
}

// given the "text" in a level, split it up further based on settings and return
// the results as a slice of text segments

// pass the file name formats down as we go?

func splitLevel(text string, levels *[]Level, l int, contents *literature.Contents) {
	if l == 0 {
		// lowest levels, just save into files
		saveToFiles(text, levels, contents)
		return
	}

	level := &(*levels)[l]
	if level.seperatorRE == nil {
		// if level is unset, then make it "1" and not "0"
		level.index = 1
		splitLevel(text, levels, l-1, contents)
		return
	}

	if level.firstMatchRE != nil {
		parts := level.firstMatchRE.Split(text, 2)
		// can save chunk specially here
		text = parts[1]
		level.firstMatchRE = nil
	}
	level.parts = level.seperatorRE.Split(text, -1)

	var parttext string
	for level.index, parttext = range level.parts {
		// 0 = rest of part line, 1 = next para, 2 = rest of text
		if t := blanklineRE.Split(parttext, 3); t != nil {
			if !level.noInferFlag && len(t[0]) > 0 {
				t[0], level.index = infernumber(t[0], level.index)
			}

			if level.titleNextParaFlag && t != nil && len(t[1]) < maxtitle {
				parttext = t[2]
			}
		}
		// recurse
		splitLevel(parttext, levels, l-1, contents)
	}
}

// split the lowest level text into named files, using upper level to build the filename
func saveToFiles(text string, levels *[]Level, contents *literature.Contents) {
	var wg sync.WaitGroup

	level := &(*levels)[0]

	fileprefix, titleformat := partnames(levels)

	if level.firstMatchRE != nil {
		parts := level.firstMatchRE.Split(text, 2)
		// can save chunk specially here
		text = parts[1]
		level.firstMatchRE = nil
	}

	parts := level.seperatorRE.Split(text, -1)
	titles := level.seperatorRE.FindAllString(text, -1)
	level.chunks = []Chunk{}

	chapterNum := 0

	for partnum, parttext := range parts {
		chunk := Chunk{}

		// try to rescue the title roman number
		if partnum > 0 {
			if level.incTitleMatchFlag {
				chunk.title = titles[partnum-1]
			}
			parttext = level.seperatorRE.ReplaceAllString(titles[partnum-1], "${roman}") + "\n" + parttext
		}

		// level.skiptitleline and level.titlepara

		// split on first blankline line(s) and process first part(s), pass on the rest
		// paras[] = "LINE-AFTER-CHAPSEP[BLANK]PARA[BLANK]PARA2"
		paras := blanklineRE.Split(parttext, 3)

		n := len(paras)

		// if all we have is the first paragraph then skip
		if n < 2 {
			// skip
			continue
		}
		//fmt.Printf("para0:\n%q\n", paras[0])

		// infer = assume chapter title is NUMBER [PUNC] [SPACE TITLE]

		if !level.noInferFlag {
			paras[0], chapterNum = infernumber(paras[0], chapterNum)
		}

		if !level.skipTitleFlag {
			chunk.title += paras[0]
		}
		parttext = strings.Join(paras[1:], "\n\n")

		// append next para to any existing title, but limit to maxtitle chars
		if level.titleNextParaFlag {
			if len(paras[1]) < maxtitle {
				chunk.title += strings.TrimSpace(blanklineRE.ReplaceAllString(paras[1], " "))

				// we've used paras[1] so move on
				if n == 3 {
					parttext = paras[2]
				}
			}
		}

		if len(parttext) > 0 {
			chunk.html = level.header + text2html.ConvertString(parttext) + level.footer
		} else {
			// skip empty parts (like part 0)
			chapterNum++
			continue
		}

		// strip annoying prefixes
		spaceRE := regexp.MustCompile(`\s+`)
		chunk.title = spaceRE.ReplaceAllString(chunk.title, " ")
		chunk.title = strings.Trim(chunk.title, " .-_—")
		chunk.title = text2html.PreHTMLReplaceChars(chunk.title)

		// convert
		chunk.filename = fmt.Sprintf(fileprefix, chapterNum) + ".html"

		if prename != "" && (chapterNum == 0 || (chapterNum == 1 && (*levels)[1].index == 0)) {
			// looking to rename part 1, chapter-00 ro "preface" etc.
			var chapter literature.Chapter
			chunk.filename = dashRE.ReplaceAllString(punctRE.ReplaceAllString(strings.ToLower(prename), ""), "-") + ".html"
			chapter.HREF = chunk.filename
			chapter.Title = prename
			contents.Chapters = append(contents.Chapters, chapter)
			prename = "" // only one of these, ever
		} else {
			// normal parts
			var chapter literature.Chapter
			chapter.HREF = chunk.filename
			chapter.Title = fmt.Sprintf(titleformat, chapterNum)
			chunk.title = strings.Trim(chunk.title, " .-_—:")
			if len(chunk.title) > 0 {
				chapter.Title += " - " + strings.Title(strings.ToLower(chunk.title))
				// revert 'S and 'T etc.
				re := regexp.MustCompile(`[[:alpha:]]'[[:upper:]]`)
				chapter.Title = re.ReplaceAllStringFunc(chapter.Title, strings.ToLower)
			}
			if chapterNum > 0 {
				contents.Chapters = append(contents.Chapters, chapter)
			}
		}

		level.chunks = append(level.chunks, chunk)

		// no skip, inc default chap num but this can be updated if infer is on
		chapterNum++
	}

	// write out the chunks, us go routines as there are no dependencies between chunks
	for _, chunk := range level.chunks {
		wg.Add(1)
		go func(wg *sync.WaitGroup, chunk Chunk) {
			defer wg.Done()

			if len(chunk.html) == 0 {
				fmt.Printf("not writing zero len %q\n", chunk.filename)
				return
			}
			fmt.Printf("written %q size %d\n", chunk.filename, len(chunk.html))

			w, err := os.Create(filepath.Join(writedir, chunk.filename))
			if err != nil {
				log.Fatal(err)
			}
			w.WriteString(chunk.html)
			w.Close()
		}(&wg, chunk)
	}
	wg.Wait()
}

// below from https://github.com/chonla/roman-number-go/blob/master/roman.go

var num = map[string]int{
	"I": 1,
	"V": 5,
	"X": 10,
	"L": 50,
	"C": 100,
	"D": 500,
	"M": 1000,
}

// ToNumber to covert roman numeral to decimal
// modified to return the next unread character too
func roman(n string) (int, string) {
	out := 0
	ln := len(n)
	for i := 0; i < ln; i++ {
		c := string(n[i])
		vc, ok := num[c]
		if !ok {
			return out, n[i:]
		}
		if i < ln-1 {
			cnext := string(n[i+1])
			vcnext := num[cnext]
			if vc < vcnext {
				out += vcnext - vc
				i++
			} else {
				out += vc
			}
		} else {
			out += vc
		}
	}
	return out, ""
}

func infernumber(text string, number int) (string, int) {
	var romanchapternum int
	romanchapternum, text = roman(text)
	if romanchapternum == 0 {
		_, err := fmt.Sscanf(text, "%d", &romanchapternum)
		if err != nil {
			romanchapternum = number
		} else {
			text = strings.TrimLeft(text, "0123456789")
		}
	}
	number = romanchapternum
	return text, number
}

func levelOpts(level *Level, defaultText string) {
	// no option set? return without processing
	if level.title == "" {
		return
	}

	// process -c/-p options - '[TEXT][/REGEXP/[FLAGS]]'

	opts := optRE.FindStringSubmatch(level.title)
	if opts[0] == "" {
		log.Fatal("level args must be in the format '[TEXT][/REGEXP/[FLAGS]]'")
	}

	// opts[1] => title
	// opts[2] => regexp seperator
	// opts[3] => flags

	if opts[1] == "" {
		level.title = defaultText
	} else {
		level.title = opts[1]
	}

	var seperator string
	// at this point opts[2] still has delimiters and flags attached
	opts[2] = strings.TrimSuffix(opts[2], opts[3])
	levelreg := strings.Trim(opts[2], "/")
	if levelreg == "" {
		seperator = `(?m)^(((?i)` + level.title + `\s(?P<roman>[IVXLC]+))|(?P<roman>[IVXLC]+)[\.\s]*$)`
	} else {
		seperator = `(?m)^` + levelreg
	}

	// check flags
	if opts[3] != "" {
		if strings.Contains(opts[3], "t") {
			level.incTitleMatchFlag = true
		}

		if strings.Contains(opts[3], "n") {
			level.noInferFlag = true
		}

		// skipping the rest of line implies no infer of chapter number
		if strings.Contains(opts[3], "k") {
			level.skipTitleFlag = true
			level.noInferFlag = true
		}

		if strings.Contains(opts[3], "p") {
			level.titleNextParaFlag = true
		}

	}

	level.seperatorRE = regexp.MustCompile(seperator)
}

// always called for level[0], so based on index values build prefix
// and format
func partnames(levels *[]Level) (partprefix string, partformat string) {
	partprefix = ""
	partformat = ""

	for l := len(*levels) - 1; l >= 0; l-- {
		level := (*levels)[l]
		// skip levels without a prefix
		if level.seperatorRE == nil {
			continue
		}

		if level.title != "" {
			title := fmt.Sprintf("%s %%d", level.title)
			// replace spaces and underscores
			filetitle := dashRE.ReplaceAllString(punctRE.ReplaceAllString(strings.ToLower(level.title), ""), "-")
			digits := 2
			if len(level.parts) > 100 {
				digits = 3
			}
			partpre := fmt.Sprintf("%s-%%0%dd", filetitle, digits)

			if l == 0 {
				partprefix += partpre
				partformat += title
			} else {
				partprefix += fmt.Sprintf(partpre, level.index) + "-"
				partformat += fmt.Sprintf(title, level.index) + " - "
			}
		}
	}
	return
}
