#!/bin/bash

files=$*
dir=/var/www/www.literature.org
header="${dir}/templates/header.html"
footer="${dir}/templates/footer.html"

function number {
    echo $1 | tr a-z A-Z |
    sed 's/CM/DCD/g' |
    sed 's/M/DD/g' |
    sed 's/CD/CCCC/g' |
    sed 's/D/CCCCC/g' |
    sed 's/XC/LXL/g' |
    sed 's/C/LL/g' |
    sed 's/XL/XXXX/g' |
    sed 's/L/XXXXX/g' |
    sed 's/IX/VIV/g' |
    sed 's/X/VV/g' |
    sed 's/IV/IIII/g' |
    sed 's/V/IIIII/g' |
    tr -d '\r\n' |
    wc -m
}

(
cat << 'EOF'
{
	"title": "",
	"author": "",
	"source": "",
	"chapters": [
EOF
) > contents.json

for file in $files; do
	#first=$(head -1 $file | sed -e 's/CHAPTER //' -e 's/\.//g')
	#chapter=$( number $first )
	#chapter=$(head -2 $file | sed -E -e 'N;s/\r?\n/ /' -e 's/^CHAPTER ([[:digit:]]+)\./Chapter \1 -/' -e 's/[[:space:]\.]*$//')
	chapter=$(head -4 "${file}" | paste -d ' ' - - - - | sed -e 's/  / - /g' -e 's/^CHAPTER/Chapter/' -e 's/\s$//g')
	html=${file/%.txt/.html}
	cp "${header}" "${html}"
	tail +5 "${file}" | txt2html --extract >> "${html}"
	cat "${footer}" >> "${html}"
	printf "\t\t{ \"href\": \"${html}\", \"title\": \"${chapter}\" },\n" >> contents.json
done

(
cat << 'EOF2'
	]
}
EOF2
) >> contents.json

