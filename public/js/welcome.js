class WelcomeScreen {
    constructor() {
        this.hasShown = sessionStorage.getItem('welcomeShown');
        this.init();
    }
    
    init() {
        // Показываем приветственный экран только если его еще не показывали в этой сессии
        if (!this.hasShown && window.location.pathname.includes('index.html')) {
            this.show();
        }
    }
    
    show() {
        // Создаем оверлей приветствия
        const overlay = document.createElement('div');
        overlay.className = 'welcome-overlay';
        overlay.innerHTML = `
            <div class="welcome-content">
                <div class="welcome-icon">⌨️</div>
                <h1 class="welcome-title">Музей компьютерных технологий</h1>
                <p class="welcome-text">Добро пожаловать в цифровую экспозицию, посвященную истории развития вычислительной техники</p>
                <button class="welcome-btn" id="welcomeBtn">К временной линии →</button>
            </div>
        `;
        
        document.body.appendChild(overlay);
        
        // Анимация появления
        setTimeout(() => {
            overlay.style.opacity = '1';
        }, 100);
        
        // Обработчик кнопки
        const btn = document.getElementById('welcomeBtn');
        btn.addEventListener('click', () => {
            overlay.style.animation = 'fadeOut 0.3s ease forwards';
            setTimeout(() => {
                overlay.remove();
                sessionStorage.setItem('welcomeShown', 'true');
            }, 300);
        });
    }
}

// Запускаем при загрузке
document.addEventListener('DOMContentLoaded', () => {
    new WelcomeScreen();
});