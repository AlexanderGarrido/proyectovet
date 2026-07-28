// @ts-check
import { defineConfig } from 'astro/config';

import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import vercel from '@astrojs/vercel';
import sentry from '@sentry/astro';

// https://astro.build/config
export default defineConfig({
  output: 'server',
  // Precarga el HTML de destino al pasar el mouse/enfocar un link (estrategia
  // 'hover' por defecto) — la navegación por el sidebar y las listas se
  // siente instantánea en vez de esperar una carga completa por click.
  prefetch: {
    prefetchAll: true,
  },
  integrations: [
    react(),
    // Sin SENTRY_DSN configurado, el SDK no envía nada — queda inactivo
    // hasta que se cree una cuenta en sentry.io y se agregue la variable.
    sentry({ dsn: process.env.SENTRY_DSN }),
  ],

  vite: {
    plugins: [tailwindcss()]
  },

  adapter: vercel(),
});
