// Основная логика для панели администратора и редактора
let currentUser = null;
let exhibits = [];

document.addEventListener('DOMContentLoaded', async () => {
  // Проверка авторизации
  try {
    const data = await fetchAPI('/api/me');
    currentUser = data.user;
    
    if (!currentUser) {
      window.location.href = '/views/login.html';
      return;
    }
    
    // Отображение информации о пользователе в шапке
    const userBadge = document.getElementById('userRole');
    const loginBtn = document.getElementById('loginBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    
    if (userBadge) {
      userBadge.textContent = `${currentUser.username} (${currentUser.role === 'admin' ? 'Админ' : 'Редактор'})`;
    }
    
    // Прячем кнопку входа, показываем кнопку выхода
    if (loginBtn) loginBtn.style.display = 'none';
    if (logoutBtn) logoutBtn.style.display = 'inline-block';
    
    // Показ кнопок только для админа
    if (currentUser.role === 'admin') {
      document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'block');
      
      const applicationsBtn = document.querySelector('[data-action="applications"]');
      if (applicationsBtn) {
        applicationsBtn.addEventListener('click', openApplicationsModal);
      }
    }
    
    await loadExhibits();
    
    if (logoutBtn) {
      logoutBtn.addEventListener('click', logout);
    }
    
  } catch (error) {
    console.error('Ошибка авторизации:', error);
    window.location.href = '/views/login.html';
  }
  
  document.querySelector('[data-action="create"]').addEventListener('click', openCreateModal);
  document.querySelector('[data-action="edit"]').addEventListener('click', openEditModal);
  document.querySelector('[data-action="status"]').addEventListener('click', openStatusModal);
  
  if (currentUser?.role === 'admin') {
    document.querySelector('[data-action="editors"]').addEventListener('click', openEditorsModal);
  }
});

// Загрузка всех экспонатов
async function loadExhibits() {
  try {
    const response = await fetch('/api/exhibits/all');
    exhibits = await response.json();
  } catch (error) {
    console.error('Ошибка загрузки экспонатов:', error);
    exhibits = [];
  }
}

// Создание экспоната
function openCreateModal() {
  const modalContent = `
    <div class="create-exhibit-form">
      <div class="form-left">
        <div class="form-group">
          <label>Название экспоната *</label>
          <input type="text" id="exhibit-title" required placeholder="Например: Apple Macintosh">
        </div>
        
        <div class="form-group">
          <label>Год события *</label>
          <input type="number" id="exhibit-year" required placeholder="1984" min="1900" max="2100">
        </div>
        
        <div class="form-group">
          <label>Описание *</label>
          <textarea id="exhibit-description" required placeholder="Подробное описание события..."></textarea>
        </div>
      </div>
      
      <div class="form-right">
        <div class="form-group">
          <label>Медиафайл (картинка/видео) *</label>
          <div id="media-upload-container"></div>
        </div>
        
        <div class="form-group">
          <label>Текстура фона (необязательно)</label>
          <div id="background-upload-container"></div>
        </div>
      </div>
      
      <button class="submit-btn" id="create-exhibit-btn">✨ Создать экспонат</button>
    </div>
  `;
  
  const modal = createModal({
    title: '➕ Создание нового экспоната',
    content: modalContent,
    width: '900px'
  });
  
  const mediaUploader = new FileUploader({
    onUpload: (file, fieldName) => {
      console.log('Загружен файл:', file.name, 'поле:', fieldName);
    }
  });
  
  const backgroundUploader = new FileUploader({
    onUpload: (file, fieldName) => {
      console.log('Загружен фон:', file.name);
    },
    accept: 'image/*'
  });
  
  mediaUploader.createUploadArea('media-upload-container', 'media-preview', 'media');
  backgroundUploader.createUploadArea('background-upload-container', 'background-preview', 'background');
  
  document.getElementById('create-exhibit-btn').addEventListener('click', async () => {
    const title = document.getElementById('exhibit-title').value;
    const year = document.getElementById('exhibit-year').value;
    const description = document.getElementById('exhibit-description').value;
    
    if (!title || !year || !description) {
      NotificationManager.show('Заполните все обязательные поля!', 'error');
      return;
    }
    
    const checkResponse = await fetch('/api/exhibits/check-duplicate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, year, description })
    });
    
    const checkData = await checkResponse.json();
    if (checkData.exists) {
      NotificationManager.show('Экспонат с таким названием, годом и описанием уже существует!', 'error');
      return;
    }
    
    const formData = new FormData();
    formData.append('title', title);
    formData.append('year', year);
    formData.append('description', description);
    
    const mediaInput = document.querySelector('input[name="media"]');
    const bgInput = document.querySelector('input[name="background"]');
    
    if (mediaInput?.files[0]) {
      formData.append('media', mediaInput.files[0]);
    }
    if (bgInput?.files[0]) {
      formData.append('background', bgInput.files[0]);
    }
    
    try {
      const response = await fetch('/api/exhibits', {
        method: 'POST',
        body: formData
      });
      
      const data = await response.json();
      
      if (response.ok) {
        NotificationManager.show(data.message, 'success');
        modal.close();
        await loadExhibits();
      } else {
        NotificationManager.show(data.error || 'Ошибка создания', 'error');
      }
    } catch (error) {
      NotificationManager.show('Ошибка соединения', 'error');
    }
  });
}

// Редактирование экспоната
async function openEditModal() {
  let modalContent = '';
  
  if (currentUser.role === 'admin') {
    modalContent = `
      <div style="display: flex; gap: 20px; margin-bottom: 30px;">
        <select id="edit-mode-select" class="admin-select" style="flex: 1;">
          <option value="edit">✏️ Редактировать существующий</option>
          <option value="pending">⏳ На проверке (созданные)</option>
          <option value="pending-edits">🔄 На проверке (отредактированные)</option>
        </select>
      </div>
      <div id="edit-mode-content"></div>
    `;
  } else {
    modalContent = `
      <div class="form-group">
        <label>Выберите экспонат для редактирования:</label>
        <select id="exhibit-select" class="admin-select">
          <option value="">-- Выберите экспонат --</option>
          ${exhibits.filter(e => e.status === 'approved').map(e => 
            `<option value="${e.id}">${e.title} (${e.year})</option>`
          ).join('')}
        </select>
      </div>
      <div id="edit-form-container"></div>
    `;
  }
  
  const modal = createModal({
    title: '✏️ Редактирование экспонатов',
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
            <label>Выберите экспонат для редактирования:</label>
            <select id="exhibit-select" class="admin-select">
              <option value="">-- Выберите экспонат --</option>
              ${exhibits.filter(e => e.status === 'approved').map(e => 
                `<option value="${e.id}">${e.title} (${e.year})</option>`
              ).join('')}
            </select>
          </div>
          <div id="edit-form-container"></div>
        `;
        
        document.getElementById('exhibit-select').addEventListener('change', (e) => {
          if (e.target.value) {
            loadExhibitForEdit(e.target.value, 'edit-form-container');
          }
        });
        
      } else if (mode === 'pending') {
        await loadPendingCreations(contentDiv);
      } else if (mode === 'pending-edits') {
        await loadPendingEdits(contentDiv);
      }
    });
    
    contentDiv.innerHTML = `
      <div class="form-group">
        <label>Выберите экспонат для редактирования:</label>
        <select id="exhibit-select" class="admin-select">
          <option value="">-- Выберите экспонат --</option>
          ${exhibits.filter(e => e.status === 'approved').map(e => 
            `<option value="${e.id}">${e.title} (${e.year})</option>`
          ).join('')}
        </select>
      </div>
      <div id="edit-form-container"></div>
    `;
    
    document.getElementById('exhibit-select').addEventListener('change', (e) => {
      if (e.target.value) {
        loadExhibitForEdit(e.target.value, 'edit-form-container');
      }
    });
    
  } else {
    document.getElementById('exhibit-select').addEventListener('change', (e) => {
      if (e.target.value) {
        loadExhibitForEdit(e.target.value, 'edit-form-container');
      }
    });
  }
}

// Загрузка экспоната для редактирования
async function loadExhibitForEdit(exhibitId, containerId) {
  try {
    const response = await fetch(`/api/exhibits/${exhibitId}`);
    const exhibit = await response.json();
    
    const container = document.getElementById(containerId);
    
    container.innerHTML = `
      <div class="create-exhibit-form">
        <div class="form-left">
          <div class="form-group">
            <label>Название экспоната *</label>
            <input type="text" id="edit-title" value="${exhibit.title.replace(/"/g, '&quot;')}" required>
          </div>
          
          <div class="form-group">
            <label>Год события *</label>
            <input type="number" id="edit-year" value="${exhibit.year}" required>
          </div>
          
          <div class="form-group">
            <label>Описание *</label>
            <textarea id="edit-description" required>${exhibit.description.replace(/"/g, '&quot;')}</textarea>
          </div>
        </div>
        
        <div class="form-right">
          <div class="form-group">
            <label>Медиафайл</label>
            <div id="edit-media-container"></div>
            ${exhibit.media_path ? `<p>Текущий файл: ${exhibit.media_path.split('/').pop()}</p>` : ''}
          </div>
          
          <div class="form-group">
            <label>Текстура фона</label>
            <div id="edit-background-container"></div>
            ${exhibit.background_path ? `<p>Текущий фон: ${exhibit.background_path.split('/').pop()}</p>` : ''}
          </div>
        </div>
        
        <div style="display: flex; gap: 10px; margin-top: 20px;">
          ${currentUser.role === 'admin' ? `
            <button class="submit-btn" id="delete-exhibit-btn" style="background: #ff6b6b; flex: 1;">🗑️ Удалить экспонат</button>
          ` : ''}
          <button class="submit-btn" id="update-exhibit-btn" style="flex: 2;">💾 Сохранить изменения</button>
        </div>
      </div>
    `;
    
    const mediaUploader = new FileUploader({});
    const bgUploader = new FileUploader({ accept: 'image/*' });
    
    mediaUploader.createUploadArea('edit-media-container', 'edit-media-preview', 'media');
    bgUploader.createUploadArea('edit-background-container', 'edit-background-preview', 'background');
    
    async function checkDuplicate(excludeCurrent = true) {
      const title = document.getElementById('edit-title').value;
      const year = document.getElementById('edit-year').value;
      const description = document.getElementById('edit-description').value;
      
      const checkResponse = await fetch('/api/exhibits/check-duplicate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          title, 
          year, 
          description,
          excludeId: excludeCurrent ? exhibitId : null
        })
      });
      
      const checkData = await checkResponse.json();
      return checkData.exists;
    }
    
    document.getElementById('update-exhibit-btn').addEventListener('click', async () => {
      const title = document.getElementById('edit-title').value;
      const year = document.getElementById('edit-year').value;
      const description = document.getElementById('edit-description').value;
      
      if (!title || !year || !description) {
        NotificationManager.show('Заполните все поля!', 'error');
        return;
      }
      
      const isDuplicate = await checkDuplicate(true);
      if (isDuplicate) {
        NotificationManager.show('Экспонат с таким названием, годом и описанием уже существует!', 'error');
        return;
      }
      
      const formData = new FormData();
      formData.append('title', title);
      formData.append('year', year);
      formData.append('description', description);
      
      const mediaInput = document.querySelector('input[name="media"]');
      const bgInput = document.querySelector('input[name="background"]');
      
      if (mediaInput?.files[0]) {
        formData.append('media', mediaInput.files[0]);
      }
      if (bgInput?.files[0]) {
        formData.append('background', bgInput.files[0]);
      }
      
      try {
        const response = await fetch(`/api/exhibits/${exhibitId}`, {
          method: 'PUT',
          body: formData
        });
        
        const data = await response.json();
        
        if (response.ok) {
          NotificationManager.show(data.message, 'success');
          await loadExhibits();
        } else {
          NotificationManager.show(data.error || 'Ошибка обновления', 'error');
        }
      } catch (error) {
        NotificationManager.show('Ошибка соединения', 'error');
      }
    });
    
    if (currentUser.role === 'admin') {
      document.getElementById('delete-exhibit-btn').addEventListener('click', () => {
        const confirmContent = `
          <div style="text-align: center; padding: 20px;">
            <div style="font-size: 48px; margin-bottom: 20px;">⚠️</div>
            <h3 style="color: #ff6b6b; margin-bottom: 15px;">Удаление экспоната</h3>
            <p style="color: #e0e0e0; margin-bottom: 10px;">Вы уверены, что хотите удалить экспонат?</p>
            <p style="color: #ff6b6b; margin-bottom: 25px; font-weight: bold;">"${exhibit.title}" (${exhibit.year})</p>
            <p style="color: #94a3b8; margin-bottom: 25px; font-size: 0.9rem;">Это действие нельзя отменить.</p>
            <div style="display: flex; gap: 15px; justify-content: center;">
              <button class="approve-btn" id="confirm-delete-yes" style="background: #ff6b6b; color: white; border: none; padding: 10px 30px; border-radius: 8px; font-weight: bold; cursor: pointer;">Да, удалить</button>
              <button class="reject-btn" id="confirm-delete-no" style="background: #4ecdc4; color: #0f172a; border: none; padding: 10px 30px; border-radius: 8px; font-weight: bold; cursor: pointer;">Нет, отмена</button>
            </div>
          </div>
        `;
        
        const confirmModal = createModal({
          title: '⚠️ Подтверждение удаления',
          content: confirmContent,
          width: '450px'
        });
        
        document.getElementById('confirm-delete-yes').addEventListener('click', async () => {
          confirmModal.close();
          
          try {
            const response = await fetch(`/api/admin/exhibits/${exhibitId}`, {
              method: 'DELETE'
            });
            
            const data = await response.json();
            
            if (response.ok) {
              NotificationManager.show('Экспонат успешно удален', 'success');
              setTimeout(() => {
                document.querySelectorAll('.modal-overlay').forEach(modal => modal.remove());
              }, 1500);
              await loadExhibits();
            } else {
              NotificationManager.show(data.error || 'Ошибка удаления', 'error');
            }
          } catch (error) {
            NotificationManager.show('Ошибка соединения', 'error');
          }
        });
        
        document.getElementById('confirm-delete-no').addEventListener('click', () => {
          confirmModal.close();
        });
      });
    }
    
  } catch (error) {
    NotificationManager.show('Ошибка загрузки экспоната', 'error');
  }
}

// Загрузка созданных экспонатов на проверку
async function loadPendingCreations(container) {
  try {
    const response = await fetch('/api/admin/pending-creations');
    const pending = await response.json();
    
    if (pending.length === 0) {
      container.innerHTML = '<p style="color: #94a3b8; text-align: center;">Нет экспонатов на проверку</p>';
      return;
    }
    
    let html = '<div class="pending-list">';
    
    pending.forEach(exhibit => {
      html += `
        <div class="exhibit-card" data-id="${exhibit.id}">
          <h4>${exhibit.title}</h4>
          <div class="meta">${exhibit.year} год | Автор: ${exhibit.creator_name || 'Неизвестно'}</div>
          <div class="description">${exhibit.description}</div>
          ${exhibit.media_path ? `<img src="${exhibit.media_path}" style="max-width: 200px; margin: 10px 0;">` : ''}
          <div style="display: flex; gap: 10px; margin-top: 15px;">
            <button class="approve-btn" onclick="approveExhibit(${exhibit.id})">✅ Одобрить</button>
            <button class="reject-btn" onclick="rejectExhibit(${exhibit.id})">❌ Отклонить</button>
          </div>
        </div>
      `;
    });
    
    html += '</div>';
    container.innerHTML = html;
    
  } catch (error) {
    container.innerHTML = '<p style="color: #ff6b6b;">Ошибка загрузки</p>';
  }
}

// Загрузка отредактированных экспонатов на проверку
async function loadPendingEdits(container) {
  try {
    const response = await fetch('/api/admin/pending-edits');
    const pending = await response.json();
    
    if (pending.length === 0) {
      container.innerHTML = '<p style="color: #94a3b8; text-align: center;">Нет отредактированных экспонатов на проверку</p>';
      return;
    }
    
    let html = '';
    
    for (const edit of pending) {
      const origResponse = await fetch(`/api/exhibits/${edit.original_id}`);
      const original = await origResponse.json();
      
      html += `
        <div class="compare-container">
          <div class="exhibit-card">
            <h4>Оригинал</h4>
            <div class="meta">${original.title} (${original.year})</div>
            <div class="description">${original.description}</div>
            ${original.media_path ? `<img src="${original.media_path}" style="max-width: 150px;">` : ''}
          </div>
          
          <div class="compare-arrow">→</div>
          
          <div class="exhibit-card">
            <h4>Изменения</h4>
            <div class="meta">${edit.title} (${edit.year})</div>
            <div class="description">${edit.description}</div>
            ${edit.media_path ? `<img src="${edit.media_path}" style="max-width: 150px;">` : ''}
          </div>
        </div>
        <div style="display: flex; gap: 10px; justify-content: center; margin: 20px 0;">
          <button class="approve-btn" onclick="approveExhibit(${edit.id})">✅ Одобрить изменения</button>
          <button class="reject-btn" onclick="rejectExhibit(${edit.id})">❌ Отклонить</button>
        </div>
        <hr style="border-color: #334155; margin: 20px 0;">
      `;
    }
    
    container.innerHTML = html;
    
  } catch (error) {
    container.innerHTML = '<p style="color: #ff6b6b;">Ошибка загрузки</p>';
  }
}

// Состояние экспонатов
async function openStatusModal() {
  const modalContent = `
    <div style="display: flex; gap: 20px; margin-bottom: 30px;">
      <select id="status-mode-select" class="admin-select">
        <option value="pending_creation">📝 Созданные (на проверке)</option>
        <option value="pending_edit">✏️ Отредактированные (на проверке)</option>
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

// Загрузка списка по статусу
async function loadStatusList(status, container) {
  try {
    const response = await fetch(`/api/exhibits/status/${status}`);
    const items = await response.json();
    
    if (items.length === 0) {
      container.innerHTML = '<p style="color: #94a3b8; text-align: center;">Нет экспонатов в этом статусе</p>';
      return;
    }
    
    let html = '<div class="exhibits-list">';
    
    items.forEach(item => {
      const date = new Date(item.created_at).toLocaleDateString('ru-RU');
      
      html += `
        <li>
          <div>
            <strong style="color: #4ecdc4;">${item.title}</strong> (${item.year} г.)
            <br>
            <small>Создан: ${date} | Автор: ${item.creator_name || 'Неизвестно'}</small>
            <br>
            <small>Статус: ${getStatusText(item.status)}</small>
          </div>
        </li>
      `;
    });
    
    html += '</div>';
    container.innerHTML = html;
    
  } catch (error) {
    container.innerHTML = '<p style="color: #ff6b6b;">Ошибка загрузки</p>';
  }
}

// ============= РЕДАКТОРЫ =============

async function openEditorsModal() {
  const modalContent = `
    <div style="margin-bottom: 20px;">
      <button class="admin-btn" id="create-editor-btn" style="width: 100%;">➕ Создать нового редактора</button>
    </div>
    <div id="editors-list-container">
      <p>Загрузка списка редакторов...</p>
    </div>
  `;
  
  const modal = createModal({
    title: '👥 Управление редакторами',
    content: modalContent,
    width: '700px'
  });
  
  document.getElementById('create-editor-btn').addEventListener('click', () => {
    openCreateEditorModal();
  });
  
  await loadEditorsList();
}

// Загрузка списка редакторов
async function loadEditorsList() {
  const container = document.getElementById('editors-list-container');
  if (!container) return;
  
  container.innerHTML = '<p style="color: #94a3b8; text-align: center;">Загрузка...</p>';
  
  try {
    const response = await fetch('/api/admin/editors');
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP ошибка ${response.status}`);
    }
    
    const editors = await response.json();
    
    if (!Array.isArray(editors)) {
      container.innerHTML = '<p style="color: #ff6b6b;">Ошибка: сервер вернул некорректные данные</p>';
      return;
    }
    
    if (editors.length === 0) {
      container.innerHTML = '<p style="color: #94a3b8; text-align: center;">Нет редакторов</p>';
      return;
    }
    
    let html = '<div class="editors-list">';
    
    editors.forEach(editor => {
      const date = editor.created_at ? new Date(editor.created_at).toLocaleDateString('ru-RU') : 'неизвестно';
      
      html += `
        <div class="editor-card" data-id="${editor.id}" style="
          background: #0f172a;
          border: 1px solid #334155;
          border-radius: 12px;
          padding: 20px;
          margin-bottom: 15px;
        ">
          <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 15px;">
            <div>
              <h3 style="color: #4ecdc4; margin: 0 0 5px 0;">${editor.username}</h3>
              <p style="color: #94a3b8; margin: 0;">ID: ${editor.id} • Создан: ${date}</p>
            </div>
            <div style="display: flex; gap: 10px;">
              <button class="admin-btn" onclick="editEditor(${editor.id})" style="padding: 8px 15px;">✏️</button>
              <button class="delete-editor" onclick="deleteEditor(${editor.id})" style="padding: 8px 15px;">🗑️</button>
            </div>
          </div>
          
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; background: #1a1f30; padding: 15px; border-radius: 8px;">
            <div>
              <p style="color: #94a3b8; margin: 0 0 5px 0;">Email</p>
              <p style="color: #e0e0e0; margin: 0;">${editor.email || 'Не указан'}</p>
            </div>
            <div>
              <p style="color: #94a3b8; margin: 0 0 5px 0;">Пароль</p>
              <p style="color: #e0e0e0; margin: 0; font-family: monospace;">
                <span class="password-hidden" onclick="togglePassword(this, '${editor.id}')" style="cursor: pointer; background: #0f172a; padding: 3px 10px; border-radius: 4px;">
                  ••••••••
                </span>
                <span class="password-visible-${editor.id}" style="display: none;">Загрузка...</span>
              </p>
              <small style="color: #94a3b8; display: block; margin-top: 5px;">
                Нажмите на точки, чтобы увидеть пароль (доступен 24 часа)
              </small>
            </div>
          </div>
        </div>
      `;
    });
    
    html += '</div>';
    container.innerHTML = html;
    
  } catch (error) {
    console.error('❌ Ошибка загрузки редакторов:', error);
    container.innerHTML = `<p style="color: #ff6b6b;">Ошибка загрузки: ${error.message}</p>`;
  }
}

// Функция для показа/скрытия пароля (ИСПРАВЛЕННАЯ)
window.togglePassword = async function(element, editorId) {
  const visibleSpan = document.querySelector(`.password-visible-${editorId}`);
  if (!visibleSpan) return;
  
  // Если уже виден пароль, просто скрываем
  if (element.style.display === 'none') {
    element.style.display = 'inline';
    visibleSpan.style.display = 'none';
    return;
  }
  
  // Показываем индикатор загрузки
  element.style.display = 'none';
  visibleSpan.style.display = 'inline';
  visibleSpan.textContent = 'Загрузка...';
  
  try {
    const response = await fetch(`/api/admin/editors/${editorId}/password`, {
      credentials: 'include'
    });
    
    if (!response.ok) {
      throw new Error('Ошибка загрузки');
    }
    
    const data = await response.json();
    
    if (data.password) {
      // Показываем реальный пароль
      visibleSpan.textContent = data.password;
      
      // Через 10 секунд скрываем
      setTimeout(() => {
        element.style.display = 'inline';
        visibleSpan.style.display = 'none';
      }, 10000);
    } else {
      // Показываем сообщение
      visibleSpan.textContent = data.message || 'Пароль не найден';
      
      setTimeout(() => {
        element.style.display = 'inline';
        visibleSpan.style.display = 'none';
      }, 3000);
    }
    
  } catch (error) {
    console.error('Ошибка:', error);
    visibleSpan.textContent = 'Ошибка загрузки';
    
    setTimeout(() => {
      element.style.display = 'inline';
      visibleSpan.style.display = 'none';
    }, 2000);
  }
};

// Редактирование редактора
window.editEditor = async (id) => {
  try {
    const response = await fetch('/api/admin/editors');
    const editors = await response.json();
    const editor = editors.find(e => e.id === id);
    
    if (!editor) {
      NotificationManager.show('Редактор не найден', 'error');
      return;
    }
    
    const modalContent = `
      <div class="create-exhibit-form" style="grid-template-columns: 1fr;">
        <div class="form-group">
          <label>Имя пользователя (логин)</label>
          <input type="text" id="edit-username" value="${editor.username}" required>
        </div>
        
        <div class="form-group">
          <label>Email</label>
          <input type="email" id="edit-email" value="${editor.email || ''}">
        </div>
        
        <div class="form-group">
          <label>Новый пароль (оставьте пустым, чтобы не менять)</label>
          <input type="text" id="edit-password" placeholder="Введите новый пароль">
        </div>
        
        <button class="submit-btn" id="save-editor-changes-btn">💾 Сохранить изменения</button>
      </div>
    `;
    
    const modal = createModal({
      title: '✏️ Редактирование редактора',
      content: modalContent,
      width: '500px'
    });
    
    document.getElementById('save-editor-changes-btn').addEventListener('click', async () => {
      const newUsername = document.getElementById('edit-username').value;
      const newEmail = document.getElementById('edit-email').value;
      const newPassword = document.getElementById('edit-password').value;
      
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
          NotificationManager.show('Редактор обновлен', 'success');
          modal.close();
          await loadEditorsList();
        } else {
          NotificationManager.show(data.error || 'Ошибка обновления', 'error');
        }
      } catch (error) {
        NotificationManager.show('Ошибка соединения', 'error');
      }
    });
    
  } catch (error) {
    NotificationManager.show('Ошибка загрузки данных', 'error');
  }
};

// Создание редактора
function openCreateEditorModal() {
  const modalContent = `
    <div class="create-exhibit-form" style="grid-template-columns: 1fr;">
      <div class="form-group">
        <label>Имя пользователя (логин) *</label>
        <input type="text" id="editor-username" required placeholder="editor123">
      </div>
      
      <div class="form-group">
        <label>Пароль *</label>
        <input type="text" id="editor-password" required placeholder="Введите пароль" value="${generatePassword()}">
        <small style="color: #94a3b8;">Этот пароль будет отправлен пользователю в Telegram</small>
      </div>
      
      <div class="form-group">
        <label>Email (необязательно)</label>
        <input type="email" id="editor-email" placeholder="editor@example.com">
      </div>
      
      <div class="form-group">
        <label>Telegram Chat ID (необязательно)</label>
        <input type="text" id="editor-telegram" placeholder="123456789">
        <small style="color: #94a3b8;">Если не указан, данные не отправляются в Telegram</small>
      </div>
      
      <button class="submit-btn" id="save-editor-btn">👤 Создать редактора</button>
    </div>
  `;
  
  const modal = createModal({
    title: '➕ Создание редактора',
    content: modalContent,
    width: '500px'
  });
  
  document.getElementById('save-editor-btn').addEventListener('click', async () => {
    const username = document.getElementById('editor-username').value;
    const password = document.getElementById('editor-password').value;
    const email = document.getElementById('editor-email').value;
    const telegramId = document.getElementById('editor-telegram').value;
    
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
        })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        NotificationManager.show(
          data.telegramSent 
            ? '✅ Редактор создан! Данные отправлены в Telegram.' 
            : '✅ Редактор создан! (Telegram не отправлен)',
          'success'
        );
        modal.close();
        await loadEditorsList();
      } else {
        NotificationManager.show(data.error || 'Ошибка создания', 'error');
      }
    } catch (error) {
      NotificationManager.show('Ошибка соединения', 'error');
    }
  });
}

// Удаление редактора
window.deleteEditor = async (id) => {
  const confirmContent = `
    <div style="text-align: center; padding: 20px;">
      <div style="font-size: 48px; margin-bottom: 20px;">⚠️</div>
      <h3 style="color: #ff6b6b; margin-bottom: 15px;">Удаление редактора</h3>
      <p style="color: #e0e0e0; margin-bottom: 25px;">Вы уверены, что хотите удалить этого редактора?</p>
      <div style="display: flex; gap: 15px; justify-content: center;">
        <button class="approve-btn" id="confirm-delete-yes" style="background: #ff6b6b; color: white;">Да, удалить</button>
        <button class="reject-btn" id="confirm-delete-no" style="background: #4ecdc4; color: #0f172a;">Нет, отмена</button>
      </div>
    </div>
  `;
  
  const confirmModal = createModal({
    title: '⚠️ Подтверждение',
    content: confirmContent,
    width: '400px'
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
        throw new Error(error.error || 'Ошибка удаления');
      }
      
      NotificationManager.show('Редактор удален', 'success');
      await loadEditorsList();
      
    } catch (error) {
      NotificationManager.show(error.message, 'error');
    }
  });
  
  document.getElementById('confirm-delete-no').addEventListener('click', () => {
    confirmModal.close();
  });
};

// ============= ЗАЯВКИ =============

async function openApplicationsModal() {
  try {
    console.log('Загрузка заявок...');
    const response = await fetch('/api/admin/applications');
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const applications = await response.json();
    console.log('Получены заявки:', applications);
    
    let content = `
      <div style="margin-bottom: 20px;">
        <h3 style="color: #4ecdc4;">Всего заявок: ${applications.length}</h3>
      </div>
      <div class="applications-list">
    `;
    
    if (applications.length === 0) {
      content += '<p style="color: #94a3b8; text-align: center;">Нет заявок</p>';
    } else {
      applications.forEach(app => {
        const date = new Date(app.created_at).toLocaleString('ru-RU');
        const statusColor = app.status === 'pending' ? '#ffe66d' : 
                           app.status === 'approved' ? '#4ecdc4' : '#ff6b6b';
        
        content += `
          <div class="application-card" data-id="${app.id}" style="
            background: #0f172a;
            border-left: 4px solid ${statusColor};
            padding: 15px;
            margin-bottom: 15px;
            border-radius: 8px;
          ">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div>
                <strong style="color: #4ecdc4; font-size: 1.1rem;">${app.full_name}</strong>
                <span style="background: ${statusColor}; color: #0f172a; padding: 2px 8px; border-radius: 12px; margin-left: 10px; font-size: 0.8rem;">
                  ${app.status === 'pending' ? '⏳ Ожидает' : app.status === 'approved' ? '✅ Одобрено' : '❌ Отклонено'}
                </span>
              </div>
              <small style="color: #94a3b8;">${date}</small>
            </div>
            
            <div style="margin-top: 10px;">
              <p><span style="color: #94a3b8;">Логин:</span> ${app.username}</p>
              <p><span style="color: #94a3b8;">Email:</span> ${app.email || 'Не указан'}</p>
              <p><span style="color: #94a3b8;">Telegram ID:</span> <code>${app.telegram_chat_id || 'Нет'}</code></p>
              <p><span style="color: #94a3b8;">Причина:</span> ${app.reason}</p>
            </div>
            
            ${app.status === 'pending' ? `
            <div style="display: flex; gap: 10px; margin-top: 15px;">
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
      title: '📨 Заявки на редакторов',
      content: content,
      width: '700px'
    });
    
  } catch (error) {
    console.error('Детали ошибки:', error);
    NotificationManager.show('Ошибка загрузки заявок: ' + error.message, 'error');
  }
}

window.openCreateEditorFromApplicationModal = async (id) => {
  const confirmContent = `
    <div style="text-align: center; padding: 20px;">
      <div style="font-size: 48px; margin-bottom: 20px;">✅</div>
      <h3 style="color: #4ecdc4; margin-bottom: 15px;">Одобрение заявки</h3>
      <p style="color: #e0e0e0; margin-bottom: 25px;">Вы уверены, что хотите одобрить эту заявку и создать редактора?</p>
      <div style="display: flex; gap: 15px; justify-content: center;">
        <button class="approve-btn" id="confirm-approve-yes" style="background: #4ecdc4; color: #0f172a; border: none; padding: 10px 30px; border-radius: 8px; font-weight: bold; cursor: pointer;">Да, одобрить</button>
        <button class="reject-btn" id="confirm-approve-no" style="background: #ff6b6b; color: white; border: none; padding: 10px 30px; border-radius: 8px; font-weight: bold; cursor: pointer;">Нет, отмена</button>
      </div>
    </div>
  `;
  
  const confirmModal = createModal({
    title: '⚠️ Подтверждение действия',
    content: confirmContent,
    width: '400px'
  });
  
  document.getElementById('confirm-approve-yes').addEventListener('click', async () => {
    confirmModal.close();
    
    try {
      const response = await fetch(`/api/admin/applications/${id}`);
      const application = await response.json();
      
      const plainPassword = generatePassword();
      
      const modalContent = `
        <div class="create-exhibit-form" style="grid-template-columns: 1fr;">
          <div class="form-group">
            <label>Имя пользователя (логин)</label>
            <input type="text" id="editor-username" value="${application.username}" readonly style="background: #1a1f30;">
          </div>
          
          <div class="form-group">
            <label>Пароль *</label>
            <input type="text" id="editor-password" value="${plainPassword}" style="background: #1a1f30; font-family: monospace;">
            <small style="color: #94a3b8;">Этот пароль будет отправлен пользователю в Telegram</small>
          </div>
          
          <div class="form-group">
            <label>Telegram Chat ID</label>
            <input type="text" id="editor-telegram" value="${application.telegram_chat_id || ''}" readonly style="background: #1a1f30;">
          </div>
          
          <div class="form-group">
            <label>Email</label>
            <input type="text" id="editor-email" value="${application.email || ''}" readonly style="background: #1a1f30;">
          </div>
          
          <button class="submit-btn" id="save-editor-btn">👤 Создать редактора и одобрить заявку</button>
        </div>
      `;
      
      const modal = createModal({
        title: '➕ Одобрение заявки и создание редактора',
        content: modalContent,
        width: '500px'
      });
      
      document.getElementById('save-editor-btn').addEventListener('click', async () => {
        const finalPassword = document.getElementById('editor-password').value;
        
        const createResponse = await fetch('/api/admin/editors', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: application.username,
            password: finalPassword,
            email: application.email,
            telegramId: application.telegram_chat_id
          })
        });
        
        const createData = await createResponse.json();
        
        if (createResponse.ok) {
          await fetch(`/api/admin/applications/${id}/approve`, { method: 'POST' });
          
          NotificationManager.show(
            `✅ Редактор создан! Пароль: ${finalPassword}\nДанные отправлены в Telegram.`, 
            'success'
          );
          modal.close();
          
          setTimeout(() => openApplicationsModal(), 1500);
        } else {
          NotificationManager.show(createData.error || 'Ошибка создания', 'error');
        }
      });
      
    } catch (error) {
      console.error('Ошибка:', error);
      NotificationManager.show('Ошибка загрузки заявки', 'error');
    }
  });
  
  document.getElementById('confirm-approve-no').addEventListener('click', () => {
    confirmModal.close();
  });
};

window.rejectApplication = async (id) => {
  const confirmContent = `
    <div style="text-align: center; padding: 20px;">
      <div style="font-size: 48px; margin-bottom: 20px;">❌</div>
      <h3 style="color: #ff6b6b; margin-bottom: 15px;">Отклонение заявки</h3>
      <p style="color: #e0e0e0; margin-bottom: 25px;">Вы уверены, что хотите отклонить эту заявку?</p>
      <div style="display: flex; gap: 15px; justify-content: center;">
        <button class="approve-btn" id="confirm-reject-yes" style="background: #ff6b6b; color: white; border: none; padding: 10px 30px; border-radius: 8px; font-weight: bold; cursor: pointer;">Да, отклонить</button>
        <button class="reject-btn" id="confirm-reject-no" style="background: #4ecdc4; color: #0f172a; border: none; padding: 10px 30px; border-radius: 8px; font-weight: bold; cursor: pointer;">Нет, отмена</button>
      </div>
    </div>
  `;
  
  const confirmModal = createModal({
    title: '⚠️ Подтверждение действия',
    content: confirmContent,
    width: '400px'
  });
  
  document.getElementById('confirm-reject-yes').addEventListener('click', async () => {
    confirmModal.close();
    
    try {
      const response = await fetch(`/api/admin/applications/${id}/reject`, {
        method: 'POST'
      });
      const data = await response.json();
      
      if (response.ok) {
        NotificationManager.show('Заявка отклонена', 'info');
        setTimeout(() => openApplicationsModal(), 1500);
      } else {
        NotificationManager.show(data.error || 'Ошибка', 'error');
      }
    } catch (error) {
      NotificationManager.show('Ошибка соединения', 'error');
    }
  });
  
  document.getElementById('confirm-reject-no').addEventListener('click', () => {
    confirmModal.close();
  });
};

// Генерация пароля
function generatePassword(length = 8) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars[Math.floor(Math.random() * chars.length)];
  }
  return password;
}

// Текст статуса
function getStatusText(status) {
  const statusMap = {
    'pending_creation': '⏳ На проверке (создан)',
    'pending_edit': '🔄 На проверке (изменен)',
    'approved': '✅ Одобрен',
    'rejected': '❌ Отклонен'
  };
  return statusMap[status] || status;
}

// Одобрение экспоната
window.approveExhibit = async (id) => {
  try {
    const response = await fetch(`/api/admin/approve/${id}`, {
      method: 'POST'
    });
    const data = await response.json();
    
    if (response.ok) {
      NotificationManager.show('Экспонат одобрен!', 'success');
      setTimeout(() => location.reload(), 1500);
    } else {
      NotificationManager.show(data.error || 'Ошибка', 'error');
    }
  } catch (error) {
    NotificationManager.show('Ошибка соединения', 'error');
  }
};

// Отклонение экспоната
window.rejectExhibit = async (id) => {
  try {
    const response = await fetch(`/api/admin/reject/${id}`, {
      method: 'POST'
    });
    const data = await response.json();
    
    if (response.ok) {
      NotificationManager.show('Экспонат отклонен', 'info');
      setTimeout(() => location.reload(), 1500);
    } else {
      NotificationManager.show(data.error || 'Ошибка', 'error');
    }
  } catch (error) {
    NotificationManager.show('Ошибка соединения', 'error');
  }
};

// Выход из системы
async function logout() {
  const confirmContent = `
    <div style="text-align: center; padding: 20px;">
      <div style="font-size: 48px; margin-bottom: 20px;">👋</div>
      <h3 style="color: #4ecdc4; margin-bottom: 15px;">Выход из системы</h3>
      <p style="color: #e0e0e0; margin-bottom: 25px;">Вы уверены, что хотите выйти?</p>
      <div style="display: flex; gap: 15px; justify-content: center;">
        <button class="approve-btn" id="confirm-logout-yes" style="background: #4ecdc4; color: #0f172a; border: none; padding: 10px 30px; border-radius: 8px; font-weight: bold; cursor: pointer;">Да, выйти</button>
        <button class="reject-btn" id="confirm-logout-no" style="background: #ff6b6b; color: white; border: none; padding: 10px 30px; border-radius: 8px; font-weight: bold; cursor: pointer;">Нет, остаться</button>
      </div>
    </div>
  `;
  
  const confirmModal = createModal({
    title: '⚠️ Подтверждение действия',
    content: confirmContent,
    width: '400px'
  });
  
  document.getElementById('confirm-logout-yes').addEventListener('click', async () => {
    confirmModal.close();
    
    await fetch('/api/logout', { method: 'POST' });
    NotificationManager.show('Выход выполнен', 'info');
    
    window.dispatchEvent(new Event('authChange'));
    
    setTimeout(() => {
      window.location.href = '/views/index.html';
    }, 1000);
  });
  
  document.getElementById('confirm-logout-no').addEventListener('click', () => {
    confirmModal.close();
  });
}