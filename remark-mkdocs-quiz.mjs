/**
 * Convert standalone MkDocs <quiz> blocks to markup for starlight-quiz.
 * Requires a Remark processor with GFM task-list support.
 */

const OPEN = /^<quiz(?:[ \t]+[^>\r\n]*)?>/i;
const CLOSE = /^<\/quiz[ \t]*>/i;

function findClosingTag(node, source) {
  if (node.type === 'html') {
    const tag = node.value.match(CLOSE)?.[0];
    if (!tag) return;

    const start = node.position?.start.offset;
    if (!source) return node.value.trim() === tag ? { node, start, tag } : undefined;
    if (start === undefined || !source.startsWith(tag, start)) return;

    const lineStart = source.lastIndexOf('\n', start - 1) + 1;
    const after = source.slice(start + tag.length).split(/\r?\n/, 1)[0];
    if (/^ {0,3}$/.test(source.slice(lineStart, start)) && /^[ \t]*$/.test(after)) {
      return { node, start, tag };
    }
  }

  // A standalone closing tag can be parsed into the preceding paragraph or
  // list item. Code spans and code blocks have no HTML children to examine.
  for (const child of node.children ?? []) {
    if (!source && (node.type !== 'paragraph' || child.type !== 'html')) continue;
    const closing = findClosingTag(child, source);
    if (closing) return closing;
  }
}

function splitClosingNode(node, closing, source, parse) {
  // Preserve any Remark work already done on siblings of an inline HTML tag.
  const index = node.type === 'paragraph' ? node.children.indexOf(closing.node) : -1;
  if (index >= 0) {
    const before = node.children.slice(0, index);
    const after = node.children.slice(index + 1);
    for (const [children, edge, trim] of [
      [before, before.length - 1, 'trimEnd'],
      [after, 0, 'trimStart'],
    ]) {
      const child = children[edge];
      if (child?.type === 'text') {
        const value = child.value[trim]();
        if (value) children[edge] = { ...child, value };
        else children.splice(edge, 1);
      }
    }
    return [before, after].map((children) => children.length ? [{ ...node, children }] : []);
  }

  if (!source) return [[], []];
  const end = closing.start + closing.tag.length;

  // Only reparse the node that straddles the delimiter, for example a list
  // with an unindented closing tag parsed into its last item.
  return [
    parse(source.slice(node.position.start.offset, closing.start)),
    parse(source.slice(end, node.position.end.offset)),
  ];
}

export default function remarkMkdocsQuiz() {
  const processor = this;
  const parse = (markdown) => processor.parse(markdown).children;

  return (tree, file) => {
    const source = String(file);
    const page = String(file.path || 'page').replace(/[^a-zA-Z0-9_-]/g, '-').slice(-80);
    const children = tree.children;
    let counter = 0;

    function wrap(body) {
      const id = `mkquiz-${page}-${++counter}`;
      return [
        { type: 'html', value: `<sl-quiz id="${id}" class="sl-quiz" data-auto-submit="true">\n<div class="sl-quiz-source">` },
        ...body,
        { type: 'html', value: '</div>\n</sl-quiz>' },
      ];
    }

    for (let index = 0; index < children.length; index++) {
      const node = children[index];

      if (node.type === 'paragraph') {
        const first = node.children[0];
        const last = node.children.at(-1);
        const start = node.position?.start;
        const end = node.position?.end;
        if (start?.line === end?.line && first?.type === 'html' && OPEN.test(first.value)
          && last?.type === 'html' && CLOSE.test(last.value)) {
          const replacement = wrap([{ ...node, children: node.children.slice(1, -1) }]);
          children.splice(index, 1, ...replacement);
          index += replacement.length - 1;
        }
        continue;
      }

      const opening = node.type === 'html' && node.value.match(OPEN);
      if (!opening) continue;

      const tail = node.value.slice(opening[0].length);
      const leading = parse(tail);
      // CommonMark can emit an entire quiz as one HTML node.
      const localClose = leading.map((part) => findClosingTag(part, tail)).find(Boolean);
      if (localClose) {
        const replacement = [
          ...wrap(parse(tail.slice(0, localClose.start))),
          ...parse(tail.slice(localClose.start + localClose.tag.length)),
        ];
        children.splice(index, 1, ...replacement);
        index += replacement.length - 1;
        continue;
      }

      let end = index + 1;
      let closing;
      for (; end < children.length; end++) {
        const candidate = children[end];
        // A malformed quiz must not take the closing tag of the next quiz.
        if (candidate.type === 'html' && OPEN.test(candidate.value)) break;
        closing = findClosingTag(candidate, source);
        if (closing) break;
      }

      if (!closing) {
        console.warn(`[remark-mkdocs-quiz] Missing </quiz>: ${file.path || '(unknown file)'}`);
        continue;
      }

      const [before, after] = splitClosingNode(children[end], closing, source, parse);
      const replacement = [
        ...wrap([...leading, ...children.slice(index + 1, end), ...before]),
        ...after,
      ];
      children.splice(index, end - index + 1, ...replacement);
      index += replacement.length - 1;
    }
  };
}
