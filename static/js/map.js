/** OpenStreetMap first; device location is an explicit, labelled approximation. */
export function validCoordinates(lat, lng) {
  return typeof lat === 'number' && typeof lng === 'number' &&
    Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);
}
export class AirQualityMap {
  constructor(containerId = 'map') {
    this.config = {};
    this.currentCoords = null;
    this.deviceLiveCoords = null;
    this.hasInitialCentered = false;
    if (!window.L) {
      document.getElementById(containerId).textContent = 'Map library unavailable. Check your internet connection; sensor readings remain available.';
      return;
    }
    this.map = L.map(containerId, { zoomControl: false }).setView([22.4707, 70.0577], 12);
    L.control.zoom({ position: 'bottomright' }).addTo(this.map);
    this.setProvider('osm');
  }
  setCartoConfig(config = {}) {
    this.config = config;
    if (this.osmFailed && this.provider === 'osm' && config.cartoApiKey?.trim()) this.setProvider('carto', true);
  }
  notify(message) {
    const el = document.getElementById('mapStatus');
    if (el) el.textContent = message;
  }
  setProvider(provider, isFallback = false) {
    if (!this.map) return;
    const key = this.config.cartoApiKey?.trim();
    if (provider === 'carto' && !key) {
      const select = document.getElementById('basemap');
      if (select) select.value = this.provider || 'osm';
      this.notify('CARTO needs a configured basemap key. OpenStreetMap remains selected.');
      return;
    }
    if (this.baseTileLayer) this.map.removeLayer(this.baseTileLayer);
    const style = ['voyager', 'light_all', 'dark_all'].includes(this.config.cartoMapStyle) ? this.config.cartoMapStyle : 'voyager';
    const url = provider === 'osm' ? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
      : `https://{s}.basemaps.cartocdn.com/rastertiles/${style}/{z}/{x}/{y}.png?key=${encodeURIComponent(key)}`;
    const layer = L.tileLayer(url, {
      maxZoom: 19, subdomains: 'abcd',
      attribution: `${provider === 'carto' ? '&copy; <a href="https://carto.com/">CARTO</a> · ' : ''}&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors`
    });
    this.baseTileLayer = layer;
    this.provider = provider;
    this.osmFailed = false;
    const select = document.getElementById('basemap');
    if (select) select.value = provider;
    let switched = false;
    layer.on('tileerror', () => {
      if (switched || this.baseTileLayer !== layer) return;
      switched = true;
      this.osmFailed = provider === 'osm';
      if (!isFallback && (provider === 'carto' || this.config.cartoApiKey?.trim())) this.setProvider(provider === 'osm' ? 'carto' : 'osm', true);
      else this.notify(provider === 'osm' && !this.config.cartoApiKey?.trim() ? 'OpenStreetMap tiles failed. CARTO fallback needs a configured basemap key. Retry OpenStreetMap using the selector.' : 'Map tiles unavailable. Check your connection or retry OpenStreetMap using the selector.');
    });
    layer.addTo(this.map);
    this.notify(`${provider === 'osm' ? 'OpenStreetMap' : 'CARTO'}${isFallback ? ' · fallback basemap' : ' · street basemap'}`);
  }
  requestFreshDeviceLocation() {
    return new Promise(resolve => {
      if (!navigator.geolocation) { this.notify('Device location is unavailable in this browser.'); resolve(null); return; }
      navigator.geolocation.getCurrentPosition(position => {
        const { latitude: lat, longitude: lng, accuracy } = position.coords;
        if (!validCoordinates(lat, lng)) { resolve(null); return; }
        this.deviceLiveCoords = { lat, lng, label: `Device approximation (±${Math.round(accuracy)} m), not sensor GPS` };
        this.notify(this.deviceLiveCoords.label);
        this.map?.setView([lat, lng], 15);
        if (this.latestReading) this.updateTelemetryLocation(this.latestReading, this.latestColorHex);
        resolve(this.deviceLiveCoords);
      }, error => {
        this.notify(error.code === 1 ? 'Location permission denied. Sensor GPS is unaffected.' : 'Could not resolve device location. No location has been invented.');
        resolve(null);
      }, { enableHighAccuracy: true, maximumAge: 0, timeout: 8000 });
    });
  }
  updateTelemetryLocation(reading, colorHex = '#20a685') {
    if (this.latestReading?.node_id !== reading.node_id) this.hasInitialCentered = false;
    this.latestReading = reading.node_id ? reading : null;
    this.latestColorHex = colorHex;
    const hardware = validCoordinates(reading.lat, reading.lng);
    this.currentCoords = hardware ? { lat: reading.lat, lng: reading.lng, label: 'Sensor GPS' } : (reading.node_id ? this.deviceLiveCoords : null);
    if (this.map) {
      if (this.aoeCircle) this.map.removeLayer(this.aoeCircle);
      if (this.centerMarker) this.map.removeLayer(this.centerMarker);
      this.aoeCircle = this.centerMarker = null;
      if (this.currentCoords) {
        const { lat, lng } = this.currentCoords;
        this.aoeCircle = L.circle([lat, lng], { radius: 100, color: colorHex, fillOpacity: 0.12, weight: 1 }).addTo(this.map);
        this.centerMarker = L.circleMarker([lat, lng], { radius: 8, color: '#fff', weight: 3, fillColor: colorHex, fillOpacity: 1 }).addTo(this.map);
        const popup = document.createElement('div');
        popup.textContent = `${reading.node_id} · AQI ${reading.aqi} · ${this.currentCoords.label} · ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
        this.centerMarker.bindPopup(popup);
        if (!this.hasInitialCentered) { this.map.setView([lat, lng], 15); this.hasInitialCentered = true; }
      }
    }
    return { coords: this.currentCoords, isHardwareGps: hardware, label: this.currentCoords?.label || 'Sensor GPS unavailable · map centered on Jamnagar' };
  }
  fitSensor() {
    if (this.currentCoords) this.map?.setView([this.currentCoords.lat, this.currentCoords.lng], 15);
    else this.notify('No sensor coordinates yet. Use device location only if you are beside the sensor.');
  }
  invalidateSize() { this.map?.invalidateSize(); }
}

