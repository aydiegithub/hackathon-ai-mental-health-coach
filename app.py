from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import warnings
import traceback
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

warnings.filterwarnings('ignore')

app = Flask(__name__)
CORS(app)  # Enable CORS for frontend access

# Global variables for clients
orch = None
sst_client = None
murf_client = None

def initialize_clients():
    """Initialize all backend clients with proper error handling"""
    global orch, sst_client, murf_client
    
    try:
        logger.info("Initializing Orchestrator...")
        from backend.orchastrator import Orchestrator
        orch = Orchestrator()
        logger.info("✓ Orchestrator initialized successfully")
    except Exception as e:
        logger.error(f"✗ Orchestrator initialization failed: {e}")
        orch = None

    try:
        logger.info("Initializing SpeechToText...")
        from backend.speech_to_text import SpeechToText
        sst_client = SpeechToText()
        logger.info("✓ SpeechToText initialized successfully")
    except Exception as e:
        logger.error(f"✗ SpeechToText initialization failed: {e}")
        sst_client = None

    try:
        logger.info("Initializing MurfTTSClient...")
        from backend.text_to_speech import MurfTTSClient
        murf_client = MurfTTSClient()
        logger.info("✓ MurfTTSClient initialized successfully")
    except Exception as e:
        logger.error(f"✗ MurfTTSClient initialization failed: {e}")
        murf_client = None

def generate_ai_response(message) -> str:
    """Generate AI response with proper error handling"""
    if orch is None:
        raise RuntimeError("Orchestrator not initialized. Check backend configuration.")
    
    try:
        if isinstance(message, str):
            result = orch.start_session([message])
        elif isinstance(message, list):
            result = orch.start_session(message)
        else:
            raise ValueError("generate_ai_response: message must be str or list[str]")
        
        if not result or 'solution' not in result:
            raise RuntimeError("Invalid response from Orchestrator")
            
        return result['solution']
    except Exception as e:
        logger.error(f"AI response generation error: {e}")
        raise

def transcribe_audio(filepath: str) -> str:
    """Transcribe audio file with proper error handling"""
    if sst_client is None:
        raise RuntimeError("SpeechToText client not initialized. Check backend configuration.")
    
    if not os.path.isfile(filepath):
        raise FileNotFoundError(f"Audio file not found: {filepath}")
    
    try:
        return sst_client.transcribe(audio_path=filepath)
    except Exception as e:
        logger.error(f"Audio transcription error: {e}")
        raise

def generate_audio_response(ai_message: str) -> str:
    """Generate audio response with proper error handling"""
    if murf_client is None:
        raise RuntimeError("MurfTTSClient not initialized. Check backend configuration.")
    
    try:
        # Create audios directory if it doesn't exist
        os.makedirs("audios", exist_ok=True)
        
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
    except Exception as e:
        logger.error(f"Audio generation error: {e}")
        raise

@app.route("/", methods=["GET"])
def health_check():
    """Basic health check endpoint"""
    return jsonify({
        "status": "server is running",
        "message": "AI Therapist API is operational",
        "version": "1.0.0",
        "services": {
            "orchestrator": orch is not None,
            "speech_to_text": sst_client is not None,
            "text_to_speech": murf_client is not None
        }
    }), 200

@app.route("/health", methods=["GET"])
def health():
    """Detailed health check"""
    return jsonify({
        "status": "healthy",
        "timestamp": "2025-09-20 09:53:16",
        "services": {
            "orchestrator": "available" if orch is not None else "unavailable",
            "speech_to_text": "available" if sst_client is not None else "unavailable", 
            "text_to_speech": "available" if murf_client is not None else "unavailable"
        }
    }), 200

@app.route("/test", methods=["POST"])
def test_endpoint():
    """Simple test endpoint for debugging"""
    try:
        logger.info("Test endpoint called")
        data = request.json
        logger.info(f"Received data: {data}")
        
        return jsonify({
            "received": data,
            "message": "Test endpoint working perfectly",
            "type": "test",
            "status": "success"
        }), 200
    except Exception as e:
        logger.error(f"Test endpoint error: {e}")
        return jsonify({"error": str(e)}), 500

@app.route("/chat", methods=["POST"])
def chat_endpoint():
    """Main chat endpoint with comprehensive error handling"""
    logger.info("=== CHAT ENDPOINT CALLED ===")
    
    try:
        # Log request details
        logger.info(f"Request method: {request.method}")
        logger.info(f"Content-Type: {request.headers.get('Content-Type')}")
        
        # Parse JSON data
        data = request.json
        logger.info(f"Request data: {data}")
        
        if not data:
            logger.error("Missing JSON body")
            return jsonify({"error": "Missing JSON body"}), 400

        user_message = data.get("user_message")
        dtype = data.get("dtype")
        
        logger.info(f"User message: {user_message}")
        logger.info(f"Data type: {dtype}")

        # Validate input
        if dtype not in ("audio", "message"):
            logger.error(f"Invalid dtype: {dtype}")
            return jsonify({"error": "Invalid dtype, must be 'audio' or 'message'"}), 400
            
        if not user_message or not isinstance(user_message, str) or not user_message.strip():
            logger.error("Missing or empty user_message")
            return jsonify({"error": "Missing or empty user_message"}), 400

        # Handle audio messages
        if dtype == "audio":
            logger.info("Processing audio message...")
            
            try:
                logger.info(f"Transcribing audio file: {user_message}")
                transcribed_text = transcribe_audio(user_message)
                logger.info(f"Transcribed text: {transcribed_text}")
            except FileNotFoundError as e:
                logger.error(f"Audio file not found: {e}")
                return jsonify({"error": str(e)}), 400
            except Exception as e:
                logger.error(f"Audio transcription failed: {e}")
                return jsonify({"error": "Audio transcription failed: " + str(e)}), 500

            try:
                logger.info("Generating AI response for transcribed text...")
                ai_response = generate_ai_response(transcribed_text)
                logger.info(f"AI response: {ai_response}")
            except Exception as e:
                logger.error(f"AI response generation failed: {e}")
                return jsonify({"error": "AI response generation failed: " + str(e)}), 500

            try:
                logger.info("Generating audio response...")
                audio_filepath = generate_audio_response(ai_response)
                logger.info(f"Audio file saved: {audio_filepath}")
            except Exception as e:
                logger.error(f"Audio generation failed: {e}")
                return jsonify({"error": "Audio generation failed: " + str(e)}), 500

            response = {
                "content": ai_response,
                "audio_filepath": audio_filepath,
                "transcribed_text": transcribed_text,
                "type": "audio"
            }
            logger.info(f"Returning audio response: {response}")
            return jsonify(response)

        # Handle text messages
        elif dtype == "message":
            logger.info("Processing text message...")
            
            try:
                logger.info("Generating AI response for text message...")
                ai_response = generate_ai_response(user_message)
                logger.info(f"AI response: {ai_response}")
                
                response = {
                    "content": ai_response,
                    "type": "message"
                }
                logger.info(f"Returning text response: {response}")
                return jsonify(response)
                
            except Exception as e:
                logger.error(f"AI response generation failed: {e}")
                # Fallback response
                fallback_response = {
                    "content": "I understand you're reaching out. I'm here to listen and support you. Could you tell me more about what's on your mind?",
                    "type": "message"
                }
                logger.info("Returning fallback response")
                return jsonify(fallback_response)

    except Exception as e:
        logger.error(f"Server error: {e}")
        logger.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": "Server error: " + str(e)}), 500

@app.errorhandler(404)
def not_found(error):
    return jsonify({"error": "Endpoint not found"}), 404

@app.errorhandler(405)
def method_not_allowed(error):
    return jsonify({"error": "Method not allowed"}), 405

@app.errorhandler(500)
def internal_error(error):
    return jsonify({"error": "Internal server error"}), 500

if __name__ == "__main__":
    logger.info("Starting AI Therapist Flask Server...")
    logger.info("Initializing backend clients...")
    
    # Initialize all clients
    initialize_clients()
    
    # Check if core services are available
    if orch is None:
        logger.warning("⚠️  Orchestrator not available - text responses may fail")
    if sst_client is None:
        logger.warning("⚠️  SpeechToText not available - audio transcription will fail")
    if murf_client is None:
        logger.warning("⚠️  MurfTTSClient not available - audio generation will fail")
    
    logger.info("Starting Flask server on http://localhost:5000")
    logger.info("Available endpoints:")
    logger.info("  GET  /        - Health check")
    logger.info("  GET  /health  - Detailed health check")
    logger.info("  POST /test    - Test endpoint")
    logger.info("  POST /chat    - Main chat endpoint")
    
    app.run(host='0.0.0.0', port=5000, debug=True)