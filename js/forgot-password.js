import notifications from './utils/notifications.js?v=1.0.1';
import API_CONFIG from './config.js?v=1.0.1';
import { validatePassword } from './utils/validation.js';

class PasswordReset {
    constructor() {
        // Email verification properties
        this.userEmail = null;
        
        // Form elements
        this.emailForm = null;
        this.verificationForm = null;
        this.resetForm = null;
        
        // Input elements
        this.emailInput = null;
        this.verificationInput = null;
        this.newPasswordInput = null;
        this.confirmPasswordInput = null;
        
        // Error message elements
        this.emailError = null;
        this.verificationError = null;
        this.newPasswordError = null;
        this.confirmPasswordError = null;
        
        // Step elements
        this.step1 = null;
        this.step2 = null;
        this.step3 = null;
        
        // Links
        this.resendCodeLink = null;
        this.backToEmailLink = null;
        
        // Initialize the component
        this.init();
    }
    
    init() {
        console.log('Initializing PasswordReset component');
        
        // Get step containers
        this.step1 = document.getElementById('step-1');
        this.step2 = document.getElementById('step-2');
        this.step3 = document.getElementById('step-3');
        
        // Get forms
        this.emailForm = document.getElementById('email-form');
        this.verificationForm = document.getElementById('verification-form');
        this.resetForm = document.getElementById('reset-form');
        
        // Get inputs
        this.emailInput = document.getElementById('email');
        this.verificationInput = document.getElementById('verification-code');
        this.newPasswordInput = document.getElementById('new-password');
        this.confirmPasswordInput = document.getElementById('confirm-password');
        
        // Get error message elements
        this.emailError = document.getElementById('email-error');
        this.verificationError = document.getElementById('verification-error');
        this.newPasswordError = document.getElementById('new-password-error');
        this.confirmPasswordError = document.getElementById('confirm-password-error');
        
        // Get links
        this.resendCodeLink = document.getElementById('resend-code');
        this.backToEmailLink = document.getElementById('back-to-email');
        
        // Get password strength element
        this.passwordStrength = document.querySelector('.password-strength');
        
        // Set up event listeners
        this.setupEventListeners();
    }
    
    setupEventListeners() {
        console.log('Setting up event listeners');
        
        // Form submission handlers
        if (this.emailForm) {
            this.emailForm.addEventListener('submit', this.handleEmailSubmit.bind(this));
        }
        
        if (this.verificationForm) {
            this.verificationForm.addEventListener('submit', this.handleVerificationSubmit.bind(this));
        }
        
        if (this.resetForm) {
            this.resetForm.addEventListener('submit', this.handleResetSubmit.bind(this));
        }
        
        // Password toggle buttons
        const toggleButtons = document.querySelectorAll('.toggle-password');
        toggleButtons.forEach(button => {
            button.addEventListener('click', () => this.togglePasswordVisibility(button));
        });
        
        // Password strength meter
        if (this.newPasswordInput) {
            this.newPasswordInput.addEventListener('input', this.checkPasswordStrength.bind(this));
        }
        
        // Resend code link
        if (this.resendCodeLink) {
            this.resendCodeLink.addEventListener('click', (e) => {
                e.preventDefault();
                this.resendVerificationCode();
            });
        }
        
        // Back to email link
        if (this.backToEmailLink) {
            this.backToEmailLink.addEventListener('click', (e) => {
                e.preventDefault();
                this.showStep(1);
            });
        }
    }
    
    async handleEmailSubmit(e) {
        e.preventDefault();
        
        if (!this.validateEmail()) {
            return;
        }
        
        const button = this.emailForm.querySelector('button');
        const originalText = button.textContent;
        
        try {
            button.disabled = true;
            button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
            
            // Save email
            this.userEmail = this.emailInput.value;
            
            // Debug: Log the payload being sent
            console.log('Requesting password reset for:', { email: this.userEmail });
            
            // Request password reset
            const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.AUTH.FORGOT_PASSWORD}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email: this.userEmail })
            });
            
            // Debug: Log the raw response
            const text = await response.text();
            console.log('Raw response from forgot-password.php:', text);
            let data;
            try {
                data = JSON.parse(text);
                console.log('Parsed data:', data); // Debug log to see the exact structure
            } catch (err) {
                throw new Error('Invalid JSON response from server');
            }
            
            if (!response.ok) {
                throw new Error(data.error || 'Failed to send verification code');
            }
            
            // Debug: Log the verification code and user data received from the backend
            console.log('Backend response data:', {
                code: '******', // Masked for security
                fullname: data.data.fullname,
                email: this.userEmail,
                rawData: {
                    code: '******', // Masked for security
                    expiry: data.data.expiry,
                    fullname: data.data.fullname
                }
            });
            
            // Make sure we have a valid fullname
            if (!data.data.fullname) {
                console.error('No fullname found in backend response:', {
                    expiry: data.data.expiry,
                    fullname: data.data.fullname || null
                });
            }
            
            // Send verification email using EmailJS
            const emailResponse = await emailjs.send(
                'service_a2ej7l2',
                'template_ps44fjh',
                {
                    to_name: data.data.fullname || 'QuizMaster User', // Use fullname or fallback
                    to_email: this.userEmail,
                    from_name: 'QuizMaster Team',
                    verification_code: data.data.code,
                    expiry_time: new Date(data.data.expiry).toLocaleString()
                },
                'hN40D-HZvokoFebTV'
            );
            
            // Debug: Log the EmailJS response and payload
            console.log('EmailJS payload:', {
                to_name: data.data.fullname || 'QuizMaster User',
                to_email: this.userEmail,
                from_name: 'QuizMaster Team',
                verification_code: '******', // Masked for security
                expiry_time: new Date(data.data.expiry).toLocaleString()
            });
            console.log('EmailJS response:', emailResponse);
            
            notifications.success('Verification code sent successfully!');
            this.showStep(2);
            
        } catch (error) {
            console.error('Error:', error);
            notifications.error(error.message || 'An error occurred. Please try again.');
        } finally {
            button.disabled = false;
            button.textContent = originalText;
        }
    }
    
    async handleVerificationSubmit(e) {
        e.preventDefault();
        
        const enteredCode = this.verificationInput.value.trim();
        
        if (!enteredCode) {
            this.showError(this.verificationError, 'Please enter the verification code');
            return;
        }
        
        const button = this.verificationForm.querySelector('button');
        const originalText = button.textContent;
        
        try {
            button.disabled = true;
            button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verifying...';
            
            // Store the verification code for later use
            this.verificationCode = enteredCode;
            
            // Debug: Log the payload being sent
            console.log('Verifying with:', {
                email: this.userEmail,
                code: '******', // Masked for security
                action: 'verify',
                purpose: 'password_reset'
            });
            
            // Verify the code
            const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.AUTH.VERIFY}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    email: this.userEmail,
                    code: enteredCode,
                    action: 'verify',
                    purpose: 'password_reset'
                })
            });
            
            // Debug: Log the raw response
            const text = await response.text();
            console.log('Raw response from verify.php:', text);
            let data;
            try {
                data = JSON.parse(text);
            } catch (err) {
                throw new Error('Invalid JSON response from server');
            }
            
            if (!response.ok) {
                throw new Error(data.error || 'Invalid verification code');
            }
            
            this.clearError(this.verificationError);
            this.showStep(3);
            notifications.success('Code verified successfully!');
            
        } catch (error) {
            console.error('Error:', error);
            this.showError(this.verificationError, error.message || 'An error occurred. Please try again.');
        } finally {
            button.disabled = false;
            button.textContent = originalText;
        }
    }
    
    async handleResetSubmit(e) {
        e.preventDefault();
        
        if (!this.validateResetForm()) {
            return;
        }
        
        const button = this.resetForm.querySelector('button');
        const originalText = button.textContent;
        
        try {
            button.disabled = true;
            button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Resetting...';
            
            // Use the stored verification code from step 2
            const verificationCode = this.verificationCode;
            
            // Debug: Log the payload being sent
            console.log('Resetting password with:', {
                email: this.userEmail,
                code: '******', // Masked for security
                new_password: '******' // Masked for security
            });
            
            // Reset password
            const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.AUTH.RESET_PASSWORD}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    email: this.userEmail,
                    code: verificationCode,
                    new_password: this.newPasswordInput.value
                })
            });
            
            // Debug: Log the raw response
            const responseText = await response.text();
            console.log('Raw response from reset-password.php:', responseText);
            
            let data;
            try {
                data = JSON.parse(responseText);
            } catch (err) {
                throw new Error('Invalid JSON response from server');
            }
            
            if (!response.ok) {
                throw new Error(data.error || 'Failed to reset password');
            }
            
            notifications.success('Password reset successfully!');
            window.location.href = '/quizmaster/frontend/login.html';
            
        } catch (error) {
            console.error('Error:', error);
            notifications.error(error.message || 'An error occurred. Please try again.');
        } finally {
            button.disabled = false;
            button.textContent = originalText;
        }
    }
    
    async resendVerificationCode() {
        try {
            const button = this.resendCodeLink;
            const originalText = button.textContent;
            
            button.disabled = true;
            button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
            
            // Request new verification code
            const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.AUTH.FORGOT_PASSWORD}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email: this.userEmail })
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || 'Failed to send verification code');
            }
            
            notifications.success('New verification code sent successfully!');
            
        } catch (error) {
            console.error('Error:', error);
            notifications.error(error.message || 'An error occurred. Please try again.');
        } finally {
            button.disabled = false;
            button.textContent = originalText;
        }
    }
    
    validateEmail() {
        const email = this.emailInput.value.trim();
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        
        if (!email) {
            this.showError(this.emailError, 'Email is required');
            return false;
        }
        
        if (!emailRegex.test(email)) {
            this.showError(this.emailError, 'Please enter a valid email address');
            return false;
        }
        
        this.clearError(this.emailError);
        return true;
    }
    
    validateResetForm() {
        const newPassword = this.newPasswordInput.value;
        const confirmPassword = this.confirmPasswordInput.value;
        
        if (!newPassword) {
            this.showError(this.newPasswordError, 'New password is required');
            return false;
        }
        
        const { isValid, feedback } = this.isStrongPassword(newPassword);
        if (!isValid) {
            this.showError(this.newPasswordError, 'Password requirements not met:\n' + feedback.join('\n'));
            return false;
        }
        
        if (newPassword !== confirmPassword) {
            this.showError(this.confirmPasswordError, 'Passwords do not match');
            return false;
        }
        
        this.clearError(this.newPasswordError);
        this.clearError(this.confirmPasswordError);
        return true;
    }
    
    isStrongPassword(password) {
        const result = validatePassword(password);
        return {
            isValid: result.isValid,
            feedback: result.message.split('\n')
        };
    }
    
    checkPasswordStrength() {
        const password = this.newPasswordInput.value;
        const strengthMeter = this.passwordStrength;
        
        if (!password) {
            strengthMeter.innerHTML = '';
            strengthMeter.className = 'password-strength';
            return;
        }
        
        const { isValid, feedback } = this.isStrongPassword(password);
        
        // Update strength meter with validation feedback
        strengthMeter.innerHTML = feedback.join('<br>');
        
        // Calculate strength based on feedback
        const score = feedback.filter(item => item.startsWith('✓')).length;
        const totalChecks = feedback.length;
        const strengthPercentage = (score / totalChecks) * 100;
        
        // Update strength class
        if (strengthPercentage < 40) {
            strengthMeter.className = 'password-strength weak';
        } else if (strengthPercentage < 80) {
            strengthMeter.className = 'password-strength medium';
        } else {
            strengthMeter.className = 'password-strength strong';
        }
    }
    
    togglePasswordVisibility(button) {
        const input = button.previousElementSibling;
        const type = input.type === 'password' ? 'text' : 'password';
        input.type = type;
        button.innerHTML = type === 'password' ? '<i class="fas fa-eye"></i>' : '<i class="fas fa-eye-slash"></i>';
    }
    
    showStep(step) {
        // Hide all steps
        this.step1.style.display = 'none';
        this.step2.style.display = 'none';
        this.step3.style.display = 'none';
        
        // Show selected step
        switch (step) {
            case 1:
                this.step1.style.display = 'block';
                break;
            case 2:
                this.step2.style.display = 'block';
                break;
            case 3:
                this.step3.style.display = 'block';
                break;
        }
    }
    
    showError(element, message) {
        element.textContent = message;
        element.style.display = 'block';
    }
    
    clearError(element) {
        element.textContent = '';
        element.style.display = 'none';
    }
}

// Initialize the component when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new PasswordReset();
}); 