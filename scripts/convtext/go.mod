module github.com/pgalbavy/www.literature.org/scripts/convtext

replace github.com/pgalbavy/www.literature.org/scripts/literature => ../literature

replace github.com/pgalbavy/www.literature.org/scripts/text2html => ../text2html

go 1.14

require (
	github.com/pgalbavy/www.literature.org/scripts/literature v0.0.0-00010101000000-000000000000
	github.com/pgalbavy/www.literature.org/scripts/text2html v0.0.0-00010101000000-000000000000
)
