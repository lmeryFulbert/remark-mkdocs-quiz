import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { unified } from '@astrojs/markdown-remark';
import starlight from '@astrojs/starlight';
import { defineConfig } from 'astro/config';
import remarkAdmonition from 'remark-mkdocs-material-admonitions';
import starlightQuiz from 'starlight-quiz';
import remarkMkdocsQuiz from '../remark-mkdocs-quiz.mjs';

const require = createRequire(import.meta.url);
const quizPackage = dirname(require.resolve('starlight-quiz/package.json'));

export default defineConfig({
  markdown: {
    processor: unified({ remarkPlugins: [remarkAdmonition, remarkMkdocsQuiz] }),
  },
  integrations: [
    starlight({
      title: 'MkDocs quiz adapter',
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
