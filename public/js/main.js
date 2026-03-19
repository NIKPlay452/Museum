// ========== ГЛОБАЛЬНЫЙ КЭШ ==========
const appCache = {
  user: null,
  exhibits: [],
  lastFetch: {
    user: 0,
    exhibits: 0
  }
};

const CACHE_TTL = 5 * 60 * 1000; // 5 минут

// ========== УПРАВЛЕНИЕ КЭШЕМ ==========
function isCacheValid(key) {
  return Date.now() - appCache.lastFetch[key] < CACHE_TTL;
}

function clearCache(key) {
  if (key) {
    appCache[key] = null;
    appCache.lastFetch[key] = 0;
  } else {
    appCache.user = null;
    appCache.exhibits = [];
    appCache.lastFetch.user = 0;
    appCache.lastFetch.exhibits = 0;
  }
}

// ========== АВТОРИЗАЦИЯ ==========
async function checkAuth() {
  if (appCache.user && isCacheValid('user')) {
    return appCache.user;
  }
  
  try {
    const response = await fetch('/api/me', {
      credentials: 'include',
      signal: AbortSignal.timeout(5000)
    });
    
    if (response.status === 401) return null;
    
    const data = await response.json();
    appCache.user = data.user || null;
    appCache.lastFetch.user = Date.now();
    return appCache.user;
  } catch (error) {
    console.error('Ошибка проверки авторизации:', error);
    return null;
  }
}

async function updateAuthUI() {
  const loginBtn = document.querySelector('.btn-login');
  if (!loginBtn) return;
  
  const user = await checkAuth();
  
  if (user) {
    loginBtn.textContent = '👤 Аккаунт';
    loginBtn.href = '/views/admin-panel.html';
    loginBtn.classList.add('logged-in');
  } else {
    loginBtn.textContent = 'Вход';
    loginBtn.href = '/views/login.html';
    loginBtn.classList.remove('logged-in');
  }
}

// ========== НАВИГАЦИЯ ==========
function updateNavigation() {
  const header = document.querySelector('.site-header');
  if (!header || document.querySelector('.home-link')) return;
  
  const homeLink = document.createElement('a');
  homeLink.href = '/views/index.html';
  homeLink.className = 'home-link';
  homeLink.innerHTML = '🏠 <span>Главная</span>';
  header.insertBefore(homeLink, header.firstChild);
}

// ========== УВЕДОМЛЕНИЯ ==========
const NotificationManager = {
  show(message, type = 'info', duration = 3000) {
    let container = document.getElementById('notification-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'notification-container';
      document.body.appendChild(container);
    }
    
    const notification = document.createElement('div');
    const bgColor = type === 'success' ? '#4ecdc4' : 
                   type === 'error' ? '#ff6b6b' : '#ffe66d';
    
    notification.style.cssText = `
      background: ${bgColor};
      color: ${type === 'info' ? '#000' : '#fff'};
      padding: 12px 20px;
      border-radius: 8px;
      font-weight: bold;
      box-shadow: 0 4px 15px rgba(0,0,0,0.3);
      animation: slideIn 0.3s ease;
      cursor: pointer;
      margin-bottom: 10px;
      word-break: break-word;
      opacity: 0.95;
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

// ========== ЗАГРУЗЧИК ФАЙЛОВ ==========
class FileUploader {
  constructor(options = {}) {
    this.onUpload = options.onUpload || (() => {});
    this.accept = options.accept || 'image/*,video/*';
    this.maxSize = options.maxSize || 10 * 1024 * 1024;
  }
  
  createUploadArea(containerId, previewId, inputName) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.name = inputName;
    fileInput.accept = this.accept;
    fileInput.style.display = 'none';
    
    const uploadArea = document.createElement('div');
    uploadArea.className = 'file-upload-area';
    uploadArea.innerHTML = `
      <div class="upload-placeholder">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#4ecdc4" stroke-width="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="17 8 12 3 7 8"/>
          <line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
        <p>Нажмите для загрузки</p>
        <small>Макс. 10MB</small>
      </div>
      <div class="upload-preview" id="${previewId}" style="display: none;"></div>
    `;
    
    uploadArea.appendChild(fileInput);
    uploadArea.addEventListener('click', () => fileInput.click());
    
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      if (file.size > this.maxSize) {
        NotificationManager.show(`Файл слишком большой. Максимум ${this.maxSize/1024/1024}MB`, 'error');
        return;
      }
      
      const preview = document.getElementById(previewId);
      const placeholder = uploadArea.querySelector('.upload-placeholder');
      
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => {
          preview.innerHTML = `<img src="${e.target.result}" alt="Preview" loading="lazy">`;
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
        video.preload = 'metadata';
        
        preview.innerHTML = '';
        preview.appendChild(video);
        preview.style.display = 'block';
        placeholder.style.display = 'none';
      }
      
      this.onUpload(file, inputName);
    });
    
    container.appendChild(uploadArea);
  }
}

// ========== МОДАЛЬНЫЕ ОКНА ==========
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
    <h2 style="color: #4ecdc4; margin-bottom: 20px;">${title}</h2>
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

// ========== API ЗАПРОСЫ ==========
async function fetchAPI(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  
  try {
    const response = await fetch(url, {
      headers: { 'Content-Type': 'application/json', ...options.headers },
      credentials: 'include',
      signal: controller.signal,
      ...options
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || `Ошибка ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    if (error.name === 'AbortError') {
      NotificationManager.show('Превышено время ожидания', 'error');
    } else {
      NotificationManager.show(error.message, 'error');
    }
    throw error;
  }
}

// ========== ИНИЦИАЛИЗАЦИЯ ==========
document.addEventListener('DOMContentLoaded', () => {
  updateNavigation();
  updateAuthUI();
  
  window.addEventListener('authChange', () => {
    clearCache('user');
    updateAuthUI();
  });
  
  if ('loading' in HTMLImageElement.prototype) {
    const images = document.querySelectorAll('img[loading="lazy"]');
    images.forEach(img => { img.loading = 'lazy'; });
  }
  
  const currentPage = window.location.pathname;
  if (currentPage.includes('admin-panel.html')) {
    checkAuth().then(user => {
      if (!user) window.location.href = '/views/login.html';
    });
  }
});

// ========== ЭКСПОРТ ==========
window.NotificationManager = NotificationManager;
window.FileUploader = FileUploader;
window.createModal = createModal;
window.fetchAPI = fetchAPI;
window.updateAuthUI = updateAuthUI;
window.clearCache = clearCache;