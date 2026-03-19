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
        await loadExhibits(true); // Принудительная загрузка при старте
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
        document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'block');
    }
}

function setupAdminButtons() {
    document.querySelector('[data-action="create"]').addEventListener('click', openCreateModal);
    document.querySelector('[data-action="edit"]').addEventListener('click', openEditModal);
    document.querySelector('[data-action="status"]').addEventListener('click', openStatusModal);
    
    if (currentUser?.role === 'admin') {
        document.querySelector('[data-action="editors"]').addEventListener('click', openEditorsModal);
        document.querySelector('[data-action="applications"]').addEventListener('click', openApplicationsModal);
        
        // Принудительная загрузка экспонатов каждые 30 секунд
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
// СОЗДАНИЕ ЭКСПОНАТА (ИСПРАВЛЕННАЯ ВЕРСИЯ)
// ============================================================================

function openCreateModal() {
    const titleId = generateUniqueId('title');
    const yearId = generateUniqueId('year');
    const descId = generateUniqueId('desc');
    
    const modalContent = `
        <div class="create-exhibit-form" style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
            <div class="form-left">
                <div class="form-group" style="margin-bottom: 15px;">
                    <label for="${titleId}" style="color: #4ecdc4; display: block; margin-bottom: 5px;">Название *</label>
                    <input type="text" id="${titleId}" class="exhibit-title" required placeholder="Apple Macintosh" style="width: 100%; padding: 10px; background: #1e293b; border: 1px solid #334155; border-radius: 6px; color: white;">
                </div>
                <div class="form-group" style="margin-bottom: 15px;">
                    <label for="${yearId}" style="color: #4ecdc4; display: block; margin-bottom: 5px;">Год *</label>
                    <input type="number" id="${yearId}" class="exhibit-year" required placeholder="1984" style="width: 100%; padding: 10px; background: #1e293b; border: 1px solid #334155; border-radius: 6px; color: white;">
                </div>
                <div class="form-group" style="margin-bottom: 15px;">
                    <label for="${descId}" style="color: #4ecdc4; display: block; margin-bottom: 5px;">Описание *</label>
                    <textarea id="${descId}" class="exhibit-description" required placeholder="Описание..." style="width: 100%; padding: 10px; background: #1e293b; border: 1px solid #334155; border-radius: 6px; color: white; min-height: 120px;"></textarea>
                </div>
            </div>
            <div class="form-right">
                <div class="form-group" style="margin-bottom: 15px;">
                    <label style="color: #4ecdc4; display: block; margin-bottom: 5px;">Медиафайл *</label>
                    <div id="media-upload-container" style="width: 100%;"></div>
                </div>
                <div class="form-group" style="margin-bottom: 15px;">
                    <label style="color: #4ecdc4; display: block; margin-bottom: 5px;">Фон (необязательно)</label>
                    <div id="background-upload-container" style="width: 100%;"></div>
                </div>
            </div>
            <button class="submit-btn" id="create-exhibit-btn" style="grid-column: span 2; padding: 15px; background: linear-gradient(45deg, #4ecdc4, #2a9d8f); border: none; border-radius: 30px; color: white; font-weight: bold; font-size: 1.1rem; cursor: pointer; margin-top: 10px;">✨ Создать</button>
        </div>
    `;
    
    const modal = createModal({
        title: '➕ Создание экспоната',
        content: modalContent,
        width: '900px'
    });
    
    // Даем время DOM обновиться
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
    console.log('Инициализация загрузчиков...');
    
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

// Обновленная функция инициализации загрузчиков
function initCreateUploaders(mediaContainerId, backgroundContainerId) {
    const mediaUploader = new FileUploader({
        onUpload: (file) => console.log('Медиа:', file.name)
    });
    
    const bgUploader = new FileUploader({
        onUpload: (file) => console.log('Фон:', file.name),
        accept: 'image/*'
    });
    
    mediaUploader.createUploadArea(mediaContainerId, 'media');
    bgUploader.createUploadArea(backgroundContainerId, 'background');
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
            <div style="display: flex; gap: 10px; margin-bottom: 20px;">
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

// ============================================================================
// ЗАГРУЗКА ЭКСПОНАТА ДЛЯ РЕДАКТИРОВАНИЯ
// ============================================================================

async function loadExhibitForEdit(exhibitId, containerId) {
    try {
        const response = await fetch(`/api/exhibits/${exhibitId}`);
        const exhibit = await response.json();
        
        const container = document.getElementById(containerId);
        const titleId = generateUniqueId('edit-title');
        const yearId = generateUniqueId('edit-year');
        const descId = generateUniqueId('edit-desc');
        
        container.innerHTML = getEditFormHTML(exhibit, titleId, yearId, descId);
        
        setTimeout(() => {
            initEditUploaders();
        }, 100);
        
        setupEditHandlers(exhibitId, exhibit, titleId, yearId, descId);
        
    } catch (error) {
        NotificationManager.show('Ошибка загрузки', 'error');
    }
}

function getEditFormHTML(exhibit, titleId, yearId, descId) {
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
                    <div class="edit-media-container"></div>
                    ${exhibit.media_path ? `<p>Текущий: ${exhibit.media_path.split('/').pop()}</p>` : ''}
                </div>
                <div class="form-group">
                    <label>Фон</label>
                    <div class="edit-background-container"></div>
                    ${exhibit.background_path ? `<p>Текущий: ${exhibit.background_path.split('/').pop()}</p>` : ''}
                </div>
            </div>
            <div style="display: flex; gap: 10px; margin-top: 15px;">
                ${currentUser.role === 'admin' ? `
                    <button class="submit-btn" id="delete-exhibit-btn" style="background: #ff6b6b; flex: 1;">🗑️ Удалить</button>
                ` : ''}
                <button class="submit-btn" id="update-exhibit-btn" style="flex: 2;">💾 Сохранить</button>
            </div>
        </div>
    `;
}

function initEditUploaders() {
    const mediaUploader = new FileUploader({});
    const bgUploader = new FileUploader({ accept: 'image/*' });
    
    mediaUploader.createUploadArea('edit-media-container', 'media');
    bgUploader.createUploadArea('edit-background-container', 'background');
}

function setupEditHandlers(exhibitId, exhibit, titleId, yearId, descId) {
    document.getElementById('update-exhibit-btn').addEventListener('click', async () => {
        const title = document.querySelector('.edit-title').value;
        const year = document.querySelector('.edit-year').value;
        const description = document.querySelector('.edit-description').value;
        
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
            const response = await fetch(`/api/exhibits/${exhibitId}`, {
                method: 'PUT',
                body: formData,
                credentials: 'include'
            });
            
            const data = await response.json();
            
            if (response.ok) {
                NotificationManager.show(data.message, 'success');
                clearCache('exhibits');
                await loadExhibits(true);
            } else {
                NotificationManager.show(data.error || 'Ошибка', 'error');
            }
        } catch (error) {
            NotificationManager.show('Ошибка соединения', 'error');
        }
    });
    
    if (currentUser.role === 'admin') {
        setupDeleteHandler(exhibitId, exhibit);
    }
}

function setupDeleteHandler(exhibitId, exhibit) {
    document.getElementById('delete-exhibit-btn').addEventListener('click', () => {
        const confirmContent = `
            <div style="text-align: center; padding: 15px;">
                <div style="font-size: 40px; margin-bottom: 15px;">⚠️</div>
                <h3 style="color: #ff6b6b;">Удаление</h3>
                <p>Удалить "${exhibit.title}" (${exhibit.year})?</p>
                <p style="color: #94a3b8; font-size: 0.9rem;">Действие необратимо</p>
                <div style="display: flex; gap: 10px; justify-content: center; margin-top: 15px;">
                    <button class="approve-btn" id="confirm-delete-yes" style="background: #ff6b6b;">Да</button>
                    <button class="reject-btn" id="confirm-delete-no" style="background: #4ecdc4;">Нет</button>
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

async function loadPendingCreations(container) {
    try {
        const pending = await fetchWithCache('/api/admin/pending-creations', null, true);
        
        if (pending.length === 0) {
            container.innerHTML = '<p style="color: #94a3b8; text-align: center;">Нет на проверке</p>';
            return;
        }
        
        let html = '<div class="pending-list">';
        
        pending.forEach(exhibit => {
            html += `
                <div class="exhibit-card" data-id="${exhibit.id}">
                    <h4>${exhibit.title}</h4>
                    <div class="meta">${exhibit.year} | ${exhibit.creator_name || '?'}</div>
                    <div class="description">${exhibit.description}</div>
                    ${exhibit.media_path ? `<img src="${exhibit.media_path}" style="max-width: 150px;">` : ''}
                    <div style="display: flex; gap: 10px; margin-top: 10px;">
                        <button class="approve-btn" onclick="approveExhibit(${exhibit.id})">✅ Одобрить</button>
                        <button class="reject-btn" onclick="rejectExhibit(${exhibit.id})">❌ Отклонить</button>
                    </div>
                </div>
            `;
        });
        
        html += '</div>';
        container.innerHTML = html;
        
    } catch (error) {
        container.innerHTML = '<p style="color: #ff6b6b;">Ошибка</p>';
    }
}

async function loadPendingEdits(container) {
    try {
        const pending = await fetchWithCache('/api/admin/pending-edits', null, true);
        
        if (pending.length === 0) {
            container.innerHTML = '<p style="color: #94a3b8; text-align: center;">Нет изменений</p>';
            return;
        }
        
        let html = '';
        
        for (const edit of pending) {
            const original = await fetchAPI(`/api/exhibits/${edit.original_id}`);
            
            html += `
                <div class="compare-container">
                    <div class="exhibit-card">
                        <h4>Оригинал</h4>
                        <div class="meta">${original.title} (${original.year})</div>
                        <div class="description">${original.description}</div>
                    </div>
                    <div class="compare-arrow">→</div>
                    <div class="exhibit-card">
                        <h4>Изменения</h4>
                        <div class="meta">${edit.title} (${edit.year})</div>
                        <div class="description">${edit.description}</div>
                    </div>
                </div>
                <div style="display: flex; gap: 10px; justify-content: center; margin: 10px 0;">
                    <button class="approve-btn" onclick="approveExhibit(${edit.id})">✅ Одобрить</button>
                    <button class="reject-btn" onclick="rejectExhibit(${edit.id})">❌ Отклонить</button>
                </div>
                <hr style="border-color: #334155;">
            `;
        }
        
        container.innerHTML = html;
        
    } catch (error) {
        container.innerHTML = '<p style="color: #ff6b6b;">Ошибка</p>';
    }
}

// ============================================================================
// СОСТОЯНИЕ ЭКСПОНАТОВ
// ============================================================================

async function openStatusModal() {
    const modalContent = `
        <div style="display: flex; gap: 10px; margin-bottom: 20px;">
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
        title: '📊 Состояние',
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
            container.innerHTML = '<p style="color: #94a3b8;">Нет экспонатов</p>';
            return;
        }
        
        let html = '<div class="exhibits-list">';
        
        items.forEach(item => {
            const date = formatDate(item.created_at);
            
            html += `
                <li>
                    <strong style="color: #4ecdc4;">${item.title}</strong> (${item.year})
                    <br>
                    <small>${date} | ${item.creator_name || '?'}</small>
                    <br>
                    <small>${getStatusText(item.status)}</small>
                </li>
            `;
        });
        
        html += '</div>';
        container.innerHTML = html;
        
    } catch (error) {
        container.innerHTML = '<p style="color: #ff6b6b;">Ошибка</p>';
    }
}

// ============================================================================
// РАБОТА С РЕДАКТОРАМИ
// ============================================================================

async function openEditorsModal() {
    const modalContent = `
        <div style="margin-bottom: 15px;">
            <button class="admin-btn" id="create-editor-btn" style="width: 100%;">➕ Создать редактора</button>
        </div>
        <div id="editors-list-container">Загрузка...</div>
    `;
    
    const modal = createModal({
        title: '👥 Редакторы',
        content: modalContent,
        width: '700px'
    });
    
    document.getElementById('create-editor-btn').addEventListener('click', openCreateEditorModal);
    await loadEditorsList(true);
}

async function loadEditorsList(forceRefresh = false) {
    const container = document.getElementById('editors-list-container');
    if (!container) return;
    
    container.innerHTML = '<p>Загрузка...</p>';
    
    try {
        const editors = await fetchWithCache('/api/admin/editors', 'editors', forceRefresh);
        
        if (!Array.isArray(editors) || editors.length === 0) {
            container.innerHTML = '<p style="color: #94a3b8;">Нет редакторов</p>';
            return;
        }
        
        let html = '<div class="editors-list">';
        
        editors.forEach(editor => {
            const date = editor.created_at ? formatDate(editor.created_at) : '?';
            
            html += `
                <div class="editor-card" data-id="${editor.id}" style="background: #0f172a; border: 1px solid #334155; border-radius: 10px; padding: 15px; margin-bottom: 10px;">
                    <div style="display: flex; justify-content: space-between; align-items: start;">
                        <div style="flex: 1;">
                            <h3 style="color: #4ecdc4; margin: 0 0 5px;">${editor.username}</h3>
                            <p>Email: ${editor.email || '—'}</p>
                            <p>Создан: ${date}</p>
                            <p>Пароль: 
                                <span class="password-hidden" onclick="togglePassword(this, ${editor.id})" style="cursor: pointer; background: #1a1f30; padding: 2px 8px; border-radius: 4px;">
                                    ••••••••
                                </span>
                                <span class="password-visible-${editor.id}" style="display: none;"></span>
                            </p>
                        </div>
                        <div style="display: flex; gap: 5px;">
                            <button class="admin-btn" onclick="editEditor(${editor.id})" style="padding: 5px 10px;">✏️</button>
                            <button class="delete-editor" onclick="deleteEditor(${editor.id})" style="padding: 5px 10px;">🗑️</button>
                        </div>
                    </div>
                </div>
            `;
        });
        
        html += '</div>';
        container.innerHTML = html;
        
    } catch (error) {
        container.innerHTML = `<p style="color: #ff6b6b;">Ошибка: ${error.message}</p>`;
    }
}

// ============================================================================
// ПОКАЗ ПАРОЛЯ
// ============================================================================

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

// ============================================================================
// РЕДАКТИРОВАНИЕ РЕДАКТОРА
// ============================================================================

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
        <div class="create-exhibit-form" style="grid-template-columns: 1fr;">
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
        title: '✏️ Редактирование',
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

// ============================================================================
// СОЗДАНИЕ РЕДАКТОРА
// ============================================================================

function openCreateEditorModal() {
    const usernameId = generateUniqueId('editor-username');
    const passwordId = generateUniqueId('editor-password');
    const emailId = generateUniqueId('editor-email');
    const telegramId = generateUniqueId('editor-telegram');
    
    const modalContent = `
        <div class="create-exhibit-form" style="grid-template-columns: 1fr;">
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

// ============================================================================
// УДАЛЕНИЕ РЕДАКТОРА
// ============================================================================

window.deleteEditor = async (id) => {
    const confirmContent = `
        <div style="text-align: center; padding: 15px;">
            <div style="font-size: 40px;">⚠️</div>
            <h3 style="color: #ff6b6b;">Удалить редактора?</h3>
            <p>Это действие необратимо</p>
            <div style="display: flex; gap: 10px; justify-content: center; margin-top: 15px;">
                <button class="approve-btn" id="confirm-delete-yes" style="background: #ff6b6b;">Да</button>
                <button class="reject-btn" id="confirm-delete-no" style="background: #4ecdc4;">Нет</button>
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
            <div style="margin-bottom: 15px;">
                <h3 style="color: #4ecdc4;">Всего: ${applications.length}</h3>
            </div>
            <div class="applications-list">
        `;
        
        if (applications.length === 0) {
            content += '<p style="color: #94a3b8;">Нет заявок</p>';
        } else {
            applications.forEach(app => {
                const date = formatDate(app.created_at);
                const statusColor = app.status === 'pending' ? '#ffe66d' : 
                                   app.status === 'approved' ? '#4ecdc4' : '#ff6b6b';
                
                content += `
                    <div class="application-card" data-id="${app.id}" style="border-left-color: ${statusColor};">
                        <div style="display: flex; justify-content: space-between;">
                            <strong>${app.full_name}</strong>
                            <span style="background: ${statusColor}; color: #0f172a; padding: 2px 8px; border-radius: 12px;">
                                ${app.status === 'pending' ? '⏳' : app.status === 'approved' ? '✅' : '❌'}
                            </span>
                        </div>
                        <div>
                            <p>👤 ${app.username}</p>
                            <p>📧 ${app.email || '—'}</p>
                            <p>📱 ${app.telegram_chat_id || '—'}</p>
                            <p>💬 ${app.reason}</p>
                            <p>📅 ${date}</p>
                        </div>
                        ${app.status === 'pending' ? `
                            <div style="display: flex; gap: 10px; margin-top: 10px;">
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
            title: '📨 Заявки',
            content: content,
            width: '700px'
        });
        
    } catch (error) {
        NotificationManager.show('Ошибка загрузки', 'error');
    }
}

// ============================================================================
// СОЗДАНИЕ РЕДАКТОРА ИЗ ЗАЯВКИ
// ============================================================================

window.openCreateEditorFromApplicationModal = async (id) => {
    const confirmContent = `
        <div style="text-align: center; padding: 15px;">
            <div style="font-size: 40px;">✅</div>
            <h3 style="color: #4ecdc4;">Одобрить заявку?</h3>
            <p>Будет создан редактор</p>
            <div style="display: flex; gap: 10px; justify-content: center; margin-top: 15px;">
                <button class="approve-btn" id="confirm-approve-yes" style="background: #4ecdc4;">Да</button>
                <button class="reject-btn" id="confirm-approve-no" style="background: #ff6b6b;">Нет</button>
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
                <div class="create-exhibit-form" style="grid-template-columns: 1fr;">
                    <div class="form-group">
                        <label>Логин</label>
                        <input type="text" value="${application.username}" readonly style="background: #1a1f30;">
                    </div>
                    <div class="form-group">
                        <label for="${passwordId}">Пароль</label>
                        <input type="text" id="${passwordId}" class="editor-password" value="${plainPassword}">
                        <small>Будет отправлен</small>
                    </div>
                    <div class="form-group">
                        <label>Telegram ID</label>
                        <input type="text" value="${application.telegram_chat_id || ''}" readonly>
                    </div>
                    <div class="form-group">
                        <label>Email</label>
                        <input type="text" value="${application.email || ''}" readonly>
                    </div>
                    <button class="submit-btn" id="save-editor-btn">👤 Создать</button>
                </div>
            `;
            
            const modal = createModal({
                title: '➕ Создание из заявки',
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

// ============================================================================
// ОТКЛОНЕНИЕ ЗАЯВКИ
// ============================================================================

window.rejectApplication = async (id) => {
    const confirmContent = `
        <div style="text-align: center; padding: 15px;">
            <div style="font-size: 40px;">❌</div>
            <h3 style="color: #ff6b6b;">Отклонить заявку?</h3>
            <p>Это действие необратимо</p>
            <div style="display: flex; gap: 10px; justify-content: center; margin-top: 15px;">
                <button class="approve-btn" id="confirm-reject-yes" style="background: #ff6b6b;">Да</button>
                <button class="reject-btn" id="confirm-reject-no" style="background: #4ecdc4;">Нет</button>
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
    // Простое подтверждение
    if (!confirm('Вы уверены, что хотите выйти?')) {
        return;
    }
    
    try {
        // Пытаемся отправить запрос на выход (но не ждем ответа)
        fetch('/api/logout', { 
            method: 'POST', 
            credentials: 'include',
            // Игнорируем ответ
        }).catch(() => {
            // Игнорируем ошибки
            console.log('Ошибка при выходе, но продолжаем');
        });
        
        // Показываем уведомление
        NotificationManager.show('Выход выполнен', 'info');
        
        // Просто перенаправляем на страницу входа
        window.location.href = '/views/login.html';
        
    } catch (error) {
        console.error('Ошибка:', error);
        // Даже при ошибке перенаправляем
        window.location.href = '/views/login.html';
    }
}