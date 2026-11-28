// mergecontents folds the metadata kept in the legacy contents.json files
// (under hugo/static) into the front matter of the matching Hugo _index.md
// files, under a `params:` block.
//
// The chapter, book and author lists are not copied: Hugo builds them from
// the page tree. The site no longer publishes contents.json files.
//
// Every key is accounted for: a key the tool does not know, or a value that
// disagrees with what the front matter already holds, stops the run before
// any file is written.
package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// params are written in this order; anything else is an error
var paramOrder = []string{"pen_names", "year", "lastupdated", "cmdline", "links"}

type update struct {
	indexPath string
	content   string
}

func main() {
	hugoRoot := flag.String("hugo", "hugo", "path to the Hugo site")
	dryRun := flag.Bool("n", false, "report what would change without writing")
	flag.Parse()

	updates, err := plan(*hugoRoot)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	for _, u := range updates {
		if *dryRun {
			fmt.Printf("would update %s\n", u.indexPath)
			continue
		}
		if err := os.WriteFile(u.indexPath, []byte(u.content), 0o644); err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
	}
	fmt.Printf("%d _index.md files updated\n", len(updates))
}

func plan(hugoRoot string) ([]update, error) {
	staticRoot := filepath.Join(hugoRoot, "static")
	contentRoot := filepath.Join(hugoRoot, "content")

	files := map[string]map[string]any{} // section dir (slash, relative) -> parsed JSON
	err := filepath.WalkDir(staticRoot, func(path string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() || d.Name() != "contents.json" {
			return err
		}
		rel, _ := filepath.Rel(staticRoot, filepath.Dir(path))
		if _, err := os.Stat(filepath.Join(contentRoot, rel, "_index.md")); os.IsNotExist(err) {
			return nil // a legacy page (templates, contact), not a Hugo section
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		dec := json.NewDecoder(bytes.NewReader(data))
		dec.UseNumber() // keep numbers exactly as written
		var value map[string]any
		if err := dec.Decode(&value); err != nil {
			return fmt.Errorf("%s: %w", path, err)
		}
		files[filepath.ToSlash(rel)] = value
		return nil
	})
	if err != nil {
		return nil, err
	}

	// a book's year may be recorded on its author's books[] entry
	parentYears := map[string]any{}
	for dir, value := range files {
		books, _ := value["books"].([]any)
		for _, b := range books {
			book := b.(map[string]any)
			if year, ok := book["year"]; ok {
				parentYears[dir+"/"+book["href"].(string)] = year
			}
		}
	}

	dirs := make([]string, 0, len(files))
	for dir := range files {
		dirs = append(dirs, dir)
	}
	sort.Strings(dirs)

	var updates []update
	var problems []string
	for _, dir := range dirs {
		indexPath := filepath.Join(contentRoot, filepath.FromSlash(dir), "_index.md")
		u, err := merge(indexPath, files[dir], parentYears[dir])
		if err != nil {
			problems = append(problems, fmt.Sprintf("%s: %v", indexPath, err))
			continue
		}
		if u != nil {
			updates = append(updates, *u)
		}
	}
	if len(problems) > 0 {
		return nil, fmt.Errorf("nothing written, %d problems:\n  %s", len(problems), strings.Join(problems, "\n  "))
	}
	return updates, nil
}

func merge(indexPath string, value map[string]any, parentYear any) (*update, error) {
	if nothingToMerge(value) && parentYear == nil {
		return nil, nil
	}
	data, err := os.ReadFile(indexPath)
	if err != nil {
		return nil, err
	}
	content := string(data)
	front, body, err := splitFrontMatter(content)
	if err != nil {
		return nil, err
	}
	if _, ok := front["params"]; ok {
		return nil, fmt.Errorf("already has params (merged before?)")
	}

	params := map[string]any{}
	for key, v := range value {
		switch key {
		case "chapters", "books", "authors":
			// rebuilt by Hugo from the page tree
		case "title":
			if s := v.(string); s != "" && strings.ReplaceAll(s, "`", "'") != front["title"] {
				return nil, fmt.Errorf("title %q differs from front matter %q", s, front["title"])
			}
		case "author":
			if s, _ := v.(string); s != "" && s != front["book_author"] {
				return nil, fmt.Errorf("author %q differs from book_author %q", s, front["book_author"])
			}
		case "source":
			if s := v.(string); s != "" && s != front["source"] {
				return nil, fmt.Errorf("source %q differs from front matter %q", s, front["source"])
			}
		case "aliases":
			// Hugo reserves aliases for redirect URLs; these are other names
			params["pen_names"] = v
		case "links":
			if m := v.(map[string]any); len(m) > 0 {
				params["links"] = m
			}
		case "year", "lastupdated", "cmdline":
			if v != nil {
				params[key] = v
			}
		default:
			return nil, fmt.Errorf("unknown key %q", key)
		}
	}
	if parentYear != nil {
		if own, ok := params["year"]; ok && fmt.Sprint(own) != fmt.Sprint(parentYear) {
			return nil, fmt.Errorf("year %v differs from the author's books entry %v", own, parentYear)
		}
		params["year"] = parentYear
	}
	if len(params) == 0 {
		return nil, nil
	}

	var block strings.Builder
	block.WriteString("params:\n")
	for _, key := range paramOrder {
		if v, ok := params[key]; ok {
			writeYAML(&block, key, v, 1)
			delete(params, key)
		}
	}
	if len(params) > 0 {
		return nil, fmt.Errorf("unordered params %v", params)
	}

	head := strings.TrimSuffix(content[:len(content)-len(body)], "---\n")
	return &update{indexPath: indexPath, content: head + block.String() + "---\n" + body}, nil
}

// nothingToMerge reports a file holding only lists and an empty title
// (the site root).
func nothingToMerge(value map[string]any) bool {
	for key, v := range value {
		switch key {
		case "chapters", "books", "authors":
		case "title":
			if v != "" {
				return false
			}
		default:
			return false
		}
	}
	return true
}

// splitFrontMatter reads the simple `key: "json string"` YAML that
// the old Hugo migration wrote, returning the scalar values and the text after it.
func splitFrontMatter(content string) (map[string]string, string, error) {
	if !strings.HasPrefix(content, "---\n") {
		return nil, "", fmt.Errorf("missing front matter")
	}
	end := strings.Index(content[4:], "\n---\n")
	if end < 0 {
		return nil, "", fmt.Errorf("unterminated front matter")
	}
	front := map[string]string{}
	for _, line := range strings.Split(content[4:4+end], "\n") {
		key, raw, ok := strings.Cut(line, ": ")
		if !ok || strings.HasPrefix(line, " ") {
			return nil, "", fmt.Errorf("unexpected front matter line %q", line)
		}
		var s string
		if err := json.Unmarshal([]byte(raw), &s); err != nil {
			return nil, "", fmt.Errorf("front matter %s: %w", key, err)
		}
		front[key] = s
	}
	if strings.HasPrefix(content, "---\nparams:") {
		front["params"] = ""
	}
	return front, content[4+end+5:], nil
}

// writeYAML writes block-style YAML. Strings are written as JSON strings,
// which YAML reads as double-quoted scalars, so nothing is reinterpreted
// (dates, numbers, backslashes and empty strings all stay as they are).
func writeYAML(b *strings.Builder, key string, v any, depth int) {
	indent := strings.Repeat("  ", depth)
	switch v := v.(type) {
	case map[string]any:
		fmt.Fprintf(b, "%s%s:\n", indent, key)
		for _, k := range sortedKeys(v) {
			writeYAML(b, k, v[k], depth+1)
		}
	case []any:
		if len(v) == 0 {
			fmt.Fprintf(b, "%s%s: []\n", indent, key)
			return
		}
		fmt.Fprintf(b, "%s%s:\n", indent, key)
		for _, item := range v {
			if m, ok := item.(map[string]any); ok {
				prefix := indent + "  - "
				for _, k := range sortedKeys(m) {
					fmt.Fprintf(b, "%s%s: %s\n", prefix, k, scalar(m[k]))
					prefix = indent + "    "
				}
				continue
			}
			fmt.Fprintf(b, "%s  - %s\n", indent, scalar(item))
		}
	default:
		fmt.Fprintf(b, "%s%s: %s\n", indent, key, scalar(v))
	}
}

func scalar(v any) string {
	switch v := v.(type) {
	case json.Number:
		return v.String()
	case string:
		var buf bytes.Buffer
		enc := json.NewEncoder(&buf)
		enc.SetEscapeHTML(false)
		enc.Encode(v)
		return strings.TrimSuffix(buf.String(), "\n")
	default:
		panic(fmt.Sprintf("unsupported value %T %v", v, v))
	}
}

func sortedKeys(m map[string]any) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}
