/**
 * Navigation Guard - Prevents unauthorized access to authenticated pages
 * and prevents back navigation for logged-in users
 */
import auth from './utils/auth.js';
import config from './config.js';

document.addEventListener('DOMContentLoaded', async function() {
    // Skip guard on auth pages
    if (isAuthPage()) {
        console.log('On auth page, skipping navigation guard');
        return;
    }
    
    try {
        // First try to initialize auth
        const authResult = await auth.initializeAuth(false);
        console.log('Auth initialization result:', authResult);
        
        // Check if user is logged in
        if (!auth.isLoggedIn()) {
            console.log('User not logged in, redirecting to login page');
            window.location.replace('/quizmaster/frontend/login.html');
            return;
        }
        
        // User is logged in, prevent back navigation
        auth.preventBackNavigation();
        
        // Set up periodic token refresh
        setupTokenRefresh();
        
        // Handle F5/refresh to make sure we don't end up in a weird state
        window.addEventListener('beforeunload', function(e) {
            // Store current token in sessionStorage to survive refresh
            const token = auth.getToken();
            if (token) {
                sessionStorage.setItem(config.AUTH.STORAGE_KEYS.TOKEN, token);
            }
            
            // Don't actually prevent refresh, just reinforce we are preventing back nav
            auth.preventBackNavigation();
        });
    } catch (error) {
        console.error('Navigation guard error:', error);
        window.location.replace('/quizmaster/frontend/login.html');
    }
});

/**
 * Check if current page is an authentication page
 * @returns {boolean}
 */
function isAuthPage() {
    const authPages = ['login.html', 'signup.html', 'forgot-password.html', 'reset-password.html'];
    const currentPath = window.location.pathname;
    
    return authPages.some(page => currentPath.endsWith(page));
}

/**
 * Set up periodic token refresh
 */
function setupTokenRefresh() {
    // Clear any existing refresh intervals
    if (window._tokenRefreshInterval) {
        clearInterval(window._tokenRefreshInterval);
    }
    
    // Refresh token periodically
    window._tokenRefreshInterval = setInterval(async () => {
        try {
            await auth.refreshToken();
        } catch (error) {
            console.error('Token refresh error:', error);
        }
    }, config.AUTH.TOKEN_REFRESH_INTERVAL);
    
    // Also refresh token when tab becomes visible
    document.addEventListener('visibilitychange', async () => {
        if (document.visibilityState === 'visible') {
            try {
                await auth.refreshToken();
            } catch (error) {
                console.error('Token refresh error on visibility change:', error);
            }
        }
    });
}

/**
 * Determine dashboard URL based on user role
 * @returns {string} URL to the appropriate dashboard
 */
export function getDashboardUrl() {
    const user = auth.getCurrentUser();
    if (user && user.role === 'teacher') {
        return 'teacher-dashboard.html';
    }
    return 'student-dashboard.html';
}

export default { getDashboardUrl }; 