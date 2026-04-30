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
