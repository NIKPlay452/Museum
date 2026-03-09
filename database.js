const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'museum.db');

// Открываем соединение с БД
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Ошибка подключения к БД:', err.message);
    } else {
        console.log('Подключено к SQLite базе.');
        initTables();
    }
});

// Инициализация таблиц
function initTables() {
    db.serialize(() => {
        // Таблица пользователей (админы и редакторы)
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT CHECK(role IN ('admin', 'editor')) NOT NULL,
            telegram_id TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Таблица экспонатов
        db.run(`CREATE TABLE IF NOT EXISTS exhibits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            year INTEGER NOT NULL,
            description TEXT NOT NULL,
            media_path TEXT, -- путь к файлу (картинка/видео/3D)
            background_path TEXT, -- путь к файлу фона
            status TEXT CHECK(status IN ('pending_creation', 'pending_edit', 'approved', 'rejected')) DEFAULT 'pending_creation',
            created_by INTEGER,
            original_id INTEGER, -- для отслеживания редактируемых экспонатов (если это правка)
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (created_by) REFERENCES users(id),
            FOREIGN KEY (original_id) REFERENCES exhibits(id)
        )`);

        // Таблица заявок из Telegram
        db.run(`CREATE TABLE IF NOT EXISTS applications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            full_name TEXT,
            username TEXT,
            email TEXT,
            reason TEXT,
            telegram_chat_id TEXT,
            status TEXT DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        console.log('Таблицы созданы/проверены.');
        
        // Создаем тестового админа, если нет ни одного пользователя
        createDefaultAdmin();
    });
}

// Функция для создания админа по умолчанию
function createDefaultAdmin() {
    db.get(`SELECT * FROM users WHERE role = 'admin'`, (err, row) => {
        if (err) {
            console.error(err);
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
                        console.error('Не удалось создать админа:', err);
                    } else {
                        console.log('Создан пользователь admin с паролем admin123 (хэширован)');
                    }
                }
            );
        }
    });
}

module.exports = db;