// Backend Configuration
const BACKEND_CONFIG = {
    BASE_URL: 'http://localhost:8000', // Update to your backend URL
    ENDPOINTS: {
        CHAT: '/api/chat',
        VOICE_HISTORY: '/api/voice-history',
        TEXT_CHAT: '/api/text-chat',
        CONVERSATION_HISTORY: '/api/conversation-history',
        HEALTH_CHECK: '/api/health'
    }
};
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
// Chat Application Class
class ChatTherapyApp {
    constructor() {
        this.conversationManager = new ConversationManager();
        this.isLoading = false;
        // UI Elements
        this.chatInput = document.getElementById('chatInput');
        this.sendButton = document.getElementById('sendButton');
        this.messagesContainer = document.getElementById('messagesContainer');
        this.typingIndicator = document.getElementById('typingIndicator');
        this.connectionStatus = document.getElementById('connectionStatus');
        this.clearChatBtn = document.getElementById('clearChatBtn');
        this.initializeApp();
    }
    async initializeApp() {
        this.setupEventListeners();
        await this.checkBackendConnection();
        await this.loadVoiceHistory();
        this.loadChatHistory();
        this.chatInput.focus();
        // Set up periodic connection checks
        setInterval(() => this.checkBackendConnection(), 30000);
    }
    setupEventListeners() {
        // Auto-resize textarea and enable/disable send button
        this.chatInput.addEventListener('input', () => this.adjustTextareaHeight());
        
        // Send message on Enter (without Shift)
        this.chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });
        // Send button click
        this.sendButton.addEventListener('click', () => this.sendMessage());
        // Clear chat button
        this.clearChatBtn.addEventListener('click', () => this.clearChat());
        // Handle page visibility changes
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                this.checkBackendConnection();
            }
        });
    }
    adjustTextareaHeight() {
        this.chatInput.style.height = 'auto';
        const newHeight = Math.min(this.chatInput.scrollHeight, 120);
        this.chatInput.style.height = newHeight + 'px';
        
        // Enable/disable send button based on content
        this.sendButton.disabled = !this.chatInput.value.trim() || this.isLoading;
    }
    async sendMessage() {
        const message = this.chatInput.value.trim();
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
            this.chatInput.focus();
            this.adjustTextareaHeight();
        }
    }
    async sendMessageToBackend(message) {
        // TODO: Connect to your Python backend chat endpoint
        const messages = this.conversationManager.getMessagesForAPI();
        messages.push({ role: 'user', content: message });
        // here the request is sent to the API 
        const response = await fetch(`${BACKEND_CONFIG.BASE_URL}${BACKEND_CONFIG.ENDPOINTS.CHAT}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
                messages: messages,
                session: this.conversationManager.currentSession,
                context: 'therapy_chat',
                response_type: 'text' // or 'voice' if you want audio response
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        return await response.json();
    }
    async handleBackendResponse(responseData) {
        // Expected response format:
        // {
        //   "type": "text" | "voice",
        //   "content": "text response" | "path/to/audio/file",
        //   "transcript": "text version of response" (optional for voice)
        // }
        if (responseData.type === 'text' && responseData.content) {
            // Handle text response
            this.addMessageToUI(responseData.content, 'assistant', 'text');
            this.conversationManager.addMessage(responseData.content, 'assistant', 'text');
            
        } else if (responseData.type === 'voice' && responseData.content) {
            // Handle voice response
            const transcript = responseData.transcript || 'Audio response';
            this.addMessageToUI(transcript, 'assistant', 'voice', responseData.content);
            this.conversationManager.addMessage(transcript, 'assistant', 'voice', {
                audioPath: responseData.content
            });
            
        } else {
            // Fallback response
            const fallbackResponse = "I understand you're sharing something important with me. Could you tell me more about how you're feeling?";
            this.addMessageToUI(fallbackResponse, 'assistant', 'text');
            this.conversationManager.addMessage(fallbackResponse, 'assistant', 'text');
        }
    }
    async loadVoiceHistory() {
        // TODO: Connect to your Python backend to get voice conversation history
        try {
            const response = await fetch(`${BACKEND_CONFIG.BASE_URL}${BACKEND_CONFIG.ENDPOINTS.VOICE_HISTORY}?session=${this.conversationManager.currentSession}`);
            
            if (!response.ok) {
                return; // No voice history available
            }
            
            const voiceHistory = await response.json();
            
            // Integrate voice history into current conversation
            voiceHistory.forEach(msg => {
                // Check if message already exists to avoid duplicates
                const exists = this.conversationManager.conversations.some(
                    existing => existing.timestamp === msg.timestamp && existing.content === msg.content
                );
                
                if (!exists) {
                    this.conversationManager.addMessage(
                        msg.content, 
                        msg.role, 
                        'voice', 
                        { 
                            originalTimestamp: msg.timestamp,
                            imported: true,
                            audioPath: msg.audioPath 
                        }
                    );
                }
            });
            
        } catch (error) {
            console.error('Error loading voice history:', error);
        }
    }
    addMessageToUI(content, role, type = 'text', audioPath = null) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message-slide-in p-4 rounded-xl max-w-[85%] transition-all duration-300 transform ${
            role === 'user' ? 'gradient-bg-user text-white self-end rounded-br-none ml-auto' : 
            'bg-white shadow-md border-2 border-[#ffe0b2] text-gray-800 self-start rounded-bl-none'
        }`;
        let messageContent = '';
        
        // Add voice indicator if it's a voice message
        if (type === 'voice') {
            const voiceIcon = role === 'user' ? '🎤' : '🔊';
            const voiceLabel = role === 'user' ? 'Voice Input' : 'Voice Response';
            messageContent += `<div class="voice-indicator voice-${role === 'user' ? 'input' : 'response'}">${voiceIcon} ${voiceLabel}</div>`;
        }
        messageContent += `<div class="message-text">${content}</div>`;
        // Add audio playback for voice responses
        if (type === 'voice' && role === 'assistant' && audioPath) {
            const audioUrl = audioPath.startsWith('http') ? audioPath : `${BACKEND_CONFIG.BASE_URL}${audioPath}`;
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
        this.typingIndicator.classList.add('show');
        this.scrollToBottom();
    }
    hideTypingIndicator() {
        this.typingIndicator.classList.remove('show');
    }
    scrollToBottom() {
        const chatMessages = document.getElementById('chatMessages');
        setTimeout(() => {
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }, 100);
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
    clearChat() {
        if (confirm('Are you sure you want to clear this conversation? This will remove all messages including voice conversation history.')) {
            this.conversationManager.clearSession();
            this.loadChatHistory();
        }
    }
}
// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    new ChatTherapyApp();
});
// Export conversation functionality (can be called from browser console)
window.exportConversation = () => {
    if (window.chatApp) {
        window.chatApp.conversationManager.exportConversation();
    }
};
// Conversation history storage
const conversationHistory = [];