package main

import (
	"encoding/json"
	"path/filepath"
	"flag"
	"fmt"
	"io/ioutil"
	"log"
	"os"
	"strings"
	"regexp"
	"unicode"

	"golang.org/x/text/transform"
    "golang.org/x/text/unicode/norm"
)


const defrootdir = "/var/www/www.literature.org"


// take a directory and based on the contents.json file link it into
// the site tree and git commit and rclone sync it based on settings

// usage: publish dir [dir] ...

// open dir/content.json and unmarshal
// check validty (are all files mentioned avaulable, and index.html)
// convert author and title into file path components
// from root of site check for existing directories (or files that clash!)
// build directory tree, copy files but only into empty dirs (unless forced)
// copy templates top parents
// or open existing higher level contents.json and edit
//
// print URL to stdout for review, wait for confirm
// git add, commit and push
// rclone sync

var contents interface{}
type Contents struct {
	Title		string		`json:"title"`
	Author		string		`json:"author"`
	Source		string		`json:"source"`
	Cmdline		[]string	`json:"cmdline"`
	Chapters	[]Chapter	`json:"chapters"`
}

type Chapter struct {
	HREF		string		`json:"href"`
	Title		string		`json:"title"`
}

func main() {
	var force bool
	flag.BoolVar(&force, "f", false, "Overwrite existing directories")

	var rootdir string
	flag.StringVar(&rootdir, "r", defrootdir, "Root directory of website files")

	flag.Parse()

	// utf8/unicode to ascii for filesystem names
	t := transform.Chain(norm.NFD, transform.RemoveFunc(isMn), norm.NFC)
	dashre := regexp.MustCompile(`[ _]`)

	for _, dir := range flag.Args() {
		fmt.Printf("looking in %q\n", dir)
		var contents Contents
		loadJSON(filepath.Join(dir, "contents.json"), &contents)
		//fmt.Printf("contents =\n%+v\n", contents)

		title := contents.Title
		author := contents.Author
		chapters := contents.Chapters

		if title == "" || author == "" || len(chapters) == 0 {
			log.Fatal("contents.json not fully formed")
		}

		// transform title and author into filesystem versions

		title, _, _ = transform.String(t, title)
		re := regexp.MustCompile(`[^\w ]+`)
		title = re.ReplaceAllString(title, "")
		title = dashre.ReplaceAllString(title, "-")
		title = strings.ToLower(title)
		fmt.Printf("title = %q\n", title)

    	author, _, _ = transform.String(t, author)
		re = regexp.MustCompile(`^(.*?)\s([A-Z\s]+)$`)
		author = re.ReplaceAllString(author, "$2-$1")
		author = dashre.ReplaceAllString(author, "-")
		author = strings.ToLower(author)
		fmt.Printf("author %q\n", author)

		// build destination path
		destdir := filepath.Join(rootdir, "authors", author, title)

		// check if files are already in place
		absdir, err := filepath.Abs(dir)
		if err != nil {
			log.Fatal(err)
		}
		fmt.Printf("abs path %q\n", absdir)
		if destdir != absdir {
			fmt.Printf("files need to be moved\n")
		}

		// at this point all the files are in place
		// now check linkage in parent contents.json files
		var authorjson Contents
		loadJSON(filepath.Join(rootdir, "authors", author, "contents.json"), &authorjson)
		//fmt.Printf("authorJSON\n%+v\n", authorjson)

	}
}

// needs cleaning, but does the job
func loadJSON(file string, j interface{}) {
	c, err := os.Open(file)
	if err != nil {
		log.Fatal(err)
	}
	
	cf, err := ioutil.ReadAll(c)
	if err != nil {
		log.Fatal(err)
	}

	err = json.Unmarshal(cf, &j)
	if err != nil {
		log.Fatal(err)
	}
}

func isMn(r rune) bool {
    return unicode.Is(unicode.Mn, r) // Mn: nonspacing marks
}