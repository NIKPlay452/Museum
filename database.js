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
    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
    }
}

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('❌ Ошибка подключения к БД:', err.message);
    } else {
        console.log('✅ Подключено к SQLite базе.');
        initTables();
    }
});

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
                console.error('❌ Ошибка создания таблицы users:', err);
            } else {
                console.log('✅ Таблица users создана/проверена');
                
                // Проверяем и добавляем колонку email, если её нет
                db.all("PRAGMA table_info(users)", (err, columns) => {
                    if (err) {
                        console.error('❌ Ошибка при проверке структуры:', err);
                        return;
                    }
                    
                    const hasEmail = columns.some(col => col.name === 'email');
                    if (!hasEmail) {
                        db.run(`ALTER TABLE users ADD COLUMN email TEXT`, (err) => {
                            if (err) {
                                console.error('❌ Ошибка при добавлении email:', err);
                            } else {
                                console.log('✅ Колонка email добавлена в таблицу users');
                            }
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
            status TEXT CHECK(status IN ('pending_creation', 'pending_edit', 'approved', 'rejected')) DEFAULT 'pending_creation',
            created_by INTEGER,
            original_id INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (created_by) REFERENCES users(id),
            FOREIGN KEY (original_id) REFERENCES exhibits(id)
        )`, (err) => {
            if (err) console.error('❌ Ошибка создания таблицы exhibits:', err);
            else console.log('✅ Таблица exhibits создана/проверена');
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
            if (err) console.error('❌ Ошибка создания таблицы applications:', err);
            else console.log('✅ Таблица applications создана/проверена');
        });

        console.log('✅ Все таблицы созданы/проверены.');
        createDefaultAdmin();
    });
}

function createDefaultAdmin() {
    db.get(`SELECT * FROM users WHERE role = 'admin'`, (err, row) => {
        if (err) {
            console.error('❌ Ошибка при проверке админа:', err);
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
                        console.log('✅ Создан пользователь admin с паролем admin123');
                    }
                }
            );
        }
    });
}

module.exports = db;