import 'dotenv/config';
// src/db lee DATABASE_URL al importarse: se reemplaza antes de que ningún
// test lo cargue, para que la conexión sea siempre la de prueba declarada.
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
