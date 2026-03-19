const TelegramBot = require('node-telegram-bot-api');
const db = require('./database');

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
    console.error('❌ TELEGRAM_BOT_TOKEN не задан! Бот не запустится.');
} else {
    // Инициализация бота с токеном
    bot = new TelegramBot(token, { polling: true });
}
const ADMIN_CHAT_ID = 5231666805;
const SITE_URL = process.env.SITE_URL || 'https://museum-six-umber.vercel.app';

let bot = null;
const userStates = {};

function initBot() {
    try {
        console.log('🤖 Запуск Telegram бота...');
        
        bot = new TelegramBot(token, { polling: true });
        
        console.log('✅ Telegram бот запущен');
        
        // Команда /start
        bot.onText(/\/start/, (msg) => {
            const chatId = msg.chat.id;
            const userName = msg.from.first_name || 'Пользователь';
            
            userStates[chatId] = { step: 'name' };
            
            bot.sendMessage(
                chatId, 
                `👋 Привет, ${userName}!\n\nДобро пожаловать в Музей компьютерных технологий!\n\n📝 Введите ваше ФИО:`,
                {
                    reply_markup: {
                        keyboard: [['❌ Отменить']],
                        resize_keyboard: true
                    }
                }
            );
        });
        
        // Команда /status
        bot.onText(/\/status/, async (msg) => {
            const chatId = msg.chat.id;
            
            db.get(
                `SELECT * FROM applications WHERE telegram_chat_id = ? ORDER BY created_at DESC LIMIT 1`,
                [chatId],
                (err, app) => {
                    if (err || !app) {
                        bot.sendMessage(chatId, '❌ У вас нет активных заявок.\nОтправьте /start');
                        return;
                    }
                    
                    const statusMap = {
                        'pending': '⏳ В обработке',
                        'approved': '✅ Одобрена',
                        'rejected': '❌ Отклонена'
                    };
                    
                    let message = `${statusMap[app.status]}\n\n`;
                    message += `📅 Дата: ${new Date(app.created_at).toLocaleString()}\n`;
                    message += `👤 ФИО: ${app.full_name}\n`;
                    message += `🔑 Логин: ${app.username}\n`;
                    
                    if (app.status === 'approved') {
                        db.get(
                            `SELECT * FROM users WHERE username = ?`,
                            [app.username],
                            (err, user) => {
                                if (user) {
                                    message += `\n✅ Доступ:\n`;
                                    message += `Логин: ${user.username}\n`;
                                    message += `Пароль: (см. предыдущее сообщение)\n`;
                                    message += `🌐 ${SITE_URL}/views/login.html`;
                                }
                                bot.sendMessage(chatId, message);
                            }
                        );
                    } else {
                        bot.sendMessage(chatId, message);
                    }
                }
            );
        });
        
        // Команда /cancel
        bot.onText(/\/cancel/, (msg) => {
            const chatId = msg.chat.id;
            delete userStates[chatId];
            bot.sendMessage(chatId, '❌ Отменено', { reply_markup: { remove_keyboard: true } });
        });
        
        // Обработка сообщений
        bot.on('message', async (msg) => {
            const chatId = msg.chat.id;
            const text = msg.text;
            
            if (!text || text.startsWith('/')) return;
            
            const state = userStates[chatId];
            if (!state) {
                bot.sendMessage(chatId, 'Отправьте /start');
                return;
            }
            
            if (text === '❌ Отменить') {
                delete userStates[chatId];
                bot.sendMessage(chatId, '❌ Отменено', { reply_markup: { remove_keyboard: true } });
                return;
            }
            
            try {
                switch (state.step) {
                    case 'name':
                        if (text.length < 3) {
                            bot.sendMessage(chatId, '❌ Слишком короткое имя');
                            return;
                        }
                        userStates[chatId] = { ...state, step: 'username', fullName: text };
                        bot.sendMessage(chatId, '✅ Введите логин (латиница):');
                        break;
                        
                    case 'username':
                        if (!/^[a-z0-9_]{3,20}$/i.test(text)) {
                            bot.sendMessage(chatId, '❌ Только латиница, цифры и _ (3-20 символов)');
                            return;
                        }
                        
                        const existing = await new Promise(r => 
                            db.get('SELECT username FROM users WHERE username = ?', [text], (e, row) => r(row))
                        );
                        
                        if (existing) {
                            bot.sendMessage(chatId, '❌ Логин занят');
                            return;
                        }
                        
                        userStates[chatId] = { ...state, step: 'email', username: text };
                        bot.sendMessage(chatId, '✅ Введите email:');
                        break;
                        
                    case 'email':
                        if (!text.includes('@') || !text.includes('.')) {
                            bot.sendMessage(chatId, '❌ Некорректный email');
                            return;
                        }
                        
                        userStates[chatId] = { ...state, step: 'reason', email: text };
                        bot.sendMessage(chatId, '✅ Почему хотите стать редактором?');
                        break;
                        
                    case 'reason':
                        const { fullName, username, email } = state;
                        
                        db.run(
                            `INSERT INTO applications (full_name, username, email, reason, telegram_chat_id, status) 
                             VALUES (?, ?, ?, ?, ?, 'pending')`,
                            [fullName, username, email, text, chatId],
                            function(err) {
                                if (err) {
                                    bot.sendMessage(chatId, '❌ Ошибка');
                                } else {
                                    bot.sendMessage(
                                        chatId,
                                        `✅ Заявка отправлена!\nСтатус можно проверить командой /status`,
                                        { reply_markup: { remove_keyboard: true } }
                                    );
                                    
                                    if (ADMIN_CHAT_ID) {
                                        bot.sendMessage(
                                            ADMIN_CHAT_ID,
                                            `🔔 Новая заявка!\n\n👤 ${fullName}\n🔑 ${username}\n📧 ${email}\n💬 ${text}\n🆔 ${chatId}`
                                        );
                                    }
                                }
                            }
                        );
                        
                        delete userStates[chatId];
                        break;
                }
            } catch (e) {
                bot.sendMessage(chatId, '❌ Ошибка');
            }
        });
        
    } catch (error) {
        console.error('❌ Ошибка бота:', error.message);
    }
}

async function sendCredentialsToUser(chatId, username, password) {
    if (!bot) return false;
    
    try {
        await bot.sendMessage(
            chatId, 
            `✅ **ЗАЯВКА ОДОБРЕНА!**\n\n` +
            `🔑 Логин: \`${username}\`\n` +
            `🔑 Пароль: \`${password}\`\n\n` +
            `🌐 ${SITE_URL}/views/login.html`,
            { parse_mode: 'Markdown' }
        );
        return true;
    } catch (e) {
        return false;
    }
}

initBot();

module.exports = { sendCredentialsToUser };