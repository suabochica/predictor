# Manual To-Do

## Netlify Adapter for SSR Apps

`apps/gateway` and `apps/polla` use `output: 'server'` (Astro SSR). To deploy them on Netlify, each needs the `@astrojs/netlify` adapter:

```bash
# In each SSR app directory
cd apps/gateway && pnpm add @astrojs/netlify
cd apps/polla && pnpm add @astrojs/netlify
```

Then update `astro.config.mjs` in each:

```js
import netlify from '@astrojs/netlify';

export default defineConfig({
  // ...existing config...
  adapter: netlify(),
});
```
