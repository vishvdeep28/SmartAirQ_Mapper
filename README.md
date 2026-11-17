# Smart AirQ Mapper

Run the Flask dashboard with Python 3.10+:

```powershell
python -m pip install -r requirements.txt
.\start-local.ps1
```

Open http://localhost:5000. Stop any older copy using that port first.
For this local worktree, run `D:\BEP\SmartAirQ_Mapper\.worktrees\dashboard\start-local.ps1`.
The launcher reuses the main checkout's existing `.env` and database while serving the corrected source. It does not copy or publish secrets.

## Mapping

OpenStreetMap is always the initial basemap. If tile loading fails, the app replaces it with CARTO when a basemap key is configured. Failed fallback layers do not cycle forever. The selector and status show the active provider; select OpenStreetMap to retry it.

OpenStreetMap requires no API key. It uses the official HTTPS tile URL with visible attribution and normal browser caching. Follow https://operations.osmfoundation.org/policies/tiles/ for deployments. Optional CARTO fallback requires your own browser-safe basemap key in `CARTO_API_KEY`; this key is necessarily visible to the browser. Do not use an administrative or private API key. CARTO can return an error image with HTTP 200 for an invalid key, which a browser tile-error event cannot distinguish from a valid tile; select OpenStreetMap to recover.

Basemaps do not supply GPS. Valid sensor latitude/longitude take priority. The 0,0 sentinel means no sensor fix. Without a fix, the map shows a labelled Jamnagar overview without inventing a sensor location. Use my location explicitly requests a fresh browser fix, shows reported accuracy, and labels it as a device approximation. Use this only while beside your sensor. Browsers need localhost or HTTPS and permission for geolocation; laptop location can be approximate.

## Telemetry

ESP32 devices POST JSON to `/api/readings`, with `node_id`, `lat`, `lng`, `pm25`, `pm10`, `aqi`, `temp`, and `humidity`. `/api/readings` returns the latest 50 records. `/api/map-data?limit=100&node_id=NODE` supports filtering; `/api/export-csv` exports all stored readings. The UI uses same-origin URLs and refreshes every three seconds. Readings older than a minute are marked stale.

The 1–10 environmental indicator is a project-specific score, not a regulatory AQI scale. The 100 m map circle is a visual radius, not a measured pollution boundary. Map tiles and CDN libraries require internet access; telemetry storage is local.

## Validation

```powershell
python -m unittest discover -s tests -v
node --test tests/*.test.mjs
```

Use `waitress-serve --host=0.0.0.0 --port=5000 server:app` for a production WSGI server on a trusted network. Add authentication and an explicit CORS policy before exposing sensor ingestion publicly.
