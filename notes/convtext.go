
package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"io"
	"io/ioutil"
	"net/http"
	"os"
	"os/exec"
	"regexp"
	"strings"
)

var templates = "/var/www/www.literature.org/templates/"

var header = "header.html"
var footer = "footer.html"
var index = "index.html"

var contents interface{}
type Contents struct {
	Title		string		`json:"title"`
	Author		string		`json:"author"`
	Source		string		`json:"source"`
	Chapters	[]Chapter	`json:"chapters"`
}

type Chapter struct {
	HREF		string		`json:"href"`
	Title		string		`json:"title"`
}

func main() {
	var contents Contents

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

	flag.Parse()

	// read header and footer files for later use

	h, err := ioutil.ReadFile(templates + header)
	if err != nil {
		log.Fatal(err)
	}
	head := string(h)

	f, err := ioutil.ReadFile(templates + footer)
	if err != nil {
                log.Fatal(err)
        }
	foot := string(f)

	for _, file := range flag.Args() {
		var f io.ReadCloser
		if (strings.HasPrefix(file, "http")) {
			fmt.Printf("fetching file %q\n", file)
			res, err := http.Get(file)
			if err != nil {
				log.Fatal(err)
			}
			f = res.Body
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

		fmt.Printf("len=%d\n", len(text))			

		// check for parts if defined and loop over each set
		if partsep != "" {
			parts := splitstring(text, partsep)
			for p, part := range parts {
				if p == 0 {
					continue
				}
				prefix := fmt.Sprintf(partprefix, p) + chapprefix
				title := fmt.Sprintf(parttitle, p) + chaptitle

				splitfile(part, chapsep, prefix, title, head, foot, &contents)
			}
		} else {
			splitfile(text, chapsep, chapprefix, chaptitle, head, foot, &contents)
		}

		w, err := os.Create("contents.json")
		if err != nil {
			log.Fatal(err)
		}
		j, err := json.MarshalIndent(contents, "", "\t")
		if err != nil {
			log.Fatal(err)
		}
		w.Write(j)
		w.Close()

		// copy index template

		i, _ := ioutil.ReadFile(templates + index)
		ioutil.WriteFile(index, i, 0644)
	}
}

// called for each volume/book/part the results in more strings not files
func splitstring(data string, partsep string) ([]string) {
	fmt.Printf("compiling regexp %q\n", partsep)
	re, err := regexp.Compile(partsep)
	if err != nil {
		log.Fatal(err)
	}

	fmt.Printf("searching for %q\n", partsep)
	return re.Split(data, -1)
}

// split the text into chunks and write them out as html - this is the final step
func splitfile(data string, chapsep string, fileprefix string, titleformat string,
		head string, foot string, contents *Contents) {

	fmt.Printf("compiling regexp %q\n", chapsep)
	re, err := regexp.Compile(chapsep)
	if err != nil {
		log.Fatal(err)
	}

	fmt.Printf("searching\n")
	parts := re.Split(data, -1)

	for p, part := range parts {
		if p == 0 {
			continue
		}
		filename := fmt.Sprintf(fileprefix, p) + ".html"
		fmt.Printf("write filename=%q size %d\n", filename, len(part))

		html, _ := txt2html(part)

		w, err := os.Create(filename)
		if err != nil {
			log.Fatal(err)
		}
		w.WriteString(head)
		w.WriteString(html)
		w.WriteString(foot)
		w.Close()

		// update contents
		var c Chapter
		c.HREF = filename
		c.Title = fmt.Sprintf(titleformat, p)
		contents.Chapters = append(contents.Chapters, c)
	}
}


func txt2html(txt string) (string, error) {
	var out bytes.Buffer

	cmd := exec.Command("txt2html", "--extract")
	cmd.Stdin = bytes.NewBufferString(txt)
	cmd.Stdout = &out

	err := cmd.Run()
	if err != nil {
		return "", err
	}
	return out.String(), nil
}
