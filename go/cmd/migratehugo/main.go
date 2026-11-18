package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"html"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

type contents struct {
	Title    string    `json:"title"`
	Author   string    `json:"author"`
	Source   string    `json:"source"`
	Chapters []chapter `json:"chapters"`
}

type chapter struct {
	Href  string `json:"href"`
	Title string `json:"title"`
}

type chapterMetadata struct {
	title  string
	weight int
}

var (
	articlePattern   = regexp.MustCompile(`(?is)<article\b[^>]*>(.*?)</article>`)
	emphasisPattern  = regexp.MustCompile(`(?is)<em\b[^>]*>(.*?)</em>`)
	hrPattern        = regexp.MustCompile(`(?is)<hr\b[^>]*/?>`)
	brPattern        = regexp.MustCompile(`(?is)<br\b[^>]*/?>`)
	emptySpanPattern = regexp.MustCompile(`(?is)<span\b[^>]*>\s*</span>`)
	paragraphPattern = regexp.MustCompile(`(?is)<p\b[^>]*>(.*?)</p>`)
	tagPattern       = regexp.MustCompile(`(?is)<[^>]+>`)
	spacePattern     = regexp.MustCompile(`\s+`)
	bareParagraphs   = regexp.MustCompile(`(?i)<p\b[^>]*>`)
	bareEndParagraph = regexp.MustCompile(`(?is)</p>`)
	poemDivOpen      = regexp.MustCompile(`(?is)<div\b[^>]*class\s*=\s*["'][^"']*\bpoem\b[^"']*["'][^>]*>`)
	divTagPattern    = regexp.MustCompile(`(?is)</?div\b[^>]*>`)
	bulletPattern    = regexp.MustCompile(`^([+*-])\s`)
	numberedPattern  = regexp.MustCompile(`^(\d+)([.)])\s`)
)

func main() {
	siteRoot := flag.String("site-root", ".", "path to the source site root")
	flag.Parse()

	if err := migrate(*siteRoot); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func migrate(siteRoot string) error {
	siteRoot, err := filepath.Abs(siteRoot)
	if err != nil {
		return fmt.Errorf("resolve site root: %w", err)
	}
	hugoRoot := filepath.Join(siteRoot, "hugo")
	authorRoot := filepath.Join(siteRoot, "authors")
	contentRoot := filepath.Join(hugoRoot, "content", "authors")

	sourceHTML, err := findUnmigratedHTML(authorRoot, map[string]struct{}{})
	if err != nil {
		return fmt.Errorf("scan source HTML files: %w", err)
	}
	if len(sourceHTML) == 0 {
		return fmt.Errorf("no source HTML files found under %s; refusing to regenerate Hugo content", authorRoot)
	}

	if err := os.RemoveAll(contentRoot); err != nil {
		return fmt.Errorf("clear generated author content: %w", err)
	}
	if err := os.MkdirAll(contentRoot, 0o755); err != nil {
		return fmt.Errorf("create generated author content: %w", err)
	}
	if err := os.WriteFile(filepath.Join(contentRoot, "_index.md"), []byte("---\ntitle: \"Authors\"\n---\n"), 0o644); err != nil {
		return fmt.Errorf("write author section index: %w", err)
	}

	var authorCount, bookCount, htmlCount int
	migratedHTML := make(map[string]struct{})
	authors, err := os.ReadDir(authorRoot)
	if err != nil {
		return fmt.Errorf("read authors directory: %w", err)
	}
	for _, authorDir := range authors {
		if !authorDir.IsDir() {
			continue
		}
		authorPath := filepath.Join(authorRoot, authorDir.Name())
		authorJSON, err := readContents(filepath.Join(authorPath, "contents.json"))
		if os.IsNotExist(err) {
			continue
		}
		if err != nil {
			return fmt.Errorf("read author metadata for %s: %w", authorDir.Name(), err)
		}
		authorTitle := firstNonEmpty(authorJSON.Title, authorDir.Name())
		authorContentDir := filepath.Join(contentRoot, authorDir.Name())
		if err := os.MkdirAll(authorContentDir, 0o755); err != nil {
			return fmt.Errorf("create author content for %s: %w", authorDir.Name(), err)
		}
		authorIndex := fmt.Sprintf("---\ntitle: %s\naliases:\n  - %s\n---\n",
			yamlString(replaceQuoteBackticks(authorTitle)),
			yamlString("/authors/"+authorDir.Name()+"/index.html"))
		if err := writeContent(filepath.Join(authorContentDir, "_index.md"), authorIndex); err != nil {
			return err
		}
		authorCount++

		books, err := os.ReadDir(authorPath)
		if err != nil {
			return fmt.Errorf("read books for author %s: %w", authorDir.Name(), err)
		}
		for _, bookDir := range books {
			if !bookDir.IsDir() {
				continue
			}
			bookPath := filepath.Join(authorPath, bookDir.Name())
			bookContentDir := filepath.Join(authorContentDir, bookDir.Name())
			migratedBooks, migratedPages, err := migrateBook(authorDir.Name(), authorTitle, authorPath, bookPath, bookContentDir, migratedHTML)
			if err != nil {
				return err
			}
			bookCount += migratedBooks
			htmlCount += migratedPages
		}
	}

	unmigratedHTML, err := findUnmigratedHTML(authorRoot, migratedHTML)
	if err != nil {
		return fmt.Errorf("scan source HTML files: %w", err)
	}
	if len(unmigratedHTML) > 0 {
		fmt.Fprintf(os.Stderr, "Unmigrated HTML files (%d):\n", len(unmigratedHTML))
		for _, name := range unmigratedHTML {
			fmt.Fprintf(os.Stderr, "  %s\n", name)
		}
		return fmt.Errorf("%d HTML files were not migrated", len(unmigratedHTML))
	}

	for _, name := range []string{"css", "fonts", "images", "icons"} {
		source := filepath.Join(siteRoot, name)
		if _, err := os.Stat(source); err == nil {
			if err := copyDirectory(source, filepath.Join(hugoRoot, "static", name)); err != nil {
				return fmt.Errorf("copy %s assets: %w", name, err)
			}
		} else if !os.IsNotExist(err) {
			return fmt.Errorf("inspect %s assets: %w", name, err)
		}
	}
	for _, item := range []struct {
		source, destination string
	}{
		{"favicon.ico", filepath.Join(hugoRoot, "static", "favicon.ico")},
		{"changelog.json", filepath.Join(hugoRoot, "data", "changelog.json")},
	} {
		source := filepath.Join(siteRoot, item.source)
		if _, err := os.Stat(source); err == nil {
			if err := copyFile(source, item.destination); err != nil {
				return fmt.Errorf("copy %s: %w", item.source, err)
			}
		} else if !os.IsNotExist(err) {
			return fmt.Errorf("inspect %s: %w", item.source, err)
		}
	}

	fmt.Printf("Authors: %d\nBooks: %d\nHTML files: %d\n", authorCount, bookCount, htmlCount)
	return nil
}

func migrateBook(authorName, authorTitle, authorPath, bookPath, bookContentDir string, migratedHTML map[string]struct{}) (int, int, error) {
	bookJSON, err := readContents(filepath.Join(bookPath, "contents.json"))
	hasMetadata := err == nil
	if err != nil && !os.IsNotExist(err) {
		return 0, 0, fmt.Errorf("read book metadata for %s: %w", bookPath, err)
	}

	bookCount := 0
	if hasMetadata {
		bookTitle := firstNonEmpty(bookJSON.Title, filepath.Base(bookPath))
		bookAuthor := firstNonEmpty(bookJSON.Author, authorTitle)
		if err := os.MkdirAll(bookContentDir, 0o755); err != nil {
			return 0, 0, fmt.Errorf("create book content for %s: %w", bookPath, err)
		}
		bookAlias, err := filepath.Rel(authorPath, bookPath)
		if err != nil {
			return 0, 0, fmt.Errorf("build alias for %s: %w", bookPath, err)
		}
		bookIndex := fmt.Sprintf("---\ntitle: %s\nbook_author: %s\nsource: %s\naliases:\n  - %s\n---\n",
			yamlString(replaceQuoteBackticks(bookTitle)),
			yamlString(replaceQuoteBackticks(bookAuthor)),
			yamlString(bookJSON.Source),
			yamlString("/"+filepath.ToSlash(filepath.Join("authors", authorName, bookAlias, "index.html"))))
		if err := writeContent(filepath.Join(bookContentDir, "_index.md"), bookIndex); err != nil {
			return 0, 0, err
		}
		bookCount++
	}

	chapterTitles := make(map[string]chapterMetadata, len(bookJSON.Chapters))
	for i, item := range bookJSON.Chapters {
		chapterTitles[item.Href] = chapterMetadata{title: item.Title, weight: i + 1}
	}
	entries, err := os.ReadDir(bookPath)
	if err != nil {
		return 0, 0, fmt.Errorf("read book directory %s: %w", bookPath, err)
	}

	htmlCount := 0
	for _, entry := range entries {
		name := entry.Name()
		sourcePath := filepath.Join(bookPath, name)
		if entry.IsDir() {
			nestedBooks, nestedPages, err := migrateBook(authorName, authorTitle, authorPath, sourcePath, filepath.Join(bookContentDir, name), migratedHTML)
			if err != nil {
				return 0, 0, err
			}
			bookCount += nestedBooks
			htmlCount += nestedPages
			continue
		}
		if !hasMetadata || !strings.EqualFold(filepath.Ext(name), ".html") {
			continue
		}
		data, err := os.ReadFile(sourcePath)
		if err != nil {
			return 0, 0, fmt.Errorf("read chapter %s: %w", sourcePath, err)
		}
		markdown := htmlToMarkdown(string(data))
		if strings.TrimSpace(markdown) == "" {
			continue
		}
		chapterName := strings.TrimSuffix(name, filepath.Ext(name))
		metadata, exists := chapterTitles[name]
		chapterTitle := strings.ReplaceAll(strings.ReplaceAll(chapterName, "-", " "), "_", " ")
		weight := 999
		if exists {
			chapterTitle = metadata.title
			weight = metadata.weight
		}
		bookAlias, err := filepath.Rel(authorPath, bookPath)
		if err != nil {
			return 0, 0, fmt.Errorf("build alias for %s: %w", sourcePath, err)
		}
		frontmatter := fmt.Sprintf("---\ntitle: %s\nweight: %d\naliases:\n  - %s\n---\n\n%s\n",
			yamlString(replaceQuoteBackticks(chapterTitle)),
			weight,
			yamlString("/"+filepath.ToSlash(filepath.Join("authors", authorName, bookAlias, name))),
			markdown)
		if err := writeContent(filepath.Join(bookContentDir, chapterName+".md"), frontmatter); err != nil {
			return 0, 0, err
		}
		migratedHTML[filepath.Clean(sourcePath)] = struct{}{}
		htmlCount++
	}
	return bookCount, htmlCount, nil
}

func findUnmigratedHTML(authorRoot string, migrated map[string]struct{}) ([]string, error) {
	var unmigrated []string
	err := filepath.WalkDir(authorRoot, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.IsDir() || !strings.EqualFold(filepath.Ext(entry.Name()), ".html") {
			return nil
		}
		if _, ok := migrated[filepath.Clean(path)]; ok {
			return nil
		}
		relative, err := filepath.Rel(filepath.Dir(authorRoot), path)
		if err != nil {
			return err
		}
		unmigrated = append(unmigrated, filepath.ToSlash(relative))
		return nil
	})
	if err != nil {
		return nil, err
	}
	sort.Strings(unmigrated)
	return unmigrated, nil
}

func readContents(path string) (contents, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return contents{}, err
	}
	var result contents
	if err := json.Unmarshal(data, &result); err != nil {
		return contents{}, err
	}
	return result, nil
}

func yamlString(value string) string {
	data, _ := json.Marshal(value)
	return string(data)
}

func writeContent(path, value string) error {
	if err := os.WriteFile(path, []byte(value), 0o644); err != nil {
		return fmt.Errorf("write generated content %s: %w", path, err)
	}
	return nil
}

func firstNonEmpty(value, fallback string) string {
	if value != "" {
		return value
	}
	return fallback
}

func htmlToMarkdown(source string) string {
	body := source
	if match := articlePattern.FindStringSubmatch(source); len(match) > 1 {
		body = match[1]
	}
	poems := findPoemBlocks(body)
	if len(poems) == 0 {
		return htmlBodyToMarkdown(body)
	}

	var converted []string
	last := 0
	for _, poem := range poems {
		if text := htmlBodyToMarkdown(body[last:poem[0]]); strings.TrimSpace(text) != "" {
			converted = append(converted, text)
		}
		converted = append(converted, poemBlockToMarkdown(body[poem[0]:poem[1]]))
		last = poem[1]
	}
	if text := htmlBodyToMarkdown(body[last:]); strings.TrimSpace(text) != "" {
		converted = append(converted, text)
	}
	return strings.Join(converted, "\n\n")
}

func poemBlockToMarkdown(poem string) string {
	open := poemDivOpen.FindStringIndex(poem)
	tags := divTagPattern.FindAllStringIndex(poem, -1)
	if open == nil || len(tags) == 0 {
		return ""
	}

	body := poem[open[1]:tags[len(tags)-1][0]]
	body = emptySpanPattern.ReplaceAllString(body, "")
	body = bareParagraphs.ReplaceAllString(body, "\n\n")
	body = bareEndParagraph.ReplaceAllString(body, "")
	body = brPattern.ReplaceAllString(body, "\x00")
	body = convertEmphasisToMarkdown(body)
	body = tagPattern.ReplaceAllString(body, "")
	body = replaceQuoteBackticks(body)

	var stanzas []string
	for _, stanza := range strings.Split(body, "\n\n") {
		var lines []string
		for _, line := range strings.Split(stanza, "\x00") {
			line = strings.Trim(line, " \t\r\n")
			if line != "" {
				lines = append(lines, html.UnescapeString(line))
			}
		}
		if len(lines) > 0 {
			stanzas = append(stanzas, strings.Join(lines, "  \n"))
		}
	}
	return strings.Join(stanzas, "\n\n")
}

func findPoemBlocks(body string) [][2]int {
	var poems [][2]int
	searchFrom := 0
	for searchFrom < len(body) {
		open := poemDivOpen.FindStringIndex(body[searchFrom:])
		if open == nil {
			break
		}
		start := searchFrom + open[0]
		tagEnd := searchFrom + open[1]
		depth := 1
		for depth > 0 {
			tag := divTagPattern.FindStringIndex(body[tagEnd:])
			if tag == nil {
				return poems
			}
			tagStart := tagEnd + tag[0]
			tagEnd += tag[1]
			value := strings.ToLower(body[tagStart:tagEnd])
			if strings.HasPrefix(value, "</div") {
				depth--
			} else if !strings.HasSuffix(strings.TrimSpace(value), "/>") {
				depth++
			}
		}
		poems = append(poems, [2]int{start, tagEnd})
		searchFrom = tagEnd
	}
	return poems
}

func htmlBodyToMarkdown(body string) string {
	body = convertEmphasisToMarkdown(body)
	body = hrPattern.ReplaceAllString(body, "\n\n---\n\n")
	body = brPattern.ReplaceAllString(body, " ")
	body = emptySpanPattern.ReplaceAllString(body, "")

	paragraphs := make([]string, 0)
	closed := paragraphPattern.FindAllStringSubmatch(body, -1)
	if len(closed) > 0 {
		for _, match := range closed {
			if text := cleanParagraph(match[1]); text != "" {
				paragraphs = append(paragraphs, text)
			}
		}
	} else {
		for _, segment := range bareParagraphs.Split(body, -1) {
			text := bareEndParagraph.ReplaceAllString(segment, "")
			if text = cleanParagraph(text); text != "" {
				paragraphs = append(paragraphs, text)
			}
		}
	}
	for i, text := range paragraphs {
		if bulletPattern.MatchString(text) {
			text = bulletPattern.ReplaceAllString(text, `\$1 `)
		} else if numberedPattern.MatchString(text) {
			text = numberedPattern.ReplaceAllString(text, `$1\$2 `)
		}
		paragraphs[i] = text
	}
	return strings.Join(paragraphs, "\n\n")
}

func convertEmphasisToMarkdown(body string) string {
	return emphasisPattern.ReplaceAllStringFunc(body, func(match string) string {
		parts := emphasisPattern.FindStringSubmatch(match)
		text := html.UnescapeString(parts[1])
		leading := text[:len(text)-len(strings.TrimLeft(text, " \t\r\n"))]
		trailing := text[len(strings.TrimRight(text, " \t\r\n")):]
		inner := strings.TrimSpace(text)
		if inner == "" {
			return ""
		}
		return leading + "*" + inner + "*" + trailing
	})
}

func cleanParagraph(value string) string {
	value = tagPattern.ReplaceAllString(value, "")
	value = html.UnescapeString(value)
	value = replaceQuoteBackticks(value)
	return strings.TrimSpace(spacePattern.ReplaceAllString(value, " "))
}

func replaceQuoteBackticks(value string) string {
	return strings.ReplaceAll(value, "`", "'")
}

func copyDirectory(source, destination string) error {
	return filepath.WalkDir(source, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		relative, err := filepath.Rel(source, path)
		if err != nil {
			return err
		}
		target := filepath.Join(destination, relative)
		if entry.IsDir() {
			return os.MkdirAll(target, 0o755)
		}
		return copyFile(path, target)
	})
}

func copyFile(source, destination string) error {
	if err := os.MkdirAll(filepath.Dir(destination), 0o755); err != nil {
		return err
	}
	data, err := os.ReadFile(source)
	if err != nil {
		return err
	}
	info, err := os.Stat(source)
	if err != nil {
		return err
	}
	if err := os.WriteFile(destination, data, info.Mode().Perm()); err != nil {
		return err
	}
	return nil
}
