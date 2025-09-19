import whisper
from flask import Flask, request, jsonify
from flask_cors import CORS
import tempfile
import os

app = Flask(__name__)
CORS(app)

# Load Whisper model once at startup
model = whisper.load_model("base")  # you can use "small", "medium", "large" as needed

@app.route('/stt', methods=['POST'])
def stt():
    audio = request.files.get('audio')
    if not audio:
        return jsonify({"error": "No audio file provided"}), 400

    # Save uploaded audio to a temporary file
    with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
        audio.save(tmp.name)
        audio_path = tmp.name

    # Transcribe audio using Whisper
    try:
        result = model.transcribe(audio_path)
        text = result.get("text", "")
    finally:
        os.remove(audio_path)

    return jsonify({"text": text})

if __name__ == "__main__":
    app.run(debug=True)