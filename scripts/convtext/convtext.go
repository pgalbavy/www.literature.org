
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

var blank, end, shortheading *regexp.Regexp
var maxtitle int
var writedir string

func init() {
	blank = regexp.MustCompile(`(\r?\n){2,}`)
	end = regexp.MustCompile(`(?mi)^.*end of .*project gutenberg`)
	shortheading = regexp.MustCompile(`(\r?\n)`)
}

func main() {
	var contents literature.Contents

	userconf := literature.LoadConfig("")

	fmt.Printf("read config: %+v\n", userconf)

	var rootdir string
	flag.StringVar(&rootdir, "r", literature.FirstString(userconf.Rootdir, defrootdir), "Root directory of website files")

	flag.StringVar(&contents.Title, "title", "", "Book title")
	flag.StringVar(&contents.Author, "author", "", "Book author")
	flag.StringVar(&contents.Source, "source", "", "Book source URL")

	var partsep, parttitle, partprefix string

	flag.StringVar(&partsep, "partsep", "", "Parts separator")
	flag.StringVar(&parttitle, "parttitle", "Part %d - ", "Part label")
	flag.StringVar(&partprefix, "partprefix", "part-%02d-", "Part prefix")

	var chapsep, chaptitle, chapprefix string

	flag.StringVar(&chapsep, "chapsep", `(?mi)^chapter\s`, "Chapter seperator")
	flag.StringVar(&chaptitle, "chaptitle", "Chapter %d", "Chapter label")
	flag.StringVar(&chapprefix, "chapterprefix", "chapter-%02d", "Chapter prefix")

	var special string
	flag.StringVar(&special, "special", "(?mi)^(preface|introduction)", "Special sections")
	
	var skipto string
	flag.StringVar(&special, "skipto", "", "Skipto regexp before reading text")
	
	flag.IntVar(&maxtitle, "maxtitle", 60, "Max Title Length (when on another line)")

	flag.StringVar(&writedir, "output", "", "Destination directory")

	flag.Parse()

	if len(writedir) > 0 && writedir[len(writedir)-1:] != "/" {
		writedir += "/"
	}

	contents.Cmdline = os.Args

	// read header and footer files for later use

	h, err := ioutil.ReadFile(filepath.Join(rootdir, templates, header))
	if err != nil {
		log.Fatal(err)
	}
	head := string(h)

	f, err := ioutil.ReadFile(filepath.Join(rootdir, templates, footer))
	if err != nil {
                log.Fatal(err)
        }
	foot := string(f)

	// we don't really do much with multiple files right now
	for _, file := range flag.Args() {
		var f io.ReadCloser
		if (strings.HasPrefix(file, "http")) {
			fmt.Printf("fetching file %q\n", file)
			res, err := http.Get(file)
			if err != nil {
				log.Fatal(err)
			}
			f = res.Body
			if len(contents.Source) == 0 {
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

		chapre, err := regexp.Compile(chapsep)
		if err != nil {
			log.Fatal(err)
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
			for p, part := range parts {
				prefix := fmt.Sprintf(partprefix, p) + chapprefix
				title := fmt.Sprintf(parttitle, p) + chaptitle

				splitfile(part, chapre, prefix, title, head, foot, p, &contents)
			}
		} else {
			splitfile(text, chapre, chapprefix, chaptitle, head, foot, 1, &contents)
		}

		contents.LastUpdated = time.Now().UTC().Format(time.RFC3339)
		literature.WriteJSON(filepath.Join(writedir, "contents.json"), contents)

		// copy index template
		i, _ := ioutil.ReadFile(filepath.Join(rootdir, templates, index))
		ioutil.WriteFile(writedir + index, i, 0644)
	}
}

// split the text into chunks and write them out as html - this is the final step
func splitfile(data string, re *regexp.Regexp, fileprefix string, titleformat string,
		head string, foot string, addcontents int, contents *literature.Contents) {
	parts := re.Split(data, -1)

	for p, part := range parts {
		var title = ""

		// strip first line(s) for chapter names

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


		// assume chapter title is NUMBER [PUNC] [SPACE TITLE]

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
		return "", err
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
