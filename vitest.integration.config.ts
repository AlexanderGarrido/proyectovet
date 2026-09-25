import { defineConfig } from 'vitest/config';

// Pruebas contra Postgres real. Solo corren con TEST_DATABASE_URL; nunca en
// `npm test` ni en el build. Hoy apuntan a producción, que solo tiene datos
// de prueba: moverlas a una base aparte antes de atender clientes reales.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    setupFiles: ['tests/integration/setup.ts'],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 60000,
  },
});
