const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const ImageKit = require('imagekit');
const db = require('./database');
const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================================
// КОНФИГУРАЦИЯ
// ============================================================================

const JWT_SECRET = process.env.JWT_SECRET || 'museum-secret-key-2026';
const CACHE_DURATION = 5 * 60 * 1000; // 5 минут

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
}, 60 * 60 * 1000); // Проверка каждый час

// Multer
const storage = multer.memoryStorage();
const upload = multer({ 
    storage,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB
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

// Статические файлы с кэшированием
const staticOptions = {
    maxAge: '1d',
    immutable: true
};

app.use('/css', express.static(path.join(__dirname, 'public', 'css'), {
    ...staticOptions,
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.css')) res.setHeader('Content-Type', 'text/css');
    }
}));

app.use('/js', express.static(path.join(__dirname, 'public', 'js'), {
    ...staticOptions,
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.js')) res.setHeader('Content-Type', 'application/javascript');
    }
}));

app.use('/uploads', express.static(path.join(__dirname, 'uploads'), staticOptions));
app.use('/views', express.static(path.join(__dirname, 'views'), staticOptions));

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

// ============================================================================
// АВТОРИЗАЦИЯ
// ============================================================================

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    
    db.get(`SELECT * FROM users WHERE username = ?`, [username], (err, user) => {
        if (err) return res.status(500).json({ error: 'Ошибка сервера' });
        if (!user) return res.status(401).json({ error: 'Неверный логин или пароль' });
        
        bcrypt.compare(password, user.password, (err, isValid) => {
            if (err || !isValid) return res.status(401).json({ error: 'Неверный логин или пароль' });
            
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
        });
    });
});

app.post('/api/logout', (req, res) => {
    res.clearCookie('token');
    res.json({ success: true });
});

app.get('/api/me', authenticateToken, (req, res) => {
    res.json({ user: req.user });
});

// ============================================================================
// ЭКСПОНАТЫ
// ============================================================================

app.get('/api/exhibits', (req, res) => {
    db.all(`SELECT * FROM exhibits WHERE status = 'approved' ORDER BY year ASC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.get('/api/exhibits/all', authenticateToken, (req, res) => {
    db.all(`SELECT e.*, u.username as creator_name FROM exhibits e 
            LEFT JOIN users u ON e.created_by = u.id 
            ORDER BY e.year ASC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.get('/api/exhibits/:id', (req, res) => {
    const id = req.params.id;
    db.get(`SELECT * FROM exhibits WHERE id = ?`, [id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
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
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
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
    
    // Проверка дубликата
    const existing = await new Promise(resolve => 
        db.get(`SELECT id FROM exhibits WHERE title = ? AND year = ? AND description = ?`, 
            [title, year, description], (err, row) => resolve(row))
    );
    
    if (existing) {
        return res.status(400).json({ error: 'Экспонат уже существует' });
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
                if (err) return res.status(500).json({ error: err.message });
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
        if (err || !oldExhibit) return res.status(404).json({ error: 'Экспонат не найден' });
        
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
                        if (err) return res.status(500).json({ error: err.message });
                        res.json({ message: 'Экспонат обновлен' });
                    }
                );
            } else {
                db.run(
                    `INSERT INTO exhibits (title, year, description, media_path, background_path, status, created_by, original_id) 
                     VALUES (?, ?, ?, ?, ?, 'pending_edit', ?, ?)`,
                    [title, year, description, mediaUrl, backgroundUrl, userId, exhibitId],
                    function(err) {
                        if (err) return res.status(500).json({ error: err.message });
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
        if (err) return res.status(500).json({ error: err.message });
        if (!exhibit) return res.status(404).json({ error: 'Экспонат не найден' });
        
        db.run(`DELETE FROM exhibits WHERE id = ?`, [exhibitId], function(err) {
            if (err) return res.status(500).json({ error: err.message });
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
        if (err) return res.status(500).json({ error: err.message });
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
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.get('/api/admin/pending-edits', authenticateToken, isAdmin, (req, res) => {
    db.all(`SELECT e.*, u.username as creator_name FROM exhibits e 
            LEFT JOIN users u ON e.created_by = u.id 
            WHERE e.status = 'pending_edit' 
            ORDER BY e.created_at DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/admin/approve/:id', authenticateToken, isAdmin, (req, res) => {
    const exhibitId = req.params.id;
    
    db.get(`SELECT * FROM exhibits WHERE id = ?`, [exhibitId], (err, pendingExhibit) => {
        if (err || !pendingExhibit) {
            return res.status(404).json({ error: 'Экспонат не найден' });
        }
        
        if (pendingExhibit.status === 'pending_creation') {
            db.run(`UPDATE exhibits SET status = 'approved' WHERE id = ?`, [exhibitId], function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ message: 'Экспонат одобрен' });
            });
        } else if (pendingExhibit.status === 'pending_edit' && pendingExhibit.original_id) {
            db.run(
                `UPDATE exhibits SET title = ?, year = ?, description = ?, media_path = ?, background_path = ? 
                 WHERE id = ?`,
                [pendingExhibit.title, pendingExhibit.year, pendingExhibit.description, 
                 pendingExhibit.media_path, pendingExhibit.background_path, pendingExhibit.original_id],
                function(err) {
                    if (err) return res.status(500).json({ error: err.message });
                    db.run(`DELETE FROM exhibits WHERE id = ?`, [exhibitId]);
                    res.json({ message: 'Изменения применены' });
                }
            );
        }
    });
});

app.post('/api/admin/reject/:id', authenticateToken, isAdmin, (req, res) => {
    const exhibitId = req.params.id;
    db.run(`UPDATE exhibits SET status = 'rejected' WHERE id = ?`, [exhibitId], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Экспонат отклонен' });
    });
});

// ============================================================================
// РЕДАКТОРЫ (С ВРЕМЕННЫМ ХРАНЕНИЕМ ПАРОЛЕЙ)
// ============================================================================

app.get('/api/admin/editors', authenticateToken, isAdmin, (req, res) => {
    db.all(`SELECT id, username, email, created_at FROM users WHERE role = 'editor'`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        
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
                return res.status(500).json({ error: err.message });
            }
            
            const editorId = this.lastID;
            
            // Сохраняем пароль на 24 часа
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
            
            res.json({ 
                id: editorId,
                username,
                email: email || null,
                password,
                telegramSent,
                message: telegramSent ? 'Редактор создан. Данные отправлены.' : 'Редактор создан.'
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
            if (err) return res.status(500).json({ error: err.message });
            if (this.changes === 0) return res.status(404).json({ error: 'Редактор не найден' });
            
            db.get(`SELECT id, username, email, created_at FROM users WHERE id = ?`, [editorId], (err, editor) => {
                if (err) return res.status(500).json({ error: err.message });
                
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
        if (err) return res.status(500).json({ error: err.message });
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
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.get('/api/admin/applications/:id', authenticateToken, isAdmin, (req, res) => {
    const id = req.params.id;
    db.get(`SELECT * FROM applications WHERE id = ?`, [id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'Заявка не найдена' });
        res.json(row);
    });
});

app.post('/api/admin/applications/:id/approve', authenticateToken, isAdmin, (req, res) => {
    const applicationId = req.params.id;
    db.run(`UPDATE applications SET status = 'approved' WHERE id = ?`, [applicationId], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Заявка одобрена' });
    });
});

app.post('/api/admin/applications/:id/reject', authenticateToken, isAdmin, (req, res) => {
    const applicationId = req.params.id;
    db.run(`UPDATE applications SET status = 'rejected' WHERE id = ?`, [applicationId], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Заявка отклонена' });
    });
});

// ============================================================================
// ТЕСТОВЫЙ МАРШРУТ
// ============================================================================

app.get('/api/test', (req, res) => {
    res.json({ message: 'Сервер работает', time: new Date().toISOString() });
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