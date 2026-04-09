require('dotenv').config();
const { query } = require('./database');

async function addTestData() {
    console.log('📝 Добавление тестовых данных...');
    
    try {
        // Проверяем и добавляем тестовую заявку
        const existingApp = await query(`SELECT * FROM applications WHERE username = 'Nick'`);
        
        if (existingApp.rows.length === 0) {
            await query(`
                INSERT INTO applications (full_name, username, email, reason, telegram_chat_id, status) 
                VALUES ($1, $2, $3, $4, $5, 'pending')
            `, [
                'Nick Test',
                'Nick',
                'Nick@yandex.ru',
                'Хочу стать редактором музея компьютерных технологий, чтобы помогать наполнять сайт информацией о советской и российской компьютерной технике. Интересуюсь историей вычислительной техники, имею опыт работы с архивами и технической документацией.',
                '999999999999'
            ]);
            console.log('✅ Тестовая заявка добавлена');
        } else {
            console.log('ℹ️ Заявка уже существует');
        }
        
        // Проверяем и добавляем тестового редактора (если нужно)
        const existingEditor = await query(`SELECT * FROM users WHERE username = 'test_editor'`);
        
        if (existingEditor.rows.length === 0) {
            const bcrypt = require('bcryptjs');
            const salt = bcrypt.genSaltSync(10);
            const hash = bcrypt.hashSync('test123', salt);
            
            await query(`
                INSERT INTO users (username, password, email, role) 
                VALUES ($1, $2, $3, 'editor')
            `, ['test_editor', hash, 'test@example.com']);
            console.log('✅ Тестовый редактор добавлен (логин: test_editor, пароль: test123)');
        } else {
            console.log('ℹ️ Тестовый редактор уже существует');
        }
        
        // Показываем статистику
        const usersCount = await query(`SELECT COUNT(*) FROM users`);
        const appsCount = await query(`SELECT COUNT(*) FROM applications`);
        const exhibitsCount = await query(`SELECT COUNT(*) FROM exhibits`);
        
        console.log('\n📊 Текущая статистика:');
        console.log(`   👥 Пользователей: ${usersCount.rows[0].count}`);
        console.log(`   🖼️ Экспонатов: ${exhibitsCount.rows[0].count}`);
        console.log(`   📨 Заявок: ${appsCount.rows[0].count}`);
        
    } catch (error) {
        console.error('❌ Ошибка:', error);
    }
}

addTestData();