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

// ============================================================================
// ИНИЦИАЛИЗАЦИЯ ТАБЛИЦ
// ============================================================================

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
            if (err) {
                console.error('❌ Ошибка создания таблицы exhibits:', err);
            } else {
                console.log('✅ Таблица exhibits создана/проверена');
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
                console.error('❌ Ошибка создания таблицы applications:', err);
            } else {
                console.log('✅ Таблица applications создана/проверена');
            }
        });

        console.log('✅ Все таблицы созданы/проверены.');
        
        // Создаем админа по умолчанию
        createDefaultAdmin();
        
        // Добавляем базовые экспонаты, если их нет
        seedExhibitsIfNeeded();
    });
}

// ============================================================================
// СОЗДАНИЕ АДМИНА ПО УМОЛЧАНИЮ
// ============================================================================

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

// ============================================================================
// БАЗОВЫЕ ЭКСПОНАТЫ
// ============================================================================

const seedExhibits = [
    {
        title: "М-1 и МЭСМ",
        year: 1951,
        description: "Первые в континентальной Европе электронно-вычислительные машины. МЭСМ (Малая электронная счетная машина), созданная в Киеве под руководством С.А. Лебедева, и М-1, разработанная в Москве командой И.С. Брука, заложили фундамент советской компьютерной индустрии. Они были огромными, занимали целые комнаты, потребляли много энергии и работали на электронных лампах.",
        media_path: "/uploads/exhibits/МЭСМ.webp",
        background_path: null
    },
    {
        title: "Урал-1",
        year: 1959,
        description: "Легендарная машина, с которой началась история уральской школы программирования. Это была ламповая ЭВМ первого поколения, предназначенная для решения инженерных и производственных задач. Ее габариты поражают: машина занимала площадь до 80 квадратных метров, но была значительно слабее современного мобильного телефона.",
        media_path: "/uploads/exhibits/Урал-1.jpg",
        background_path: null
    },
    {
        title: "МИР-1",
        year: 1968,
        description: "«Машина для Инженерных Расчётов». Этот компьютер стал одним из первых в мире, кто был ориентирован на индивидуальную работу пользователя-непрограммиста. МИР-1 имел удобную клавиатуру и позволял вводить задачи на специальном алгоритмическом языке, что делало его предшественником современных персональных компьютеров.",
        media_path: "/uploads/exhibits/МИР-1.jpg",
        background_path: null
    },
    {
        title: "ЕС ЭВМ (Ряд-1)",
        year: 1971,
        description: "«Единая система» — это семейство компьютеров, ставших стандартом для крупных предприятий, научных институтов и министерств всего СССР. Они были программно совместимы с американскими машинами IBM System/360, что позволило использовать наработанный западный софт. Это были огромные машинные залы с лентопротяжками и шкафами.",
        media_path: "/uploads/exhibits/ЕС ЭВМ.jpg",
        background_path: null
    },
    {
        title: "КР580ИК80",
        year: 1975,
        description: "Это не компьютер целиком, а его «сердце» — микропроцессор, советский аналог знаменитого Intel 8080. Он стал основой для тысяч любительских конструкций и множества серийных компьютеров. Его появление позволило энтузиастам по всему СССР собирать свои собственные ПК.",
        media_path: "/uploads/exhibits/КР580ИК80.jpg",
        background_path: null
    },
    {
        title: "Микро-80",
        year: 1982,
        description: "Легендарный компьютер для самостоятельной сборки. Его схема была впервые опубликована в журнале «Радио», что дало старт настоящему движению. Хотя для сборки требовались серьезные навыки пайки и дефицитные детали, он открыл мир программирования для тысяч советских радиолюбителей.",
        media_path: "/uploads/exhibits/Микро-80.jpg",
        background_path: null
    },
    {
        title: "Радио-86РК",
        year: 1986,
        description: "Упрощенная и доработанная версия «Микро-80», ставшая самым массовым любительским ПК в СССР. Его схема была опубликована в журнале «Радио» и, в отличие от предшественника, была доступна для повторения тысячам радиолюбителей. На его основе многие советские заводы начали выпуск первых серийных домашних компьютеров.",
        media_path: "/uploads/exhibits/86pk.jpeg",
        background_path: null
    },
    {
        title: "Апогей БК-01",
        year: 1986,
        description: "Один из промышленных клонов «Радио-86РК», выпускавшийся Тульским заводом «БРА». Такие компьютеры, собранные на оборонных предприятиях в рамках конверсии, поставлялись в школы и институты, становясь для многих первым знакомством с вычислительной техникой.",
        media_path: "/uploads/exhibits/BK-01.jpg",
        background_path: null
    },
    {
        title: "Электроника МС 1504",
        year: 1991,
        description: "Первый и, по сути, единственный серийный советский ноутбук. Выпускался в самом конце существования СССР на минском заводе «Интеграл». Он имел монохромный дисплей, процессор, совместимый с Intel 8086, и работал под управлением MS DOS, что делало его сопоставимым с западными моделями того времени.",
        media_path: "/uploads/exhibits/Electronika.jpg",
        background_path: null
    },
    {
        title: "ПК Magic",
        year: 1995,
        description: "Один из первых российских персональных компьютеров «народной» сборки. Он олицетворяет эпоху перехода от промышленных монстров к доступным персоналкам и зарождение частного ИТ-бизнеса в России начала 90-х.",
        media_path: "/uploads/exhibits/magik.jpg",
        background_path: null
    }
];

// ============================================================================
// ДОБАВЛЕНИЕ БАЗОВЫХ ЭКСПОНАТОВ
// ============================================================================

function seedExhibitsIfNeeded() {
    // Проверяем, есть ли уже экспонаты
    db.get(`SELECT COUNT(*) as count FROM exhibits`, [], (err, row) => {
        if (err) {
            console.error('❌ Ошибка при проверке экспонатов:', err);
            return;
        }
        
        // Если экспонатов нет, добавляем базовые
        if (row.count === 0) {
            console.log('📦 Добавление базовых экспонатов...');
            
            // Получаем ID администратора (должен быть 1)
            db.get(`SELECT id FROM users WHERE role = 'admin' LIMIT 1`, [], (err, admin) => {
                if (err) {
                    console.error('❌ Ошибка при поиске администратора:', err);
                    return;
                }
                
                const adminId = admin ? admin.id : 1;
                
                seedExhibits.forEach((exhibit, index) => {
                    db.run(
                        `INSERT INTO exhibits (title, year, description, media_path, background_path, status, created_by) 
                         VALUES (?, ?, ?, ?, ?, 'approved', ?)`,
                        [exhibit.title, exhibit.year, exhibit.description, exhibit.media_path, exhibit.background_path, adminId],
                        function(err) {
                            if (err) {
                                console.error(`❌ Ошибка добавления экспоната "${exhibit.title}":`, err);
                            } else {
                                console.log(`✅ Добавлен экспонат ${index + 1}: ${exhibit.title}`);
                            }
                        }
                    );
                });
                
                console.log('✅ Все базовые экспонаты добавлены');
            });
        } else {
            console.log(`ℹ️ В базе уже есть ${row.count} экспонатов, пропускаем инициализацию`);
        }
    });
}

module.exports = db;