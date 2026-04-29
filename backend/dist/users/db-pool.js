"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPgPool = createPgPool;
const pg_1 = require("pg");
function createPgPool() {
    return new pg_1.Pool({
        host: process.env.DB_HOST || "127.0.0.1",
        port: Number(process.env.DB_PORT || 5432),
        database: process.env.POSTGRES_DB || "thesis_portal",
        user: process.env.POSTGRES_USER || "thesis_user",
        password: process.env.POSTGRES_PASSWORD || "thesis_pass"
    });
}
//# sourceMappingURL=db-pool.js.map