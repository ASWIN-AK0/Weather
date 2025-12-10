const apiKey = "a5bcf750c385629011f3d87ec6c3c087";

const els = {
  cityInput: document.getElementById("city"),
  searchBtn: document.getElementById("searchBtn"),
  unitC: document.getElementById("unitC"),
  unitF: document.getElementById("unitF"),
  geoBtn: document.getElementById("geoBtn"),
  recent: document.getElementById("recentSearches"),
  suggestions: document.getElementById("suggestions"),
  locationName: document.getElementById("locationName"),
  dateTime: document.getElementById("dateTime"),
  currentIcon: document.getElementById("currentIcon"),
  currentTemp: document.getElementById("currentTemp"),
  currentDesc: document.getElementById("currentDesc"),
  feelsLike: document.getElementById("feelsLike"),
  humidity: document.getElementById("humidity"),
  wind: document.getElementById("wind"),
  pressure: document.getElementById("pressure"),
  status: document.getElementById("status"),
  forecastGrid: document.getElementById("forecastGrid"),
};

const store = {
  get unit() { return localStorage.getItem("unit") || "metric"; },
  set unit(v) { localStorage.setItem("unit", v); },
  get recents() {
    try { return JSON.parse(localStorage.getItem("recents") || "[]"); } catch { return []; }
  },
  set recents(list) { localStorage.setItem("recents", JSON.stringify(list.slice(0,8))); }
};

function setStatus(msg, type="") {
  els.status.className = "status" + (type ? " " + type : "");
  els.status.textContent = msg || "";
}

function formatDate(ts, tz) {
  try {
    return new Date((ts + tz) * 1000).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
}

function unitLabel() {
  return store.unit === "metric" ? "°C" : "°F";
}

function windLabel(speed) {
  if (store.unit === "metric") return Math.round(speed * 3.6) + " km/h"; // m/s -> km/h
  return Math.round(speed) + " mph";
}

function activateUnitButtons() {
  const isMetric = store.unit === "metric";
  els.unitC.classList.toggle("active", isMetric);
  els.unitF.classList.toggle("active", !isMetric);
  els.unitC.setAttribute("aria-pressed", String(isMetric));
  els.unitF.setAttribute("aria-pressed", String(!isMetric));
}

function saveRecent(city) {
  if (!city) return;
  const list = store.recents.filter(c => c.toLowerCase() !== city.toLowerCase());
  list.unshift(city);
  store.recents = list;
  renderRecents();
}

function renderRecents() {
  const list = store.recents;
  els.recent.innerHTML = "";
  list.forEach(city => {
    const b = document.createElement("button");
    b.className = "chip";
    b.textContent = city;
    b.addEventListener("click", () => fetchAndRenderByCity(city));
    els.recent.appendChild(b);
  });
}

function renderCurrent(w) {
  els.locationName.textContent = `${w.name}, ${w.sys?.country || ""}`.trim();
  els.dateTime.textContent = formatDate(w.dt, w.timezone || 0);
  els.currentIcon.src = `https://openweathermap.org/img/wn/${w.weather[0].icon}@2x.png`;
  els.currentTemp.textContent = `${Math.round(w.main.temp)}${unitLabel()}`;
  els.currentDesc.textContent = w.weather[0].description;
  els.feelsLike.textContent = `${Math.round(w.main.feels_like)}${unitLabel()}`;
  els.humidity.textContent = `${w.main.humidity}%`;
  els.wind.textContent = windLabel(w.wind.speed);
  els.pressure.textContent = `${w.main.pressure} hPa`;
}

function renderForecast(list) {
  els.forecastGrid.innerHTML = "";
  const byDay = {};
  list.forEach(item => {
    const date = item.dt_txt.split(" ")[0];
    if (!byDay[date]) byDay[date] = [];
    byDay[date].push(item);
  });
  const days = Object.keys(byDay).slice(0, 5);
  days.forEach(date => {
    const items = byDay[date];
    const target = items.find(i => i.dt_txt.includes("12:00:00")) || items[Math.floor(items.length/2)];
    const d = new Date(target.dt * 1000);
    const dayName = d.toLocaleDateString(undefined, { weekday: "short" });
    const min = Math.round(Math.min(...items.map(i => i.main.temp_min)));
    const max = Math.round(Math.max(...items.map(i => i.main.temp_max)));
    const div = document.createElement("div");
    div.className = "forecast-item";
    div.innerHTML = `
      <div class="day">${dayName}</div>
      <img src="https://openweathermap.org/img/wn/${target.weather[0].icon}.png" alt=""/>
      <div class="range">${min}${unitLabel()} / ${max}${unitLabel()}</div>
      <div class="desc">${target.weather[0].description}</div>
    `;
    els.forecastGrid.appendChild(div);
  });
}

// --- Autocomplete helpers ---
async function fetchAndRenderByCoords(lat, lon, label) {
  setStatus("Loading…");
  try {
    const u = store.unit;
    const currentUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=${u}&appid=${apiKey}`;
    const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=${u}&appid=${apiKey}`;
    const [current, forecast] = await Promise.all([
      fetchJSON(currentUrl),
      fetchJSON(forecastUrl)
    ]);
    if (label) current.name = label;
    renderCurrent(current);
    renderForecast(forecast.list);
    setStatus("Updated", "ok");
    saveRecent(current.name);
  } catch {
    setStatus("Unable to fetch weather for selection", "error");
  }
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

async function geocodeCities(q) {
  if (!q || q.length < 1) return [];
  const trimmed = q.trim();
  const base = `https://api.openweathermap.org/geo/1.0/direct`;
  const globalUrl = `${base}?q=${encodeURIComponent(trimmed)}&limit=8&appid=${apiKey}`;
  const needsBias = !/,\s*[A-Za-z]{2}$/i.test(trimmed);
  const indiaUrl = needsBias ? `${base}?q=${encodeURIComponent(trimmed + ',IN')}&limit=8&appid=${apiKey}` : null;
  try {
    const [globalRes, indiaRes] = await Promise.all([
      fetchJSON(globalUrl),
      indiaUrl ? fetchJSON(indiaUrl) : Promise.resolve([])
    ]);
    const indiaFirst = [...(indiaRes || []), ...(globalRes || []).filter(it => it.country === 'IN')];
    const others = (globalRes || []).filter(it => it.country !== 'IN');
    const seen = new Set();
    const out = [];
    function add(arr) {
      for (const it of arr) {
        const key = `${it.name}|${it.state||''}|${it.country||''}|${it.lat}|${it.lon}`;
        if (!seen.has(key)) { seen.add(key); out.push(it); }
        if (out.length >= 8) break;
      }
    }
    add(indiaFirst);
    if (out.length < 8) add(others);
    return out;
  } catch {
    return [];
  }
}

let activeIdx = -1;

function clearSuggestions() {
  els.suggestions.innerHTML = "";
  activeIdx = -1;
}

function renderSearching() {
  const list = document.createElement("div");
  list.className = "suggestions-list";
  const row = document.createElement("div");
  row.className = "suggestion-item";
  row.innerHTML = `<span class="meta">Searching…</span>`;
  list.appendChild(row);
  els.suggestions.innerHTML = "";
  els.suggestions.appendChild(list);
}

function renderSuggestError() {
  const list = document.createElement("div");
  list.className = "suggestions-list";
  const row = document.createElement("div");
  row.className = "suggestion-item";
  row.innerHTML = `<span class="meta">Unable to fetch suggestions</span>`;
  list.appendChild(row);
  els.suggestions.innerHTML = "";
  els.suggestions.appendChild(list);
}

function renderSuggestions(items) {
  if (!items) { clearSuggestions(); return; }
  const list = document.createElement("div");
  list.className = "suggestions-list";
  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "suggestion-item";
    empty.innerHTML = `<span class="meta">No results</span>`;
    list.appendChild(empty);
  }
  items.forEach((it, idx) => {
    const name = [it.name, it.state, it.country].filter(Boolean).join(", ");
    const b = document.createElement("div");
    b.className = "suggestion-item";
    b.setAttribute("role", "option");
    b.dataset.idx = String(idx);
    b.innerHTML = `<span class="label">${name}</span><span class="meta">${Math.round(it.lat*100)/100}, ${Math.round(it.lon*100)/100}</span>`;
    b.addEventListener("mousedown", (e) => { e.preventDefault(); selectSuggestion(items, idx); });
    list.appendChild(b);
  });
  els.suggestions.innerHTML = "";
  els.suggestions.appendChild(list);
  activeIdx = -1;
}

function updateActive(listEl) {
  const children = Array.from(listEl.children);
  children.forEach((c, i) => c.classList.toggle("active", i === activeIdx));
}

function selectSuggestion(items, idx) {
  const it = items[idx];
  if (!it) return;
  const name = [it.name, it.state, it.country].filter(Boolean).join(", ");
  els.cityInput.value = name;
  clearSuggestions();
  fetchAndRenderByCoords(it.lat, it.lon, name);
}

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

async function fetchAndRenderByCity(city) {
  if (!city) {
    setStatus("Please enter a city", "warn");
    return;
  }
  setStatus("Loading…");
  try {
    const u = store.unit;
    const currentUrl = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&units=${u}&appid=${apiKey}`;
    const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(city)}&units=${u}&appid=${apiKey}`;
    const [current, forecast] = await Promise.all([
      fetchJSON(currentUrl),
      fetchJSON(forecastUrl)
    ]);
    renderCurrent(current);
    renderForecast(forecast.list);
    setStatus("Updated", "ok");
    saveRecent(current.name);
  } catch (e) {
    setStatus("City not found or network error", "error");
  }
}

async function fetchAndRenderByGeo() {
  if (!navigator.geolocation) {
    setStatus("Geolocation not supported", "warn");
    return;
  }
  setStatus("Getting precise location…");
  navigator.geolocation.getCurrentPosition(async pos => {
    try {
      const { latitude: lat, longitude: lon, accuracy } = pos.coords;
      const u = store.unit;
      // Reverse geocode to improve place name accuracy
      let label = "";
      try {
        const rev = await fetchJSON(`https://api.openweathermap.org/geo/1.0/reverse?lat=${lat}&lon=${lon}&limit=1&appid=${apiKey}`);
        if (Array.isArray(rev) && rev[0]) {
          const r = rev[0];
          label = [r.name, r.state, r.country].filter(Boolean).join(", ");
        }
      } catch {}
      const currentUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=${u}&appid=${apiKey}`;
      const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=${u}&appid=${apiKey}`;
      const [current, forecast] = await Promise.all([
        fetchJSON(currentUrl),
        fetchJSON(forecastUrl)
      ]);
      if (label) current.name = label;
      renderCurrent(current);
      renderForecast(forecast.list);
      setStatus(`Location updated • ~${Math.round(accuracy)}m accuracy`, "ok");
      saveRecent(current.name);
    } catch {
      setStatus("Unable to fetch location weather", "error");
    }
  }, () => setStatus("Permission denied for location", "warn"), { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
}

function initEvents() {
  els.searchBtn.addEventListener("click", () => fetchAndRenderByCity(els.cityInput.value.trim()));
  els.cityInput.addEventListener("keydown", e => {
    const listEl = els.suggestions.querySelector(".suggestions-list");
    if (e.key === "ArrowDown" && listEl) {
      e.preventDefault();
      activeIdx = Math.min(activeIdx + 1, listEl.children.length - 1);
      updateActive(listEl);
    } else if (e.key === "ArrowUp" && listEl) {
      e.preventDefault();
      activeIdx = Math.max(activeIdx - 1, 0);
      updateActive(listEl);
    } else if (e.key === "Enter") {
      const items = els.cityInput._suggestItems || [];
      if (listEl && activeIdx >= 0) {
        e.preventDefault();
        selectSuggestion(items, activeIdx);
      } else {
        fetchAndRenderByCity(els.cityInput.value.trim());
      }
    } else if (e.key === "Escape") {
      clearSuggestions();
    }
  });
  const debounced = debounce(async () => {
    const q = els.cityInput.value.trim();
    if (!q) { clearSuggestions(); return; }
    try {
      renderSearching();
      const items = await geocodeCities(q);
      els.cityInput._suggestItems = Array.isArray(items) ? items : [];
      renderSuggestions(els.cityInput._suggestItems);
    } catch (err) {
      console.error('Geocoding error', err);
      els.cityInput._suggestItems = [];
      renderSuggestError();
    }
  }, 250);
  els.cityInput.addEventListener("input", debounced);
  els.cityInput.addEventListener("blur", () => setTimeout(clearSuggestions, 120));
  els.unitC.addEventListener("click", () => { store.unit = "metric"; activateUnitButtons(); refetchForUnit(); });
  els.unitF.addEventListener("click", () => { store.unit = "imperial"; activateUnitButtons(); refetchForUnit(); });
  els.geoBtn.addEventListener("click", fetchAndRenderByGeo);
}

function refetchForUnit() {
  const currentCity = els.locationName.textContent.split(",")[0];
  activateUnitButtons();
  if (currentCity && currentCity !== "—") fetchAndRenderByCity(currentCity);
  else if (store.recents[0]) fetchAndRenderByCity(store.recents[0]);
  else fetchAndRenderByGeo();
}

function boot() {
  activateUnitButtons();
  renderRecents();
  initEvents();
  if (store.recents[0]) fetchAndRenderByCity(store.recents[0]);
  else fetchAndRenderByGeo();
}

boot();
