import mysql from 'mysql2/promise';
import * as schema from './schema.ts';

// Detect database configuration
const mysqlHost = process.env.MYSQL_HOST || 'localhost';
const mysqlUser = process.env.MYSQL_USER || 'root';
const mysqlPassword = process.env.MYSQL_PASSWORD || '1234';
const mysqlDatabase = process.env.MYSQL_DB_NAME || 'food_ordering_db';
const mysqlPort = Number(process.env.MYSQL_PORT || 3306);

// Initialize MySQL Pool
let mysqlPool: any = null;
let useInMemoryMock = false;

const inMemoryStore: Record<string, any[]> = {
  users: [],
  staff: [],
  menu_items: [],
  orders: [],
  audit_logs: []
};

// Map of camelCase schema fields to MySQL snake_case table columns
const camelToSnakeMap: Record<string, string> = {
  uid: 'uid',
  email: 'email',
  name: 'name',
  role: 'role',
  phone: 'phone',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  pin: 'pin',
  status: 'status',
  category: 'category',
  price: 'price',
  inventoryQty: 'inventory_qty',
  sku: 'sku',
  orderNumber: 'order_number',
  customerName: 'customer_name',
  customerPhone: 'customer_phone',
  deliveryAddress: 'delivery_address',
  itemsJson: 'items_json',
  totalAmount: 'total_amount',
  paymentStatus: 'payment_status',
  paymentMethod: 'payment_method',
  orderStatus: 'order_status',
  actionBy: 'action_by',
  stockReduced: 'stock_reduced',
  employeeName: 'employee_name',
  action: 'action',
  timestamp: 'timestamp',
  ingredientsJson: 'ingredients_json',
  allergensJson: 'allergens_json',
  image: 'image',
  photoUrl: 'photo_url',
  businessName: 'business_name',
  ownerName: 'owner_name',
  password: 'password'
};

// Flush in-memory cache contents into native MySQL tables
async function flushInMemoryStoreToMysql(connection: any) {
  const tables = Object.keys(inMemoryStore);
  let totalSynced = 0;
  for (const table of tables) {
    const rows = inMemoryStore[table] || [];
    if (rows.length === 0) continue;
    
    if (totalSynced === 0) {
      console.log('[Database] Synchronizing offline/in-memory data to MySQL Workbench (System Database) first...');
    }
    console.log(`[Database Sync] Found ${rows.length} pending rows in offline cache for "${table}". Syncing now...`);
    totalSynced += rows.length;
    
    for (const row of rows) {
      const dbRow: Record<string, any> = {};
      for (const key of Object.keys(row)) {
        const dbCol = camelToSnakeMap[key] || key;
        let v = row[key];
        if (typeof v === 'boolean') {
          dbRow[dbCol] = v ? 1 : 0;
        } else if (v instanceof Date) {
          dbRow[dbCol] = v.toISOString().slice(0, 19).replace('T', ' ');
        } else if (typeof v === 'object' && v !== null) {
          dbRow[dbCol] = JSON.stringify(v);
        } else {
          dbRow[dbCol] = v;
        }
      }

      const keys = Object.keys(dbRow);
      if (keys.length === 0) continue;
      
      const columns = keys.map(k => `\`${k}\``).join(', ');
      const placeholders = keys.map(() => '?').join(', ');
      const params = keys.map(k => dbRow[k]);

      let sql = `INSERT INTO \`${table}\` (${columns}) VALUES (${placeholders})`;
      
      const updateCols = keys.filter(k => k !== 'id' && k !== 'uid' && k !== 'created_at');
      if (updateCols.length > 0) {
        const updateParts = updateCols.map(k => `\`${k}\` = VALUES(\`${k}\`)`).join(', ');
        sql += ` ON DUPLICATE KEY UPDATE ${updateParts}`;
      } else {
        sql += ` ON DUPLICATE KEY UPDATE \`id\` = \`id\``;
      }

      try {
        await connection.execute(sql, params);
      } catch (insertErr: any) {
        console.error(`[Database Sync Warning] Could not sync row to table ${table}:`, insertErr.message);
      }
    }
    // Successfully synced, clear local cache for this table
    inMemoryStore[table] = [];
  }
  if (totalSynced > 0) {
    console.log('[Database Sync] Offline/in-memory cache successfully synchronized to MySQL Workbench!');
  }
}

let hasBootstrapped = false;

// Automatically create tables in MySQL if they do not exist
async function bootstrapMysqlTablesWithConnection(connection: any) {
  // Helper to safely execute ALTER queries on existing databases
  const safeAlter = async (query: string) => {
    try {
      await connection.query(query);
    } catch (err: any) {
      // Ignore errors like column already exists or table doesn't exist
    }
  };

  try {
    if (!hasBootstrapped) {
      console.log('[MySQL] Ensuring tables are bootstrapped inside MySQL Workbench...');
    }
    
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`users\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`uid\` VARCHAR(255) NOT NULL UNIQUE,
        \`email\` VARCHAR(255) NOT NULL,
        \`name\` VARCHAR(255) NULL,
        \`role\` VARCHAR(255) NOT NULL DEFAULT 'Manager',
        \`phone\` VARCHAR(255) NULL,
        \`business_name\` VARCHAR(255) NULL,
        \`password\` VARCHAR(255) NULL,
        \`pin\` VARCHAR(255) NULL,
        \`photo_url\` LONGTEXT NULL,
        \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`staff\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`uid\` VARCHAR(255) NOT NULL UNIQUE,
        \`email\` VARCHAR(255) NULL,
        \`name\` VARCHAR(255) NOT NULL,
        \`pin\` VARCHAR(255) NULL,
        \`role\` VARCHAR(255) NOT NULL DEFAULT 'Staff',
        \`status\` VARCHAR(255) NOT NULL DEFAULT 'active',
        \`phone\` VARCHAR(255) NULL,
        \`business_name\` VARCHAR(255) NULL,
        \`password\` VARCHAR(255) NULL,
        \`photo_url\` LONGTEXT NULL,
        \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Ensure all columns exist in any pre-existing "users" table
    await safeAlter("ALTER TABLE `users` ADD COLUMN `phone` VARCHAR(255) NULL");
    await safeAlter("ALTER TABLE `users` ADD COLUMN `business_name` VARCHAR(255) NULL");
    await safeAlter("ALTER TABLE `users` ADD COLUMN `password` VARCHAR(255) NULL");
    await safeAlter("ALTER TABLE `users` ADD COLUMN `pin` VARCHAR(255) NULL");
    await safeAlter("ALTER TABLE `users` ADD COLUMN `photo_url` LONGTEXT NULL");
    await safeAlter("ALTER TABLE `users` ADD COLUMN `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP");

    // Ensure all columns exist in any pre-existing "staff" table
    await safeAlter("ALTER TABLE `staff` ADD COLUMN `email` VARCHAR(255) NULL UNIQUE");
    await safeAlter("ALTER TABLE `staff` ADD COLUMN `phone` VARCHAR(255) NULL");
    await safeAlter("ALTER TABLE `staff` ADD COLUMN `business_name` VARCHAR(255) NULL");
    await safeAlter("ALTER TABLE `staff` ADD COLUMN `password` VARCHAR(255) NULL");
    await safeAlter("ALTER TABLE `staff` MODIFY COLUMN `pin` VARCHAR(255) NULL");

    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`menu_items\` (
        \`id\` VARCHAR(255) PRIMARY KEY,
        \`name\` VARCHAR(255) NOT NULL,
        \`category\` VARCHAR(255) NOT NULL,
        \`price\` DECIMAL(10, 2) NOT NULL,
        \`inventory_qty\` INT NOT NULL DEFAULT 0,
        \`sku\` VARCHAR(255) NULL,
        \`status\` VARCHAR(255) NOT NULL DEFAULT 'active',
        \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        \`ingredients_json\` TEXT NULL,
        \`allergens_json\` TEXT NULL,
        \`image\` LONGTEXT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await safeAlter("ALTER TABLE `menu_items` ADD COLUMN `ingredients_json` TEXT NULL");
    await safeAlter("ALTER TABLE `menu_items` ADD COLUMN `allergens_json` TEXT NULL");
    await safeAlter("ALTER TABLE `menu_items` ADD COLUMN `image` LONGTEXT NULL");
    await safeAlter("ALTER TABLE `menu_items` MODIFY COLUMN `image` LONGTEXT NULL");

    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`orders\` (
        \`id\` VARCHAR(255) PRIMARY KEY,
        \`order_number\` VARCHAR(255) NOT NULL,
        \`customer_name\` VARCHAR(255) NULL,
        \`customer_phone\` VARCHAR(255) NULL,
        \`delivery_address\` TEXT NULL,
        \`items_json\` TEXT NOT NULL,
        \`total_amount\` DECIMAL(10, 2) NOT NULL,
        \`payment_status\` VARCHAR(255) NOT NULL DEFAULT 'unpaid',
        \`payment_method\` VARCHAR(255) NOT NULL DEFAULT 'cash',
        \`order_status\` VARCHAR(255) NOT NULL DEFAULT 'received',
        \`action_by\` VARCHAR(255) NOT NULL DEFAULT 'System',
        \`stock_reduced\` TINYINT(1) NOT NULL DEFAULT 0,
        \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`audit_logs\` (
        \`id\` VARCHAR(255) PRIMARY KEY,
        \`employee_name\` VARCHAR(255) NOT NULL,
        \`role\` VARCHAR(255) NOT NULL,
        \`action\` TEXT NOT NULL,
        \`timestamp\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    if (!hasBootstrapped) {
      console.log('[MySQL] MySQL Workbench Tables successfully verified & bootstrapped.');
      hasBootstrapped = true;
    }
  } catch (err: any) {
    console.error('[MySQL Setup Error] Could not bootstrap database tables:', err.message);
    throw err;
  }
}

// Resilient reconnection and synchronization trigger
async function tryConnectAndBootstrap() {
  try {
    // Auto-create MySQL database if it doesn't exist
    try {
      const tempConnection = await mysql.createConnection({
        host: mysqlHost,
        user: mysqlUser,
        password: mysqlPassword,
        port: mysqlPort,
      });
      await tempConnection.query(`CREATE DATABASE IF NOT EXISTS \`${mysqlDatabase}\``);
      await tempConnection.end();
    } catch (dbCreateErr: any) {
      console.warn('[Database Setup Info] Database existence check returned:', dbCreateErr.message);
    }

    let connection: any = null;
    
    // Check if the current pool is functional
    if (mysqlPool) {
      try {
        connection = await mysqlPool.getConnection();
      } catch (poolErr) {
        console.log('[Database] Connection pool is stale, preparing to recreate pool...');
        mysqlPool = null;
      }
    }

    if (!mysqlPool) {
      mysqlPool = mysql.createPool({
        host: mysqlHost,
        user: mysqlUser,
        password: mysqlPassword,
        database: mysqlDatabase,
        port: mysqlPort,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
      });
      connection = await mysqlPool.getConnection();
    }

    if (connection) {
      try {
        // First verify schema/tables
        await bootstrapMysqlTablesWithConnection(connection);
        // Next immediately push offline in-memory data to MySQL Workbench
        await flushInMemoryStoreToMysql(connection);
        
        if (useInMemoryMock) {
          console.log('[Database] Native MySQL connection RESTORED! Using MySQL Workbench as primary database.');
        }
        useInMemoryMock = false;
      } finally {
        connection.release();
      }
    }
  } catch (err: any) {
    console.warn('[Database] MySQL Workbench is offline or unreachable:', err.message);
    console.log('[Database] MySQL is required for this app; please ensure the MySQL server is running.');
  }
}

// Trigger initial connection and schema verification
tryConnectAndBootstrap();

// Set up periodic background retry to sync with local MySQL Workbench as soon as it goes online (every 10 seconds)
setInterval(() => {
  tryConnectAndBootstrap();
}, 10000);


// Helper to identify table name from Drizzle table object
function getTableName(tableObj: any): string {
  if (!tableObj) return '';

  const drizzleNameSymbol = Object.getOwnPropertySymbols(tableObj).find((s: symbol) => s.toString() === 'Symbol(drizzle:Name)');
  const symbolName = tableObj?.[Symbol.for('drizzle:Name')] ?? (drizzleNameSymbol ? tableObj[drizzleNameSymbol] : undefined);
  if (typeof symbolName === 'string' && symbolName) {
    return symbolName;
  }

  const originalNameSymbol = Object.getOwnPropertySymbols(tableObj).find((s: symbol) => s.toString() === 'Symbol(drizzle:OriginalName)');
  const originalName = tableObj?.[Symbol.for('drizzle:OriginalName')] ?? (originalNameSymbol ? tableObj[originalNameSymbol] : undefined);
  if (typeof originalName === 'string' && originalName) {
    return originalName;
  }

  const tableMetaSymbol = Object.getOwnPropertySymbols(tableObj).find((s: symbol) => s.toString() === 'Symbol(drizzle:Name)');
  const tableMeta = tableMetaSymbol ? tableObj[tableMetaSymbol] : undefined;
  if (typeof tableMeta === 'string' && tableMeta) {
    return tableMeta;
  }

  if (tableObj?.name) return tableObj.name;
  if (tableObj === schema.users) return 'users';
  if (tableObj === schema.staff) return 'staff';
  if (tableObj === schema.menuItems) return 'menu_items';
  if (tableObj === schema.orders) return 'orders';
  if (tableObj === schema.auditLogs) return 'audit_logs';
  return '';
}

// Simple parser to extract field and value from Drizzle where condition
function parseCondition(condition: any) {
  let field = 'id';
  let val: any = null;
  if (!condition || typeof condition !== 'object') {
    return { field, val };
  }

  // Try to extract field name from various possible locations
  if (condition.left && typeof condition.left === 'object') {
    if (condition.left.name) {
      field = condition.left.name;
    }
  }

  // Try to extract value from right side
  if (condition.right !== undefined) {
    const right = condition.right;
    if (right && typeof right === 'object') {
      if ('value' in right) {
        val = right.value;
      } else if (typeof right === 'object' && right.toString && right.toString().includes('Param')) {
        // Might be a Param object
        if ('value' in right) val = right.value;
      } else {
        val = right;
      }
    } else {
      val = right;
    }
  } else if ('value' in condition) {
    val = (condition as any).value;
  }

  // Try extracting from queryChunks array
  if (Array.isArray(condition.queryChunks)) {
    const queryChunks = condition.queryChunks;
    for (const chunk of queryChunks) {
      if (!chunk || typeof chunk !== 'object') continue;
      if (!field || field === 'id') {
        if (typeof chunk.name === 'string' && chunk.name.trim()) {
          field = chunk.name;
        }
      }
      const constructorName = chunk.constructor?.name;
      if (constructorName === 'Param' && 'value' in chunk && chunk.value !== undefined) {
        val = chunk.value;
        break;
      }
    }
    if (val === null || val === undefined) {
      for (const chunk of queryChunks) {
        if (!chunk || typeof chunk !== 'object') continue;
        if ('value' in chunk && chunk.value !== undefined && chunk.value !== null) {
          const value = chunk.value;
          if (typeof value === 'string') {
            const trimmed = value.trim();
            if (trimmed && trimmed !== '=' && trimmed.toUpperCase() !== 'WHERE') {
              val = value;
              break;
            }
          } else {
            val = value;
            break;
          }
        }
      }
    }
  }

  return { field, val };
}

// Case mapping helpers for PG schema <-> MySQL tables
const snakeToCamelMap: Record<string, string> = {};
for (const [camel, snake] of Object.entries(camelToSnakeMap)) {
  snakeToCamelMap[snake] = camel;
}

// In-Memory operations helpers
function executeInMemoryInsert(tableName: string, values: any[], hasOnConflict: boolean, conflictConfig: any) {
  const store = inMemoryStore[tableName] || [];
  const results: any[] = [];
  for (const val of values) {
    const item = { ...val };
    
    // Auto-generate ids for users / staff if missing
    if (tableName === 'users' || tableName === 'staff') {
      if (!item.id) {
        item.id = store.length + 1;
      }
    }
    
    let conflictIndex = -1;
    if (tableName === 'users' && item.uid) {
      conflictIndex = store.findIndex(x => x.uid === item.uid);
    } else if (tableName === 'staff' && item.uid) {
      conflictIndex = store.findIndex(x => x.uid === item.uid);
    } else if (tableName === 'menu_items' && item.id) {
      conflictIndex = store.findIndex(x => x.id === item.id);
    } else if (tableName === 'orders' && item.id) {
      conflictIndex = store.findIndex(x => x.id === item.id);
    } else if (tableName === 'audit_logs' && item.id) {
      conflictIndex = store.findIndex(x => x.id === item.id);
    }

    if (conflictIndex !== -1 && hasOnConflict && conflictConfig) {
      const existing = store[conflictIndex];
      const setObj = conflictConfig.set;
      for (const k of Object.keys(setObj)) {
        existing[k] = setObj[k];
      }
      results.push(JSON.parse(JSON.stringify(existing)));
    } else if (conflictIndex !== -1) {
      store[conflictIndex] = item;
      results.push(item);
    } else {
      store.push(item);
      results.push(item);
    }
  }
  inMemoryStore[tableName] = store;
  return JSON.parse(JSON.stringify(results));
}

function executeInMemoryUpdate(tableName: string, data: any, conditionField: string, conditionValue: any) {
  const store = inMemoryStore[tableName] || [];
  let updatedCount = 0;
  for (let i = 0; i < store.length; i++) {
    const row = store[i];
    if (!conditionField || row[conditionField] === conditionValue) {
      for (const k of Object.keys(data)) {
        row[k] = data[k];
      }
      updatedCount++;
    }
  }
  inMemoryStore[tableName] = store;
  return { affectedRows: updatedCount };
}

function executeInMemoryDelete(tableName: string, conditionField: string, conditionValue: any) {
  const store = inMemoryStore[tableName] || [];
  const initialLength = store.length;
  let newStore = store;
  if (conditionField) {
    newStore = store.filter(row => row[conditionField] !== conditionValue);
  } else {
    newStore = [];
  }
  inMemoryStore[tableName] = newStore;
  return { affectedRows: initialLength - newStore.length };
}

// Fluent MySQL Select implementation
const mysqlSelect = () => {
  let selectFields = '*';
  let tableName = '';
  let conditionField = '';
  let conditionValue: any = null;
  let limitValue: number | null = null;
  let offsetValue: number | null = null;

  const builder = {
    from: (table: any) => {
      tableName = getTableName(table);
      return builder;
    },
    where: (condition: any) => {
      const { field, val } = parseCondition(condition);
      conditionField = field;
      conditionValue = val;
      return builder;
    },
    limit: (value: number) => {
      limitValue = value;
      return builder;
    },
    offset: (value: number) => {
      offsetValue = value;
      return builder;
    },
    then: (resolve?: any, reject?: any) => {
      const promise = (async () => {
        if (!mysqlPool) {
          await tryConnectAndBootstrap();
        }

        let sql = `SELECT ${selectFields} FROM \`${tableName}\``;
        const params: any[] = [];
        if (conditionField) {
          const dbCondCol = camelToSnakeMap[conditionField] || conditionField;
          sql += ` WHERE \`${dbCondCol}\` = ?`;
          params.push(conditionValue);
        }
        if (limitValue !== null) {
          sql += ` LIMIT ${Number(limitValue)}`;
        }
        if (offsetValue !== null) {
          sql += ` OFFSET ${Number(offsetValue)}`;
        }

        const [rows] = await mysqlPool.execute(sql, params);

        const mapped = (rows as any[]).map(row => {
          const mappedRow: Record<string, any> = {};
          for (const key of Object.keys(row)) {
            const camelKey = snakeToCamelMap[key] || key;
            let v = row[key];

            if (camelKey === 'stockReduced') {
              v = Boolean(v);
            } else if (camelKey === 'itemsJson') {
              if (typeof v !== 'string') {
                v = JSON.stringify(v);
              }
            }
            mappedRow[camelKey] = v;
          }
          return mappedRow;
        });
        return mapped;
      })();
      return promise.then(resolve, reject);
    }
  };
  return builder;
};

// Fluent MySQL Insert implementation
const mysqlInsert = (table: any) => {
  const tableName = getTableName(table);
  let valuesToInsert: any[] = [];

  const builder = {
    values: (valuesObj: any) => {
      valuesToInsert = Array.isArray(valuesObj) ? valuesObj : [valuesObj];
      
      const chain = {
        onConflictDoUpdate: (config: any) => {
          chain.hasOnConflict = true;
          chain.conflictConfig = config;
          return chain;
        },
        returning: () => {
          chain.hasReturning = true;
          return chain;
        },
        hasOnConflict: false,
        conflictConfig: null as any,
        hasReturning: false,
        then: (resolve?: any, reject?: any) => {
          const promise = (async () => {
            if (!mysqlPool) {
              await tryConnectAndBootstrap();
            }

            const results: any[] = [];
            for (const val of valuesToInsert) {
              const item = { ...val };
              
              // Convert camelCase parameters to snake_case table columns
              const dbRow: Record<string, any> = {};
              for (const key of Object.keys(item)) {
                const dbCol = camelToSnakeMap[key] || key;
                let v = item[key];
                if (typeof v === 'boolean') {
                  dbRow[dbCol] = v ? 1 : 0;
                } else if (v instanceof Date) {
                  dbRow[dbCol] = v.toISOString().slice(0, 19).replace('T', ' ');
                } else {
                  dbRow[dbCol] = v;
                }
              }

              const keys = Object.keys(dbRow);
              const columns = keys.map(k => `\`${k}\``).join(', ');
              const placeholders = keys.map(() => '?').join(', ');
              const params = keys.map(k => dbRow[k]);

              let sql = `INSERT INTO \`${tableName}\` (${columns}) VALUES (${placeholders})`;
              
              if (chain.hasOnConflict && chain.conflictConfig) {
                const setObj = chain.conflictConfig.set;
                const setKeys = Object.keys(setObj);
                if (setKeys.length > 0) {
                  const updateParts: string[] = [];
                  for (const k of setKeys) {
                    const dbCol = camelToSnakeMap[k] || k;
                    updateParts.push(`\`${dbCol}\` = ?`);
                    
                    let v = setObj[k];
                    if (typeof v === 'boolean') {
                      params.push(v ? 1 : 0);
                    } else if (v instanceof Date) {
                      params.push(v.toISOString().slice(0, 19).replace('T', ' '));
                    } else {
                      params.push(v);
                    }
                  }
                  sql += ` ON DUPLICATE KEY UPDATE ${updateParts.join(', ')}`;
                }
              } else if (tableName === 'menu_items') {
                const updateCols = keys.filter(k => k !== 'id');
                if (updateCols.length > 0) {
                  const updateParts = updateCols.map(k => `\`${k}\` = VALUES(\`${k}\`)`).join(', ');
                  sql += ` ON DUPLICATE KEY UPDATE ${updateParts}`;
                } else {
                  sql += ` ON DUPLICATE KEY UPDATE \`id\` = \`id\``;
                }
              }

              const [resHeader]: any = await mysqlPool.execute(sql, params);
              
              if (tableName === 'users' || tableName === 'staff') {
                if (!item.id && resHeader.insertId) {
                  item.id = resHeader.insertId;
                }
              }
              results.push(item);
            }
            return results;
          })();
          return promise.then(resolve, reject);
        }
      };
      return chain;
    }
  };
  return builder;
};

// Fluent MySQL Update implementation
const mysqlUpdate = (table: any) => {
  const tableName = getTableName(table);
  let setData: any = null;
  let conditionField = '';
  let conditionValue: any = null;

  const builder = {
    set: (data: any) => {
      setData = data;
      return builder;
    },
    where: (condition: any) => {
      const { field, val } = parseCondition(condition);
      conditionField = field;
      conditionValue = val;
      return builder;
    },
    then: (resolve?: any, reject?: any) => {
      return (async () => {
        try {
          if (!mysqlPool) {
            await tryConnectAndBootstrap();
          }

          const keys = Object.keys(setData || {});
          const updateParts: string[] = [];
          const params: any[] = [];
          for (const k of keys) {
            const dbCol = camelToSnakeMap[k] || k;
            updateParts.push(`\`${dbCol}\` = ?`);
            let v = setData[k];
            if (typeof v === 'boolean') {
              params.push(v ? 1 : 0);
            } else if (v instanceof Date) {
              params.push(v.toISOString().slice(0, 19).replace('T', ' '));
            } else {
              params.push(v);
            }
          }

          let sql = `UPDATE \`${tableName}\` SET ${updateParts.join(', ')}`;
          if (conditionField) {
            const dbCondCol = camelToSnakeMap[conditionField] || conditionField;
            sql += ` WHERE \`${dbCondCol}\` = ?`;
            params.push(conditionValue);
          }

          const [res] = await mysqlPool.execute(sql, params);
          if (resolve) resolve(res);
          return res;
        } catch (err) {
          if (reject) reject(err);
          else throw err;
        }
      })();
    },
    catch: (fn?: any) => {
      return builder;
    }
  };
  return builder;
};

// Fluent MySQL Delete implementation
const mysqlDelete = (table: any) => {
  const tableName = getTableName(table);
  let conditionField = '';
  let conditionValue: any = null;

  const builder = {
    where: (condition: any) => {
      const { field, val } = parseCondition(condition);
      conditionField = field;
      conditionValue = val;
      return builder;
    },
    then: (resolve?: any, reject?: any) => {
      return (async () => {
        try {
          if (!mysqlPool) {
            await tryConnectAndBootstrap();
          }

          let sql = `DELETE FROM \`${tableName}\``;
          const params: any[] = [];
          if (conditionField) {
            const dbCondCol = camelToSnakeMap[conditionField] || conditionField;
            sql += ` WHERE \`${dbCondCol}\` = ?`;
            params.push(conditionValue);
          }
          const [res] = await mysqlPool.execute(sql, params);
          if (resolve) resolve(res);
          return res;
        } catch (err) {
          if (reject) reject(err);
          else throw err;
        }
      })();
    },
    catch: (fn?: any) => {
      return builder;
    }
  };
  return builder;
};

// Direct MySQL exports
export const db: any = {
  select: mysqlSelect,
  insert: mysqlInsert,
  update: mysqlUpdate,
  delete: mysqlDelete,
};

export { schema };

