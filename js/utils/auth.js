import config from '../config.js';

/**
 * Authentication Module
 * Handles user authentication, token management, and session handling
 */
const auth = {
    // Token cache to avoid repeated localStorage access
    _tokenCache: null,
    _isRefreshing: false,
    _refreshPromise: null,
    
    /**
     * Helper to get full API URL
     * @param {string} endpoint - API endpoint path
     * @returns {string} - Full API URL
     */
    getApiUrl: function(endpoint) {
        if (!endpoint) {
            return config.BASE_URL;
        }
        
        // Clean up the endpoint
        const cleanEndpoint = endpoint.trim();
        
        // Make sure we don't double-add slashes
        if (cleanEndpoint.startsWith('/')) {
            return `${config.BASE_URL}${cleanEndpoint}`;
        } else {
            return `${config.BASE_URL}/${cleanEndpoint}`;
        }
    },
    
    /**
     * Handles user login
     * @param {string} email - User email
     * @param {string} password - User password
     * @returns {Promise} - Response with authentication result
     */
    login: async function(email, password) {
        try {
            const loginUrl = this.getApiUrl(config.ENDPOINTS.AUTH.LOGIN);
            console.log('Attempting login with URL:', loginUrl);
            console.log('Login payload:', { email, password: '***' });
            
            const response = await fetch(loginUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email, password }),
            });

            // Log the raw response for debugging
            const responseText = await response.text();
            console.log('Raw login response:', responseText);
            
            let data;
            try {
                data = JSON.parse(responseText);
            } catch (parseError) {
                console.error('Failed to parse login response:', parseError);
                throw new Error('Invalid response from server');
            }
            
            if (!response.ok) {
                console.error('Login failed:', data);
                return {
                    success: false,
                    message: data.error || data.message || 'Login failed. Please try again.',
                    status: response.status
                };
            }
            
            if (data.token) {
                // Store token under both keys for compatibility
                localStorage.setItem('token', data.token);
                localStorage.setItem('userToken', data.token);
                this._tokenCache = data.token; // Update token cache
                
                if (data.user) {
                    localStorage.setItem('userData', JSON.stringify(data.user));
                }
                
                return {
                    success: true,
                    message: 'Login successful',
                    user: data.user,
                    token: data.token
                };
            } else {
                return {
                    success: false,
                    message: 'No token received. Please try again.',
                    status: response.status
                };
            }
        } catch (error) {
            console.error('Login error:', error);
            return {
                success: false,
                message: 'Connection error. Please check your network and try again.',
                error: error.message
            };
        }
    },
    
    /**
     * Gets the current authentication token
     * @returns {string|null} The authentication token or null if not logged in
     */
    getToken: function() {
        console.log('getToken() called - checking for token');
        
        // Return cached token if available
        if (this._tokenCache) {
            console.log('getToken() - Using cached token:', this._tokenCache.substring(0, 10) + '...');
            return this._tokenCache;
        }
        
        // Try to get token from sessionStorage first (more secure, survives page refresh)
        const sessionToken = sessionStorage.getItem(config.AUTH.STORAGE_KEYS.TOKEN);
        if (sessionToken) {
            console.log('getToken() - Retrieved from sessionStorage:', sessionToken.substring(0, 10) + '...');
            this._tokenCache = sessionToken;
            return sessionToken;
        }
        
        // Check both token keys in localStorage
        const token = localStorage.getItem(config.AUTH.STORAGE_KEYS.TOKEN) || localStorage.getItem('userToken');
        if (token) {
            console.log('getToken() - Retrieved from localStorage:', token.substring(0, 10) + '...');
            // Store in sessionStorage for future use
            sessionStorage.setItem(config.AUTH.STORAGE_KEYS.TOKEN, token);
            this._tokenCache = token;
            
            // Ensure token is stored under both keys for compatibility
            localStorage.setItem(config.AUTH.STORAGE_KEYS.TOKEN, token);
            localStorage.setItem('userToken', token);
            
            return token;
        }
        
        // Log all storage states for debugging
        console.log('getToken() - No token found. Storage state:', {
            sessionStorage: {
                token: !!sessionStorage.getItem(config.AUTH.STORAGE_KEYS.TOKEN)
            },
            localStorage: {
                configToken: !!localStorage.getItem(config.AUTH.STORAGE_KEYS.TOKEN),
                userToken: !!localStorage.getItem('userToken'),
                userData: !!localStorage.getItem('userData')
            },
            cache: !!this._tokenCache
        });
        
        return null;
    },
    
    /**
     * Gets the current logged in user information
     * @returns {Object|null} User information or null if not logged in
     */
    getCurrentUser: function() {
        const userJson = localStorage.getItem('userData');
        if (userJson) {
            try {
                return JSON.parse(userJson);
            } catch (e) {
                console.error('Error parsing user data:', e);
                return null;
            }
        }
        return null;
    },
    
    /**
     * Check if token is expired
     * @param {string} token - JWT token to check
     * @returns {boolean} True if expired, false if valid
     */
    isTokenExpired: function(token) {
        if (!token) return true;
        
        try {
            // Parse the JWT token
            const base64Url = token.split('.')[1];
            if (!base64Url) {
                console.error('Invalid token format - missing payload segment');
                return true;
            }
            
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
                return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
            }).join(''));
            
            const payload = JSON.parse(jsonPayload);
            console.log('Token payload:', payload);
            
            // Check if token has required fields
            if (!payload.user_id || !payload.role) {
                console.error('Token missing required fields (user_id or role)');
                return true;
            }
            
            // If token has expiration, check it
            if (payload.exp) {
                const currentTime = Math.floor(Date.now() / 1000);
                const isExpired = payload.exp < currentTime;
                
                // Add a buffer of 30 seconds to prevent edge cases
                const expiresIn = payload.exp - currentTime;
                const isNearlyExpired = expiresIn < 30;
                
                console.log('Token expiration check:', {
                    expiration: new Date(payload.exp * 1000).toISOString(),
                    current: new Date(currentTime * 1000).toISOString(),
                    expiresIn: expiresIn + ' seconds',
                    isExpired,
                    isNearlyExpired
                });
                
                // Consider nearly expired tokens as expired to proactively refresh
                return isExpired || isNearlyExpired;
            }
            
            // If no expiration field, token is considered valid
            console.log('Token has no expiration time, considering it valid');
            return false;
            
        } catch (error) {
            console.error('Error checking token expiration:', error);
            return true; // If we can't verify, assume it's expired
        }
    },
    
    /**
     * Check if user is logged in with valid token
     * @returns {boolean} Authentication status
     */
    isLoggedIn: function() {
        console.log('auth.isLoggedIn() called - checking authentication status');
        const token = this.getToken();
        
        if (!token) {
            console.log('auth.isLoggedIn() - No token found');
            return false;
        }
        
        // Check token expiration
        if (this.isTokenExpired(token)) {
            console.log('auth.isLoggedIn() - Token expired or invalid');
            // Try to refresh the token before giving up
            this.refreshToken().catch(error => {
                console.error('Token refresh failed:', error);
            });
            return false;
        }
        
        // Parse token to get role
        const tokenData = this.parseToken(token);
        if (!tokenData || !tokenData.role) {
            console.log('auth.isLoggedIn() - Invalid token data');
            return false;
        }
        
        console.log('auth.isLoggedIn() - User is logged in with role:', tokenData.role);
        return true;
    },
    
    /**
     * Refreshes the authentication token
     * @returns {Promise<boolean>} True if refresh successful, false otherwise
     */
    refreshToken: async function() {
        // If already refreshing, return the existing promise
        if (this._isRefreshing) {
            console.log('Token refresh already in progress, waiting...');
            return this._refreshPromise;
        }
        
        try {
            this._isRefreshing = true;
            this._refreshPromise = (async () => {
                console.log('Starting token refresh...');
                
                // Get current token
                const currentToken = this.getToken();
                if (!currentToken) {
                    console.log('No token to refresh');
                    return false;
                }
                
                // Check if token is actually expired
                if (!this.isTokenExpired(currentToken)) {
                    console.log('Current token is still valid, no refresh needed');
                    return true;
                }
                
                const refreshUrl = this.getApiUrl(config.ENDPOINTS.AUTH.REFRESH);
                const response = await fetch(refreshUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${currentToken}`
                    }
                });
                
                if (!response.ok) {
                    console.log('Token refresh failed:', response.status);
                    // Clear invalid token
                    this.clearTokens();
                    return false;
                }
                
                const data = await response.json();
                if (!data.token) {
                    console.log('No new token received');
                    this.clearTokens();
                    return false;
                }
                
                // Update tokens in storage
                localStorage.setItem('token', data.token);
                localStorage.setItem('userToken', data.token);
                sessionStorage.setItem(config.AUTH.STORAGE_KEYS.TOKEN, data.token);
                this._tokenCache = data.token;
                
                // Update user data if provided
                if (data.user) {
                    localStorage.setItem('userData', JSON.stringify(data.user));
                }
                
                console.log('Token refresh successful');
                return true;
            })();
            
            return await this._refreshPromise;
        } catch (error) {
            console.error('Token refresh error:', error);
            this.clearTokens();
            return false;
        } finally {
            this._isRefreshing = false;
            this._refreshPromise = null;
        }
    },
    
    /**
     * Clear all authentication tokens and data
     */
    clearTokens: function() {
        this._tokenCache = null;
        localStorage.removeItem('token');
        localStorage.removeItem('userToken');
        sessionStorage.removeItem(config.AUTH.STORAGE_KEYS.TOKEN);
        localStorage.removeItem('userData');
    },
    
    /**
     * Handle authentication failure
     * @param {number} status - HTTP status code from the failure
     * @param {boolean} redirectOnFailure - Whether to redirect on auth failure
     * @returns {Promise<boolean>} - Whether auth was recovered
     */
    handleAuthFailure: async function(status, redirectOnFailure = true) {
        // If it's a 401 unauthorized error, try to refresh the token first
        if (status === 401) {
            console.log('Auth failure detected (401) - attempting token refresh');
            const refreshSuccess = await this.refreshToken();
            
            if (refreshSuccess) {
                console.log('Token refresh successful, continuing with request');
                return true;
            }
            
            console.log('Token refresh failed - logging out user');
            this.logout(redirectOnFailure);
            return false;
        }
        return false;
    },
    
    /**
     * Initialize authentication state - verify if logged in and redirect if needed
     * @param {boolean} redirectOnFailure - Whether to redirect on auth failure
     * @returns {boolean} - Whether user is authenticated
     */
    initializeAuth: async function(redirectOnFailure = true) {
        console.log('auth.initializeAuth() called with redirectOnFailure =', redirectOnFailure);
        
        try {
            // First try to refresh the token
            const token = this.getToken();
            if (token) {
                const refreshResult = await this.refreshToken();
                if (refreshResult) {
                    console.log('Token refreshed during initialization');
                }
            }
            
            // Check if user is logged in
            if (!this.isLoggedIn()) {
                console.log('auth.initializeAuth() - User not logged in');
                
                if (redirectOnFailure) {
                    // Get current page path
                    const currentPath = window.location.pathname;
                    
                    // Skip redirect if already on login page
                    if (currentPath.includes('login.html')) {
                        console.log('Already on login page - skipping redirect');
                        return false;
                    }
                    
                    console.log('Redirecting to login page...');
                    window.location.replace('/quizmaster/frontend/login.html');
                }
                
                return false;
            }
            
            console.log('auth.initializeAuth() - User is logged in');
            
            // Store token in both storages
            const currentToken = this.getToken();
            if (currentToken) {
                sessionStorage.setItem(config.AUTH.STORAGE_KEYS.TOKEN, currentToken);
                localStorage.setItem(config.AUTH.STORAGE_KEYS.TOKEN, currentToken);
            }
            
            // Prevent back navigation once logged in
            this.preventBackNavigation();
            
            return true;
        } catch (error) {
            console.error('Error during auth initialization:', error);
            return false;
        }
    },
    
    /**
     * Prevent navigation back to login pages once logged in
     */
    preventBackNavigation: function() {
        // Skip if we've already set this up
        if (window._backNavigationPrevented) return;
        
        console.log('Setting up back navigation prevention');
        
        // Replace the current history state to prevent going back to login page
        window.history.pushState(null, '', window.location.href);
        
        // When user tries to navigate back, push another state to prevent it
        window.addEventListener('popstate', () => {
            console.log('Back button pressed - preventing navigation');
            window.history.pushState(null, '', window.location.href);
        });
        
        // Mark as set up to avoid duplicate listeners
        window._backNavigationPrevented = true;
    },
    
    /**
     * Logs out the current user
     * @param {boolean} redirect - Whether to redirect to login page after logout
     */
    logout: function(redirect = true) {
        console.log('Logging out user...');
        
        // Clear all storage
        localStorage.clear();
        sessionStorage.clear();
        this._tokenCache = null;
        
        // Remove back navigation prevention
        window._backNavigationPrevented = false;
        
        // Force redirect to login page
        if (redirect) {
            console.log('Redirecting to login page...');
            window.location.replace('/quizmaster/frontend/login.html');
        }
    },
    
    /**
     * Gets the user ID from current user data
     * @returns {number|null} The user ID or null if not found
     */
    getUserId: function() {
        const userData = this.getCurrentUser();
        if (userData && userData.id) {
            return userData.id;
        }
        
        // As fallback, try to get from token payload
        try {
            const token = this.getToken();
            if (token) {
                const base64Url = token.split('.')[1];
                const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
                const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
                    return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
                }).join(''));
                
                const payload = JSON.parse(jsonPayload);
                if (payload && payload.user_id) {
                    return payload.user_id;
                }
            }
        } catch (e) {
            console.error('Error extracting user ID from token:', e);
        }
        
        return null;
    },
    
    /**
     * Parse a JWT token and return its payload
     * @param {string} token - The JWT token to parse
     * @returns {Object|null} The decoded token payload or null if invalid
     */
    parseToken: function(token) {
        if (!token) return null;
        
        try {
            const base64Url = token.split('.')[1];
            if (!base64Url) {
                console.error('Invalid token format - missing payload segment');
                return null;
            }
            
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
                return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
            }).join(''));
            
            return JSON.parse(jsonPayload);
        } catch (error) {
            console.error('Error parsing token:', error);
            return null;
        }
    }
};

/**
 * Helper function to fetch with automatic token refresh
 * @param {string} endpoint - API endpoint to call
 * @param {Object} options - Fetch options
 * @param {boolean} redirectOnFailure - Whether to redirect on auth failure
 * @returns {Promise<Response>} - Fetch response
 */
export async function fetchWithTokenRefresh(endpoint, options = {}, redirectOnFailure = true) {
    // Check if we should skip redirects during quiz sessions
    if (window.skipAuthRedirects) {
        console.log('fetchWithTokenRefresh called during quiz session - preventing redirects');
        redirectOnFailure = false;
    }
    
    const token = auth.getToken();
    
    if (!token) {
        console.error('No token available for request');
        if (redirectOnFailure) {
            window.location.href = 'login.html';
        }
        throw new Error('No authentication token available');
    }

    // Add authorization header
    const headers = {
        ...options.headers,
        'Authorization': `Bearer ${token}`
    };

    try {
        // Ensure endpoint format is correct
        let formattedEndpoint = endpoint;
        
        // Fix common mistakes in endpoint formatting
        if (endpoint.includes('backendcommon/subjects') || endpoint.includes('/backendcommon/subjects')) {
            formattedEndpoint = 'common/subjects.php'; // Special case for malformed URL
            console.log('Fixing backendcommon/subjects URL to common/subjects.php');
        } else if (endpoint === 'common/subjects') {
            formattedEndpoint = 'common/subjects.php'; // Ensure the .php extension
            console.log('Adding .php extension to common/subjects');
        } else if (endpoint.startsWith('common/')) {
            // Make sure common/ paths have proper format
            formattedEndpoint = endpoint;
        } else if (endpoint.includes('fix_quiz_status.php')) {
            // Skip non-existent endpoint completely
            formattedEndpoint = 'student/update-statistics.php';
            console.log('Replacing fix_quiz_status.php with student/update-statistics.php');
        } else if (endpoint.includes('direct_fix.php')) {
            // Skip non-existent endpoint completely 
            formattedEndpoint = 'student/update-statistics.php';
            console.log('Replacing direct_fix.php with student/update-statistics.php');
        } else if (endpoint.includes('student-quizzes-router.php')) {
            // Use the correct path
            formattedEndpoint = 'student/quizzes.php' + (endpoint.includes('?') ? endpoint.substring(endpoint.indexOf('?')) : '');
            console.log('Replacing student-quizzes-router.php with student/quizzes.php');
        }
        
        // Use getApiUrl to construct the full URL
        const fullUrl = auth.getApiUrl(formattedEndpoint);
        console.log('Making request to:', fullUrl);
        console.log('Request headers:', headers);
        
        let response;
        
        // Special handling for common/subjects to add fallback
        if (formattedEndpoint.includes('common/subjects')) {
            console.log('Using special handling for common/subjects endpoint');
            try {
                response = await fetch(fullUrl, { ...options, headers });
                if (!response.ok && response.status === 404) {
                    // For 404 on common/subjects, try an alternate path
                    console.log('common/subjects not found, trying different path structure');
                    
                    // Try both with and without PHP extension
                    if (formattedEndpoint.endsWith('.php')) {
                        formattedEndpoint = formattedEndpoint.replace('.php', '');
                    } else {
                        formattedEndpoint = formattedEndpoint + '.php';
                    }
                    
                    const altUrl = auth.getApiUrl(formattedEndpoint);
                    response = await fetch(altUrl, { ...options, headers });
                }
            } catch (error) {
                console.error('Error fetching common/subjects:', error);
                throw error;
            }
        } else {
            // Normal request handling
            response = await fetch(fullUrl, { ...options, headers });
        }
        
        console.log('Response status:', response.status);
        
        if (response.status === 401) {
            console.log('Received 401, attempting token refresh');
            // Try to refresh the token
            const refreshSuccess = await auth.refreshToken();
            
            if (refreshSuccess) {
                console.log('Token refresh successful, retrying request');
                // Retry the request with the new token
                const newToken = auth.getToken();
                headers['Authorization'] = `Bearer ${newToken}`;
                return await fetch(fullUrl, { ...options, headers });
            }
            
            console.log('Token refresh failed, handling auth failure');
            // If refresh failed, handle auth failure
            await auth.handleAuthFailure(401, redirectOnFailure);
            throw new Error('Authentication failed');
        }
        
        // Log response for debugging
        const responseText = await response.text();
        console.log('Response text:', responseText);
        
        // Create a new response with the text
        return new Response(responseText, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers
        });
    } catch (error) {
        console.error('Request failed:', error);
        throw error;
    }
}

export default auth; 