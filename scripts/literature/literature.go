package literature

import (
	"encoding/json"
	"io/ioutil"
	"log"
	"os"
	"path/filepath"
)

type Contents struct {
	Title       string    `json:"title"`
	Author      string    `json:"author"`
	Year        int       `json:"year,omitempty"`
	Source      string    `json:"source"`
	Links       Links     `json:"links,omitempty"`
	Cmdline     []string  `json:"cmdline,omitempty"`
	LastUpdated string    `json:"lastupdated"`
	Chapters    []Chapter `json:"chapters,omitempty"`
	Books       []Book    `json:"books,omitempty"`
	Authors     []Author  `json:"authors,omitempty"`
}

type Link struct {
	HREF  string `json:"href"`
	Title string `json:"title"`

}

type Chapter Link

type Book struct {
	Link
	Year  int    `json:"year,omitempty"`
}

type Author struct {
	HREF string `json:"href"`
	Name string `json:"name"`
}

type Changelog struct {
	Link
	LastUpdated string `json:"lastupdated"`
}

type Config struct {
	Rootdir string `json:"rootdir"`
}

type Links struct {
	Wikipedia string   `json:"wikipedia,omitempty"`
	Goodreads string   `json:"goodreads,omitempty"`
	Gutenberg string   `json:"gutenberg,omitempty"`
	Other     []Link   `json:"other,omitempty"`
}

// needs cleaning, but does the job
func ReadJSON(file string, j interface{}) (err error) {
	c, err := os.Open(file)
	if err != nil {
		return err
	}

	cf, err := ioutil.ReadAll(c)
	if err != nil {
		log.Fatal(err)
	}
	c.Close()

	err = json.Unmarshal(cf, &j)
	if err != nil {
		log.Fatal(err)
	}

	return nil
}

func WriteJSON(file string, j interface{}) {
	// create new temp file, write and rename
	c, err := os.Create(file + ".new")
	if err != nil {
		log.Fatal(err)
	}

	json, err := json.MarshalIndent(j, "", "\t")
	if err != nil {
		log.Fatal(err)
	}

	_, err = c.Write(json)
	if err != nil {
		log.Fatal(err)
	}
	c.Close()

	err = os.Rename(file+".new", file)
	if err != nil {
		log.Fatal(err)
	}
}

func LoadConfig(file string) (conf Config) {
	if file == "" {
		confdir, err := os.UserConfigDir()
		if err != nil {
			log.Fatal(err)
		}

		file = filepath.Join(confdir, "literature.json")
	}

	ReadJSON(file, &conf)
	return conf
}

func FirstString(s ...string) string {
	for _, str := range s {
		if str != "" {
			return str
		}
	}

	return ""
}
