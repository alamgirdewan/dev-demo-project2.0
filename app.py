from flask import Flask, request, jsonify
from flask_cors import CORS
import mysql.connector
import requests
import random
import math
import config

app = Flask(__name__)
CORS(app)

class Airport:

    def __init__(self, row):
        self.ident = row['ident']
        self.name = row['name']
        self.country = row['iso_country']
        self.lat = float(row['latitude_deg'])
        self.lng = float(row['longitude_deg'])

    def to_dict(self):
        return {
            'ident': self.ident,
            'name': self.name,
            'iso_country': self.country,
            'latitude_deg': self.lat,
            'longitude_deg': self.lng,
        }

    def distance_to(self, other):
        return math.sqrt((self.lat - other.lat) ** 2 + (self.lng - other.lng) ** 2)

class GameSession:

    REQUIRED_PARTS       = ['Electric Motor', 'Battery', 'Air Filter', 'Propeller', 'Solar Panel']
    START_AIRPORT        = 'EFHK'
    START_BUDGET         = 10000
    PART_CHANCE          = 0.5
    REQUIRED_VISITS      = 10
    REQUIRED_PARTS_COUNT = 5

    def __init__(self, player_name):
        self.player          = player_name
        self.budget          = self.START_BUDGET
        self.current         = self.START_AIRPORT
        self.visited         = []
        self.collected_parts = []
        self.remaining_parts = self.REQUIRED_PARTS.copy()
        self.just_moved      = False

    def fly_to(self, ident, cost):
        if cost > self.budget:
            return False
        if ident not in self.visited and len(self.visited) >= self.REQUIRED_VISITS:
            return 'limit_reached'
        self.budget -= cost
        self.current = ident
        if ident not in self.visited:
            self.visited.append(ident)
        self.just_moved = True
        return True

    def try_collect_part(self):
        if self.just_moved and self.remaining_parts and random.random() < self.PART_CHANCE:
            self.just_moved = False
            part = random.choice(self.remaining_parts)
            self.collected_parts.append(part)
            self.remaining_parts.remove(part)
            return part
        self.just_moved = False
        return None

    def apply_weather_effect(self, effect):
        self.budget += effect
        self.budget  = max(0, self.budget)

    def is_completed(self):
        return (
            len(self.visited) >= self.REQUIRED_VISITS
            and len(self.collected_parts) == self.REQUIRED_PARTS_COUNT
        )

    def to_dict(self):
        return {
            'player':           self.player,
            'budget':           self.budget,
            'visited_airports': self.visited,
            'collected_parts':  self.collected_parts,
        }

    def final_score(self):
        parts_score      = len(self.collected_parts) * 200
        budget_score     = max(0, self.budget // 100)
        efficiency_bonus = max(0, (self.REQUIRED_VISITS - len(self.visited)) * 50)
        return parts_score + budget_score + efficiency_bonus

class GameManager:

    def __init__(self):
        self.sessions = {}

    def create(self, session_id, player_name):
        self.sessions[session_id] = GameSession(player_name)

    def get(self, session_id):
        return self.sessions.get(session_id)

    def remove(self, session_id):
        return self.sessions.pop(session_id, None)


class WeatherService:

    BASE_URL = 'https://api.openweathermap.org/data/2.5/weather'

    EFFECTS = {
        'Clear':        ('\U00002600', +300),
        'Clouds':       ('\U00002601', 0),
        'Rain':         ('\U0001F327', -500),
        'Drizzle':      ('\U0001F326', -300),
        'Thunderstorm': ('\U000026C8', -900),
        'Snow':         ('\U00002744', -700),
        'Mist':         ('\U0001F32B', -200),
        'Fog':          ('\U0001F32B', -400),
        'Dust':         ('\U0001F32A', -600),
        'Haze':         ('\U0001F32B', -200),
    }

    def fetch(self, lat, lng):
        try:
            resp = requests.get(self.BASE_URL, params={
                'lat':   lat,
                'lon':   lng,
                'appid': config.WEATHER_API_KEY,
                'units': 'metric',
            }, timeout=4)
            if resp.status_code != 200:
                return None
            data        = resp.json()
            condition   = data['weather'][0]['main']
            description = data['weather'][0]['description'].capitalize()
            temp        = round(data['main']['temp'])
            icon, effect = self.EFFECTS.get(condition, ('\U000026C5', 0))
            return {
                'icon':        icon,
                'description': description,
                'temp':        temp,
                'condition':   condition,
                'co2_effect':  effect,
            }
        except Exception:
            return None

manager         = GameManager()
weather_service = WeatherService()


def get_cursor():
    conn = mysql.connector.connect(
        host=config.DB_HOST, user=config.DB_USER,
        password=config.DB_PASSWORD, database=config.DB_NAME,
        auth_plugin='mysql_native_password'
    )
    return conn, conn.cursor(dictionary=True)


@app.route('/ping')
def ping():
    return jsonify({'status': 'ok'})


@app.route('/start', methods=['POST'])
def start():
    data        = request.get_json()
    session_id  = data.get('session_id')
    player_name = data.get('name', 'Captain')
    if not session_id:
        return jsonify({'status': 'error', 'message': 'session_id required'}), 400
    manager.create(session_id, player_name)
    return jsonify({'status': 'success', 'message': f'Game started for {player_name}'})


@app.route('/status/<session_id>')
def status(session_id):
    session = manager.get(session_id)
    if not session:
        return jsonify({'status': 'error', 'message': 'Session not found'}), 404

    conn, cursor = get_cursor()
    try:

        cursor.execute(
            'SELECT ident, name, iso_country, latitude_deg, longitude_deg '
            'FROM airport WHERE ident = %s', (session.current,)
        )
        row = cursor.fetchone()
        if not row:
            return jsonify({'status': 'error', 'message': 'Airport not found'}), 404

        loc = Airport(row)
        weather = weather_service.fetch(loc.lat, loc.lng)

        message = ''
        if len(session.visited) > 0 and weather:
            session.apply_weather_effect(weather['co2_effect'])
            message += f"Weather: {weather['description']} ({weather['temp']}°C) - CO₂ effect: {weather['co2_effect']:+d}\n"

        part = session.try_collect_part()
        if part:
            message += f"Ohho! You got '{part}' at {loc.name}!"
        elif len(session.visited) == 0:
            message += "Mission started! Fly to another airport to find parts."

        max_dist_deg = session.budget / 100

        cursor.execute('''
                       SELECT ident, name, iso_country, latitude_deg, longitude_deg
                       FROM airport
                       WHERE ident != %s
                         AND type = 'large_airport'
                         AND (ABS(latitude_deg - %s) + ABS(longitude_deg - %s)) <= %s
                       ORDER BY RAND() LIMIT 4
                       ''', (session.current, loc.lat, loc.lng, max_dist_deg))

        destinations = []
        for row in cursor.fetchall():
            dest = Airport(row)
            distance = loc.distance_to(dest)
            cost = round(distance * 100)
            destinations.append({
                **dest.to_dict(),
                'cost': cost
            })

        is_won = session.is_completed()
        is_lost = False
        loss_reason = ''

        if len(session.visited) >= session.REQUIRED_VISITS and len(
                session.collected_parts) < session.REQUIRED_PARTS_COUNT:
            is_lost = True
            loss_reason = (
                f"You visited all 10 airports but collected only "
                f"{len(session.collected_parts)}/5 parts. Mission Failed!"
            )


        elif not destinations and not is_won:
            is_lost = True
            parts = []
            if len(session.visited) < session.REQUIRED_VISITS:
                parts.append(f"You visited only {len(session.visited)} new airports.")
            if len(session.collected_parts) < session.REQUIRED_PARTS_COUNT:
                parts.append(f"You couldn't collect all 5 parts.")
            if session.budget <= 0:
                parts.append("Your CO₂ budget is exhausted.")
            loss_reason = " ".join(parts) if parts else "No airports within budget."

        return jsonify({
            'status': 'success',
            'game_state': session.to_dict(),
            'current_location_data': loc.to_dict(),
            'destinations': destinations,
            'weather': weather,
            'message': message.strip(),
            'is_completed': is_won,
            'is_lost': is_lost,
            'loss_reason': loss_reason,
            'visited_count': len(session.visited),
            'parts_count': len(session.collected_parts),
        })
    finally:
        cursor.close()
        conn.close()


@app.route('/move-location', methods=['POST'])
def move_location():
    data = request.get_json()
    session_id = data.get('session_id')
    new_ident = data.get('location')
    cost = int(data.get('cost', 0))

    session = manager.get(session_id)
    if not session:
        return jsonify({'status': 'error', 'message': 'Session not found'}), 404

    if not new_ident:
        return jsonify({'status': 'error', 'message': 'location required'}), 400

    result = session.fly_to(new_ident, cost)

    if result == 'limit_reached':
        return jsonify({'status': 'error', 'message': 'Maximum 10 airports already visited!'}), 400
    if not result:
        return jsonify({'status': 'error', 'message': 'Not enough CO₂ budget!'}), 400

    return jsonify({'status': 'success', 'message': f'Moved to {new_ident}'})


@app.route('/game-over', methods=['POST'])
def game_over():
    data = request.get_json()
    session_id = data.get('session_id')

    session = manager.remove(session_id)
    if not session:
        return jsonify({'status': 'error', 'message': 'Session not found'}), 404

    is_won = session.is_completed()

    reason_parts = [
        f"Visited {len(session.visited)}/10 airports",
        f"Collected {len(session.collected_parts)}/5 parts",
        f"Budget left: {session.budget} units"
    ]
    reason = " • ".join(reason_parts)

    return jsonify({
        'status': 'success',
        'result': {
            'final_score': session.final_score(),
            'budget_left': session.budget,
            'parts_count': len(session.collected_parts),
            'airports_count': len(session.visited),
            'rating': 'Mission Accomplished!' if is_won else 'Mission Failed',
            'reason': reason,
            'is_won': is_won,
        }
    })


if __name__ == '__main__':
    app.run(debug=True, port=5000)