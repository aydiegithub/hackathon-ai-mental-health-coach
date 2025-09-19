from text_to_speech import MurfTTSClient
import warnings
warnings.filterwarnings('ignore')

client = MurfTTSClient()

THERAPIST_TEXT = (
    "Hi, I'm here with you right now. I hear you. "
    "It's okay to feel what you're feeling. Let's take a slow, deep breath together. "
    "Remember, you are not alone, and you are stronger than you think."
)

resp = client.generate_speech(
    text=THERAPIST_TEXT,
    voice_id="en-US-natalie",      # Make sure this voice is suitable for emotional/empathetic delivery
    style="empathetic",            # Try "empathetic", "conversational", "calm", "friendly"
    encode_as_base64=True,
    format="MP3",
    sample_rate=44100,
    channel_type="MONO",
    rate=-6.0,                     # Calmer, slower pace
    pitch=-5.0,                    # Softer, warmer tone
    variation=4                    # More expressive delivery
)

if resp["success"] and resp.get("encoded_audio"):
    saved_path = client.save_audio(resp["encoded_audio"], folder="audios", filename="ai_response.mp3")
    print("Audio file saved at:", saved_path)
    print("Warning:", resp.get("warning"))
else:
    print("Error:", resp.get("error"))
    print("Status code:", resp.get("status_code", "N/A"))
    print("Details:", resp.get("body"))