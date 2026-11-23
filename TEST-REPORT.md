# Test report

## Scope

The starting point was the supplied `remark-mkdocs-quiz(3).mjs`. The two supplied Markdown pages, `16quizz.md` and `test-quiz-compat.md`, are copied byte for byte into `test/fixtures/`. The browser suite builds an isolated Starlight site with the pinned dependencies in `package-lock.json`.

| Suite | Supplied source | Final source |
| --- | --- | --- |
| Vitest, Remark AST and HTML | 17 passed, 5 failed | 23 passed |
| Vitest, Astro Starlight and Chromium | 4 passed, 3 failed | 7 passed |

The final unit suite includes one extra test for preservation of an already parsed explanation when the caller supplies an AST without the original source. The test environment used Node.js 24.22.3 and Chromium 153.0.8010.0 with the Astro and Starlight versions listed in the [README](README.md#requirements).

## Findings and changes

| Finding in the supplied source | Correction and verification |
| --- | --- |
| A closing tag parsed as part of a list item could leave a valid quiz unconverted. The second DNS demo question exposed the same issue in the browser suite. | Locate the closing HTML node within the list, then parse the affected fragment. The explanation list is rendered and appears after a correct answer. |
| Text immediately after the closing tag could be included in the quiz when CommonMark joined both sides into one paragraph. | Split the paragraph at the closing tag and keep its parsed inline nodes on their original sides. The test asserts that the following paragraph is outside `</sl-quiz>`. |
| An unclosed quiz could consume the next quiz's closing tag. | Stop at the next opening tag and warn. The regression test checks that the malformed quiz stays in place and the next quiz retains its answers. |
| The closing tag could leave a line break in the explanation. A complete one-line block could also be missed when parsed as a paragraph. | Trim whitespace at the closing boundary and recognize a whole one-line quiz paragraph. Tests inspect the resulting HTML. |

The adapter edits the existing AST and reparses only affected Markdown fragments. Tests verify original node identities and positions outside the quiz and preserve a transformation applied by a preceding Remark plugin.

## Browser results

The tests checked the static HTML before JavaScript activation, radio and checkbox controls, correct and incorrect grading, explanations revealed after submission, the 16 original DNS quizzes and the original compatibility page. The compatibility page renders both admonitions and activates its four standalone quizzes. Its indented quiz remains unsupported.

The fixture registers the upstream `starlight-quiz` browser code through a Starlight Head override. The tests use the fixture's pinned versions. Exact dependency versions in the existing Astro project were unavailable, so this report applies to the isolated build.

See [Limitations](README.md#limitations) and [Compatibility with MkDocs admonitions](README.md#compatibility-with-mkdocs-admonitions).
