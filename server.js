const express = require('express');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const db = require('./database');
const app = express();
const PORT = 3000;

// Настройка multer для загрузки файлов
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        let uploadPath = 'public/uploads/';
        if (file.fieldname === 'media') {
            uploadPath += 'exhibits/';
        } else if (file.fieldname === 'background') {
            uploadPath += 'backgrounds/';
        }
        fs.mkdirSync(uploadPath, { recursive: true });
        cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: 'your-secret-key-museum',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }
}));
app.use(express.static('public'));
app.use('/views', express.static('views'));

// Middleware для проверки авторизации
const isAuthenticated = (req, res, next) => {
    if (req.session.user) {
        next();
    } else {
        res.status(401).json({ error: 'Не авторизован' });
    }
};

const isAdmin = (req, res, next) => {
    if (req.session.user && req.session.user.role === 'admin') {
        next();
    } else {
        res.status(403).json({ error: 'Доступ запрещен' });
    }
};

// Маршруты для авторизации
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    
    db.get(`SELECT * FROM users WHERE username = ?`, [username], (err, user) => {
        if (err) return res.status(500).json({ error: 'Ошибка сервера' });
        if (!user) return res.status(401).json({ error: 'Неверный логин или пароль' });
        
        bcrypt.compare(password, user.password, (err, isValid) => {
            if (err || !isValid) return res.status(401).json({ error: 'Неверный логин или пароль' });
            
            req.session.user = {
                id: user.id,
                username: user.username,
                role: user.role
            };
            
            res.json({ 
                success: true, 
                role: user.role,
                message: 'Вход выполнен'
            });
        });
    });
});

app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

app.get('/api/me', (req, res) => {
    if (req.session.user) {
        res.json({ user: req.session.user });
    } else {
        res.status(401).json({ error: 'Не авторизован' });
    }
});

// Маршруты для экспонатов
app.get('/api/exhibits', (req, res) => {
    db.all(`SELECT * FROM exhibits WHERE status = 'approved' ORDER BY year ASC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.get('/api/exhibits/all', isAuthenticated, (req, res) => {
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

app.get('/api/exhibits/status/:status', isAuthenticated, (req, res) => {
    const status = req.params.status;
    db.all(`SELECT e.*, u.username as creator_name FROM exhibits e 
            LEFT JOIN users u ON e.created_by = u.id 
            WHERE e.status = ? 
            ORDER BY e.created_at DESC`, [status], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/exhibits', isAuthenticated, upload.fields([{ name: 'media', maxCount: 1 }, { name: 'background', maxCount: 1 }]), (req, res) => {
    const { title, year, description } = req.body;
    const userId = req.session.user.id;
    
    let mediaPath = null;
    let backgroundPath = null;
    
    if (req.files && req.files['media']) {
        mediaPath = '/uploads/exhibits/' + req.files['media'][0].filename;
    }
    if (req.files && req.files['background']) {
        backgroundPath = '/uploads/backgrounds/' + req.files['background'][0].filename;
    }
    
    const status = req.session.user.role === 'admin' ? 'approved' : 'pending_creation';
    
    db.run(
        `INSERT INTO exhibits (title, year, description, media_path, background_path, status, created_by) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [title, year, description, mediaPath, backgroundPath, status, userId],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ 
                id: this.lastID, 
                status: status,
                message: status === 'approved' ? 'Экспонат создан' : 'Экспонат отправлен на проверку'
            });
        }
    );
});

app.put('/api/exhibits/:id', isAuthenticated, upload.fields([{ name: 'media', maxCount: 1 }, { name: 'background', maxCount: 1 }]), (req, res) => {
    const exhibitId = req.params.id;
    const { title, year, description } = req.body;
    const userId = req.session.user.id;
    
    db.get(`SELECT * FROM exhibits WHERE id = ?`, [exhibitId], (err, oldExhibit) => {
        if (err || !oldExhibit) return res.status(404).json({ error: 'Экспонат не найден' });
        
        let mediaPath = oldExhibit.media_path;
        let backgroundPath = oldExhibit.background_path;
        
        if (req.files && req.files['media']) {
            mediaPath = '/uploads/exhibits/' + req.files['media'][0].filename;
        }
        if (req.files && req.files['background']) {
            backgroundPath = '/uploads/backgrounds/' + req.files['background'][0].filename;
        }
        
        if (req.session.user.role === 'admin') {
            db.run(
                `UPDATE exhibits SET title = ?, year = ?, description = ?, media_path = ?, background_path = ?, status = 'approved' WHERE id = ?`,
                [title, year, description, mediaPath, backgroundPath, exhibitId],
                function(err) {
                    if (err) return res.status(500).json({ error: err.message });
                    res.json({ message: 'Экспонат обновлен' });
                }
            );
        } else {
            db.run(
                `INSERT INTO exhibits (title, year, description, media_path, background_path, status, created_by, original_id) 
                 VALUES (?, ?, ?, ?, ?, 'pending_edit', ?, ?)`,
                [title, year, description, mediaPath, backgroundPath, userId, exhibitId],
                function(err) {
                    if (err) return res.status(500).json({ error: err.message });
                    res.json({ message: 'Изменения отправлены на проверку' });
                }
            );
        }
    });
});

// Удаление экспоната (только для админа)
app.delete('/api/admin/exhibits/:id', isAdmin, (req, res) => {
    const exhibitId = req.params.id;
    
    db.get(`SELECT media_path, background_path FROM exhibits WHERE id = ?`, [exhibitId], (err, exhibit) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!exhibit) return res.status(404).json({ error: 'Экспонат не найден' });
        
        if (exhibit.media_path) {
            const mediaPath = path.join(__dirname, 'public', exhibit.media_path);
            if (fs.existsSync(mediaPath)) fs.unlinkSync(mediaPath);
        }
        if (exhibit.background_path) {
            const bgPath = path.join(__dirname, 'public', exhibit.background_path);
            if (fs.existsSync(bgPath)) fs.unlinkSync(bgPath);
        }
        
        db.run(`DELETE FROM exhibits WHERE id = ?`, [exhibitId], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: 'Экспонат успешно удален' });
        });
    });
});

// Проверка на дубликат
app.post('/api/exhibits/check-duplicate', isAuthenticated, (req, res) => {
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

// Маршруты для админа (проверка экспонатов)
app.get('/api/admin/pending-creations', isAdmin, (req, res) => {
    db.all(`SELECT e.*, u.username as creator_name FROM exhibits e 
            LEFT JOIN users u ON e.created_by = u.id 
            WHERE e.status = 'pending_creation' 
            ORDER BY e.created_at DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.get('/api/admin/pending-edits', isAdmin, (req, res) => {
    db.all(`SELECT e.*, u.username as creator_name FROM exhibits e 
            LEFT JOIN users u ON e.created_by = u.id 
            WHERE e.status = 'pending_edit' 
            ORDER BY e.created_at DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/admin/approve/:id', isAdmin, (req, res) => {
    const exhibitId = req.params.id;
    
    db.get(`SELECT * FROM exhibits WHERE id = ?`, [exhibitId], (err, pendingExhibit) => {
        if (err || !pendingExhibit) {
            return res.status(404).json({ error: 'Экспонат не найден' });
        }
        
        if (pendingExhibit.status === 'pending_creation') {
            // Просто одобряем новый экспонат
            db.run(`UPDATE exhibits SET status = 'approved' WHERE id = ?`, [exhibitId], function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ message: 'Экспонат одобрен и опубликован' });
            });
            
        } else if (pendingExhibit.status === 'pending_edit' && pendingExhibit.original_id) {
            // Обновляем оригинальный экспонат данными из правки
            db.run(
                `UPDATE exhibits SET 
                    title = ?, 
                    year = ?, 
                    description = ?, 
                    media_path = ?, 
                    background_path = ?, 
                    status = 'approved' 
                 WHERE id = ?`,
                [
                    pendingExhibit.title, 
                    pendingExhibit.year, 
                    pendingExhibit.description, 
                    pendingExhibit.media_path, 
                    pendingExhibit.background_path, 
                    pendingExhibit.original_id
                ],
                function(err) {
                    if (err) return res.status(500).json({ error: err.message });
                    
                    // Удаляем временную правку
                    db.run(`DELETE FROM exhibits WHERE id = ?`, [exhibitId], function(err) {
                        if (err) {
                            console.error('Ошибка при удалении временной правки:', err);
                        }
                    });
                    
                    res.json({ message: 'Изменения применены к экспонату' });
                }
            );
        }
    });
});

app.post('/api/admin/reject/:id', isAdmin, (req, res) => {
    const exhibitId = req.params.id;
    db.run(`UPDATE exhibits SET status = 'rejected' WHERE id = ?`, [exhibitId], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Экспонат отклонен' });
    });
});

// Маршруты для работы с редакторами
app.get('/api/admin/editors', isAdmin, (req, res) => {
    db.all(`SELECT id, username, created_at FROM users WHERE role = 'editor'`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.delete('/api/admin/editors/:id', isAdmin, (req, res) => {
    const editorId = req.params.id;
    db.run(`DELETE FROM users WHERE id = ? AND role = 'editor'`, [editorId], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Редактор удален' });
    });
});

app.post('/api/admin/editors', isAdmin, async (req, res) => {
    const { username, password, email, telegramId } = req.body;
    
    if (!username || !password) return res.status(400).json({ error: 'Логин и пароль обязательны' });
    
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(password, salt);
    
    db.run(
        `INSERT INTO users (username, password, role) VALUES (?, ?, 'editor')`,
        [username, hash],
        async function(err) {
            if (err) {
                if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'Имя пользователя уже занято' });
                return res.status(500).json({ error: err.message });
            }
            
            const editorId = this.lastID;
            let telegramSent = false;
            
            if (telegramId) {
                try {
                    const { sendCredentialsToUser } = require('./telegramBot');
                    await sendCredentialsToUser(telegramId, username, password);
                    telegramSent = true;
                } catch (telegramError) {
                    console.error('Ошибка отправки через Telegram:', telegramError.message);
                }
            }
            
            res.json({ 
                id: editorId,
                message: telegramSent 
                    ? 'Редактор создан. Данные отправлены в Telegram.' 
                    : 'Редактор создан, но Telegram не отправлен.',
                telegramSent: telegramSent
            });
        }
    );
});

// Маршруты для заявок
app.get('/api/admin/applications', isAdmin, (req, res) => {
    db.all(`SELECT * FROM applications ORDER BY created_at DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.get('/api/admin/applications/:id', isAdmin, (req, res) => {
    const id = req.params.id;
    db.get(`SELECT * FROM applications WHERE id = ?`, [id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'Заявка не найдена' });
        res.json(row);
    });
});

app.post('/api/admin/applications/:id/approve', isAdmin, (req, res) => {
    const applicationId = req.params.id;
    db.run(`UPDATE applications SET status = 'approved' WHERE id = ?`, [applicationId], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Заявка одобрена', id: applicationId });
    });
});

app.post('/api/admin/applications/:id/reject', isAdmin, (req, res) => {
    const applicationId = req.params.id;
    db.run(`UPDATE applications SET status = 'rejected' WHERE id = ?`, [applicationId], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Заявка отклонена', id: applicationId });
    });
});

// Запуск сервера
app.listen(PORT, () => {
    console.log(`✅ Сервер запущен на http://localhost:${PORT}`);
    console.log(`🌐 Главная страница: http://localhost:${PORT}/views/index.html`);
    console.log(`🔑 Тестовый админ: admin / admin123`);
    
    try {
        require('./telegramBot');
        console.log('✅ Telegram бот загружен');
    } catch (error) {
        console.log('⚠️ Ошибка при загрузке Telegram бота:', error.message);
    }
});

module.exports = app;