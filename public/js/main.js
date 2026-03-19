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
            success: '#4ecdc4',
            error: '#ff6b6b',
            info: '#ffe66d'
        };
        
        const notification = document.createElement('div');
        notification.style.cssText = `
            background: ${colors[type]};
            color: ${type === 'info' ? '#000' : '#fff'};
            padding: 12px 20px;
            border-radius: 8px;
            font-weight: bold;
            box-shadow: 0 4px 15px rgba(0,0,0,0.3);
            animation: slideIn 0.3s ease;
            cursor: pointer;
            margin-bottom: 10px;
            word-break: break-word;
            font-size: 0.95rem;
            z-index: 10000;
        `;
        notification.textContent = message;
        
        container.appendChild(notification);
        
        notification.addEventListener('click', () => {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        });
        
        setTimeout(() => {
            if (notification.parentNode) {
                notification.style.animation = 'slideOut 0.3s ease';
                setTimeout(() => notification.remove(), 300);
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
        console.error(`Контейнер с ID ${containerId} не найден`);
        return;
    }
    
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
    uploadArea.innerHTML = `
        <label for="${fileInputId}" class="upload-placeholder" style="cursor: pointer; width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center;">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#4ecdc4" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            <p>Нажмите для загрузки</p>
            <small>Макс. 10MB</small>
        </label>
        <div class="upload-preview" id="${previewId}" style="display: none;"></div>
    `;
    
    uploadArea.appendChild(fileInput);
    
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        if (file.size > this.maxSize) {
            NotificationManager.show(`Файл слишком большой`, 'error');
            return;
        }
        
        const preview = document.getElementById(previewId);
        const placeholder = uploadArea.querySelector('.upload-placeholder');
        
        if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (e) => {
                preview.innerHTML = `<img src="${e.target.result}" alt="Preview" style="max-width: 100%; max-height: 150px;">`;
                preview.style.display = 'block';
                placeholder.style.display = 'none';
            };
            reader.readAsDataURL(file);
        } else if (file.type.startsWith('video/')) {
            const video = document.createElement('video');
            video.src = URL.createObjectURL(file);
            video.controls = true;
            video.style.maxWidth = '100%';
            video.style.maxHeight = '150px';
            
            preview.innerHTML = '';
            preview.appendChild(video);
            preview.style.display = 'block';
            placeholder.style.display = 'none';
        }
        
        this.onUpload(file, inputName);
    });
    
    container.innerHTML = ''; // Очищаем контейнер перед добавлением
    container.appendChild(uploadArea);
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
    modal.style.width = width;
    
    modal.innerHTML = `
        <button class="modal-close" aria-label="Закрыть">&times;</button>
        <h2 style="color: #4ecdc4; margin-bottom: 15px; font-size: 1.3rem;">${title}</h2>
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

// ============================================================================
// ОЧИСТКА КЭША (АБСОЛЮТНО НАДЕЖНАЯ ВЕРСИЯ)
// ============================================================================

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
    
    // Очищаем все кэши
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
// АВТОРИЗАЦИЯ
// ============================================================================

async function updateAuthUI() {
    const loginBtn = document.querySelector('.btn-login');
    if (!loginBtn) return;
    
    try {
        const response = await fetch('/api/me', {
            credentials: 'include'
        });
        
        if (response.status === 401) {
            loginBtn.textContent = 'Вход';
            loginBtn.href = '/views/login.html';
            loginBtn.classList.remove('logged-in');
            AppCache.user = null;
            return;
        }
        
        const data = await response.json();
        AppCache.user = data.user;
        
        if (data.user) {
            loginBtn.textContent = '👤 Аккаунт';
            loginBtn.href = '/views/admin-panel.html';
            loginBtn.classList.add('logged-in');
        } else {
            loginBtn.textContent = 'Вход';
            loginBtn.href = '/views/login.html';
            loginBtn.classList.remove('logged-in');
        }
    } catch (error) {
        console.error('Ошибка авторизации:', error);
        loginBtn.textContent = 'Вход';
        loginBtn.href = '/views/login.html';
        loginBtn.classList.remove('logged-in');
    }
}

// ============================================================================
// НАВИГАЦИЯ
// ============================================================================

function updateNavigation() {
    const header = document.querySelector('.site-header');
    if (!header) return;
    
    if (!document.querySelector('.home-link')) {
        const homeLink = document.createElement('a');
        homeLink.href = '/views/index.html';
        homeLink.className = 'home-link';
        homeLink.innerHTML = '🏠 <span>Главная</span>';
        header.insertBefore(homeLink, header.firstChild);
    }
}

// ============================================================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    updateNavigation();
    updateAuthUI();
    window.addEventListener('authChange', updateAuthUI);
    
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