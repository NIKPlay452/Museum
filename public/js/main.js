// Проверка авторизации и обновление UI
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
      return;
    }
    
    const data = await response.json();
    
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
    console.error('Ошибка проверки авторизации:', error);
    loginBtn.textContent = 'Вход';
    loginBtn.href = '/views/login.html';
    loginBtn.classList.remove('logged-in');
  }
}

// Обновляем навигацию
function updateNavigation() {
  const header = document.querySelector('.site-header');
  if (!header) return;
  
  if (!document.querySelector('.home-link')) {
    const homeLink = document.createElement('a');
    homeLink.href = '/views/index.html';
    homeLink.className = 'home-link';
    homeLink.innerHTML = '🏠 Главная';
    header.insertBefore(homeLink, header.firstChild);
  }
}

// Глобальный объект для уведомлений
const NotificationManager = {
  show(message, type = 'info', duration = 3000) {
    let container = document.getElementById('notification-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'notification-container';
      container.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 9999;
        display: flex;
        flex-direction: column;
        gap: 10px;
      `;
      document.body.appendChild(container);
    }
    
    const notification = document.createElement('div');
    notification.style.cssText = `
      background: ${type === 'success' ? '#4ecdc4' : type === 'error' ? '#ff6b6b' : '#ffe66d'};
      color: ${type === 'info' ? '#000' : '#fff'};
      padding: 15px 25px;
      border-radius: 8px;
      font-weight: bold;
      box-shadow: 0 4px 15px rgba(0,0,0,0.3);
      animation: slideIn 0.3s ease;
      cursor: pointer;
      border-left: 4px solid ${type === 'success' ? '#2a9d8f' : type === 'error' ? '#d62828' : '#ee9b00'};
    `;
    notification.textContent = message;
    
    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
      }
    `;
    document.head.appendChild(style);
    
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

// Загрузчик файлов с предпросмотром
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
        <svg width="50" height="50" viewBox="0 0 24 24" fill="none" stroke="#4ecdc4" stroke-width="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="17 8 12 3 7 8"/>
          <line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
        <p>Нажмите для загрузки</p>
        <small>Поддерживаются: изображения, видео</small>
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
          preview.innerHTML = `<img src="${e.target.result}" alt="Preview">`;
          preview.style.display = 'block';
          placeholder.style.display = 'none';
          this.addEditButton(uploadArea, () => fileInput.click());
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
        
        this.addEditButton(uploadArea, () => fileInput.click());
      }
      
      this.onUpload(file, inputName);
    });
    
    container.appendChild(uploadArea);
  }
  
  addEditButton(container, onClick) {
    const oldBtn = container.querySelector('.edit-btn');
    if (oldBtn) oldBtn.remove();
    
    const editBtn = document.createElement('button');
    editBtn.className = 'edit-btn';
    editBtn.innerHTML = '✏️ Редактировать';
    editBtn.style.cssText = `
      margin-top: 10px;
      padding: 8px 15px;
      background: #4ecdc4;
      border: none;
      border-radius: 5px;
      color: #0f172a;
      font-weight: bold;
      cursor: pointer;
      transition: all 0.3s;
    `;
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick();
    });
    
    container.appendChild(editBtn);
  }
}

// Форматирование даты
function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// Создание модального окна
function createModal(options = {}) {
  const {
    title = '',
    content = '',
    onClose = () => {},
    width = '600px'
  } = options;
  
  const existingModals = document.querySelectorAll('.modal-overlay');
  existingModals.forEach(modal => modal.remove());
  
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  
  const modal = document.createElement('div');
  modal.className = 'modal-content';
  modal.style.width = width;
  modal.style.maxWidth = '90%';
  
  modal.innerHTML = `
    <button class="modal-close">&times;</button>
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
  
  modal.addEventListener('click', (e) => {
    e.stopPropagation();
  });
  
  return {
    overlay,
    modal,
    close: closeModal
  };
}

// Универсальная функция запроса к API
async function fetchAPI(url, options = {}) {
  try {
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      credentials: 'include',
      ...options
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Ошибка запроса');
    }
    
    return data;
  } catch (error) {
    NotificationManager.show(error.message, 'error');
    throw error;
  }
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
  updateNavigation();
  updateAuthUI();
  window.addEventListener('authChange', updateAuthUI);
  
  const overlay = document.querySelector('.background-overlay');
  if (overlay) {
    window.addEventListener('mousemove', (e) => {
      const x = e.clientX / window.innerWidth;
      const y = e.clientY / window.innerHeight;
      overlay.style.transform = `translate(${x * 10}px, ${y * 10}px)`;
    });
  }
  
  const protectedPages = ['/views/admin-panel.html'];
  const currentPage = window.location.pathname.split('/').pop();
  
  if (protectedPages.includes(currentPage)) {
    fetchAPI('/api/me').catch(() => {
      window.location.href = '/views/login.html';
    });
  }
});

window.NotificationManager = NotificationManager;
window.FileUploader = FileUploader;
window.formatDate = formatDate;
window.createModal = createModal;
window.fetchAPI = fetchAPI;
window.updateAuthUI = updateAuthUI;