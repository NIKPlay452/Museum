const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'museum.db');
const db = new sqlite3.Database(dbPath);

console.log('🔄 Запуск миграции для добавления таблицы site_settings...');

db.serialize(() => {
    // Проверяем, существует ли таблица
    db.get(`SELECT name FROM sqlite_master WHERE type='table' AND name='site_settings'`, (err, row) => {
        if (err) {
            console.error('❌ Ошибка проверки таблицы:', err);
            return;
        }
        
        if (!row) {
            console.log('📝 Создание таблицы site_settings...');
            
            db.run(`CREATE TABLE site_settings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                setting_key TEXT UNIQUE NOT NULL,
                setting_value TEXT,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_by INTEGER
            )`, (err) => {
                if (err) {
                    console.error('❌ Ошибка создания таблицы:', err);
                } else {
                    console.log('✅ Таблица site_settings создана');
                    
                    // Добавляем настройки по умолчанию
                    const defaultStyles = {
                        'color_primary': '#c9a03d',
                        'color_primary_light': '#e0b354',
                        'color_primary_dark': '#b8860b',
                        'color_bg_dark': '#0a0c10',
                        'color_text_primary': '#ffffff',
                        'color_text_secondary': '#a0aab8',
                        'font_primary': "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                        'border_radius': '12px',
                        'transition_speed': '0.25s'
                    };
                    
                    for (const [key, value] of Object.entries(defaultStyles)) {
                        db.run(`INSERT INTO site_settings (setting_key, setting_value) VALUES (?, ?)`, [key, value], (err) => {
                            if (err) {
                                console.error(`❌ Ошибка добавления ${key}:`, err);
                            } else {
                                console.log(`✅ Добавлена настройка ${key} = ${value}`);
                            }
                        });
                    }
                }
            });
        } else {
            console.log('ℹ️ Таблица site_settings уже существует');
        }
    });
});

setTimeout(() => {
    db.close(() => {
        console.log('✅ Миграция завершена');
    });
}, 2000);