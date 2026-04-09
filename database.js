const { Pool } = require('pg');

// Получаем строку подключения из переменных окружения
const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;

if (!connectionString) {
    console.error('❌ POSTGRES_URL не задан!');
    console.error('Убедитесь, что база данных подключена в Vercel Storage');
}

// Настройка пула соединений для Neon
const pool = new Pool({
    connectionString,
    max: 10,                       // Максимум соединений в пуле
    idleTimeoutMillis: 30000,      // Закрывать неактивные соединения через 30 сек
    connectionTimeoutMillis: 5000,  // Таймаут подключения 5 секунд
    ssl: {
        rejectUnauthorized: false   // Обязательно для Neon
    }
});

// Логирование событий пула
pool.on('connect', () => {
    console.log('✅ Подключение к PostgreSQL установлено');
});

pool.on('error', (err) => {
    console.error('❌ Ошибка пула PostgreSQL:', err);
});

// ============================================================================
// ОСНОВНЫЕ МЕТОДЫ ДЛЯ РАБОТЫ С БАЗОЙ ДАННЫХ
// ============================================================================

// Выполнение SQL запроса (возвращает результат с rows)
async function query(sql, params = []) {
    const client = await pool.connect();
    try {
        const start = Date.now();
        const result = await client.query(sql, params);
        const duration = Date.now() - start;
        
        // Логируем медленные запросы (> 200ms)
        if (duration > 200) {
            console.log(`⚠️ Медленный запрос (${duration}ms): ${sql.substring(0, 100)}...`);
        }
        
        return result;
    } finally {
        client.release();
    }
}

// Получить одну строку (первую из результата)
async function get(sql, params = []) {
    const result = await query(sql, params);
    return result.rows[0];
}

// Получить все строки
async function all(sql, params = []) {
    const result = await query(sql, params);
    return result.rows;
}

// Выполнить запрос (INSERT, UPDATE, DELETE) и вернуть результат
async function run(sql, params = []) {
    const result = await query(sql, params);
    return { 
        lastID: result.rows[0]?.id, 
        changes: result.rowCount 
    };
}

// ============================================================================
// CALLBACK-ФУНКЦИИ ДЛЯ СОВМЕСТИМОСТИ СО СТАРЫМ КОДОМ
// ============================================================================

// Получить одну строку (callback стиль)
function getCallback(sql, params, callback) {
    get(sql, params)
        .then(row => callback(null, row))
        .catch(err => callback(err));
}

// Получить все строки (callback стиль)
function allCallback(sql, params, callback) {
    all(sql, params)
        .then(rows => callback(null, rows))
        .catch(err => callback(err));
}

// Выполнить запрос (callback стиль)
function runCallback(sql, params, callback) {
    run(sql, params)
        .then(result => callback(null, result))
        .catch(err => callback(err));
}

// ============================================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================================

// Выполнить транзакцию
async function transaction(callback) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

// Проверка подключения к базе данных
async function healthCheck() {
    try {
        const result = await query('SELECT NOW()');
        return { status: 'healthy', timestamp: result.rows[0].now };
    } catch (error) {
        console.error('❌ Health check failed:', error);
        return { status: 'unhealthy', error: error.message };
    }
}

// ============================================================================
// ЭКСПОРТ МЕТОДОВ
// ============================================================================

module.exports = { 
    // Основные методы (async/await)
    query,
    get,
    all,
    run,
    transaction,
    healthCheck,
    
    // Callback методы для совместимости со старым кодом
    get: getCallback,
    all: allCallback,
    run: runCallback,
    
    // Пул соединений (для продвинутых сценариев)
    pool
};