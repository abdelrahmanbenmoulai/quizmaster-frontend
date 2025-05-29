import notifications from './utils/notifications.js';
import API_CONFIG from './config.js';

// EmailJS configuration
const EMAILJS_CONFIG = {
    serviceId: 'service_a2ej7l2',
    templateId: 'template_qrunluc',
    userId: 'hN40D-HZvokoFebTV'
};

console.log('API_CONFIG loaded:', API_CONFIG);

document.addEventListener('DOMContentLoaded', function() {
    // Get form elements
    const signupForm = document.getElementById('signup-form');
    const fullnameInput = document.getElementById('fullname');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const confirmPasswordInput = document.getElementById('confirm-password');
    const termsCheckbox = document.getElementById('terms');
    
    // Error elements
    const fullnameError = document.getElementById('fullname-error');
    const emailError = document.getElementById('email-error');
    const passwordError = document.getElementById('password-error');
    const confirmPasswordError = document.getElementById('confirm-password-error');
    const termsError = document.getElementById('terms-error');
    const passwordStrength = document.querySelector('.password-strength');
    
    // Password toggle elements
    const togglePassword = document.getElementById('toggle-password');
    const toggleIcon = togglePassword ? togglePassword.querySelector('i') : null;
    
    // Profile image elements
    const profileInput = document.getElementById('profile-image');
    const imagePreview = document.getElementById('image-preview');
    const defaultAvatar = document.getElementById('default-avatar');
    const removeButton = document.getElementById('remove-image');
    const imageError = document.getElementById('image-error');
    const previewContainer = document.getElementById('preview-container');

    let isDragging = false;
    let currentX;
    let currentY;
    let initialX;
    let initialY;
    let xOffset = 0;
    let yOffset = 0;
    let activeItem = null;
    let scale = 1;

    // Toggle password visibility
    if (togglePassword && toggleIcon) {
        togglePassword.addEventListener('click', function() {
            const type = passwordInput.type === 'password' ? 'text' : 'password';
            passwordInput.type = type;
            
            // Update icon
            toggleIcon.classList.toggle('fa-eye');
            toggleIcon.classList.toggle('fa-eye-slash');
        });
    }

    // Handle image upload
    if (profileInput) {
        profileInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (file) {
                // Validate file size (5MB limit)
                if (file.size > 5 * 1024 * 1024) {
                    notifications.error('Image size must be less than 5MB');
                    profileInput.value = '';
                    return;
                }

                // Validate file type
                const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
                if (!validTypes.includes(file.type)) {
                    notifications.error('Please upload a valid image file (JPEG, PNG, GIF, or WebP)');
                    profileInput.value = '';
                    return;
                }

                const reader = new FileReader();
                reader.onload = function(e) {
                    // Create a new image to check dimensions
                    const img = new Image();
                    img.onload = function() {
                        // Check image dimensions
                        if (img.width < 100 || img.height < 100) {
                            notifications.error('Image must be at least 100x100 pixels');
                            profileInput.value = '';
                            return;
                        }

                        // Update preview
                        imagePreview.src = e.target.result;
                        imagePreview.style.display = 'block';
                        defaultAvatar.style.display = 'none';
                        removeButton.disabled = false;
                        
                        // Reset position
                        xOffset = 0;
                        yOffset = 0;
                        scale = 1;
                        imagePreview.style.transform = 'translate(-50%, -50%) scale(1)';
                        
                        console.log('Image loaded, position reset:', { x: xOffset, y: yOffset, scale: scale });
                    };
                    img.src = e.target.result;
                };
                reader.onerror = function() {
                    notifications.error('Error reading file');
                    profileInput.value = '';
                };
                reader.readAsDataURL(file);
            }
        });
    }

    // Handle image removal
    if (removeButton) {
        removeButton.addEventListener('click', function() {
            imagePreview.src = '';
            imagePreview.style.display = 'none';
            defaultAvatar.style.display = 'block';
            profileInput.value = '';
            removeButton.disabled = true;
            
            // Reset position
            xOffset = 0;
            yOffset = 0;
            imagePreview.style.transform = 'translate(-50%, -50%)';
        });
    }

    // Update dragging functionality
    function dragStart(e) {
        if (e.target === imagePreview && imagePreview.style.display !== 'none') {
            if (e.type === "touchstart") {
                initialX = e.touches[0].clientX - xOffset;
                initialY = e.touches[0].clientY - yOffset;
            } else {
                initialX = e.clientX - xOffset;
                initialY = e.clientY - yOffset;
            }
            isDragging = true;
            activeItem = e.target;
            
            // Log the start position
            console.log('Drag start:', { x: xOffset, y: yOffset });
        }
    }

    function dragEnd(e) {
        if (!isDragging) return;
        
        initialX = currentX;
        initialY = currentY;
        isDragging = false;
        activeItem = null;

        // Ensure the image stays within bounds after dragging
        const maxOffset = 50;
        xOffset = Math.max(Math.min(xOffset, maxOffset), -maxOffset);
        yOffset = Math.max(Math.min(yOffset, maxOffset), -maxOffset);
        
        if (imagePreview.style.display !== 'none') {
            imagePreview.style.transform = `translate(calc(-50% + ${xOffset}px), calc(-50% + ${yOffset}px)) scale(${scale || 1})`;
        }

        // Log the final position
        console.log('Drag end:', { x: xOffset, y: yOffset });
    }

    function drag(e) {
        if (isDragging && activeItem === imagePreview) {
            e.preventDefault();

            if (e.type === "touchmove") {
                currentX = e.touches[0].clientX - initialX;
                currentY = e.touches[0].clientY - initialY;
            } else {
                currentX = e.clientX - initialX;
                currentY = e.clientY - initialY;
            }

            // Update the offset values
            xOffset = currentX;
            yOffset = currentY;

            // Limit the dragging range
            const maxOffset = 50;
            xOffset = Math.max(Math.min(xOffset, maxOffset), -maxOffset);
            yOffset = Math.max(Math.min(yOffset, maxOffset), -maxOffset);

            if (imagePreview.style.display !== 'none') {
                imagePreview.style.transform = `translate(calc(-50% + ${xOffset}px), calc(-50% + ${yOffset}px)) scale(${scale || 1})`;
            }

            // Log the current position during drag
            console.log('Dragging:', { x: xOffset, y: yOffset });
        }
    }

    // Add event listeners for dragging
    if (previewContainer) {
        previewContainer.addEventListener("touchstart", dragStart, { passive: true });
        previewContainer.addEventListener("touchend", dragEnd, false);
        previewContainer.addEventListener("touchmove", drag, { passive: false });
        previewContainer.addEventListener("mousedown", dragStart, false);
        previewContainer.addEventListener("mouseup", dragEnd, false);
        previewContainer.addEventListener("mouseleave", dragEnd, false);
        previewContainer.addEventListener("mousemove", drag, false);
    }

    // Update the reset position button functionality
    if (previewContainer) {
        const resetButton = document.createElement('button');
        resetButton.type = 'button';
        resetButton.className = 'reset-position-button';
        resetButton.innerHTML = '<i class="fas fa-crosshairs"></i> Center';
        resetButton.onclick = function() {
            xOffset = 0;
            yOffset = 0;
            scale = 1;
            if (imagePreview.style.display !== 'none') {
                imagePreview.style.transform = 'translate(-50%, -50%) scale(1)';
            }
            console.log('Image position after reset:', { x: xOffset, y: yOffset, scale: scale });
        };
        
        // Add the reset button to the upload controls
        const uploadControlsRow = document.querySelector('.upload-controls-row');
        if (uploadControlsRow) {
            uploadControlsRow.appendChild(resetButton);
        }
    }

    // Prevent default drag behaviors
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        previewContainer.addEventListener(eventName, preventDefaults, { passive: false });
        document.body.addEventListener(eventName, preventDefaults, { passive: false });
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    // Handle drag and drop
    previewContainer.addEventListener('drop', handleDrop, { passive: false });
    previewContainer.addEventListener('dragenter', highlight, { passive: true });
    previewContainer.addEventListener('dragleave', unhighlight, { passive: true });

    function highlight(e) {
        previewContainer.classList.add('drag-over');
    }

    function unhighlight(e) {
        previewContainer.classList.remove('drag-over');
    }

    function handleDrop(e) {
        const dt = e.dataTransfer;
        const file = dt.files[0];
        
        unhighlight(e);
        
        if (file) {
            profileInput.files = dt.files;
            profileInput.dispatchEvent(new Event('change'));
        }
    }

    // Email validation
    function validateEmail(email) {
        // University email validation - must follow f.lastname.inf@lagh-univ.dz format
        const regex = /^[a-z]\.[a-z]+\.inf@lagh-univ\.dz$/i;
        return regex.test(email);
    }

    // Clear error messages
    function clearErrors() {
        [fullnameError, emailError, passwordError, confirmPasswordError, termsError].forEach(element => {
            if (element) {
                element.textContent = '';
                element.setAttribute('aria-hidden', 'true');
            }
        });
    }

    // Show error message
    function showError(element, message) {
        if (element && message) {
            if (message.startsWith('✓')) {
                element.textContent = '';
                element.setAttribute('aria-hidden', 'true');
            } else {
                element.textContent = message;
                element.setAttribute('aria-hidden', 'false');
                element.setAttribute('role', 'alert');
            }
        }
    }

    // Check password strength
    function checkPasswordStrength(password) {
        let strength = 0;
        let feedback = [];

        // Check minimum length
        if (password.length < 8) {
            feedback.push('❌ At least 8 characters');
        } else {
            feedback.push('✓ At least 8 characters');
            strength++;
        }

        // Check uppercase
        if (!/[A-Z]/.test(password)) {
            feedback.push('❌ One uppercase letter');
        } else {
            feedback.push('✓ One uppercase letter');
            strength++;
        }

        // Check lowercase
        if (!/[a-z]/.test(password)) {
            feedback.push('❌ One lowercase letter');
        } else {
            feedback.push('✓ One lowercase letter');
            strength++;
        }

        // Check numbers
        if (!/[0-9]/.test(password)) {
            feedback.push('❌ One number');
        } else {
            feedback.push('✓ One number');
            strength++;
        }

        // Check special characters
        if (!/[^A-Za-z0-9]/.test(password)) {
            feedback.push('❌ One special character');
        } else {
            feedback.push('✓ One special character');
            strength++;
        }

        return {
            score: strength,
            feedback: feedback.join('\n')
        };
    }

    // Update password strength indicator in real-time
    passwordInput.addEventListener('input', function() {
        const { score, feedback } = checkPasswordStrength(this.value);
        if (passwordStrength) {
            passwordStrength.innerHTML = feedback;
            passwordStrength.className = 'password-strength strength-' + score;
        }
    });

    // Validate form
    function validateForm() {
        let valid = true;
        clearErrors();

        // Validate full name
        const fullname = fullnameInput.value.trim();
        if (!fullname) {
            showError(fullnameError, '❌ Full name is required');
            fullnameInput.setAttribute('aria-invalid', 'true');
            valid = false;
        } else if (!/^[A-Za-z]+\s+[A-Za-z]+$/.test(fullname)) {
            showError(fullnameError, '❌ Please enter a valid first and last name (letters only)');
            fullnameInput.setAttribute('aria-invalid', 'true');
            valid = false;
        } else {
            fullnameInput.setAttribute('aria-invalid', 'false');
            showError(fullnameError, '✓ Valid name format');
        }

        // Validate email
        const email = emailInput.value.trim();
        if (!email) {
            showError(emailError, '❌ Email is required');
            emailInput.setAttribute('aria-invalid', 'true');
            valid = false;
        } else if (!validateEmail(email)) {
            showError(emailError, '❌ Please use the university email format: f.lastname.inf@lagh-univ.dz');
            emailInput.setAttribute('aria-invalid', 'true');
            valid = false;
        } else {
            emailInput.setAttribute('aria-invalid', 'false');
            showError(emailError, '✓ Valid university email format');
        }

        // Validate password
        const { score, feedback } = checkPasswordStrength(passwordInput.value);
        if (!passwordInput.value) {
            showError(passwordError, '❌ Password is required');
            passwordInput.setAttribute('aria-invalid', 'true');
            valid = false;
        } else if (score < 5) {
            showError(passwordError, feedback);
            passwordInput.setAttribute('aria-invalid', 'true');
            valid = false;
        } else {
            passwordInput.setAttribute('aria-invalid', 'false');
        }

        // Validate password confirmation
        if (!confirmPasswordInput.value) {
            showError(confirmPasswordError, '❌ Please confirm your password');
            confirmPasswordInput.setAttribute('aria-invalid', 'true');
            valid = false;
        } else if (confirmPasswordInput.value !== passwordInput.value) {
            showError(confirmPasswordError, '❌ Passwords do not match');
            confirmPasswordInput.setAttribute('aria-invalid', 'true');
            valid = false;
        } else {
            confirmPasswordInput.setAttribute('aria-invalid', 'false');
            showError(confirmPasswordError, '✓ Passwords match');
        }

        // Validate terms
        if (!termsCheckbox.checked) {
            showError(termsError, '❌ You must agree to the terms');
            termsCheckbox.setAttribute('aria-invalid', 'true');
            valid = false;
        } else {
            termsCheckbox.setAttribute('aria-invalid', 'false');
        }

        return valid;
    }

    // Update email validation
    emailInput.addEventListener('input', function() {
        const email = this.value.trim();
        if (email && !validateEmail(email)) {
            showError(emailError, '❌ Please use the university email format: f.lastname.inf@lagh-univ.dz');
            this.setAttribute('aria-invalid', 'true');
        } else {
            emailError.textContent = '';
            this.setAttribute('aria-invalid', email ? 'false' : 'true');
        }
    });

    // Update name validation
    fullnameInput.addEventListener('input', function() {
        const name = this.value.trim();
        if (name && !/^[A-Za-z]+\s+[A-Za-z]+$/.test(name)) {
            showError(fullnameError, '❌ Please enter a valid first and last name (letters only)');
            this.setAttribute('aria-invalid', 'true');
        } else {
            fullnameError.textContent = '';
            this.setAttribute('aria-invalid', name ? 'false' : 'true');
        }
    });

    // Check if email exists
    async function checkEmailExists(email) {
        try {
            const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.AUTH.VERIFY}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: `email=${encodeURIComponent(email)}`
            });

            if (!response.ok) {
                throw new Error('Failed to check email existence');
            }

            const data = await response.json();
            return data.exists;
        } catch (error) {
            console.error('Error checking email:', error);
            return false;
        }
    }

    // Form submission
    signupForm.addEventListener('submit', async function(e) {
        e.preventDefault();

        if (!validateForm()) {
            notifications.error('Please correct the errors in the form');
            const firstInvalid = signupForm.querySelector('[aria-invalid="true"]');
            if (firstInvalid) firstInvalid.focus();
            return;
        }

        const submitButton = this.querySelector('button[type="submit"]');
        const originalButtonText = submitButton.innerHTML;
        
        try {
            submitButton.disabled = true;
            submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating account...';

            // Check if email already exists
            const emailExists = await checkEmailExists(emailInput.value.trim());
            if (emailExists) {
                notifications.error('This email is already registered. Please use a different email or login.');
                submitButton.disabled = false;
                submitButton.innerHTML = originalButtonText;
                emailInput.focus();
                return;
            }

            // Create FormData for multipart submission
            const formData = new FormData();
            formData.append('fullname', fullnameInput.value.trim());
            formData.append('email', emailInput.value.trim());
            formData.append('password', passwordInput.value);
            formData.append('role', document.querySelector('input[name="role"]:checked').value);
            
            // Add image position data with proper type conversion and validation
            const imagePositionX = parseFloat(xOffset) || 0;
            const imagePositionY = parseFloat(yOffset) || 0;
            const imageScale = parseFloat(scale) || 1;
            
            // Ensure values are within valid range (-50 to 50)
            const clampedX = Math.max(Math.min(imagePositionX, 50), -50);
            const clampedY = Math.max(Math.min(imagePositionY, 50), -50);
            
            // Log the values before sending
            console.log('Image position values before sending:', {
                x: clampedX,
                y: clampedY,
                scale: imageScale,
                originalX: xOffset,
                originalY: yOffset,
                originalScale: scale
            });
            
            // Append the values as numbers, not strings
            formData.append('image_position_x', clampedX);
            formData.append('image_position_y', clampedY);
            formData.append('image_scale', imageScale);

            // Add profile image if selected
            if (profileInput.files.length > 0) {
                formData.append('profile_image', profileInput.files[0]);
            }

            // Log the form data for debugging
            console.log('Submitting form data:', {
                fullname: fullnameInput.value.trim(),
                email: emailInput.value.trim(),
                role: document.querySelector('input[name="role"]:checked').value,
                image_position_x: clampedX,
                image_position_y: clampedY,
                image_scale: imageScale,
                has_image: profileInput.files.length > 0
            });

            // Register user
            const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.AUTH.REGISTER}`, {
                method: 'POST',
                body: formData
            });

            const responseText = await response.text();
            console.log('Register response:', responseText);
            
            let data;
            try {
                data = JSON.parse(responseText);
            } catch (parseError) {
                console.error('JSON parse error:', parseError);
                throw new Error(`Failed to parse response: ${responseText.substring(0, 100)}...`);
            }

            if (response.ok && data.token) {
                // Store auth data
                localStorage.setItem('userToken', data.token);
                localStorage.setItem('userData', JSON.stringify(data.user));

                // Debug: Log the response data
                console.log('Registration response data:', data);
                console.log('Image position values in response:', {
                    x: data.user.image_position_x,
                    y: data.user.image_position_y,
                    scale: data.user.image_scale
                });

                // Send verification email using EmailJS
                await sendVerificationEmail(data.user.email, data.user.name);

                // Show success message
                notifications.success('Account created successfully! Please check your email to verify your account.');

                // Redirect to verification page
                window.location.href = `verify.html?email=${encodeURIComponent(data.user.email)}`;
            } else {
                throw new Error(data.error || 'Failed to create account');
            }
        } catch (error) {
            console.error('Registration error:', error);
            notifications.error(error.message || 'Failed to create account. Please try again.');
            
            submitButton.disabled = false;
            submitButton.innerHTML = originalButtonText;
        }
    });

    // Function to send verification email using EmailJS
    async function sendVerificationEmail(email, name) {
        try {
            // Get verification code from backend
            const verifyResponse = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.AUTH.VERIFY}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    email: email,
                    action: 'resend'
                })
            });

            if (!verifyResponse.ok) {
                const errorData = await verifyResponse.json();
                throw new Error(errorData.error || 'Failed to generate verification code');
            }

            const verifyData = await verifyResponse.json();
            
            if (!verifyData.success || !verifyData.data || !verifyData.data.code) {
                console.error('Invalid verification response:', verifyData);
                throw new Error('Failed to generate verification code');
            }
            
            // Send email using EmailJS
            const templateParams = {
                to_email: email,
                to_name: name,
                verification_code: verifyData.data.code,
                from_name: 'QuizMaster Team'
            };

            // Load EmailJS script if not already loaded
            if (!window.emailjs) {
                await loadScript('https://cdn.jsdelivr.net/npm/@emailjs/browser@3/dist/email.min.js');
                window.emailjs.init(EMAILJS_CONFIG.userId);
            }

            // Send email
            await window.emailjs.send(
                EMAILJS_CONFIG.serviceId,
                'template_qrunluc',
                templateParams
            );

            console.log('Verification email sent successfully');
            
            // Store verification data in localStorage
            localStorage.setItem('verificationData', JSON.stringify({
                email: email,
                expiry: verifyData.data.expiry
            }));
        } catch (error) {
            console.error('Error sending verification email:', error);
            throw new Error('Failed to send verification email. Please try again later.');
        }
    }

    // Helper function to load external scripts
    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    // Update the image preview container HTML
    if (previewContainer) {
        // Add zoom controls
        const zoomControls = document.createElement('div');
        zoomControls.className = 'zoom-controls';
        zoomControls.innerHTML = `
            <button type="button" class="zoom-in" title="Zoom In">
                <i class="fas fa-search-plus"></i>
            </button>
            <button type="button" class="zoom-out" title="Zoom Out">
                <i class="fas fa-search-minus"></i>
            </button>
        `;
        previewContainer.appendChild(zoomControls);

        // Add zoom functionality
        const SCALE_STEP = 0.1;
        const MIN_SCALE = 0.5;
        const MAX_SCALE = 2;

        document.querySelector('.zoom-in').addEventListener('click', () => {
            if (scale < MAX_SCALE) {
                scale += SCALE_STEP;
                updateImageTransform();
            }
        });

        document.querySelector('.zoom-out').addEventListener('click', () => {
            if (scale > MIN_SCALE) {
                scale -= SCALE_STEP;
                updateImageTransform();
            }
        });

        function updateImageTransform() {
            if (imagePreview.style.display !== 'none') {
                imagePreview.style.transform = `translate(calc(-50% + ${xOffset}px), calc(-50% + ${yOffset}px)) scale(${scale})`;
            }
        }
    }
});