# JiTex

[Try it online](https://ilhikki.github.io/jitex/)

A TeX engine that runs in JavaScript. JiTex is compiled from Knuth's TeX and the Plain format, and typesets TeX source
to SVG pages in the browser or on the server.

## Usage

Download and extract the release, then import the bundled engine by relative path:

```js
import { createTexEngine } from './jitex.js'

const engine = createTexEngine()
const result = engine.render(String.raw`Hello, \TeX!  $a^2 + b^2 = c^2$\par`)

if (result.status === 'completed') {
  for (const svg of result.svgs) {
    // one SVG string per page
  }
}
```

`render` returns either:

- `{ status: 'completed', svgs: string[] }`
- `{ status: 'interrupted', error: Error }`

To capture the engine console output:

```js
engine.render(source, { onConsole: (chunk) => console.log(chunk) })
```

## Building from source

Requires Deno.

```bash
deno task build:jitex
```

This writes the engine to `dist/lib/`, the demo site to `dist/site/`, and reports to `reports/`.

## Releases

[Browse releases](https://github.com/ilhikki/jitex/releases)

## License

MIT. See `LICENSE`. The release bundles the third-party notices for its components: `LICENSE.knuth` (Knuth's TeX) and
`fonts/OFL.txt` (the Computer Modern web fonts). See `resources/README.md` for full provenance and terms.
