from speech_to_text import SpeechToText
import warnings
warnings.filterwarnings('ignore')

STT = SpeechToText()

print(STT.transcribe("backend/audios/testing.mp3"))