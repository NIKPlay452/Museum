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
        
        const bcrypt = require('bcryptjs');
        const isValid = bcrypt.compareSync(password, user.password);
        
        if (!isValid) {
            console.log('❌ Неверный пароль');
            return res.status(401).json({ error: 'Неверный логин или пароль' });
        }
        
        const jwt = require('jsonwebtoken');
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
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, JWT_SECRET);
        res.json({ user: decoded });
    } catch (err) {
        res.status(401).json({ error: 'Не авторизован' });
    }
});

app.post('/api/logout', (req, res) => {
    res.clearCookie('token', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/'
    });
    res.clearCookie('token', { path: '/views' });
    res.clearCookie('token', { path: '/api' });
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
// ЗАЯВКИ (НОВЫЙ ЭНДПОИНТ)
// ============================================================================

app.post('/api/applications', (req, res) => {
    const { full_name, username, email, reason } = req.body;
    
    if (!full_name || !username || !email || !reason) {
        return res.status(400).json({ error: 'Заполните все поля' });
    }
    
    // Проверка уникальности логина
    db.get('SELECT username FROM users WHERE username = ?', [username], (err, existing) => {
        if (err) {
            console.error('Ошибка БД:', err);
            return res.status(500).json({ error: 'Ошибка сервера' });
        }
        
        if (existing) {
            return res.status(400).json({ error: 'Логин уже занят' });
        }
        
        // Сохраняем заявку
        db.run(
            `INSERT INTO applications (full_name, username, email, reason, status) 
             VALUES (?, ?, ?, ?, 'pending')`,
            [full_name, username, email, reason],
            function(err) {
                if (err) {
                    console.error('Ошибка сохранения:', err);
                    return res.status(500).json({ error: 'Ошибка сохранения' });
                }
                
                console.log(`✅ Новая заявка от ${full_name} (${email})`);
                
                // Уведомление администратору в Telegram (если настроен)
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
            }
        );
    });
});

// ============================================================================
// ЭКСПОНАТЫ
// ============================================================================

app.get('/api/exhibits', async (req, res) => {
    try {
        const exhibits = await db.all(`SELECT * FROM exhibits WHERE status = 'approved' ORDER BY year ASC`);
        res.json(exhibits || []);
    } catch (error) {
        console.error('❌ Ошибка загрузки экспонатов:', error);
        res.status(500).json({ error: 'Ошибка базы данных' });
    }
});

app.get('/api/exhibits/all', authenticateToken, (req, res) => {
    console.log('📋 Запрос всех экспонатов от:', req.user?.username);
    
    db.all(`SELECT e.*, u.username as creator_name FROM exhibits e 
            LEFT JOIN users u ON e.created_by = u.id 
            ORDER BY e.year ASC`, [], (err, rows) => {
        if (err) {
            console.error('❌ Ошибка загрузки всех экспонатов:', err);
            return res.status(500).json({ error: err.message });
        }
        res.json(rows || []);
    });
});

app.get('/api/exhibits/:id', (req, res) => {
    const id = req.params.id;
    db.get(`SELECT * FROM exhibits WHERE id = ?`, [id], (err, row) => {
        if (err) {
            console.error('❌ Ошибка загрузки экспоната:', err);
            return res.status(500).json({ error: err.message });
        }
        if (!row) return res.status(404).json({ error: 'Экспонат не найден' });
        res.json(row);
    });
});

app.get('/api/exhibits/status/:status', authenticateToken, (req, res) => {
    const status = req.params.status;
    const validStatuses = ['pending_creation', 'pending_edit', 'approved', 'rejected'];
    
    if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Неверный статус' });
    }
    
    db.all(`SELECT e.*, u.username as creator_name FROM exhibits e 
            LEFT JOIN users u ON e.created_by = u.id 
            WHERE e.status = ? 
            ORDER BY e.created_at DESC`, [status], (err, rows) => {
        if (err) {
            console.error('❌ Ошибка загрузки по статусу:', err);
            return res.status(500).json({ error: err.message });
        }
        res.json(rows || []);
    });
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
        
        db.run(
            `INSERT INTO exhibits (title, year, description, media_path, background_path, status, created_by) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [title, year, description, mediaUrl, backgroundUrl, status, userId],
            function(err) {
                if (err) {
                    console.error('❌ Ошибка создания экспоната:', err);
                    return res.status(500).json({ error: err.message });
                }
                res.json({ 
                    id: this.lastID, 
                    status,
                    message: status === 'approved' ? 'Экспонат создан' : 'Отправлен на проверку'
                });
            }
        );
    } catch (error) {
        console.error('❌ Ошибка ImageKit:', error);
        res.status(500).json({ error: 'Ошибка загрузки файла' });
    }
});

app.put('/api/exhibits/:id', authenticateToken, upload.fields([
    { name: 'media', maxCount: 1 },
    { name: 'background', maxCount: 1 }
]), async (req, res) => {
    const exhibitId = req.params.id;
    const { title, year, description } = req.body;
    const userId = req.user.id;
    
    db.get(`SELECT * FROM exhibits WHERE id = ?`, [exhibitId], async (err, oldExhibit) => {
        if (err) {
            console.error('❌ Ошибка поиска экспоната:', err);
            return res.status(500).json({ error: err.message });
        }
        if (!oldExhibit) return res.status(404).json({ error: 'Экспонат не найден' });
        
        let mediaUrl = oldExhibit.media_path;
        let backgroundUrl = oldExhibit.background_path;
        
        try {
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
                db.run(
                    `UPDATE exhibits SET title = ?, year = ?, description = ?, media_path = ?, background_path = ? WHERE id = ?`,
                    [title, year, description, mediaUrl, backgroundUrl, exhibitId],
                    function(err) {
                        if (err) {
                            console.error('❌ Ошибка обновления экспоната:', err);
                            return res.status(500).json({ error: err.message });
                        }
                        res.json({ message: 'Экспонат обновлен' });
                    }
                );
            } else {
                db.run(
                    `INSERT INTO exhibits (title, year, description, media_path, background_path, status, created_by, original_id) 
                     VALUES (?, ?, ?, ?, ?, 'pending_edit', ?, ?)`,
                    [title, year, description, mediaUrl, backgroundUrl, userId, exhibitId],
                    function(err) {
                        if (err) {
                            console.error('❌ Ошибка создания правки:', err);
                            return res.status(500).json({ error: err.message });
                        }
                        res.json({ message: 'Изменения отправлены на проверку' });
                    }
                );
            }
        } catch (error) {
            console.error('❌ Ошибка ImageKit:', error);
            res.status(500).json({ error: 'Ошибка загрузки файла' });
        }
    });
});

app.delete('/api/admin/exhibits/:id', authenticateToken, isAdmin, (req, res) => {
    const exhibitId = req.params.id;
    
    db.get(`SELECT media_path, background_path FROM exhibits WHERE id = ?`, [exhibitId], (err, exhibit) => {
        if (err) {
            console.error('❌ Ошибка поиска экспоната:', err);
            return res.status(500).json({ error: err.message });
        }
        if (!exhibit) return res.status(404).json({ error: 'Экспонат не найден' });
        
        db.run(`DELETE FROM exhibits WHERE id = ?`, [exhibitId], function(err) {
            if (err) {
                console.error('❌ Ошибка удаления экспоната:', err);
                return res.status(500).json({ error: err.message });
            }
            res.json({ message: 'Экспонат удален' });
        });
    });
});

app.post('/api/exhibits/check-duplicate', authenticateToken, (req, res) => {
    const { title, year, description, excludeId } = req.body;
    
    let query = `SELECT id FROM exhibits WHERE title = ? AND year = ? AND description = ?`;
    let params = [title, year, description];
    
    if (excludeId) {
        query += ` AND id != ?`;
        params.push(excludeId);
    }
    
    db.get(query, params, (err, row) => {
        if (err) {
            console.error('❌ Ошибка проверки дубликата:', err);
            return res.status(500).json({ error: err.message });
        }
        res.json({ exists: !!row });
    });
});

// ============================================================================
// АДМИН: ПРОВЕРКА ЭКСПОНАТОВ
// ============================================================================

app.get('/api/admin/pending-creations', authenticateToken, isAdmin, (req, res) => {
    db.all(`SELECT e.*, u.username as creator_name FROM exhibits e 
            LEFT JOIN users u ON e.created_by = u.id 
            WHERE e.status = 'pending_creation' 
            ORDER BY e.created_at DESC`, [], (err, rows) => {
        if (err) {
            console.error('❌ Ошибка загрузки pending-creations:', err);
            return res.status(500).json({ error: err.message });
        }
        res.json(rows || []);
    });
});

app.get('/api/admin/pending-edits', authenticateToken, isAdmin, (req, res) => {
    db.all(`SELECT e.*, u.username as creator_name FROM exhibits e 
            LEFT JOIN users u ON e.created_by = u.id 
            WHERE e.status = 'pending_edit' 
            ORDER BY e.created_at DESC`, [], (err, rows) => {
        if (err) {
            console.error('❌ Ошибка загрузки pending-edits:', err);
            return res.status(500).json({ error: err.message });
        }
        res.json(rows || []);
    });
});

app.post('/api/admin/approve/:id', authenticateToken, isAdmin, (req, res) => {
    const exhibitId = req.params.id;
    
    db.get(`SELECT * FROM exhibits WHERE id = ?`, [exhibitId], (err, pendingExhibit) => {
        if (err) {
            console.error('❌ Ошибка поиска экспоната:', err);
            return res.status(500).json({ error: err.message });
        }
        if (!pendingExhibit) {
            return res.status(404).json({ error: 'Экспонат не найден' });
        }
        
        if (pendingExhibit.status === 'pending_creation') {
            db.run(`UPDATE exhibits SET status = 'approved' WHERE id = ?`, [exhibitId], function(err) {
                if (err) {
                    console.error('❌ Ошибка одобрения экспоната:', err);
                    return res.status(500).json({ error: err.message });
                }
                res.json({ message: 'Экспонат одобрен' });
            });
        } else if (pendingExhibit.status === 'pending_edit' && pendingExhibit.original_id) {
            db.run(
                `UPDATE exhibits SET title = ?, year = ?, description = ?, media_path = ?, background_path = ? 
                 WHERE id = ?`,
                [pendingExhibit.title, pendingExhibit.year, pendingExhibit.description, 
                 pendingExhibit.media_path, pendingExhibit.background_path, pendingExhibit.original_id],
                function(err) {
                    if (err) {
                        console.error('❌ Ошибка применения изменений:', err);
                        return res.status(500).json({ error: err.message });
                    }
                    db.run(`DELETE FROM exhibits WHERE id = ?`, [exhibitId], (err) => {
                        if (err) console.error('❌ Ошибка удаления временной правки:', err);
                    });
                    res.json({ message: 'Изменения применены' });
                }
            );
        } else {
            res.status(400).json({ error: 'Невозможно одобрить' });
        }
    });
});

app.post('/api/admin/reject/:id', authenticateToken, isAdmin, (req, res) => {
    const exhibitId = req.params.id;
    db.run(`UPDATE exhibits SET status = 'rejected' WHERE id = ?`, [exhibitId], function(err) {
        if (err) {
            console.error('❌ Ошибка отклонения экспоната:', err);
            return res.status(500).json({ error: err.message });
        }
        res.json({ message: 'Экспонат отклонен' });
    });
});

// ============================================================================
// РЕДАКТОРЫ
// ============================================================================

app.get('/api/admin/editors', authenticateToken, isAdmin, (req, res) => {
    console.log('📋 Запрос списка редакторов');
    
    db.all(`SELECT id, username, email, created_at FROM users WHERE role = 'editor'`, [], (err, rows) => {
        if (err) {
            console.error('❌ Ошибка получения редакторов:', err);
            return res.status(500).json({ error: err.message });
        }
        
        const editorsWithPasswords = rows.map(editor => ({
            ...editor,
            password: tempPasswords.get(editor.id)?.password || null
        }));
        
        res.json(editorsWithPasswords);
    });
});

app.get('/api/admin/editors/:id/password', authenticateToken, isAdmin, (req, res) => {
    const editorId = parseInt(req.params.id);
    const entry = tempPasswords.get(editorId);
    
    if (entry) {
        res.json({ password: entry.password });
    } else {
        res.json({ message: 'Пароль истек' });
    }
});

app.post('/api/admin/editors', authenticateToken, isAdmin, async (req, res) => {
    const { username, password, email, telegramId } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ error: 'Логин и пароль обязательны' });
    }
    
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(password, salt);
    
    db.run(
        `INSERT INTO users (username, password, email, role) VALUES (?, ?, ?, 'editor')`,
        [username, hash, email || null],
        async function(err) {
            if (err) {
                if (err.message.includes('UNIQUE')) {
                    return res.status(400).json({ error: 'Имя пользователя уже занято' });
                }
                console.error('❌ Ошибка создания редактора:', err);
                return res.status(500).json({ error: err.message });
            }
            
            const editorId = this.lastID;
            
            tempPasswords.set(editorId, {
                password,
                expires: Date.now() + 24 * 60 * 60 * 1000
            });
            
            let telegramSent = false;
            if (telegramId?.trim()) {
                try {
                    const { sendCredentialsToUser } = require('./telegramBot');
                    await sendCredentialsToUser(telegramId, username, password);
                    telegramSent = true;
                } catch (e) {
                    console.error('❌ Ошибка Telegram:', e.message);
                }
            }
            
            // Отправка email, если указан
            let emailSent = false;
            if (email?.trim()) {
                const emailHtml = `
                    <div style="font-family: 'Inter', sans-serif; max-width: 600px; margin: 0 auto; background: #0a0c12; padding: 2rem; border-radius: 24px; border: 1px solid #c9a03d;">
                        <h1 style="color: #c9a03d; font-family: 'Orbitron', monospace; text-align: center;">🏛️ Музей компьютерных технологий</h1>
                        <h2 style="color: #e5e9f0; text-align: center;">Ваша заявка одобрена!</h2>
                        <p style="color: #e5e9f0;">Здравствуйте, <strong>${username}</strong>!</p>
                        <p style="color: #e5e9f0;">Ваша заявка на редакторство в музее компьютерных технологий была <strong style="color: #c9a03d;">одобрена</strong>.</p>
                        <div style="background: #12161f; border: 1px solid #2a2f3a; border-radius: 16px; padding: 1.5rem; margin: 1.5rem 0;">
                            <p style="color: #c9a03d; margin: 0 0 0.5rem 0;"><strong>🔑 Данные для входа:</strong></p>
                            <p style="color: #e5e9f0; margin: 0.5rem 0;"><strong>Логин:</strong> <code style="background: #0a0c12; padding: 0.2rem 0.5rem; border-radius: 6px;">${username}</code></p>
                            <p style="color: #e5e9f0; margin: 0.5rem 0;"><strong>Пароль:</strong> <code style="background: #0a0c12; padding: 0.2rem 0.5rem; border-radius: 6px;">${password}</code></p>
                        </div>
                        <p style="color: #e5e9f0; text-align: center;">
                            <a href="${process.env.SITE_URL || 'https://museum-six-umber.vercel.app'}/views/login.html" style="background: transparent; border: 1px solid #c9a03d; color: #c9a03d; padding: 0.8rem 1.5rem; border-radius: 40px; text-decoration: none; display: inline-block; margin-top: 1rem;">🔐 Войти в панель управления</a>
                        </p>
                        <p style="color: #8d9bb0; font-size: 0.8rem; text-align: center; margin-top: 2rem;">Рекомендуем сменить пароль после первого входа.</p>
                    </div>
                `;
                
                emailSent = await sendEmail(email, '✅ Доступ в редакцию музея компьютерных технологий', emailHtml);
            }
            
            res.json({ 
                id: editorId,
                username,
                email: email || null,
                password,
                telegramSent,
                emailSent,
                message: `Редактор создан. ${telegramSent ? 'Данные отправлены в Telegram. ' : ''}${emailSent ? 'Письмо отправлено на почту.' : email ? 'Не удалось отправить письмо.' : ''}`
            });
        }
    );
});

app.put('/api/admin/editors/:id', authenticateToken, isAdmin, (req, res) => {
    const editorId = parseInt(req.params.id);
    const { username, email, password } = req.body;
    
    let updates = [];
    let params = [];
    
    if (username) {
        updates.push('username = ?');
        params.push(username);
    }
    if (email !== undefined) {
        updates.push('email = ?');
        params.push(email || null);
    }
    if (password) {
        const salt = bcrypt.genSaltSync(10);
        const hash = bcrypt.hashSync(password, salt);
        updates.push('password = ?');
        params.push(hash);
        
        tempPasswords.set(editorId, {
            password,
            expires: Date.now() + 24 * 60 * 60 * 1000
        });
    }
    
    if (updates.length === 0) {
        return res.status(400).json({ error: 'Нет данных' });
    }
    
    params.push(editorId);
    
    db.run(
        `UPDATE users SET ${updates.join(', ')} WHERE id = ? AND role = 'editor'`,
        params,
        function(err) {
            if (err) {
                console.error('❌ Ошибка обновления редактора:', err);
                return res.status(500).json({ error: err.message });
            }
            if (this.changes === 0) return res.status(404).json({ error: 'Редактор не найден' });
            
            db.get(`SELECT id, username, email, created_at FROM users WHERE id = ?`, [editorId], (err, editor) => {
                if (err) {
                    console.error('❌ Ошибка получения редактора:', err);
                    return res.status(500).json({ error: err.message });
                }
                
                res.json({ 
                    message: 'Редактор обновлен',
                    editor: {
                        ...editor,
                        password: tempPasswords.get(editorId)?.password || null
                    }
                });
            });
        }
    );
});

app.delete('/api/admin/editors/:id', authenticateToken, isAdmin, (req, res) => {
    const editorId = parseInt(req.params.id);
    
    db.run(`DELETE FROM users WHERE id = ? AND role = 'editor'`, [editorId], function(err) {
        if (err) {
            console.error('❌ Ошибка удаления редактора:', err);
            return res.status(500).json({ error: err.message });
        }
        if (this.changes === 0) return res.status(404).json({ error: 'Редактор не найден' });
        
        tempPasswords.delete(editorId);
        res.json({ message: 'Редактор удален' });
    });
});

// ============================================================================
// ЗАЯВКИ
// ============================================================================

app.get('/api/admin/applications', authenticateToken, isAdmin, (req, res) => {
    db.all(`SELECT * FROM applications ORDER BY created_at DESC`, [], (err, rows) => {
        if (err) {
            console.error('❌ Ошибка загрузки заявок:', err);
            return res.status(500).json({ error: err.message });
        }
        res.json(rows || []);
    });
});

app.get('/api/admin/applications/:id', authenticateToken, isAdmin, (req, res) => {
    const id = req.params.id;
    db.get(`SELECT * FROM applications WHERE id = ?`, [id], (err, row) => {
        if (err) {
            console.error('❌ Ошибка загрузки заявки:', err);
            return res.status(500).json({ error: err.message });
        }
        if (!row) return res.status(404).json({ error: 'Заявка не найдена' });
        res.json(row);
    });
});

app.post('/api/admin/applications/:id/approve', authenticateToken, isAdmin, (req, res) => {
    const applicationId = req.params.id;
    
    // Получаем данные заявки для отправки email
    db.get(`SELECT * FROM applications WHERE id = ?`, [applicationId], async (err, application) => {
        if (err || !application) {
            console.error('❌ Ошибка получения заявки:', err);
            return res.status(500).json({ error: err.message });
        }
        
        // Обновляем статус заявки
        db.run(`UPDATE applications SET status = 'approved' WHERE id = ?`, [applicationId], async function(err) {
            if (err) {
                console.error('❌ Ошибка одобрения заявки:', err);
                return res.status(500).json({ error: err.message });
            }
            
            // Отправляем email уведомление, если есть email
            let emailSent = false;
            if (application.email) {
                const emailHtml = `
                    <div style="font-family: 'Inter', sans-serif; max-width: 600px; margin: 0 auto; background: #0a0c12; padding: 2rem; border-radius: 24px; border: 1px solid #c9a03d;">
                        <h1 style="color: #c9a03d; font-family: 'Orbitron', monospace; text-align: center;">🏛️ Музей компьютерных технологий</h1>
                        <h2 style="color: #e5e9f0; text-align: center;">Ваша заявка одобрена!</h2>
                        <p style="color: #e5e9f0;">Здравствуйте, <strong>${application.full_name}</strong>!</p>
                        <p style="color: #e5e9f0;">Ваша заявка на редакторство в музее компьютерных технологий была <strong style="color: #c9a03d;">одобрена</strong>.</p>
                        <p style="color: #e5e9f0;">В ближайшее время администратор создаст для вас учетную запись и вы получите доступ к панели управления.</p>
                        <p style="color: #8d9bb0; font-size: 0.8rem; text-align: center; margin-top: 2rem;">Следите за уведомлениями.</p>
                    </div>
                `;
                
                emailSent = await sendEmail(application.email, '✅ Ваша заявка одобрена!', emailHtml);
            }
            
            res.json({ 
                message: `Заявка одобрена${emailSent ? ', уведомление отправлено на почту' : ''}`,
                emailSent
            });
        });
    });
});

// ============================================================================
// УПРАВЛЕНИЕ СТИЛЯМИ САЙТА (глобальные настройки)
// ============================================================================

// Получить все настройки стилей (доступно всем)
app.get('/api/site-styles', (req, res) => {
    db.all(`SELECT setting_key, setting_value FROM site_settings ORDER BY setting_key`, [], (err, rows) => {
        if (err) {
            console.error('❌ Ошибка загрузки настроек стилей:', err);
            return res.status(500).json({ error: err.message });
        }
        
        const styles = {};
        rows.forEach(row => {
            styles[row.setting_key] = row.setting_value;
        });
        
        res.json(styles);
    });
});

// Обновить настройки стилей (только для админа)
app.put('/api/admin/site-styles', authenticateToken, isAdmin, (req, res) => {
    const { styles } = req.body;
    const userId = req.user.id;
    
    if (!styles || typeof styles !== 'object') {
        return res.status(400).json({ error: 'Неверный формат данных' });
    }
    
    const updates = [];
    const params = [];
    
    for (const [key, value] of Object.entries(styles)) {
        updates.push(`UPDATE site_settings SET setting_value = ?, updated_at = CURRENT_TIMESTAMP, updated_by = ? WHERE setting_key = ?`);
        params.push(value, userId, key);
    }
    
    if (updates.length === 0) {
        return res.status(400).json({ error: 'Нет данных для обновления' });
    }
    
    // Используем транзакцию для атомарного обновления
    db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        
        let completed = 0;
        let hasError = false;
        
        updates.forEach((query, index) => {
            db.run(query, params.slice(index * 3, (index + 1) * 3), (err) => {
                if (err) {
                    console.error('❌ Ошибка обновления настройки:', err);
                    hasError = true;
                    db.run('ROLLBACK');
                    res.status(500).json({ error: err.message });
                    return;
                }
                
                completed++;
                if (completed === updates.length && !hasError) {
                    db.run('COMMIT', (commitErr) => {
                        if (commitErr) {
                            console.error('❌ Ошибка COMMIT:', commitErr);
                            res.status(500).json({ error: commitErr.message });
                        } else {
                            console.log(`✅ Стили сайта обновлены пользователем ${req.user.username}`);
                            res.json({ 
                                success: true, 
                                message: 'Стили успешно обновлены',
                                styles: styles
                            });
                        }
                    });
                }
            });
        });
    });
});

// Сбросить настройки стилей к значениям по умолчанию (только для админа)
app.post('/api/admin/site-styles/reset', authenticateToken, isAdmin, (req, res) => {
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
    
    const userId = req.user.id;
    const updates = [];
    const params = [];
    
    for (const [key, value] of Object.entries(defaultStyles)) {
        updates.push(`UPDATE site_settings SET setting_value = ?, updated_at = CURRENT_TIMESTAMP, updated_by = ? WHERE setting_key = ?`);
        params.push(value, userId, key);
    }
    
    db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        
        let completed = 0;
        let hasError = false;
        
        updates.forEach((query, index) => {
            db.run(query, params.slice(index * 3, (index + 1) * 3), (err) => {
                if (err) {
                    hasError = true;
                    db.run('ROLLBACK');
                    res.status(500).json({ error: err.message });
                    return;
                }
                
                completed++;
                if (completed === updates.length && !hasError) {
                    db.run('COMMIT', (commitErr) => {
                        if (commitErr) {
                            res.status(500).json({ error: commitErr.message });
                        } else {
                            res.json({ success: true, message: 'Стили сброшены к значениям по умолчанию' });
                        }
                    });
                }
            });
        });
    });
});

app.post('/api/admin/applications/:id/reject', authenticateToken, isAdmin, (req, res) => {
    const applicationId = req.params.id;
    
    // Получаем данные заявки для отправки email
    db.get(`SELECT * FROM applications WHERE id = ?`, [applicationId], async (err, application) => {
        if (err || !application) {
            console.error('❌ Ошибка получения заявки:', err);
            return res.status(500).json({ error: err.message });
        }
        
        db.run(`UPDATE applications SET status = 'rejected' WHERE id = ?`, [applicationId], async function(err) {
            if (err) {
                console.error('❌ Ошибка отклонения заявки:', err);
                return res.status(500).json({ error: err.message });
            }
            
            // Отправляем email уведомление об отказе
            let emailSent = false;
            if (application.email) {
                const emailHtml = `
                    <div style="font-family: 'Inter', sans-serif; max-width: 600px; margin: 0 auto; background: #0a0c12; padding: 2rem; border-radius: 24px; border: 1px solid #c9a03d;">
                        <h1 style="color: #c9a03d; font-family: 'Orbitron', monospace; text-align: center;">🏛️ Музей компьютерных технологий</h1>
                        <h2 style="color: #e5e9f0; text-align: center;">Статус вашей заявки</h2>
                        <p style="color: #e5e9f0;">Здравствуйте, <strong>${application.full_name}</strong>!</p>
                        <p style="color: #e5e9f0;">К сожалению, ваша заявка на редакторство была <strong style="color: #ff4d4d;">отклонена</strong>.</p>
                        <p style="color: #e5e9f0;">Если вы считаете, что это ошибка, вы можете отправить новую заявку.</p>
                        <p style="color: #8d9bb0; font-size: 0.8rem; text-align: center; margin-top: 2rem;">Спасибо за интерес к нашему музею!</p>
                    </div>
                `;
                
                emailSent = await sendEmail(application.email, '❌ Статус вашей заявки', emailHtml);
            }
            
            res.json({ 
                message: `Заявка отклонена${emailSent ? ', уведомление отправлено на почту' : ''}`,
                emailSent
            });
        });
    });
});

// ============================================================================
// ТЕСТОВЫЙ МАРШРУТ
// ============================================================================

app.get('/api/test', (req, res) => {
    res.json({ message: 'Сервер работает', time: new Date().toISOString() });
});

// ============================================================================
// ОБРАБОТКА 404 (должна быть ПОСЛЕ всех маршрутов)
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
    
    try {
        require('./telegramBot');
    } catch (e) {
        console.log('⚠️ Telegram бот не загружен');
    }
});

module.exports = app;