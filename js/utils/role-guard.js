import auth from './auth.js';

/**
 * Role Guard utility
 * Protects pages based on user role and redirects users to the appropriate dashboard
 */
const roleGuard = {
  /**
   * Checks if user can access the current page based on role
   * @param {string} requiredRole - The role required to access this page ('teacher' or 'student')
   * @returns {Promise<boolean>} - Whether access is allowed
   */
  checkAccess: async function(requiredRole) {
    console.log(`Role Guard - Checking access for required role: ${requiredRole}`);
    
    // Make sure authentication is initialized first
    const authenticated = auth.isLoggedIn();
    if (!authenticated) {
      console.log('Role Guard - User not authenticated');
      return false;
    }
    
    // Get current token and decode it
    const token = auth.getToken();
    if (!token) {
      console.log('Role Guard - No token found');
      return false;
    }
    
    // Parse token to get role
    const tokenData = auth.parseToken(token);
    if (!tokenData || !tokenData.role) {
      console.log('Role Guard - Invalid token data');
      return false;
    }
    
    const userRole = tokenData.role;
    console.log(`Role Guard - User role from token: ${userRole}, Required role: ${requiredRole}`);
    
    // Check if roles match exactly
    if (userRole !== requiredRole) {
      console.log('Role Guard - Role mismatch');
      return false;
    }
    
    console.log('Role Guard - Access granted');
    return true;
  },
  
  /**
   * Redirect to login page
   */
  redirectToLogin: function() {
    if (window.location.pathname !== '/quizmaster/frontend/login.html') {
      window.location.href = '/quizmaster/frontend/login.html';
    }
  },
  
  /**
   * Redirect to appropriate dashboard based on role
   * @param {string} role - User role
   */
  redirectToDashboard: function(role) {
    const currentPath = window.location.pathname;
    console.log('Role Guard - Current path:', currentPath);
    
    // Don't redirect if we're on a settings page
    if (currentPath.includes('settings.html')) {
      console.log('Role Guard - On settings page, skipping dashboard redirect');
      return;
    }
    
    // Don't redirect if we're on the correct dashboard
    const targetPath = role === 'teacher' ? '/quizmaster/frontend/teacher-dashboard.html' : '/quizmaster/frontend/student-dashboard.html';
    console.log('Role Guard - Target dashboard path:', targetPath);
    
    if (!currentPath.endsWith(targetPath.split('/').pop())) {
      console.log('Role Guard - Redirecting to dashboard:', targetPath);
      window.location.href = targetPath;
    }
  },
  
  /**
   * Initialize role guard for a specific page
   * @param {string} requiredRole - The role required to access this page
   */
  initialize: async function(requiredRole) {
    console.log(`Role Guard - Initializing for ${requiredRole} page`);
    
    if (!requiredRole) {
      console.error('Role Guard - No required role specified');
      return false;
    }
    
    // Check if we're on the login page
    if (window.location.pathname.includes('login.html')) {
      console.log('Role Guard - On login page, skipping checks');
      return true;
    }
    
    // Clear any conflicting localStorage keys
    if (requiredRole === 'teacher') {
      if (localStorage.getItem('userAvatar')) {
        localStorage.removeItem('userAvatar');
      }
    } else if (requiredRole === 'student') {
      if (localStorage.getItem('teacherAvatar')) {
        localStorage.removeItem('teacherAvatar');
      }
    }
    
    // Check if user has access
    const hasAccess = await this.checkAccess(requiredRole);
    
    if (!hasAccess) {
      const userData = auth.getCurrentUser();
      if (!userData) {
        this.redirectToLogin();
      } else {
        // Check if we're on a settings page
        const currentPath = window.location.pathname;
        const isSettingsPage = currentPath.includes('settings.html');
        
        if (isSettingsPage) {
          // If on settings page and role doesn't match, redirect to appropriate settings
          const correctSettingsPage = userData.role === 'teacher' ? '/quizmaster/frontend/teacher-settings.html' : '/quizmaster/frontend/student-settings.html';
          if (!currentPath.endsWith(correctSettingsPage.split('/').pop())) {
            console.log('Role Guard - Redirecting to correct settings page:', correctSettingsPage);
            window.location.href = correctSettingsPage;
          }
        } else {
          // For non-settings pages, redirect to dashboard
          this.redirectToDashboard(userData.role);
        }
      }
      return false;
    }
    
    return true;
  }
};

export default roleGuard; 