from flask import Flask, request, jsonify, send_file
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({'status': 'ok'}), 200

@app.route('/api/voice-chat', methods=['POST'])
def voice_chat():
    # Send the audio file as response
    audio_path = r'C:\Users\PUNEETH\Desktop\college stuff\New_Check_out\audio\testing2.mp3'
    return jsonify({
        'type': 'voice',
        'content': '/audio/testing2.mp3',
        'transcript': 'Test transcript'
    }), 200

@app.route('/api/conversation-history', methods=['GET'])
def conversation_history():
    # Return a dummy history
    return jsonify({'history': []}), 200

@app.route('/audio/testing2.mp3', methods=['GET'])
def serve_audio():
    audio_path = r'C:\Users\PUNEETH\Desktop\college stuff\New_Check_out\audio\testing2.mp3'
    return send_file(audio_path, mimetype='audio/mpeg')

if __name__ == '__main__':
    app.run(host='localhost', port=8000)