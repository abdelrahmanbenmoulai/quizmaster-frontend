// Import API_CONFIG from config.js
import API_CONFIG from '../config.js';
import notifications from '../utils/notifications.js';

// EmailJS configuration
const EMAILJS_CONFIG = {
    serviceId: 'service_a2ej7l2',
    templateId: 'template_qrunluc',
    userId: 'hN40D-HZvokoFebTV'
};

// Initialize EmailJS
emailjs.init(EMAILJS_CONFIG.userId);

// DOM Elements
const verificationForm = document.getElementById('verificationForm');
const codeInput = document.getElementById('verificationCode');
const resendButton = document.getElementById('resendCode');
const countdownElement = document.getElementById('countdown');
const errorMessage = document.getElementById('verification-error');

// Get email from URL parameters
const urlParams = new URLSearchParams(window.location.search);
const email = urlParams.get('email');

if (!email) {
    window.location.href = 'login.html';
}

// Initialize countdown
let countdown = 300; // 5 minutes in seconds
let countdownInterval;

function startCountdown() {
    countdown = 300;
    updateCountdown();
    
    if (countdownInterval) {
        clearInterval(countdownInterval);
    }
    
    countdownInterval = setInterval(() => {
        countdown--;
        updateCountdown();
        
        if (countdown <= 0) {
            clearInterval(countdownInterval);
            resendButton.disabled = false;
        }
    }, 1000);
}

function updateCountdown() {
    const minutes = Math.floor(countdown / 60);
    const seconds = countdown % 60;
    countdownElement.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// Start initial countdown
startCountdown();

// Handle form submission
verificationForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = codeInput.value.trim();
    
    if (!code) {
        showError('Please enter the verification code');
        return;
    }

    const submitButton = verificationForm.querySelector('button[type="submit"]');
    const originalButtonText = submitButton.innerHTML;
    
    try {
        submitButton.disabled = true;
        submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verifying...';

        console.log('Sending verification request for email:', email, 'with code:', code);
        
        const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.AUTH.VERIFY}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                email: email,
                code: code,
                action: 'verify'
            })
        });

        console.log('Response status:', response.status);
        const data = await response.json();
        console.log('Response data:', data);

        if (!response.ok) {
            throw new Error(data.error || `HTTP error! status: ${response.status}`);
        }

        if (data.error) {
            throw new Error(data.error);
        }

        if (data.success) {
            notifications.success('Email verified successfully! Redirecting...');
            
            // Get user data from localStorage
            const userData = JSON.parse(localStorage.getItem('userData'));
            console.log('User data from localStorage:', userData);
            
            // Redirect based on role after a short delay
            setTimeout(() => {
                if (userData && userData.role) {
                    if (userData.role === 'teacher') {
                        window.location.href = 'teacher-dashboard.html';
                    } else if (userData.role === 'student') {
                        window.location.href = 'student-dashboard.html';
                    } else {
                        window.location.href = 'login.html?verified=true';
                    }
                } else {
                    window.location.href = 'login.html?verified=true';
                }
            }, 2000);
        }
    } catch (error) {
        console.error('Error during verification:', error);
        notifications.error(error.message);
        submitButton.disabled = false;
        submitButton.innerHTML = originalButtonText;
    }
});

// Handle resend code
resendButton.addEventListener('click', async () => {
    try {
        resendButton.disabled = true;
        resendButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';

        console.log('Sending resend request for email:', email);
        
        const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.AUTH.VERIFY}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                email: email,
                action: 'resend'
            })
        });

        console.log('Resend response status:', response.status);
        const data = await response.json();
        console.log('Resend response data:', data);

        if (!response.ok) {
            throw new Error(data.error || `HTTP error! status: ${response.status}`);
        }

        if (!data.success) {
            throw new Error(data.error || 'Failed to generate verification code');
        }

        // Send verification email using EmailJS
        console.log('Sending email via EmailJS');
        await emailjs.send(
            EMAILJS_CONFIG.serviceId,
            EMAILJS_CONFIG.templateId,
            {
                to_email: email,
                from_name: 'QuizMaster',
                verification_code: data.data.code,
                expiry_time: new Date(data.data.expiry).toLocaleString()
            },
            EMAILJS_CONFIG.userId
        );
        console.log('Email sent successfully');

        // Reset countdown and button state
        startCountdown();
        notifications.success('New verification code sent successfully');
        resendButton.innerHTML = 'Resend Code';
    } catch (error) {
        console.error('Error during resend:', error);
        notifications.error(error.message || 'Failed to resend verification code');
        resendButton.disabled = false;
        resendButton.innerHTML = 'Resend Code';
    }
});

function showError(message) {
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
    
    setTimeout(() => {
        errorMessage.style.display = 'none';
    }, 5000);
} 