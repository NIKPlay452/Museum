// Кэш для экспонатов
let exhibitsCache = [];
let isLoading = false;

document.addEventListener('DOMContentLoaded', async () => {
  const timelinePoints = document.getElementById('timeline-points');
  const exhibitDetails = document.getElementById('exhibit-details');
  const closeBtn = document.querySelector('.close-details');
  const overlay = document.querySelector('.background-overlay');
  
  // Показываем скелетон загрузки
  showSkeleton(timelinePoints);
  
  try {
    const response = await fetch('/api/exhibits', {
      signal: AbortSignal.timeout(8000)
    });
    exhibitsCache = await response.json();
    renderTimeline(exhibitsCache, timelinePoints);
  } catch (error) {
    console.error('Ошибка загрузки:', error);
    timelinePoints.innerHTML = '<p style="color:#ff6b6b; text-align:center;">Ошибка загрузки</p>';
  }
  
  function showSkeleton(container) {
    container.innerHTML = Array(5).fill(0).map(() => `
      <div class="timeline-point" style="opacity:0.5; pointer-events:none;">
        <span class="year" style="background:#334155; width:40px; height:20px; border-radius:4px;"></span>
        <div class="dot" style="background:#334155; border-color:#334155;"></div>
      </div>
    `).join('');
  }
  
  function renderTimeline(exhibits, container) {
    if (!exhibits.length) {
      container.innerHTML = '<p style="color:#94a3b8;">Нет экспонатов</p>';
      return;
    }
    
    container.innerHTML = exhibits.map(exhibit => `
      <div class="timeline-point" data-id="${exhibit.id}">
        <span class="year">${exhibit.year}</span>
        <div class="dot"></div>
      </div>
    `).join('');
    
    container.querySelectorAll('.timeline-point').forEach((point, i) => {
      point.addEventListener('click', () => showExhibitDetails(exhibits[i], overlay, exhibitDetails));
    });
  }
  
  function showExhibitDetails(exhibit, overlay, details) {
    overlay.style.backgroundImage = exhibit.background_path 
      ? `url(${exhibit.background_path})` 
      : 'url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MCIgaGVpZ2h0PSI4MCIgdmlld0JveD0iMCAwIDQwIDQwIj48cGF0aCBkPSJNMjAgMTBhMTAgMTAgMCAwIDEgMCAyMCAxMCAxMCAwIDAgMSAwLTIweiIgZmlsbD0iIzBmMCIgb3BhY2l0eT0iMC4xIi8+PC9zdmc+")';
    overlay.style.opacity = exhibit.background_path ? '0.3' : '0.2';
    
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
        video.preload = 'metadata';
        video.style.maxWidth = '100%';
        mediaContainer.appendChild(video);
      } else {
        const img = document.createElement('img');
        img.src = exhibit.media_path;
        img.alt = exhibit.title;
        img.loading = 'lazy';
        img.style.maxWidth = '100%';
        mediaContainer.appendChild(img);
      }
    } else {
      mediaContainer.innerHTML = '<p style="color:#94a3b8;">Нет медиа</p>';
    }
    
    details.style.display = 'block';
    details.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  
  closeBtn.addEventListener('click', () => {
    exhibitDetails.style.display = 'none';
    overlay.style.backgroundImage = '';
    overlay.style.opacity = '0.15';
  });
});