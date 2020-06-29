package text2html

import (
	
	"fmt"
	"net/http"
	"io"
	"io/ioutil"
	"log"
	"os"
	"strings"

	"github.com/pgalbavy/www.literature.org/scripts/text2html"

)

func main() {

	for _, file := range os.Args[1:] {

		var f io.ReadCloser
		if strings.HasPrefix(file, "http") {
			fmt.Printf("fetching file %q\n", file)
			res, err := http.Get(file)
			if err != nil {
				log.Fatal(err)
			}
			f = res.Body
		} else {
			var err error
			fmt.Printf("reading file %q\n", file)
			f, err = os.Open(file)
			if err != nil {
				log.Fatal(err)
			}
		}
		var content, _ = ioutil.ReadAll(f)
		f.Close()
		text := string(content)

		output := text2html.Paras(text)
		io.WriteString(os.Stdout, output)
	}

}