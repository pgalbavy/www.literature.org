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

var blank, end, dashre *regexp.Regexp
var maxtitle int
var writedir string

func init() {
	// look for paragraph seperator (two EOL sequences)
	blank			= regexp.MustCompile(`(\r?\n){2,}`)

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

	flag.StringVar(&contents.Title, "title", "", "Book title")
	flag.StringVar(&contents.Author, "author", "", "Book author")
	flag.StringVar(&contents.Source, "source", "", "Book URL override - use when processing a local file")


	// lets try "Title/REGEXP/[i]" or "Title" or "/REGEXP/[i]" as consilidated formats
	// ALL regexps will have (?m) flag added as all texts are multiline
	// also, local "flags": "L" (use entire line as split title), "N" (no title),
	//					    "R" (rest of line until blank line - default), "P" (next paragraph - default)
	flag.StringVar(&chaptertext, "chapters", "Chapter", "Text for chapter level splits")

	flag.StringVar(&parttext, "parts", "Part", "Text for part level seperator - empty means ignore")

	var special string
	flag.StringVar(&special, "special", "(?mi)^(preface|introduction)", "Special sections")
	
	var skipto string
	flag.StringVar(&skipto, "skipto", "", "Skipto regexp before reading text")
	
	flag.IntVar(&maxtitle, "maxtitle", 60, "Max Title Length (when on another line)")

	flag.StringVar(&writedir, "output", "", "Destination directory")

	flag.Parse()


	optre := regexp.MustCompile("([^/]*)+(/.*/)?(i?)?")

	// process -chapters option
	m := optre.FindStringSubmatch(chaptertext)

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
	if chapreg == "" {
		//def is chaptertext and space (case insenstive)
		chapsep = `(?mi)^` + chaptertext + `\s`
	} else {
		if m[3] == "i" {
			chapsep = `(?mi)` + chapreg
			fmt.Printf("case insensitive\n")
		} else {
			chapsep = `(?m)` + chapreg
		}
	}

	fmt.Printf("chapters=%q, chapsep=%q\n", chaptertext, chapsep)
	
	chapre, err := regexp.Compile(chapsep)
	if err != nil {
		log.Fatal(err)
	}


	// process -parts option
	m = optre.FindStringSubmatch(parttext)

	if m[0] == "" {
		log.Fatal("-parts must be in the format '[TEXT][/REGEXP/[iLNRP]]'")
	}

	if m[1] == "" {
		parttext = "Part"
	} else {
		parttext = m[1]
	}

	var partsep string
	partreg := strings.Trim(m[2], "/")
	if partreg == "" {
		// def is none
		partsep = ""
	} else {
		if m[3] == "i" {
			partsep = `(?mi)` + partreg
			fmt.Printf("case insensitive\n")
		} else {
			partsep = `(?m)` + partreg
		}
	}

	fmt.Printf("partss=%q, partsep=%q\n", parttext, partsep)
	



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
	firstre := regexp.MustCompile(`(?m)\AThe Project Gutenberg EBook of ([\w ]+),\s+by\s+([\w ]+)\r?$`)
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

	// check special parts first
/*
	if special != "" {
		specre, err := regexp.Compile(special)
		if err != nil {
			log.Fatal(err)
		}
		parts := specre.Split(text, -1)
	}
*/

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

		var pdigits = 2
		if len(parts) > 100 {
			pdigits = 3
		}
		parttitle := fmt.Sprintf("%s %%d - ", parttext)
		// replace spaces and underscores
		pt := dashre.ReplaceAllString(strings.ToLower(parttext), "-")
		partprefix := fmt.Sprintf("%s-%%0%dd-", pt, pdigits)
		fmt.Printf("parts %q -> %q and %q\n", parttext, parttitle, partprefix)

		for p, part := range parts {
			prefix := fmt.Sprintf(partprefix, p)
			title := fmt.Sprintf(parttitle, p)

			splitfile(part, chapre, prefix, title, head, foot, p, &contents)
		}
	} else {
		splitfile(text, chapre, "", "", head, foot, 1, &contents)
	}

	contents.LastUpdated = time.Now().UTC().Format(time.RFC3339)
	literature.WriteJSON(filepath.Join(writedir, "contents.json"), contents)

	// copy index template
	i, _ := ioutil.ReadFile(filepath.Join(rootdir, templates, index))
	ioutil.WriteFile(writedir + index, i, 0644)
}

// split the text into chunks and write them out as html - this is the final step
func splitfile(data string, re *regexp.Regexp, partprefix string, partformat string,
		head string, foot string, addcontents int, contents *literature.Contents) {
	parts := re.Split(data, -1)

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

	for p, part := range parts {
		var title = ""

		// strip first line(s) for chapter names - unless disabled

		// options: infer number + title, linear count, and/or use match as title

		// split on first blank line(s) and process first part(s), pass on the rest
		bits := blank.Split(part, 3)

		n := len(bits)

		if n == 3 {
			// default is to reunite last two parts
			part = bits[1] + "\n\n" + bits[2]
		}

		if len(bits) < 2 {
			// skip
			continue
		}

		h := bits[0]


		// infer = assume chapter title is NUMBER [PUNC] [SPACE TITLE]

		var cn int
		var err error

		cn, h = roman(h)
		if cn == 0 {
			cn, err = strconv.Atoi(h)
			if err != nil {
				cn = p
			} else {
				h = strings.TrimLeft(h, "0123456789")
			}
		}

		if m, _ := regexp.MatchString(`\w+`, h); m {
			// pull title from same line
			t := regexp.MustCompile(`[\S\.].*$`)
			title = strings.TrimSpace(t.FindString(h))
		} else {
			// pull title from next para but only if it's "short"
			if len(bits[1]) < maxtitle {
				title = strings.TrimSpace(blank.ReplaceAllString(bits[1], " "))

				// we've used bits[1] so move on
				if n == 3 {
					part = bits[2]
				}
			}
		}
		title = strings.TrimLeft(title, " .")

		// strip last lines for source footers (gutenberg etc.)

		if end.MatchString(part) {
			ends := end.Split(part, 2)
			part = ends[0]
		}

		// convert
		filename := fmt.Sprintf(fileprefix, cn) + ".html"
		fmt.Printf("write filename=%q size %d\n", filename, len(part))

		html, _ := txt2html(part)

		w, err := os.Create(writedir + filename)
		if err != nil {
			log.Fatal(err)
		}
		w.WriteString(head)
		w.WriteString(html)
		w.WriteString(foot)
		w.Close()

		if (p != 0 && addcontents != 0) {
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
