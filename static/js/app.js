import { calculateEnvironmentalScore } from './scoring.js';
import { AirQualityMap } from './map.js';
import { TrendsChart } from './chart.js';
import { getTelemetry, packetAge, ageLabel } from './api.js';

const $ = id => document.getElementById(id);
const put = (id, value) => { $(id).textContent = value; };
const number = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
const display = value => number(value) === null ? '—' : Number(value.toFixed(1)).toString();
class SmartAirQApp {
  constructor() {
    this.node = ''; this.limit = 40; this.online = false; this.data = null; this.receivedAt = 0;
    try { document.documentElement.dataset.theme = localStorage.getItem('smartairq-theme') === 'dark' ? 'dark' : 'light'; } catch {}
    this.mapManager = new AirQualityMap('map');
    this.chartManager = new TrendsChart('trendsChart');
    if (!this.chartManager.chart) put('chartEmpty', 'Chart library unavailable. Readings are available in the table below.');
    $('themeToggle').addEventListener('click', () => {
      const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem('smartairq-theme', next); } catch {}
      this.themeLabel(); this.chartManager.refreshTheme();
    });
    this.themeLabel();
    $('btnFit').addEventListener('click', () => this.mapManager.fitSensor());
    $('basemap').addEventListener('change', event => this.mapManager.setProvider(event.target.value));
    $('btnRefreshGPS').addEventListener('click', async () => {
      const button = $('btnRefreshGPS'); button.disabled = true; button.textContent = 'Locating…';
      try {
        await this.mapManager.requestFreshDeviceLocation();
        if (this.data?.latest) this.renderMetrics(this.data.latest);
      } finally { button.disabled = false; button.textContent = 'Use my location'; }
    });
    $('nodeFilter').addEventListener('change', event => { this.node = event.target.value; this.fetchTelemetry(); });
    $('historyLimit').addEventListener('change', event => { this.limit = Number(event.target.value); this.fetchTelemetry(); });
    $('refreshButton').addEventListener('click', () => this.fetchTelemetry());
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.fetchTelemetry(); });
    window.addEventListener('resize', () => this.mapManager.invalidateSize());
    this.fetchConfig(); this.fetchTelemetry();
    this.timer = setInterval(() => { if (!document.hidden && !this.pending) this.fetchTelemetry(); }, 3000);
    this.clock = setInterval(() => this.updateFreshness(), 1000);
    window.addEventListener('pagehide', () => { clearInterval(this.timer); clearInterval(this.clock); this.controller?.abort(); });
  }
  themeLabel() { $('themeToggle').setAttribute('aria-label', `Switch to ${document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'} theme`); }
  async fetchConfig() {
    try {
      const response = await fetch('/api/config', { signal: AbortSignal.timeout(8000) });
      if (response.ok) this.mapManager.setCartoConfig(await response.json());
    } catch { /* OpenStreetMap does not depend on optional configuration. */ }
  }
  async fetchTelemetry() {
    // Abort obsolete requests on filter changes; only the newest result can update the screen.
    this.controller?.abort();
    const controller = new AbortController(); this.controller = controller; this.pending = true;
    $('refreshButton').disabled = true;
    try {
      const data = await getTelemetry({ node: this.node, limit: this.limit, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]) });
      if (this.controller !== controller) return;
      this.data = data; this.receivedAt = Date.now(); this.online = true;
      $('statusDot').className = 'status-dot online'; put('statusText', 'Server connected');
      this.renderNodes(data.nodes || []);
      this.renderTable(data.history || []);
      this.chartManager.updateData(data.history || []);
      $('chartEmpty').hidden = Boolean(this.chartManager.chart && data.history?.length);
      if (data.latest) this.renderMetrics(data.latest); else this.renderEmpty();
      this.updateFreshness();
    } catch (error) {
      if (controller.signal.aborted || this.controller !== controller) return;
      this.online = false;
      $('statusDot').className = 'status-dot offline'; put('statusText', 'Server disconnected');
      this.notice('Cannot reach the server. Reconnecting automatically. Any readings shown are from the last successful connection.', true);
    } finally { if (this.controller === controller) { this.pending = false; $('refreshButton').disabled = false; } }
  }
  notice(text, warning = false) {
    $('notice').hidden = !text; $('notice').className = warning ? 'notice warning' : 'notice'; put('notice', text);
  }
  renderNodes(nodes) {
    const selected = this.node;
    const options = [new Option('All sensor nodes', ''), ...nodes.map(node => new Option(node.node_id, node.node_id))];
    $('nodeFilter').replaceChildren(...options); $('nodeFilter').value = selected;
  }
  renderMetrics(latest) {
    for (const key of ['aqi', 'pm25', 'pm10', 'temp', 'humidity']) put(`${key}Value`, display(latest[key]));
    put('detailNode', latest.node_id); put('activeNodeChip', latest.node_id);
    put('sensorTimestampChip', latest.timestamp || 'Timestamp unavailable');
    const scoring = calculateEnvironmentalScore(latest.aqi, latest.temp, latest.humidity);
    put('globalScoreCircle', scoring.score ?? '—'); put('globalScoreStatus', scoring.category);
    put('aqiCategory', scoring.category);
    $('scoreRing').style.setProperty('--score-angle', `${(scoring.score || 0) * 28}deg`);
    $('scoreRing').style.setProperty('--score-color', scoring.aqiColorHex);
    put('advisoryTitle', scoring.advisoryTitle); put('advisoryText', scoring.advisoryText);
    put('comfortLabel', scoring.climateAssessment.label);
    put('heatIndexText', `${display(scoring.climateAssessment.heatIndex)} °C`);
    $('climatePenaltyBadge').hidden = !scoring.penaltyApplied;
    const geo = this.mapManager.updateTelemetryLocation(latest, scoring.aqiColorHex);
    put('geoSourceChip', geo.label);
  }
  renderEmpty() {
    for (const id of ['aqiValue','pm25Value','pm10Value','tempValue','humidityValue','globalScoreCircle','detailNode']) put(id, '—');
    put('activeNodeChip', 'No sensor selected'); put('sensorTimestampChip', 'Awaiting data');
    put('globalScoreStatus', 'Waiting for a reading'); put('aqiCategory', 'Awaiting data');
    put('comfortLabel', 'Awaiting climate data'); put('heatIndexText', '—');
    put('advisoryTitle', 'Ready when your sensors are.');
    put('advisoryText', 'Connect an ESP32 node to see your latest air quality and climate readings here.');
    $('scoreRing').style.setProperty('--score-angle', '0deg'); $('climatePenaltyBadge').hidden = true;
    const geo = this.mapManager.updateTelemetryLocation({lat:0,lng:0}); put('geoSourceChip', geo.label);
  }
  updateFreshness() {
    const latest = this.data?.latest;
    const age = packetAge(latest?.timestamp, this.data?.server_time, this.receivedAt);
    put('lastPacketText', latest ? ageLabel(age) : 'No readings');
    if (!this.online) return;
    if (!latest) this.notice('Your workspace is ready. Waiting for telemetry from an ESP32 sensor node.');
    else if (age === null || age > 60) this.notice(`Sensor data is ${ageLabel(age)}. Values shown are the last received measurements.`, true);
    else this.notice('');
  }
  renderTable(history) {
    put('readingCount', history.length);
    const body = $('readingsBody'); body.replaceChildren();
    if (!history.length) {
      const row = body.insertRow(); const cell = row.insertCell(); cell.colSpan = 7; cell.className = 'empty-cell';
      cell.textContent = 'No readings yet. Connect a sensor to start monitoring.'; return;
    }
    for (const item of [...history].reverse()) {
      const row = body.insertRow();
      const values = [item.node_id, item.timestamp, display(item.aqi), display(item.pm25), display(item.pm10), `${display(item.temp)} °C`, `${display(item.humidity)} %`];
      for (const value of values) row.insertCell().textContent = value ?? '—';
    }
  }
}
window.appInstance = new SmartAirQApp();
