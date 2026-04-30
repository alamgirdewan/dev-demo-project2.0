from flask import Flask, request, jsonify
from flask_cors import CORS
import mysql.connector
import requests
import random
import math
import config

app = Flask(__name__)
CORS(app)