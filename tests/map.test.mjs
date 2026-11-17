import test from 'node:test';
import assert from 'node:assert/strict';
import { AirQualityMap, validCoordinates } from '../static/js/map.js';
const status = { textContent: '' };
globalThis.window = { L: true };
globalThis.document = { getElementById: () => status, createElement: () => ({textContent: ''}) };
function setup() {
  const layers = [];
  const removed = [];
  const map = { setView() { return this; }, removeLayer(layer) { removed.push(layer); } };
  globalThis.L = {
    map: () => map, control: { zoom: () => ({ addTo() {} }) },
    tileLayer: url => { const layer = { url, on(event, callback) { this.fail = callback; }, addTo() { layers.push(this); return this; } }; return layer; },
    circle: () => ({ addTo() { return this; } }),
    circleMarker: () => ({ addTo() { return this; }, bindPopup(popup) { this.popup = popup; } })
  };
  return { manager: new AirQualityMap(), layers, removed };
}
test('OpenStreetMap is default and CARTO fallback replaces the failed layer once', () => {
  const {manager, layers, removed} = setup();
  assert.match(layers[0].url, /^https:\/\/tile.openstreetmap.org/);
  manager.setCartoConfig({cartoApiKey: 'test-public-key'});
  layers[0].fail(); layers[0].fail();
  assert.equal(layers.length, 2);
  assert.match(layers[1].url, /cartocdn/);
  assert.equal(removed[0], layers[0]);
  layers[1].fail();
  assert.equal(layers.length, 2);
  assert.match(status.textContent, /unavailable/);
});
test('missing CARTO key reports failure without a broken replacement', () => {
  const {manager, layers} = setup();
  layers[0].fail();
  assert.equal(layers.length, 1);
  manager.setProvider('carto');
  assert.equal(layers.length, 1);
});
test('equator and prime meridian are valid; unknown or impossible GPS is rejected', () => {
  assert.ok(validCoordinates(0, 23)); assert.ok(validCoordinates(23, 0));
  for (const coords of [[0,0],[91,1],[1,181],[NaN,3],[null,3],['23',3]]) assert.equal(validCoordinates(...coords), false);
});
test('missing GPS never fabricates a sensor pin and labels device approximation', () => {
  const {manager} = setup();
  assert.equal(manager.updateTelemetryLocation({lat:0,lng:0,node_id:'test'}).coords, null);
  manager.deviceLiveCoords = {lat:22,lng:70,label:'Device approximation'};
  assert.equal(manager.updateTelemetryLocation({lat:0,lng:0,node_id:'test'}).isHardwareGps, false);
  const result = manager.updateTelemetryLocation({lat:0,lng:70,node_id:'<img onerror=alert(1)>',aqi:50});
  assert.equal(result.isHardwareGps, true);
  assert.match(manager.centerMarker.popup.textContent, /<img/);
});

test('OSM failure before config arrives still activates CARTO fallback', () => {
  const {manager, layers} = setup();
  layers[0].fail();
  manager.setCartoConfig({cartoApiKey:'public-test-key'});
  assert.equal(layers.length, 2);
  assert.equal(manager.provider, 'carto');
  manager.setProvider('osm');
  assert.match(layers.at(-1).url, /tile.openstreetmap.org/);
});
test('empty telemetry never places a sensor at a remembered device position', () => {
  const {manager} = setup();
  manager.deviceLiveCoords = {lat:22,lng:70};
  assert.equal(manager.updateTelemetryLocation({lat:0,lng:0}).coords, null);
});
