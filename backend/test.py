from text_to_speech import MurfTTSClient
import warnings
warnings.filterwarnings('ignore')

client = MurfTTSClient()

resp = resp = client.generate_speech(
    text="Hey, just checking in. Remember to take a deep breath, you're doing great.",
    voice_id="en-US-natalie",          # Make sure this voice supports the style!
    style="conversational",            # Try "conversational", "natural", or "casual"
    encode_as_base64=True,
    format="MP3",
    sample_rate=44100,
    channel_type="MONO",
    rate=-4.0,                         # Slightly slower pace
    pitch=-3.0,                        # Slightly warmer
    variation=3                        # More expressive, less monotone
)

if resp["success"] and resp.get("encoded_audio"):
    saved_path = client.save_audio(resp["encoded_audio"], folder="audios", filename="ai_response.mp3")
    print("Audio file saved at:", saved_path)
else:
    print("Error:", resp.get("error"))
    print("Status code:", resp.get("status_code", "N/A"))
    print("Details:", resp.get("body"))