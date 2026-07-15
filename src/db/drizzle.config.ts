// src/db/drizzle.config.ts
import { defineConfig } from "drizzle-kit";
import * as dotenv from "dotenv";

dotenv.config();

const host = process.env.MYSQL_HOST || "localhost";
const database = process.env.MYSQL_DB_NAME || "food_ordering_db";
const user = process.env.MYSQL_USER || "root";
const password = process.env.MYSQL_PASSWORD || "1234";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "mysql",
  dbCredentials: {
    host,
    user,
    password,
    database,
    port: Number(process.env.MYSQL_PORT || 3306),
  },
  verbose: true,
});
