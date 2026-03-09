const sqlite3 = require('sqlite3');
const path = require('path');

const db = new sqlite3.Database(path.join(__dirname, 'museum.db'));

const testApplication = {
    full_name: 'Тестовый Пользователь',
    username: 'test_editor',
    email: 'test@example.com',
    reason: 'Хочу помогать с экспонатами',
    telegram_chat_id: '123456789',
    status: 'pending'
};

db.run(
    `INSERT INTO applications (full_name, username, email, reason, telegram_chat_id, status) 
     VALUES (?, ?, ?, ?, ?, ?)`,
    [testApplication.full_name, testApplication.username, testApplication.email, 
     testApplication.reason, testApplication.telegram_chat_id, testApplication.status],
    function(err) {
        if (err) {
            console.error('Ошибка создания тестовой заявки:', err);
        } else {
            console.log('✅ Тестовая заявка создана с ID:', this.lastID);
        }
        db.close();
    }
);