# Deployment

## Local

```bash
npm install
npm run dev
```

## Production

```bash
npm run build
npm run preview
```

## GitHub Pages

For a project page such as:

```text
https://username.github.io/rescuesphere/
```

set `base` in `vite.config.ts` to:

```ts
base: '/rescuesphere/'
```

Then build and publish the `dist/` folder.

## Vercel / Netlify / Cloudflare Pages

- Build command: `npm run build`
- Output directory: `dist`
- Base path: `/` for a root domain, or the repository path for project hosting

Verify the public HTTPS URL in a desktop browser and on a compatible Meta Quest device before submission.
