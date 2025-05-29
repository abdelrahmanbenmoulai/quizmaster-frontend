import notifications from './utils/notifications.js';
import auth from './utils/auth.js';

document.addEventListener('DOMContentLoaded', function() {
    // Check if user is already logged in, redirect them away from login page
    if (auth.isLoggedIn()) {
        console.log('User is already logged in, redirecting to dashboard');
        // Determine which dashboard to go to based on role
        const userInfo = auth.getCurrentUser();
        if (userInfo && userInfo.role === 'teacher') {
            window.location.href = 'teacher-dashboard.html';
        } else {
            window.location.href = 'student-dashboard.html';
        }
        return; // Stop executing further code
    }
    
    // Set a flag to allow being on the login page
    sessionStorage.setItem('allow_login', 'true');
    console.log('Set allow_login flag to permit access to login page');
    
    // Clear any previous back navigation prevention
    window._backNavigationPrevented = false;
    
    // Get form elements
    const loginForm = document.getElementById('login-form');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const emailError = document.getElementById('email-error');
    const passwordError = document.getElementById('password-error');
    
    // Password visibility elements
    const togglePassword = document.getElementById('toggle-password');

    // Toggle password visibility
    if (togglePassword) {
        togglePassword.addEventListener('click', function(e) {
            e.preventDefault(); // Prevent form submission
            
            const type = passwordInput.type === 'password' ? 'text' : 'password';
            passwordInput.type = type;
            
            // Toggle icon between eye and eye-slash
            const icon = togglePassword.querySelector('i');
            if (icon) {
                icon.classList.toggle('fa-eye');
                icon.classList.toggle('fa-eye-slash');
            }
            
            // Update ARIA attributes
            const isVisible = type === 'text';
            togglePassword.setAttribute('aria-pressed', isVisible);
            togglePassword.setAttribute('aria-label', `${isVisible ? 'Hide' : 'Show'} password`);
        });
    }

    // Email validation
    function validateEmail(email) {
        const re = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
        return re.test(String(email).toLowerCase());
    }

    // Clear error messages
    function clearErrors() {
        emailError.textContent = '';
        passwordError.textContent = '';
        emailError.setAttribute('aria-hidden', 'true');
        passwordError.setAttribute('aria-hidden', 'true');
    }

    // Show error message
    function showError(element, message) {
        element.textContent = message;
        element.setAttribute('aria-hidden', 'false');
        element.setAttribute('role', 'alert');
    }

    // Check if email exists
    async function checkEmailExists(email) {
        try {
            // Ensure email is lowercase
            email = email.toLowerCase();
            
            // Improved error handling with new dedicated endpoint
            const response = await fetch(`/quizmaster/api/auth/check_email.php?email=${encodeURIComponent(email)}`);
            
            if (!response.ok) {
                throw new Error(`Server responded with status: ${response.status}`);
            }
            
            // Check if response is JSON
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                console.error('Server returned non-JSON response:', await response.text());
                throw new Error('Server returned non-JSON response');
            }

            const data = await response.json();
            return data.exists || false;
        } catch (error) {
            console.error('Error checking email:', error);
            return false;
        }
    }

    // Validate form
    function validateForm() {
        let valid = true;
        clearErrors();

        // Validate email
        if (!emailInput.value.trim()) {
            showError(emailError, 'Email is required');
            emailInput.setAttribute('aria-invalid', 'true');
            valid = false;
        } else if (!validateEmail(emailInput.value.trim())) {
            showError(emailError, 'Please enter a valid email address');
            emailInput.setAttribute('aria-invalid', 'true');
            valid = false;
        } else if (emailInput.value.trim() !== emailInput.value.trim().toLowerCase()) {
            showError(emailError, 'Email must be in lowercase');
            emailInput.setAttribute('aria-invalid', 'true');
            valid = false;
        } else {
            emailInput.setAttribute('aria-invalid', 'false');
        }

        // Validate password
        if (!passwordInput.value) {
            showError(passwordError, 'Password is required');
            passwordInput.setAttribute('aria-invalid', 'true');
            valid = false;
        } else {
            passwordInput.setAttribute('aria-invalid', 'false');
        }

        return valid;
    }

    // Form submission
    loginForm.addEventListener('submit', async function(e) {
        e.preventDefault();

        // IMPORTANT: Explicitly allow login form submission
        sessionStorage.setItem('allow_login', 'true');
        sessionStorage.setItem('login_form_submitted', 'true');
        console.log('LOGIN FORM SUBMISSION - Setting permission flags');

        if (!validateForm()) {
            notifications.error('Please correct the errors in the form');
            // Focus the first invalid field
            const firstInvalid = loginForm.querySelector('[aria-invalid="true"]');
            if (firstInvalid) firstInvalid.focus();
            return;
        }

        const submitButton = this.querySelector('button[type="submit"]');
        const originalButtonText = submitButton.innerHTML;

        try {
            submitButton.disabled = true;
            submitButton.innerHTML = '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i> <span>Logging in...</span>';
            submitButton.setAttribute('aria-label', 'Logging in, please wait...');

            // Ensure email is lowercase
            const email = emailInput.value.trim().toLowerCase();
            
            try {
                const data = await auth.login(email, passwordInput.value);
                
                // Check if login was successful
                if (data && data.success) {
                    console.log('Login successful, data:', data);
                    
                    // CRITICAL: Ensure we can navigate to dashboard
                    // This creates a special flag that allows redirect to dashboard
                    sessionStorage.setItem('login_successful', 'true');
                    sessionStorage.removeItem('allow_login'); // Clear this so we can redirect away from login
                    
                    // DEBUG: Log token storage
                    const token = auth.getToken();
                    console.log('After login - Token exists:', !!token);
                    if (token) {
                        console.log('Token preview:', token.substring(0, 15) + '...' + token.substring(token.length - 15));
                        
                        // Set flag to prevent redirect loops
                        sessionStorage.setItem('just_logged_in', 'true');
                        console.log('Set just_logged_in flag to prevent redirect loops');
                        
                        // Ensure token is properly persisted in localStorage before redirecting
                        localStorage.setItem('userToken', token);
                        
                        // Verify localStorage persistence
                        const verifyToken = localStorage.getItem('userToken');
                        if (!verifyToken) {
                            console.error('CRITICAL ERROR: Token not persisted to localStorage!');
                            // Try one more time with a different approach
                            const tokenStr = String(token);
                            localStorage.setItem('userToken', tokenStr);
                            console.log('Second attempt to store token in localStorage');
                        }
                        
                        // Check token format and expiration
                        try {
                            const parts = token.split('.');
                            if (parts.length === 3) {
                                const payload = JSON.parse(atob(parts[1]));
                                console.log('Token payload:', payload);
                                
                                const now = Math.floor(Date.now() / 1000);
                                if (payload.exp) {
                                    console.log('Token expiration:', new Date(payload.exp * 1000).toLocaleString());
                                    console.log('Current time:', new Date(now * 1000).toLocaleString());
                                    console.log('Seconds until expiry:', payload.exp - now);
                                } else {
                                    console.log('Token has no expiration');
                                }
                            } else {
                                console.error('Token is not in valid JWT format');
                            }
                        } catch (e) {
                            console.error('Error parsing token:', e);
                        }
                    }
                    
                    // Check auth status before redirect
                    console.log('isLoggedIn() result before redirect:', auth.isLoggedIn());
                    
                    // Set up back navigation prevention
                    auth.preventBackNavigation();
                    console.log('Back navigation prevention set up');
                    
                    // Redirect based on role
                    const userInfo = auth.getCurrentUser();
                    console.log('User info from token:', userInfo);
                    
                    if (userInfo) {
                        // Add a short delay to ensure token is saved
                        setTimeout(() => {
                            const redirectUrl = userInfo.role === 'teacher' 
                                ? 'teacher-dashboard.html' 
                                : 'student-dashboard.html';
                            
                            console.log(`Redirecting to ${redirectUrl} in 500ms...`);
                            window.location.href = redirectUrl;
                        }, 500);
                    } else {
                        console.error('No user info found in token, using fallback redirect');
                        // Fallback if no role is found
                        setTimeout(() => {
                            console.log('Redirecting to student-dashboard.html (fallback)');
                            window.location.href = 'student-dashboard.html';
                        }, 500);
                    }
                } else {
                    throw new Error(data.message || 'Login failed. Invalid credentials.');
                }
            } catch (authError) {
                console.error('Authentication error:', authError);
                notifications.error(authError.message || 'Login failed. Please check your credentials and try again.');
                
                // Reset form state
                submitButton.disabled = false;
                submitButton.innerHTML = originalButtonText;
                submitButton.removeAttribute('aria-label');
                
                // Focus back on the form
                emailInput.focus();
            }
        } catch (error) {
            console.error('Login error:', error);
            notifications.error('An unexpected error occurred. Please try again later.');
            
            // Reset form state
            submitButton.disabled = false;
            submitButton.innerHTML = originalButtonText;
            submitButton.removeAttribute('aria-label');
            
            // Focus back on the form
            emailInput.focus();
        }
    });

    // Clear errors on input
    emailInput.addEventListener('input', () => {
        emailError.textContent = '';
        emailError.setAttribute('aria-hidden', 'true');
        emailInput.setAttribute('aria-invalid', 'false');
    });
    
    // Force email to lowercase on input
    emailInput.addEventListener('input', function() {
        // Simply convert to lowercase without trying to maintain cursor position
        // since setSelectionRange doesn't work on email input types
        const lowercase = this.value.toLowerCase();
        
        // Only update if there's a difference
        if (this.value !== lowercase) {
            this.value = lowercase;
        }
    });
    
    // Also enforce lowercase on blur (when leaving the field)
    emailInput.addEventListener('blur', function() {
        this.value = this.value.toLowerCase();
    });
    
    passwordInput.addEventListener('input', () => {
        passwordError.textContent = '';
        passwordError.setAttribute('aria-hidden', 'true');
        passwordInput.setAttribute('aria-invalid', 'false');
    });

    // Handle Enter key in form fields
    loginForm.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            const submitButton = loginForm.querySelector('button[type="submit"]');
            if (!submitButton.disabled) {
                submitButton.click();
            }
        }
    });
});
