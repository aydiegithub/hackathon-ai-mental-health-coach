
        // Backend Configuration
        const BACKEND_CONFIG = {
            BASE_URL: 'http://localhost:8000', // Update to your backend URL
            ENDPOINTS: {
                VOICE_CHAT: '/api/voice-chat',
                HEALTH_CHECK: '/api/health',
                CONVERSATION_HISTORY: '/api/conversation-history'
            }
        };

        // Voice Chat Application Class
        class VoiceTherapyApp {
            constructor() {
                // Audio recording variables
                this.mediaRecorder = null;
                this.audioChunks = [];
                this.isRecording = false;
                this.isPlaying = false;
                this.currentAudio = null;

                // UI elements
                this.voiceAnimation = document.getElementById('voiceAnimation');
                this.statusText = document.getElementById('statusText');
                this.recordBtn = document.getElementById('recordBtn');
                this.switchToTextBtn = document.getElementById('switchToTextBtn');
                this.responseAudio = document.getElementById('responseAudio');
                this.connectionStatus = document.getElementById('connectionStatus');
                this.micIcon = document.getElementById('micIcon');

                this.initializeApp();
            }

            async initializeApp() {
                await this.setupAudio();
                this.setupEventListeners();
                this.checkBackendConnection();
                this.startVoiceLoop();
            }

            async setupAudio() {
                try {
                    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                    this.setupMediaRecorder(stream);
                } catch (error) {
                    console.error('Error accessing microphone:', error);
                    this.updateStatus('Microphone access denied. Please allow microphone access.');
                }
            }

            setupMediaRecorder(stream) {
                this.mediaRecorder = new MediaRecorder(stream);
                
                this.mediaRecorder.ondataavailable = (event) => {
                    this.audioChunks.push(event.data);
                };
                
                this.mediaRecorder.onstop = async () => {
                    const audioBlob = new Blob(this.audioChunks, { type: 'audio/wav' });
                    this.audioChunks = [];
                    await this.sendAudioToBackend(audioBlob);
                    // Store user voice input in chat history
                    storeChatHistory({
                        role: 'user',
                        type: 'voice',
                        content: '[Voice Input]',
                        audio: audioBlob
                    });
                };
            }

            setupEventListeners() {
                this.recordBtn.addEventListener('click', () => this.toggleRecording());
                this.switchToTextBtn.addEventListener('click', () => this.switchToTextChat());
                
                // Handle spacebar for interruption
                document.addEventListener('keydown', (e) => {
                    if (e.code === 'Space' && this.isPlaying) {
                        e.preventDefault();
                        this.interruptAudio();
                    }
                });

                // Handle page visibility changes
                document.addEventListener('visibilitychange', () => {
                    if (document.hidden && this.isPlaying) {
                        this.interruptAudio();
                    }
                });
            }

            async startVoiceLoop() {
                this.updateStatus('Ready to listen...');
                this.updateVoiceAnimation('listening', false);
                await this.startRecording();
            }

            toggleRecording() {
                if (this.isRecording) {
                    this.stopRecording();
                } else {
                    this.startRecording();
                }
            }

            async startRecording() {
                if (this.isPlaying) {
                    this.interruptAudio();
                }
                
                if (this.mediaRecorder && this.mediaRecorder.state === 'inactive') {
                    this.mediaRecorder.start();
                    this.isRecording = true;
                    this.recordBtn.classList.add('recording');
                    this.updateStatus('Listening...');
                    this.updateVoiceAnimation('listening', true);

                    // Auto stop after 10 seconds
                    setTimeout(() => {
                        if (this.isRecording) {
                            this.stopRecording();
                        }
                    }, 10000);
                }
            }

            stopRecording() {
                if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
                    this.mediaRecorder.stop();
                    this.isRecording = false;
                    this.recordBtn.classList.remove('recording');
                    this.updateStatus('Processing...');
                    this.updateVoiceAnimation('listening', false);
                }
            }

            async sendAudioToBackend(audioBlob) {
                try {
                    this.updateStatus('Sending to therapist AI...');

                    const formData = new FormData();
                    // formate the audio post msg as u want
                    formData.append('audio', audioBlob, 'voice_input.wav');
                    // formData.append('session', this.getCurrentSession());
                    
                    const response = await fetch(`${BACKEND_CONFIG.BASE_URL}${BACKEND_CONFIG.ENDPOINTS.VOICE_CHAT}`, {
                        method: 'POST',
                        body: formData
                    });
                    
                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }
                    
                    const responseData = await response.json();
                    // Store AI response in chat history
                    if (responseData.type === 'audio' || responseData.type === 'voice') {
                        storeChatHistory({
                            role: 'assistant',
                            type: 'voice',
                            content: responseData.transcribed_text || '[AI Voice Response]',
                            audio: responseData.audio_filepath
                        });
                    } else if (responseData.type === 'text') {
                        storeChatHistory({
                            role: 'assistant',
                            type: 'text',
                            content: responseData.content
                        });
                    }
                    await this.handleBackendResponse(responseData);
// Store chat history in localStorage for cross-mode access
function storeChatHistory(message) {
    let history = JSON.parse(localStorage.getItem('therapyConversations') || '[]');
    message.timestamp = new Date().toISOString();
    message.session = sessionStorage.getItem('therapySession') || 'default';
    history.push(message);
    localStorage.setItem('therapyConversations', JSON.stringify(history));
}
                    
                } catch (error) {
                    console.error('Error sending audio to backend:', error);
                    this.updateStatus('Connection error. Retrying...');
                    setTimeout(() => this.startVoiceLoop(), 2000);
                }
            }

            async handleBackendResponse(responseData) {
                try {
                    // Expected response format:
                    // {
                    //   "type": "text" | "voice",
                    //   "content": "text response" | "path/to/audio/file",
                    //   "transcript": "user speech text" (optional)
                    // }

                    if (responseData.type === 'voice' && responseData.content) {
                        // Handle audio response
                        await this.playAudioResponse(responseData.content);
                    } else if (responseData.type === 'text' && responseData.content) {
                        // Handle text response (convert to speech or display)
                        await this.playTextResponse(responseData.content);
                    } else {
                        throw new Error('Invalid response format from backend');
                    }

                } catch (error) {
                    console.error('Error handling backend response:', error);
                    this.updateStatus('Error processing response. Continuing...');
                    setTimeout(() => this.startVoiceLoop(), 1000);
                }
            }

            async playAudioResponse(audioPath) {
                try {
                    this.updateStatus('AI is responding...');
                    this.updateVoiceAnimation('ai-speaking', true);
                    this.micIcon.textContent = '🔊';

                    // If audioPath is a full URL, use it directly
                    // If it's a relative path, prepend the backend URL
                    const audioUrl = audioPath.startsWith('http') ? 
                        audioPath : 
                        `${BACKEND_CONFIG.BASE_URL}${audioPath}`;

                    this.responseAudio.src = audioUrl;
                    
                    this.responseAudio.onended = () => {
                        this.isPlaying = false;
                        this.updateVoiceAnimation('ai-speaking', false);
                        this.micIcon.textContent = '🎤';
                        setTimeout(() => this.startVoiceLoop(), 500);
                    };
                    
                    this.responseAudio.onerror = (error) => {
                        console.error('Audio playback error:', error);
                        this.isPlaying = false;
                        this.updateVoiceAnimation('ai-speaking', false);
                        this.micIcon.textContent = '🎤';
                        this.updateStatus('Audio playback error. Continuing...');
                        setTimeout(() => this.startVoiceLoop(), 1000);
                    };

                    await this.responseAudio.play();
                    this.isPlaying = true;
                    this.currentAudio = this.responseAudio;

                } catch (error) {
                    console.error('Error playing audio response:', error);
                    this.updateStatus('Error playing response. Continuing...');
                    this.isPlaying = false;
                    this.updateVoiceAnimation('ai-speaking', false);
                    this.micIcon.textContent = '🎤';
                    setTimeout(() => this.startVoiceLoop(), 1000);
                }
            }

            async playTextResponse(textContent) {
                // For text responses, we can either:
                // 1. Display the text briefly then continue
                // 2. Use text-to-speech (if available)
                // 3. Send to another endpoint for TTS conversion

                this.updateStatus(`AI: ${textContent}`);
                
                // Display text for 3 seconds then continue
                setTimeout(() => {
                    this.startVoiceLoop();
                }, 3000);
            }

            interruptAudio() {
                if (this.currentAudio) {
                    this.currentAudio.pause();
                    this.currentAudio.currentTime = 0;
                    this.currentAudio = null;
                    this.isPlaying = false;
                    this.updateVoiceAnimation('ai-speaking', false);
                    this.micIcon.textContent = '🎤';
                    this.startVoiceLoop();
                }
            }

            updateVoiceAnimation(type, isActive) {
                this.voiceAnimation.className = 'voice-circle';
                if (isActive) {
                    this.voiceAnimation.classList.add(type);
                }
            }

            updateStatus(message) {
                this.statusText.textContent = message;
            }

            async checkBackendConnection() {
                try {
                    const response = await fetch(`${BACKEND_CONFIG.BASE_URL}${BACKEND_CONFIG.ENDPOINTS.HEALTH_CHECK}`);
                    const isConnected = response.ok;
                    this.updateConnectionStatus(isConnected);
                    return isConnected;
                } catch (error) {
                    console.error('Backend connection error:', error);
                    this.updateConnectionStatus(false);
                    return false;
                }
            }

            updateConnectionStatus(isConnected) {
                if (isConnected) {
                    this.connectionStatus.className = 'connection-indicator connected';
                    this.connectionStatus.innerHTML = '🟢 Backend: Connected';
                } else {
                    this.connectionStatus.className = 'connection-indicator disconnected';
                    this.connectionStatus.innerHTML = '🔴 Backend: Disconnected';
                }
            }

            getCurrentSession() {
                let session = sessionStorage.getItem('therapySession');
                if (!session) {
                    session = 'therapy_session_' + Date.now();
                    sessionStorage.setItem('therapySession', session);
                }
                return session;
            }

            switchToTextChat() {
                window.location.href = 'chat.html';
            }
        }

        // Initialize the application
        document.addEventListener('DOMContentLoaded', () => {
            new VoiceTherapyApp();
        });

        // Periodic connection check
        setInterval(() => {
            if (window.voiceApp) {
                window.voiceApp.checkBackendConnection();
            }
        }, 30000);
