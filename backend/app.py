from flask import Flask, request, jsonify, session
from flask_cors import CORS
import os

app = Flask(__name__)
CORS(app)
app.secret_key = os.getenv("SECRET_KEY", "supersecretkey")

@app.route('/stt', methods=['POST'])
def stt():
    audio = request.files.get('audio')
    return jsonify({"text": "Hello, how are you feeling today?"})

@app.route('/chat', methods=['POST'])
def chat():
    data = request.json
    user_text = data.get("text")
    history = data.get("history", [])
    response_text = "I'm here for you! Tell me what’s on your mind."
    return jsonify({"response": response_text})

@app.route('/tts', methods=['POST'])
def tts():
    data = request.json
    text = data.get("text")
    dummy_audio_url = "https://example.com/audio.mp3"
    return jsonify({"audio_url": dummy_audio_url})

if __name__ == "__main__":
    app.run(debug=True)