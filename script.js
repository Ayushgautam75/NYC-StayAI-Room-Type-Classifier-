/* =========================================================
   NYC StayAI — script.js
   Handles: form validation, API calls, result rendering,
   toast notifications, Leaflet map, Chart.js analytics,
   and small UI interactions.
   ========================================================= */

const API_BASE_URL = 'http://127.0.0.1:8000';
const PREDICT_ENDPOINT = `${API_BASE_URL}/predict`;

// Visual language shared across the app: each room type gets a color + emoji.
const ROOM_TYPE_META = {
  'Entire home/apt': { color: '#ff385c', emoji: '🏠', key: 'entire' },
  'Private room':    { color: '#7c5cff', emoji: '🚪', key: 'private' },
  'Shared room':     { color: '#22d3ee', emoji: '🛏️', key: 'shared' }
};

/* ---------------------------------------------------------
   Mobile nav toggle
--------------------------------------------------------- */
const navToggle = document.getElementById('navToggle');
const mainNav = document.getElementById('mainNav');

navToggle.addEventListener('click', () => {
  const isOpen = mainNav.classList.toggle('open');
  navToggle.setAttribute('aria-expanded', String(isOpen));
});

mainNav.querySelectorAll('.nav-link').forEach(link => {
  link.addEventListener('click', () => {
    mainNav.classList.remove('open');
    navToggle.setAttribute('aria-expanded', 'false');
  });
});

/* ---------------------------------------------------------
   Toast notifications (replaces browser alert())
--------------------------------------------------------- */
const toastContainer = document.getElementById('toastContainer');

function showToast({ type = 'success', title, message, duration = 5000 }) {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const icon = type === 'success' ? '✅' : '⚠️';

  toast.innerHTML = `
    <span class="toast-icon">${icon}</span>
    <div class="toast-body">
      <div class="toast-title">${title}</div>
      <div class="toast-msg">${message}</div>
    </div>
    <button class="toast-close" aria-label="Dismiss notification">✕</button>
  `;

  toastContainer.appendChild(toast);

  const removeToast = () => {
    toast.classList.add('hide');
    setTimeout(() => toast.remove(), 300);
  };

  toast.querySelector('.toast-close').addEventListener('click', removeToast);
  setTimeout(removeToast, duration);
}

/* ---------------------------------------------------------
   Form validation
--------------------------------------------------------- */
const form = document.getElementById('predictForm');
const predictBtn = document.getElementById('predictBtn');

const FIELD_RULES = {
  latitude: v => v !== '' && !isNaN(v) && v >= -90 && v <= 90,
  longitude: v => v !== '' && !isNaN(v) && v >= -180 && v <= 180,
  price: v => v !== '' && !isNaN(v) && v >= 0,
  minimum_nights: v => v !== '' && !isNaN(v) && v >= 1,
  number_of_reviews: v => v !== '' && !isNaN(v) && v >= 0,
  reviews_per_month: v => v !== '' && !isNaN(v) && v >= 0,
  calculated_host_listings_count: v => v !== '' && !isNaN(v) && v >= 0,
  availability_365: v => v !== '' && !isNaN(v) && v >= 0 && v <= 365,
  neighbourhood_group: v => v !== '',
  neighbourhood: v => v.trim().length > 0
};

function validateForm(formData) {
  const errors = {};
  for (const [key, rule] of Object.entries(FIELD_RULES)) {
    const value = formData.get(key);
    if (!rule(value)) {
      errors[key] = true;
    }
  }
  return errors;
}

function clearFieldErrors() {
  form.querySelectorAll('.field').forEach(f => f.classList.remove('invalid'));
  form.querySelectorAll('.field-error').forEach(e => (e.textContent = ''));
}

function applyFieldErrors(errors) {
  Object.keys(errors).forEach(key => {
    const input = form.querySelector(`[name="${key}"]`);
    if (!input) return;
    const field = input.closest('.field');
    field.classList.add('invalid');
    const errorEl = form.querySelector(`[data-error-for="${key}"]`);
    if (errorEl) errorEl.textContent = 'Please provide a valid value.';
  });
}

/* ---------------------------------------------------------
   Prediction request + result rendering
--------------------------------------------------------- */
const resultEmpty = document.getElementById('resultEmpty');
const resultContent = document.getElementById('resultContent');
const ringProgress = document.getElementById('ringProgress');
const predictedEmoji = document.getElementById('predictedEmoji');
const predictedRoomType = document.getElementById('predictedRoomType');
const confidenceValue = document.getElementById('confidenceValue');
const probabilityList = document.getElementById('probabilityList');

const RING_CIRCUMFERENCE = 2 * Math.PI * 52; // matches r=52 in the SVG

function setLoading(isLoading) {
  predictBtn.classList.toggle('loading', isLoading);
  predictBtn.disabled = isLoading;
}

function renderPrediction(data) {
  const { predicted_room_type: predictedType, probabilities } = data;
  const meta = ROOM_TYPE_META[predictedType] || { color: '#ff385c', emoji: '🏠' };

  // Reveal result content
  resultEmpty.hidden = true;
  resultContent.hidden = false;

  // Headline
  predictedEmoji.textContent = meta.emoji;
  predictedRoomType.textContent = predictedType;

  const topConfidence = probabilities[predictedType] ?? 0;
  confidenceValue.textContent = `${topConfidence.toFixed(1)}%`;

  // Animate confidence ring
  ringProgress.style.stroke = meta.color;
  const offset = RING_CIRCUMFERENCE - (topConfidence / 100) * RING_CIRCUMFERENCE;
  // Reset then animate on next frame so the transition always fires
  ringProgress.style.strokeDashoffset = RING_CIRCUMFERENCE;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      ringProgress.style.strokeDashoffset = offset;
    });
  });

  // Probability bars, sorted highest first
  const sortedEntries = Object.entries(probabilities).sort((a, b) => b[1] - a[1]);

  probabilityList.innerHTML = '';
  sortedEntries.forEach(([roomType, value], index) => {
    const rowMeta = ROOM_TYPE_META[roomType] || { color: '#9096a8' };
    const isTop = index === 0;

    const row = document.createElement('div');
    row.className = `prob-row${isTop ? ' top-prediction' : ''}`;
    row.innerHTML = `
      <div class="prob-row-top">
        <span class="prob-row-label">
          <span class="prob-dot" style="background:${rowMeta.color}"></span>
          ${roomType}
        </span>
        <span class="prob-row-value">${value.toFixed(1)}%</span>
      </div>
      <div class="prob-track">
        <div class="prob-fill" style="background:${rowMeta.color}"></div>
      </div>
    `;
    probabilityList.appendChild(row);

    // Animate fill width after insertion
    const fillEl = row.querySelector('.prob-fill');
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        fillEl.style.width = `${value}%`;
      });
    });
  });

  // Update map marker with submitted coordinates
  const lat = parseFloat(document.getElementById('latitude').value);
  const lng = parseFloat(document.getElementById('longitude').value);
  if (!isNaN(lat) && !isNaN(lng)) {
    updateMapMarker(lat, lng, predictedType);
  }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearFieldErrors();

  const formData = new FormData(form);
  const errors = validateForm(formData);

  if (Object.keys(errors).length > 0) {
    applyFieldErrors(errors);
    showToast({
      type: 'error',
      title: 'Check the form',
      message: 'Some fields are missing or invalid. Please review the highlighted inputs.'
    });
    return;
  }

  const payload = {
    latitude: parseFloat(formData.get('latitude')),
    longitude: parseFloat(formData.get('longitude')),
    price: parseFloat(formData.get('price')),
    minimum_nights: parseInt(formData.get('minimum_nights'), 10),
    number_of_reviews: parseInt(formData.get('number_of_reviews'), 10),
    reviews_per_month: parseFloat(formData.get('reviews_per_month')),
    calculated_host_listings_count: parseInt(formData.get('calculated_host_listings_count'), 10),
    availability_365: parseInt(formData.get('availability_365'), 10),
    neighbourhood_group: formData.get('neighbourhood_group'),
    neighbourhood: formData.get('neighbourhood').trim()
  };

  setLoading(true);

  try {
    const response = await fetch(PREDICT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Server responded with status ${response.status}`);
    }

    const data = await response.json();

    if (data.status !== 'success') {
      throw new Error('Prediction request did not succeed.');
    }

    renderPrediction(data);
    showToast({
      type: 'success',
      title: 'Prediction complete',
      message: `Predicted room type: ${data.predicted_room_type}.`
    });

  } catch (error) {
    console.error('Prediction request failed:', error);

    const isNetworkError = error instanceof TypeError;
    showToast({
      type: 'error',
      title: 'Unable to connect to prediction server',
      message: isNetworkError
        ? 'Please check that FastAPI is running at 127.0.0.1:8000.'
        : 'Something went wrong while getting a prediction. Please try again.',
      duration: 6500
    });
  } finally {
    setLoading(false);
  }
});

/* ---------------------------------------------------------
   Leaflet map
--------------------------------------------------------- */
let map;
let marker;

function initMap() {
  map = L.map('nycMap', {
    scrollWheelZoom: false
  }).setView([40.7128, -74.0060], 11);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    subdomains: 'abcd',
    maxZoom: 19
  }).addTo(map);
}

function updateMapMarker(lat, lng, predictedType) {
  const meta = ROOM_TYPE_META[predictedType] || { color: '#ff385c', emoji: '🏠' };

  if (marker) {
    map.removeLayer(marker);
  }

  const icon = L.divIcon({
    className: '',
    html: `<div style="
      width:26px;height:26px;border-radius:50%;
      background:${meta.color};
      border:3px solid rgba(255,255,255,0.9);
      box-shadow:0 0 16px ${meta.color};
      display:flex;align-items:center;justify-content:center;
      font-size:13px;">${meta.emoji}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13]
  });

  marker = L.marker([lat, lng], { icon }).addTo(map);
  marker.bindPopup(`<strong>Predicted:</strong> ${predictedType}`).openPopup();
  map.setView([lat, lng], 13, { animate: true });
}

/* ---------------------------------------------------------
   Chart.js analytics (demo/static data — clearly labeled in UI)
--------------------------------------------------------- */
function initCharts() {
  const textMuted = '#7d8398';
  const gridColor = 'rgba(255,255,255,0.06)';

  Chart.defaults.color = textMuted;
  Chart.defaults.font.family = "'Inter', sans-serif";

  // Room Type Distribution — demo data
  new Chart(document.getElementById('roomTypeChart'), {
    type: 'doughnut',
    data: {
      labels: ['Entire home/apt', 'Private room', 'Shared room'],
      datasets: [{
        data: [52, 45, 3],
        backgroundColor: ['#ff385c', '#7c5cff', '#22d3ee'],
        borderColor: '#0a0e17',
        borderWidth: 3
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'bottom', labels: { padding: 16, boxWidth: 10, usePointStyle: true } }
      },
      cutout: '62%'
    }
  });

  // Price vs Room Type — demo data
  new Chart(document.getElementById('priceChart'), {
    type: 'bar',
    data: {
      labels: ['Entire home/apt', 'Private room', 'Shared room'],
      datasets: [{
        label: 'Avg. price ($)',
        data: [196, 89, 55],
        backgroundColor: ['#ff385c', '#7c5cff', '#22d3ee'],
        borderRadius: 8,
        maxBarThickness: 56
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false } },
        y: { grid: { color: gridColor }, beginAtZero: true }
      }
    }
  });

  // Availability overview — demo data
  new Chart(document.getElementById('availabilityChart'), {
    type: 'line',
    data: {
      labels: ['0-50', '51-100', '101-150', '151-200', '201-250', '251-300', '301-365'],
      datasets: [{
        label: 'Listings',
        data: [9800, 7600, 6100, 5400, 5900, 6700, 7395],
        borderColor: '#7c5cff',
        backgroundColor: 'rgba(124,92,255,0.15)',
        fill: true,
        tension: 0.4,
        pointBackgroundColor: '#7c5cff',
        pointBorderColor: '#0a0e17',
        pointBorderWidth: 2,
        pointRadius: 4
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, title: { display: true, text: 'Availability (days/365)' } },
        y: { grid: { color: gridColor }, beginAtZero: true }
      }
    }
  });
}

/* ---------------------------------------------------------
   Scroll-based active nav link highlighting
--------------------------------------------------------- */
function initScrollSpy() {
  const sections = ['top', 'predict', 'analytics', 'about'].map(id => document.getElementById(id)).filter(Boolean);
  const navLinks = document.querySelectorAll('.nav-link');

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const id = entry.target.id;
        navLinks.forEach(link => {
          link.classList.toggle('active', link.getAttribute('href') === `#${id}`);
        });
      }
    });
  }, { rootMargin: '-40% 0px -50% 0px' });

  sections.forEach(section => observer.observe(section));
}

/* ---------------------------------------------------------
   Init
--------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', () => {
  initMap();
  initCharts();
  initScrollSpy();
});
