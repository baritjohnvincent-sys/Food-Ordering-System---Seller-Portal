import mysql from 'mysql2/promise';

const cfg = {
  host: process.env.MYSQL_HOST || 'localhost',
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '1234',
  database: process.env.MYSQL_DB_NAME || 'food_ordering_db',
  port: Number(process.env.MYSQL_PORT || 3306),
};

(async () => {
  try {
    console.log('[clear_server_db] Connecting to', cfg.host, cfg.database, 'as', cfg.user);
    const conn = await mysql.createConnection({ host: cfg.host, user: cfg.user, password: cfg.password, port: cfg.port });
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${cfg.database}\``);
    await conn.query(`USE \`${cfg.database}\``);

    const tables = ['orders', 'audit_logs', 'menu_items', 'staff', 'users'];
    for (const t of tables) {
      try {
        await conn.query(`DELETE FROM \`${t}\``);
        console.log('[clear_server_db] Cleared table', t);
      } catch (err) {
        console.warn('[clear_server_db] Warning clearing table', t, err.message || err);
      }
    }

    await conn.end();
    console.log('[clear_server_db] Done');
  } catch (err) {
    console.error('[clear_server_db] Error:', err.message || err);
    process.exit(1);
  }
})();
