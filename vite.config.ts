/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const embedded = mode === 'embedded';
  return {
  base: './',
  define: { 'import.meta.env.VITE_EMBEDDED': JSON.stringify(embedded ? '1' : '0') },
  build: embedded
    ? { outDir: 'dist-embedded', assetsInlineLimit: 100_000_000, cssCodeSplit: false, rollupOptions: { output: { inlineDynamicImports: true } } }
    : undefined,
  plugins: [
    react(),
    tailwindcss(),
    !embedded && VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['icons/icon.svg', 'icons/maskable.svg'],
      manifest: {
        name: 'EASY JAWI',
        short_name: 'EASY JAWI',
        description: 'Susun Huruf, Bina Perkataan, Jadi Juara! Permainan papan perkataan Jawi.',
        lang: 'ms',
        dir: 'ltr',
        theme_color: '#123a6b',
        background_color: '#fbf4e4',
        display: 'standalone',
        orientation: 'any',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,json}'],
        navigateFallback: 'index.html',
      },
    }),
  ],
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    testTimeout: 60_000,
  },
  };
});
