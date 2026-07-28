import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

const connectionString =
  import.meta.env?.DATABASE_URL || process.env.DATABASE_URL;

// `prepare: false` es obligatorio para el pooler de transacciones de Supabase
// (puerto 6543). Ver: https://orm.drizzle.team/docs/connect-supabase
//
// `max: 1` — postgres-js abre hasta 10 conexiones propias por defecto
// (docs: https://github.com/porsager/postgres). En serverless (Vercel) cada
// invocación es un proceso separado con su propio pool: con el default,
// una ráfaga de 10 invocaciones concurrentes podría intentar abrir hasta
// 100 conexiones contra el pooler de Supabase (que ya pooléa por su
// cuenta). Con max:1, cada instancia mantiene como mucho una conexión —
// el propio postgres.js usa este mismo valor para sus conexiones
// long-lived (listen/subscribe) por la misma razón.
const client = postgres(connectionString!, { prepare: false, max: 1 });

export const db = drizzle(client);
