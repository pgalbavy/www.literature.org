package main

import (
	"path/filepath"
	"flag"
	"fmt"
	"io/ioutil"
	"log"
	"os"
	"sort"
	"strings"
	"regexp"
	"time"
	"unicode"

	"github.com/pgalbavy/www.literature.org/scripts/literature"

	"golang.org/x/text/transform"
    "golang.org/x/text/unicode/norm"
)


const defrootdir = "/var/www/www.literature.org"

const templates = "templates"
const index = "index.html"

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

func main() {
	var force bool

	userconf := literature.LoadConfig("")

	flag.BoolVar(&force, "f", false, "Overwrite existing directories")

	var rootdir string
	flag.StringVar(&rootdir, "r", literature.FirstString(userconf.Rootdir, defrootdir), "Root directory of website files")

	flag.Parse()

	// utf8/unicode to ascii for filesystem names
	t := transform.Chain(norm.NFD, transform.RemoveFunc(isMn), norm.NFC)
	dashre := regexp.MustCompile(`[ _]`)

	var dir string
	dirs := flag.Args()

	if len(dirs) > 1 {
		log.Fatal("No more than one directory allowed")
	} else if len(dirs) == 0 {
		dir = "."
	} else {
		dir = dirs[0]
	}
	absdir, err := filepath.Abs(dir)
	if err != nil {
		log.Fatal(err)
	}

	fmt.Printf("publishing files from %q\n", absdir)

	var contents literature.Contents
	literature.ReadJSON(filepath.Join(dir, "contents.json"), &contents)

	title := contents.Title
	author := contents.Author
	chapters := contents.Chapters

	if title == "" || author == "" || len(chapters) == 0 {
		log.Fatal("contents.json not in correct format")
	}

	fmt.Printf("publishing %q by %q\n", title, author)
	// transform title and author into filesystem versions

	title, _, _ = transform.String(t, title)
	re := regexp.MustCompile(`[^\w ]+`)
	title = re.ReplaceAllString(title, "")
	title = dashre.ReplaceAllString(title, "-")
	title = strings.ToLower(title)

	author, _, _ = transform.String(t, author)
	re = regexp.MustCompile(`^(.*?)\s([A-Z\s]+)$`)
	author = re.ReplaceAllString(author, "$2-$1")
	author = dashre.ReplaceAllString(author, "-")
	author = strings.ToLower(author)

	// build destination path
	destdir := filepath.Join(rootdir, "authors", author, title)
	fmt.Printf("publishing to %q\n", destdir)

	// check if files are already in place
	if destdir != absdir {
		err := os.MkdirAll(destdir, 0755)
		if err != nil {
			log.Fatal(err)
		}
		d, err := os.Open(absdir)
		if err != nil {
			log.Fatal(err)
		}
		files, err := d.Readdirnames(-1)
		if err != nil {
			log.Fatal(err)
		}

		for _, file := range files {
			if strings.HasPrefix(file, ".") {
				continue
			}
			err := os.Rename(filepath.Join(absdir, file), filepath.Join(destdir, file))
			if err != nil {
				log.Fatal(err)
			}
		}
	}

	// at this point all the files are in place
	// now check linkage in parent contents.json files
	var topjson, authorjson literature.Contents
	var changelog []literature.Changelog

	// first, does the author already exist ?
	literature.ReadJSON(filepath.Join(rootdir, "authors", "contents.json"), &topjson)
	err = literature.ReadJSON(filepath.Join(rootdir, "changelog.json"), &changelog)
	if err != nil {
		fmt.Printf("readJSON: %q\n", err)
		changelog = make([]literature.Changelog, 1)
	}

	var authorindex int = -1
	for i, entry := range topjson.Chapters {
		if entry.HREF == author {
			authorindex = i
		}
	}

	lastUpdated := time.Now().UTC().Format(time.RFC3339)

	if authorindex == -1 {
		newauthor := literature.Chapter{ HREF: author, Title: contents.Author }
		topjson.Chapters = append(topjson.Chapters, newauthor)

		sort.Slice(topjson.Chapters, func(i, j int) bool {
			// sort by directory names
			return topjson.Chapters[i].HREF < topjson.Chapters[j].HREF
		})
		// write out new top level contents.json
		topjson.LastUpdated = lastUpdated
		topjson.Title = "Authors"
		literature.WriteJSON(filepath.Join(rootdir, "authors", "contents.json"), topjson)
		//i, _ := ioutil.ReadFile(filepath.Join(rootdir, templates, index))
		//ioutil.WriteFile(filepath.Join(rootdir, "authors", index), i, 0644)
	}

	// next, check for an existing title
	literature.ReadJSON(filepath.Join(rootdir, "authors", author, "contents.json"), &authorjson)

	var chapter int = -1
	for i, entry := range authorjson.Chapters {
		if entry.HREF == title {
			chapter = i
		}
	}

	// add and sort (until we have publication years, by title)
	if chapter == -1 {
		newchapter := literature.Chapter{ HREF: title, Title: contents.Title }
		authorjson.Chapters = append(authorjson.Chapters, newchapter)
		sort.Slice(authorjson.Chapters, func(i, j int) bool {
			return authorjson.Chapters[i].Title < authorjson.Chapters[j].Title
		})
		// write out new author contents.json
		authorjson.Title = contents.Author
		authorjson.LastUpdated = lastUpdated
		literature.WriteJSON(filepath.Join(rootdir, "authors", author, "contents.json"), authorjson)

		i, _ := ioutil.ReadFile(filepath.Join(rootdir, templates, index))
		ioutil.WriteFile(filepath.Join(rootdir, "authors", author, index), i, 0644)
	}

	// update changelog
	newchangelog := literature.Changelog{ HREF: "/authors/" + author + "/" + title,
										  Title: contents.Title + " by " + contents.Author,
										  LastUpdated: lastUpdated }
	changelog = append(changelog, newchangelog)
	literature.WriteJSON(filepath.Join(rootdir, "changelog.json"), changelog)
}

func isMn(r rune) bool {
    return unicode.Is(unicode.Mn, r) // Mn: nonspacing marks
}