document.addEventListener('DOMContentLoaded', async () => {
    const timelinePoints = document.getElementById('timeline-points');
    const exhibitDetails = document.getElementById('exhibit-details');
    const closeBtn = document.querySelector('.close-details');
    const overlay = document.querySelector('.background-overlay');
    
    let exhibits = [];
    let currentExhibit = null;
    
    try {
        exhibits = await fetchWithCache('/api/exhibits', 'exhibits');
        renderTimeline(exhibits);
        if (exhibits.length > 0) {
            await showExhibitDetails(exhibits[0]);
        }
    } catch (error) {
        console.error('Ошибка загрузки:', error);
    }
    
    function renderTimeline(exhibits) {
        if (!timelinePoints) return;
        
        timelinePoints.innerHTML = '';
        
        exhibits.forEach((exhibit, index) => {
            const point = document.createElement('div');
            point.className = 'timeline-point';
            point.dataset.id = exhibit.id;
            point.dataset.index = index;
            point.innerHTML = `
                <span class="year">${exhibit.year}</span>
                <div class="dot"></div>
            `;
            point.addEventListener('click', () => showExhibitDetails(exhibit, point));
            timelinePoints.appendChild(point);
        });
        
        if (timelinePoints.firstChild) {
            timelinePoints.firstChild.classList.add('active');
        }
    }
    
    async function showExhibitDetails(exhibit, activePoint = null) {
        if (!exhibitDetails || !overlay) return;
        
        if (currentExhibit && currentExhibit.id === exhibit.id) return;
        
        if (exhibitDetails.style.display === 'block' && currentExhibit) {
            exhibitDetails.classList.add('fade-out');
            await new Promise(resolve => setTimeout(resolve, 200));
            exhibitDetails.classList.remove('fade-out');
        }
        
        document.querySelectorAll('.timeline-point').forEach(point => {
            point.classList.remove('active');
        });
        
        if (activePoint) {
            activePoint.classList.add('active');
        } else {
            const point = document.querySelector(`.timeline-point[data-id="${exhibit.id}"]`);
            if (point) point.classList.add('active');
        }
        
        if (exhibit.background_path) {
            overlay.style.backgroundImage = `url(${exhibit.background_path})`;
            overlay.style.opacity = '0.3';
        } else {
            overlay.style.backgroundImage = '';
            overlay.style.opacity = '0.15';
        }
        
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
        currentExhibit = exhibit;
    }
    
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            exhibitDetails.classList.add('fade-out');
            setTimeout(() => {
                exhibitDetails.style.display = 'none';
                exhibitDetails.classList.remove('fade-out');
                overlay.style.backgroundImage = '';
                overlay.style.opacity = '0.15';
                currentExhibit = null;
            }, 200);
        });
    }
});