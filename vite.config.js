import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { readdirSync, readFileSync } from 'node:fs';

const licenses = new URL('./licenses/', import.meta.url);

export default defineConfig({
  base: './',
  plugins: [viteSingleFile(), {
    name: 'include-third-party-notices',
    apply: 'build',
    transformIndexHtml() {
      const notices = readdirSync(licenses).sort().map(file =>
        file + '\n' + readFileSync(new URL(file, licenses), 'utf8')
      ).join('\n\n');
      return [{ tag: 'template', attrs: { id: 'third-party-notices' },
        children: notices.replaceAll('&', '&amp;').replaceAll('<', '&lt;'), injectTo: 'body' }];
    },
  }],
});
