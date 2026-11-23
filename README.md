# remark-mkdocs-quiz

A JavaScript ESM adapter for migrating MkDocs Material documentation to Astro Starlight. It converts legacy `<quiz>…</quiz>` blocks during Markdown processing so that historical `.md` files can stay as they are. The adapter emits HTML that [Starlight Quiz](https://ewels.github.io/starlight-quiz/) can activate in the browser.

## Before and after

### Legacy Markdown

```markdown
<quiz>
**What is the role of DNS?**

* [ ] Assign IP addresses.
* [x] Resolve domain names.
* [ ] Encrypt communications.

DNS resolves **domain names** into IP addresses.
</quiz>
```

### Rendered HTML before the browser script runs

```html
<sl-quiz id="mkquiz-docs-dns-md-1" class="sl-quiz" data-auto-submit="true">
  <div class="sl-quiz-source">
    <p><strong>What is the role of DNS?</strong></p>
    <ul class="contains-task-list">
      <li class="task-list-item"><input type="checkbox" disabled> Assign IP addresses.</li>
      <li class="task-list-item"><input type="checkbox" checked disabled> Resolve domain names.</li>
      <li class="task-list-item"><input type="checkbox" disabled> Encrypt communications.</li>
    </ul>
    <p>DNS resolves <strong>domain names</strong> into IP addresses.</p>
  </div>
</sl-quiz>
```

The rendered ID depends on the input file path. The disabled task-list inputs carry the answer key. When the client script registers `<sl-quiz>`, Starlight Quiz reads those inputs and builds the interactive controls. One correct answer yields radio buttons. Multiple correct answers yield checkboxes and an explicit submit button. Starlight Quiz also grades answers and reveals the explanation.

## Multiple-choice example

```markdown
<quiz>
Which records return an *IP address* for a hostname?

* [x] An `A` record.
* [ ] An `MX` record.
* [x] An `AAAA` record.

The answer depends on the address family:

- `A` returns an IPv4 address.
- `AAAA` returns an IPv6 address.
</quiz>
```

The [DNS demo](examples/dns.md) combines both question types in a single Starlight page. The [admonition demo](examples/admonitions.md) shows an independent MkDocs tip followed by a quiz.

## Requirements

- The adapter runs as a Remark plugin in a Unified processor. It has zero runtime package dependencies of its own.
- Enable GitHub Flavored Markdown (GFM) so `[x]` and `[ ]` become checked and unchecked task-list items. Astro’s [Unified processor](https://docs.astro.build/en/reference/markdown-processors/unified/) enables GFM by default.
- The renderer must preserve the raw HTML wrappers. In a standalone Unified pipeline, enable `allowDangerousHtml` in both `remark-rehype` and `rehype-stringify` when using trusted Markdown. A site with a custom HTML sanitizer needs to allow the quiz element, its wrapper, the required attributes and task inputs.
- This development project requires Node.js 22.23.4 or later. The browser tests also require Chromium.
- The tested versions are Astro 7.4.13, Starlight 0.43.1, `@astrojs/markdown-remark` 7.3.10, `starlight-quiz` 1.0.3 and `remark-mkdocs-material-admonitions` 1.0.1. The package lock records the exact test dependencies.

## Astro Starlight configuration

Copy `remark-mkdocs-quiz.mjs` into the Astro project and import it from `astro.config.mjs`. Select the Unified Markdown processor explicitly. If you use the MkDocs admonitions plugin, register it first. The following settings match the [integration fixture](test/integration/site/astro.config.mjs), with the quiz adapter beside the Astro configuration file. Merge them with your existing configuration.

```js
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { unified } from '@astrojs/markdown-remark';
import starlight from '@astrojs/starlight';
import { defineConfig } from 'astro/config';
import remarkAdmonition from 'remark-mkdocs-material-admonitions';
import starlightQuiz from 'starlight-quiz';
import remarkMkdocsQuiz from './remark-mkdocs-quiz.mjs';

const require = createRequire(import.meta.url);
const quizPackage = dirname(require.resolve('starlight-quiz/package.json'));

export default defineConfig({
  markdown: {
    processor: unified({ remarkPlugins: [remarkAdmonition, remarkMkdocsQuiz] }),
  },
  integrations: [
    starlight({
      title: 'My documentation',
      customCss: ['remark-mkdocs-material-admonitions/style.css'],
      components: { Head: './src/components/QuizHead.astro' },
      plugins: [starlightQuiz()],
    }),
  ],
  vite: {
    resolve: {
      alias: {
        '@quiz-client': join(quizPackage, 'lib/quiz-element.ts'),
      },
    },
  },
});
```

Load the Starlight Quiz client on the pages that contain legacy quizzes. With `starlight-quiz` 1.0.3, `starlightQuiz()` configures Starlight features and styles. The upstream `<Quiz>` component normally registers the quiz custom element through its own script. Legacy Markdown emits the element directly, so the example below registers it through a Starlight Head override. If your site already overrides Head, add this script to that override.

```astro
---
import DefaultHead from '@astrojs/starlight/components/Head.astro';
---

<DefaultHead><slot /></DefaultHead>

<script>
  import { defineQuizElement } from '@quiz-client';
  defineQuizElement();
</script>
```

The Vite alias points to an internal module in `starlight-quiz` 1.0.3. Keep that version for this configuration. On upgrade, verify the registration entry point and run the browser tests. The Head override only loads the upstream client. The adapter remains a Remark plugin.

## Compatibility with MkDocs admonitions

Keep legacy quiz blocks **outside** MkDocs Material admonitions. Register the admonitions plugin first and separate the quiz from the admonition with a blank line.

Supported:

```markdown
!!! tip "Remember"

    DNS resolves domain names.

<quiz>
**What does DNS stand for?**

* [x] Domain Name System
* [ ] Dynamic Network Service

DNS stands for Domain Name System.
</quiz>
```

Unsupported:

```markdown
!!! tip "Knowledge check"

    <quiz>
    **What does DNS stand for?**

    * [x] Domain Name System
    * [ ] Dynamic Network Service

    DNS stands for Domain Name System.
    </quiz>
```

MkDocs uses indentation to determine which lines belong to the admonition. Removing the indentation from the entire quiz moves it outside the admonition, where it becomes a separate block. The nested form remains unsupported.

## How the transformation works

Remark parses the complete Markdown document first. The adapter then edits the existing Markdown AST in place. It looks for HTML delimiters in that tree and replaces only the parts that cover a quiz and any text joined to a delimiter by CommonMark. It reuses parsed question, answer and explanation nodes when available, so formatting such as emphasis, inline code, lists and GFM task items survives. When a tag shares a node with Markdown, only that fragment is parsed again with the same processor. The rest of the document keeps its nodes and source positions.

The generated ID combines a normalized VFile path with a counter local to the current document. IDs are deterministic when the input path and quiz order stay the same. Both LF and CRLF input are covered.

## Run the tests

From the project root:

```sh
npm ci
npm test
```

`npm test` runs Vitest against the Remark AST and rendered HTML, including the original [16-quiz DNS page](test/fixtures/16quizz.md). For the separate Astro Starlight integration suite:

```sh
npx playwright-core install chromium
npm run test:integration
```

Set `CHROMIUM_EXECUTABLE` to the full path to an existing compatible Chromium executable if you already have one. The integration suite builds the example Markdown in a temporary Starlight project. It checks the rendered HTML with JavaScript disabled and verifies browser interaction, grading, and the explanation revealed after submission. It also builds the two original pages in `test/fixtures/`. See the [test report](TEST-REPORT.md) for the verified results.

## Limitations

- Place multiline quizzes at the document level with the opening and closing tags on their own lines. Leave a blank line between a quiz and a preceding Markdown block, and between consecutive quizzes.
- Nested quizzes and quizzes inside MkDocs Material admonitions are unsupported. An unmatched opening tag is left in place and emits a warning. The next standalone quiz can still be converted.
- The supported and tested question types are single choice and multiple choice with GFM task lists. Extended quiz syntax, legacy tag attributes and full parity with MkDocs Quiz options are outside this adapter’s scope.
- Markdown that must be reparsed at a quiz delimiter can depend only on definitions in the fragment being parsed. Use inline links or place reference-style links and footnotes in an already-parsed Markdown block away from the delimiters.
- Moving a quiz earlier in the page or changing its input path can change its generated ID and the association with previously saved browser answers.
- The Astro configuration above was verified with the pinned test stack and a static Starlight build. It relies on the internal upstream client entry point described above.
