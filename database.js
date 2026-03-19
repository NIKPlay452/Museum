const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const isVercel = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';
const dbPath = isVercel 
    ? path.join('/tmp', 'museum.db')
    : path.join(__dirname, 'museum.db');

console.log(`📁 Используется БД: ${dbPath} (${isVercel ? 'Vercel' : 'локально'})`);

if (!isVercel) {
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
}

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('❌ Ошибка подключения к БД:', err.message);
    } else {
        console.log('✅ Подключено к SQLite базе.');
        initTables();
    }
});

// Включаем WAL режим для производительности
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA synchronous = NORMAL;');
db.exec('PRAGMA cache_size = 10000;');
db.exec('PRAGMA temp_store = MEMORY;');

function initTables() {
    db.serialize(() => {
        // Таблица пользователей
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT CHECK(role IN ('admin', 'editor')) NOT NULL,
            email TEXT,
            telegram_id TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, (err) => {
            if (err) {
                console.error('❌ Ошибка создания users:', err);
            } else {
                console.log('✅ Таблица users создана');
                
                // Добавляем индексы
                db.run('CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)');
                db.run('CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)');
                
                // Проверяем и добавляем email
                db.all("PRAGMA table_info(users)", (err, cols) => {
                    if (!err && !cols.some(c => c.name === 'email')) {
                        db.run('ALTER TABLE users ADD COLUMN email TEXT', (e) => {
                            if (!e) console.log('✅ Добавлен email');
                        });
                    }
                });
            }
        });

        // Таблица экспонатов
        db.run(`CREATE TABLE IF NOT EXISTS exhibits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            year INTEGER NOT NULL,
            description TEXT NOT NULL,
            media_path TEXT,
            background_path TEXT,
            status TEXT DEFAULT 'pending_creation' CHECK(status IN ('pending_creation', 'pending_edit', 'approved', 'rejected')),
            created_by INTEGER,
            original_id INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (created_by) REFERENCES users(id),
            FOREIGN KEY (original_id) REFERENCES exhibits(id)
        )`, (err) => {
            if (err) {
                console.error('❌ Ошибка создания exhibits:', err);
            } else {
                console.log('✅ Таблица exhibits создана');
                
                // Индексы для быстрого поиска
                db.run('CREATE INDEX IF NOT EXISTS idx_exhibits_status ON exhibits(status)');
                db.run('CREATE INDEX IF NOT EXISTS idx_exhibits_year ON exhibits(year)');
                db.run('CREATE INDEX IF NOT EXISTS idx_exhibits_created_by ON exhibits(created_by)');
                db.run('CREATE INDEX IF NOT EXISTS idx_exhibits_original ON exhibits(original_id)');
            }
        });

        // Таблица заявок
        db.run(`CREATE TABLE IF NOT EXISTS applications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            full_name TEXT,
            username TEXT,
            email TEXT,
            reason TEXT,
            telegram_chat_id TEXT,
            status TEXT DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, (err) => {
            if (err) {
                console.error('❌ Ошибка создания applications:', err);
            } else {
                console.log('✅ Таблица applications создана');
                
                db.run('CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status)');
                db.run('CREATE INDEX IF NOT EXISTS idx_applications_telegram ON applications(telegram_chat_id)');
            }
        });

        console.log('✅ Все таблицы созданы');
        createDefaultAdmin();
    });
}

function createDefaultAdmin() {
    db.get(`SELECT * FROM users WHERE role = 'admin'`, (err, row) => {
        if (err) {
            console.error('❌ Ошибка проверки админа:', err);
            return;
        }
        if (!row) {
            const bcrypt = require('bcryptjs');
            const salt = bcrypt.genSaltSync(10);
            const hash = bcrypt.hashSync('admin123', salt);
            
            db.run(`INSERT INTO users (username, password, role) VALUES (?, ?, ?)`,
                ['admin', hash, 'admin'],
                function(err) {
                    if (err) {
                        console.error('❌ Не удалось создать админа:', err);
                    } else {
                        console.log('✅ Создан admin с паролем admin123');
                    }
                }
            );
        }
    });
}

module.exports = db;