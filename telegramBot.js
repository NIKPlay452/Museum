const TelegramBot = require('node-telegram-bot-api');
const db = require('./database');

const token = process.env.TELEGRAM_BOT_TOKEN;
const SITE_URL = process.env.SITE_URL || 'https://museum-six-umber.vercel.app';

let bot = null;

if (token) {
    bot = new TelegramBot(token);
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
        console.error('Ошибка отправки:', e);
        return false;
    }
}

module.exports = { sendCredentialsToUser };