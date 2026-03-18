const TelegramBot = require('node-telegram-bot-api');
const db = require('./database');

const token = '8612678836:AAHoTSlgUPldFzsWqkpfWp0YlWytk2gp9Qk';
const ADMIN_CHAT_ID = 5231666805;
let bot = null;
const userStates = {};

function initBot() {
    try {
        console.log('🤖 Запуск Telegram бота...');
        
        bot = new TelegramBot(token, { 
            polling: true,
            polling: {
                params: {
                    timeout: 10
                }
            }
        });
        
        console.log('✅ Telegram бот успешно запущен!');
        
        bot.on('polling_error', (error) => {
            console.error('❌ Ошибка polling бота:', error.message);
        });
        
        bot.on('error', (error) => {
            console.error('❌ Ошибка бота:', error.message);
        });
        
        bot.onText(/\/start/, (msg) => {
            const chatId = msg.chat.id;
            const userName = msg.from.first_name || 'Пользователь';
            
            console.log(`📩 Пользователь ${userName} (${chatId}) запустил бота`);
            
            userStates[chatId] = { step: 'name' };
            
            bot.sendMessage(
                chatId, 
                `👋 Привет, ${userName}!\n\n` +
                `Добро пожаловать в бот Музея компьютерных технологий!\n\n` +
                `📝 **Пожалуйста, введите ваше ФИО:**\n` +
                `(Например: Иванов Иван Иванович)`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        keyboard: [
                            ['❌ Отменить регистрацию']
                        ],
                        resize_keyboard: true,
                        one_time_keyboard: false
                    }
                }
            );
        });
        
        bot.onText(/\/status/, async (msg) => {
            const chatId = msg.chat.id;
            
            try {
                db.get(
                    `SELECT * FROM applications WHERE telegram_chat_id = ? ORDER BY created_at DESC LIMIT 1`,
                    [chatId],
                    (err, application) => {
                        if (err) {
                            console.error('Ошибка при поиске заявки:', err);
                            bot.sendMessage(chatId, '❌ Произошла ошибка. Пожалуйста, попробуйте позже.');
                            return;
                        }
                        
                        if (!application) {
                            bot.sendMessage(
                                chatId,
                                '❌ У вас нет активных заявок.\n\n' +
                                'Отправьте /start, чтобы подать заявку на статус редактора.',
                                {
                                    reply_markup: {
                                        remove_keyboard: true
                                    }
                                }
                            );
                            return;
                        }
                        
                        let statusText = '';
                        let statusEmoji = '';
                        
                        switch(application.status) {
                            case 'pending':
                                statusEmoji = '⏳';
                                statusText = 'в обработке';
                                break;
                            case 'approved':
                                statusEmoji = '✅';
                                statusText = 'одобрена';
                                break;
                            case 'rejected':
                                statusEmoji = '❌';
                                statusText = 'отклонена';
                                break;
                        }
                        
                        const date = new Date(application.created_at).toLocaleString('ru-RU');
                        
                        let message = `${statusEmoji} **Статус вашей заявки:** ${statusText}\n\n`;
                        message += `📅 Дата подачи: ${date}\n`;
                        message += `👤 ФИО: ${application.full_name}\n`;
                        message += `🔑 Логин: ${application.username}\n`;
                        message += `📧 Email: ${application.email || 'Не указан'}\n\n`;
                        
                        if (application.status === 'approved') {
                            db.get(
                                `SELECT * FROM users WHERE username = ?`,
                                [application.username],
                                (err, user) => {
                                    if (err || !user) {
                                        message += '❌ Учетные данные не найдены. Обратитесь к администратору.';
                                    } else {
                                        message += `✅ **Ваша заявка одобрена!**\n\n`;
                                        message += `🔑 **Данные для входа:**\n`;
                                        message += `Логин: \`${user.username}\`\n`;
                                        message += `Пароль: \`${user.password}\` (временно, смените при входе)\n\n`;
                                        message += `🌐 Вход: http://localhost:3000/views/login.html`;
                                    }
                                    bot.sendMessage(chatId, message, { 
                                        parse_mode: 'Markdown',
                                        reply_markup: {
                                            remove_keyboard: true
                                        }
                                    });
                                }
                            );
                        } else if (application.status === 'rejected') {
                            message += '❌ К сожалению, ваша заявка отклонена. Вы можете подать новую заявку через /start.';
                            bot.sendMessage(chatId, message, { 
                                parse_mode: 'Markdown',
                                reply_markup: {
                                    remove_keyboard: true
                                }
                            });
                        } else {
                            message += '⏳ Ваша заявка на рассмотрении. Мы уведомим вас, когда статус изменится.';
                            bot.sendMessage(chatId, message, { 
                                parse_mode: 'Markdown',
                                reply_markup: {
                                    remove_keyboard: true
                                }
                            });
                        }
                    }
                );
            } catch (error) {
                console.error('Ошибка в команде /status:', error);
                bot.sendMessage(chatId, '❌ Произошла ошибка. Пожалуйста, попробуйте позже.');
            }
        });
        
        bot.onText(/\/cancel/, (msg) => {
            const chatId = msg.chat.id;
            
            if (userStates[chatId]) {
                delete userStates[chatId];
            }
            
            bot.sendMessage(
                chatId,
                '❌ Регистрация отменена. Чтобы начать заново, отправьте /start',
                {
                    reply_markup: {
                        remove_keyboard: true
                    }
                }
            );
        });
        
        bot.on('message', async (msg) => {
            const chatId = msg.chat.id;
            const text = msg.text;
            
            if (!text || text.startsWith('/')) return;
            
            const state = userStates[chatId];
            
            if (!state) {
                bot.sendMessage(
                    chatId,
                    '❓ Я вас не понимаю.\n\n' +
                    'Для начала регистрации отправьте /start\n' +
                    'Чтобы проверить статус заявки, отправьте /status',
                    {
                        reply_markup: {
                            remove_keyboard: true
                        }
                    }
                );
                return;
            }
            
            if (text === '❌ Отменить регистрацию') {
                delete userStates[chatId];
                bot.sendMessage(
                    chatId,
                    '❌ Регистрация отменена. Чтобы начать заново, отправьте /start',
                    {
                        reply_markup: {
                            remove_keyboard: true
                        }
                    }
                );
                return;
            }
            
            try {
                switch (state.step) {
                    case 'name':
                        if (!text || text.length < 5) {
                            bot.sendMessage(chatId, '❌ Пожалуйста, введите корректное ФИО (минимум 5 символов):');
                            return;
                        }
                        userStates[chatId] = { ...state, step: 'username', fullName: text };
                        bot.sendMessage(chatId, '✅ ФИО сохранено!\n\n📝 Введите желаемый логин (username):\n(Только латинские буквы и цифры)');
                        break;
                        
                    case 'username':
                        if (!/^[a-zA-Z0-9_]{3,20}$/.test(text)) {
                            bot.sendMessage(chatId, '❌ Логин должен содержать только латинские буквы, цифры и подчеркивания (от 3 до 20 символов):');
                            return;
                        }
                        
                        const existingUser = await new Promise((resolve) => {
                            db.get('SELECT username FROM users WHERE username = ?', [text], (err, row) => resolve(row));
                        });
                        
                        if (existingUser) {
                            bot.sendMessage(chatId, '❌ Этот логин уже занят. Пожалуйста, введите другой логин:');
                            return;
                        }
                        
                        userStates[chatId] = { ...state, step: 'email', username: text };
                        bot.sendMessage(chatId, '✅ Логин сохранен!\n\n📝 Введите ваш email:');
                        break;
                        
                    case 'email':
                        if (!text.includes('@') || !text.includes('.') || text.length < 5) {
                            bot.sendMessage(chatId, '❌ Пожалуйста, введите корректный email (например: name@domain.com):');
                            return;
                        }
                        userStates[chatId] = { ...state, step: 'reason', email: text };
                        bot.sendMessage(chatId, '✅ Email сохранен!\n\n📝 Почему вы хотите стать редактором? (кратко, 1-2 предложения)');
                        break;
                        
                    case 'reason':
                        if (!text || text.length < 10) {
                            bot.sendMessage(chatId, '❌ Пожалуйста, напишите причину подробнее (минимум 10 символов):');
                            return;
                        }
                        
                        const { fullName, username, email } = state;
                        const reason = text;
                        
                        console.log(`📝 Новая заявка от ${username} (${fullName})`);
                        
                        db.run(
                            `INSERT INTO applications (full_name, username, email, reason, telegram_chat_id, status) 
                             VALUES (?, ?, ?, ?, ?, 'pending')`,
                            [fullName, username, email, reason, chatId],
                            function(err) {
                                if (err) {
                                    console.error('❌ Ошибка сохранения заявки:', err);
                                    bot.sendMessage(chatId, '❌ Произошла ошибка при сохранении заявки. Пожалуйста, попробуйте позже.');
                                } else {
                                    console.log(`✅ Заявка #${this.lastID} сохранена в базе`);
                                    
                                    bot.sendMessage(
                                        chatId,
                                        `✅ **Спасибо, ${fullName}!**\n\n` +
                                        `Ваша заявка на статус редактора отправлена администратору.\n` +
                                        `Вы можете проверить статус заявки командой /status\n\n` +
                                        `Как только заявка будет одобрена, вы получите логин и пароль здесь.`,
                                        {
                                            parse_mode: 'Markdown',
                                            reply_markup: {
                                                remove_keyboard: true
                                            }
                                        }
                                    );
                                    
                                    if (ADMIN_CHAT_ID) {
                                        bot.sendMessage(
                                            ADMIN_CHAT_ID,
                                            `🔔 **Новая заявка на редактора!**\n\n` +
                                            `👤 ФИО: ${fullName}\n` +
                                            `🔑 Логин: ${username}\n` +
                                            `📧 Email: ${email}\n` +
                                            `💭 Причина: ${reason}\n` +
                                            `🆔 Telegram ID: ${chatId}`,
                                            { parse_mode: 'Markdown' }
                                        ).catch(e => console.log('Не удалось отправить уведомление админу'));
                                    }
                                    
                                    delete userStates[chatId];
                                }
                            }
                        );
                        break;
                }
            } catch (error) {
                console.error('❌ Ошибка в обработчике сообщений:', error);
                bot.sendMessage(chatId, '❌ Произошла ошибка. Пожалуйста, попробуйте позже или отправьте /start заново.');
            }
        });
        
        console.log('✅ Обработчики команд бота установлены');
        
    } catch (error) {
        console.error('❌ Критическая ошибка при запуске бота:', error);
    }
}

async function sendCredentialsToUser(chatId, username, password) {
    if (!bot) {
        console.log('❌ Бот не запущен, не могу отправить сообщение');
        return false;
    }
    
    try {
        await bot.sendMessage(
            chatId, 
            `✅ **ВАША ЗАЯВКА ОДОБРЕНА!**\n\n` +
            `Вы теперь редактор Музея компьютерных технологий.\n\n` +
            `🔑 **Данные для входа:**\n` +
            `Логин: \`${username}\`\n` +
            `Пароль: \`${password}\`\n\n` +
            `🌐 **Ссылка для входа:**\n` +
            `http://localhost:3000/views/login.html\n\n` +
            `⚠️ Рекомендуем сменить пароль после первого входа.`,
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🌐 Перейти на сайт', url: 'http://localhost:3000/views/login.html' }]
                    ]
                }
            }
        );
        
        console.log(`✅ Учётные данные отправлены пользователю ${chatId}`);
        return true;
        
    } catch (error) {
        console.error('❌ Ошибка отправки сообщения:', error.message);
        return false;
    }
}

function getBotStatus() {
    return {
        isRunning: bot !== null,
        token: token ? 'Установлен' : 'Не установлен',
        adminId: ADMIN_CHAT_ID || 'Не установлен'
    };
}

console.log('🔄 Инициализация Telegram бота...');
initBot();

module.exports = { 
    sendCredentialsToUser,
    getBotStatus
};