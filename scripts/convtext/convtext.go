/*
 * The original repo can be found at:
 * https://github.com/pgalbavy/www.literature.org
 */

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

	"github.com/pgalbavy/www.literature.org/scripts/literature"
	"github.com/pgalbavy/www.literature.org/scripts/text2html"
)

const defrootdir = "/var/www/www.literature.org"

const templates = "templates"
const header = "header.html"
const footer = "footer.html"
const index = "index.html"

var blankline, end, dashre, puncre, firstre *regexp.Regexp
var maxtitle int
var writedir string
var prename string

// local struct to hold per-level config and vars
// level[0] => chapters
// level[1] => parts
// etc.
type Level struct {
	title   string
	inctitlematch  bool
	dontinfer bool
	skiptitleline bool
	titlepara bool
	sep       string
	sepre     *regexp.Regexp
	parts	  []string
	index	  int
	chunks    []Chunk
	header		string
	footer		string
}

type Chunk struct {
	title    string
	html     string
	filename string
}

var levels []Level

func init() {
	// look for paragraph seperator (two EOL sequences)
	blankline = regexp.MustCompile(`(\r?\n){2,}`)

	dashre = regexp.MustCompile(`[ _]+`)
	puncre = regexp.MustCompile(`[[:punct:][:cntrl:]]+`)

	firstre = regexp.MustCompile(`(?mi)\A(?:the )?project gutenberg(?: ebook of|'s| ebook,) ([\pL\.,!\-’'"\(\) ]+),\s+by\s+([\pL\.\-'\(\) ]+)\,?\r?$`)

	levels = make([]Level, 2, 5)
}

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

	flag.StringVar(&levels[0].title, "c", "Chapter", "Text for chapter level splits")
	flag.StringVar(&levels[1].title, "p", "", "Text for part level seperator - empty means ignore")

	var skipto, skipafter string
	flag.StringVar(&skipto, "skipto", "", "Skipto regexp before reading text")
	flag.StringVar(&skipafter, "skipafter", `(?i)^.*end of .*project gutenberg`, "Skipafter regexp truncate text")
	flag.IntVar(&maxtitle, "maxtitle", 60, "Max Title Length (when on another line)")
	flag.StringVar(&writedir, "output", ".", "Destination directory")

	flag.StringVar(&prename, "pre", "", "Rename chapter-00 to this")
	flag.Parse()

	levelOpts(&levels[0], "Chapter")
	levelOpts(&levels[1], "Part")

	// save command line, even if it is not much use
	contents.Cmdline = os.Args

	var file string
	files := flag.Args()

	if len(files) != 1 {
		log.Fatal("Exaclty one source required")
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
	n := firstre.FindStringSubmatch(text)
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

	if skipto != "" {
		re, err := regexp.Compile("(?m)" + skipto)
		if err != nil {
			log.Fatal(err)
		}

		parts := re.Split(text, 2)
		if len(parts) == 2 {
			text = parts[1]
		}
	}

	if skipafter != "" {
		re, err := regexp.Compile("(?m)" + skipafter)
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

	splitlevel(text, &levels, len(levels)-1, &contents)

	contents.LastUpdated = time.Now().UTC().Format(time.RFC3339)
	literature.WriteJSON(filepath.Join(writedir, "contents.json"), contents)

	// copy index template
	i, _ := ioutil.ReadFile(filepath.Join(rootdir, templates, index))
	ioutil.WriteFile(filepath.Join(writedir, index), i, 0644)
}

// given the "text" in a level, split it up further based on settings and return
// the results as a slice of text segments 

// pass the file name formats down as we go?

func splitlevel(leveltext string, levels *[]Level, l int, contents *literature.Contents) {
	if l == 0 {
		splittofiles(leveltext, levels, contents)
	} else {
		level := &(*levels)[l]
		if level.sep == "" {
			// if level is unset, then make it "1" and not "0"
			level.index = 1
			splitlevel(leveltext, levels, l-1, contents)
			return
		}
		level.parts = level.sepre.Split(leveltext, -1)

		var parttext string
		for level.index, parttext = range level.parts {
			if level.titlepara {
				t := blankline.Split(parttext, 3)
				// 0 = rest of part line, 1 = next para, 2 = rest of text
				if t != nil && len(t[1]) < maxtitle {
					parttext = t[2]
				}
			}

			// recurse	
			splitlevel(parttext, levels, l-1, contents)
		}
	}
}

// always called for level[0], so based on index values build prefix
// and format
func partnames(levels *[]Level) (partprefix string, partformat string) {
	partprefix = ""
	partformat = ""

	for l := len(*levels)-1; l >= 0; l-- {
		level := (*levels)[l]
		// skip levels without a prefix
		if level.sep == "" {
			continue;
		}

		if level.title != "" {
			title := fmt.Sprintf("%s %%d", level.title)
			// replace spaces and underscores
			filetitle := dashre.ReplaceAllString(puncre.ReplaceAllString(strings.ToLower(level.title), ""), "-")
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

// split the lowest level text into named files, using upper level to build the filename
func splittofiles(text string, levels *[]Level, contents *literature.Contents) {
	level := &(*levels)[0]

	fileprefix, titleformat := partnames(levels)

	parts := level.sepre.Split(text, -1)
	titles := level.sepre.FindAllString(text, -1)
	level.chunks = []Chunk{}

	chapternumber := 0

	if (*levels)[1].index != 1 {
		chapternumber = 1
	}
 
	for partnum, parttext := range parts {
		chunk := Chunk{title: "", html: "", filename: ""}

		if level.inctitlematch && partnum > 0 {
			chunk.title = titles[partnum-1]
		}

		// level.skiptitleline and level.titlepara

		// split on first blankline line(s) and process first part(s), pass on the rest
		// paras[] = "LINE-AFTER-CHAPSEP[BLANK]PARA[BLANK]PARA2"
		paras := blankline.Split(parttext, 3)

		n := len(paras)

		// if all we have is the first paragraph then skip
		if n < 2 {
			// skip
			continue
		}

		// infer = assume chapter title is NUMBER [PUNC] [SPACE TITLE]

		var err error

		if !level.dontinfer {
			var romanchapternum int
			romanchapternum, paras[0] = roman(paras[0])
			if romanchapternum == 0 {
				_, err = fmt.Sscanf(paras[0], "%d", &romanchapternum)
				if err != nil {
					romanchapternum = chapternumber
				} else {
					paras[0] = strings.TrimLeft(paras[0], "0123456789")
				}
			}
			chapternumber = romanchapternum
		}

		if !level.skiptitleline {
			chunk.title += paras[0]
		}
		parttext = strings.Join(paras[1:], "\n\n")
		
		// append next para to any existing title, but limit to maxtitle chars
		if level.titlepara {
			if len(paras[1]) < maxtitle {
				chunk.title += strings.TrimSpace(blankline.ReplaceAllString(paras[1], " "))

				// we've used paras[1] so move on
				if n == 3 {
					parttext = paras[2]
				}
			}
		}

		if len(parttext) > 0 {
			chunk.html = level.header + text2html.ConvertString(parttext) + level.footer
		} else {
			chapternumber++
			continue
		}

		// strip annoying prefixes
		spacere := regexp.MustCompile(`\s+`)
		chunk.title = spacere.ReplaceAllString(chunk.title, " ")
		chunk.title = strings.Trim(chunk.title, " .-_—")
		chunk.title = text2html.PreHTMLReplaceChars(chunk.title)

		// convert
		chunk.filename = fmt.Sprintf(fileprefix, chapternumber) + ".html"

		if (chapternumber == 0 || (chapternumber == 1 && (*levels)[1].index == 0)) && prename != "" {
			// looking to rename part 1, chapter-00
			var chapter literature.Chapter
			chunk.filename = dashre.ReplaceAllString(puncre.ReplaceAllString(strings.ToLower(prename), ""), "-") + ".html"
			chapter.HREF = chunk.filename
			chapter.Title = prename
			contents.Chapters = append(contents.Chapters, chapter)
			prename = "" // only one of these ever
		} else {
			// other stuff
			var chapter literature.Chapter
			chapter.HREF = chunk.filename
			chapter.Title = fmt.Sprintf(titleformat, chapternumber)
			chunk.title = strings.Trim(chunk.title, " .-_—")
			if len(chunk.title) > 0 {
				chapter.Title += " - " + strings.Title(strings.ToLower(chunk.title))
				// revert 'S and 'T etc.
				re := regexp.MustCompile(`[[:alpha:]]'[[:upper:]]`)
				chapter.Title = re.ReplaceAllStringFunc(chapter.Title, strings.ToLower)
			}
			contents.Chapters = append(contents.Chapters, chapter)
		}

		level.chunks = append(level.chunks, chunk)

		// no skip, inc default chap num but this can be updated if infer is on
		chapternumber++
	}
	fmt.Printf("writing %d chunks\n", len(level.chunks))
	writeChunks(level.chunks)
}

func writeChunks(chunks []Chunk) {
	var wg sync.WaitGroup

	for _, chunk := range chunks {
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

func levelOpts(level *Level, defaultText string) {
	// no option set? return without processing
	if level.title == "" {
		return
	}

	// process -c/-p options - '[TEXT][/REGEXP/[FLAGS]]'
	optre := regexp.MustCompile(`([^/]*)+(/.*/(\w+)*)?`)

	opts := optre.FindStringSubmatch(level.title)
	if opts[0] == "" {
		log.Fatal("level args must be in the format '[TEXT][/REGEXP/[itnkp]]'")
	}

	// opts[1] => title
	// opts[2] => regexp seperator
	// opts[3] => flags

	if opts[1] == "" {
		level.title = defaultText
	} else {
		level.title = opts[1]
	}

	// at this point opts[2] still has delimiters and flags attached
	opts[2] = strings.TrimSuffix(opts[2], opts[3])
	levelreg := strings.Trim(opts[2], "/")
	if levelreg == "" {
		level.sep = `(?m)^(((?i)` + level.title + `\s)|[IVXLC]+\.?\s*$)`
	} else {
		level.sep = `(?m)^` + levelreg
	}

	// check flags
	if opts[3] != "" {
		if strings.Contains(opts[3], "t") {
			level.inctitlematch = true
		}

		if strings.Contains(opts[3], "n") {
			level.dontinfer = true
		}

		// skipping the rest of line implies no infer of chapter number
		if strings.Contains(opts[3], "k") {
			level.skiptitleline = true
			level.dontinfer = true
		}

		if strings.Contains(opts[3], "p") {
			level.titlepara = true
		}

	}

	var err error
	level.sepre, err = regexp.Compile(level.sep)
	if err != nil {
		log.Fatal(err)
	}
}
