require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;

if (!connectionString) {
    console.error('❌ POSTGRES_URL не задан!');
    console.log('Создайте файл .env.local с переменной POSTGRES_URL');
    process.exit(1);
}

const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
});

async function query(sql, params = []) {
    const client = await pool.connect();
    try {
        return await client.query(sql, params);
    } finally {
        client.release();
    }
}

async function initDatabase() {
    console.log('🔄 Инициализация PostgreSQL базы данных...\n');
    
    // Создаём таблицы
    console.log('📦 Создание таблиц...');
    
    await query(`
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT CHECK(role IN ('admin', 'editor')) NOT NULL,
            email TEXT,
            telegram_id TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);
    console.log('   ✅ Таблица users');
    
    await query(`
        CREATE TABLE IF NOT EXISTS exhibits (
            id SERIAL PRIMARY KEY,
            title TEXT NOT NULL,
            year INTEGER NOT NULL,
            description TEXT NOT NULL,
            media_path TEXT,
            background_path TEXT,
            status TEXT CHECK(status IN ('pending_creation', 'pending_edit', 'approved', 'rejected')) DEFAULT 'pending_creation',
            created_by INTEGER REFERENCES users(id),
            original_id INTEGER REFERENCES exhibits(id),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);
    console.log('   ✅ Таблица exhibits');
    
    await query(`
        CREATE TABLE IF NOT EXISTS applications (
            id SERIAL PRIMARY KEY,
            full_name TEXT,
            username TEXT,
            email TEXT,
            reason TEXT,
            telegram_chat_id TEXT,
            status TEXT DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);
    console.log('   ✅ Таблица applications');
    
    await query(`
        CREATE TABLE IF NOT EXISTS site_settings (
            id SERIAL PRIMARY KEY,
            setting_key TEXT UNIQUE NOT NULL,
            setting_value TEXT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_by INTEGER REFERENCES users(id)
        )
    `);
    console.log('   ✅ Таблица site_settings');
    
    // Создаём индексы
    console.log('\n📦 Создание индексов...');
    await query(`CREATE INDEX IF NOT EXISTS idx_exhibits_status ON exhibits(status)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_exhibits_year ON exhibits(year)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_site_settings_key ON site_settings(setting_key)`);
    console.log('   ✅ Индексы созданы');
    
    // Создаём администратора
    console.log('\n📦 Создание администратора...');
    const adminCheck = await query(`SELECT * FROM users WHERE username = 'admin'`);
    
    if (adminCheck.rows.length === 0) {
        const salt = bcrypt.genSaltSync(10);
        const hash = bcrypt.hashSync('admin123', salt);
        await query(
            `INSERT INTO users (username, password, role) VALUES ($1, $2, $3)`,
            ['admin', hash, 'admin']
        );
        console.log('   ✅ Администратор создан (логин: admin, пароль: admin123)');
    } else {
        console.log('   ✅ Администратор уже существует');
    }
    
    // Получаем ID администратора
    const adminResult = await query(`SELECT id FROM users WHERE role = 'admin' LIMIT 1`);
    const adminId = adminResult.rows[0].id;
    
    // Создаём базовые экспонаты
    console.log('\n📦 Создание базовых экспонатов...');
    const exhibitsCheck = await query(`SELECT COUNT(*) FROM exhibits`);
    
    if (parseInt(exhibitsCheck.rows[0].count) === 0) {
        const seedExhibits = [
            { title: "М-1 и МЭСМ", year: 1951, description: "Первые в континентальной Европе электронно-вычислительные машины. МЭСМ (Малая электронная счетная машина), созданная в Киеве под руководством С.А. Лебедева, и М-1, разработанная в Москве командой И.С. Брука, заложили фундамент советской компьютерной индустрии. Они были огромными, занимали целые комнаты, потребляли много энергии и работали на электронных лампах.", media_path: "https://ik.imagekit.io/ef9ojrowy/museum/exhibits/%D0%9C%D0%AD%D0%A1%D0%9C.webp" },
            { title: "Урал-1", year: 1959, description: "Легендарная машина, с которой началась история уральской школы программирования. Это была ламповая ЭВМ первого поколения, предназначенная для решения инженерных и производственных задач. Ее габариты поражают: машина занимала площадь до 80 квадратных метров, но была значительно слабее современного мобильного телефона.", media_path: "https://ik.imagekit.io/ef9ojrowy/museum/exhibits/%D0%A3%D1%80%D0%B0%D0%BB-1.jpg" },
            { title: "МИР-1", year: 1968, description: "«Машина для Инженерных Расчётов». Этот компьютер стал одним из первых в мире, кто был ориентирован на индивидуальную работу пользователя-непрограммиста. МИР-1 имел удобную клавиатуру и позволял вводить задачи на специальном алгоритмическом языке, что делало его предшественником современных персональных компьютеров.", media_path: "https://ik.imagekit.io/ef9ojrowy/museum/exhibits/%D0%9C%D0%98%D0%A0-1.jpg" },
            { title: "ЕС ЭВМ (Ряд-1)", year: 1971, description: "«Единая система» — это семейство компьютеров, ставших стандартом для крупных предприятий, научных институтов и министерств всего СССР. Они были программно совместимы с американскими машинами IBM System/360, что позволило использовать наработанный западный софт. Это были огромные машинные залы с лентопротяжками и шкафами.", media_path: "https://ik.imagekit.io/ef9ojrowy/museum/exhibits/%D0%95%D0%A1%20%D0%AD%D0%92%D0%9C.jpg" },
            { title: "КР580ИК80", year: 1975, description: "Это не компьютер целиком, а его «сердце» — микропроцессор, советский аналог знаменитого Intel 8080. Он стал основой для тысяч любительских конструкций и множества серийных компьютеров. Его появление позволило энтузиастам по всему СССР собирать свои собственные ПК.", media_path: "https://ik.imagekit.io/ef9ojrowy/museum/exhibits/%D0%9A%D0%A0580%D0%98%D0%9A80.jpg" },
            { title: "Микро-80", year: 1982, description: "Легендарный компьютер для самостоятельной сборки. Его схема была впервые опубликована в журнале «Радио», что дало старт настоящему движению. Хотя для сборки требовались серьезные навыки пайки и дефицитные детали, он открыл мир программирования для тысяч советских радиолюбителей.", media_path: "https://ik.imagekit.io/ef9ojrowy/museum/exhibits/%D0%9C%D0%B8%D0%BA%D1%80%D0%BE-80.jpg" },
            { title: "Радио-86РК", year: 1986, description: "Упрощенная и доработанная версия «Микро-80», ставшая самым массовым любительским ПК в СССР. Его схема была опубликована в журнале «Радио» и, в отличие от предшественника, была доступна для повторения тысячам радиолюбителей. На его основе многие советские заводы начали выпуск первых серийных домашних компьютеров.", media_path: "https://ik.imagekit.io/ef9ojrowy/museum/exhibits/86pk.jpeg" },
            { title: "Апогей БК-01", year: 1986, description: "Один из промышленных клонов «Радио-86РК», выпускавшийся Тульским заводом «БРА». Такие компьютеры, собранные на оборонных предприятиях в рамках конверсии, поставлялись в школы и институты, становясь для многих первым знакомством с вычислительной техникой.", media_path: "https://ik.imagekit.io/ef9ojrowy/museum/exhibits/BK-01.jpg" },
            { title: "Электроника МС 1504", year: 1991, description: "Первый и, по сути, единственный серийный советский ноутбук. Выпускался в самом конце существования СССР на минском заводе «Интеграл». Он имел монохромный дисплей, процессор, совместимый с Intel 8086, и работал под управлением MS DOS, что делало его сопоставимым с западными моделями того времени.", media_path: "https://ik.imagekit.io/ef9ojrowy/museum/exhibits/Electronika.jpg" },
            { title: "ПК Magic", year: 1995, description: "Один из первых российских персональных компьютеров «народной» сборки. Он олицетворяет эпоху перехода от промышленных монстров к доступным персоналкам и зарождение частного ИТ-бизнеса в России начала 90-х.", media_path: "https://ik.imagekit.io/ef9ojrowy/museum/exhibits/magik.jpg" }
        ];
        
        for (const exhibit of seedExhibits) {
            await query(
                `INSERT INTO exhibits (title, year, description, media_path, background_path, status, created_by) 
                 VALUES ($1, $2, $3, $4, $5, 'approved', $6)`,
                [exhibit.title, exhibit.year, exhibit.description, exhibit.media_path, null, adminId]
            );
            console.log(`   ✅ Добавлен: ${exhibit.title}`);
        }
        console.log('   ✅ Все базовые экспонаты добавлены');
    } else {
        console.log(`   ✅ Экспонаты уже есть (${exhibitsCheck.rows[0].count} шт.)`);
    }
    
    // Создаём настройки стилей по умолчанию
    console.log('\n📦 Создание настроек стилей...');
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
        const existing = await query(`SELECT * FROM site_settings WHERE setting_key = $1`, [key]);
        if (existing.rows.length === 0) {
            await query(`INSERT INTO site_settings (setting_key, setting_value) VALUES ($1, $2)`, [key, value]);
        }
    }
    console.log('   ✅ Настройки стилей созданы');
    
    // Показываем итоговую статистику
    console.log('\n📊 ИТОГОВАЯ СТАТИСТИКА:');
    const usersCount = await query(`SELECT COUNT(*) FROM users`);
    const exhibitsCount = await query(`SELECT COUNT(*) FROM exhibits`);
    const appsCount = await query(`SELECT COUNT(*) FROM applications`);
    const settingsCount = await query(`SELECT COUNT(*) FROM site_settings`);
    
    console.log(`   👥 Пользователей: ${usersCount.rows[0].count}`);
    console.log(`   🖼️ Экспонатов: ${exhibitsCount.rows[0].count}`);
    console.log(`   📨 Заявок: ${appsCount.rows[0].count}`);
    console.log(`   ⚙️ Настроек: ${settingsCount.rows[0].count}`);
    
    console.log('\n✅ БАЗА ДАННЫХ ГОТОВА К РАБОТЕ!');
    console.log('\n🔐 Данные для входа:');
    console.log('   Логин: admin');
    console.log('   Пароль: admin123');
}

initDatabase()
    .then(() => process.exit(0))
    .catch(err => {
        console.error('❌ Ошибка:', err);
        process.exit(1);
    });