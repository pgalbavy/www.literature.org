package main

import (
	"path/filepath"
	"flag"
	"fmt"
	"log"
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

	fmt.Printf("read config: %+v\n", userconf)

	flag.BoolVar(&force, "f", false, "Overwrite existing directories")

	var rootdir string
	flag.StringVar(&rootdir, "r", literature.FirstString(userconf.Rootdir, defrootdir), "Root directory of website files")

	flag.Parse()

	// utf8/unicode to ascii for filesystem names
	t := transform.Chain(norm.NFD, transform.RemoveFunc(isMn), norm.NFC)
	dashre := regexp.MustCompile(`[ _]`)

	for _, dir := range flag.Args() {
		fmt.Printf("looking in %q\n", dir)
		var contents literature.Contents
		literature.ReadJSON(filepath.Join(dir, "contents.json"), &contents)
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
		var topjson, authorjson literature.Contents

		// first, does the author already exist ?
		literature.ReadJSON(filepath.Join(rootdir, "authors", "contents.json"), &topjson)
		fmt.Printf("topjson\n%+v\n", topjson)
		var authorindex int = -1
		for i, entry := range topjson.Chapters {
			if entry.HREF == author {
				authorindex = i
				fmt.Printf("found author %q as %q\n", author, entry.Title)
			}
		}
		if authorindex == -2 {
			newauthor := literature.Chapter{ HREF: author, Title: contents.Author }
			topjson.Chapters = append(topjson.Chapters, newauthor)
			sort.Slice(topjson.Chapters, func(i, j int) bool {
				// sort by SURNAME
				return topjson.Chapters[i].Title < topjson.Chapters[j].Title
			})
			fmt.Printf("new top contents: \n%+v\n", topjson)
			// write out new top level contents.json
			topjson.LastUpdated = time.Now().UTC().Format(time.RFC3339)
			literature.WriteJSON(filepath.Join(rootdir, "authors", "contents.json"), topjson)
		}

		literature.ReadJSON(filepath.Join(rootdir, "authors", author, "contents.json"), &authorjson)
		//fmt.Printf("authorjson\n%+v\n", authorjson)

		var chapter int = -1
		for i, entry := range authorjson.Chapters {
			if entry.HREF == title {
				chapter = i
				fmt.Printf("found book %q as %q\n", title, entry.Title)
			}
		}

		// add and sort (until we have publication years, by title)
		if chapter == -1 {
			newchapter := literature.Chapter{ HREF: title, Title: contents.Title }
			authorjson.Chapters = append(authorjson.Chapters, newchapter)
			sort.Slice(authorjson.Chapters, func(i, j int) bool {
				return authorjson.Chapters[i].Title < authorjson.Chapters[j].Title
			})
			fmt.Printf("new author contents: \n%+v\n", authorjson)
			// write out new author contents.json
			authorjson.LastUpdated = time.Now().UTC().Format(time.RFC3339)
			literature.WriteJSON(filepath.Join(rootdir, "authors", author, "contents.json"), authorjson)
		}
	}
}

func isMn(r rune) bool {
    return unicode.Is(unicode.Mn, r) // Mn: nonspacing marks
}