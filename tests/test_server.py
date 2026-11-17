from contextlib import closing
import importlib
import os
import tempfile
import unittest
from pathlib import Path

class ApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        os.environ['SMARTAIRQ_DB_PATH'] = str(Path(cls.temp.name) / 'test.db')
        cls.server = importlib.import_module('server')
        cls.client = cls.server.app.test_client()
    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()
        os.environ.pop('SMARTAIRQ_DB_PATH', None)
    def setUp(self):
        with closing(self.server.get_db_connection()) as conn:
            conn.execute('DELETE FROM readings')
            conn.commit()
    def post(self, **extra):
        return self.client.post('/api/readings', json=dict(node_id='esp32-1', pm25=12.5, pm10=20, aqi=42, temp=27, humidity=54, lat=22.47, lng=70.05, **extra))
    def test_fresh_database_and_static_assets(self):
        for url in ['/', '/static/js/app.js', '/static/css/style.css', '/api/config']:
            response = self.client.get(url)
            self.assertEqual(response.status_code, 200)
            response.close()
        self.assertEqual(self.client.get('/api/map-data').json['history'], [])
    def test_telemetry_round_trip(self):
        self.assertEqual(self.post().status_code, 201)
        packet = self.client.get('/api/map-data').json
        self.assertEqual(packet['latest']['pm25'], 12.5)
        self.assertEqual(packet['nodes'][0]['node_id'], 'esp32-1')
        self.assertEqual(len(self.client.get('/api/readings').json), 1)
    def test_invalid_payloads_are_400_not_500(self):
        for payload in [[], [1], 'invalid', {'temp':'oops'}, {'humidity':101}, {'lat':91}, {'pm25':-1}, {'aqi':True}, {'aqi':float('inf')}, {'node_id':{}}, {'temp':None}]:
            with self.subTest(payload=payload):
                self.assertEqual(self.client.post('/api/readings', json=payload).status_code, 400)
    def test_filter_limit_and_csv(self):
        self.post()
        self.client.post('/api/readings', json={'node_id':'other','aqi':90})
        filtered = self.client.get('/api/map-data?node_id=esp32-1&limit=-1').json
        self.assertEqual(filtered['count'], 1)
        self.assertEqual(filtered['latest']['node_id'], 'esp32-1')
        self.assertEqual(len(filtered['nodes']), 2)
        self.assertEqual(self.client.get('/api/map-data?node_id=missing').json['latest'], None)
        self.assertIn('12.5', self.client.get('/api/export-csv').text)
    def test_csv_formula_is_neutralized(self):
        self.client.post('/api/readings', json={'node_id':'=1+1'})
        self.assertNotIn('\r\n1,=1+1,', self.client.get('/api/export-csv').text)

if __name__ == '__main__':
    unittest.main()

