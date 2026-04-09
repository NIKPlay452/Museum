const { Pool } = require('pg');

const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;

if (!connectionString) {
    console.error('❌ POSTGRES_URL не задан!');
}

const pool = new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    ssl: { rejectUnauthorized: false }
});

pool.on('error', (err) => {
    console.error('❌ Ошибка пула PostgreSQL:', err);
});

// Асинхронные функции
async function query(sql, params = []) {
    const client = await pool.connect();
    try {
        return await client.query(sql, params);
    } finally {
        client.release();
    }
}

async function get(sql, params = []) {
    const result = await query(sql, params);
    return result.rows[0];
}

async function all(sql, params = []) {
    const result = await query(sql, params);
    return result.rows;
}

async function run(sql, params = []) {
    const result = await query(sql, params);
    return { lastID: result.rows[0]?.id, changes: result.rowCount };
}

// Callback-функции для совместимости со старым кодом
function getCallback(sql, params, callback) {
    get(sql, params)
        .then(row => callback(null, row))
        .catch(err => callback(err));
}

function allCallback(sql, params, callback) {
    all(sql, params)
        .then(rows => callback(null, rows))
        .catch(err => callback(err));
}

function runCallback(sql, params, callback) {
    run(sql, params)
        .then(result => callback(null, result))
        .catch(err => callback(err));
}

module.exports = { 
    query, get, all, run,
    get: getCallback,
    all: allCallback,
    run: runCallback,
    pool 
};