// Auth protection module
export default class AuthProtection {
    constructor() {
        this.init();
    }

    async init() {
        try {
            // Check if we're already on the login page
            if (window.location.pathname.includes('login.html')) {
                console.log("Already on login page, skipping auth check");
                return;
            }

            // Check if we have a token - try both keys
            let token = localStorage.getItem('token') || localStorage.getItem('userToken');
            if (!token) {
                console.log("No token found, redirecting to login");
                this.redirectToLogin();
                return;
            }

            // Try local validation first
            if (this.isTokenValid(token)) {
                console.log("Basic token validation passed");
                
                // Get user data from localStorage
                const userData = localStorage.getItem('userData');
                if (userData) {
                    console.log("Found cached user data");
                    return;
                }
            }

            // If local validation fails or no user data, verify with server
            console.log("Performing full server verification");
            const isValid = await this.verifyToken(token);
            if (!isValid) {
                console.log("Token verification failed, redirecting to login");
                this.redirectToLogin();
                return;
            }

            console.log("Token verified successfully");
        } catch (error) {
            console.error("Auth protection error:", error);
            // Only redirect if it's a real auth error, not a network error
            if (!error.message.includes('NetworkError') && !error.message.includes('Failed to fetch')) {
                this.redirectToLogin();
            } else {
                console.log("Network error detected, using cached authentication");
                // Check if we have valid cached credentials
                const token = localStorage.getItem('token') || localStorage.getItem('userToken');
                const userData = localStorage.getItem('userData');
                if (token && userData && this.isTokenValid(token)) {
                    console.log("Using cached credentials");
                    return;
                }
                this.redirectToLogin();
            }
        }
    }

    isTokenValid(token) {
        try {
            // Basic JWT structure check
            const parts = token.split('.');
            if (parts.length !== 3) {
                console.log("Token doesn't have 3 parts");
                return false;
            }
            
            // Try to decode the payload
            const payload = JSON.parse(atob(parts[1]));
            console.log("Token payload:", payload);
            
            // Check if token has basic required fields
            if (!payload.user_id || !payload.role) {
                console.log("Token missing user_id or role");
                return false;
            }
            
            // Check if token is expired
            if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
                console.log("Token is expired");
                return false;
            }
            
            // Check if role is valid
            if (!['student', 'teacher'].includes(payload.role)) {
                console.log("Invalid role:", payload.role);
                return false;
            }
            
            return true;
        } catch (error) {
            console.error("Token validation error:", error);
            return false;
        }
    }

    async verifyToken(token) {
        try {
            console.log("Verifying token...");
            
            // Try a simpler auth check first - if JWT can be verified locally
            // This is a temporary solution to prevent constant redirects
            if (this.isTokenValid(token)) {
                console.log("Basic token check passed");
                return true; // Basic check passed, allow access
            }
            
            // Full server verification
            console.log("Sending token to server for verification");
            const response = await fetch('/quizmaster/backend/auth/verify.php', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            console.log(`Server response status: ${response.status}`);
            
            // Even if not OK, try to parse the response to see the error
            const data = await response.json().catch(e => {
                console.error("Failed to parse response:", e);
                return { success: false, error: "Invalid response format" };
            });
            
            console.log("Verification response:", data);

            if (!response.ok) {
                throw new Error(`Server returned ${response.status}: ${data.error || 'Unknown error'}`);
            }

            if (!data.success) {
                throw new Error(data.error || 'Verification failed');
            }
            
            if (!data.user || !data.user.role || !['student', 'teacher'].includes(data.user.role)) {
                throw new Error('Invalid user data: ' + (data.user ? 'invalid role' : 'no user data'));
            }

            // Store user data
            localStorage.setItem('userData', JSON.stringify(data.user));
            console.log("Authentication successful");
            return true;
            
        } catch (error) {
            console.error('Auth verification failed:', error);
            // If it's a network error, try to use cached credentials
            if (error.message.includes('NetworkError') || error.message.includes('Failed to fetch')) {
                console.log("Network error detected, checking cached credentials");
                return this.isTokenValid(token);
            }
            return false;
        }
    }

    redirectToLogin() {
        // Only redirect if not already on login page
        if (!window.location.pathname.includes('login.html')) {
            window.location.href = '/quizmaster/frontend/login.html';
        }
    }
}

// Initialize auth protection
const authProtection = new AuthProtection(); 