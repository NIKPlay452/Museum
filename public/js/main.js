// ============================================================================
// ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ И КЭШ
// ============================================================================

const AppCache = {
    user: null,
    exhibits: [],
    editors: [],
    applications: [],
    lastFetch: {
        exhibits: 0,
        editors: 0,
        applications: 0
    }
};

const CACHE_DURATION = 3000; // 3 секунды

// ============================================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================================

function formatDate(dateString) {
    if (!dateString) return 'неизвестно';
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch {
        return 'неизвестно';
    }
}

function generatePassword(length = 8) {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let password = '';
    for (let i = 0; i < length; i++) {
        password += chars[Math.floor(Math.random() * chars.length)];
    }
    return password;
}

function getStatusText(status) {
    const statusMap = {
        'pending_creation': '⏳ На проверке',
        'pending_edit': '🔄 Изменен',
        'approved': '✅ Одобрен',
        'rejected': '❌ Отклонен'
    };
    return statusMap[status] || status;
}

// ============================================================================
// МЕНЕДЖЕР УВЕДОМЛЕНИЙ
// ============================================================================

const NotificationManager = {
    show(message, type = 'info', duration = 3000) {
        let container = document.getElementById('notification-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'notification-container';
            document.body.appendChild(container);
        }
        
        const colors = {
            success: 'var(--color-primary)',
            error: '#e06c75',
            info: 'var(--color-text-secondary)'
        };
        
        const notification = document.createElement('div');
        notification.className = 'notification';
        notification.style.borderLeftColor = colors[type];
        notification.textContent = message;
        
        container.appendChild(notification);
        
        notification.addEventListener('click', () => {
            notification.style.animation = 'fadeOut 0.2s ease';
            setTimeout(() => notification.remove(), 200);
        });
        
        setTimeout(() => {
            if (notification.parentNode) {
                notification.style.animation = 'fadeOut 0.2s ease';
                setTimeout(() => notification.remove(), 200);
            }
        }, duration);
    }
};

// ============================================================================
// ЗАГРУЗЧИК ФАЙЛОВ
// ============================================================================

class FileUploader {
    constructor(options = {}) {
        this.onUpload = options.onUpload || (() => {});
        this.accept = options.accept || 'image/*,video/*';
        this.maxSize = options.maxSize || 10 * 1024 * 1024;
    }
    
    generateUniqueId() {
        return `upload-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
    
    createUploadArea(containerId, inputName) {
        const container = document.getElementById(containerId);
        if (!container) {
            console.log(`Контейнер с ID ${containerId} не найден`);
            return;
        }
        
        this._createUploadArea(container, inputName);
    }
    
    createUploadAreaFromContainer(container, inputName) {
        if (!container) {
            console.log('Контейнер не найден');
            return;
        }
        
        this._createUploadArea(container, inputName);
    }
    
    _createUploadArea(container, inputName) {
        container.innerHTML = '';
        
        const uniqueId = this.generateUniqueId();
        const fileInputId = `file-${uniqueId}`;
        const previewId = `preview-${uniqueId}`;
        
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.name = inputName;
        fileInput.id = fileInputId;
        fileInput.accept = this.accept;
        fileInput.style.display = 'none';
        
        const uploadArea = document.createElement('div');
        uploadArea.className = 'file-upload-area';
        uploadArea.setAttribute('data-preview-id', previewId);
        
        uploadArea.innerHTML = `
            <label for="${fileInputId}" class="upload-label">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#c9a03d" stroke-width="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="17 8 12 3 7 8"/>
                    <line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                <p>Нажмите для выбора файла</p>
                <small>Макс. 10MB</small>
            </label>
            <div class="upload-preview" id="${previewId}" style="display: none;"></div>
            <button class="clear-file-btn" style="display: none; margin-top: 10px; padding: 5px 10px; background: #e06c75; border: none; border-radius: 20px; color: white; cursor: pointer;">🗑️ Очистить</button>
        `;
        
        uploadArea.appendChild(fileInput);
        container.appendChild(uploadArea);
        
        const preview = document.getElementById(previewId);
        const label = uploadArea.querySelector('.upload-label');
        const clearBtn = uploadArea.querySelector('.clear-file-btn');
        
        if (!preview) {
            console.error('Preview элемент не найден!', previewId);
            return;
        }
        
        let currentFile = null;
        
        const updateUIAfterFileSelect = (file) => {
            currentFile = file;
            clearBtn.style.display = 'block';
            
            preview.innerHTML = '';
            
            if (file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    const img = document.createElement('img');
                    img.src = e.target.result;
                    img.alt = 'Preview';
                    img.style.maxWidth = '100%';
                    img.style.maxHeight = '150px';
                    img.style.borderRadius = '8px';
                    
                    const fileName = document.createElement('p');
                    fileName.textContent = file.name;
                    fileName.style.marginTop = '5px';
                    fileName.style.fontSize = '0.8rem';
                    fileName.style.color = 'var(--color-primary)';
                    
                    preview.appendChild(img);
                    preview.appendChild(fileName);
                    preview.style.display = 'block';
                    label.style.display = 'none';
                };
                reader.readAsDataURL(file);
            } else if (file.type.startsWith('video/')) {
                const video = document.createElement('video');
                video.src = URL.createObjectURL(file);
                video.controls = true;
                video.style.maxWidth = '100%';
                video.style.maxHeight = '150px';
                
                const fileName = document.createElement('p');
                fileName.textContent = file.name;
                fileName.style.marginTop = '5px';
                fileName.style.fontSize = '0.8rem';
                fileName.style.color = 'var(--color-primary)';
                
                preview.appendChild(video);
                preview.appendChild(fileName);
                preview.style.display = 'block';
                label.style.display = 'none';
            }
            
            this.onUpload(file, inputName);
        };
        
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            if (file.size > this.maxSize) {
                NotificationManager.show(`Файл слишком большой (макс. ${this.maxSize / 1024 / 1024}MB)`, 'error');
                fileInput.value = '';
                return;
            }
            
            updateUIAfterFileSelect(file);
        });
        
        clearBtn.addEventListener('click', () => {
            currentFile = null;
            fileInput.value = '';
            preview.innerHTML = '';
            preview.style.display = 'none';
            label.style.display = 'flex';
            clearBtn.style.display = 'none';
            this.onUpload(null, inputName);
        });
        
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.style.borderColor = 'var(--color-primary)';
            uploadArea.style.background = 'rgba(201, 160, 61, 0.1)';
        });
        
        uploadArea.addEventListener('dragleave', (e) => {
            e.preventDefault();
            uploadArea.style.borderColor = 'var(--color-border)';
            uploadArea.style.background = 'var(--color-bg-dark)';
        });
        
        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.style.borderColor = 'var(--color-border)';
            uploadArea.style.background = 'var(--color-bg-dark)';
            
            const file = e.dataTransfer.files[0];
            if (!file) return;
            
            if (file.size > this.maxSize) {
                NotificationManager.show(`Файл слишком большой (макс. ${this.maxSize / 1024 / 1024}MB)`, 'error');
                return;
            }
            
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);
            fileInput.files = dataTransfer.files;
            
            updateUIAfterFileSelect(file);
        });
    }
}

// ============================================================================
// МОДАЛЬНЫЕ ОКНА
// ============================================================================

function createModal(options = {}) {
    const { title = '', content = '', onClose = () => {}, width = '600px' } = options;
    
    document.querySelectorAll('.modal-overlay').forEach(m => m.remove());
    
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    
    const modal = document.createElement('div');
    modal.className = 'modal-content';
    if (width) modal.style.width = width;
    
    modal.innerHTML = `
        <button class="modal-close">&times;</button>
        <h2 style="color: var(--color-primary); margin-bottom: 1.5rem; font-size: 1.5rem;">${title}</h2>
        <div class="modal-body">${content}</div>
    `;
    
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    const closeBtn = modal.querySelector('.modal-close');
    
    const closeModal = () => {
        overlay.remove();
        onClose();
    };
    
    closeBtn.addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeModal();
    });
    
    return { close: closeModal };
}

// ============================================================================
// API ЗАПРОСЫ
// ============================================================================

async function fetchAPI(url, options = {}) {
    try {
        const response = await fetch(url, {
            headers: { 'Content-Type': 'application/json', ...options.headers },
            credentials: 'include',
            ...options
        });
        
        if (response.status === 401) {
            throw new Error('unauthorized');
        }
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Ошибка запроса');
        }
        
        return data;
    } catch (error) {
        if (error.message !== 'unauthorized') {
            NotificationManager.show(error.message, 'error');
        }
        throw error;
    }
}

async function fetchWithCache(url, cacheKey, forceRefresh = false) {
    if (!cacheKey) return fetchAPI(url);
    
    const now = Date.now();
    
    if (!forceRefresh && 
        AppCache[cacheKey] && 
        AppCache.lastFetch && 
        AppCache.lastFetch[cacheKey] && 
        (now - AppCache.lastFetch[cacheKey] < CACHE_DURATION)) {
        return AppCache[cacheKey];
    }
    
    try {
        const data = await fetchAPI(url);
        AppCache[cacheKey] = data;
        if (AppCache.lastFetch) {
            AppCache.lastFetch[cacheKey] = now;
        }
        return data;
    } catch (error) {
        return AppCache[cacheKey] || [];
    }
}

function clearCache(key = null) {
    if (!AppCache || !AppCache.lastFetch) return;
    
    if (key && typeof key === 'string') {
        if (AppCache.hasOwnProperty(key)) {
            AppCache[key] = null;
        }
        if (AppCache.lastFetch.hasOwnProperty(key)) {
            AppCache.lastFetch[key] = 0;
        }
        return;
    }
    
    const cacheKeys = ['exhibits', 'editors', 'applications'];
    cacheKeys.forEach(k => {
        if (AppCache.hasOwnProperty(k)) {
            AppCache[k] = null;
        }
        if (AppCache.lastFetch && AppCache.lastFetch.hasOwnProperty(k)) {
            AppCache.lastFetch[k] = 0;
        }
    });
}

// ============================================================================
// МОДАЛЬНОЕ ОКНО ПОДТВЕРЖДЕНИЯ (для выхода и других действий)
// ============================================================================

window.showConfirmModal = (options) => {
    const { title, message, onConfirm, onCancel, confirmText = 'Да', cancelText = 'Нет' } = options;
    
    const modalContent = `
        <div style="text-align: center;">
            <h3 style="margin-bottom: 1rem; color: var(--color-primary);">${title}</h3>
            <p style="margin-bottom: 1.5rem; color: var(--color-text-secondary);">${message}</p>
            <div style="display: flex; gap: 1rem; justify-content: center;">
                <button class="submit-btn" id="confirm-yes" style="width: auto; padding: 0.5rem 1.5rem;">${confirmText}</button>
                <button class="admin-btn" id="confirm-no" style="width: auto; padding: 0.5rem 1.5rem;">${cancelText}</button>
            </div>
        </div>
    `;
    
    const modal = createModal({
        title: '',
        content: modalContent,
        width: '400px'
    });
    
    document.getElementById('confirm-yes').addEventListener('click', () => {
        modal.close();
        if (onConfirm) onConfirm();
    });
    
    document.getElementById('confirm-no').addEventListener('click', () => {
        modal.close();
        if (onCancel) onCancel();
    });
};

// ============================================================================
// ФУНКЦИЯ ВЫХОДА (без alert)
// ============================================================================

window.logout = async function() {
    showConfirmModal({
        title: 'Выход из системы',
        message: 'Вы уверены, что хотите выйти?',
        confirmText: 'Выйти',
        cancelText: 'Отмена',
        onConfirm: async () => {
            try {
                await fetch('/api/logout', { 
                    method: 'POST', 
                    credentials: 'include',
                });
                NotificationManager.show('Вы вышли из системы', 'info');
                window.location.href = '/views/index.html';
            } catch (error) {
                console.error('Ошибка при выходе:', error);
                window.location.href = '/views/index.html';
            }
        }
    });
};

// ============================================================================
// АВТОРИЗАЦИЯ И НАВИГАЦИЯ
// ============================================================================

async function updateAuthUI() {
    const loginBtn = document.getElementById('loginBtn');
    const userBadge = document.getElementById('userBadge');
    const logoutBtn = document.getElementById('logoutBtn');
    
    if (!loginBtn) return;
    
    try {
        const response = await fetch('/api/me', { credentials: 'include' });
        
        if (response.status === 401) {
            if (loginBtn) {
                loginBtn.textContent = 'Вход';
                loginBtn.href = '/views/login.html';
                loginBtn.classList.remove('logged-in');
            }
            if (userBadge) userBadge.style.display = 'none';
            if (logoutBtn) logoutBtn.style.display = 'none';
            AppCache.user = null;
            return;
        }
        
        const data = await response.json();
        AppCache.user = data.user;
        
        if (data.user) {
            if (loginBtn) {
                loginBtn.textContent = 'Панель';
                loginBtn.href = '/views/admin-panel.html';
                loginBtn.classList.add('logged-in');
            }
            if (userBadge) {
                userBadge.textContent = `${data.user.username}`;
                userBadge.style.display = 'flex';
            }
            if (logoutBtn) logoutBtn.style.display = 'block';
        }
    } catch (error) {
        console.error('Ошибка авторизации:', error);
    }
}

// ============================================================================
// ИНИЦИАЛИЗАЦИЯ НАВИГАЦИИ
// ============================================================================

function initNavigation() {
    const header = document.querySelector('.site-header');
    if (!header) return;
    
    // Динамически создаем навигацию, если она не задана в HTML
    if (!document.querySelector('.nav-container')) {
        header.innerHTML = `
            <div class="nav-container">
                <div class="logo">
                    <a href="/views/index.html">⌨️ MUSEUM TECH</a>
                </div>
                <div class="nav-links">
                    <a href="/views/index.html">Главная</a>
                    <a href="/views/about.html">О музее</a>
                </div>
                <div class="header-actions">
                    <a href="/views/login.html" class="btn-outline" id="loginBtn">Вход</a>
                    <span class="user-badge" id="userBadge" style="display: none;"></span>
                    <button id="logoutBtn" class="btn-outline" style="display: none;">Выход</button>
                </div>
            </div>
        `;
        
        // Переназначаем обработчики
        const newLogoutBtn = document.getElementById('logoutBtn');
        if (newLogoutBtn) newLogoutBtn.addEventListener('click', logout);
    }
    
    updateAuthUI();
}

// ============================================================================
// ИНИЦИАЛИЗАЦИЯ ПРИ ЗАГРУЗКЕ СТРАНИЦЫ
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    window.addEventListener('authChange', updateAuthUI);
    
    // Для страницы админ-панели проверяем авторизацию
    const currentPage = window.location.pathname;
    if (currentPage.includes('admin-panel.html')) {
        fetchAPI('/api/me').catch(() => {
            window.location.href = '/views/login.html';
        });
    }
});

// ============================================================================
// ЭКСПОРТ
// ============================================================================

window.NotificationManager = NotificationManager;
window.FileUploader = FileUploader;
window.createModal = createModal;
window.fetchAPI = fetchAPI;
window.fetchWithCache = fetchWithCache;
window.clearCache = clearCache;
window.updateAuthUI = updateAuthUI;
window.formatDate = formatDate;
window.generatePassword = generatePassword;
window.getStatusText = getStatusText;