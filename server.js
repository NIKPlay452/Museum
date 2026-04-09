const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const ImageKit = require('imagekit');
const nodemailer = require('nodemailer');
const db = require('./database');
const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================================
// КОНФИГУРАЦИЯ
// ============================================================================

const JWT_SECRET = process.env.JWT_SECRET || 'museum-secret-key-2026';

// Настройка email транспорта
const emailTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

// ImageKit
const imagekit = new ImageKit({
    publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
    privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
    urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT
});

// Временное хранилище паролей (24 часа)
const tempPasswords = new Map();
setInterval(() => {
    const now = Date.now();
    for (const [id, { password, expires }] of tempPasswords.entries()) {
        if (expires < now) tempPasswords.delete(id);
    }
}, 60 * 60 * 1000);

// Multer
const storage = multer.memoryStorage();
const upload = multer({ 
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }
});

// ============================================================================
// MIDDLEWARE
// ============================================================================

app.use((req, res, next) => {
    console.log(`📨 ${req.method} ${req.url}`);
    next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Статические файлы
app.use('/css', express.static(path.join(__dirname, 'public', 'css'), {
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.css')) res.setHeader('Content-Type', 'text/css');
    }
}));

app.use('/js', express.static(path.join(__dirname, 'public', 'js'), {
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.js')) res.setHeader('Content-Type', 'application/javascript');
    }
}));

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/views', express.static(path.join(__dirname, 'views')));

// Корневой маршрут
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

// ============================================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================================

const authenticateToken = (req, res, next) => {
    const token = req.cookies.token || req.headers['authorization']?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Не авторизован' });
    
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Токен недействителен' });
        req.user = user;
        next();
    });
};

const isAdmin = (req, res, next) => {
    if (req.user?.role === 'admin') next();
    else res.status(403).json({ error: 'Доступ запрещен' });
};

// Функция отправки email
async function sendEmail(to, subject, html) {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
        console.log('⚠️ Email не настроен, пропускаем отправку');
        return false;
    }
    
    try {
        await emailTransporter.sendMail({
            from: `"Музей компьютерных технологий" <${process.env.SMTP_USER}>`,
            to: to,
            subject: subject,
            html: html
        });
        console.log(`✅ Email отправлен на ${to}`);
        return true;
    } catch (error) {
        console.error('❌ Ошибка отправки email:', error.message);
        return false;
    }
}

// ============================================================================
// АВТОРИЗАЦИЯ
// ============================================================================

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    console.log(`🔐 Попытка входа: ${username}`);
    
    try {
        const result = await db.query(`SELECT * FROM users WHERE username = $1`, [username]);
        const user = result.rows[0];
        
        if (!user) {
            console.log('❌ Пользователь не найден');
            return res.status(401).json({ error: 'Неверный логин или пароль' });
        }
        
        const isValid = bcrypt.compareSync(password, user.password);
        
        if (!isValid) {
            console.log('❌ Неверный пароль');
            return res.status(401).json({ error: 'Неверный логин или пароль' });
        }
        
        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role },
            JWT_SECRET,
            { expiresIn: '7d' }
        );
        
        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 7 * 24 * 60 * 60 * 1000
        });
        
        res.json({ success: true, role: user.role });
        
    } catch (error) {
        console.error('❌ Ошибка БД:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.post('/api/logout', (req, res) => {
    res.clearCookie('token', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/'
    });
    res.json({ success: true });
});

app.get('/api/me', async (req, res) => {
    const token = req.cookies.token;
    if (!token) {
        return res.status(401).json({ error: 'Не авторизован' });
    }
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        res.json({ user: decoded });
    } catch (err) {
        res.status(401).json({ error: 'Не авторизован' });
    }
});

// ============================================================================
// ЗАЯВКИ
// ============================================================================

app.post('/api/applications', async (req, res) => {
    const { full_name, username, email, reason } = req.body;
    
    if (!full_name || !username || !email || !reason) {
        return res.status(400).json({ error: 'Заполните все поля' });
    }
    
    try {
        const existing = await db.query(`SELECT username FROM users WHERE username = $1`, [username]);
        
        if (existing.rows.length > 0) {
            return res.status(400).json({ error: 'Логин уже занят' });
        }
        
        await db.query(
            `INSERT INTO applications (full_name, username, email, reason, status) 
             VALUES ($1, $2, $3, $4, 'pending')`,
            [full_name, username, email, reason]
        );
        
        console.log(`✅ Новая заявка от ${full_name} (${email})`);
        
        const ADMIN_CHAT_ID = 5231666805;
        if (process.env.TELEGRAM_BOT_TOKEN) {
            try {
                const TelegramBot = require('node-telegram-bot-api');
                const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN);
                bot.sendMessage(
                    ADMIN_CHAT_ID,
                    `🔔 Новая заявка!\n\n👤 ${full_name}\n🔑 ${username}\n📧 ${email}\n💬 ${reason}`
                ).catch(() => {});
            } catch (e) {}
        }
        
        res.json({ success: true, message: 'Заявка отправлена' });
        
    } catch (error) {
        console.error('Ошибка сохранения:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// ============================================================================
// ЭКСПОНАТЫ
// ============================================================================

app.get('/api/exhibits', async (req, res) => {
    try {
        const result = await db.query(`SELECT * FROM exhibits WHERE status = 'approved' ORDER BY year ASC`);
        res.json(result.rows || []);
    } catch (error) {
        console.error('❌ Ошибка загрузки экспонатов:', error);
        res.status(500).json({ error: 'Ошибка базы данных' });
    }
});

app.get('/api/exhibits/all', authenticateToken, async (req, res) => {
    console.log('📋 Запрос всех экспонатов от:', req.user?.username);
    
    try {
        const result = await db.query(`SELECT e.*, u.username as creator_name FROM exhibits e 
            LEFT JOIN users u ON e.created_by = u.id 
            ORDER BY e.year ASC`);
        res.json(result.rows || []);
    } catch (error) {
        console.error('❌ Ошибка загрузки всех экспонатов:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/exhibits/:id', async (req, res) => {
    const id = req.params.id;
    try {
        const result = await db.query(`SELECT * FROM exhibits WHERE id = $1`, [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Экспонат не найден' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        console.error('❌ Ошибка загрузки экспоната:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/exhibits/status/:status', authenticateToken, async (req, res) => {
    const status = req.params.status;
    const validStatuses = ['pending_creation', 'pending_edit', 'approved', 'rejected'];
    
    if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Неверный статус' });
    }
    
    try {
        const result = await db.query(`SELECT e.*, u.username as creator_name FROM exhibits e 
            LEFT JOIN users u ON e.created_by = u.id 
            WHERE e.status = $1 
            ORDER BY e.created_at DESC`, [status]);
        res.json(result.rows || []);
    } catch (error) {
        console.error('❌ Ошибка загрузки по статусу:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/exhibits', authenticateToken, upload.fields([
    { name: 'media', maxCount: 1 },
    { name: 'background', maxCount: 1 }
]), async (req, res) => {
    const { title, year, description } = req.body;
    const userId = req.user.id;
    
    if (!title || !year || !description) {
        return res.status(400).json({ error: 'Заполните все поля' });
    }
    
    try {
        let mediaUrl = null;
        let backgroundUrl = null;
        
        if (req.files?.media?.[0]) {
            const file = req.files.media[0];
            const result = await imagekit.upload({
                file: file.buffer,
                fileName: `exhibit-${Date.now()}-${file.originalname}`,
                folder: '/museum/exhibits',
                useUniqueFileName: true
            });
            mediaUrl = result.url;
        }
        
        if (req.files?.background?.[0]) {
            const file = req.files.background[0];
            const result = await imagekit.upload({
                file: file.buffer,
                fileName: `background-${Date.now()}-${file.originalname}`,
                folder: '/museum/backgrounds',
                useUniqueFileName: true
            });
            backgroundUrl = result.url;
        }
        
        const status = req.user.role === 'admin' ? 'approved' : 'pending_creation';
        
        const result = await db.query(
            `INSERT INTO exhibits (title, year, description, media_path, background_path, status, created_by) 
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
            [title, year, description, mediaUrl, backgroundUrl, status, userId]
        );
        
        res.json({ 
            id: result.rows[0].id, 
            status,
            message: status === 'approved' ? 'Экспонат создан' : 'Отправлен на проверку'
        });
        
    } catch (error) {
        console.error('❌ Ошибка создания экспоната:', error);
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/exhibits/:id', authenticateToken, upload.fields([
    { name: 'media', maxCount: 1 },
    { name: 'background', maxCount: 1 }
]), async (req, res) => {
    const exhibitId = req.params.id;
    const { title, year, description } = req.body;
    const userId = req.user.id;
    
    try {
        const oldExhibitResult = await db.query(`SELECT * FROM exhibits WHERE id = $1`, [exhibitId]);
        if (oldExhibitResult.rows.length === 0) {
            return res.status(404).json({ error: 'Экспонат не найден' });
        }
        
        const oldExhibit = oldExhibitResult.rows[0];
        let mediaUrl = oldExhibit.media_path;
        let backgroundUrl = oldExhibit.background_path;
        
        if (req.files?.media?.[0]) {
            const file = req.files.media[0];
            const result = await imagekit.upload({
                file: file.buffer,
                fileName: `exhibit-${Date.now()}-${file.originalname}`,
                folder: '/museum/exhibits',
                useUniqueFileName: true
            });
            mediaUrl = result.url;
        }
        
        if (req.files?.background?.[0]) {
            const file = req.files.background[0];
            const result = await imagekit.upload({
                file: file.buffer,
                fileName: `background-${Date.now()}-${file.originalname}`,
                folder: '/museum/backgrounds',
                useUniqueFileName: true
            });
            backgroundUrl = result.url;
        }
        
        if (req.user.role === 'admin') {
            await db.query(
                `UPDATE exhibits SET title = $1, year = $2, description = $3, media_path = $4, background_path = $5 WHERE id = $6`,
                [title, year, description, mediaUrl, backgroundUrl, exhibitId]
            );
            res.json({ message: 'Экспонат обновлен' });
        } else {
            await db.query(
                `INSERT INTO exhibits (title, year, description, media_path, background_path, status, created_by, original_id) 
                 VALUES ($1, $2, $3, $4, $5, 'pending_edit', $6, $7)`,
                [title, year, description, mediaUrl, backgroundUrl, userId, exhibitId]
            );
            res.json({ message: 'Изменения отправлены на проверку' });
        }
    } catch (error) {
        console.error('❌ Ошибка обновления:', error);
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/admin/exhibits/:id', authenticateToken, isAdmin, async (req, res) => {
    const exhibitId = req.params.id;
    
    try {
        const exhibitCheck = await db.query(`SELECT * FROM exhibits WHERE id = $1`, [exhibitId]);
        
        if (exhibitCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Экспонат не найден' });
        }
        
        await db.query(`DELETE FROM exhibits WHERE id = $1`, [exhibitId]);
        
        console.log(`✅ Экспонат ${exhibitId} удален`);
        res.json({ message: 'Экспонат удален' });
        
    } catch (error) {
        console.error('❌ Ошибка удаления экспоната:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================================================
// АДМИН: ПРОВЕРКА ЭКСПОНАТОВ
// ============================================================================

app.get('/api/admin/pending-creations', authenticateToken, isAdmin, async (req, res) => {
    try {
        const result = await db.query(`SELECT e.*, u.username as creator_name FROM exhibits e 
            LEFT JOIN users u ON e.created_by = u.id 
            WHERE e.status = 'pending_creation' 
            ORDER BY e.created_at DESC`);
        res.json(result.rows || []);
    } catch (error) {
        console.error('❌ Ошибка загрузки:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/admin/pending-edits', authenticateToken, isAdmin, async (req, res) => {
    try {
        const result = await db.query(`SELECT e.*, u.username as creator_name FROM exhibits e 
            LEFT JOIN users u ON e.created_by = u.id 
            WHERE e.status = 'pending_edit' 
            ORDER BY e.created_at DESC`);
        res.json(result.rows || []);
    } catch (error) {
        console.error('❌ Ошибка загрузки:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/admin/approve/:id', authenticateToken, isAdmin, async (req, res) => {
    const exhibitId = req.params.id;
    
    try {
        const pendingResult = await db.query(`SELECT * FROM exhibits WHERE id = $1`, [exhibitId]);
        if (pendingResult.rows.length === 0) {
            return res.status(404).json({ error: 'Экспонат не найден' });
        }
        
        const pendingExhibit = pendingResult.rows[0];
        
        if (pendingExhibit.status === 'pending_creation') {
            await db.query(`UPDATE exhibits SET status = 'approved' WHERE id = $1`, [exhibitId]);
            res.json({ message: 'Экспонат одобрен' });
        } else if (pendingExhibit.status === 'pending_edit' && pendingExhibit.original_id) {
            await db.query(
                `UPDATE exhibits SET title = $1, year = $2, description = $3, media_path = $4, background_path = $5 
                 WHERE id = $6`,
                [pendingExhibit.title, pendingExhibit.year, pendingExhibit.description, 
                 pendingExhibit.media_path, pendingExhibit.background_path, pendingExhibit.original_id]
            );
            await db.query(`DELETE FROM exhibits WHERE id = $1`, [exhibitId]);
            res.json({ message: 'Изменения применены' });
        } else {
            res.status(400).json({ error: 'Невозможно одобрить' });
        }
    } catch (error) {
        console.error('❌ Ошибка одобрения:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/admin/reject/:id', authenticateToken, isAdmin, async (req, res) => {
    const exhibitId = req.params.id;
    try {
        await db.query(`UPDATE exhibits SET status = 'rejected' WHERE id = $1`, [exhibitId]);
        res.json({ message: 'Экспонат отклонен' });
    } catch (error) {
        console.error('❌ Ошибка отклонения:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================================================
// РЕДАКТОРЫ
// ============================================================================

app.get('/api/admin/editors', authenticateToken, isAdmin, async (req, res) => {
    console.log('📋 Запрос списка редакторов');
    try {
        const result = await db.query(`SELECT id, username, email, created_at FROM users WHERE role = 'editor'`);
        const editorsWithPasswords = result.rows.map(editor => ({
            ...editor,
            password: tempPasswords.get(editor.id)?.password || null
        }));
        res.json(editorsWithPasswords);
    } catch (error) {
        console.error('❌ Ошибка получения редакторов:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/admin/editors/:id/password', authenticateToken, isAdmin, (req, res) => {
    const editorId = parseInt(req.params.id);
    const entry = tempPasswords.get(editorId);
    res.json(entry ? { password: entry.password } : { message: 'Пароль истек' });
});

app.post('/api/admin/editors', authenticateToken, isAdmin, async (req, res) => {
    const { username, password, email, telegramId } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ error: 'Логин и пароль обязательны' });
    }
    
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(password, salt);
    
    try {
        const result = await db.query(
            `INSERT INTO users (username, password, email, role) VALUES ($1, $2, $3, 'editor') RETURNING id`,
            [username, hash, email || null]
        );
        
        const editorId = result.rows[0].id;
        tempPasswords.set(editorId, { password, expires: Date.now() + 24 * 60 * 60 * 1000 });
        
        let telegramSent = false;
        if (telegramId?.trim()) {
            try {
                const { sendCredentialsToUser } = require('./telegramBot');
                await sendCredentialsToUser(telegramId, username, password);
                telegramSent = true;
            } catch (e) { console.error('❌ Ошибка Telegram:', e.message); }
        }
        
        let emailSent = false;
        if (email?.trim()) {
            const emailHtml = `<div>...</div>`;
            emailSent = await sendEmail(email, '✅ Доступ в редакцию', emailHtml);
        }
        
        res.json({ id: editorId, username, email: email || null, password, telegramSent, emailSent });
    } catch (error) {
        if (error.message.includes('duplicate')) {
            return res.status(400).json({ error: 'Имя пользователя уже занято' });
        }
        console.error('❌ Ошибка создания редактора:', error);
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/admin/editors/:id', authenticateToken, isAdmin, async (req, res) => {
    const editorId = parseInt(req.params.id);
    const { username, email, password } = req.body;
    
    try {
        if (username) {
            await db.query(`UPDATE users SET username = $1 WHERE id = $2 AND role = 'editor'`, [username, editorId]);
        }
        if (email !== undefined) {
            await db.query(`UPDATE users SET email = $1 WHERE id = $2 AND role = 'editor'`, [email || null, editorId]);
        }
        if (password) {
            const salt = bcrypt.genSaltSync(10);
            const hash = bcrypt.hashSync(password, salt);
            await db.query(`UPDATE users SET password = $1 WHERE id = $2 AND role = 'editor'`, [hash, editorId]);
            tempPasswords.set(editorId, { password, expires: Date.now() + 24 * 60 * 60 * 1000 });
        }
        res.json({ message: 'Редактор обновлен' });
    } catch (error) {
        console.error('❌ Ошибка обновления:', error);
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/admin/editors/:id', authenticateToken, isAdmin, async (req, res) => {
    const editorId = parseInt(req.params.id);
    try {
        await db.query(`UPDATE exhibits SET created_by = 1 WHERE created_by = $1`, [editorId]);
        await db.query(`DELETE FROM users WHERE id = $1 AND role = 'editor'`, [editorId]);
        tempPasswords.delete(editorId);
        res.json({ message: 'Редактор удален' });
    } catch (error) {
        console.error('❌ Ошибка удаления:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================================================
// ЗАЯВКИ (админ)
// ============================================================================

app.get('/api/admin/applications', authenticateToken, isAdmin, async (req, res) => {
    try {
        const result = await db.query(`SELECT * FROM applications ORDER BY created_at DESC`);
        res.json(result.rows || []);
    } catch (error) {
        console.error('❌ Ошибка загрузки заявок:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/admin/applications/:id', authenticateToken, isAdmin, async (req, res) => {
    const id = req.params.id;
    try {
        const result = await db.query(`SELECT * FROM applications WHERE id = $1`, [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Заявка не найдена' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        console.error('❌ Ошибка загрузки заявки:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/admin/applications/:id/approve', authenticateToken, isAdmin, async (req, res) => {
    const applicationId = req.params.id;
    
    try {
        const appResult = await db.query(`SELECT * FROM applications WHERE id = $1`, [applicationId]);
        if (appResult.rows.length === 0) {
            return res.status(404).json({ error: 'Заявка не найдена' });
        }
        
        const application = appResult.rows[0];
        await db.query(`UPDATE applications SET status = 'approved' WHERE id = $1`, [applicationId]);
        
        let emailSent = false;
        if (application.email) {
            const emailHtml = `<div>...</div>`;
            emailSent = await sendEmail(application.email, '✅ Ваша заявка одобрена!', emailHtml);
        }
        
        res.json({ message: `Заявка одобрена${emailSent ? ', уведомление отправлено' : ''}` });
    } catch (error) {
        console.error('❌ Ошибка одобрения заявки:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/admin/applications/:id/reject', authenticateToken, isAdmin, async (req, res) => {
    const applicationId = req.params.id;
    
    try {
        const appResult = await db.query(`SELECT * FROM applications WHERE id = $1`, [applicationId]);
        if (appResult.rows.length === 0) {
            return res.status(404).json({ error: 'Заявка не найдена' });
        }
        
        const application = appResult.rows[0];
        await db.query(`UPDATE applications SET status = 'rejected' WHERE id = $1`, [applicationId]);
        
        let emailSent = false;
        if (application.email) {
            const emailHtml = `<div>...</div>`;
            emailSent = await sendEmail(application.email, '❌ Статус вашей заявки', emailHtml);
        }
        
        res.json({ message: `Заявка отклонена${emailSent ? ', уведомление отправлено' : ''}` });
    } catch (error) {
        console.error('❌ Ошибка отклонения заявки:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================================================
// УПРАВЛЕНИЕ СТИЛЯМИ САЙТА
// ============================================================================

app.get('/api/site-styles', async (req, res) => {
    try {
        const result = await db.query(`SELECT setting_key, setting_value FROM site_settings ORDER BY setting_key`);
        const styles = {};
        result.rows.forEach(row => { styles[row.setting_key] = row.setting_value; });
        res.json(styles);
    } catch (error) {
        console.error('❌ Ошибка загрузки настроек стилей:', error);
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/admin/site-styles', authenticateToken, isAdmin, async (req, res) => {
    const { styles } = req.body;
    const userId = req.user.id;
    
    if (!styles || typeof styles !== 'object') {
        return res.status(400).json({ error: 'Неверный формат данных' });
    }
    
    try {
        for (const [key, value] of Object.entries(styles)) {
            await db.query(
                `UPDATE site_settings SET setting_value = $1, updated_at = CURRENT_TIMESTAMP, updated_by = $2 WHERE setting_key = $3`,
                [value, userId, key]
            );
        }
        console.log(`✅ Стили сайта обновлены пользователем ${req.user.username}`);
        res.json({ success: true, message: 'Стили успешно обновлены', styles: styles });
    } catch (error) {
        console.error('❌ Ошибка обновления настроек:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/admin/site-styles/reset', authenticateToken, isAdmin, async (req, res) => {
    const defaultStyles = {
        'color_primary': '#c9a03d', 'color_primary_light': '#e0b354', 'color_primary_dark': '#b8860b',
        'color_bg_dark': '#0a0c10', 'color_text_primary': '#ffffff', 'color_text_secondary': '#a0aab8',
        'font_primary': "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        'border_radius': '12px', 'transition_speed': '0.25s'
    };
    const userId = req.user.id;
    
    try {
        for (const [key, value] of Object.entries(defaultStyles)) {
            await db.query(
                `UPDATE site_settings SET setting_value = $1, updated_at = CURRENT_TIMESTAMP, updated_by = $2 WHERE setting_key = $3`,
                [value, userId, key]
            );
        }
        res.json({ success: true, message: 'Стили сброшены к значениям по умолчанию' });
    } catch (error) {
        console.error('❌ Ошибка сброса настроек:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================================================
// ТЕСТОВЫЙ МАРШРУТ
// ============================================================================

app.get('/api/test', (req, res) => {
    res.json({ message: 'Сервер работает', time: new Date().toISOString() });
});

// ============================================================================
// ОБРАБОТКА 404
// ============================================================================

app.use((req, res) => {
    if (req.url.startsWith('/api/')) {
        res.status(404).json({ error: 'Маршрут не найден' });
    } else {
        res.status(404).sendFile(path.join(__dirname, 'views', '404.html'));
    }
});

// ============================================================================
// ОБРАБОТКА ОШИБОК
// ============================================================================

app.use((err, req, res, next) => {
    console.error('❌ Необработанная ошибка:', err);
    if (req.url.startsWith('/api/')) {
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    } else {
        res.status(500).sendFile(path.join(__dirname, 'views', '500.html'));
    }
});

// ============================================================================
// ЗАПУСК
// ============================================================================

app.listen(PORT, () => {
    console.log(`✅ Сервер запущен на порту ${PORT}`);
    console.log(`🌐 Главная: http://localhost:${PORT}/`);
});

module.exports = app;