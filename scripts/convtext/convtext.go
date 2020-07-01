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

var blankline, end, dashre, firstre *regexp.Regexp
var maxtitle int
var writedir string
var pdigits int
var prename string

// local struct to hold per-level config and vars
// level[0] => chapters
// level[1] => parts
// etc.
type Level struct {
	text      string
	inctitle  bool
	dontinfer bool
	matchskip bool
	titlepara bool
	sep       string
	sepre     *regexp.Regexp
	chunks    []Chunk
}

type Chunk struct {
	title    string
	html     string
	filename string
}

var levels []Level
var chap *Level
var part *Level

func init() {
	// look for paragraph seperator (two EOL sequences)
	blankline = regexp.MustCompile(`(\r?\n){2,}`)

	// discard from this pattern onward
	end = regexp.MustCompile(`(?mi)^.*end of .*project gutenberg`)

	dashre = regexp.MustCompile(`[ _]`)

	firstre = regexp.MustCompile(`(?mi)\A(?:the )?project gutenberg(?: ebook of|'s| ebook,) ([\pL\.,!\-’'"\(\) ]+),\s+by\s+([\pL\.\-'\(\) ]+)\,?\r?$`)

	levels = make([]Level, 2, 5)

	chap = &levels[0]
	chap.inctitle = false
	chap.dontinfer = false
	chap.matchskip = false
	chap.titlepara = false

	part = &levels[1]
	part.inctitle = false
	part.dontinfer = false
	part.matchskip = false
	part.titlepara = false

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

	flag.StringVar(&chap.text, "c", "Chapter", "Text for chapter level splits")
	flag.StringVar(&part.text, "p", "", "Text for part level seperator - empty means ignore")

	var skipto, skipafter string
	flag.StringVar(&skipto, "skipto", "", "Skipto regexp before reading text")
	flag.StringVar(&skipafter, "skipafter", "", "Skipafter regexp truncate text")
	flag.IntVar(&maxtitle, "maxtitle", 60, "Max Title Length (when on another line)")
	flag.StringVar(&writedir, "output", ".", "Destination directory")

	flag.StringVar(&prename, "pre", "", "Rename chapter-00 to this")
	flag.Parse()

	levelOpts(chap, "Chapter", `(?m)^(((?i)`+chap.text+`\s)|[IVXC]+\.?\s*$)`)
	levelOpts(part, "Part", "")

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
	head := string(hd)

	ft, err := ioutil.ReadFile(filepath.Join(rootdir, templates, footer))
	if err != nil {
		log.Fatal(err)
	}
	foot := string(ft)

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

	for l := len(levels)-1; l >= 0; l-- {
		level := levels[l]
		if l == 0 {
			splitfile(text, levels, head, foot, 1, &contents)
		} else {
			if level.sep != "" {
				parts := level.sepre.Split(text, -1)

				pdigits = 2
				if len(parts) > 100 {
					pdigits = 3
				}
		
				for p, text := range parts {
					// just consume the paragraph after the part / book heading
					// as it's a title and we skip those for now
					if level.titlepara {
						t := blankline.Split(text, 3)
						// 0 = rest of part line, 1 = next para, 2 = rest of text
						fmt.Printf("t: %q, %q\n", t[0], t[1])
						if t != nil && len(t[1]) < maxtitle {
							text = t[2]
						}
					}
		
					// parts are linearly numbered for now
					splitfile(text, levels, head, foot, p, &contents)
				}	
			}
		}
	}

	contents.LastUpdated = time.Now().UTC().Format(time.RFC3339)
	literature.WriteJSON(filepath.Join(writedir, "contents.json"), contents)

	// copy index template
	i, _ := ioutil.ReadFile(filepath.Join(rootdir, templates, index))
	ioutil.WriteFile(filepath.Join(writedir, index), i, 0644)
}

// split the text into chunks and write them out as html - this is the final step
func splitfile(data string, levels []Level,
	head string, foot string, partnum int, contents *literature.Contents) {

	chap := levels[0]
	part := levels[1]

	partprefix := ""
	partformat := ""

	if part.text != "" {
		parttitle := fmt.Sprintf("%s %%d - ", part.text)
		// replace spaces and underscores
		pt := dashre.ReplaceAllString(strings.ToLower(part.text), "-")
		partpre := fmt.Sprintf("%s-%%0%dd-", pt, pdigits)

		partprefix = fmt.Sprintf(partpre, partnum)
		partformat = fmt.Sprintf(parttitle, partnum)
	}

	// strip last lines for source footers (gutenberg etc.)
	if end.MatchString(data) {
		ends := end.Split(data, 2)
		data = ends[0]
	}

	parts := chap.sepre.Split(data, -1)
	titles := chap.sepre.FindAllString(data, -1)

	// parts[0] + titles[0] + parts[1] + titles[1] + ... + title[N-1] + part[N]

	// we defer chapprefix creation until here to check for 2 or 3 digits
	var cdigits = 2
	if len(parts) > 100 {
		cdigits = 3
	}
	titleformat := partformat + fmt.Sprintf("%s %%d", chap.text)
	// replace spaces and underscores
	ct := dashre.ReplaceAllString(strings.ToLower(chap.text), "-")
	fileprefix := partprefix + fmt.Sprintf("%s-%%0%dd", ct, cdigits)

	cn := 0

	// if we are processing parts then chapters start immediately at 1 after
	// the part split. otherwise chapters start at 0 for the starting-text
	/* if part.text != "" {
		cn = 1
	} */

	for pn, pt := range parts {
		chunk := Chunk{title: "", html: "", filename: ""}

		if chap.inctitle && pn > 0 {
			chunk.title = titles[pn-1]
		}

		// chap.matchskip and chap.titlepara

		// split on first blankline line(s) and process first part(s), pass on the rest
		// paras[] = "LINE-AFTER-CHAPSEP[BLANK]PARA[BLANK]PARA2"
		paras := blankline.Split(pt, 3)

		n := len(paras)

		// if all we have is the first paragraph then skip
		if len(paras) < 2 {
			// skip
			continue
		}

		paraaftermatch := paras[0] // rest-of-para after match, check chap.matchskip

		// infer = assume chapter title is NUMBER [PUNC] [SPACE TITLE]

		var err error

		if !chap.dontinfer {
			var rcn int
			rcn, paraaftermatch = roman(paraaftermatch)
			if rcn == 0 {
				_, err = fmt.Sscanf(paraaftermatch, "%d", &rcn)
				if err != nil {
					rcn = cn
				} else {
					paraaftermatch = strings.TrimLeft(paraaftermatch, "0123456789")
				}
			}
			cn = rcn
		}

		if !chap.matchskip {
			chunk.title += paraaftermatch
			pt = strings.Join(paras[1:], "\n\n")
		}

		// append next para to any existing title, but limit to maxtitle chars
		if chap.titlepara {
			if len(paras[1]) < maxtitle {
				chunk.title += strings.TrimSpace(blankline.ReplaceAllString(paras[1], " "))

				// we've used paras[1] so move on
				if n == 3 {
					pt = paras[2]
				}
			}
		}

		// strip annoying prefixes
		spacere := regexp.MustCompile(`\s+`)
		chunk.title = spacere.ReplaceAllString(chunk.title, " ")
		chunk.title = strings.Trim(chunk.title, " .-_—")
		chunk.title = text2html.PreHTMLReplaceChars(chunk.title)

		// convert
		chunk.filename = fmt.Sprintf(fileprefix, cn) + ".html"
		if cn == 0 && prename != "" {
			chunk.filename = strings.ToLower(prename) + ".html"
		}

		if len(pt) > 0 {
			chunk.html = head + text2html.ConvertString(pt) + foot
		}

		if (cn != 0 && partnum != 0) || (partnum < 2 && prename != "") {
			// update contents
			var c literature.Chapter
			c.HREF = chunk.filename
			if cn == 0 && prename != "" {
				c.Title = prename
			} else {
				c.Title = fmt.Sprintf(titleformat, cn)
				chunk.title = strings.Trim(chunk.title, " .-_—")
				if len(chunk.title) > 0 {
					c.Title += " - " + strings.Title(strings.ToLower(chunk.title))
					// revert 'S and 'T etc.
					re := regexp.MustCompile(`[[:alpha:]]'[[:upper:]]`)
					c.Title = re.ReplaceAllStringFunc(c.Title, strings.ToLower)
				}
			}
			contents.Chapters = append(contents.Chapters, c)
		}

		chap.chunks = append(chap.chunks, chunk)

		// no skip, inc default chap num but this can be updated if infer is on
		cn++
	}
	writeChunks(chap)
}

func writeChunks(level Level) {
	var wg sync.WaitGroup

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

func levelOpts(level *Level, defaultText string, defaultSep string) {
	// no option set? return without processing
	if level.text == "" {
		return
	}

	// process -c/-p options - '[TEXT][/REGEXP/[FLAGS]]'
	optre := regexp.MustCompile(`([^/]*)+(/.*/(\w+)*)?`)

	opts := optre.FindStringSubmatch(level.text)
	if opts[0] == "" {
		log.Fatal("level args must be in the format '[TEXT][/REGEXP/[itnkp]]'")
	}

	if opts[1] == "" {
		level.text = defaultText
	} else {
		level.text = opts[1]
	}

	opts[2] = strings.TrimSuffix(opts[2], opts[3])
	levelreg := strings.Trim(opts[2], "/")
	if levelreg == "" {
		level.sep = defaultSep
	} else {
		level.sep = `(?m)` + levelreg
	}

	// check flags
	if opts[3] != "" {
		if strings.Contains(opts[3], "t") {
			level.inctitle = true
		}

		if strings.Contains(opts[3], "n") {
			level.dontinfer = true
		}

		// skipping the rest of line implies no infer of chapter number
		if strings.Contains(opts[3], "k") {
			level.matchskip = true
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
