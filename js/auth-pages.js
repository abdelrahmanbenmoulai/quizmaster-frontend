/**
 * Auth Pages Guard
 * Prevents logged-in users from accessing auth pages (login, signup, etc.)
 * and redirects them to their appropriate dashboard
 */
import auth from './utils/auth.js';

document.addEventListener('DOMContentLoaded', function() {
    // Check if user is already logged in
    if (auth.isLoggedIn()) {
        console.log('User already logged in, redirecting to dashboard...');
        
        // Get user info to determine which dashboard to go to
        const userInfo = auth.getCurrentUser();
        const dashboardUrl = userInfo && userInfo.role === 'teacher' 
            ? 'teacher-dashboard.html' 
            : 'student-dashboard.html';
        
        console.log(`Redirecting to ${dashboardUrl}...`);
        window.location.href = dashboardUrl;
    } else {
        console.log('User not logged in, staying on auth page');
        
        // Clean up any back navigation prevention from previous sessions
        window._backNavigationPrevented = false;
    }
}); 