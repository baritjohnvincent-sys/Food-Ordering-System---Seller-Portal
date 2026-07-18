import mysql from 'mysql2/promise';

const connCfg = { host: process.env.MYSQL_HOST || 'localhost', user: process.env.MYSQL_USER || 'root', password: process.env.MYSQL_PASSWORD || '1234', port: Number(process.env.MYSQL_PORT || 3306) };

(async () => {
  try {
    const conn = await mysql.createConnection(connCfg);
    const [dbs] = await conn.query('SHOW DATABASES');
    console.log('[find_tables] Databases:');
    for (const row of dbs) {
      console.log('-', row.Database);
    }

    const targetTables = ['orders','menu_items','users','staff','audit_logs'];
    console.log('\n[find_tables] Searching information_schema for tables...');
    const placeholders = targetTables.map(()=>'?').join(',');
    const [rows] = await conn.query(
      `SELECT TABLE_SCHEMA, TABLE_NAME FROM information_schema.tables WHERE TABLE_NAME IN (${placeholders})`,
      targetTables
    );

    if (!rows || rows.length === 0) {
      console.log('[find_tables] No matching tables found across databases.');
    } else {
      for (const r of rows) {
        console.log('[find_tables]', r.TABLE_SCHEMA, r.TABLE_NAME);
      }
    }

    await conn.end();
  } catch (err) {
    console.error('[find_tables] Error:', err.message || err);
    process.exit(1);
  }
})();
