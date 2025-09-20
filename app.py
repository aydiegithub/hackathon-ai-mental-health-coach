from flask import Flask, request, jsonify
from backend.orchastrator import Orchestrator
from backend.speech_to_text import SpeechToText
from backend.text_to_speech import MurfTTSClient
import os
import warnings
warnings.filterwarnings('ignore')

app = Flask(__name__)
orch = Orchestrator()
sst_client = SpeechToText()
murf_client = MurfTTSClient()

def generate_ai_response(message) -> str:
    if isinstance(message, str):
        result = orch.start_session([message])
    elif isinstance(message, list):
        result = orch.start_session(message)
    else:
        raise ValueError("generate_ai_response: message must be str or list[str]")
    return result['solution']

def transcribe_audio(filepath: str) -> str:
    if not os.path.isfile(filepath):
        raise FileNotFoundError("Audio file not found: {}".format(filepath))
    return sst_client.transcribe(audio_path=filepath)

def generate_audio_response(ai_message: str) -> str:
    resp = murf_client.generate_speech(
        text=ai_message,
        voice_id="en-US-natalie",
        style="empathetic",
        encode_as_base64=True,
        format="MP3",
        sample_rate=44100,
        channel_type="MONO",
        rate=-6.0,
        pitch=-5.0,
        variation=4
    )
    if resp["success"] and resp.get("encoded_audio"):
        return murf_client.save_audio(resp["encoded_audio"], folder="audios", filename="ai_response.mp3")
    else:
        raise RuntimeError("Speech generation failed or no audio returned.")

@app.route("/chat", methods=["POST"])
def chat_endpoint():
    try:
        data = request.json
        if not data:
            return jsonify({"error": "Missing JSON body"}), 400

        user_message = data.get("user_message")
        dtype = data.get("dtype")

        if dtype not in ("audio", "message"):
            return jsonify({"error": "Invalid dtype, must be 'audio' or 'message'"}), 400
        if not user_message or not isinstance(user_message, str) or not user_message.strip():
            return jsonify({"error": "Missing or empty user_message"}), 400

        if dtype == "audio":
            try:
                transcribed_text = transcribe_audio(user_message)
            except FileNotFoundError as e:
                return jsonify({"error": str(e)}), 400
            except Exception as e:
                return jsonify({"error": "Audio transcription failed: " + str(e)}), 500

            try:
                ai_response = generate_ai_response(transcribed_text)
            except Exception as e:
                return jsonify({"error": "AI response generation failed: " + str(e)}), 500

            try:
                audio_filepath = generate_audio_response(ai_response)
            except Exception as e:
                return jsonify({"error": "Audio generation failed: " + str(e)}), 500

            return jsonify({
                "content": ai_response,
                "audio_filepath": audio_filepath,
                "transcribed_text": transcribed_text,
                "type": "audio"
            })

        elif dtype == "message":
            try:
                ai_response = generate_ai_response(user_message)
            except Exception as e:
                return jsonify({"error": "AI response generation failed: " + str(e)}), 500
            return jsonify({
                "content": ai_response,
                "type": "message"
            })

    except Exception as e:
        return jsonify({"error": "Server error: " + str(e)}), 500

if __name__ == "__main__":
    app.run(port=5000, debug=True)