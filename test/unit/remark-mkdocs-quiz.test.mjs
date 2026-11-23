import { readFileSync } from 'node:fs';
import remarkAdmonition from 'remark-mkdocs-material-admonitions';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import { unified } from 'unified';
import { describe, expect, it, vi } from 'vitest';
import remarkMkdocsQuiz from '../../remark-mkdocs-quiz.mjs';

const compact = '<quiz>**Compact question?**</quiz>';
const single = `<quiz>
**What is the role of DNS?**

* [ ] Assign IP addresses.
* [x] Resolve \`DNS\` names.
* [ ] Encrypt communications.

DNS resolves **domain names**.

- Read the \`A\` record.
- Read the \`AAAA\` record.
</quiz>`;
const multi = `<quiz>
Which records return an *IP address*?

* [x] An \`A\` record.
* [ ] An \`MX\` record.
* [x] An \`AAAA\` record.

Use both address families.
</quiz>`;
const admonition = '!!! tip "Remember"\n\n    DNS resolves domain names.';
const createParser = () => unified().use(remarkParse).use(remarkGfm);

function convert(markdown, useAdmonitions = false) {
  const pipeline = createParser();
  if (useAdmonitions) pipeline.use(remarkAdmonition);
  return pipeline.use(remarkMkdocsQuiz)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeStringify, { allowDangerousHtml: true })
    .processSync({ value: markdown, path: 'docs/dns.md' }).toString();
}

function quizIds(html) {
  return [...html.matchAll(/<sl-quiz id="([^"]+)"/g)].map((match) => match[1]);
}

function answerStates(html) {
  return [...html.matchAll(/<input type="checkbox"([^>]*)>/g)]
    .map((match) => /\bchecked\b/.test(match[1]));
}

describe('Remark transformation', () => {
  it('wraps a complete single-node quiz and renders its Markdown', () => {
    expect(convert(compact)).toContain(
      '<sl-quiz id="mkquiz-docs-dns-md-1" class="sl-quiz" data-auto-submit="true">\n<div class="sl-quiz-source">\n<p><strong>Compact question?</strong></p>\n</div>\n</sl-quiz>',
    );
  });

  it('renders a single-choice quiz with the correct answer in order', () => {
    const html = convert(single);
    expect(quizIds(html)).toHaveLength(1);
    expect(answerStates(html)).toEqual([false, true, false]);
    expect(html).toContain('Resolve <code>DNS</code> names.');
  });

  it('keeps every correct answer in a multiple-choice quiz', () => {
    const html = convert(multi);
    expect(quizIds(html)).toHaveLength(1);
    expect(answerStates(html)).toEqual([true, false, true]);
  });

  it('preserves Markdown in the question', () => {
    expect(convert(single)).toContain('<strong>What is the role of DNS?</strong>');
    expect(convert(multi)).toContain('<em>IP address</em>');
  });

  it('preserves Markdown and lists in the explanation', () => {
    const html = convert(single);
    expect(html).toContain('<p>DNS resolves <strong>domain names</strong>.</p>');
    expect(html).toContain('<li>Read the <code>AAAA</code> record.</li>');
    expect(html).not.toContain('&lt;/quiz&gt;');
  });

  it('preserves inline code in both an answer and the explanation', () => {
    const html = convert(single);
    expect(html).toContain('Resolve <code>DNS</code> names.');
    expect(html).toContain('Read the <code>A</code> record.');
  });

  it('creates 16 distinct IDs and renders the complete content of every quiz', () => {
    const page = readFileSync(new URL('../fixtures/16quizz.md', import.meta.url), 'utf8');
    const markdown = page.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
    const html = convert(markdown);
    const ids = quizIds(html);
    expect(ids).toEqual(Array.from({ length: 16 }, (_, index) => `mkquiz-docs-dns-md-${index + 1}`));
    const quizzes = [...html.matchAll(/<sl-quiz [\s\S]*?<\/sl-quiz>/g)].map(([quiz]) => quiz);
    const questions = [...markdown.matchAll(/^<quiz>\r?\n\*\*(.+)\*\*$/gm)].map((match) => match[1]);
    expect(questions).toHaveLength(16);
    quizzes.forEach((quiz, index) => {
      expect(quiz).toContain('<strong>');
      expect(quiz).toContain(questions[index].split('`')[0].slice(0, 30));
      expect(answerStates(quiz)).toHaveLength(4);
      expect(answerStates(quiz).filter(Boolean)).toHaveLength(index === 15 ? 2 : 1);
    });
    expect(quizzes.at(-1)).toContain('DNSSEC');
  });

  it.each([
    ['a document without quizzes', '# DNS\n\n**Records** and \`dig\`.\n\n* [ ] A task'],
    ['an independent MkDocs admonition', admonition],
    ['an empty document', ''],
    ['a fenced quiz example', '\`\`\`markdown\n' + single + '\n\`\`\`'],
  ])('leaves the tree and its existing nodes untouched for %s', (_, markdown) => {
    const processor = createParser().use(remarkMkdocsQuiz);
    const tree = processor.parse(markdown);
    const before = structuredClone(tree);
    const originalChildren = [...tree.children];
    expect(processor.runSync(tree, { value: markdown })).toBe(tree);
    expect(tree).toStrictEqual(before);
    originalChildren.forEach((node, index) => expect(tree.children[index]).toBe(node));
  });

  it('warns about a missing closing tag and leaves the unclosed quiz intact', () => {
    const markdown = single.replace('\n</quiz>', '');
    const processor = createParser().use(remarkMkdocsQuiz);
    const tree = processor.parse(markdown);
    const original = structuredClone(tree);
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(processor.runSync(tree, { value: markdown, path: 'docs/dns.md' })).toStrictEqual(original);
      expect(warning).toHaveBeenCalledOnce();
      expect(warning).toHaveBeenCalledWith(expect.stringContaining('Missing </quiz>: docs/dns.md'));
    } finally {
      warning.mockRestore();
    }
  });

  it('renders a quiz after an independent admonition using both real plugins', () => {
    const example = readFileSync(new URL('../../examples/admonitions.md', import.meta.url), 'utf8');
    const markdown = example.replace(/^---\n[\s\S]*?\n---\n\n/, '');
    const html = convert(markdown, true);
    expect(html).toContain('mkdocs-admonition');
    expect(html).toContain('DNS resolves domain names.</p>');
    expect(quizIds(html)).toHaveLength(1);
    expect(answerStates(html)).toEqual([true, false]);
    expect(html).toContain('<strong>What does DNS stand for?</strong>');
  });

  it('converts Windows CRLF input identically to LF', () => {
    const windows = convert(single.replaceAll('\n', '\r\n'));
    expect(quizIds(windows)).toHaveLength(1);
    expect(windows).toBe(convert(single));
  });

  it('keeps surrounding text, node identities and source positions', () => {
    const markdown = '# Before\n\n' + single + '\n\nAfter **the quiz**.';
    const processor = createParser().use(remarkMkdocsQuiz);
    const tree = processor.parse(markdown);
    const before = tree.children[0];
    const after = tree.children.at(-1);
    const beforePosition = structuredClone(before.position);
    const afterPosition = structuredClone(after.position);
    processor.runSync(tree, { value: markdown });
    expect(tree.children[0]).toBe(before);
    expect(tree.children.at(-1)).toBe(after);
    expect(before.position).toEqual(beforePosition);
    expect(after.position).toEqual(afterPosition);
    const html = convert(markdown);
    expect(html).toMatch(/^<h1>Before<\/h1>\s*<sl-quiz/);
    expect(html).toMatch(/<\/sl-quiz>\s*<p>After <strong>the quiz<\/strong>\.<\/p>$/);
  });
});

describe('Delimiter boundaries and compatibility', () => {
  it('preserves formatted nodes already transformed by another Remark plugin', () => {
    const markdown = '<quiz>\n**Question**\n\n* [x] Answer\n\nExplanation.\n</quiz>';
    const processor = createParser().use(() => (tree) => {
      tree.children.find((node) => node.type === 'list').data = { transformed: true };
    }).use(remarkMkdocsQuiz);
    const tree = processor.parse(markdown);
    const answerList = tree.children.find((node) => node.type === 'list');
    processor.runSync(tree, { value: markdown });
    expect(tree.children[0].value).toContain('<sl-quiz');
    expect(tree.children[2]).toBe(answerList);
    expect(answerList.data.transformed).toBe(true);
  });

  it('keeps the original separated-marker layout working without VFile source', () => {
    const markdown = '<quiz>\n\n**Question**\n\n* [x] Answer\n\nExplanation.\n\n</quiz>';
    const processor = createParser().use(remarkMkdocsQuiz);
    const tree = processor.parse(markdown);
    const inner = tree.children.slice(1, -1);
    processor.runSync(tree);
    expect(tree.children[0].value).toContain('<sl-quiz');
    expect(tree.children.slice(1, -1)).toEqual(inner);
    expect(tree.children.at(-1).value).toBe('</div>\n</sl-quiz>');
  });

  it('preserves a parsed explanation when running without the original source text', () => {
    const processor = createParser().use(remarkMkdocsQuiz);
    const tree = processor.parse(multi);
    processor.runSync(tree);
    expect(tree.children.at(-2).children[0].value).toBe('Use both address families.');
    expect(tree.children.at(-1).value).toBe('</div>\n</sl-quiz>');
  });

  it('leaves a quiz inside a MkDocs admonition unconverted', () => {
    const markdown = '!!! tip "Knowledge check"\n\n' + single.split('\n')
      .map((line) => line ? '    ' + line : '').join('\n');
    const html = convert(markdown, true);
    expect(html).toContain('mkdocs-admonition');
    expect(html).toContain('<quiz>');
    expect(quizIds(html)).toEqual([]);
  });

  it('ignores a closing marker inside fenced code within a quiz', () => {
    const markdown = '<quiz>\n**Question**\n\n* [x] Answer\n\n'
      + '```html\n</quiz>\n```\n\nAfter the example.\n</quiz>';
    const html = convert(markdown);
    expect(quizIds(html)).toHaveLength(1);
    expect(html).toMatch(/<code class="language-html">(?:&lt;|&#x3C;)\/quiz/i);
    expect(html).toMatch(/<p>After the example\.<\/p>\s*<\/div>\s*<\/sl-quiz>/);
  });

  it('does not consume a valid quiz after an unclosed opening marker', () => {
    const html = convert('<quiz>\nIncomplete question.\n\n' + multi);
    expect(quizIds(html)).toEqual(['mkquiz-docs-dns-md-1']);
    expect(html).toMatch(/^<quiz>\nIncomplete question\.[\s\S]*<sl-quiz/);
    expect(answerStates(html)).toEqual([true, false, true]);
  });

  it('preserves text immediately after a closing tag absorbed into a paragraph', () => {
    const markdown = multi + '\nImmediately **after**.';
    expect(convert(markdown)).toMatch(/<\/sl-quiz>\s*<p>Immediately <strong>after<\/strong>\.<\/p>$/);
  });
});

it('parses the whole body when Remark emits one raw HTML block', () => {
  const markdown = '<quiz>\n**Question?**\n* [x] **Answer**\n</quiz>';
  const processor = createParser().use(remarkMkdocsQuiz);
  const tree = processor.parse(markdown);
  expect(tree.children.map((node) => node.type)).toEqual(['html']);
  processor.runSync(tree);
  expect(tree.children[0].value).toContain('<sl-quiz');
  expect(tree.children[1].children[0].type).toBe('strong');
  const html = convert(markdown);
  expect(quizIds(html)).toHaveLength(1);
  expect(answerStates(html)).toEqual([true]);
  expect(html).toContain('<strong>Answer</strong>');
});
