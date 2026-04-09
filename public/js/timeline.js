// ============================================================================
// ВРЕМЕННАЯ ШКАЛА
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
    const timelinePoints = document.getElementById('timeline-points');
    const exhibitDetails = document.getElementById('exhibit-details');
    const closeBtn = document.querySelector('.close-details');
    const overlay = document.querySelector('.background-overlay');
    
    let exhibits = [];
    
    // Загрузка экспонатов с кэшированием
    try {
        exhibits = await fetchWithCache('/api/exhibits', 'exhibits');
        renderTimeline(exhibits);
    } catch (error) {
        console.error('Ошибка загрузки:', error);
    }
    
    // Рендер точек на шкале
    function renderTimeline(exhibits) {
        if (!timelinePoints) return;
        
        timelinePoints.innerHTML = '';
        
        exhibits.forEach(exhibit => {
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
        if (!exhibitDetails || !overlay) return;
        
        // Меняем фон
        if (exhibit.background_path) {
            overlay.style.backgroundImage = `url(${exhibit.background_path})`;
            overlay.style.opacity = '0.3';
        } else {
            overlay.style.backgroundImage = '';
            overlay.style.opacity = '0.15';
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
                video.preload = 'metadata';
                mediaContainer.appendChild(video);
            } else {
                const img = document.createElement('img');
                img.src = exhibit.media_path;
                img.alt = exhibit.title;
                img.loading = 'lazy';
                mediaContainer.appendChild(img);
            }
        } else {
            mediaContainer.innerHTML = '<p>Медиа отсутствует</p>';
        }
        
        exhibitDetails.style.display = 'block';
    }
    
    // Закрыть детали
if (closeBtn) {
    closeBtn.addEventListener('click', () => {
        exhibitDetails.style.display = 'none';
        if (overlay) {
            overlay.style.backgroundImage = '';
            overlay.style.opacity = '0.15';
        }
    });
}
});