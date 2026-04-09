class StyleManager {
    constructor() {
        this.styles = {};
        this.styleElement = null;
        this.isAdmin = false;
        this.init();
    }
    
    async init() {
        await this.loadStyles();
        this.applyStyles();
        this.injectStyleElement();
        await this.checkAdminStatus();
    }
    
    async loadStyles() {
        try {
            const response = await fetch('/api/site-styles', {
                credentials: 'include'
            });
            
            if (response.ok) {
                this.styles = await response.json();
                console.log('🎨 Стили загружены с сервера:', this.styles);
            } else {
                console.warn('⚠️ Не удалось загрузить стили, используем значения по умолчанию');
                this.setDefaultStyles();
            }
        } catch (error) {
            console.error('❌ Ошибка загрузки стилей:', error);
            this.setDefaultStyles();
        }
    }
    
    setDefaultStyles() {
        this.styles = {
            'color_primary': '#c9a03d',
            'color_primary_light': '#e0b354',
            'color_primary_dark': '#b8860b',
            'color_bg_dark': '#0a0c10',
            'color_text_primary': '#ffffff',
            'color_text_secondary': '#a0aab8',
            'font_primary': "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
            'border_radius': '12px',
            'transition_speed': '0.25s'
        };
    }
    
    applyStyles() {
        // Применяем CSS-переменные к корневому элементу
        const root = document.documentElement;
        
        for (const [key, value] of Object.entries(this.styles)) {
            // Преобразуем snake_case в kebab-case для CSS переменных
            const cssVar = `--${key.replace(/_/g, '-')}`;
            root.style.setProperty(cssVar, value);
            console.log(`🎨 Установлена переменная ${cssVar}: ${value}`);
        }
        
        // Дополнительные вычисляемые стили
        const computedStyles = this.getComputedStyles();
        for (const [key, value] of Object.entries(computedStyles)) {
            root.style.setProperty(key, value);
        }
    }
    
    getComputedStyles() {
        return {
            '--shadow-sm': `0 4px 12px rgba(0, 0, 0, 0.3)`,
            '--shadow-md': `0 8px 24px rgba(0, 0, 0, 0.4)`,
            '--shadow-lg': `0 16px 48px rgba(0, 0, 0, 0.5)`,
            '--glass-border': `1px solid rgba(201, 160, 61, 0.25)`
        };
    }
    
    injectStyleElement() {
        // Создаем дополнительный style элемент для динамических стилей
        if (this.styleElement) {
            this.styleElement.remove();
        }
        
        this.styleElement = document.createElement('style');
        this.styleElement.id = 'dynamic-styles';
        
        // Добавляем дополнительные CSS правила, основанные на переменных
        this.styleElement.textContent = `
            .admin-btn, .submit-btn, .modal-content, .exhibit-details {
                transition: all var(--transition-speed) cubic-bezier(0.25, 0.8, 0.25, 1);
            }
            
            .timeline-point .year {
                color: var(--color-primary);
            }
            
            .site-header {
                border-bottom: var(--glass-border);
            }
            
            .exhibit-info h2 {
                color: var(--color-primary);
            }
            
            .form-group label {
                color: var(--color-primary-light);
            }
            
            .submit-btn {
                border-color: var(--color-primary);
                color: var(--color-primary);
            }
            
            .submit-btn:hover {
                background: var(--color-primary);
                color: var(--color-bg-dark);
            }
        `;
        
        document.head.appendChild(this.styleElement);
    }
    
    async checkAdminStatus() {
        try {
            const response = await fetch('/api/me', {
                credentials: 'include'
            });
            
            if (response.ok) {
                const data = await response.json();
                this.isAdmin = data.user && data.user.role === 'admin';
                
                if (this.isAdmin) {
                    this.initStyleEditor();
                }
            }
        } catch (error) {
            console.error('Ошибка проверки прав администратора:', error);
        }
    }
    
    initStyleEditor() {
        console.log('🎨 Редактор стилей доступен для администратора');
    }
    
    openStyleEditor() {
        const modalContent = `
            <div class="style-editor">
                <h3 style="margin-bottom: 1.5rem; color: var(--color-primary);">🎨 Редактор стилей сайта</h3>
                <p style="margin-bottom: 1rem; color: var(--color-text-secondary); font-size: 0.9rem;">
                    Изменения применяются глобально для всех посетителей сайта
                </p>
                
                <div class="style-controls">
                    <div class="style-control">
                        <label>Основной цвет</label>
                        <input type="color" id="style_color_primary" value="${this.styles.color_primary || '#c9a03d'}">
                    </div>
                    
                    <div class="style-control">
                        <label>Светлый акцент</label>
                        <input type="color" id="style_color_primary_light" value="${this.styles.color_primary_light || '#e0b354'}">
                    </div>
                    
                    <div class="style-control">
                        <label>Темный акцент</label>
                        <input type="color" id="style_color_primary_dark" value="${this.styles.color_primary_dark || '#b8860b'}">
                    </div>
                    
                    <div class="style-control">
                        <label>Фон сайта</label>
                        <input type="color" id="style_color_bg_dark" value="${this.styles.color_bg_dark || '#0a0c10'}">
                    </div>
                    
                    <div class="style-control">
                        <label>Цвет текста</label>
                        <input type="color" id="style_color_text_primary" value="${this.styles.color_text_primary || '#ffffff'}">
                    </div>
                    
                    <div class="style-control">
                        <label>Вторичный текст</label>
                        <input type="color" id="style_color_text_secondary" value="${this.styles.color_text_secondary || '#a0aab8'}">
                    </div>
                    
                    <div class="style-control">
                        <label>Скругление углов (px)</label>
                        <input type="range" id="style_border_radius" min="0" max="32" value="${parseInt(this.styles.border_radius) || 12}">
                        <span id="border_radius_value">${parseInt(this.styles.border_radius) || 12}px</span>
                    </div>
                    
                    <div class="style-control">
                        <label>Скорость анимации (s)</label>
                        <input type="range" id="style_transition_speed" min="0.1" max="0.8" step="0.05" value="${parseFloat(this.styles.transition_speed) || 0.25}">
                        <span id="transition_speed_value">${parseFloat(this.styles.transition_speed) || 0.25}s</span>
                    </div>
                </div>
                
                <div style="display: flex; gap: 1rem; margin-top: 1.5rem;">
                    <button class="submit-btn" id="save-styles-btn" style="flex: 1;">💾 Сохранить глобально</button>
                    <button class="admin-btn" id="reset-styles-btn" style="flex: 1;">🔄 Сбросить</button>
                </div>
            </div>
        `;
        
        const modal = createModal({
            title: '',
            content: modalContent,
            width: '500px'
        });
        
        // Добавляем обработчики для ползунков
        const radiusSlider = document.getElementById('style_border_radius');
        const radiusValue = document.getElementById('border_radius_value');
        const speedSlider = document.getElementById('style_transition_speed');
        const speedValue = document.getElementById('transition_speed_value');
        
        if (radiusSlider) {
            radiusSlider.oninput = (e) => {
                radiusValue.textContent = `${e.target.value}px`;
                document.documentElement.style.setProperty('--border-radius', `${e.target.value}px`);
            };
        }
        
        if (speedSlider) {
            speedSlider.oninput = (e) => {
                speedValue.textContent = `${e.target.value}s`;
                document.documentElement.style.setProperty('--transition-speed', `${e.target.value}s`);
            };
        }
        
        // Обработчик сохранения
        document.getElementById('save-styles-btn').addEventListener('click', async () => {
            const styles = {
                color_primary: document.getElementById('style_color_primary').value,
                color_primary_light: document.getElementById('style_color_primary_light').value,
                color_primary_dark: document.getElementById('style_color_primary_dark').value,
                color_bg_dark: document.getElementById('style_color_bg_dark').value,
                color_text_primary: document.getElementById('style_color_text_primary').value,
                color_text_secondary: document.getElementById('style_color_text_secondary').value,
                border_radius: document.getElementById('style_border_radius').value + 'px',
                transition_speed: document.getElementById('style_transition_speed').value + 's'
            };
            
            try {
                const response = await fetch('/api/admin/site-styles', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ styles }),
                    credentials: 'include'
                });
                
                const data = await response.json();
                
                if (response.ok) {
                    NotificationManager.show('✅ Стили глобально обновлены!', 'success');
                    this.styles = styles;
                    this.applyStyles();
                    modal.close();
                    
                    // Обновляем страницу через 1 секунду для применения всех изменений
                    setTimeout(() => {
                        location.reload();
                    }, 1000);
                } else {
                    NotificationManager.show(data.error || 'Ошибка сохранения', 'error');
                }
            } catch (error) {
                NotificationManager.show('Ошибка соединения', 'error');
            }
        });
        
        // Обработчик сброса
        document.getElementById('reset-styles-btn').addEventListener('click', async () => {
            try {
                const response = await fetch('/api/admin/site-styles/reset', {
                    method: 'POST',
                    credentials: 'include'
                });
                
                const data = await response.json();
                
                if (response.ok) {
                    NotificationManager.show('✅ Стили сброшены к значениям по умолчанию', 'success');
                    await this.loadStyles();
                    this.applyStyles();
                    modal.close();
                    
                    setTimeout(() => {
                        location.reload();
                    }, 1000);
                } else {
                    NotificationManager.show(data.error || 'Ошибка сброса', 'error');
                }
            } catch (error) {
                NotificationManager.show('Ошибка соединения', 'error');
            }
        });
    }
    
    async refreshStyles() {
        await this.loadStyles();
        this.applyStyles();
    }
}

const styleManager = new StyleManager();

window.styleManager = styleManager;