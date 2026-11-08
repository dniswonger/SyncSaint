import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

/**
 * Content-Security-Policy for production builds only (Vite's dev server injects inline scripts).
 * The page handles OAuth tokens, so it may only talk to the Spotify/TIDAL auth + API hosts.
 */
const csp: Plugin = {
  name: 'syncsaint-csp',
  apply: 'build',
  transformIndexHtml: () => [
    {
      tag: 'meta',
      attrs: {
        'http-equiv': 'Content-Security-Policy',
        content: [
          "default-src 'none'",
          "script-src 'self'",
          "style-src 'self'",
          "img-src 'self' data: https://i.scdn.co https://*.spotifycdn.com https://mosaic.scdn.co",
          "font-src 'self'",
          'connect-src https://accounts.spotify.com https://api.spotify.com https://auth.tidal.com',
          "base-uri 'self'",
          "form-action 'none'",
        ].join('; '),
      },
      injectTo: 'head-prepend',
    },
    { tag: 'meta', attrs: { name: 'referrer', content: 'no-referrer' }, injectTo: 'head-prepend' },
  ],
};

export default defineConfig({
  // GitHub Pages serves project sites under /<repo>/
  base: process.env.PAGES_BASE ?? '/',
  plugins: [react(), tailwindcss(), csp],
  // Spotify rejects "localhost" redirect URIs; it must be the loopback IP.
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  preview: { host: '127.0.0.1', port: 5173, strictPort: true },
  build: { sourcemap: false },
});
