import './setup';
if (!process.env.TEST_DATABASE_URL) { console.error('Define TEST_DATABASE_URL para limpiar datos de prueba.'); process.exit(1); }
const { cleanupTestData } = await import('./fixtures');
await cleanupTestData();
console.log('Datos [TEST] eliminados.');
process.exit(0);
