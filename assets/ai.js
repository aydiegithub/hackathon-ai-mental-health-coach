// Backend Configuration
const BACKEND_CONFIG = {
    BASE_URL: 'http://localhost:5001',
    ENDPOINTS: {
        CHAT: '/chat',
        VOICE_CHAT: '/chat',
        HEALTH_CHECK: '/health',
        UPLOAD_AUDIO: '/upload-audio'
    }
};

let currentMode = 'landing';

// Improved chat bubble styles injected once
(function injectChatBubbleStyles() {
    const style = document.createElement('style');
    style.textContent = `
    .message-bubble, .message-slide-in {
        border: 1.5px solid #e5e7eb !important;
        box-shadow: 0 2px 12px rgba(99,102,241,0.07);
        background: #fff;
        margin-bottom: 8px;
        padding: 14px 18px;
        border-radius: 16px;
        font-size: 1rem;
        transition: box-shadow 0.2s;
    }
    .message-user {
        border-color: #6366f1 !important;
        background: linear-gradient(135deg, #eef2fe 80%, #dbeafe 100%);
        align-self: flex-end !important;
    }
    .message-ai {
        border-color: #10b981 !important;
        background: linear-gradient(135deg, #f0fdf4 80%, #d1fae5 100%);
        align-self: flex-start !important;
    }
    .voice-indicator { font-size: 0.9em; opacity: 0.7; margin-bottom: 4px; }
    .message-transcript {
        color: #6366f1;
        font-size: 0.95em;
        padding: 2px 0;
        font-style: italic;
        margin-bottom: 4px;
    }
    `;
    document.head.appendChild(style);
})();

function switchToVoiceMode() {
    currentMode = 'voice';
    document.querySelectorAll('.page').forEach(page => page.classList.remove('active'));
    document.getElementById('voicePage').classList.add('active');
    if (window.voiceApp) window.voiceApp.initialize();
    else window.voiceApp = new VoiceTherapyApp();
}
function switchToChatMode() {
    currentMode = 'chat';
    document.querySelectorAll('.page').forEach(page => page.classList.remove('active'));
    document.getElementById('chatPage').classList.add('active');
    if (window.chatApp) window.chatApp.initialize();
    else window.chatApp = new ChatTherapyApp();
}
function goToLanding() {
    currentMode = 'landing';
    if (window.voiceApp) window.voiceApp.stopInfiniteLoop();
    document.querySelectorAll('.page').forEach(page => page.classList.remove('active'));
    document.getElementById('landingPage').classList.add('active');
}

// --- ConversationManager class (unchanged) ---
class ConversationManager {
    constructor() {
        this.conversations = JSON.parse(localStorage.getItem('therapyConversations') || '[]');
        this.currentSession = this.getCurrentSession();
    }
    getCurrentSession() {
        let session = sessionStorage.getItem('therapySession');
        if (!session) {
            session = 'therapy_session_' + Date.now();
            sessionStorage.setItem('therapySession', session);
        }
        return session;
    }
    addMessage(content, role, type = 'text', metadata = {}) {
        const message = {
            id: Date.now() + Math.random(),
            content,
            role,
            type,
            timestamp: new Date().toISOString(),
            session: this.currentSession,
            metadata
        };
        this.conversations.push(message);
        this.saveToStorage();
        return message;
    }
    getMessagesForAPI() {
        return this.conversations
            .filter(msg => msg.session === this.currentSession)
            .map(msg => ({
                role: msg.role,
                content: msg.content
            }));
    }
    getAllSessionMessages() {
        return this.conversations.filter(msg => msg.session === this.currentSession);
    }
    saveToStorage() {
        localStorage.setItem('therapyConversations', JSON.stringify(this.conversations));
    }
    clearSession() {
        this.conversations = this.conversations.filter(msg => msg.session !== this.currentSession);
        this.saveToStorage();
    }
    exportConversation() {
        const sessionMessages = this.getAllSessionMessages();
        const data = {
            timestamp: new Date().toISOString(),
            session: this.currentSession,
            messageCount: sessionMessages.length,
            messages: sessionMessages
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `therapy_chat_${this.currentSession}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}

// --- VoiceTherapyApp ---
class VoiceTherapyApp {
    constructor() {
        this.conversationManager = new ConversationManager();
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.isRecording = false;
        this.isPlaying = false;
        this.currentAudio = null;
        this.recordingTimeout = null;
        this.isInfiniteLoopActive = false;
        this.voiceAnimation = null;
        this.statusText = null;
        this.recordBtn = null;
        this.responseAudio = null;
        this.connectionStatus = null;
        this.micIcon = null;
        this.audioContext = null;
        this.analyser = null;
        this.dataArray = null;
        this.visualizerBars = [];
        this.messagesContainer = null;
        this.typingIndicator = null;
        this.initialize();
    }

    initialize() {
        this.voiceAnimation = document.getElementById('voiceAnimation');
        this.statusText = document.getElementById('voiceStatusText');
        this.recordBtn = document.getElementById('recordBtn');
        this.responseAudio = document.getElementById('responseAudio');
        this.connectionStatus = document.getElementById('voiceConnectionStatus');
        this.micIcon = document.getElementById('micIcon');
        this.messagesContainer = document.getElementById('messagesContainer');
        this.typingIndicator = document.getElementById('typingIndicator');
        if (this.voiceAnimation) {
            this.setupAudio();
            this.setupEventListeners();
            this.createAudioVisualizer();
            this.checkBackendConnection();
            this.stopInfiniteLoop();
            this.updateStatus("Ready to listen...");
        }
    }

    async setupAudio() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.setupMediaRecorder(stream);
            this.setupAudioContext(stream);
        } catch (error) {
            console.error('Error accessing microphone:', error);
            this.updateStatus('Microphone access required. Please allow and refresh.');
        }
    }

    setupMediaRecorder(stream) {
        this.mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
        this.mediaRecorder.ondataavailable = (event) => {
            this.audioChunks.push(event.data);
        };
        this.mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
            this.audioChunks = [];
            if (audioBlob.size > 1000) {
                this.updateStatus("Processing your response...");
                await this.sendAudioToBackend(audioBlob);
            } else {
                this.updateStatus("No voice detected. Try speaking again.");
            }
        };
    }

    setupAudioContext(stream) {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.analyser = this.audioContext.createAnalyser();
            const source = this.audioContext.createMediaStreamSource(stream);
            source.connect(this.analyser);
            this.analyser.fftSize = 256;
            const bufferLength = this.analyser.frequencyBinCount;
            this.dataArray = new Uint8Array(bufferLength);
        } catch (error) {
            console.error('Error setting up audio context:', error);
        }
    }

    createAudioVisualizer() {
        const visualizer = this.voiceAnimation?.querySelector('.audio-visualizer');
        if (!visualizer) return;
        for (let i = 0; i < 12; i++) {
            const bar = document.createElement('div');
            bar.className = 'visualizer-bar';
            bar.style.height = '5px';
            visualizer.appendChild(bar);
            this.visualizerBars.push(bar);
        }
    }

    updateAudioVisualizer() {
        if (!this.analyser || !this.isRecording) return;
        this.analyser.getByteFrequencyData(this.dataArray);
        this.visualizerBars.forEach((bar, index) => {
            const value = this.dataArray[index * 2] || 0;
            const height = Math.max(3, (value / 255) * 25);
            bar.style.height = `${height}px`;
        });
        if (this.isRecording) {
            requestAnimationFrame(() => this.updateAudioVisualizer());
        }
    }

    setupEventListeners() {
        this.recordBtn?.addEventListener('click', () => this.toggleInfiniteLoop());
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space' && currentMode === 'voice') {
                e.preventDefault();
                if (this.isPlaying) this.interruptAudio();
            }
        });
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && this.isPlaying) {
                this.interruptAudio();
            }
        });
        window.addEventListener('beforeunload', () => {
            this.stopInfiniteLoop();
        });
    }

    toggleInfiniteLoop() {
        if (this.isInfiniteLoopActive) {
            this.stopInfiniteLoop();
        } else {
            this.startInfiniteVoiceLoop();
        }
    }

    startInfiniteVoiceLoop() {
        this.isInfiniteLoopActive = true;
        if (this.recordBtn) this.recordBtn.innerHTML = '<i class="fas fa-stop"></i>';
        this.updateStatus('Start speaking...');
        this.startRecording();
    }

    stopInfiniteLoop() {
        this.isInfiniteLoopActive = false;
        if (this.recordBtn) this.recordBtn.innerHTML = '<i class="fas fa-microphone"></i>';
        if (this.isRecording && this.mediaRecorder?.state === 'recording') {
            this.mediaRecorder.stop();
            this.isRecording = false;
        }
        if (this.isPlaying) {
            this.interruptAudio();
        }
        if (this.recordingTimeout) {
            clearTimeout(this.recordingTimeout);
            this.recordingTimeout = null;
        }
        this.updateVoiceAnimation('idle');
        this.updateStatus('Click to start conversation');
    }

    startRecording() {
        if (this.isRecording || this.isPlaying || !this.mediaRecorder) return;
        try {
            this.mediaRecorder.start();
            this.isRecording = true;
            this.updateStatus('Listening... Speak now');
            this.updateVoiceAnimation('listening');
            this.updateAudioVisualizer();
            // Auto-stop after 8 seconds
            this.recordingTimeout = setTimeout(() => {
                if (this.isRecording) {
                    this.stopRecording();
                }
            }, 8000);
        } catch (error) {
            console.error('Error starting recording:', error);
            this.updateStatus('Recording error. Please check microphone.');
        }
    }

    stopRecording() {
        if (!this.isRecording || this.mediaRecorder?.state !== 'recording') return;
        try {
            this.mediaRecorder.stop();
            this.isRecording = false;
            if (this.recordingTimeout) {
                clearTimeout(this.recordingTimeout);
                this.recordingTimeout = null;
            }
            this.updateStatus('Processing...');
            this.updateVoiceAnimation('processing');
        } catch (error) {
            console.error('Error stopping recording:', error);
        }
    }

    async sendAudioToBackend(audioBlob) {
        try {
            this.updateStatus('Sending to AI therapist...');
            const formData = new FormData();
            formData.append('audio', audioBlob, 'user_audio.mp3');
            const uploadResp = await fetch(`${BACKEND_CONFIG.BASE_URL}${BACKEND_CONFIG.ENDPOINTS.UPLOAD_AUDIO}`, {
                method: 'POST',
                body: formData
            });
            const uploadData = await uploadResp.json();
            if (!uploadData.audio_filepath) throw new Error('Audio upload failed');
            const response = await fetch(`${BACKEND_CONFIG.BASE_URL}${BACKEND_CONFIG.ENDPOINTS.VOICE_CHAT}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_message: uploadData.audio_filepath,
                    dtype: 'audio'
                })
            });
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const responseData = await response.json();
            await this.handleBackendResponse(responseData);
        } catch (error) {
            console.error('Error sending audio to backend:', error);
            this.updateStatus('Connection error. Try again.');
        }
    }

    async handleBackendResponse(responseData) {
        // Always show transcription in chat as user message
        if (responseData.transcribed_text) {
            this.addMessageToUI(
                responseData.transcribed_text,
                'user',
                'text',
                null,
                true // isTranscript
            );
        }
        if (responseData.type === 'audio' && responseData.audio_filepath) {
            await this.playAudioResponse(responseData.audio_filepath);
            this.addMessageToUI(
                responseData.content,
                'assistant',
                'voice',
                responseData.audio_filepath
            );
        } else if (responseData.content) {
            this.addMessageToUI(responseData.content, 'assistant', 'text');
        }
        // After playing response, wait for user to click record again (no auto-loop!)
        this.isInfiniteLoopActive = false;
        if (this.recordBtn) this.recordBtn.innerHTML = '<i class="fas fa-microphone"></i>';
        this.updateStatus('Click microphone to speak again');
    }

    async playAudioResponse(audioPath) {
        return new Promise((resolve) => {
            try {
                this.updateStatus('AI is responding...');
                this.updateVoiceAnimation('ai-speaking');
                const audioUrl = audioPath.startsWith('http') ? audioPath : `${BACKEND_CONFIG.BASE_URL}/${audioPath}`;
                this.responseAudio.src = audioUrl;
                this.responseAudio.onended = () => {
                    this.isPlaying = false;
                    this.updateVoiceAnimation('idle');
                    this.currentAudio = null;
                    resolve();
                };
                this.responseAudio.onerror = (error) => {
                    console.error('Audio playback error:', error);
                    this.isPlaying = false;
                    this.updateVoiceAnimation('idle');
                    this.currentAudio = null;
                    resolve();
                };
                this.responseAudio.play().then(() => {
                    this.isPlaying = true;
                    this.currentAudio = this.responseAudio;
                });
            } catch (error) {
                console.error('Error playing audio response:', error);
                this.isPlaying = false;
                this.updateVoiceAnimation('idle');
                resolve();
            }
        });
    }

    addMessageToUI(content, role, type = 'text', audioPath = null, isTranscript = false) {
        if (!this.messagesContainer) return;
        const messageDiv = document.createElement('div');
        messageDiv.className = `message-slide-in message-bubble ${role === 'user' ? 'message-user' : 'message-ai'}`;
        let messageContent = '';
        if (type === 'voice') {
            const voiceIcon = role === 'user' ? '<i class="fas fa-microphone"></i>' : '<i class="fas fa-volume-up"></i>';
            const voiceLabel = role === 'user' ? 'Voice Input' : 'Voice Response';
            messageContent += `<div class="voice-indicator">${voiceIcon} ${voiceLabel}</div>`;
        }
        if (isTranscript) {
            messageContent += `<div class="message-transcript">Transcript: ${content}</div>`;
        } else {
            messageContent += `<div class="message-text">${content}</div>`;
        }
        if (type === 'voice' && role === 'assistant' && audioPath) {
            const audioUrl = audioPath.startsWith('http') ? audioPath : `${BACKEND_CONFIG.BASE_URL}/${audioPath}`;
            messageContent += `<div class="mt-2"><audio controls class="w-full max-w-xs"><source src="${audioUrl}" type="audio/mp3">Your browser does not support audio playback.</audio></div>`;
        }
        const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        messageContent += `<div class="text-xs opacity-60 mt-2">${timestamp}</div>`;
        messageDiv.innerHTML = messageContent;
        this.messagesContainer.insertBefore(messageDiv, this.typingIndicator);
        this.scrollToBottom();
    }

    scrollToBottom() {
        const chatMessages = document.getElementById('chatMessages');
        if (chatMessages) {
            setTimeout(() => {
                chatMessages.scrollTop = chatMessages.scrollHeight;
            }, 100);
        }
    }

    updateVoiceAnimation(state) {
        if (!this.voiceAnimation) return;
        this.voiceAnimation.classList.remove('listening', 'ai-speaking', 'processing');
        this.statusText?.classList.remove('listening', 'ai-speaking');
        if (state !== 'idle') {
            this.voiceAnimation.classList.add(state);
            this.statusText?.classList.add(state);
        }
        this.recordBtn?.classList.remove('recording', 'processing');
        if (state === 'listening') {
            this.recordBtn?.classList.add('recording');
        } else if (state === 'processing') {
            this.recordBtn?.classList.add('processing');
        }
        if (this.micIcon) {
            if (state === 'ai-speaking') {
                this.micIcon.className = 'fas fa-volume-up text-4xl text-white';
            } else {
                this.micIcon.className = 'fas fa-microphone text-4xl text-white';
            }
        }
    }

    updateStatus(message) {
        if (this.statusText) this.statusText.textContent = message;
    }

    async checkBackendConnection() {
        try {
            const response = await fetch(`${BACKEND_CONFIG.BASE_URL}${BACKEND_CONFIG.ENDPOINTS.HEALTH_CHECK || '/health'}`);
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
        if (!this.connectionStatus) return;
        if (isConnected) {
            this.connectionStatus.className = 'connection-indicator connected';
            this.connectionStatus.innerHTML = '<i class="fas fa-circle text-green-500"></i> Backend: Connected';
        } else {
            this.connectionStatus.className = 'connection-indicator disconnected';
            this.connectionStatus.innerHTML = '<i class="fas fa-circle text-red-500"></i> Backend: Disconnected';
        }
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// --- ChatTherapyApp ---
// Only change: improved addMessageToUI for bubbles

class ChatTherapyApp {
    constructor() {
        this.conversationManager = new ConversationManager();
        this.isLoading = false;
        this.chatInput = null;
        this.sendButton = null;
        this.messagesContainer = null;
        this.typingIndicator = null;
        this.connectionStatus = null;
        this.clearChatBtn = null;
        this.initialize();
    }

    initialize() {
        this.chatInput = document.getElementById('chatInput');
        this.sendButton = document.getElementById('sendButton');
        this.messagesContainer = document.getElementById('messagesContainer');
        this.typingIndicator = document.getElementById('typingIndicator');
        this.connectionStatus = document.getElementById('chatConnectionStatus');
        this.clearChatBtn = document.getElementById('clearChatBtn');
        if (this.chatInput) {
            this.setupEventListeners();
            this.checkBackendConnection();
            this.loadChatHistory();
            this.chatInput.focus();
            setInterval(() => this.checkBackendConnection(), 30000);
        }
    }

    setupEventListeners() {
        this.chatInput?.addEventListener('input', () => this.adjustTextareaHeight());
        this.chatInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });
        this.sendButton?.addEventListener('click', () => this.sendMessage());
        this.clearChatBtn?.addEventListener('click', () => this.clearChat());
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && currentMode === 'chat') {
                this.checkBackendConnection();
            }
        });
    }

    adjustTextareaHeight() {
        if (!this.chatInput) return;
        this.chatInput.style.height = 'auto';
        const newHeight = Math.min(this.chatInput.scrollHeight, 120);
        this.chatInput.style.height = newHeight + 'px';
        if (this.sendButton) {
            this.sendButton.disabled = !this.chatInput.value.trim() || this.isLoading;
        }
    }

    async sendMessage() {
        const message = this.chatInput?.value.trim();
        if (!message || this.isLoading) return;
        this.addMessageToUI(message, 'user', 'text');
        this.conversationManager.addMessage(message, 'user', 'text');
        this.chatInput.value = '';
        this.adjustTextareaHeight();
        this.isLoading = true;
        this.showTypingIndicator();
        try {
            const responseData = await this.sendMessageToBackend(message);
            await this.handleBackendResponse(responseData);
        } catch (error) {
            console.error('Error getting AI response:', error);
            this.addMessageToUI('I apologize for the technical difficulty. Please try again.', 'assistant', 'text');
        } finally {
            this.isLoading = false;
            this.hideTypingIndicator();
            this.chatInput?.focus();
            this.adjustTextareaHeight();
        }
    }

    async sendMessageToBackend(message) {
        const response = await fetch(`${BACKEND_CONFIG.BASE_URL}${BACKEND_CONFIG.ENDPOINTS.CHAT}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                user_message: message,
                dtype: 'message'
            })
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    }

    async handleBackendResponse(responseData) {
        if (responseData.type === 'message' && responseData.content) {
            this.addMessageToUI(responseData.content, 'assistant', 'text');
            this.conversationManager.addMessage(responseData.content, 'assistant', 'text');
        } else if (responseData.type === 'audio' && responseData.audio_filepath) {
            const transcript = responseData.transcribed_text || 'Audio response';
            this.addMessageToUI(transcript, 'user', 'text', null, true); // Show transcript bubble
            this.addMessageToUI(responseData.content, 'assistant', 'voice', responseData.audio_filepath);
            this.conversationManager.addMessage(transcript, 'user', 'text'); // Save transcript
            this.conversationManager.addMessage(responseData.content, 'assistant', 'voice', { audioPath: responseData.audio_filepath });
        } else {
            const fallbackResponse = "I understand you're sharing something important with me. Could you tell me more about how you're feeling?";
            this.addMessageToUI(fallbackResponse, 'assistant', 'text');
            this.conversationManager.addMessage(fallbackResponse, 'assistant', 'text');
        }
    }

    addMessageToUI(content, role, type = 'text', audioPath = null, isTranscript = false) {
        if (!this.messagesContainer) return;
        const messageDiv = document.createElement('div');
        messageDiv.className = `message-slide-in message-bubble ${role === 'user' ? 'message-user' : 'message-ai'}`;
        let messageContent = '';
        if (type === 'voice') {
            const voiceIcon = role === 'user' ? '<i class="fas fa-microphone"></i>' : '<i class="fas fa-volume-up"></i>';
            const voiceLabel = role === 'user' ? 'Voice Input' : 'Voice Response';
            messageContent += `<div class="voice-indicator">${voiceIcon} ${voiceLabel}</div>`;
        }
        if (isTranscript) {
            messageContent += `<div class="message-transcript">Transcript: ${content}</div>`;
        } else {
            messageContent += `<div class="message-text">${content}</div>`;
        }
        if (type === 'voice' && role === 'assistant' && audioPath) {
            const audioUrl = audioPath.startsWith('http') ? audioPath : `${BACKEND_CONFIG.BASE_URL}/${audioPath}`;
            messageContent += `<div class="mt-2"><audio controls class="w-full max-w-xs"><source src="${audioUrl}" type="audio/mp3">Your browser does not support audio playback.</audio></div>`;
        }
        const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        messageContent += `<div class="text-xs opacity-60 mt-2">${timestamp}</div>`;
        messageDiv.innerHTML = messageContent;
        this.messagesContainer.insertBefore(messageDiv, this.typingIndicator);
        this.scrollToBottom();
    }

    loadChatHistory() {
        if (!this.messagesContainer) return;
        const existingMessages = this.messagesContainer.querySelectorAll('.message-slide-in');
        existingMessages.forEach(msg => msg.remove());
        const messages = this.conversationManager.getAllSessionMessages()
            .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        messages.forEach(msg => {
            this.addMessageToUI(
                msg.content,
                msg.role,
                msg.type,
                msg.metadata?.audioPath,
                false
            );
        });
        this.scrollToBottom();
    }

    showTypingIndicator() {
        this.typingIndicator?.classList.add('show');
        this.scrollToBottom();
    }

    hideTypingIndicator() {
        this.typingIndicator?.classList.remove('show');
    }

    scrollToBottom() {
        const chatMessages = document.getElementById('chatMessages');
        if (chatMessages) {
            setTimeout(() => {
                chatMessages.scrollTop = chatMessages.scrollHeight;
            }, 100);
        }
    }

    async checkBackendConnection() {
        try {
            const response = await fetch(`${BACKEND_CONFIG.BASE_URL}${BACKEND_CONFIG.ENDPOINTS.HEALTH_CHECK || '/health'}`);
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
        if (!this.connectionStatus) return;
        if (isConnected) {
            this.connectionStatus.className = 'connection-indicator connected';
            this.connectionStatus.innerHTML = '<i class="fas fa-circle text-green-500"></i> Backend: Connected';
        } else {
            this.connectionStatus.className = 'connection-indicator disconnected';
            this.connectionStatus.innerHTML = '<i class="fas fa-circle text-red-500"></i> Backend: Disconnected';
        }
    }

    clearChat() {
        if (confirm('Are you sure you want to clear this conversation? This will remove all messages including voice conversation history.')) {
            this.conversationManager.clearSession();
            this.loadChatHistory();
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    setInterval(() => {
        if (window.voiceApp && currentMode === 'voice') {
            window.voiceApp.checkBackendConnection();
        }
        if (window.chatApp && currentMode === 'chat') {
            window.chatApp.checkBackendConnection();
        }
    }, 30000);
});

window.exportConversation = () => {
    const activeApp = currentMode === 'voice' ? window.voiceApp : window.chatApp;
    if (activeApp && activeApp.conversationManager) {
        activeApp.conversationManager.exportConversation();
    }
};