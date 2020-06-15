package literature

import (
	"encoding/json"
	"io/ioutil"
	"log"
	"os"
)

type Contents struct {
	Title		string		`json:"title"`
	Author		string		`json:"author"`
	Source		string		`json:"source"`
	Cmdline		[]string	`json:"cmdline"`
	LastUpdated	string		`json:"lastupdated"`
	Chapters	[]Chapter	`json:"chapters"`
}

type Chapter struct {
	HREF		string		`json:"href"`
	Title		string		`json:"title"`
}

// needs cleaning, but does the job
func ReadJSON(file string, j interface{}) {
	c, err := os.Open(file)
	if err != nil {
		log.Fatal(err)
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

	err = os.Rename(file + ".new", file)
	if err != nil {
		log.Fatal(err)
	}
}
