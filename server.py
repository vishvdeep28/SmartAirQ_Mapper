from flask import Flask, request, jsonify, send_from_directory, Response
import sqlite3
import csv
import io
import os
import math
from datetime import datetime
from dotenv import load_dotenv

# Load local environment variables from .env if present
ENV_PATH = os.environ.get('SMARTAIRQ_ENV_PATH', os.path.join(os.path.dirname(__file__), '.env'))
load_dotenv(ENV_PATH)

# Initialize Flask with static folder configured
app = Flask(__name__, static_folder='static', static_url_path='/static')

def detect_local_ip():
    try:
        import socket
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return '127.0.0.1'

def calculate_aqi_from_pm25(pm25):
    """Compute standard EPA AQI score from PM2.5 in ug/m3 if not supplied."""
    c = float(pm25)
    if c <= 0:
        return 0
    elif c <= 12.0:
        return round(((50 - 0) / (12.0 - 0.0)) * (c - 0.0) + 0)
    elif c <= 35.4:
        return round(((100 - 51) / (35.4 - 12.1)) * (c - 12.1) + 51)
    elif c <= 55.4:
        return round(((150 - 101) / (55.4 - 35.5)) * (c - 35.5) + 101)
    elif c <= 150.4:
        return round(((200 - 151) / (150.4 - 55.5)) * (c - 55.5) + 151)
    elif c <= 250.4:
        return round(((300 - 201) / (250.4 - 150.5)) * (c - 150.5) + 201)
    elif c <= 350.4:
        return round(((400 - 301) / (350.4 - 250.5)) * (c - 250.5) + 301)
    elif c <= 500.4:
        return round(((500 - 401) / (500.4 - 350.5)) * (c - 350.5) + 401)
    else:
        return 500

DB_PATH = os.environ.get('SMARTAIRQ_DB_PATH', os.path.join(os.path.dirname(__file__), 'air_quality.db'))

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

# Initialize the local SQLite Database
def init_db():
    conn = get_db_connection()
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS readings
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  node_id TEXT, lat REAL, lng REAL, 
                  pm25 INTEGER, pm10 INTEGER, aqi INTEGER, 
                  temp REAL, humidity REAL, timestamp DATETIME)''')
    conn.commit()
    conn.close()

# Enable CORS for all API requests
@app.after_request
def add_cors_headers(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type,Authorization'
    response.headers['Access-Control-Allow-Methods'] = 'GET,POST,OPTIONS'
    return response

# Serve Frontend SPA
@app.route('/')
def serve_index():
    return send_from_directory(os.path.dirname(__file__), 'index.html')

# 1. Endpoint for ESP32 / hardware nodes to send data (HTTP POST)
@app.route('/api/readings', methods=['POST'])
def receive_data():
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "No JSON payload received"}), 400
    
    if not isinstance(data, dict):
        return jsonify({"error": "Payload must be a JSON object"}), 400
    try:
        node_id = data.get('node_id', 'unknown_node')
        if not isinstance(node_id, str) or not node_id.strip() or len(node_id) > 100:
            raise ValueError('node_id must be a nonempty string of at most 100 characters')
        node_id = node_id.strip()
        def number(name, default, minimum, maximum):
            value = data.get(name, default)
            if isinstance(value, bool) or value is None:
                raise ValueError(f'{name} must be a finite number')
            value = float(value)
            if not math.isfinite(value) or not minimum <= value <= maximum:
                raise ValueError(f'{name} must be between {minimum} and {maximum}')
            return value
        lat = number('lat', 0, -90, 90)
        lng = number('lng', 0, -180, 180)
        pm25 = number('pm25', 0, 0, 100000)
        pm10 = number('pm10', 0, 0, 100000)
        aqi = number('aqi', 0, 0, 1000)
        if aqi == 0 and pm25 > 0:
            aqi = calculate_aqi_from_pm25(pm25)
        temp = number('temp', 0, -100, 100)
        humidity = number('humidity', 0, 0, 100)
    except (TypeError, ValueError, OverflowError) as error:
        return jsonify({"error": str(error)}), 400
    now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

    conn = get_db_connection()
    c = conn.cursor()
    c.execute('''INSERT INTO readings 
                 (node_id, lat, lng, pm25, pm10, aqi, temp, humidity, timestamp)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)''',
              (node_id, lat, lng, pm25, pm10, aqi, temp, humidity, now))
    conn.commit()
    inserted_id = c.lastrowid
    conn.close()
    
    print(f"\n[Telemetry] Caught from {node_id}! Temp: {temp}C, AQI: {aqi}, PM2.5: {pm25}")
    return jsonify({
        "status": "success",
        "id": inserted_id,
        "timestamp": now
    }), 201

# 2. Backward-compatible endpoint to fetch latest 50 readings (HTTP GET)
@app.route('/api/readings', methods=['GET'])
def send_data_to_dashboard():
    conn = get_db_connection()
    c = conn.cursor()
    c.execute('''SELECT * FROM readings ORDER BY id DESC LIMIT 50''')
    rows = c.fetchall()
    conn.close()
    return jsonify([dict(ix) for ix in rows])

# 3. Dedicated endpoint for map and analytics (HTTP GET)
@app.route('/api/map-data', methods=['GET'])
def get_map_data():
    limit = max(1, min(request.args.get('limit', default=100, type=int), 1000))
    node_id = request.args.get('node_id', '').strip()
    conn = get_db_connection()
    c = conn.cursor()
    
    # Filtering applies consistently to both the latest packet and its history.
    where = ' WHERE node_id = ?' if node_id else ''
    params = (node_id,) if node_id else ()
    c.execute('SELECT * FROM readings' + where + ' ORDER BY id DESC LIMIT ?', params + (limit,))
    history_rows = c.fetchall()
    latest = dict(history_rows[0]) if history_rows else None
    c.execute('SELECT node_id, MAX(timestamp) AS last_seen, COUNT(*) AS count FROM readings GROUP BY node_id ORDER BY node_id')
    nodes = [dict(row) for row in c.fetchall()]
    conn.close()

    history = [dict(ix) for ix in reversed(history_rows)]
    
    return jsonify({
        "status": "success",
        "server_time": datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        "last_received": latest['timestamp'] if latest else None,
        "latest": latest,
        "history": history,
        "count": len(history),
        "nodes": nodes
    })

# 4. Export database records to a downloadable CSV (HTTP GET)
@app.route('/api/export-csv', methods=['GET'])
def export_csv():
    conn = get_db_connection()
    c = conn.cursor()
    c.execute('''SELECT id, node_id, lat, lng, pm25, pm10, aqi, temp, humidity, timestamp 
                 FROM readings ORDER BY id ASC''')
    rows = c.fetchall()
    conn.close()
    
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Write CSV Header
    writer.writerow(['ID', 'Node ID', 'Latitude', 'Longitude', 'PM2.5 (ug/m3)', 
                     'PM10 (ug/m3)', 'AQI', 'Temperature (C)', 'Humidity (%)', 'Timestamp'])
    
    for row in rows:
        writer.writerow([row['id'], ('\"' + row['node_id']) if row['node_id'] and row['node_id'].startswith(('=', '+', '-', '@', '\t', '\r', '\n')) else row['node_id'], row['lat'], row['lng'],
                         row['pm25'], row['pm10'], row['aqi'], row['temp'], 
                         row['humidity'], row['timestamp']])
    
    output.seek(0)
    timestamp_slug = datetime.now().strftime('%Y%m%d_%H%M%S')
    filename = f"air_quality_readings_{timestamp_slug}.csv"
    
    return Response(
        output.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

# 5. Client configuration endpoint for Carto API & Basemap settings (HTTP GET)
@app.route('/api/config', methods=['GET'])
def get_client_config():
    carto_key = os.environ.get('CARTO_API_KEY', '').strip()
    if carto_key == 'your_carto_api_key_here':
        carto_key = ''
    map_style = os.environ.get('CARTO_MAP_STYLE', 'voyager').strip()
    return jsonify({
        "status": "success",
        "hasCartoKey": bool(carto_key),
        "cartoApiKey": carto_key,
        "cartoMapStyle": map_style
    })

# Initialize for both WSGI imports and direct execution.
init_db()

if __name__ == '__main__':
    host = os.environ.get('SERVER_HOST', '0.0.0.0')
    port = int(os.environ.get('SERVER_PORT', 5000))
    server_ip = os.environ.get('SERVER_IP', '').strip()
    if not server_ip or server_ip == '<your-computer-LAN-IP>':
        server_ip = detect_local_ip()

    print("=" * 65)
    print("Starting Local Flask Server for Smart Air Quality Mapper...")
    print(f"  • Local Dashboard:         http://127.0.0.1:{port}")
    print(f"  • Network / Hotspot URL:   http://{server_ip}:{port}")
    print(f"  • ESP32 POST Endpoint:     http://{server_ip}:{port}/api/readings")
    print("=" * 65)
    app.run(host=host, port=port, debug=False)
