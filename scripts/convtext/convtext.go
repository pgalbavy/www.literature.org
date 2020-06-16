package main

import (
	"bytes"
	"flag"
	"fmt"
	"log"
	"io"
	"io/ioutil"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/pgalbavy/www.literature.org/scripts/literature"
)

const defrootdir = "/var/www/www.literature.org"

const templates = "templates"
const header = "header.html"
const footer = "footer.html"
const index = "index.html"

var blankline, end, dashre *regexp.Regexp
var maxtitle int
var writedir string
var pdigits int

var chapinctitle = false
var chapdontinfer = false
var chapmatchskip = false
var chappara = false

var partinctitle = false
var partdontinfer = false
var partmatchskip = false
var partpara = false

func init() {
	// look for paragraph seperator (two EOL sequences)
	blankline		= regexp.MustCompile(`(\r?\n){2,}`)

	// discard from this pattern onward
	end				= regexp.MustCompile(`(?mi)^.*end of .*project gutenberg`)

	dashre			= regexp.MustCompile(`[ _]`)
}

var parttext string
var chaptertext string

func main() {
	var contents literature.Contents

	userconf := literature.LoadConfig("")

	fmt.Printf("read config: %+v\n", userconf)

	var rootdir string
	flag.StringVar(&rootdir, "r", literature.FirstString(userconf.Rootdir, defrootdir), "Root directory of website files")

	// these are overrides, they are taken from the source data normally
	flag.StringVar(&contents.Title, "title", "", "Book title")
	flag.StringVar(&contents.Author, "author", "", "Book author")
	flag.StringVar(&contents.Source, "source", "", "Book URL override - use when processing a local file")


	// lets try "Title/REGEXP/[flags]" or "Title" or "/REGEXP/[flags]" or "//flags" as consolidated formats
	// ALL regexps will have (?m) flag added as all texts are multiline
	// also, local "flags":

	// try for excusive flags that can be mixed - lowercase = on, uppercase = off, *=default
	// include match in title (title) "t|T*"
	// infer number from match (number) "n*|N"
	// ignore rest of line (skip) "k|K*"
	// include next paragraph (para) "p*|P"

	flag.StringVar(&chaptertext, "chapters", "Chapter", "Text for chapter level splits")

	flag.StringVar(&parttext, "parts", "Part", "Text for part level seperator - empty means ignore")
	
	var skipto string
	flag.StringVar(&skipto, "skipto", "", "Skipto regexp before reading text")
	
	flag.IntVar(&maxtitle, "maxtitle", 60, "Max Title Length (when on another line)")

	flag.StringVar(&writedir, "output", "", "Destination directory")

	flag.Parse()


	optre := regexp.MustCompile(`([^/]*)+(/.*/(\w+)*)?`)

	// process -chapters option
	m := optre.FindStringSubmatch(chaptertext)
	fmt.Printf("m=%+v\n", m)
	m[2] = strings.TrimSuffix(m[2], m[3])
	if m[0] == "" {
		log.Fatal("-chapters must be in the format '[TEXT][/REGEXP/[iLNRP]]'")
	}

	if m[1] == "" {
		chaptertext = "Chapter"
	} else {
		chaptertext = m[1]
	}

	var chapsep string
	chapreg := strings.Trim(m[2], "/")	
	fmt.Printf("len(chapreg) = %d", len(chapreg))
	if chapreg == "" {
		//def is chaptertext and space (case insenstive)
		// empty regexp valid, and defaulted, when just flags passed
		chapsep = `(?m)^(((?i)` + chaptertext + `\s)|[IVXC]+[\.\r][^\.])`
	} else {
		chapsep = `(?m)` + chapreg
	}
	if m[3] != "" {
		fmt.Printf("flags: %q\n", m[3])

		// try for excusive flags that can be mixed - lowercase = true, uppercase = false, *=default
		// include match in title (title) "t|T*"
		// infer number from match (number) "n*|N"
		// ignore rest of line (skip) "k|K*"
		// include next paragraph (para) "p*|P"

		if strings.Contains(m[3], "t") {
			chapinctitle = true
		}
		
		if strings.Contains(m[3], "n") {
			chapdontinfer = true
		}

		// skipping the rest of line implies no infer of chapter number
		if strings.Contains(m[3], "k") {
			chapmatchskip = true
			chapdontinfer = true
		}

		if strings.Contains(m[3], "p") {
			fmt.Printf("here 1\n")
			chappara = true
		}

	}

	fmt.Printf("chapters=%q, chapsep=%q\n", chaptertext, chapsep)
	
	chapre, err := regexp.Compile(chapsep)
	if err != nil {
		log.Fatal(err)
	}


	// process -parts option
	pm := optre.FindStringSubmatch(parttext)

	if pm[0] == "" {
		log.Fatal("-parts must be in the format '[TEXT][/REGEXP/[iLNRP]]'")
	}

	if pm[1] == "" {
		parttext = "Part"
	} else {
		parttext = pm[1]
	}

	var partsep string
	partreg := strings.Trim(pm[2], "/")
	if partreg == "" {
		// def is none
		partsep = ""
	} else {
		partsep = `(?m)` + partreg
	}
	if pm[3] != "" {
		if strings.Contains(pm[3], "t") {
			partinctitle = true
		}
		
		if strings.Contains(pm[3], "n") {
			partdontinfer = true
		}

		// skipping the rest of line implies no infer of chapter number
		if strings.Contains(pm[3], "k") {
			partmatchskip = true
			partdontinfer = true
		}

		if strings.Contains(pm[3], "p") {
			partpara = true
		}
	}

	fmt.Printf("parts=%q, partsep=%q\n", parttext, partsep)

	if len(writedir) > 0 && writedir[len(writedir)-1:] != "/" {
		writedir += "/"
	}

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
	if (strings.HasPrefix(file, "http")) {
		fmt.Printf("fetching file %q\n", file)
		res, err := http.Get(file)
		if err != nil {
			log.Fatal(err)
		}
		f = res.Body
		if len(contents.Source) == 0 && contents.Source != "" {
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

	// skip BOM for UTF8 files
	if len(text) > 3 {
		if text[0] == 0xef && text[1] == 0xbb && text[2] == 0xbf {
			text = text[3:]
		}	
	}
	// first check first line for Gutenberg title and author
	firstre := regexp.MustCompile(`(?m)\AThe Project Gutenberg EBook of ([\w\- ]+),\s+by\s+([\w\- ]+)\r?$`)
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

	if skipto != "" {
		re, err := regexp.Compile(skipto)
		if err != nil {
			log.Fatal(err)
		}

		parts := re.Split(text, 2)
		if len(parts) == 2 {
			text = parts[1]
		}
	}

	// check for parts if defined and loop over each set
	if partsep != "" {
		re, err := regexp.Compile(partsep)
		if err != nil {
			log.Fatal(err)
		}

		parts := re.Split(text, -1)

		pdigits = 2
		if len(parts) > 100 {
			pdigits = 3
		}

		for p, part := range parts {
			splitfile(part, chapre, parttext, head, foot, p, &contents)
		}
	} else {
		splitfile(text, chapre, "", head, foot, 1, &contents)
	}

	contents.LastUpdated = time.Now().UTC().Format(time.RFC3339)
	literature.WriteJSON(filepath.Join(writedir, "contents.json"), contents)

	// copy index template
	i, _ := ioutil.ReadFile(filepath.Join(rootdir, templates, index))
	ioutil.WriteFile(writedir + index, i, 0644)
}

// split the text into chunks and write them out as html - this is the final step
func splitfile(data string, re *regexp.Regexp, parttext string,
		head string, foot string, partnum int, contents *literature.Contents) {
	partprefix := ""
	partformat := ""

	if parttext != "" {
		parttitle := fmt.Sprintf("%s %%d - ", parttext)
		// replace spaces and underscores
		pt := dashre.ReplaceAllString(strings.ToLower(parttext), "-")
		partpre := fmt.Sprintf("%s-%%0%dd-", pt, pdigits)
		fmt.Printf("parts %q -> %q and %q\n", parttext, parttitle, partprefix)

		partprefix = fmt.Sprintf(partpre, partnum)
		partformat = fmt.Sprintf(parttitle, partnum)
	}

	// strip last lines for source footers (gutenberg etc.)
	if end.MatchString(data) {
		ends := end.Split(data, 2)
		data = ends[0]
	}

	parts := re.Split(data, -1)
	titles := re.FindAllString(data, -1)

	// parts[0] + titles[0] + parts[1] + titles[1] + ... + title[N-1] + part[N]

	// we defer chapprefix creation until here to check for 2 or 3 digits
	var cdigits = 2
	if len(parts) > 100 {
		cdigits = 3
	}
	titleformat := partformat + fmt.Sprintf("%s %%d", chaptertext)
	// replace spaces and underscores
	ct := dashre.ReplaceAllString(strings.ToLower(chaptertext), "-")
	fileprefix := partprefix + fmt.Sprintf("%s-%%0%dd", ct, cdigits)
	fmt.Printf("chapters %q -> %q and %q\n", chaptertext, titleformat, fileprefix)

	var cn int

	for pn, part := range parts {
		var title = ""

		if chapinctitle && pn > 0 {
			title = titles[pn-1]
		}

		// chapmatchskip and chappara

		// split on first blankline line(s) and process first part(s), pass on the rest
		// paras[] = "LINE-AFTER-CHAPSEP[BLANK]PARA[BLANK]PARA2"
		paras := blankline.Split(part, 3)

		n := len(paras)

		// if all we have is the first paragraph then skip
		if len(paras) < 2 {
			// skip
			continue
		}

		paraaftermatch := paras[0] // rest-of-para after match, check chapmatchskip

		// infer = assume chapter title is NUMBER [PUNC] [SPACE TITLE]

		var err error

		if !chapdontinfer {
			fmt.Printf("inferring chapter number: %q\n", paraaftermatch)
			var rcn int
			rcn, paraaftermatch = roman(paraaftermatch)
			if rcn == 0 {
				rcn, err = strconv.Atoi(paraaftermatch)
				if err != nil {
					fmt.Printf("Atoi failed: %q", err)
					rcn = pn
				} else {
					paraaftermatch = strings.TrimLeft(paraaftermatch, "0123456789")
				}
			}
			fmt.Printf("after: %d = %q\n", rcn, paraaftermatch)
			cn = rcn
		}
		
		if !chapmatchskip {
			title += paraaftermatch
			part = strings.Join(paras[1:], "\n\n")
		}

		// append next para to any existing title, but limit to maxtitle chars
		if chappara {
			fmt.Printf("next para: %q\n", paras[1])
			if len(paras[1]) < maxtitle {
				title += strings.TrimSpace(blankline.ReplaceAllString(paras[1], " "))

				// we've used paras[1] so move on
				if n == 3 {
					part = paras[2]
				}
			}
		} else {
//			if n == 3 {
				// default is to reunite last two parts
//				part = paras[1] + "\n\n" + paras[2]
//			}
	
			// put next para back in text
			// part = strings.Join(paras[1:], "\n\n")
		}


		// strip annoying prefixes
		spacere := regexp.MustCompile(`\s+`)
		title = spacere.ReplaceAllString(title, " ")
		title = strings.Trim(title, " .")

		// convert
		filename := fmt.Sprintf(fileprefix, cn) + ".html"
		fmt.Printf("write cn=%d filename=%q size %d\n", cn, filename, len(part))

		html, _ := txt2html(part)

		w, err := os.Create(writedir + filename)
		if err != nil {
			log.Fatal(err)
		}
		w.WriteString(head)
		w.WriteString(html)
		w.WriteString(foot)
		w.Close()

		if (pn != 0 && partnum != 0) {
			// update contents
			var c literature.Chapter
			c.HREF = filename
			c.Title = fmt.Sprintf(titleformat, cn)
			title = strings.TrimRight(title, ".")
			if len(title) > 0 {
				c.Title += " - " + strings.Title(strings.ToLower(title))
			}
			contents.Chapters = append(contents.Chapters, c)
		}

		// no skip, inc default chap num but this can be updated if infer is on
		cn++
	}
}

func txt2html(txt string) (string, error) {
	var out bytes.Buffer

	cmd := exec.Command("txt2html", "--extract", "--eight_bit_clean")
	cmd.Stdin = bytes.NewBufferString(txt)
	cmd.Stdout = &out

	err := cmd.Run()
	if err != nil {
		log.Fatal(err)
	}
	return out.String(), nil
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
