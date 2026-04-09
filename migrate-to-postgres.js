require('dotenv').config();
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

// Подключение к SQLite
const sqliteDb = new sqlite3.Database(path.join(__dirname, 'museum.db'));

// Подключение к PostgreSQL
const pgPool = new Pool({
    connectionString: process.env.POSTGRES_URL || process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function query(text, params) {
    const client = await pgPool.connect();
    try {
        const result = await client.query(text, params);
        return result;
    } finally {
        client.release();
    }
}

async function migrateUsers() {
    console.log('📦 Перенос пользователей...');
    
    return new Promise((resolve, reject) => {
        sqliteDb.all(`SELECT id, username, password, role, email, telegram_id, created_at FROM users`, async (err, rows) => {
            if (err) return reject(err);
            
            for (const row of rows) {
                try {
                    await query(
                        `INSERT INTO users (id, username, password, role, email, telegram_id, created_at) 
                         VALUES ($1, $2, $3, $4, $5, $6, $7)
                         ON CONFLICT (username) DO NOTHING`,
                        [row.id, row.username, row.password, row.role, row.email, row.telegram_id, row.created_at]
                    );
                    console.log(`   ✅ Пользователь: ${row.username}`);
                } catch (e) {
                    console.log(`   ⚠️ Пропущен: ${row.username} (уже существует)`);
                }
            }
            resolve();
        });
    });
}

async function migrateExhibits() {
    console.log('📦 Перенос экспонатов...');
    
    return new Promise((resolve, reject) => {
        sqliteDb.all(`SELECT * FROM exhibits`, async (err, rows) => {
            if (err) return reject(err);
            
            for (const row of rows) {
                await query(
                    `INSERT INTO exhibits (id, title, year, description, media_path, background_path, status, created_by, original_id, created_at) 
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                     ON CONFLICT (id) DO NOTHING`,
                    [row.id, row.title, row.year, row.description, row.media_path, row.background_path, 
                     row.status, row.created_by, row.original_id, row.created_at]
                );
                console.log(`   ✅ Экспонат: ${row.title} (${row.year})`);
            }
            resolve();
        });
    });
}

async function migrateApplications() {
    console.log('📦 Перенос заявок...');
    
    return new Promise((resolve, reject) => {
        sqliteDb.all(`SELECT * FROM applications`, async (err, rows) => {
            if (err) return reject(err);
            
            for (const row of rows) {
                await query(
                    `INSERT INTO applications (id, full_name, username, email, reason, telegram_chat_id, status, created_at) 
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                     ON CONFLICT (id) DO NOTHING`,
                    [row.id, row.full_name, row.username, row.email, row.reason, row.telegram_chat_id, row.status, row.created_at]
                );
                console.log(`   ✅ Заявка от: ${row.full_name}`);
            }
            resolve();
        });
    });
}

async function migrateSiteSettings() {
    console.log('📦 Перенос настроек стилей...');
    
    return new Promise((resolve, reject) => {
        sqliteDb.all(`SELECT * FROM site_settings`, async (err, rows) => {
            if (err) {
                console.log('   ⚠️ Таблица site_settings не найдена в SQLite');
                return resolve();
            }
            
            for (const row of rows) {
                await query(
                    `INSERT INTO site_settings (id, setting_key, setting_value, updated_at, updated_by) 
                     VALUES ($1, $2, $3, $4, $5)
                     ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value`,
                    [row.id, row.setting_key, row.setting_value, row.updated_at, row.updated_by]
                );
                console.log(`   ✅ Настройка: ${row.setting_key}`);
            }
            resolve();
        });
    });
}

async function resetSequences() {
    console.log('📦 Сброс последовательностей...');
    
    await query(`SELECT setval('users_id_seq', COALESCE((SELECT MAX(id) FROM users), 1))`);
    await query(`SELECT setval('exhibits_id_seq', COALESCE((SELECT MAX(id) FROM exhibits), 1))`);
    await query(`SELECT setval('applications_id_seq', COALESCE((SELECT MAX(id) FROM applications), 1))`);
    await query(`SELECT setval('site_settings_id_seq', COALESCE((SELECT MAX(id) FROM site_settings), 1))`);
    
    console.log('   ✅ Последовательности сброшены');
}

async function main() {
    console.log('🔄 НАЧАЛО МИГРАЦИИ ДАННЫХ\n');
    
    try {
        await migrateUsers();
        await migrateExhibits();
        await migrateApplications();
        await migrateSiteSettings();
        await resetSequences();
        
        console.log('\n✅ МИГРАЦИЯ ЗАВЕРШЕНА УСПЕШНО!');
        
        // Показываем статистику
        const usersCount = await query(`SELECT COUNT(*) FROM users`);
        const exhibitsCount = await query(`SELECT COUNT(*) FROM exhibits`);
        const appsCount = await query(`SELECT COUNT(*) FROM applications`);
        
        console.log('\n📊 Статистика после миграции:');
        console.log(`   👥 Пользователей: ${usersCount.rows[0].count}`);
        console.log(`   🖼️ Экспонатов: ${exhibitsCount.rows[0].count}`);
        console.log(`   📨 Заявок: ${appsCount.rows[0].count}`);
        
    } catch (error) {
        console.error('\n❌ ОШИБКА МИГРАЦИИ:', error);
    } finally {
        sqliteDb.close();
        await pgPool.end();
    }
}

main();