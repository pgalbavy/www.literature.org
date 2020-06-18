package main

// add links to an author or an individual book

import (
	"path/filepath"
	"flag"
	"fmt"
	"net/url"
	"regexp"
	"time"

	"github.com/pgalbavy/www.literature.org/scripts/literature"
)

var wikipediaRE, goodreadsRE, gutenbergRE *regexp.Regexp

func init() {
	wikipediaRE = regexp.MustCompile(`^https?://.*?\.wikipedia\.`)
	goodreadsRE = regexp.MustCompile(`https?://.*?\.goodreads\.`)
	gutenbergRE = regexp.MustCompile(`https?://.*?\.gutenberg\.`)

}

func main() {
	var remove, list bool
	var dir string

	flag.BoolVar(&remove, "r", false, "(notyet) remove link(s)")
	flag.BoolVar(&list, "l", false, "(notyet) list link(s)")

	flag.StringVar(&dir, "d", ".", "Directory of content to update (location of contents.json)")
	flag.Parse()

	var contents literature.Contents
	literature.ReadJSON(filepath.Join(dir, "contents.json"), &contents)

	// default to current dir if no directories supplied

	var updated = false
	URLS:
	for _, u := range flag.Args() {
		if _, err := url.Parse(u); err != nil {
			fmt.Printf("invalid URL %q, skipping\n", u)
			continue
		}
	
		// only check for other urls as duplicates because it's a list
		// other, non slice/list links are just updated
		switch {
		case wikipediaRE.MatchString(u):
			contents.Links.Wikipedia = u
			updated = true
		case goodreadsRE.MatchString(u):
			contents.Links.Goodreads = u
			updated = true
		case gutenbergRE.MatchString(u):
			contents.Links.Gutenberg = u
			updated = true
		default:
			o := &contents.Links.Other
			for _, v := range *o {
				if v == u {
					fmt.Printf("url %q already in contents.json\n")
					break URLS
				}
			}
			*o = append(*o, u)
			updated = true
		}
	}

	if updated {
		contents.LastUpdated = time.Now().UTC().Format(time.RFC3339)
		literature.WriteJSON(filepath.Join(dir, "contents.json"), &contents)
	}
}
