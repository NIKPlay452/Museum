const TelegramBot = require('node-telegram-bot-api');
const db = require('../database');

const token = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_CHAT_ID = 5231666805;
const SITE_URL = process.env.SITE_URL || 'https://museum-six-umber.vercel.app';

if (!token) {
    console.error('❌ TELEGRAM_BOT_TOKEN не задан!');
}

// Создаем экземпляр бота
const bot = new TelegramBot(token);
const userStates = new Map();

// Функция обработки сообщений
async function handleMessage(msg) {
    const chatId = msg.chat.id;
    const text = msg.text;
    const userName = msg.from.first_name || 'Пользователь';
    
    console.log(`📨 Получено сообщение от ${chatId}: ${text}`);
    
    // Обработка команд
    if (text === '/start') {
        userStates.set(chatId, { step: 'name' });
        
        await bot.sendMessage(
            chatId,
            `👋 Привет, ${userName}!\n\nДобро пожаловать в Музей компьютерных технологий!\n\n📝 Введите ваше ФИО:`,
            {
                reply_markup: {
                    keyboard: [['❌ Отменить']],
                    resize_keyboard: true,
                    one_time_keyboard: true
                }
            }
        );
        return;
    }
    
    if (text === '/status') {
        db.get(
            `SELECT * FROM applications WHERE telegram_chat_id = ? ORDER BY created_at DESC LIMIT 1`,
            [chatId],
            async (err, app) => {
                if (err || !app) {
                    await bot.sendMessage(chatId, '❌ У вас нет активных заявок.\nОтправьте /start');
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
                        async (err, user) => {
                            if (user) {
                                message += `\n✅ Доступ:\n`;
                                message += `Логин: ${user.username}\n`;
                                message += `Пароль: (см. предыдущее сообщение)\n`;
                                message += `🌐 ${SITE_URL}/views/login.html`;
                            }
                            await bot.sendMessage(chatId, message);
                        }
                    );
                } else {
                    await bot.sendMessage(chatId, message);
                }
            }
        );
        return;
    }
    
    if (text === '/cancel') {
        userStates.delete(chatId);
        await bot.sendMessage(chatId, '❌ Отменено', { reply_markup: { remove_keyboard: true } });
        return;
    }
    
    // Обработка шагов регистрации
    const state = userStates.get(chatId);
    if (!state) {
        await bot.sendMessage(chatId, 'Отправьте /start');
        return;
    }
    
    if (text === '❌ Отменить') {
        userStates.delete(chatId);
        await bot.sendMessage(chatId, '❌ Отменено', { reply_markup: { remove_keyboard: true } });
        return;
    }
    
    try {
        switch (state.step) {
            case 'name':
                if (text.length < 3) {
                    await bot.sendMessage(chatId, '❌ Слишком короткое имя');
                    return;
                }
                userStates.set(chatId, { ...state, step: 'username', fullName: text });
                await bot.sendMessage(chatId, '✅ Введите логин (латиница):');
                break;
                
            case 'username':
                if (!/^[a-z0-9_]{3,20}$/i.test(text)) {
                    await bot.sendMessage(chatId, '❌ Только латиница, цифры и _ (3-20 символов)');
                    return;
                }
                
                const existing = await new Promise(r => 
                    db.get('SELECT username FROM users WHERE username = ?', [text], (e, row) => r(row))
                );
                
                if (existing) {
                    await bot.sendMessage(chatId, '❌ Логин занят');
                    return;
                }
                
                userStates.set(chatId, { ...state, step: 'email', username: text });
                await bot.sendMessage(chatId, '✅ Введите email:');
                break;
                
            case 'email':
                if (!text.includes('@') || !text.includes('.')) {
                    await bot.sendMessage(chatId, '❌ Некорректный email');
                    return;
                }
                
                userStates.set(chatId, { ...state, step: 'reason', email: text });
                await bot.sendMessage(chatId, '✅ Почему хотите стать редактором?');
                break;
                
            case 'reason':
                const { fullName, username, email } = state;
                
                db.run(
                    `INSERT INTO applications (full_name, username, email, reason, telegram_chat_id, status) 
                     VALUES (?, ?, ?, ?, ?, 'pending')`,
                    [fullName, username, email, text, chatId],
                    async function(err) {
                        if (err) {
                            await bot.sendMessage(chatId, '❌ Ошибка');
                        } else {
                            await bot.sendMessage(
                                chatId,
                                `✅ Заявка отправлена!\nСтатус можно проверить командой /status`,
                                { reply_markup: { remove_keyboard: true } }
                            );
                            
                            if (ADMIN_CHAT_ID) {
                                await bot.sendMessage(
                                    ADMIN_CHAT_ID,
                                    `🔔 Новая заявка!\n\n👤 ${fullName}\n🔑 ${username}\n📧 ${email}\n💬 ${text}\n🆔 ${chatId}`
                                );
                            }
                        }
                    }
                );
                
                userStates.delete(chatId);
                break;
        }
    } catch (e) {
        console.error('Ошибка:', e);
        await bot.sendMessage(chatId, '❌ Ошибка');
    }
}

module.exports = async (req, res) => {
    if (req.method === 'POST') {
        try {
            const update = req.body;
            if (update.message) {
                await handleMessage(update.message);
            }
            res.status(200).send('OK');
        } catch (error) {
            console.error('Webhook error:', error);
            res.status(500).send('Error');
        }
    } else {
        res.status(405).send('Method not allowed');
    }
};

// Функция для отправки учетных данных
async function sendCredentialsToUser(chatId, username, password) {
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
        console.error('Ошибка отправки:', e);
        return false;
    }
}

module.exports.sendCredentialsToUser = sendCredentialsToUser;