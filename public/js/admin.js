// ============================================================================
// ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ
// ============================================================================

let currentUser = null;
let exhibits = [];
let modalCounter = 0;

// ============================================================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const data = await fetchAPI('/api/me');
        currentUser = data.user;
        
        if (!currentUser) {
            window.location.href = '/views/login.html';
            return;
        }
        
        updateUserUI();
        setupAdminButtons();
        await loadExhibits(true);
        setupLogout();
        
    } catch (error) {
        console.error('Ошибка авторизации:', error);
        window.location.href = '/views/login.html';
    }
});

// ============================================================================
// UI ОБНОВЛЕНИЯ
// ============================================================================

function updateUserUI() {
    const userBadge = document.getElementById('userRole');
    const loginBtn = document.getElementById('loginBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    
    if (userBadge) {
        userBadge.textContent = `${currentUser.username} (${currentUser.role === 'admin' ? 'Админ' : 'Редактор'})`;
    }
    
    if (loginBtn) loginBtn.style.display = 'none';
    if (logoutBtn) logoutBtn.style.display = 'inline-block';
    
    if (currentUser.role === 'admin') {
        document.querySelectorAll('.admin-only').forEach(el => {
            el.style.display = 'flex';
        });
    } else {
        document.querySelectorAll('.admin-only').forEach(el => {
            el.style.display = 'none';
        });
    }
}

function setupAdminButtons() {
    document.querySelector('[data-action="create"]').addEventListener('click', openCreateModal);
    document.querySelector('[data-action="edit"]').addEventListener('click', openEditModal);
    document.querySelector('[data-action="status"]').addEventListener('click', openStatusModal);
    
    const styleEditorBtn = document.querySelector('[data-action="style-editor"]');
    if (styleEditorBtn) {
        styleEditorBtn.addEventListener('click', () => {
            if (window.styleManager && typeof window.styleManager.openStyleEditor === 'function') {
                window.styleManager.openStyleEditor();
            } else {
                NotificationManager.show('Редактор стилей временно недоступен', 'error');
            }
        });
    }
    
    if (currentUser?.role === 'admin') {
        document.querySelector('[data-action="editors"]').addEventListener('click', openEditorsModal);
        document.querySelector('[data-action="applications"]').addEventListener('click', openApplicationsModal);
        
        setInterval(async () => {
            await loadExhibits(true);
        }, 30000);
    }
}

function setupLogout() {
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
    }
}

// ============================================================================
// ЗАГРУЗКА ЭКСПОНАТОВ
// ============================================================================

async function loadExhibits(forceRefresh = true) {
    try {
        exhibits = await fetchWithCache('/api/exhibits/all', 'exhibits', forceRefresh);
        console.log('📦 Загружено экспонатов:', exhibits.length);
        return exhibits;
    } catch (error) {
        console.error('❌ Ошибка загрузки экспонатов:', error);
        exhibits = [];
        return [];
    }
}

// ============================================================================
// ГЕНЕРАЦИЯ УНИКАЛЬНЫХ ID
// ============================================================================

function generateUniqueId(prefix = 'field') {
    return `${prefix}-${Date.now()}-${modalCounter++}-${Math.random().toString(36).substr(2, 9)}`;
}

// ============================================================================
// СОЗДАНИЕ ЭКСПОНАТА
// ============================================================================

function openCreateModal() {
    const titleId = generateUniqueId('title');
    const yearId = generateUniqueId('year');
    const descId = generateUniqueId('desc');
    
    const modalContent = `
        <div class="create-exhibit-form">
            <div class="form-left">
                <div class="form-group">
                    <label for="${titleId}">Название *</label>
                    <input type="text" id="${titleId}" class="exhibit-title" required placeholder="Apple Macintosh">
                </div>
                <div class="form-group">
                    <label for="${yearId}">Год *</label>
                    <input type="number" id="${yearId}" class="exhibit-year" required placeholder="1984">
                </div>
                <div class="form-group">
                    <label for="${descId}">Описание *</label>
                    <textarea id="${descId}" class="exhibit-description" required placeholder="Описание..."></textarea>
                </div>
            </div>
            <div class="form-right">
                <div class="form-group">
                    <label>Медиафайл *</label>
                    <div id="media-upload-container"></div>
                </div>
                <div class="form-group">
                    <label>Фон (необязательно)</label>
                    <div id="background-upload-container"></div>
                </div>
            </div>
            <button class="submit-btn" id="create-exhibit-btn">✨ Создать</button>
        </div>
    `;
    
    const modal = createModal({
        title: '➕ Создание экспоната',
        content: modalContent,
        width: '900px'
    });
    
    setTimeout(() => {
        initCreateUploaders();
    }, 100);
    
    document.getElementById('create-exhibit-btn').addEventListener('click', async () => {
        const title = document.querySelector('.exhibit-title').value;
        const year = document.querySelector('.exhibit-year').value;
        const description = document.querySelector('.exhibit-description').value;
        
        if (!title || !year || !description) {
            NotificationManager.show('Заполните все поля!', 'error');
            return;
        }
        
        const formData = new FormData();
        formData.append('title', title);
        formData.append('year', year);
        formData.append('description', description);
        
        const mediaInput = document.querySelector('input[name="media"]');
        const bgInput = document.querySelector('input[name="background"]');
        
        if (mediaInput?.files[0]) formData.append('media', mediaInput.files[0]);
        if (bgInput?.files[0]) formData.append('background', bgInput.files[0]);
        
        try {
            const response = await fetch('/api/exhibits', {
                method: 'POST',
                body: formData,
                credentials: 'include'
            });
            
            const data = await response.json();
            
            if (response.ok) {
                NotificationManager.show(data.message, 'success');
                modal.close();
                clearCache('exhibits');
                await loadExhibits(true);
            } else {
                NotificationManager.show(data.error || 'Ошибка', 'error');
            }
        } catch (error) {
            NotificationManager.show('Ошибка соединения', 'error');
        }
    });
}

function initCreateUploaders() {
    const mediaUploader = new FileUploader({
        onUpload: (file) => console.log('Медиа:', file.name)
    });
    
    const bgUploader = new FileUploader({
        onUpload: (file) => console.log('Фон:', file.name),
        accept: 'image/*'
    });
    
    mediaUploader.createUploadArea('media-upload-container', 'media');
    bgUploader.createUploadArea('background-upload-container', 'background');
}

// ============================================================================
// РЕДАКТИРОВАНИЕ ЭКСПОНАТА
// ============================================================================

async function openEditModal() {
    let modalContent = '';
    
    if (currentUser.role === 'admin') {
        modalContent = `
            <div class="edit-mode-selector">
                <select id="edit-mode-select" class="admin-select">
                    <option value="edit">✏️ Редактировать</option>
                    <option value="pending">⏳ На проверке</option>
                    <option value="pending-edits">🔄 Изменения</option>
                </select>
            </div>
            <div id="edit-mode-content"></div>
        `;
    } else {
        modalContent = `
            <div class="form-group">
                <label for="exhibit-select">Выберите экспонат:</label>
                <select id="exhibit-select" class="admin-select">
                    <option value="">-- Выберите --</option>
                    ${exhibits.filter(e => e.status === 'approved').map(e => 
                        `<option value="${e.id}">${e.title} (${e.year})</option>`
                    ).join('')}
                </select>
            </div>
            <div id="edit-form-container"></div>
        `;
    }
    
    const modal = createModal({
        title: '✏️ Редактирование',
        content: modalContent,
        width: '1000px'
    });
    
    if (currentUser.role === 'admin') {
        setupAdminEditModes(modal);
    } else {
        setupEditorEditMode(modal);
    }
}

function setupAdminEditModes(modal) {
    const modeSelect = document.getElementById('edit-mode-select');
    const contentDiv = document.getElementById('edit-mode-content');
    
    modeSelect.addEventListener('change', async () => {
        const mode = modeSelect.value;
        
        if (mode === 'edit') {
            contentDiv.innerHTML = getExhibitSelectHTML();
            document.getElementById('exhibit-select').addEventListener('change', (e) => {
                if (e.target.value) loadExhibitForEdit(e.target.value, 'edit-form-container');
            });
        } else if (mode === 'pending') {
            await loadPendingCreations(contentDiv);
        } else if (mode === 'pending-edits') {
            await loadPendingEdits(contentDiv);
        }
    });
    
    contentDiv.innerHTML = getExhibitSelectHTML();
    document.getElementById('exhibit-select').addEventListener('change', (e) => {
        if (e.target.value) loadExhibitForEdit(e.target.value, 'edit-form-container');
    });
}

function setupEditorEditMode(modal) {
    document.getElementById('exhibit-select').addEventListener('change', (e) => {
        if (e.target.value) loadExhibitForEdit(e.target.value, 'edit-form-container');
    });
}

function getExhibitSelectHTML() {
    return `
        <div class="form-group">
            <label for="exhibit-select">Выберите экспонат:</label>
            <select id="exhibit-select" class="admin-select">
                <option value="">-- Выберите --</option>
                ${exhibits.filter(e => e.status === 'approved').map(e => 
                    `<option value="${e.id}">${e.title} (${e.year})</option>`
                ).join('')}
            </select>
        </div>
        <div id="edit-form-container"></div>
    `;
}

async function loadExhibitForEdit(exhibitId, containerId) {
    try {
        const response = await fetch(`/api/exhibits/${exhibitId}`);
        const exhibit = await response.json();
        
        const container = document.getElementById(containerId);
        if (!container) {
            console.error('Контейнер не найден:', containerId);
            return;
        }
        
        const titleId = generateUniqueId('edit-title');
        const yearId = generateUniqueId('edit-year');
        const descId = generateUniqueId('edit-desc');
        
        container.innerHTML = getEditFormHTML(exhibit, titleId, yearId, descId);
        
        setTimeout(() => {
            initEditUploaders();
        }, 100);
        
        setupEditHandlers(exhibitId, exhibit, titleId, yearId, descId);
        
    } catch (error) {
        console.error('Ошибка загрузки экспоната:', error);
        NotificationManager.show('Ошибка загрузки экспоната', 'error');
    }
}

function getEditFormHTML(exhibit, titleId, yearId, descId) {
    let currentMediaHtml = '';
    if (exhibit.media_path) {
        const ext = exhibit.media_path.split('.').pop().toLowerCase();
        if (['mp4', 'webm', 'ogg'].includes(ext)) {
            currentMediaHtml = `
                <div class="current-media-preview">
                    <label>Текущее видео:</label>
                    <video controls style="max-width: 100%; max-height: 150px; margin-top: 5px;">
                        <source src="${exhibit.media_path}" type="video/${ext}">
                    </video>
                    <p class="current-file">${exhibit.media_path.split('/').pop()}</p>
                </div>
            `;
        } else {
            currentMediaHtml = `
                <div class="current-media-preview">
                    <label>Текущее изображение:</label>
                    <img src="${exhibit.media_path}" alt="Текущее изображение" style="max-width: 100%; max-height: 150px; object-fit: contain; margin-top: 5px; border-radius: 8px;">
                    <p class="current-file">${exhibit.media_path.split('/').pop()}</p>
                </div>
            `;
        }
    } else {
        currentMediaHtml = `<p class="no-file">Нет медиафайла</p>`;
    }
    
    let currentBgHtml = '';
    if (exhibit.background_path) {
        currentBgHtml = `
            <div class="current-media-preview">
                <label>Текущий фон:</label>
                <img src="${exhibit.background_path}" alt="Текущий фон" style="max-width: 100%; max-height: 150px; object-fit: contain; margin-top: 5px; border-radius: 8px;">
                <p class="current-file">${exhibit.background_path.split('/').pop()}</p>
            </div>
        `;
    } else {
        currentBgHtml = `<p class="no-file">Нет фонового изображения</p>`;
    }
    
    return `
        <div class="create-exhibit-form">
            <div class="form-left">
                <div class="form-group">
                    <label for="${titleId}">Название *</label>
                    <input type="text" id="${titleId}" class="edit-title" value="${exhibit.title.replace(/"/g, '&quot;')}" required>
                </div>
                <div class="form-group">
                    <label for="${yearId}">Год *</label>
                    <input type="number" id="${yearId}" class="edit-year" value="${exhibit.year}" required>
                </div>
                <div class="form-group">
                    <label for="${descId}">Описание *</label>
                    <textarea id="${descId}" class="edit-description" required>${exhibit.description.replace(/"/g, '&quot;')}</textarea>
                </div>
            </div>
            <div class="form-right">
                <div class="form-group">
                    <label>Медиафайл</label>
                    ${currentMediaHtml}
                    <div class="edit-media-container" style="margin-top: 10px;"></div>
                    <small>Загрузите новый файл, чтобы заменить текущий (оставьте пустым, чтобы сохранить текущий)</small>
                </div>
                <div class="form-group">
                    <label>Фон</label>
                    ${currentBgHtml}
                    <div class="edit-background-container" style="margin-top: 10px;"></div>
                    <small>Загрузите новое фоновое изображение, чтобы заменить текущее</small>
                </div>
            </div>
            <div class="form-actions">
                ${currentUser.role === 'admin' ? `
                    <button class="delete-btn" id="delete-exhibit-btn">🗑️ Удалить экспонат</button>
                ` : ''}
                <button class="submit-btn" id="update-exhibit-btn">💾 Сохранить изменения</button>
            </div>
        </div>
    `;
}

function initEditUploaders() {
    console.log('Инициализация загрузчиков для редактирования...');
    
    const mediaUploader = new FileUploader({
        onUpload: (file, inputName) => {
            if (file) {
                console.log('Выбран новый медиафайл:', file.name);
            } else {
                console.log('Медиафайл очищен');
            }
        },
        accept: 'image/*,video/*'
    });
    
    const bgUploader = new FileUploader({
        onUpload: (file, inputName) => {
            if (file) {
                console.log('Выбран новый фон:', file.name);
            } else {
                console.log('Фон очищен');
            }
        },
        accept: 'image/*'
    });
    
    const mediaContainer = document.querySelector('.edit-media-container');
    const bgContainer = document.querySelector('.edit-background-container');
    
    if (mediaContainer) {
        mediaUploader.createUploadAreaFromContainer(mediaContainer, 'media');
        console.log('Загрузчик медиа создан');
    } else {
        console.error('Контейнер .edit-media-container не найден');
    }
    
    if (bgContainer) {
        bgUploader.createUploadAreaFromContainer(bgContainer, 'background');
        console.log('Загрузчик фона создан');
    } else {
        console.error('Контейнер .edit-background-container не найден');
    }
}


function setupEditHandlers(exhibitId, exhibit, titleId, yearId, descId) {
    const updateBtn = document.getElementById('update-exhibit-btn');
    if (!updateBtn) return;
    
    updateBtn.addEventListener('click', async () => {
        const title = document.querySelector('.edit-title').value;
        const year = document.querySelector('.edit-year').value;
        const description = document.querySelector('.edit-description').value;
        
        if (!title || !year || !description) {
            NotificationManager.show('Заполните все поля!', 'error');
            return;
        }
        
        // Показываем индикатор загрузки
        const originalText = updateBtn.textContent;
        updateBtn.textContent = '⏳ Сохранение...';
        updateBtn.disabled = true;
        
        const formData = new FormData();
        formData.append('title', title);
        formData.append('year', year);
        formData.append('description', description);
        
        // Получаем файлы из загрузчиков - ищем по имени input
        const mediaInput = document.querySelector('input[name="media"]');
        const bgInput = document.querySelector('input[name="background"]');
        
        // Добавляем файлы, если они выбраны
        if (mediaInput && mediaInput.files && mediaInput.files.length > 0 && mediaInput.files[0]) {
            console.log('Добавляем медиафайл:', mediaInput.files[0].name);
            formData.append('media', mediaInput.files[0]);
        }
        
        if (bgInput && bgInput.files && bgInput.files.length > 0 && bgInput.files[0]) {
            console.log('Добавляем фон:', bgInput.files[0].name);
            formData.append('background', bgInput.files[0]);
        }
        
        try {
            const response = await fetch(`/api/exhibits/${exhibitId}`, {
                method: 'PUT',
                body: formData,
                credentials: 'include'
            });
            
            const data = await response.json();
            
            if (response.ok) {
                NotificationManager.show(data.message || 'Экспонат обновлен!', 'success');
                
                // Очищаем кэш
                clearCache('exhibits');
                
                // Принудительно перезагружаем список экспонатов
                await loadExhibits(true);
                
                // Закрываем модальное окно
                const modal = document.querySelector('.modal-overlay');
                if (modal) modal.remove();
                
                // Обновляем страницу через секунду
                setTimeout(() => {
                    location.reload();
                }, 1000);
            } else {
                NotificationManager.show(data.error || 'Ошибка обновления', 'error');
                updateBtn.textContent = originalText;
                updateBtn.disabled = false;
            }
        } catch (error) {
            console.error('Ошибка:', error);
            NotificationManager.show('Ошибка соединения', 'error');
            updateBtn.textContent = originalText;
            updateBtn.disabled = false;
        }
    });
    
    if (currentUser.role === 'admin') {
        setupDeleteHandler(exhibitId, exhibit);
    }
}

function setupDeleteHandler(exhibitId, exhibit) {
    document.getElementById('delete-exhibit-btn').addEventListener('click', () => {
        const confirmContent = `
            <div class="confirm-dialog">
                <div class="confirm-icon">⚠️</div>
                <h3>Удаление</h3>
                <p>Удалить "${exhibit.title}" (${exhibit.year})?</p>
                <p class="confirm-warning">Действие необратимо</p>
                <div class="confirm-actions">
                    <button class="approve-btn" id="confirm-delete-yes">Да</button>
                    <button class="reject-btn" id="confirm-delete-no">Нет</button>
                </div>
            </div>
        `;
        
        const confirmModal = createModal({
            title: '⚠️ Подтверждение',
            content: confirmContent,
            width: '350px'
        });
        
        document.getElementById('confirm-delete-yes').addEventListener('click', async () => {
            confirmModal.close();
            
            try {
                const response = await fetch(`/api/admin/exhibits/${exhibitId}`, {
                    method: 'DELETE',
                    credentials: 'include'
                });
                
                const data = await response.json();
                
                if (response.ok) {
                    NotificationManager.show('Удалено!', 'success');
                    clearCache('exhibits');
                    await loadExhibits(true);
                } else {
                    NotificationManager.show(data.error || 'Ошибка', 'error');
                }
            } catch (error) {
                NotificationManager.show('Ошибка соединения', 'error');
            }
        });
        
        document.getElementById('confirm-delete-no').addEventListener('click', () => confirmModal.close());
    });
}

// ============================================================================
// ЗАГРУЗКА ЭКСПОНАТОВ НА ПРОВЕРКУ
// ============================================================================

async function fetchWithRetry(url, retries = 3, delay = 1000) {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(url, { credentials: 'include' });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await response.json();
        } catch (error) {
            console.warn(`Попытка ${i + 1} не удалась:`, error);
            if (i === retries - 1) throw error;
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

async function loadPendingCreations(container) {
    try {
        container.innerHTML = '<div class="loading-spinner"></div>';
        
        const pending = await fetchWithRetry('/api/admin/pending-creations', 2);
        
        if (!pending || pending.length === 0) {
            container.innerHTML = '<p class="empty-message">Нет экспонатов на проверке</p>';
            return;
        }
        
        let html = '<div class="pending-list">';
        
        pending.forEach(exhibit => {
            html += `
                <div class="exhibit-card pending-card" data-id="${exhibit.id}">
                    <div class="card-header">
                        <h4>${escapeHtml(exhibit.title)}</h4>
                        <span class="year-badge">${exhibit.year}</span>
                    </div>
                    <div class="meta">Автор: ${escapeHtml(exhibit.creator_name || 'Неизвестен')}</div>
                    <div class="description">${escapeHtml(exhibit.description)}</div>
                    ${exhibit.media_path ? `
                        <div class="media-preview-small">
                            <img src="${exhibit.media_path}" alt="Превью" style="max-width: 150px; max-height: 100px; object-fit: contain;" loading="lazy" onerror="this.style.display='none'">
                        </div>
                    ` : ''}
                    <div class="card-actions">
                        <button class="approve-btn" onclick="approveExhibit(${exhibit.id})">✅ Одобрить</button>
                        <button class="reject-btn" onclick="rejectExhibit(${exhibit.id})">❌ Отклонить</button>
                    </div>
                </div>
            `;
        });
        
        html += '</div>';
        container.innerHTML = html;
        
    } catch (error) {
        console.error('Ошибка загрузки:', error);
        container.innerHTML = `
            <div class="error-message">
                <p>❌ Ошибка загрузки</p>
                <button class="retry-btn" onclick="loadPendingCreations(this.parentElement.parentElement)">🔄 Повторить</button>
            </div>
        `;
    }
}

function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

async function loadPendingEdits(container) {
    try {
        const pending = await fetchWithCache('/api/admin/pending-edits', null, true);
        
        if (pending.length === 0) {
            container.innerHTML = '<p class="empty-message">Нет изменений на проверке</p>';
            return;
        }
        
        let html = '';
        
        for (const edit of pending) {
            const original = await fetchAPI(`/api/exhibits/${edit.original_id}`);
            
            html += `
                <div class="compare-container">
                    <div class="exhibit-card original-card">
                        <h4>📄 Оригинал</h4>
                        <div class="meta">${original.title} (${original.year})</div>
                        <div class="description">${original.description}</div>
                        ${original.media_path ? `
                            <div class="media-preview">
                                <label>Изображение:</label>
                                <img src="${original.media_path}" alt="Оригинал" style="max-width: 150px; max-height: 100px; object-fit: contain;" loading="lazy" onerror="this.style.display='none'">
                            </div>
                        ` : '<p class="no-media">Нет изображения</p>'}
                        ${original.background_path ? `
                            <div class="media-preview">
                                <label>Фон:</label>
                                <img src="${original.background_path}" alt="Фон оригинала" style="max-width: 150px; max-height: 100px; object-fit: contain;" loading="lazy" onerror="this.style.display='none'">
                            </div>
                        ` : ''}
                    </div>
                    <div class="compare-arrow">→</div>
                    <div class="exhibit-card edited-card">
                        <h4>✏️ Изменения</h4>
                        <div class="meta">${edit.title} (${edit.year})</div>
                        <div class="description">${edit.description}</div>
                        ${edit.media_path && edit.media_path !== original.media_path ? `
                            <div class="media-preview changed">
                                <label>🔄 Новое изображение:</label>
                                <img src="${edit.media_path}" alt="Новое изображение" style="max-width: 150px; max-height: 100px; object-fit: contain;" loading="lazy" onerror="this.style.display='none'">
                            </div>
                        ` : edit.media_path ? `
                            <div class="media-preview unchanged">
                                <label>✓ Изображение не изменено</label>
                            </div>
                        ` : '<p class="no-media">Нет изображения</p>'}
                        ${edit.background_path && edit.background_path !== original.background_path ? `
                            <div class="media-preview changed">
                                <label>🔄 Новый фон:</label>
                                <img src="${edit.background_path}" alt="Новый фон" style="max-width: 150px; max-height: 100px; object-fit: contain;" loading="lazy" onerror="this.style.display='none'">
                            </div>
                        ` : edit.background_path ? `
                            <div class="media-preview unchanged">
                                <label>✓ Фон не изменен</label>
                            </div>
                        ` : ''}
                    </div>
                </div>
                <div class="card-actions">
                    <button class="approve-btn" onclick="approveExhibit(${edit.id})">✅ Одобрить изменения</button>
                    <button class="reject-btn" onclick="rejectExhibit(${edit.id})">❌ Отклонить</button>
                </div>
                <hr class="separator">
            `;
        }
        
        container.innerHTML = html;
        
    } catch (error) {
        console.error('Ошибка загрузки правок:', error);
        container.innerHTML = '<p class="error-message">Ошибка загрузки изменений</p>';
    }
}

// ============================================================================
// СОСТОЯНИЕ ЭКСПОНАТОВ
// ============================================================================

async function openStatusModal() {
    const modalContent = `
        <div class="status-selector">
            <select id="status-mode-select" class="admin-select">
                <option value="pending_creation">📝 На проверке</option>
                <option value="pending_edit">✏️ Изменения</option>
                <option value="approved">✅ Одобренные</option>
                <option value="rejected">❌ Отклоненные</option>
            </select>
        </div>
        <div id="status-list-container"></div>
    `;
    
    const modal = createModal({
        title: '📊 Состояние экспонатов',
        content: modalContent,
        width: '800px'
    });
    
    const modeSelect = document.getElementById('status-mode-select');
    const listContainer = document.getElementById('status-list-container');
    
    modeSelect.addEventListener('change', () => loadStatusList(modeSelect.value, listContainer));
    await loadStatusList('pending_creation', listContainer);
}

async function loadStatusList(status, container) {
    try {
        const items = await fetchWithCache(`/api/exhibits/status/${status}`, null, true);
        
        if (items.length === 0) {
            container.innerHTML = '<p class="empty-message">Нет экспонатов</p>';
            return;
        }
        
        let html = '<ul class="exhibits-list">';
        
        items.forEach(item => {
            const date = formatDate(item.created_at);
            
            html += `
                <li class="status-item">
                    <strong>${item.title}</strong> (${item.year})
                    <br>
                    <small>${date} | ${item.creator_name || '?'}</small>
                    <br>
                    <small class="status-badge">${getStatusText(item.status)}</small>
                </li>
            `;
        });
        
        html += '</ul>';
        container.innerHTML = html;
        
    } catch (error) {
        container.innerHTML = '<p class="error-message">Ошибка загрузки</p>';
    }
}

// ============================================================================
// РАБОТА С РЕДАКТОРАМИ
// ============================================================================

async function openEditorsModal() {
    const modalContent = `
        <div class="editors-header">
            <button class="admin-btn" id="create-editor-btn">➕ Создать редактора</button>
        </div>
        <div id="editors-list-container">Загрузка...</div>
    `;
    
    const modal = createModal({
        title: '👥 Управление редакторами',
        content: modalContent,
        width: '700px'
    });
    
    document.getElementById('create-editor-btn').addEventListener('click', openCreateEditorModal);
    await loadEditorsList(true);
}

async function loadEditorsList(forceRefresh = false) {
    const container = document.getElementById('editors-list-container');
    if (!container) return;
    
    container.innerHTML = '<div class="loading-spinner"></div>';
    
    try {
        const editors = await fetchWithCache('/api/admin/editors', 'editors', forceRefresh);
        
        if (!Array.isArray(editors) || editors.length === 0) {
            container.innerHTML = '<p class="empty-message">Нет редакторов</p>';
            return;
        }
        
        let html = '<div class="editors-list">';
        
        editors.forEach(editor => {
            const date = editor.created_at ? formatDate(editor.created_at) : '?';
            
            html += `
                <div class="editor-card" data-id="${editor.id}">
                    <div class="editor-info">
                        <h3>${editor.username}</h3>
                        <p>Email: ${editor.email || '—'}</p>
                        <p>Создан: ${date}</p>
                        <p>Пароль: 
                            <span class="password-hidden" onclick="togglePassword(this, ${editor.id})" style="cursor: pointer;">
                                ••••••••
                            </span>
                            <span class="password-visible-${editor.id}" style="display: none;"></span>
                        </p>
                    </div>
                    <div class="editor-actions">
                        <button class="admin-btn" onclick="editEditor(${editor.id})">✏️</button>
                        <button class="delete-editor" onclick="deleteEditor(${editor.id})">🗑️</button>
                    </div>
                </div>
            `;
        });
        
        html += '</div>';
        container.innerHTML = html;
        
    } catch (error) {
        container.innerHTML = `<p class="error-message">Ошибка: ${error.message}</p>`;
    }
}

window.togglePassword = async function(element, editorId) {
    const visibleSpan = document.querySelector(`.password-visible-${editorId}`);
    if (!visibleSpan) return;
    
    if (element.style.display === 'none') {
        element.style.display = 'inline';
        visibleSpan.style.display = 'none';
        return;
    }
    
    element.style.display = 'none';
    visibleSpan.style.display = 'inline';
    visibleSpan.textContent = 'Загрузка...';
    
    try {
        const response = await fetch(`/api/admin/editors/${editorId}/password`, {
            credentials: 'include'
        });
        
        const data = await response.json();
        
        if (data.password) {
            visibleSpan.textContent = data.password;
            setTimeout(() => {
                element.style.display = 'inline';
                visibleSpan.style.display = 'none';
            }, 5000);
        } else {
            visibleSpan.textContent = data.message || 'Недоступен';
            setTimeout(() => {
                element.style.display = 'inline';
                visibleSpan.style.display = 'none';
            }, 2000);
        }
        
    } catch (error) {
        visibleSpan.textContent = 'Ошибка';
        setTimeout(() => {
            element.style.display = 'inline';
            visibleSpan.style.display = 'none';
        }, 1000);
    }
};

window.editEditor = async (id) => {
    const editors = await fetchWithCache('/api/admin/editors', 'editors', true);
    const editor = editors.find(e => e.id === id);
    
    if (!editor) {
        NotificationManager.show('Редактор не найден', 'error');
        return;
    }
    
    const usernameId = generateUniqueId('edit-username');
    const emailId = generateUniqueId('edit-email');
    const passwordId = generateUniqueId('edit-password');
    
    const modalContent = `
        <div class="create-exhibit-form">
            <div class="form-group">
                <label for="${usernameId}">Логин</label>
                <input type="text" id="${usernameId}" class="edit-username" value="${editor.username}" required>
            </div>
            <div class="form-group">
                <label for="${emailId}">Email</label>
                <input type="email" id="${emailId}" class="edit-email" value="${editor.email || ''}">
            </div>
            <div class="form-group">
                <label for="${passwordId}">Новый пароль (необязательно)</label>
                <input type="text" id="${passwordId}" class="edit-password" placeholder="Оставьте пустым">
            </div>
            <button class="submit-btn" id="save-editor-changes-btn">💾 Сохранить</button>
        </div>
    `;
    
    const modal = createModal({
        title: '✏️ Редактирование редактора',
        content: modalContent,
        width: '450px'
    });
    
    document.getElementById('save-editor-changes-btn').addEventListener('click', async () => {
        const newUsername = document.querySelector('.edit-username').value;
        const newEmail = document.querySelector('.edit-email').value;
        const newPassword = document.querySelector('.edit-password').value;
        
        const updateData = {};
        if (newUsername !== editor.username) updateData.username = newUsername;
        if (newEmail !== editor.email) updateData.email = newEmail;
        if (newPassword) updateData.password = newPassword;
        
        if (Object.keys(updateData).length === 0) {
            NotificationManager.show('Нет изменений', 'info');
            modal.close();
            return;
        }
        
        try {
            const response = await fetch(`/api/admin/editors/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updateData),
                credentials: 'include'
            });
            
            const data = await response.json();
            
            if (response.ok) {
                NotificationManager.show('Обновлено!', 'success');
                modal.close();
                clearCache('editors');
                await loadEditorsList(true);
            } else {
                NotificationManager.show(data.error || 'Ошибка', 'error');
            }
        } catch (error) {
            NotificationManager.show('Ошибка соединения', 'error');
        }
    });
};

function openCreateEditorModal() {
    const usernameId = generateUniqueId('editor-username');
    const passwordId = generateUniqueId('editor-password');
    const emailId = generateUniqueId('editor-email');
    const telegramId = generateUniqueId('editor-telegram');
    
    const modalContent = `
        <div class="create-exhibit-form">
            <div class="form-group">
                <label for="${usernameId}">Логин *</label>
                <input type="text" id="${usernameId}" class="editor-username" required placeholder="editor123">
            </div>
            <div class="form-group">
                <label for="${passwordId}">Пароль *</label>
                <input type="text" id="${passwordId}" class="editor-password" required value="${generatePassword()}">
                <small>Будет отправлен в Telegram</small>
            </div>
            <div class="form-group">
                <label for="${emailId}">Email</label>
                <input type="email" id="${emailId}" class="editor-email" placeholder="editor@mail.com">
            </div>
            <div class="form-group">
                <label for="${telegramId}">Telegram ID</label>
                <input type="text" id="${telegramId}" class="editor-telegram" placeholder="123456789">
                <small>Для отправки пароля</small>
            </div>
            <button class="submit-btn" id="save-editor-btn">👤 Создать</button>
        </div>
    `;
    
    const modal = createModal({
        title: '➕ Создание редактора',
        content: modalContent,
        width: '450px'
    });
    
    document.getElementById('save-editor-btn').addEventListener('click', async () => {
        const username = document.querySelector('.editor-username').value;
        const password = document.querySelector('.editor-password').value;
        const email = document.querySelector('.editor-email').value;
        const telegramId = document.querySelector('.editor-telegram').value;
        
        if (!username || !password) {
            NotificationManager.show('Заполните логин и пароль!', 'error');
            return;
        }
        
        try {
            const response = await fetch('/api/admin/editors', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    username, 
                    password,
                    email: email || null,
                    telegramId: telegramId || null
                }),
                credentials: 'include'
            });
            
            const data = await response.json();
            
            if (response.ok) {
                NotificationManager.show(
                    data.telegramSent ? '✅ Редактор создан! Пароль отправлен.' : '✅ Редактор создан!',
                    'success'
                );
                modal.close();
                clearCache('editors');
                await loadEditorsList(true);
            } else {
                NotificationManager.show(data.error || 'Ошибка', 'error');
            }
        } catch (error) {
            NotificationManager.show('Ошибка соединения', 'error');
        }
    });
}

window.deleteEditor = async (id) => {
    const confirmContent = `
        <div class="confirm-dialog">
            <div class="confirm-icon">⚠️</div>
            <h3>Удалить редактора?</h3>
            <p>Это действие необратимо</p>
            <div class="confirm-actions">
                <button class="approve-btn" id="confirm-delete-yes">Да</button>
                <button class="reject-btn" id="confirm-delete-no">Нет</button>
            </div>
        </div>
    `;
    
    const confirmModal = createModal({
        title: '⚠️ Подтверждение',
        content: confirmContent,
        width: '350px'
    });
    
    document.getElementById('confirm-delete-yes').addEventListener('click', async () => {
        confirmModal.close();
        
        try {
            const response = await fetch(`/api/admin/editors/${id}`, {
                method: 'DELETE',
                credentials: 'include'
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Ошибка');
            }
            
            NotificationManager.show('Редактор удален', 'success');
            clearCache('editors');
            await loadEditorsList(true);
            
        } catch (error) {
            NotificationManager.show(error.message, 'error');
        }
    });
    
    document.getElementById('confirm-delete-no').addEventListener('click', () => confirmModal.close());
};

// ============================================================================
// ЗАЯВКИ
// ============================================================================

async function openApplicationsModal() {
    try {
        const applications = await fetchWithCache('/api/admin/applications', 'applications', true);
        
        let content = `
            <div class="applications-header">
                <h3>Всего заявок: ${applications.length}</h3>
            </div>
            <div class="applications-list">
        `;
        
        if (applications.length === 0) {
            content += '<p class="empty-message">Нет заявок</p>';
        } else {
            applications.forEach(app => {
                const date = formatDate(app.created_at);
                const statusClass = app.status === 'pending' ? 'status-pending' : 
                                   app.status === 'approved' ? 'status-approved' : 'status-rejected';
                const statusIcon = app.status === 'pending' ? '⏳' : app.status === 'approved' ? '✅' : '❌';
                
                content += `
                    <div class="application-card" data-id="${app.id}">
                        <div class="application-header">
                            <strong>${app.full_name}</strong>
                            <span class="status-badge ${statusClass}">${statusIcon}</span>
                        </div>
                        <div class="application-details">
                            <p>👤 ${app.username}</p>
                            <p>📧 ${app.email || '—'}</p>
                            <p>📱 ${app.telegram_chat_id || '—'}</p>
                            <p>💬 ${app.reason}</p>
                            <p>📅 ${date}</p>
                        </div>
                        ${app.status === 'pending' ? `
                            <div class="card-actions">
                                <button class="approve-btn" onclick="openCreateEditorFromApplicationModal(${app.id})">✅ Одобрить</button>
                                <button class="reject-btn" onclick="rejectApplication(${app.id})">❌ Отклонить</button>
                            </div>
                        ` : ''}
                    </div>
                `;
            });
        }
        
        content += '</div>';
        
        createModal({
            title: '📨 Заявки на редакторство',
            content: content,
            width: '700px'
        });
        
    } catch (error) {
        NotificationManager.show('Ошибка загрузки', 'error');
    }
}

window.openCreateEditorFromApplicationModal = async (id) => {
    const confirmContent = `
        <div class="confirm-dialog">
            <div class="confirm-icon">✅</div>
            <h3>Одобрить заявку?</h3>
            <p>Будет создан редактор с данными из заявки</p>
            <div class="confirm-actions">
                <button class="approve-btn" id="confirm-approve-yes">Да</button>
                <button class="reject-btn" id="confirm-approve-no">Нет</button>
            </div>
        </div>
    `;
    
    const confirmModal = createModal({
        title: '⚠️ Подтверждение',
        content: confirmContent,
        width: '350px'
    });
    
    document.getElementById('confirm-approve-yes').addEventListener('click', async () => {
        confirmModal.close();
        
        try {
            const response = await fetch(`/api/admin/applications/${id}`);
            const application = await response.json();
            
            const plainPassword = generatePassword();
            const passwordId = generateUniqueId('editor-password');
            
            const modalContent = `
                <div class="create-exhibit-form">
                    <div class="form-group">
                        <label>Логин</label>
                        <input type="text" value="${application.username}" readonly class="readonly-input">
                    </div>
                    <div class="form-group">
                        <label for="${passwordId}">Пароль</label>
                        <input type="text" id="${passwordId}" class="editor-password" value="${plainPassword}">
                        <small>Будет отправлен в Telegram</small>
                    </div>
                    <div class="form-group">
                        <label>Telegram ID</label>
                        <input type="text" value="${application.telegram_chat_id || ''}" readonly class="readonly-input">
                    </div>
                    <div class="form-group">
                        <label>Email</label>
                        <input type="text" value="${application.email || ''}" readonly class="readonly-input">
                    </div>
                    <button class="submit-btn" id="save-editor-btn">👤 Создать редактора</button>
                </div>
            `;
            
            const modal = createModal({
                title: '➕ Создание редактора из заявки',
                content: modalContent,
                width: '450px'
            });
            
            document.getElementById('save-editor-btn').addEventListener('click', async () => {
                const finalPassword = document.querySelector('.editor-password').value;
                
                const createResponse = await fetch('/api/admin/editors', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        username: application.username,
                        password: finalPassword,
                        email: application.email,
                        telegramId: application.telegram_chat_id
                    }),
                    credentials: 'include'
                });
                
                const createData = await createResponse.json();
                
                if (createResponse.ok) {
                    await fetch(`/api/admin/applications/${id}/approve`, { method: 'POST' });
                    
                    NotificationManager.show(
                        `✅ Редактор создан! Пароль: ${finalPassword}`,
                        'success'
                    );
                    modal.close();
                    clearCache('applications');
                    clearCache('editors');
                    setTimeout(() => openApplicationsModal(), 500);
                } else {
                    NotificationManager.show(createData.error || 'Ошибка', 'error');
                }
            });
            
        } catch (error) {
            NotificationManager.show('Ошибка загрузки', 'error');
        }
    });
    
    document.getElementById('confirm-approve-no').addEventListener('click', () => confirmModal.close());
};

window.rejectApplication = async (id) => {
    const confirmContent = `
        <div class="confirm-dialog">
            <div class="confirm-icon">❌</div>
            <h3>Отклонить заявку?</h3>
            <p>Это действие необратимо</p>
            <div class="confirm-actions">
                <button class="approve-btn" id="confirm-reject-yes">Да</button>
                <button class="reject-btn" id="confirm-reject-no">Нет</button>
            </div>
        </div>
    `;
    
    const confirmModal = createModal({
        title: '⚠️ Подтверждение',
        content: confirmContent,
        width: '350px'
    });
    
    document.getElementById('confirm-reject-yes').addEventListener('click', async () => {
        confirmModal.close();
        
        try {
            const response = await fetch(`/api/admin/applications/${id}/reject`, {
                method: 'POST',
                credentials: 'include'
            });
            
            const data = await response.json();
            
            if (response.ok) {
                NotificationManager.show('Заявка отклонена', 'info');
                clearCache('applications');
                setTimeout(() => openApplicationsModal(), 500);
            } else {
                NotificationManager.show(data.error || 'Ошибка', 'error');
            }
        } catch (error) {
            NotificationManager.show('Ошибка соединения', 'error');
        }
    });
    
    document.getElementById('confirm-reject-no').addEventListener('click', () => confirmModal.close());
};

// ============================================================================
// ОДОБРЕНИЕ/ОТКЛОНЕНИЕ ЭКСПОНАТА
// ============================================================================

window.approveExhibit = async (id) => {
    try {
        const response = await fetch(`/api/admin/approve/${id}`, {
            method: 'POST',
            credentials: 'include'
        });
        
        const data = await response.json();
        
        if (response.ok) {
            NotificationManager.show('Одобрено!', 'success');
            clearCache('exhibits');
            setTimeout(() => location.reload(), 500);
        } else {
            NotificationManager.show(data.error || 'Ошибка', 'error');
        }
    } catch (error) {
        NotificationManager.show('Ошибка соединения', 'error');
    }
};

window.rejectExhibit = async (id) => {
    try {
        const response = await fetch(`/api/admin/reject/${id}`, {
            method: 'POST',
            credentials: 'include'
        });
        
        const data = await response.json();
        
        if (response.ok) {
            NotificationManager.show('Отклонено', 'info');
            clearCache('exhibits');
            setTimeout(() => location.reload(), 500);
        } else {
            NotificationManager.show(data.error || 'Ошибка', 'error');
        }
    } catch (error) {
        NotificationManager.show('Ошибка соединения', 'error');
    }
};

// ============================================================================
// ВЫХОД
// ============================================================================

async function logout() {
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
                NotificationManager.show('Выход выполнен', 'info');
                window.location.href = '/views/login.html';
            } catch (error) {
                console.error('Ошибка:', error);
                window.location.href = '/views/login.html';
            }
        }
    });
}

// ============================================================================
// ТЕСТЫ
// ============================================================================
function setupAdminButtons() {
    document.querySelector('[data-action="create"]').addEventListener('click', openCreateModal);
    document.querySelector('[data-action="edit"]').addEventListener('click', openEditModal);
    document.querySelector('[data-action="status"]').addEventListener('click', openStatusModal);
    
    // Добавляем обработчик для кнопки тестирования
    const testsBtn = document.querySelector('[data-action="tests"]');
    if (testsBtn) {
        testsBtn.addEventListener('click', openTestsModal);
    }
    
    // Обработчик для редактора стилей
    const styleEditorBtn = document.querySelector('[data-action="style-editor"]');
    if (styleEditorBtn) {
        styleEditorBtn.addEventListener('click', () => {
            if (window.styleManager && typeof window.styleManager.openStyleEditor === 'function') {
                window.styleManager.openStyleEditor();
            } else {
                NotificationManager.show('Редактор стилей временно недоступен', 'error');
            }
        });
    }
    
    if (currentUser?.role === 'admin') {
        document.querySelector('[data-action="editors"]').addEventListener('click', openEditorsModal);
        document.querySelector('[data-action="applications"]').addEventListener('click', openApplicationsModal);
        
        setInterval(async () => {
            await loadExhibits(true);
        }, 30000);
    }
}

// ============================================================================
// ПАНЕЛЬ ТЕСТИРОВАНИЯ
// ============================================================================

async function openTestsModal() {
    const modalContent = `
        <div class="tests-panel">
            <style>
                .tests-panel {
                    display: flex;
                    flex-direction: column;
                    gap: 1.5rem;
                }
                .test-section {
                    background: var(--color-bg-dark);
                    border: 1px solid var(--color-border);
                    border-radius: 16px;
                    padding: 1.25rem;
                }
                .test-section h3 {
                    color: var(--color-primary);
                    margin-bottom: 1rem;
                    font-size: 1.1rem;
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                }
                .test-buttons {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 0.75rem;
                }
                .test-btn {
                    padding: 0.5rem 1rem;
                    background: transparent;
                    border: 1px solid var(--color-border);
                    border-radius: 8px;
                    color: var(--color-text-primary);
                    cursor: pointer;
                    transition: var(--transition-base);
                    font-size: 0.85rem;
                }
                .test-btn:hover {
                    border-color: var(--color-primary);
                    transform: translateY(-1px);
                }
                .test-btn.danger {
                    border-color: #e06c75;
                    color: #e06c75;
                }
                .test-btn.danger:hover {
                    background: #e06c75;
                    color: var(--color-bg-dark);
                }
                .test-btn.success {
                    border-color: var(--color-primary);
                    color: var(--color-primary);
                }
                .test-btn.success:hover {
                    background: var(--color-primary);
                    color: var(--color-bg-dark);
                }
                .test-result {
                    margin-top: 1rem;
                    padding: 0.75rem;
                    background: rgba(201, 160, 61, 0.1);
                    border-radius: 8px;
                    font-family: monospace;
                    font-size: 0.8rem;
                    color: var(--color-text-secondary);
                    max-height: 200px;
                    overflow-y: auto;
                    display: none;
                }
                .test-result.show {
                    display: block;
                }
                .test-result pre {
                    margin: 0;
                    white-space: pre-wrap;
                    word-break: break-all;
                }
                .status-badge {
                    display: inline-block;
                    padding: 0.2rem 0.5rem;
                    border-radius: 20px;
                    font-size: 0.7rem;
                    margin-left: 0.5rem;
                }
                .status-badge.pass {
                    background: rgba(76, 175, 80, 0.2);
                    color: #4caf50;
                }
                .status-badge.fail {
                    background: rgba(224, 108, 117, 0.2);
                    color: #e06c75;
                }
                .status-badge.pending {
                    background: rgba(201, 160, 61, 0.2);
                    color: var(--color-primary-light);
                }
            </style>
            
            <div class="test-section">
                <h3>🔌 API Endpoints</h3>
                <div class="test-buttons">
                    <button class="test-btn success" data-test="api-health">🏥 Health Check</button>
                    <button class="test-btn success" data-test="api-exhibits">📦 Получить экспонаты</button>
                    <button class="test-btn success" data-test="api-styles">🎨 Получить стили</button>
                    <button class="test-btn success" data-test="api-me">👤 Проверить авторизацию</button>
                </div>
                <div id="test-api-result" class="test-result"></div>
            </div>
            
            <div class="test-section">
                <h3>📂 База данных</h3>
                <div class="test-buttons">
                    <button class="test-btn" data-test="db-users">👥 Пользователи</button>
                    <button class="test-btn" data-test="db-exhibits">🖼️ Экспонаты</button>
                    <button class="test-btn" data-test="db-applications">📨 Заявки</button>
                    <button class="test-btn" data-test="db-settings">⚙️ Настройки</button>
                    <button class="test-btn" data-test="db-stats">📊 Статистика</button>
                </div>
                <div id="test-db-result" class="test-result"></div>
            </div>
            
            <div class="test-section">
                <h3>🖼️ Изображения</h3>
                <div class="test-buttons">
                    <button class="test-btn" data-test="image-check">🔍 Проверить все изображения</button>
                    <button class="test-btn" data-test="image-speed">⚡ Скорость загрузки</button>
                </div>
                <div id="test-image-result" class="test-result"></div>
            </div>
            
            <div class="test-section">
                <h3>🚀 Производительность</h3>
                <div class="test-buttons">
                    <button class="test-btn" data-test="perf-api">⏱️ Время ответа API</button>
                    <button class="test-btn" data-test="perf-db">⏱️ Время запросов БД</button>
                </div>
                <div id="test-perf-result" class="test-result"></div>
            </div>
            
            <div class="test-section">
                <h3>⚠️ Опасные операции</h3>
                <div class="test-buttons">
                    <button class="test-btn danger" data-test="create-test-exhibit">➕ Создать тестовый экспонат</button>
                    <button class="test-btn danger" data-test="create-test-editor">👤 Создать тестового редактора</button>
                    <button class="test-btn danger" data-test="cleanup-tests">🗑️ Очистить тестовые данные</button>
                </div>
                <div id="test-danger-result" class="test-result"></div>
            </div>
        </div>
    `;
    
    const modal = createModal({
        title: '🧪 Панель тестирования',
        content: modalContent,
        width: '700px'
    });
    
    attachTestHandlers(modal);
}

// Привязка обработчиков к кнопкам
function attachTestHandlers(modal) {
    // API тесты
    document.querySelector('[data-test="api-health"]').addEventListener('click', () => testApiHealth());
    document.querySelector('[data-test="api-exhibits"]').addEventListener('click', () => testApiExhibits());
    document.querySelector('[data-test="api-styles"]').addEventListener('click', () => testApiStyles());
    document.querySelector('[data-test="api-me"]').addEventListener('click', () => testApiMe());
    
    // БД тесты
    document.querySelector('[data-test="db-users"]').addEventListener('click', () => testDbUsers());
    document.querySelector('[data-test="db-exhibits"]').addEventListener('click', () => testDbExhibits());
    document.querySelector('[data-test="db-applications"]').addEventListener('click', () => testDbApplications());
    document.querySelector('[data-test="db-settings"]').addEventListener('click', () => testDbSettings());
    document.querySelector('[data-test="db-stats"]').addEventListener('click', () => testDbStats());
    
    // Изображения
    document.querySelector('[data-test="image-check"]').addEventListener('click', () => testImageCheck());
    document.querySelector('[data-test="image-speed"]').addEventListener('click', () => testImageSpeed());
    
    // Производительность
    document.querySelector('[data-test="perf-api"]').addEventListener('click', () => testPerfApi());
    document.querySelector('[data-test="perf-db"]').addEventListener('click', () => testPerfDb());
    
    // Опасные операции
    document.querySelector('[data-test="create-test-exhibit"]').addEventListener('click', () => testCreateExhibit());
    document.querySelector('[data-test="create-test-editor"]').addEventListener('click', () => testCreateEditor());
    document.querySelector('[data-test="cleanup-tests"]').addEventListener('click', () => testCleanup());
}

// ============================================================================
// РЕАЛИЗАЦИЯ ТЕСТОВ
// ============================================================================

async function showResult(containerId, title, data, isError = false) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    container.classList.add('show');
    const color = isError ? '#e06c75' : '#4caf50';
    container.innerHTML = `
        <div style="color: ${color}; margin-bottom: 0.5rem;">📌 ${title}</div>
        <pre>${typeof data === 'object' ? JSON.stringify(data, null, 2) : data}</pre>
    `;
    
    setTimeout(() => {
        container.classList.remove('show');
    }, 5000);
}

// API тесты
async function testApiHealth() {
    try {
        const start = Date.now();
        const response = await fetch('/api/test', { credentials: 'include' });
        const duration = Date.now() - start;
        const data = await response.json();
        showResult('test-api-result', `✅ API работает (${duration}ms)`, data);
    } catch (error) {
        showResult('test-api-result', '❌ Ошибка API', error.message, true);
    }
}

async function testApiExhibits() {
    try {
        const response = await fetch('/api/exhibits', { credentials: 'include' });
        const data = await response.json();
        showResult('test-api-result', `✅ Экспонатов: ${data.length}`, data.slice(0, 5));
    } catch (error) {
        showResult('test-api-result', '❌ Ошибка загрузки', error.message, true);
    }
}

async function testApiStyles() {
    try {
        const response = await fetch('/api/site-styles', { credentials: 'include' });
        const data = await response.json();
        showResult('test-api-result', '✅ Стили загружены', data);
    } catch (error) {
        showResult('test-api-result', '❌ Ошибка стилей', error.message, true);
    }
}

async function testApiMe() {
    try {
        const response = await fetch('/api/me', { credentials: 'include' });
        const data = await response.json();
        showResult('test-api-result', '✅ Авторизация', data);
    } catch (error) {
        showResult('test-api-result', '❌ Не авторизован', error.message, true);
    }
}

// БД тесты
async function testDbUsers() {
    try {
        const response = await fetch('/api/admin/editors', { credentials: 'include' });
        const data = await response.json();
        showResult('test-db-result', `👥 Пользователей: ${data.length}`, data);
    } catch (error) {
        showResult('test-db-result', '❌ Ошибка', error.message, true);
    }
}

async function testDbExhibits() {
    try {
        const response = await fetch('/api/exhibits/all', { credentials: 'include' });
        const data = await response.json();
        showResult('test-db-result', `🖼️ Экспонатов: ${data.length}`, data.map(e => ({ id: e.id, title: e.title, status: e.status })));
    } catch (error) {
        showResult('test-db-result', '❌ Ошибка', error.message, true);
    }
}

async function testDbApplications() {
    try {
        const response = await fetch('/api/admin/applications', { credentials: 'include' });
        const data = await response.json();
        showResult('test-db-result', `📨 Заявок: ${data.length}`, data);
    } catch (error) {
        showResult('test-db-result', '❌ Ошибка', error.message, true);
    }
}

async function testDbSettings() {
    try {
        const response = await fetch('/api/site-styles', { credentials: 'include' });
        const data = await response.json();
        showResult('test-db-result', `⚙️ Настроек: ${Object.keys(data).length}`, data);
    } catch (error) {
        showResult('test-db-result', '❌ Ошибка', error.message, true);
    }
}

async function testDbStats() {
    try {
        const users = await fetch('/api/admin/editors', { credentials: 'include' });
        const exhibits = await fetch('/api/exhibits/all', { credentials: 'include' });
        const apps = await fetch('/api/admin/applications', { credentials: 'include' });
        
        const stats = {
            users: (await users.json()).length,
            exhibits: (await exhibits.json()).length,
            applications: (await apps.json()).length
        };
        showResult('test-db-result', '📊 Статистика БД', stats);
    } catch (error) {
        showResult('test-db-result', '❌ Ошибка', error.message, true);
    }
}

// Тесты изображений
async function testImageCheck() {
    const container = document.getElementById('test-image-result');
    container.classList.add('show');
    container.innerHTML = '<div>🔍 Проверка изображений экспонатов...</div>';
    
    try {
        const exhibitsRes = await fetch('/api/exhibits', { credentials: 'include' });
        const exhibits = await exhibitsRes.json();
        
        const results = [];
        for (const exhibit of exhibits.slice(0, 10)) {
            if (exhibit.media_path) {
                try {
                    const imgCheck = await fetch(exhibit.media_path, { method: 'HEAD' });
                    results.push({
                        title: exhibit.title,
                        url: exhibit.media_path.substring(0, 50) + '...',
                        status: imgCheck.ok ? '✅' : '❌',
                        size: imgCheck.headers.get('content-length') ? Math.round(imgCheck.headers.get('content-length') / 1024) + 'KB' : '?'
                    });
                } catch {
                    results.push({ title: exhibit.title, status: '❌', error: 'Не загружается' });
                }
            }
        }
        
        showResult('test-image-result', `📸 Проверено ${results.length} изображений`, results);
    } catch (error) {
        showResult('test-image-result', '❌ Ошибка', error.message, true);
    }
}

async function testImageSpeed() {
    const container = document.getElementById('test-image-result');
    container.classList.add('show');
    container.innerHTML = '<div>⚡ Измерение скорости загрузки...</div>';
    
    try {
        const exhibitsRes = await fetch('/api/exhibits', { credentials: 'include' });
        const exhibits = await exhibitsRes.json();
        
        const speeds = [];
        for (const exhibit of exhibits.slice(0, 5)) {
            if (exhibit.media_path) {
                const start = Date.now();
                try {
                    await fetch(exhibit.media_path, { method: 'HEAD' });
                    const duration = Date.now() - start;
                    speeds.push({ title: exhibit.title, time: duration + 'ms', speed: duration < 100 ? '🚀' : duration < 500 ? '✅' : '⚠️' });
                } catch {
                    speeds.push({ title: exhibit.title, time: 'Ошибка', speed: '❌' });
                }
            }
        }
        
        showResult('test-image-result', '⚡ Скорость загрузки изображений', speeds);
    } catch (error) {
        showResult('test-image-result', '❌ Ошибка', error.message, true);
    }
}

// Тесты производительности
async function testPerfApi() {
    const container = document.getElementById('test-perf-result');
    container.classList.add('show');
    container.innerHTML = '<div>⏱️ Измерение времени API...</div>';
    
    const endpoints = ['/api/exhibits', '/api/site-styles', '/api/test'];
    const results = [];
    
    for (const endpoint of endpoints) {
        const start = Date.now();
        await fetch(endpoint, { credentials: 'include' });
        const duration = Date.now() - start;
        results.push({ endpoint, time: duration + 'ms', grade: duration < 50 ? '🚀' : duration < 200 ? '✅' : '⚠️' });
    }
    
    showResult('test-perf-result', '⏱️ Время ответа API', results);
}

async function testPerfDb() {
    const container = document.getElementById('test-perf-result');
    container.classList.add('show');
    container.innerHTML = '<div>⏱️ Измерение времени БД...</div>';
    
    const queries = ['/api/exhibits', '/api/site-styles', '/api/admin/editors'];
    const results = [];
    
    for (const query of queries) {
        const start = Date.now();
        await fetch(query, { credentials: 'include' });
        const duration = Date.now() - start;
        results.push({ query, time: duration + 'ms', grade: duration < 100 ? '🚀' : duration < 300 ? '✅' : '⚠️' });
    }
    
    showResult('test-perf-result', '⏱️ Время запросов к БД', results);
}

// Опасные операции
async function testCreateExhibit() {
    if (!confirm('Создать тестовый экспонат? (Можно будет удалить позже)')) return;
    
    const container = document.getElementById('test-danger-result');
    container.classList.add('show');
    container.innerHTML = '<div>➕ Создание тестового экспоната...</div>';
    
    try {
        const formData = new FormData();
        formData.append('title', '[TEST] Тестовый экспонат');
        formData.append('year', '2024');
        formData.append('description', 'Это тестовый экспонат, созданный через панель тестирования. Может быть удалён.');
        
        const response = await fetch('/api/exhibits', {
            method: 'POST',
            body: formData,
            credentials: 'include'
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showResult('test-danger-result', '✅ Тестовый экспонат создан', data);
            setTimeout(() => location.reload(), 1500);
        } else {
            showResult('test-danger-result', '❌ Ошибка', data, true);
        }
    } catch (error) {
        showResult('test-danger-result', '❌ Ошибка', error.message, true);
    }
}

async function testCreateEditor() {
    if (!confirm('Создать тестового редактора? (Логин: test_editor, Пароль: test123)')) return;
    
    const container = document.getElementById('test-danger-result');
    container.classList.add('show');
    container.innerHTML = '<div>👤 Создание тестового редактора...</div>';
    
    try {
        const response = await fetch('/api/admin/editors', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: 'test_editor_' + Date.now(),
                password: 'test123',
                email: 'test@example.com'
            }),
            credentials: 'include'
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showResult('test-danger-result', '✅ Тестовый редактор создан', data);
        } else {
            showResult('test-danger-result', '❌ Ошибка', data, true);
        }
    } catch (error) {
        showResult('test-danger-result', '❌ Ошибка', error.message, true);
    }
}

async function testCleanup() {
    if (!confirm('Удалить все тестовые данные? (Экспонаты с [TEST] в названии)')) return;
    
    const container = document.getElementById('test-danger-result');
    container.classList.add('show');
    container.innerHTML = '<div>🗑️ Очистка тестовых данных...</div>';
    
    try {
        const exhibitsRes = await fetch('/api/exhibits/all', { credentials: 'include' });
        const exhibits = await exhibitsRes.json();
        
        const testExhibits = exhibits.filter(e => e.title && e.title.includes('[TEST]'));
        let deleted = 0;
        
        for (const exhibit of testExhibits) {
            const response = await fetch(`/api/admin/exhibits/${exhibit.id}`, {
                method: 'DELETE',
                credentials: 'include'
            });
            if (response.ok) deleted++;
        }
        
        showResult('test-danger-result', `✅ Удалено тестовых экспонатов: ${deleted}`, { deleted });
        
    } catch (error) {
        showResult('test-danger-result', '❌ Ошибка', error.message, true);
    }
}