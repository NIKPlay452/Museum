const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'museum.db');
const db = new sqlite3.Database(dbPath);

console.log('🔍 Подключение к БД:', dbPath);

db.run(
    `INSERT OR IGNORE INTO applications (full_name, username, email, reason, telegram_chat_id, status) 
     VALUES (?, ?, ?, ?, ?, 'pending')`,
    [
        'Nick Test',
        'Nick',
        'Nick@yandex.ru',
        'Хочу стать редактором музея компьютерных технологий, чтобы помогать наполнять сайт информацией о советской и российской компьютерной технике.',
        '999999999999',
        'pending'
    ],
    function(err) {
        if (err) {
            console.error('❌ Ошибка:', err.message);
        } else if (this.changes > 0) {
            console.log('✅ Тестовая заявка добавлена! ID:', this.lastID);
        } else {
            console.log('ℹ️ Заявка с логином Nick уже существует');
        }
        
        // Показываем все заявки для проверки
        db.all("SELECT * FROM applications", [], (err, rows) => {
            if (err) {
                console.error('Ошибка чтения:', err);
            } else {
                console.log('\n📋 Текущие заявки в БД:');
                rows.forEach(row => {
                    console.log(`   - ID:${row.id} | ${row.full_name} | ${row.username} | ${row.status}`);
                });
            }
            db.close();
        });
    }
);