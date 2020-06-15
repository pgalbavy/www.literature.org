module github.com/pgalbavy/www.literature.org/scripts/publish

replace github.com/pgalbavy/www.literature.org/scripts/literature => ../literature

go 1.14

require (
	github.com/pgalbavy/www.literature.org/scripts/literature v0.0.0-00010101000000-000000000000
	golang.org/x/text v0.3.2
)
