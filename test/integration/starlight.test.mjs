import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { afterAll, beforeAll, expect, it } from 'vitest';

const project = fileURLToPath(new URL('../../', import.meta.url));
const mimeTypes = {
  '.css': 'text/css',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.json': 'application/json',
};
let workspace;
let server;
let origin;
let browser;

beforeAll(async () => {
  workspace = await mkdtemp(join(project, '.integration-'));
  await cp(new URL('./site/', import.meta.url), workspace, { recursive: true });
  const docs = join(workspace, 'src/content/docs');
  await mkdir(docs, { recursive: true });
  await cp(join(project, 'examples'), docs, { recursive: true });
  await cp(join(project, 'test/fixtures'), docs, { recursive: true });
  execFileSync(process.execPath, [join(project, 'node_modules/astro/bin/astro.mjs'), 'build'], {
    cwd: workspace,
    env: { ...process.env, ASTRO_TELEMETRY_DISABLED: '1' },
    stdio: 'pipe',
    timeout: 90_000,
  });

  server = createServer(async (request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    const asset = join(workspace, 'dist', pathname, pathname.endsWith('/') ? 'index.html' : '');
    try {
      const content = await readFile(asset);
      response.writeHead(200, { 'content-type': mimeTypes[extname(asset)] ?? 'application/octet-stream' });
      response.end(content);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE });
}, 100_000);

afterAll(async () => {
  await browser?.close();
  if (server) await new Promise((resolve) => server.close(resolve));
  if (workspace) await rm(workspace, { recursive: true, force: true });
});

it('builds static GFM quiz markup and preserves questions, explanations and page content', async () => {
  const page = await browser.newPage({ javaScriptEnabled: false });
  try {
    await page.goto(`${origin}/dns/`);
    const quizzes = page.locator('sl-quiz.sl-quiz');
    expect(await quizzes.count()).toBe(2);
    const ids = await quizzes.evaluateAll((elements) => elements.map((element) => element.id));
    expect(new Set(ids).size).toBe(2);
    expect(ids.every((id) => id.startsWith('mkquiz-'))).toBe(true);
    expect(await quizzes.first().locator('.sl-quiz-source strong').allTextContents())
      .toEqual(['What is the role of DNS?', 'domain names']);
    expect(await quizzes.first().locator('input:checked').count()).toBe(1);
    expect(await quizzes.last().locator('input:checked').count()).toBe(2);
    expect(await quizzes.last().locator('.sl-quiz-source ul').last().locator('code').allTextContents())
      .toEqual(['A', 'AAAA']);
    expect(await page.getByText('Review the results before moving on.').count()).toBe(1);
  } finally {
    await page.close();
  }
});

it('grades one radio answer and reveals the original explanation', async () => {
  const page = await browser.newPage();
  try {
    await page.goto(`${origin}/dns/`);
    const quiz = page.locator('sl-quiz').first();
    const answer = quiz.getByRole('radio', { name: 'Resolve domain names.' });
    await answer.waitFor();
    expect(await quiz.getByRole('radio').count()).toBe(3);
    expect(await quiz.locator('.sl-quiz-content').isVisible()).toBe(false);
    await answer.click();
    await quiz.locator('.sl-quiz-feedback--correct').waitFor();
    expect(await quiz.locator('.sl-quiz-content').isVisible()).toBe(true);
    expect(await quiz.locator('.sl-quiz-content strong').textContent()).toBe('domain names');
  } finally {
    await page.close();
  }
});

it('grades all selected checkbox answers and reveals the Markdown explanation list', async () => {
  const page = await browser.newPage();
  try {
    await page.goto(`${origin}/dns/`);
    const quiz = page.locator('sl-quiz').last();
    const first = quiz.getByRole('checkbox', { name: 'An A record.', exact: true });
    await first.waitFor();
    expect(await quiz.getByRole('checkbox').count()).toBe(3);
    await first.check();
    await quiz.getByRole('checkbox', { name: 'An AAAA record.', exact: true }).check();
    expect(await quiz.locator('.sl-quiz-content').isVisible()).toBe(false);
    await quiz.locator('button[type="submit"]').click();
    await quiz.locator('.sl-quiz-feedback--correct').waitFor();
    expect(await quiz.locator('.sl-quiz-content').isVisible()).toBe(true);
    expect(await quiz.locator('.sl-quiz-content li code').allTextContents()).toEqual(['A', 'AAAA']);
  } finally {
    await page.close();
  }
});

it('builds and activates an independent quiz placed after a real MkDocs admonition', async () => {
  const page = await browser.newPage();
  try {
    await page.goto(`${origin}/admonitions/`);
    const admonition = page.locator('.mkdocs-admonition');
    expect(await admonition.count()).toBe(1);
    expect(await admonition.textContent()).toContain('DNS resolves domain names.');
    const quiz = page.locator('.mkdocs-admonition + sl-quiz');
    await quiz.getByRole('radio', { name: 'Domain Name System', exact: true }).waitFor();
    expect(await quiz.locator('.sl-quiz-question strong').textContent()).toBe('What does DNS stand for?');
  } finally {
    await page.close();
  }
});

it('grades a partial selection as incorrect when two answers are required', async () => {
  const page = await browser.newPage();
  try {
    await page.goto(`${origin}/dns/`);
    const quiz = page.locator('sl-quiz').last();
    await quiz.getByRole('checkbox', { name: 'An A record.', exact: true }).check();
    await quiz.locator('button[type="submit"]').click();
    await quiz.locator('.sl-quiz-feedback--wrong').waitFor();
  } finally {
    await page.close();
  }
});

it('activates the 16 quizzes from the original DNS page and grades the DNSSEC question', async () => {
  const page = await browser.newPage();
  try {
    await page.goto(`${origin}/16quizz/`);
    const quizzes = page.locator('sl-quiz');
    expect(await quizzes.count()).toBe(16);
    const ids = await quizzes.evaluateAll((elements) => elements.map((element) => element.id));
    expect(new Set(ids).size).toBe(16);
    expect(await quizzes.nth(0).getByRole('radio').count()).toBe(4);
    const dnssec = quizzes.last();
    await dnssec.getByRole('checkbox', { name: /authenticité/ }).check();
    await dnssec.getByRole('checkbox', { name: /intégdrité/ }).check();
    await dnssec.locator('button[type="submit"]').click();
    await dnssec.locator('.sl-quiz-feedback--correct').waitFor();
  } finally {
    await page.close();
  }
});

it('renders both independent admonitions and activates only the four standalone quizzes in the original compatibility page', async () => {
  const page = await browser.newPage();
  try {
    await page.goto(`${origin}/test-quiz-compat/`);
    expect(await page.locator('.mkdocs-admonition').count()).toBe(2);
    expect(await page.locator('.mkdocs-admonition sl-quiz').count()).toBe(0);
    expect(await page.getByText('This paragraph must remain visible and unchanged.').isVisible()).toBe(true);
    const quizzes = page.locator('sl-quiz');
    expect(await quizzes.count()).toBe(4);
    await quizzes.last().getByRole('radio', { name: 'DHCP', exact: true }).click();
    await quizzes.last().locator('.sl-quiz-feedback--correct').waitFor();
  } finally {
    await page.close();
  }
});
