/**
 * The Tailwind plugin in effect-start finds class names by pairing every quote
 * character in a component file, so an apostrophe in a comment or in JSX text
 * shifts the pairing and the classes after it are silently left out of the
 * CSS. This reads each component the way the plugin does and reports the
 * classes it would miss.
 *
 *   bun scripts/check-classes.ts            # every component under src/
 *   bun scripts/check-classes.ts $FILE...   # just these
 */
const Literal = /["'`]([^"'`]+)["'`]/g
const Quoted = /"((?:[^"\\]|\\.)*)"/g
const Token =
  /^(?:[a-z\-]+:)*(?:-?[a-z]+[a-z0-9\-]*(?:\[[^\]]+\])?(?:\/[0-9]+)?|\[[^\]]+\])$/
const ClassList = /^[\w\-\[\]:\/.%!()#,&*?=]+( [\w\-\[\]:\/.%!()#,&*?=]+)*$/

const files = process.argv.length > 2
  ? process.argv.slice(2)
  : [
    ...new Bun.Glob("src/**/*.tsx").scanSync("."),
  ]
    .sort()

let failed = 0

for (const file of files) {
  const source = await Bun.file(file).text()
  const seen = new Set<string>()

  for (const match of source.matchAll(Literal)) {
    for (const token of match[1].split(/\s+/)) {
      seen.add(token)
    }
  }

  const wanted = new Set<string>()

  for (const match of source.matchAll(Quoted)) {
    if (!ClassList.test(match[1])) {
      continue
    }

    for (const token of match[1].split(/\s+/)) {
      if (Token.test(token) && /[-:\[]/.test(token)) {
        wanted.add(token)
      }
    }
  }

  const missing = [
    ...wanted,
  ]
    .filter((token) => !seen.has(token))

  if (missing.length > 0) {
    failed++
    console.log(
      `${file}: ${missing.length} classes the plugin would miss, such as ${
        missing.slice(0, 5).join(" ")
      }`,
    )
  }
}

console.log(
  failed
    ? `${failed} file(s) at risk: look for an apostrophe or a stray quote in a comment or JSX text, and use \u2019 in text.`
    : `${files.length} files scan cleanly.`,
)
process.exit(failed ? 1 : 0)
