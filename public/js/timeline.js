document.addEventListener('DOMContentLoaded', async () => {
    const timelinePoints = document.getElementById('timeline-points');
    const exhibitDetails = document.getElementById('exhibit-details');
    const closeBtn = document.querySelector('.close-details');
    const body = document.getElementById('main-body');
    const overlay = document.querySelector('.background-overlay');
    
    let exhibits = [];
    
    // Загрузка экспонатов с сервера
    try {
        const response = await fetch('/api/exhibits');
        exhibits = await response.json();
        renderTimeline(exhibits);
    } catch (error) {
        console.error('Ошибка загрузки экспонатов:', error);
    }
    
    // Рендер точек на временной шкале
    function renderTimeline(exhibits) {
        timelinePoints.innerHTML = '';
        exhibits.forEach((exhibit, index) => {
            const point = document.createElement('div');
            point.className = 'timeline-point';
            point.dataset.id = exhibit.id;
            point.innerHTML = `
                <span class="year">${exhibit.year}</span>
                <div class="dot"></div>
            `;
            point.addEventListener('click', () => showExhibitDetails(exhibit));
            timelinePoints.appendChild(point);
        });
    }
    
    // Показать детали экспоната
    function showExhibitDetails(exhibit) {
        // Меняем фон
        if (exhibit.background_path) {
            overlay.style.backgroundImage = `url(${exhibit.background_path})`;
            overlay.style.opacity = '0.3';
        } else {
            // Дефолтный фон в стиле "Матрицы"
            overlay.style.backgroundImage = 'url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MCIgaGVpZ2h0PSI4MCIgdmlld0JveD0iMCAwIDQwIDQwIj48cGF0aCBkPSJNMjAgMTBhMTAgMTAgMCAwIDEgMCAyMCAxMCAxMCAwIDAgMSAwLTIweiIgZmlsbD0iIzBmMCIgb3BhY2l0eT0iMC4xIi8+PC9zdmc+")';
            overlay.style.opacity = '0.2';
        }
        
        // Заполняем данными
        document.getElementById('exhibit-title').textContent = exhibit.title;
        document.getElementById('exhibit-year').textContent = exhibit.year;
        document.getElementById('exhibit-description').textContent = exhibit.description;
        
        const mediaContainer = document.getElementById('exhibit-media');
        mediaContainer.innerHTML = '';
        
        if (exhibit.media_path) {
            const ext = exhibit.media_path.split('.').pop().toLowerCase();
            if (['mp4', 'webm', 'ogg'].includes(ext)) {
                const video = document.createElement('video');
                video.src = exhibit.media_path;
                video.controls = true;
                video.autoplay = true;
                mediaContainer.appendChild(video);
            } else {
                const img = document.createElement('img');
                img.src = exhibit.media_path;
                img.alt = exhibit.title;
                mediaContainer.appendChild(img);
            }
        } else {
            mediaContainer.innerHTML = '<p>Медиа отсутствует</p>';
        }
        
        exhibitDetails.style.display = 'block';
    }
    
    // Закрыть детали
    closeBtn.addEventListener('click', () => {
        exhibitDetails.style.display = 'none';
        overlay.style.backgroundImage = '';
        overlay.style.opacity = '0.15';
    });
});