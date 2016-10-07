#Matt Diener

import requests
import json
from flask import Flask
from flask import render_template
from flask import request

app = Flask(__name__,static_url_path='')
app.debug = True

f = open('apikeys.json','r')
apiKeys = json.loads(f.read())

flickrKey = apiKeys['flickrKey']
mapsKey = apiKeys['mapsKey']
distanceMatrixKey = apiKeys['distanceMatrixKey']

@app.route('/')
def hello_world():
    return render_template('index.html', mapsKey=mapsKey);

@app.route('/flickrKey')
def apiKey():
    return flickrKey

@app.route('/distancematrix', methods=['GET'])
def distanceMatrix():
    payload = {
        'origins':request.args.get('origins'),
        'destinations':request.args.get('destinations'),
        'mode':request.args.get('mode'),
        'key':distanceMatrixKey
    }
    return requests.get('https://maps.googleapis.com/maps/api/distancematrix/json', params=payload).content

if __name__ == '__main__':
    app.run()
