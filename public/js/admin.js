// ========== ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ==========
let currentUser = null;
let exhibits = [];
let editors = [];
let isLoading = false;

// ========== ИНИЦИАЛИЗАЦИЯ ==========
document.addEventListener('DOMContentLoaded', async () => {
  try {
    currentUser = await checkAuth();
    if (!currentUser) {
      window.location.href = '/views/login.html';
      return;
    }
    
    updateUI();
    await Promise.all([loadExhibits(), loadEditors()]);
    initEventListeners();
    
  } catch (error) {
    console.error('Ошибка инициализации:', error);
    window.location.href = '/views/login.html';
  }
});

function updateUI() {
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

function initEventListeners() {
  document.querySelector('[data-action="create"]')?.addEventListener('click', openCreateModal);
  document.querySelector('[data-action="edit"]')?.addEventListener('click', openEditModal);
  document.querySelector('[data-action="status"]')?.addEventListener('click', openStatusModal);
  
  if (currentUser?.role === 'admin') {
    document.querySelector('[data-action="editors"]')?.addEventListener('click', openEditorsModal);
    document.querySelector('[data-action="applications"]')?.addEventListener('click', openApplicationsModal);
  }
  
  document.getElementById('logoutBtn')?.addEventListener('click', logout);
}

// ========== ЗАГРУЗКА ДАННЫХ ==========
async function loadExhibits(force = false) {
  if (!force && exhibits.length > 0) return exhibits;
  
  try {
    const data = await fetchAPI('/api/exhibits/all');
    exhibits = data || [];
    return exhibits;
  } catch (error) {
    console.error('Ошибка загрузки экспонатов:', error);
    return [];
  }
}

async function loadEditors(force = false) {
  if (!force && editors.length > 0) return editors;
  if (currentUser?.role !== 'admin') return [];
  
  try {
    const data = await fetchAPI('/api/admin/editors');
    editors = data || [];
    return editors;
  } catch (error) {
    console.error('Ошибка загрузки редакторов:', error);
    return [];
  }
}

// ========== СОЗДАНИЕ ЭКСПОНАТА ==========
function openCreateModal() {
  const modalContent = `
    <div class="create-exhibit-form">
      <div class="form-left">
        <div class="form-group">
          <label>Название *</label>
          <input type="text" id="exhibit-title" required>
        </div>
        <div class="form-group">
          <label>Год *</label>
          <input type="number" id="exhibit-year" required min="1900" max="2100">
        </div>
        <div class="form-group">
          <label>Описание *</label>
          <textarea id="exhibit-description" required rows="4"></textarea>
        </div>
      </div>
      <div class="form-right">
        <div class="form-group">
          <label>Медиафайл</label>
          <div id="media-upload-container"></div>
        </div>
        <div class="form-group">
          <label>Текстура фона</label>
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
  
  const mediaUploader = new FileUploader({ onUpload: (f) => console.log('Медиа:', f.name) });
  const bgUploader = new FileUploader({ accept: 'image/*', onUpload: (f) => console.log('Фон:', f.name) });
  
  mediaUploader.createUploadArea('media-upload-container', 'media-preview', 'media');
  bgUploader.createUploadArea('background-upload-container', 'background-preview', 'background');
  
  document.getElementById('create-exhibit-btn').addEventListener('click', async () => {
    const title = document.getElementById('exhibit-title').value;
    const year = document.getElementById('exhibit-year').value;
    const desc = document.getElementById('exhibit-description').value;
    
    if (!title || !year || !desc) {
      NotificationManager.show('Заполните все поля!', 'error');
      return;
    }
    
    const check = await fetchAPI('/api/exhibits/check-duplicate', {
      method: 'POST',
      body: JSON.stringify({ title, year, description: desc })
    }).catch(() => ({ exists: false }));
    
    if (check?.exists) {
      NotificationManager.show('Экспонат уже существует!', 'error');
      return;
    }
    
    const formData = new FormData();
    formData.append('title', title);
    formData.append('year', year);
    formData.append('description', desc);
    
    const mediaInput = document.querySelector('input[name="media"]');
    const bgInput = document.querySelector('input[name="background"]');
    
    if (mediaInput?.files[0]) formData.append('media', mediaInput.files[0]);
    if (bgInput?.files[0]) formData.append('background', bgInput.files[0]);
    
    try {
      const data = await fetch('/api/exhibits', {
        method: 'POST',
        body: formData,
        credentials: 'include'
      }).then(r => r.json());
      
      if (data.id) {
        NotificationManager.show(data.message, 'success');
        modal.close();
        await loadExhibits(true);
      }
    } catch (error) {
      NotificationManager.show('Ошибка создания', 'error');
    }
  });
}

// ========== РЕДАКТИРОВАНИЕ ЭКСПОНАТА ==========
async function openEditModal() {
  if (exhibits.length === 0) await loadExhibits();
  
  const approved = exhibits.filter(e => e.status === 'approved');
  
  const modalContent = currentUser.role === 'admin'
    ? `
      <div style="margin-bottom: 20px;">
        <select id="edit-mode-select" class="admin-select">
          <option value="edit">✏️ Редактировать</option>
          <option value="pending">⏳ На проверке</option>
          <option value="pending-edits">🔄 Изменения</option>
        </select>
      </div>
      <div id="edit-mode-content"></div>
    `
    : `
      <div class="form-group">
        <label>Выберите экспонат:</label>
        <select id="exhibit-select" class="admin-select">
          <option value="">-- Выберите --</option>
          ${approved.map(e => `<option value="${e.id}">${e.title} (${e.year})</option>`).join('')}
        </select>
      </div>
      <div id="edit-form-container"></div>
    `;
  
  const modal = createModal({
    title: '✏️ Редактирование',
    content: modalContent,
    width: '1000px'
  });
  
  if (currentUser.role === 'admin') {
    const modeSelect = document.getElementById('edit-mode-select');
    const contentDiv = document.getElementById('edit-mode-content');
    
    modeSelect.addEventListener('change', async () => {
      const mode = modeSelect.value;
      if (mode === 'edit') {
        contentDiv.innerHTML = `
          <div class="form-group">
            <label>Выберите экспонат:</label>
            <select id="exhibit-select" class="admin-select">
              <option value="">-- Выберите --</option>
              ${approved.map(e => `<option value="${e.id}">${e.title} (${e.year})</option>`).join('')}
            </select>
          </div>
          <div id="edit-form-container"></div>
        `;
        document.getElementById('exhibit-select')?.addEventListener('change', (e) => {
          if (e.target.value) loadExhibitForEdit(e.target.value, 'edit-form-container');
        });
      } else if (mode === 'pending') {
        await loadPendingCreations(contentDiv);
      } else if (mode === 'pending-edits') {
        await loadPendingEdits(contentDiv);
      }
    });
    
    contentDiv.innerHTML = `
      <div class="form-group">
        <label>Выберите экспонат:</label>
        <select id="exhibit-select" class="admin-select">
          <option value="">-- Выберите --</option>
          ${approved.map(e => `<option value="${e.id}">${e.title} (${e.year})</option>`).join('')}
        </select>
      </div>
      <div id="edit-form-container"></div>
    `;
    document.getElementById('exhibit-select')?.addEventListener('change', (e) => {
      if (e.target.value) loadExhibitForEdit(e.target.value, 'edit-form-container');
    });
    
  } else {
    document.getElementById('exhibit-select')?.addEventListener('change', (e) => {
      if (e.target.value) loadExhibitForEdit(e.target.value, 'edit-form-container');
    });
  }
}

async function loadExhibitForEdit(id, containerId) {
  try {
    const exhibit = await fetchAPI(`/api/exhibits/${id}`);
    const container = document.getElementById(containerId);
    if (!container) return;
    
    container.innerHTML = `
      <div class="create-exhibit-form">
        <div class="form-left">
          <div class="form-group">
            <label>Название *</label>
            <input type="text" id="edit-title" value="${exhibit.title.replace(/"/g, '&quot;')}">
          </div>
          <div class="form-group">
            <label>Год *</label>
            <input type="number" id="edit-year" value="${exhibit.year}">
          </div>
          <div class="form-group">
            <label>Описание *</label>
            <textarea id="edit-description" rows="4">${exhibit.description.replace(/"/g, '&quot;')}</textarea>
          </div>
        </div>
        <div class="form-right">
          <div class="form-group">
            <label>Медиа</label>
            <div id="edit-media-container"></div>
            ${exhibit.media_path ? `<p>Текущий: ${exhibit.media_path.split('/').pop()}</p>` : ''}
          </div>
          <div class="form-group">
            <label>Фон</label>
            <div id="edit-background-container"></div>
            ${exhibit.background_path ? `<p>Текущий: ${exhibit.background_path.split('/').pop()}</p>` : ''}
          </div>
        </div>
        <div style="display: flex; gap: 10px;">
          ${currentUser.role === 'admin' ? `
            <button class="submit-btn" id="delete-exhibit-btn" style="background:#ff6b6b; flex:1;">🗑️ Удалить</button>
          ` : ''}
          <button class="submit-btn" id="update-exhibit-btn" style="flex:2;">💾 Сохранить</button>
        </div>
      </div>
    `;
    
    new FileUploader({}).createUploadArea('edit-media-container', 'edit-media-preview', 'media');
    new FileUploader({ accept: 'image/*' }).createUploadArea('edit-background-container', 'edit-background-preview', 'background');
    
    document.getElementById('update-exhibit-btn')?.addEventListener('click', () => updateExhibit(id, exhibit));
    
    if (currentUser.role === 'admin') {
      document.getElementById('delete-exhibit-btn')?.addEventListener('click', () => deleteExhibit(id, exhibit));
    }
    
  } catch (error) {
    NotificationManager.show('Ошибка загрузки', 'error');
  }
}

async function updateExhibit(id, oldExhibit) {
  const title = document.getElementById('edit-title')?.value;
  const year = document.getElementById('edit-year')?.value;
  const desc = document.getElementById('edit-description')?.value;
  
  if (!title || !year || !desc) {
    NotificationManager.show('Заполните все поля!', 'error');
    return;
  }
  
  const check = await fetchAPI('/api/exhibits/check-duplicate', {
    method: 'POST',
    body: JSON.stringify({ title, year, description: desc, excludeId: id })
  }).catch(() => ({ exists: false }));
  
  if (check?.exists) {
    NotificationManager.show('Экспонат уже существует!', 'error');
    return;
  }
  
  const formData = new FormData();
  formData.append('title', title);
  formData.append('year', year);
  formData.append('description', desc);
  
  const mediaInput = document.querySelector('input[name="media"]');
  const bgInput = document.querySelector('input[name="background"]');
  
  if (mediaInput?.files[0]) formData.append('media', mediaInput.files[0]);
  if (bgInput?.files[0]) formData.append('background', bgInput.files[0]);
  
  try {
    const data = await fetch(`/api/exhibits/${id}`, {
      method: 'PUT',
      body: formData,
      credentials: 'include'
    }).then(r => r.json());
    
    NotificationManager.show(data.message || 'Сохранено', 'success');
    await loadExhibits(true);
    
  } catch (error) {
    NotificationManager.show('Ошибка сохранения', 'error');
  }
}

function deleteExhibit(id, exhibit) {
  const modal = createModal({
    title: '⚠️ Подтверждение',
    content: `
      <div style="text-align:center">
        <div style="font-size:48px; margin-bottom:20px;">⚠️</div>
        <h3 style="color:#ff6b6b">Удаление экспоната</h3>
        <p>Вы уверены?</p>
        <p><strong>"${exhibit.title}" (${exhibit.year})</strong></p>
        <p style="color:#94a3b8; font-size:0.9rem">Это действие нельзя отменить.</p>
        <div style="display:flex; gap:15px; justify-content:center; margin-top:20px">
          <button class="approve-btn" id="confirm-delete-yes" style="background:#ff6b6b; color:white">Да, удалить</button>
          <button class="reject-btn" id="confirm-delete-no" style="background:#4ecdc4; color:#0f172a">Нет</button>
        </div>
      </div>
    `,
    width: '400px'
  });
  
  document.getElementById('confirm-delete-yes')?.addEventListener('click', async () => {
    modal.close();
    try {
      await fetchAPI(`/api/admin/exhibits/${id}`, { method: 'DELETE' });
      NotificationManager.show('Экспонат удален', 'success');
      document.querySelectorAll('.modal-overlay').forEach(m => m.remove());
      await loadExhibits(true);
    } catch (error) {
      NotificationManager.show('Ошибка удаления', 'error');
    }
  });
  
  document.getElementById('confirm-delete-no')?.addEventListener('click', () => modal.close());
}

// ========== ЗАГРУЗКА НА ПРОВЕРКУ ==========
async function loadPendingCreations(container) {
  try {
    const pending = await fetchAPI('/api/admin/pending-creations');
    container.innerHTML = pending.length 
      ? pending.map(e => `
        <div class="exhibit-card">
          <h4>${e.title}</h4>
          <div class="meta">${e.year} | ${e.creator_name || 'Неизвестно'}</div>
          <div class="description">${e.description}</div>
          ${e.media_path ? `<img src="${e.media_path}" style="max-width:200px; margin:10px 0;" loading="lazy">` : ''}
          <div style="display:flex; gap:10px; margin-top:15px;">
            <button class="approve-btn" onclick="approveExhibit(${e.id})">✅ Одобрить</button>
            <button class="reject-btn" onclick="rejectExhibit(${e.id})">❌ Отклонить</button>
          </div>
        </div>
      `).join('')
      : '<p style="color:#94a3b8; text-align:center;">Нет на проверку</p>';
  } catch {
    container.innerHTML = '<p style="color:#ff6b6b;">Ошибка загрузки</p>';
  }
}

async function loadPendingEdits(container) {
  try {
    const pending = await fetchAPI('/api/admin/pending-edits');
    if (!pending.length) {
      container.innerHTML = '<p style="color:#94a3b8; text-align:center;">Нет изменений</p>';
      return;
    }
    
    let html = '';
    for (const edit of pending) {
      const original = await fetchAPI(`/api/exhibits/${edit.original_id}`).catch(() => null);
      html += `
        <div class="compare-container">
          <div class="exhibit-card">
            <h4>Оригинал</h4>
            <div>${original?.title || '?'} (${original?.year || '?'})</div>
            <div class="description">${original?.description || '?'}</div>
          </div>
          <div class="compare-arrow">→</div>
          <div class="exhibit-card">
            <h4>Изменения</h4>
            <div>${edit.title} (${edit.year})</div>
            <div class="description">${edit.description}</div>
          </div>
        </div>
        <div style="display:flex; gap:10px; justify-content:center; margin:20px 0;">
          <button class="approve-btn" onclick="approveExhibit(${edit.id})">✅ Одобрить</button>
          <button class="reject-btn" onclick="rejectExhibit(${edit.id})">❌ Отклонить</button>
        </div>
        <hr style="border-color:#334155;">
      `;
    }
    container.innerHTML = html;
  } catch {
    container.innerHTML = '<p style="color:#ff6b6b;">Ошибка загрузки</p>';
  }
}

// ========== СТАТУСЫ ЭКСПОНАТОВ ==========
async function openStatusModal() {
  const modal = createModal({
    title: '📊 Состояние экспонатов',
    content: `
      <div style="margin-bottom:20px;">
        <select id="status-mode-select" class="admin-select">
          <option value="pending_creation">📝 Созданные</option>
          <option value="pending_edit">✏️ Измененные</option>
          <option value="approved">✅ Одобренные</option>
          <option value="rejected">❌ Отклоненные</option>
        </select>
      </div>
      <div id="status-list-container">Загрузка...</div>
    `,
    width: '800px'
  });
  
  const modeSelect = document.getElementById('status-mode-select');
  const listContainer = document.getElementById('status-list-container');
  
  modeSelect.addEventListener('change', () => loadStatusList(modeSelect.value, listContainer));
  await loadStatusList('pending_creation', listContainer);
}

async function loadStatusList(status, container) {
  try {
    const items = await fetchAPI(`/api/exhibits/status/${status}`);
    container.innerHTML = items.length
      ? items.map(i => `
        <div style="background:#0f172a; padding:15px; margin-bottom:10px; border-radius:8px;">
          <strong style="color:#4ecdc4;">${i.title}</strong> (${i.year})
          <br><small>Создан: ${new Date(i.created_at).toLocaleDateString()} | Автор: ${i.creator_name || '?'}</small>
          <br><small>Статус: ${getStatusText(i.status)}</small>
        </div>
      `).join('')
      : '<p style="color:#94a3b8;">Нет экспонатов</p>';
  } catch {
    container.innerHTML = '<p style="color:#ff6b6b;">Ошибка загрузки</p>';
  }
}

function getStatusText(status) {
  const map = {
    pending_creation: '⏳ На проверке',
    pending_edit: '🔄 Изменен',
    approved: '✅ Одобрен',
    rejected: '❌ Отклонен'
  };
  return map[status] || status;
}

// ========== РЕДАКТОРЫ ==========
async function openEditorsModal() {
  const modal = createModal({
    title: '👥 Управление редакторами',
    content: `
      <div style="margin-bottom:20px;">
        <button class="admin-btn" id="create-editor-btn" style="width:100%;">➕ Создать редактора</button>
      </div>
      <div id="editors-list-container">Загрузка...</div>
    `,
    width: '700px'
  });
  
  document.getElementById('create-editor-btn')?.addEventListener('click', openCreateEditorModal);
  await loadEditorsList();
}

async function loadEditorsList() {
  const container = document.getElementById('editors-list-container');
  if (!container) return;
  
  try {
    const editors = await loadEditors(true);
    container.innerHTML = editors.length
      ? editors.map(e => `
        <div class="editor-card" style="background:#0f172a; border:1px solid #334155; border-radius:12px; padding:20px; margin-bottom:15px;">
          <div style="display:flex; justify-content:space-between; margin-bottom:15px;">
            <div>
              <h3 style="color:#4ecdc4; margin:0;">${e.username}</h3>
              <p style="color:#94a3b8; margin:5px 0 0;">ID: ${e.id} • ${new Date(e.created_at).toLocaleDateString()}</p>
            </div>
            <div style="display:flex; gap:10px;">
              <button class="admin-btn" onclick="editEditor(${e.id})" style="padding:8px 15px;">✏️</button>
              <button class="delete-editor" onclick="deleteEditor(${e.id})" style="padding:8px 15px;">🗑️</button>
            </div>
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px; background:#1a1f30; padding:15px; border-radius:8px;">
            <div>
              <p style="color:#94a3b8; margin:0 0 5px;">Email</p>
              <p style="color:#e0e0e0; margin:0;">${e.email || 'Не указан'}</p>
            </div>
            <div>
              <p style="color:#94a3b8; margin:0 0 5px;">Пароль</p>
              <p style="color:#e0e0e0; margin:0; font-family:monospace;">
                <span class="password-hidden" onclick="togglePassword(this, ${e.id})" style="cursor:pointer; background:#0f172a; padding:3px 10px; border-radius:4px;">
                  ••••••••
                </span>
                <span class="password-visible-${e.id}" style="display:none;">Загрузка...</span>
              </p>
              <small style="color:#94a3b8;">Нажмите для просмотра</small>
            </div>
          </div>
        </div>
      `).join('')
      : '<p style="color:#94a3b8;">Нет редакторов</p>';
  } catch {
    container.innerHTML = '<p style="color:#ff6b6b;">Ошибка загрузки</p>';
  }
}

window.togglePassword = async (element, id) => {
  const visible = document.querySelector(`.password-visible-${id}`);
  if (!visible) return;
  
  if (element.style.display === 'none') {
    element.style.display = 'inline';
    visible.style.display = 'none';
    return;
  }
  
  element.style.display = 'none';
  visible.style.display = 'inline';
  visible.textContent = 'Загрузка...';
  
  try {
    const data = await fetchAPI(`/api/admin/editors/${id}/password`);
    visible.textContent = data.password || data.message || 'Не найден';
    setTimeout(() => {
      element.style.display = 'inline';
      visible.style.display = 'none';
    }, 5000);
  } catch {
    visible.textContent = 'Ошибка';
    setTimeout(() => {
      element.style.display = 'inline';
      visible.style.display = 'none';
    }, 2000);
  }
};

window.editEditor = async (id) => {
  const editor = editors.find(e => e.id === id);
  if (!editor) {
    NotificationManager.show('Редактор не найден', 'error');
    return;
  }
  
  const modal = createModal({
    title: '✏️ Редактирование',
    content: `
      <div class="create-exhibit-form" style="grid-template-columns:1fr;">
        <div class="form-group">
          <label>Логин</label>
          <input type="text" id="edit-username" value="${editor.username}">
        </div>
        <div class="form-group">
          <label>Email</label>
          <input type="email" id="edit-email" value="${editor.email || ''}">
        </div>
        <div class="form-group">
          <label>Новый пароль (оставьте пустым)</label>
          <input type="text" id="edit-password" placeholder="Новый пароль">
        </div>
        <button class="submit-btn" id="save-editor-changes-btn">💾 Сохранить</button>
      </div>
    `,
    width: '500px'
  });
  
  document.getElementById('save-editor-changes-btn')?.addEventListener('click', async () => {
    const updates = {};
    const newUsername = document.getElementById('edit-username')?.value;
    const newEmail = document.getElementById('edit-email')?.value;
    const newPass = document.getElementById('edit-password')?.value;
    
    if (newUsername && newUsername !== editor.username) updates.username = newUsername;
    if (newEmail !== editor.email) updates.email = newEmail || null;
    if (newPass) updates.password = newPass;
    
    if (!Object.keys(updates).length) {
      NotificationManager.show('Нет изменений', 'info');
      modal.close();
      return;
    }
    
    try {
      await fetchAPI(`/api/admin/editors/${id}`, {
        method: 'PUT',
        body: JSON.stringify(updates)
      });
      NotificationManager.show('Редактор обновлен', 'success');
      modal.close();
      await loadEditors(true);
      await loadEditorsList();
    } catch (error) {
      NotificationManager.show(error.message, 'error');
    }
  });
};

function openCreateEditorModal() {
  const modal = createModal({
    title: '➕ Создание редактора',
    content: `
      <div class="create-exhibit-form" style="grid-template-columns:1fr;">
        <div class="form-group">
          <label>Логин *</label>
          <input type="text" id="editor-username" required>
        </div>
        <div class="form-group">
          <label>Пароль *</label>
          <input type="text" id="editor-password" required value="${generatePassword()}">
        </div>
        <div class="form-group">
          <label>Email</label>
          <input type="email" id="editor-email">
        </div>
        <div class="form-group">
          <label>Telegram ID</label>
          <input type="text" id="editor-telegram" placeholder="123456789">
        </div>
        <button class="submit-btn" id="save-editor-btn">👤 Создать</button>
      </div>
    `,
    width: '500px'
  });
  
  document.getElementById('save-editor-btn')?.addEventListener('click', async () => {
    const username = document.getElementById('editor-username')?.value;
    const password = document.getElementById('editor-password')?.value;
    const email = document.getElementById('editor-email')?.value;
    const telegramId = document.getElementById('editor-telegram')?.value;
    
    if (!username || !password) {
      NotificationManager.show('Заполните логин и пароль!', 'error');
      return;
    }
    
    try {
      const data = await fetchAPI('/api/admin/editors', {
        method: 'POST',
        body: JSON.stringify({ username, password, email: email || null, telegramId: telegramId || null })
      });
      
      NotificationManager.show(data.message || 'Редактор создан', 'success');
      modal.close();
      await loadEditors(true);
      await loadEditorsList();
    } catch (error) {
      NotificationManager.show(error.message, 'error');
    }
  });
}

window.deleteEditor = async (id) => {
  const modal = createModal({
    title: '⚠️ Подтверждение',
    content: `
      <div style="text-align:center">
        <div style="font-size:48px;">⚠️</div>
        <h3 style="color:#ff6b6b">Удалить редактора?</h3>
        <p>Это действие нельзя отменить.</p>
        <div style="display:flex; gap:15px; justify-content:center; margin-top:20px">
          <button class="approve-btn" id="confirm-delete-yes" style="background:#ff6b6b; color:white">Да, удалить</button>
          <button class="reject-btn" id="confirm-delete-no" style="background:#4ecdc4; color:#0f172a">Нет</button>
        </div>
      </div>
    `,
    width: '400px'
  });
  
  document.getElementById('confirm-delete-yes')?.addEventListener('click', async () => {
    modal.close();
    try {
      await fetchAPI(`/api/admin/editors/${id}`, { method: 'DELETE' });
      NotificationManager.show('Редактор удален', 'success');
      await loadEditors(true);
      await loadEditorsList();
    } catch (error) {
      NotificationManager.show(error.message, 'error');
    }
  });
  
  document.getElementById('confirm-delete-no')?.addEventListener('click', () => modal.close());
};

function generatePassword(length = 8) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// ========== ЗАЯВКИ ==========
async function openApplicationsModal() {
  try {
    const applications = await fetchAPI('/api/admin/applications');
    
    const modal = createModal({
      title: '📨 Заявки',
      content: `
        <div style="margin-bottom:20px;">
          <h3 style="color:#4ecdc4;">Всего: ${applications.length}</h3>
        </div>
        <div class="applications-list">
          ${applications.length ? applications.map(app => `
            <div class="application-card" style="background:#0f172a; border-left:4px solid ${app.status === 'pending' ? '#ffe66d' : app.status === 'approved' ? '#4ecdc4' : '#ff6b6b'}; padding:15px; margin-bottom:15px; border-radius:8px;">
              <div style="display:flex; justify-content:space-between;">
                <div>
                  <strong style="color:#4ecdc4;">${app.full_name}</strong>
                  <span style="background:${app.status === 'pending' ? '#ffe66d' : app.status === 'approved' ? '#4ecdc4' : '#ff6b6b'}; color:#0f172a; padding:2px 8px; border-radius:12px; margin-left:10px; font-size:0.8rem;">
                    ${app.status === 'pending' ? '⏳' : app.status === 'approved' ? '✅' : '❌'}
                  </span>
                </div>
                <small>${new Date(app.created_at).toLocaleString()}</small>
              </div>
              <div style="margin-top:10px;">
                <p><span style="color:#94a3b8;">Логин:</span> ${app.username}</p>
                <p><span style="color:#94a3b8;">Email:</span> ${app.email || 'Не указан'}</p>
                <p><span style="color:#94a3b8;">Telegram:</span> ${app.telegram_chat_id || 'Нет'}</p>
                <p><span style="color:#94a3b8;">Причина:</span> ${app.reason}</p>
              </div>
              ${app.status === 'pending' ? `
                <div style="display:flex; gap:10px; margin-top:15px;">
                  <button class="approve-btn" onclick="openCreateEditorFromApplicationModal(${app.id})">✅ Одобрить</button>
                  <button class="reject-btn" onclick="rejectApplication(${app.id})">❌ Отклонить</button>
                </div>
              ` : ''}
            </div>
          `).join('') : '<p style="color:#94a3b8;">Нет заявок</p>'}
        </div>
      `,
      width: '700px'
    });
    
  } catch (error) {
    NotificationManager.show('Ошибка загрузки заявок', 'error');
  }
}

window.openCreateEditorFromApplicationModal = async (id) => {
  const confirmModal = createModal({
    title: '⚠️ Подтверждение',
    content: `
      <div style="text-align:center">
        <div style="font-size:48px;">✅</div>
        <h3 style="color:#4ecdc4">Одобрить заявку?</h3>
        <p>Будет создан редактор.</p>
        <div style="display:flex; gap:15px; justify-content:center; margin-top:20px">
          <button class="approve-btn" id="confirm-approve-yes">Да</button>
          <button class="reject-btn" id="confirm-approve-no">Нет</button>
        </div>
      </div>
    `,
    width: '400px'
  });
  
  document.getElementById('confirm-approve-yes')?.addEventListener('click', async () => {
    confirmModal.close();
    try {
      const app = await fetchAPI(`/api/admin/applications/${id}`);
      const password = generatePassword();
      
      const createModalWin = createModal({
        title: '➕ Создание редактора',
        content: `
          <div class="create-exhibit-form" style="grid-template-columns:1fr;">
            <div class="form-group">
              <label>Логин</label>
              <input type="text" id="editor-username" value="${app.username}" readonly style="background:#1a1f30;">
            </div>
            <div class="form-group">
              <label>Пароль</label>
              <input type="text" id="editor-password" value="${password}" style="background:#1a1f30;">
            </div>
            <div class="form-group">
              <label>Telegram</label>
              <input type="text" id="editor-telegram" value="${app.telegram_chat_id || ''}" readonly style="background:#1a1f30;">
            </div>
            <div class="form-group">
              <label>Email</label>
              <input type="text" id="editor-email" value="${app.email || ''}" readonly style="background:#1a1f30;">
            </div>
            <button class="submit-btn" id="save-editor-btn">👤 Создать</button>
          </div>
        `,
        width: '500px'
      });
      
      document.getElementById('save-editor-btn')?.addEventListener('click', async () => {
        const finalPass = document.getElementById('editor-password')?.value;
        try {
          await fetchAPI('/api/admin/editors', {
            method: 'POST',
            body: JSON.stringify({
              username: app.username,
              password: finalPass,
              email: app.email,
              telegramId: app.telegram_chat_id
            })
          });
          await fetchAPI(`/api/admin/applications/${id}/approve`, { method: 'POST' });
          NotificationManager.show(`Редактор создан! Пароль: ${finalPass}`, 'success');
          createModalWin.close();
          openApplicationsModal();
        } catch (error) {
          NotificationManager.show(error.message, 'error');
        }
      });
      
    } catch (error) {
      NotificationManager.show('Ошибка загрузки', 'error');
    }
  });
  
  document.getElementById('confirm-approve-no')?.addEventListener('click', () => confirmModal.close());
};

window.rejectApplication = async (id) => {
  const modal = createModal({
    title: '⚠️ Подтверждение',
    content: `
      <div style="text-align:center">
        <div style="font-size:48px;">❌</div>
        <h3 style="color:#ff6b6b">Отклонить заявку?</h3>
        <div style="display:flex; gap:15px; justify-content:center; margin-top:20px">
          <button class="approve-btn" id="confirm-reject-yes" style="background:#ff6b6b; color:white">Да</button>
          <button class="reject-btn" id="confirm-reject-no" style="background:#4ecdc4; color:#0f172a">Нет</button>
        </div>
      </div>
    `,
    width: '400px'
  });
  
  document.getElementById('confirm-reject-yes')?.addEventListener('click', async () => {
    modal.close();
    try {
      await fetchAPI(`/api/admin/applications/${id}/reject`, { method: 'POST' });
      NotificationManager.show('Заявка отклонена', 'info');
      openApplicationsModal();
    } catch (error) {
      NotificationManager.show(error.message, 'error');
    }
  });
  
  document.getElementById('confirm-reject-no')?.addEventListener('click', () => modal.close());
};

// ========== ЭКСПОНАТЫ: ОДОБРЕНИЕ/ОТКЛОНЕНИЕ ==========
window.approveExhibit = async (id) => {
  try {
    await fetchAPI(`/api/admin/approve/${id}`, { method: 'POST' });
    NotificationManager.show('Одобрено!', 'success');
    setTimeout(() => location.reload(), 1000);
  } catch (error) {
    NotificationManager.show(error.message, 'error');
  }
};

window.rejectExhibit = async (id) => {
  try {
    await fetchAPI(`/api/admin/reject/${id}`, { method: 'POST' });
    NotificationManager.show('Отклонено', 'info');
    setTimeout(() => location.reload(), 1000);
  } catch (error) {
    NotificationManager.show(error.message, 'error');
  }
};

// ========== ВЫХОД ==========
async function logout() {
  const modal = createModal({
    title: '⚠️ Подтверждение',
    content: `
      <div style="text-align:center">
        <div style="font-size:48px;">👋</div>
        <h3 style="color:#4ecdc4">Выйти?</h3>
        <div style="display:flex; gap:15px; justify-content:center; margin-top:20px">
          <button class="approve-btn" id="confirm-logout-yes">Да</button>
          <button class="reject-btn" id="confirm-logout-no">Нет</button>
        </div>
      </div>
    `,
    width: '400px'
  });
  
  document.getElementById('confirm-logout-yes')?.addEventListener('click', async () => {
    modal.close();
    await fetch('/api/logout', { method: 'POST', credentials: 'include' });
    NotificationManager.show('Выход выполнен', 'info');
    clearCache();
    setTimeout(() => window.location.href = '/views/index.html', 1000);
  });
  
  document.getElementById('confirm-logout-no')?.addEventListener('click', () => modal.close());
}