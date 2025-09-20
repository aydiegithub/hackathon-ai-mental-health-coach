// Backend Configuration
const BACKEND_CONFIG = {
    BASE_URL: 'http://localhost:5000', // Update to your backend URL
    ENDPOINTS: {
        CHAT: '/chat',
        VOICE_CHAT: '/chat',
        HEALTH_CHECK: '/health',
        CONVERSATION_HISTORY: '/conversation-history'
    }
};

// Application State
let currentMode = 'landing'; // 'landing', 'voice', 'chat'

// Page Management
function switchToVoiceMode() {
    currentMode = 'voice';
    document.querySelectorAll('.page').forEach(page => page.classList.remove('active'));
    document.getElementById('voicePage').classList.add('active');
    
    if (window.voiceApp) {
        window.voiceApp.initialize();
    } else {
        window.voiceApp = new VoiceTherapyApp();
    }
}

function switchToChatMode() {
    currentMode = 'chat';
    document.querySelectorAll('.page').forEach(page => page.classList.remove('active'));
    document.getElementById('chatPage').classList.add('active');
    
    if (window.chatApp) {
        window.chatApp.initialize();
    } else {
        window.chatApp = new ChatTherapyApp();
    }
}

function goToLanding() {
    currentMode = 'landing';
    
    // Stop any ongoing voice recording or playback
    if (window.voiceApp) {
        window.voiceApp.stopInfiniteLoop();
    }
    
    document.querySelectorAll('.page').forEach(page => page.classList.remove('active'));
    document.getElementById('landingPage').classList.add('active');
}

// Conversation Manager Class
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
            content: content,
            role: role, // 'user', 'assistant'
            type: type, // 'text', 'voice'
            timestamp: new Date().toISOString(),
            session: this.currentSession,
            metadata: metadata
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

// Voice Chat Application Class
class VoiceTherapyApp {
    constructor() {
        this.conversationManager = new ConversationManager();
        
        // Audio recording variables
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.isRecording = false;
        this.isPlaying = false;
        this.currentAudio = null;
        this.recordingTimeout = null;
        this.silenceDetectionTimer = null;
        this.isInfiniteLoopActive = false;

        // UI elements
        this.voiceAnimation = null;
        this.statusText = null;
        this.recordBtn = null;
        this.responseAudio = null;
        this.connectionStatus = null;
        this.micIcon = null;

        // Audio visualizer
        this.audioContext = null;
        this.analyser = null;
        this.dataArray = null;
        this.visualizerBars = [];

        this.initialize();
    }

    initialize() {
        // Get UI elements
        this.voiceAnimation = document.getElementById('voiceAnimation');
        this.statusText = document.getElementById('voiceStatusText');
        this.recordBtn = document.getElementById('recordBtn');
        this.responseAudio = document.getElementById('responseAudio');
        this.connectionStatus = document.getElementById('voiceConnectionStatus');
        this.micIcon = document.getElementById('micIcon');

        if (this.voiceAnimation) {
            this.setupAudio();
            this.setupEventListeners();
            this.createAudioVisualizer();
            this.checkBackendConnection();
            
            // Start infinite voice loop immediately
            this.startInfiniteVoiceLoop();
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
        this.mediaRecorder = new MediaRecorder(stream);
        
        this.mediaRecorder.ondataavailable = (event) => {
            this.audioChunks.push(event.data);
        };
        
        this.mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(this.audioChunks, { type: 'audio/wav' });
            this.audioChunks = [];
            
            if (audioBlob.size > 1000) { // Only process if there's actual audio data
                await this.sendAudioToBackend(audioBlob);
                this.conversationManager.addMessage('[Voice Input]', 'user', 'voice', { audioBlob });
            } else {
                // If no audio detected, continue the loop
                if (this.isInfiniteLoopActive) {
                    setTimeout(() => this.startRecording(), 1000);
                }
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
        
        // Create visualizer bars
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
        // Manual record button (for backup control)
        this.recordBtn?.addEventListener('click', () => this.toggleInfiniteLoop());
        
        // Handle spacebar for interruption
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space' && this.isPlaying && currentMode === 'voice') {
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

        // Handle page unload
        window.addEventListener('beforeunload', () => {
            this.stopInfiniteLoop();
        });
    }

    // Infinite Voice Loop Functions
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
        this.updateStatus('Starting conversation...');
        
        // Start the loop
        this.voiceLoop();
    }

    stopInfiniteLoop() {
        this.isInfiniteLoopActive = false;
        if (this.recordBtn) this.recordBtn.innerHTML = '<i class="fas fa-microphone"></i>';
        
        // Stop any ongoing recording
        if (this.isRecording && this.mediaRecorder?.state === 'recording') {
            this.mediaRecorder.stop();
            this.isRecording = false;
        }
        
        // Stop any ongoing audio playback
        if (this.isPlaying) {
            this.interruptAudio();
        }
        
        // Clear timers
        if (this.recordingTimeout) {
            clearTimeout(this.recordingTimeout);
            this.recordingTimeout = null;
        }
        
        this.updateVoiceAnimation('idle');
        this.updateStatus('Click to start conversation');
    }

    async voiceLoop() {
        while (this.isInfiniteLoopActive) {
            try {
                // Step 1: Record user input
                await this.recordUserInput();
                
                if (!this.isInfiniteLoopActive) break;
                
                // Small delay between recording and next cycle
                await this.delay(500);
                
            } catch (error) {
                console.error('Error in voice loop:', error);
                this.updateStatus('Error in conversation. Retrying...');
                await this.delay(2000);
                
                if (!this.isInfiniteLoopActive) break;
            }
        }
    }

    async recordUserInput() {
        return new Promise((resolve) => {
            if (!this.isInfiniteLoopActive || this.isPlaying) {
                resolve();
                return;
            }

            this.startRecording();
            
            // Auto-stop after 8 seconds
            this.recordingTimeout = setTimeout(() => {
                if (this.isRecording) {
                    this.stopRecording();
                }
                resolve();
            }, 8000);
        });
    }

    startRecording() {
        if (this.isRecording || this.isPlaying || !this.mediaRecorder) return;

        try {
            this.mediaRecorder.start();
            this.isRecording = true;
            
            this.updateStatus('Listening... Speak now');
            this.updateVoiceAnimation('listening');
            this.updateAudioVisualizer();
            
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

            // Save audio file temporarily
            const formData = new FormData();
            formData.append('audio', audioBlob, 'user_audio.wav');
            
            // For now, we'll simulate saving the file locally
            // In a real implementation, you'd upload this to your backend first
            const audioUrl = URL.createObjectURL(audioBlob);
            const audioPath = 'audios/user_audio.wav'; // This would be the actual path on your server
            
            const response = await fetch(`${BACKEND_CONFIG.BASE_URL}${BACKEND_CONFIG.ENDPOINTS.VOICE_CHAT}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    user_message: audioPath,
                    dtype: 'audio'
                })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const responseData = await response.json();
            await this.handleBackendResponse(responseData);
            
        } catch (error) {
            console.error('Error sending audio to backend:', error);
            this.updateStatus('Connection error. Continuing...');
            
            // Continue the loop even if there's an error
            if (this.isInfiniteLoopActive) {
                setTimeout(() => {
                    if (this.isInfiniteLoopActive && !this.isRecording && !this.isPlaying) {
                        this.voiceLoop();
                    }
                }, 2000);
            }
        }
    }

    async handleBackendResponse(responseData) {
        try {
            if (responseData.type === 'audio' && responseData.audio_filepath) {
                await this.playAudioResponse(responseData.audio_filepath);
                this.conversationManager.addMessage(
                    responseData.transcribed_text || 'Audio response', 
                    'assistant', 
                    'voice', 
                    { audioPath: responseData.audio_filepath }
                );
            } else if (responseData.content) {
                await this.playTextResponse(responseData.content);
                this.conversationManager.addMessage(responseData.content, 'assistant', 'text');
            } else {
                // No response or empty response, continue loop
                if (this.isInfiniteLoopActive) {
                    setTimeout(() => this.voiceLoop(), 1000);
                }
            }

        } catch (error) {
            console.error('Error handling backend response:', error);
            this.updateStatus('Error processing response. Continuing...');
            
            if (this.isInfiniteLoopActive) {
                setTimeout(() => this.voiceLoop(), 1000);
            }
        }
    }

    async playAudioResponse(audioPath) {
        return new Promise((resolve) => {
            try {
                this.updateStatus('AI is responding...');
                this.updateVoiceAnimation('ai-speaking');

                // Create full audio URL
                const audioUrl = audioPath.startsWith('http') ? 
                    audioPath : 
                    `${BACKEND_CONFIG.BASE_URL}/${audioPath}`;

                this.responseAudio.src = audioUrl;
                
                this.responseAudio.onended = () => {
                    this.isPlaying = false;
                    this.updateVoiceAnimation('idle');
                    this.currentAudio = null;
                    
                    // Continue the infinite loop
                    if (this.isInfiniteLoopActive) {
                        setTimeout(() => this.voiceLoop(), 800);
                    }
                    resolve();
                };
                
                this.responseAudio.onerror = (error) => {
                    console.error('Audio playback error:', error);
                    this.isPlaying = false;
                    this.updateVoiceAnimation('idle');
                    this.currentAudio = null;
                    
                    if (this.isInfiniteLoopActive) {
                        setTimeout(() => this.voiceLoop(), 1000);
                    }
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
                
                if (this.isInfiniteLoopActive) {
                    setTimeout(() => this.voiceLoop(), 1000);
                }
                resolve();
            }
        });
    }

    async playTextResponse(textContent) {
        return new Promise((resolve) => {
            this.updateStatus(`AI: ${textContent}`);
            this.updateVoiceAnimation('ai-speaking');
            
            // Display text response for 3 seconds
            setTimeout(() => {
                this.updateVoiceAnimation('idle');
                
                if (this.isInfiniteLoopActive) {
                    this.voiceLoop();
                }
                resolve();
            }, Math.max(3000, textContent.length * 50)); // Adjust timing based on text length
        });
    }

    interruptAudio() {
        if (this.currentAudio && this.isPlaying) {
            this.currentAudio.pause();
            this.currentAudio.currentTime = 0;
            this.currentAudio = null;
            this.isPlaying = false;
            this.updateVoiceAnimation('idle');
            
            // Continue the loop after interruption
            if (this.isInfiniteLoopActive) {
                setTimeout(() => this.voiceLoop(), 500);
            }
        }
    }

    updateVoiceAnimation(state) {
        if (!this.voiceAnimation) return;
        
        // Remove all state classes
        this.voiceAnimation.classList.remove('listening', 'ai-speaking', 'processing');
        this.statusText?.classList.remove('listening', 'ai-speaking');
        
        // Add current state class
        if (state !== 'idle') {
            this.voiceAnimation.classList.add(state);
            this.statusText?.classList.add(state);
        }

        // Update button class
        this.recordBtn?.classList.remove('recording', 'processing');
        if (state === 'listening') {
            this.recordBtn?.classList.add('recording');
        } else if (state === 'processing') {
            this.recordBtn?.classList.add('processing');
        }

        // Update mic icon based on state
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

// Chat Application Class
class ChatTherapyApp {
    constructor() {
        this.conversationManager = new ConversationManager();
        this.isLoading = false;

        // UI Elements
        this.chatInput = null;
        this.sendButton = null;
        this.messagesContainer = null;
        this.typingIndicator = null;
        this.connectionStatus = null;
        this.clearChatBtn = null;

        this.initialize();
    }

    initialize() {
        // Get UI elements
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

            // Set up periodic connection checks
            setInterval(() => this.checkBackendConnection(), 30000);
        }
    }

    setupEventListeners() {
        // Auto-resize textarea and enable/disable send button
        this.chatInput?.addEventListener('input', () => this.adjustTextareaHeight());
        
        // Send message on Enter (without Shift)
        this.chatInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        // Send button click
        this.sendButton?.addEventListener('click', () => this.sendMessage());

        // Clear chat button
        this.clearChatBtn?.addEventListener('click', () => this.clearChat());

        // Handle page visibility changes
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
        
        // Enable/disable send button based on content
        if (this.sendButton) {
            this.sendButton.disabled = !this.chatInput.value.trim() || this.isLoading;
        }
    }

    async sendMessage() {
        const message = this.chatInput?.value.trim();
        if (!message || this.isLoading) return;

        // Add user message to UI and conversation
        this.addMessageToUI(message, 'user', 'text');
        this.conversationManager.addMessage(message, 'user', 'text');
        
        // Clear input and reset height
        this.chatInput.value = '';
        this.adjustTextareaHeight();
        
        // Show loading state
        this.isLoading = true;
        this.showTypingIndicator();
        
        try {
            // Send to backend and get response
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
            headers: {
                'Content-Type': 'application/json',
            },
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
            // Handle text response
            this.addMessageToUI(responseData.content, 'assistant', 'text');
            this.conversationManager.addMessage(responseData.content, 'assistant', 'text');
            
        } else if (responseData.type === 'audio' && responseData.audio_filepath) {
            // Handle voice response
            const transcript = responseData.transcribed_text || 'Audio response';
            this.addMessageToUI(transcript, 'assistant', 'voice', responseData.audio_filepath);
            this.conversationManager.addMessage(transcript, 'assistant', 'voice', {
                audioPath: responseData.audio_filepath
            });
            
        } else {
            // Fallback response
            const fallbackResponse = "I understand you're sharing something important with me. Could you tell me more about how you're feeling?";
            this.addMessageToUI(fallbackResponse, 'assistant', 'text');
            this.conversationManager.addMessage(fallbackResponse, 'assistant', 'text');
        }
    }

    addMessageToUI(content, role, type = 'text', audioPath = null) {
        if (!this.messagesContainer || !this.typingIndicator) return;
        
        const messageDiv = document.createElement('div');
        messageDiv.className = `message-slide-in p-4 rounded-xl max-w-[85%] transition-all duration-300 transform ${
            role === 'user' ? 'message-user self-end rounded-br-none ml-auto' : 
            'message-ai self-start rounded-bl-none'
        }`;

        let messageContent = '';
        
        // Add voice indicator if it's a voice message
        if (type === 'voice') {
            const voiceIcon = role === 'user' ? '<i class="fas fa-microphone"></i>' : '<i class="fas fa-volume-up"></i>';
            const voiceLabel = role === 'user' ? 'Voice Input' : 'Voice Response';
            messageContent += `<div class="voice-indicator voice-${role === 'user' ? 'input' : 'response'}">${voiceIcon} ${voiceLabel}</div>`;
        }

        messageContent += `<div class="message-text">${content}</div>`;

        // Add audio playback for voice responses
        if (type === 'voice' && role === 'assistant' && audioPath) {
            const audioUrl = audioPath.startsWith('http') ? audioPath : `${BACKEND_CONFIG.BASE_URL}/${audioPath}`;
            messageContent += `<div class="mt-2"><audio controls class="w-full max-w-xs"><source src="${audioUrl}" type="audio/wav">Your browser does not support audio playback.</audio></div>`;
        }

        // Add timestamp
        const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        messageContent += `<div class="text-xs opacity-60 mt-2">${timestamp}</div>`;

        messageDiv.innerHTML = messageContent;
        
        // Insert before typing indicator
        this.messagesContainer.insertBefore(messageDiv, this.typingIndicator);
        this.scrollToBottom();
    }

    loadChatHistory() {
        if (!this.messagesContainer) return;
        
        // Clear existing messages (keep welcome message and typing indicator)
        const existingMessages = this.messagesContainer.querySelectorAll('.message-slide-in');
        existingMessages.forEach(msg => msg.remove());
        
        // Load all messages from current session
        const messages = this.conversationManager.getAllSessionMessages()
            .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        
        messages.forEach(msg => {
            this.addMessageToUI(
                msg.content, 
                msg.role, 
                msg.type, 
                msg.metadata?.audioPath
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

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Set up periodic connection checks for both modes
    setInterval(() => {
        if (window.voiceApp && currentMode === 'voice') {
            window.voiceApp.checkBackendConnection();
        }
        if (window.chatApp && currentMode === 'chat') {
            window.chatApp.checkBackendConnection();
        }
    }, 30000);
});

// Export conversation functionality (can be called from browser console)
window.exportConversation = () => {
    const activeApp = currentMode === 'voice' ? window.voiceApp : window.chatApp;
    if (activeApp && activeApp.conversationManager) {
        activeApp.conversationManager.exportConversation();
    }
};