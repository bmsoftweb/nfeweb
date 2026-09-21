import mysql from 'mysql2/promise';

const dbConfig: mysql.PoolOptions = {
  host: process.env.MYSQL_HOST || 'localhost',
  port: Number(process.env.MYSQL_PORT) || 3306,
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'nfeweb',
  waitForConnections: true,
  connectionLimit: 10,
  connectTimeout: 20000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  dateStrings: true,
};

export const pool = mysql.createPool(dbConfig);

/** Tabelas criadas pelo extras/nfeweb_schema.sql */
export const DB_TABLES = [
  'nfe_empresas',
  'nfe_usuarios',
  'nfe_config',
  'nfe_certificados',
  'nfe_documentos',
  'nfe_eventos',
  'nfe_inutilizacoes',
  'nfe_distribuicao',
  'nfe_log',
];

export async function checkDbHealth() {
  const inicio = Date.now();
  try {
    const conn = await pool.getConnection();
    const [verRows] = await conn.query<any[]>('SELECT VERSION() as version, DATABASE() as db');
    const latencyMs = Date.now() - inicio;

    const tableCounts: Record<string, number> = {};
    const faltando: string[] = [];
    for (const t of DB_TABLES) {
      try {
        const [res] = await conn.query<any[]>(`SELECT COUNT(*) as cnt FROM ${t}`);
        tableCounts[t] = res[0]?.cnt ?? 0;
      } catch {
        // A tabela não existe: o schema ainda não foi aplicado
        faltando.push(t);
      }
    }

    conn.release();

    return {
      connected: true,
      latencyMs,
      version: verRows[0]?.version || '',
      database: verRows[0]?.db || dbConfig.database,
      host: dbConfig.host,
      port: dbConfig.port,
      user: dbConfig.user,
      tableCounts,
      tabelasFaltando: faltando,
    };
  } catch (err: any) {
    return {
      connected: false,
      latencyMs: Date.now() - inicio,
      error: err.message || 'Falha de conexão com o MySQL',
      code: err.code || 'UNKNOWN',
      host: dbConfig.host,
      port: dbConfig.port,
      user: dbConfig.user,
      database: dbConfig.database,
      tableCounts: {},
      tabelasFaltando: DB_TABLES,
    };
  }
}
