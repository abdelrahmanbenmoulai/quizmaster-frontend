import auth from './auth.js';
import notifications from './notifications.js';

class WebSocketService {
    constructor() {
        this.socket = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 2000; // Start with 2 seconds
        this.handlers = new Map();
        this.isAuthenticated = false;
    }

    connect() {
        const token = auth.getToken();
        if (!token) return;

        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsHost = window.location.hostname;
        const wsUrl = `${wsProtocol}//${wsHost}:8080`;  // Connect directly to port 8080

        console.log('Attempting WebSocket connection to:', wsUrl);
        
        this.socket = new WebSocket(wsUrl);

        this.socket.onopen = () => {
            console.log('WebSocket connected');
            this.reconnectAttempts = 0;
            this.reconnectDelay = 2000;
            
            // Send authentication
            this.authenticate(token);
        };

        this.socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                
                // Handle authentication response
                if (data.type === 'auth') {
                    this.handleAuthResponse(data);
                    return;
                }
                
                // Only process messages if authenticated
                if (!this.isAuthenticated) {
                    console.warn('Received message while not authenticated');
                    return;
                }
                
                if (this.handlers.has(data.type)) {
                    // Add timestamp to rank updates
                    if (data.type === 'rankUpdate') {
                        data.timestamp = Date.now();
                    }
                    this.handlers.get(data.type)(data);
                }
                console.log('WebSocket message received:', data);
            } catch (error) {
                console.error('WebSocket message error:', error);
            }
        };

        this.socket.onclose = () => {
            console.log('WebSocket disconnected');
            this.isAuthenticated = false;
            this.handleReconnect();
        };

        this.socket.onerror = (error) => {
            console.error('WebSocket error:', error);
            this.isAuthenticated = false;
        };
    }

    authenticate(token) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({
                type: 'auth',
                token: token
            }));
        }
    }

    handleAuthResponse(data) {
        if (data.success) {
            console.log('WebSocket authentication successful');
            this.isAuthenticated = true;
        } else {
            console.error('WebSocket authentication failed:', data.message);
            this.isAuthenticated = false;
            // Try to refresh token and reconnect
            auth.refreshToken().then(() => {
                this.connect();
            });
        }
    }

    handleReconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            setTimeout(() => {
                console.log(`Attempting to reconnect (${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})`);
                this.connect();
                this.reconnectAttempts++;
                this.reconnectDelay *= 1.5; // Exponential backoff
            }, this.reconnectDelay);
        }
    }

    subscribe(type, handler) {
        this.handlers.set(type, handler);
    }

    unsubscribe(type) {
        this.handlers.delete(type);
    }

    disconnect() {
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
    }
}

export default new WebSocketService(); 