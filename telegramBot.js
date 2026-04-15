const TelegramBot = require('node-telegram-bot-api');

const token = process.env.TELEGRAM_BOT_TOKEN;
const SITE_URL = process.env.SITE_URL || 'https://museum-six-umber.vercel.app';

let bot = null;

// Инициализируем бота только если есть токен и это не serverless окружение
if (token && process.env.VERCEL !== '1') {
    try {
        bot = new TelegramBot(token, { polling: true });
        console.log('✅ Telegram бот запущен с polling');
        
        // Настройка обработчиков сообщений (если нужно)
        bot.onText(/\/start/, (msg) => {
            const chatId = msg.chat.id;
            bot.sendMessage(chatId, `Добро пожаловать в Музей компьютерных технологий!\n\nДля подачи заявки используйте форму на сайте: ${SITE_URL}`);
        });
        
    } catch (error) {
        console.error('❌ Ошибка запуска бота:', error);
    }
} else {
    console.log('ℹ️ Telegram бот не запущен (токен отсутствует или среда Vercel)');
}

// Функция для отправки учетных данных (используется в server.js)
async function sendCredentialsToUser(chatId, username, password) {
    if (!bot) {
        console.log('⚠️ Бот не инициализирован, не могу отправить сообщение');
        return false;
    }
    
    try {
        await bot.sendMessage(
            chatId,
            `✅ **ЗАЯВКА ОДОБРЕНА!**\n\n` +
            `🔑 Логин: \`${username}\`\n` +
            `🔑 Пароль: \`${password}\`\n\n` +
            `🌐 ${SITE_URL}/views/login.html\n\n` +
            `⚠️ Сохраните пароль, он будет показан только один раз!`,
            { parse_mode: 'Markdown' }
        );
        console.log(`✅ Пароль отправлен пользователю ${chatId}`);
        return true;
    } catch (e) {
        console.error('❌ Ошибка отправки в Telegram:', e.message);
        return false;
    }
}

module.exports = { sendCredentialsToUser };