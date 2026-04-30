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
    PART_CHANCE          = 0.4
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