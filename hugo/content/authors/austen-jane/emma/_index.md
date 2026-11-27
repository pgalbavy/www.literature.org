---
title: "Emma"
book_author: "Jane AUSTEN"
source: "https://www.gutenberg.org/files/158/158-0.txt"
params:
  cmdline:
    - "./convtext"
    - "--title"
    - "Emma"
    - "--author"
    - "Jane AUSTEN"
    - "--partsep"
    - "(?mi)^volume\\s"
    - "--partprefix"
    - "volume-%02d-"
    - "--parttitle"
    - "Volume %d - "
    - "--output"
    - "../authors/austen-jane/emma"
    - "https://www.gutenberg.org/files/158/158-0.txt"
---
