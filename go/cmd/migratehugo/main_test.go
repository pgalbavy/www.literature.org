package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestHTMLToMarkdown(t *testing.T) {
	got := htmlToMarkdown(`<article><p><em>  Hello &amp; world </em></p><p>+ item</p><p>2. item</p></article>`)
	want := "*Hello & world*\n\n\\+ item\n\n2\\. item"
	if got != want {
		t.Fatalf("htmlToMarkdown() = %q, want %q", got, want)
	}
}

func TestHTMLToMarkdownLegacyParagraphs(t *testing.T) {
	got := htmlToMarkdown(`<P>First paragraph<P>Second paragraph`)
	want := "First paragraph\n\nSecond paragraph"
	if got != want {
		t.Fatalf("htmlToMarkdown() = %q, want %q", got, want)
	}
}

func TestHTMLToMarkdownConvertsLegacyQuoteBackticks(t *testing.T) {
	got := htmlToMarkdown("<article><p>`Oh, you wicked little thing!' cried Alice.</p></article>")
	want := "'Oh, you wicked little thing!' cried Alice."
	if got != want {
		t.Fatalf("htmlToMarkdown() = %q, want %q", got, want)
	}
	if strings.Contains(got, "`") {
		t.Fatalf("htmlToMarkdown() left a code-span delimiter in %q", got)
	}
}

func TestHTMLToMarkdownPreservesPoemLineBreaksAndIndentation(t *testing.T) {
	got := htmlToMarkdown(`<article><p>Before the poem.</p><div class="w3-container poem"><span></span><p>First line<br/>&nbsp;&nbsp;&nbsp;Indented line</p><p>Second stanza</p></div><p>After the poem.</p></article>`)
	for _, expected := range []string{
		"Before the poem.",
		"First line  \n\u00a0\u00a0\u00a0Indented line",
		"\n\nSecond stanza",
		"After the poem.",
	} {
		if !strings.Contains(got, expected) {
			t.Errorf("htmlToMarkdown() does not preserve %q:\n%s", expected, got)
		}
	}
	if strings.Contains(got, "<span") || strings.Contains(got, "<div") || strings.Contains(got, "<p") {
		t.Errorf("htmlToMarkdown() retained poem markup:\n%s", got)
	}
}

func TestMigrateCreatesHugoContentAndCopiesAssets(t *testing.T) {
	root := t.TempDir()
	bookDir := filepath.Join(root, "authors", "sample-author", "sample-book")
	nestedBookDir := filepath.Join(bookDir, "nested-book")
	writeTestFile(t, filepath.Join(root, "authors", "sample-author", "contents.json"), `{"title":"Sample Author"}`)
	writeTestFile(t, filepath.Join(bookDir, "contents.json"), "{\"title\":\"Sample Book\",\"chapters\":[{\"href\":\"chapter-01.html\",\"title\":\"Opening `Act'\"},{\"href\":\"fit-01.html\",\"title\":\"Fit One\"}]}")
	writeTestFile(t, filepath.Join(bookDir, "chapter-01.html"), `<article><p>Chapter text.</p></article>`)
	writeTestFile(t, filepath.Join(bookDir, "fit-01.html"), `<article><p>Fit text.</p></article>`)
	writeTestFile(t, filepath.Join(bookDir, "preface.html"), `<article><p>Preface text.</p></article>`)
	writeTestFile(t, filepath.Join(nestedBookDir, "contents.json"), `{"title":"Nested Book","chapters":[{"href":"part-01.html","title":"Part 1"}]}`)
	writeTestFile(t, filepath.Join(nestedBookDir, "part-01.html"), `<article><p>Nested text.</p></article>`)
	writeTestFile(t, filepath.Join(root, "css", "site.css"), "body {}")
	writeTestFile(t, filepath.Join(root, "hugo", "content", "authors", "stale.md"), "old content")

	if err := migrate(root); err != nil {
		t.Fatalf("migrate() error = %v", err)
	}

	contentPath := filepath.Join(root, "hugo", "content", "authors", "sample-author", "sample-book", "chapter-01.md")
	content, err := os.ReadFile(contentPath)
	if err != nil {
		t.Fatalf("read generated chapter: %v", err)
	}
	for _, expected := range []string{
		`title: "Opening 'Act'"`,
		"weight: 1",
		`"/authors/sample-author/sample-book/chapter-01.html"`,
		"Chapter text.",
	} {
		if !strings.Contains(string(content), expected) {
			t.Errorf("generated chapter does not contain %q:\n%s", expected, content)
		}
	}
	fitPath := filepath.Join(root, "hugo", "content", "authors", "sample-author", "sample-book", "fit-01.md")
	fit, err := os.ReadFile(fitPath)
	if err != nil {
		t.Fatalf("read generated non-chapter page: %v", err)
	}
	for _, expected := range []string{`title: "Fit One"`, "weight: 2", "Fit text."} {
		if !strings.Contains(string(fit), expected) {
			t.Errorf("generated fit page does not contain %q:\n%s", expected, fit)
		}
	}
	prefacePath := filepath.Join(root, "hugo", "content", "authors", "sample-author", "sample-book", "preface.md")
	preface, err := os.ReadFile(prefacePath)
	if err != nil {
		t.Fatalf("read generated unlisted HTML page: %v", err)
	}
	for _, expected := range []string{`title: "preface"`, "weight: 999", "Preface text."} {
		if !strings.Contains(string(preface), expected) {
			t.Errorf("generated preface does not contain %q:\n%s", expected, preface)
		}
	}
	nestedPath := filepath.Join(root, "hugo", "content", "authors", "sample-author", "sample-book", "nested-book", "part-01.md")
	nested, err := os.ReadFile(nestedPath)
	if err != nil {
		t.Fatalf("read generated nested book page: %v", err)
	}
	for _, expected := range []string{
		`title: "Part 1"`,
		`"/authors/sample-author/sample-book/nested-book/part-01.html"`,
		"Nested text.",
	} {
		if !strings.Contains(string(nested), expected) {
			t.Errorf("generated nested page does not contain %q:\n%s", expected, nested)
		}
	}
	if _, err := os.Stat(filepath.Join(root, "hugo", "content", "authors", "stale.md")); !os.IsNotExist(err) {
		t.Errorf("stale generated content still exists (stat error: %v)", err)
	}
	if _, err := os.Stat(filepath.Join(root, "hugo", "static", "css", "site.css")); err != nil {
		t.Errorf("copied CSS asset is missing: %v", err)
	}
}

func TestMigrateReportsHTMLWithoutBookMetadata(t *testing.T) {
	root := t.TempDir()
	htmlPath := filepath.Join(root, "authors", "orphan-author", "unknown.html")
	writeTestFile(t, htmlPath, `<article><p>Unindexed HTML.</p></article>`)

	err := migrate(root)
	if err == nil || !strings.Contains(err.Error(), "1 HTML files were not migrated") {
		t.Fatalf("migrate() error = %v, want report for one unmigrated HTML file", err)
	}

	unmigrated, err := findUnmigratedHTML(filepath.Join(root, "authors"), map[string]struct{}{})
	if err != nil {
		t.Fatalf("findUnmigratedHTML() error = %v", err)
	}
	if len(unmigrated) != 1 || unmigrated[0] != "authors/orphan-author/unknown.html" {
		t.Fatalf("unmigrated HTML = %v, want [authors/orphan-author/unknown.html]", unmigrated)
	}
}

func TestMigrateWithoutSourceHTMLDoesNotClearGeneratedContent(t *testing.T) {
	root := t.TempDir()
	contentPath := filepath.Join(root, "hugo", "content", "authors", "existing.md")
	writeTestFile(t, contentPath, "existing content")
	if err := os.MkdirAll(filepath.Join(root, "authors"), 0o755); err != nil {
		t.Fatalf("create authors directory: %v", err)
	}

	err := migrate(root)
	if err == nil || !strings.Contains(err.Error(), "no source HTML files") {
		t.Fatalf("migrate() error = %v, want refusal when source HTML is absent", err)
	}
	content, err := os.ReadFile(contentPath)
	if err != nil {
		t.Fatalf("read preserved generated content: %v", err)
	}
	if string(content) != "existing content" {
		t.Fatalf("generated content = %q, want it preserved", content)
	}
}

func writeTestFile(t *testing.T, path, value string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("create test directory: %v", err)
	}
	if err := os.WriteFile(path, []byte(value), 0o644); err != nil {
		t.Fatalf("write test file: %v", err)
	}
}
