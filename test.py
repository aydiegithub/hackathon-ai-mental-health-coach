from backend.text_to_speech import MurfTTSClient
from backend.speech_to_text import SpeechToText
from backend.orchastrator import Orchestrator

import warnings
warnings.filterwarnings('ignore')

orch = Orchestrator()
murf_client = MurfTTSClient()
sst_client = SpeechToText()

try:
    extracted_txt_audio = sst_client.transcribe(audio_path="audios/testing2.mp3")
    print("Transcribed Text:", extracted_txt_audio, end="\n\n")
    
    ai_response = orch.start_session(extracted_txt_audio)
    print("AI Therapist Response: ", ai_response['solution'], end="\n\n")
    
    print("Generating AI audio.")
    resp = murf_client.generate_speech(
    text=ai_response['solution'],
    voice_id="en-US-natalie",      # this voice is suitable for emotional/empathetic delivery
    style="empathetic",            # "empathetic", "conversational", "calm", "friendly"
    encode_as_base64=True,
    format="MP3",
    sample_rate=44100,
    channel_type="MONO",
    rate=-6.0,                     # Calmer, slower pace
    pitch=-5.0,                    # Softer, warmer tone
    variation=4                    # More expressive delivery
    )

    if resp["success"] and resp.get("encoded_audio"):
        saved_path = murf_client.save_audio(resp["encoded_audio"], folder="audios", filename="ai_response.mp3")
        print("Audio file saved at:", saved_path)
        print("Warning:", resp.get("warning"))
    else:
        print("Error:", resp.get("error"))
        print("Status code:", resp.get("status_code", "N/A"))
        print("Details:", resp.get("body"))
    print("AI audio generated succesfully.")
    
except Exception as e:
    print(f"Error: {e}")




# Uncomment the rest of your testing code as needed

# resp = murf_client.generate_speech(
#     text='Hello, this is a test.',
#     voice_id="en-US-natalie",      # this voice is suitable for emotional/empathetic delivery
#     style="empathetic",            # "empathetic", "conversational", "calm", "friendly"
#     encode_as_base64=True,
#     format="MP3",
#     sample_rate=44100,
#     channel_type="MONO",
#     rate=-6.0,                     # Calmer, slower pace
#     pitch=-5.0,                    # Softer, warmer tone
#     variation=4                    # More expressive delivery
# )

# if resp["success"] and resp.get("encoded_audio"):
#     saved_path = murf_client.save_audio(resp["encoded_audio"], folder="audios", filename="ai_response.mp3")
#     print("Audio file saved at:", saved_path)
#     print("Warning:", resp.get("warning"))
# else:
#     print("Error:", resp.get("error"))
#     print("Status code:", resp.get("status_code", "N/A"))
#     print("Details:", resp.get("body"))

# user_messages = [
#     "I've been feeling really down lately.",
#     "I don't have much energy.",
#     "I spend a lot of time alone.",
#     "Sometimes I feel like nothing matters.",
#     "I have trouble sleeping."
# ]

# result = orch.start_session(user_messages)

# print("\nTherapist Solution:\n", result['solution'])
