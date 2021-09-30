package main

import (
	"flag"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
	"unicode"

	"literature.org/go/literature"

	"golang.org/x/text/transform"
	"golang.org/x/text/unicode/norm"
)

const defrootdir = "../"

const templates = "templates"

// const index = "index.html"

// take a directory and based on the contents.json file link it into
// the site tree and git commit and rclone sync it based on settings

// usage: publish dir [dir] ...

// open dir/content.json and unmarshal
// check validty (are all files mentioned avaulable)
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
	utf8toascii := transform.Chain(norm.NFD, transform.RemoveFunc(isMn), norm.NFC)
	// these are stripped without replacement
	titlere := regexp.MustCompile(`[^\w _-]+`)
	// these are the chars to replace with a single dash
	dashre := regexp.MustCompile(`[ _]`)

	authore := regexp.MustCompile(`^(.*?)\s([A-Z\s]+)$`)

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

	title, _, _ = transform.String(utf8toascii, title)
	title = titlere.ReplaceAllString(title, "")
	title = dashre.ReplaceAllString(title, "-")
	title = strings.ToLower(title)

	author, _, _ = transform.String(utf8toascii, author)
	author = authore.ReplaceAllString(author, "$2-$1")
	author = dashre.ReplaceAllString(author, "-")
	author = strings.ToLower(author)
	author = strings.ReplaceAll(author, ".", "")

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

	// convert if old format
	if len(topjson.Chapters) != 0 {
		for _, c := range topjson.Chapters {
			topjson.Authors = append(topjson.Authors, literature.Author{c.HREF, c.Title})
		}
		topjson.Chapters = []literature.Chapter{}
	}

	var authorindex int = -1
	for i, entry := range topjson.Authors {
		if entry.HREF == author {
			authorindex = i
		}
	}

	lastUpdated := time.Now().UTC().Format(time.RFC3339)

	if authorindex == -1 {
		newauthor := literature.Author{HREF: author, Name: contents.Author}
		topjson.Authors = append(topjson.Authors, newauthor)

		// write out new top level contents.json
		topjson.LastUpdated = lastUpdated
		topjson.Title = "Authors"
		literature.WriteJSON(filepath.Join(rootdir, "authors", "contents.json"), topjson)
	}

	// next, check for an existing title
	literature.ReadJSON(filepath.Join(rootdir, "authors", author, "contents.json"), &authorjson)

	// convert "old" Chapters -> Books
	if len(authorjson.Chapters) != 0 {
		for _, c := range authorjson.Chapters {
			authorjson.Books = append(authorjson.Books, literature.Book{literature.Link{c.HREF, c.Title}, 0})
		}
		authorjson.Chapters = []literature.Chapter{}
	}

	var book int = -1
	for i, entry := range authorjson.Books {
		if entry.HREF == title {
			book = i
		}
	}

	// add and sort (until we have publication years, by title)
	if book == -1 {
		newchapter := literature.Book{literature.Link{title, contents.Title}, 0}
		authorjson.Books = append(authorjson.Books, newchapter)
		// write out new author contents.json
		authorjson.Title = contents.Author
		authorjson.LastUpdated = lastUpdated
		literature.WriteJSON(filepath.Join(rootdir, "authors", author, "contents.json"), authorjson)

		// index.html no longer required with nginx - we serve a common file instead
		// i, _ := ioutil.ReadFile(filepath.Join(rootdir, templates, index))
		// ioutil.WriteFile(filepath.Join(rootdir, "authors", author, index), i, 0644)
	}

	// update changelog
	err = literature.ReadJSON(filepath.Join(rootdir, "changelog.json"), &changelog)
	if err != nil {
		fmt.Printf("readJSON: %q\n", err)
		changelog = make([]literature.Changelog, 1)
	}

	newchangelog := literature.Changelog{Link: literature.Link{HREF: "/authors/" + author + "/" + title,
		Title: contents.Title + " by " + contents.Author},
		LastUpdated: lastUpdated}
	// only allow 100 items, rolling
	if len(changelog) > 99 {
		changelog = changelog[len(changelog)-99:]
	}
	changelog = append(changelog, newchangelog)
	literature.WriteJSON(filepath.Join(rootdir, "changelog.json"), changelog)
}

func isMn(r rune) bool {
	return unicode.Is(unicode.Mn, r) // Mn: nonspacing marks
}
