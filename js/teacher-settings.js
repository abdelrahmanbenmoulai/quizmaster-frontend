import API_CONFIG from './config.js';
import auth from './utils/auth.js';
import roleGuard from './utils/role-guard.js';
import notifications from './utils/notifications.js';
import { validateUsername, validatePassword } from './utils/validation.js';

class TeacherSettings {
  constructor() {
    // Add debounce timer for saving position
    this.savePositionTimer = null;
    this.isProcessingAction = false;
    
    // Initialize with basic setup
    this.init();
    
    // Set up event listeners after a slight delay
    setTimeout(() => {
      this.setupEventListeners();
      this.checkRoleAndLoadSettings();
    }, 10);
  }

  init() {
    // Core elements
    this.sidebar = document.querySelector(".sidebar");
    this.menuToggle = document.querySelector(".menu-toggle");
    this.logoutButton = document.querySelector(".logout-btn");
    
    // Profile elements
    this.username = document.getElementById("username");
    this.profilePicture = document.getElementById("profilePicture");
    this.pictureInput = document.getElementById("pictureInput");
    this.pictureContainer = document.getElementById("pictureContainer");
    this.changePictureBtn = document.querySelector(".change-picture-btn");
    
    // Password toggle buttons
    this.togglePasswordButtons = document.querySelectorAll(".toggle-password");
    
    // Theme and language
    this.darkModeToggle = document.getElementById("darkMode");
    this.languageSelect = document.getElementById("language");
    
    // Image position and scale state
    this.imageState = {
      isDragging: false,
      startX: 0,
      startY: 0,
      positionX: 0,
      positionY: 0,
      scale: 1,
      startPositionX: 0,
      startPositionY: 0
    };
    
    // Set initial state - not in positioning mode
    this.isPositioningMode = false;
    
    // Apply stored styles before image loads to prevent flickering
    this.applyInitialImageStyles();
    
    // Add error handling for avatar
    if (this.profilePicture) {
      this.profilePicture.onerror = (e) => {
        console.error('Profile picture failed to load from path:', this.profilePicture.src);
        console.error('Error event:', e);
        // Replace with placeholder image
        this.profilePicture.src = '/quizmaster/frontend/images/profile-placeholder.svg';
        
        // Make sure to reveal image even if using placeholder
        setTimeout(() => {
          if (this.pictureContainer) {
            this.pictureContainer.classList.add('loaded');
          }
        }, 100);
      };
      
      // Add loaded handler for the image
      this.profilePicture.onload = () => {
        console.log('Profile picture loaded successfully');
        
        // Reveal the image with smooth transition
        setTimeout(() => {
          if (this.pictureContainer) {
            this.pictureContainer.classList.add('loaded');
          }
        }, 100);
      };
    }
    
    // Check if there's a stored avatar in localStorage
    const storedAvatar = localStorage.getItem('teacherAvatar');
    
    if (storedAvatar && this.profilePicture) {
      this.processAndSetAvatar(storedAvatar);
      
      // Load stored position values if available
      const posX = localStorage.getItem('teacherImagePositionX');
      const posY = localStorage.getItem('teacherImagePositionY');
      const scale = localStorage.getItem('teacherImageScale');
      
      if (posX !== null && posY !== null && scale !== null) {
        // Set initial state
        this.imageState.positionX = parseFloat(posX);
        this.imageState.positionY = parseFloat(posY);
        this.imageState.scale = parseFloat(scale);
        
        // Apply stored position immediately
        this.applyImageStyles();
      }
    }
  }

  // Apply initial image styles during page load
  applyInitialImageStyles() {
    if (!this.profilePicture || !this.pictureContainer) return;
    
    try {
      // Get stored position values
      const posX = localStorage.getItem('teacherImagePositionX');
      const posY = localStorage.getItem('teacherImagePositionY');
      const scale = localStorage.getItem('teacherImageScale');
      
      if (posX !== null && posY !== null && scale !== null) {
        // Early styling application - will be visible before full JS loads
        this.profilePicture.style.objectPosition = `${posX}px ${posY}px`;
        this.profilePicture.style.transform = `scale(${scale}) translateZ(0)`;
        this.profilePicture.style.imageRendering = 'high-quality';
        this.profilePicture.style.backfaceVisibility = 'hidden';
        
        console.log('Applied initial image styles:', { posX, posY, scale });
      }
    } catch (e) {
      console.error('Error applying initial image styles:', e);
    }
  }

  // Check role and load settings if authorized
  async checkRoleAndLoadSettings() {
    try {
      // Use role guard to check if user has teacher role
      const accessGranted = await roleGuard.initialize('teacher');
      
      if (!accessGranted) {
        return;
      }
      
      // If role check passed, load settings
      await this.loadSettings();
      
      // Initialize image positioning controls
      this.initImageControls();
    } catch (error) {
      console.error('Teacher Settings - Role check error:', error);
      this.showError("Access error");
    }
  }

  // Process and set avatar path consistently across the application
  processAndSetAvatar(avatarPath) {
    try {
      if (!this.profilePicture) return;

      let processedPath;

      // Handle missing or default avatar
      if (!avatarPath || avatarPath === 'default.png') {
        processedPath = '/quizmaster/frontend/images/profile-placeholder.svg';
      }
      // Handle placeholder image
      else if (avatarPath.includes('profile-placeholder.svg')) {
        processedPath = '/quizmaster/frontend/images/profile-placeholder.svg';
      }
      // Handle absolute URLs
      else if (avatarPath.startsWith('http://') || avatarPath.startsWith('https://')) {
        processedPath = avatarPath;
      }
      // Handle /quizmaster/uploads paths - ensure they point to backend
      else if (avatarPath.startsWith('/quizmaster/uploads/')) {
        processedPath = avatarPath.replace('/quizmaster/uploads/', '/quizmaster/backend/uploads/');
      }
      // Handle backend paths
      else if (avatarPath.startsWith('backend/')) {
        processedPath = '/quizmaster/' + avatarPath;
      }
      // Handle uploads paths - ensure they point to backend/uploads
      else if (avatarPath.startsWith('uploads/')) {
        processedPath = '/quizmaster/backend/' + avatarPath;
      }
      // Handle absolute paths
      else if (avatarPath.startsWith('/')) {
        if (!avatarPath.startsWith('/quizmaster/')) {
          processedPath = '/quizmaster' + avatarPath;
        } else {
          processedPath = avatarPath;
        }
      }
      // Handle other relative paths
      else {
        processedPath = '/quizmaster/frontend/images/' + avatarPath;
      }
      
      // Log the path transformation for debugging
      console.log('Avatar path transformed:', { original: avatarPath, processed: processedPath });
      
      // Set initial styles before loading the image
      this.profilePicture.style.cssText = `
        object-fit: cover;
        transform-origin: center center;
        will-change: transform;
        image-rendering: high-quality;
        backface-visibility: hidden;
        opacity: 1;
        transform: scale(1) translateZ(0);
      `;
      
      // Set the avatar path
      this.profilePicture.src = processedPath;
      
      // Store in localStorage for future use - but don't store placeholders
      if (!processedPath.includes('profile-placeholder.svg')) {
        localStorage.setItem('teacherAvatar', processedPath);
      }
      
      // Add onload event to ensure image loaded properly
      this.profilePicture.onload = () => {
        console.log('Profile picture loaded successfully');
        
        // Add loaded class to container after image loads
        if (this.pictureContainer) {
          this.pictureContainer.classList.add('loaded');
        }
      };
      
      // Add onerror event for fallback
      this.profilePicture.onerror = (e) => {
        console.error('Profile picture failed to load:', e);
        this.profilePicture.src = '/quizmaster/frontend/images/profile-placeholder.svg';
        
        // Make sure to reveal image even if using placeholder
        if (this.pictureContainer) {
          this.pictureContainer.classList.add('loaded');
        }
      };
    } catch (e) {
      console.error('Error processing avatar path:', e);
      this.profilePicture.src = '/quizmaster/frontend/images/profile-placeholder.svg';
      
      // Make sure to reveal image even if error occurs
      if (this.pictureContainer) {
        this.pictureContainer.classList.add('loaded');
      }
    }
  }

  setupEventListeners() {
    // Mobile menu toggle
    if (this.menuToggle) {
      this.menuToggle.addEventListener("click", () => {
        this.sidebar.classList.toggle("active");
      });
    }

    // Close sidebar when clicking outside
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".sidebar") && !e.target.closest(".menu-toggle")) {
        this.sidebar.classList.remove("active");
      }
    });
    
    // Picture upload
    if (this.pictureInput) {
      this.pictureInput.addEventListener("change", (e) => this.handleAvatarUpload(e));
    }
    
    // Change picture button - make sure it triggers the file input
    if (this.changePictureBtn) {
      // Remove any existing listeners to prevent duplicates
      this.changePictureBtn.removeEventListener("click", this._changePictureBtnHandler);
      
      // Create a handler function we can reference for removal
      this._changePictureBtnHandler = (e) => {
        e.preventDefault();
        e.stopPropagation(); // Stop event propagation to prevent multiple triggers
        
        if (this.isProcessingAction) {
          console.log("Action already in progress - ignoring click");
          return;
        }
        
        console.log("Change picture button clicked - opening file dialog");
        if (this.pictureInput) {
          this.pictureInput.click();
        }
      };
      
      // Add the event listener
      this.changePictureBtn.addEventListener("click", this._changePictureBtnHandler);
    }
    
    // Username validation
    const usernameInput = document.getElementById("username");
    if (usernameInput) {
      usernameInput.addEventListener('input', (e) => {
        const username = e.target.value.trim();
        const userData = JSON.parse(localStorage.getItem('userData') || '{}');
        
        // Update or create feedback element
        let feedbackEl = document.getElementById('username-feedback');
        if (!feedbackEl) {
          feedbackEl = document.createElement('div');
          feedbackEl.id = 'username-feedback';
          feedbackEl.className = 'username-feedback';
          usernameInput.parentElement.appendChild(feedbackEl);
        }
        
        // If empty or unchanged, show current username
        if (!username || username === userData.name) {
          feedbackEl.innerHTML = 'Current username: ' + userData.name;
          feedbackEl.className = 'username-feedback valid';
          return;
        }
        
        // Validate new username
        const validation = validateUsername(username);
        feedbackEl.innerHTML = validation.message;
        feedbackEl.className = 'username-feedback ' + (validation.isValid ? 'valid' : 'invalid');
      });
      
      // Trigger initial validation
      usernameInput.dispatchEvent(new Event('input'));
    }

    // Password validation
    const newPasswordInput = document.getElementById("newPassword");
    if (newPasswordInput) {
      newPasswordInput.addEventListener('input', (e) => {
        const password = e.target.value;
        const validation = validatePassword(password);
        
        // Update or create feedback element
        let feedbackEl = document.getElementById('password-feedback');
        if (!feedbackEl) {
          feedbackEl = document.createElement('div');
          feedbackEl.id = 'password-feedback';
          feedbackEl.className = 'password-feedback';
          // Append after the password-input div instead of inside it
          newPasswordInput.closest('.form-group').appendChild(feedbackEl);
        }
        
        feedbackEl.innerHTML = validation.message;
        feedbackEl.className = 'password-feedback ' + (validation.isValid ? 'valid' : 'invalid');
      });
    }
    
    // Reset picture button
    const resetPictureBtn = document.getElementById('resetPictureBtn');
    if (resetPictureBtn) {
      resetPictureBtn.addEventListener("click", (e) => {
        e.preventDefault();
        this.resetProfilePicture();
      });
    }
    
    // Fix cursor style on image and container via JavaScript
    if (this.profilePicture) {
      this.profilePicture.style.cursor = 'default';
      this.profilePicture.style.pointerEvents = 'none';
    }
    if (this.pictureContainer) {
      this.pictureContainer.style.cursor = 'default';
    }
    
    // Password visibility toggles
    if (this.togglePasswordButtons) {
      this.togglePasswordButtons.forEach(button => {
        button.addEventListener("click", (e) => {
          const input = e.target.closest('.password-input').querySelector('input');
          const icon = e.target.closest('.toggle-password').querySelector('i');
          
          if (input.type === "password") {
            input.type = "text";
            icon.classList.remove("fa-eye");
            icon.classList.add("fa-eye-slash");
          } else {
            input.type = "password";
            icon.classList.remove("fa-eye-slash");
            icon.classList.add("fa-eye");
          }
        });
      });
    }
    
    // Theme toggle
    if (this.darkModeToggle) {
      this.darkModeToggle.addEventListener("change", () => this.handleThemeChange());
    }
    
    // Language change
    if (this.languageSelect) {
      this.languageSelect.addEventListener("change", () => this.handleLanguageChange());
    }
    
    // Password form submission
    const passwordForm = document.getElementById('passwordForm');
    if (passwordForm) {
      passwordForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handlePasswordUpdate();
      });
    }
    
    // Profile form submission
    const profileForm = document.getElementById('profileForm');
    if (profileForm) {
      profileForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleProfileUpdate();
      });
    }

    // Add logout handler
    if (this.logoutButton) {
      this.logoutButton.addEventListener("click", () => this.handleLogout());
    }
  }

  async loadSettings() {
    try {
      const token = auth.getToken();
      
      // Clear any old user avatar to prevent conflict with teacher avatar
      if (localStorage.getItem('userAvatar')) {
        localStorage.removeItem('userAvatar');
      }
      
      // First load preferences
      try {
        const preferencesResponse = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.TEACHER.PREFERENCES}`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        if (preferencesResponse.ok) {
          const preferencesData = await preferencesResponse.json();
          
          if (preferencesData.success && preferencesData.preferences) {
            // Update theme preference
            if (this.darkModeToggle && preferencesData.preferences.theme) {
              this.darkModeToggle.checked = preferencesData.preferences.theme === 'dark';
              document.body.classList.toggle('dark-theme', preferencesData.preferences.theme === 'dark');
            }
            
            // Update language preference
            if (this.languageSelect && preferencesData.preferences.language) {
              this.languageSelect.value = preferencesData.preferences.language;
            }
          }
        }
      } catch (err) {
        console.warn('Could not load preferences:', err);
      }
      
      // Then load profile data
      try {
        const profileResponse = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.TEACHER.PROFILE}`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (profileResponse.ok) {
          // Get response text first to check for BOM characters
          const responseText = await profileResponse.text();
          
          // Check if response contains invalid characters at the beginning
          let validJson = responseText;
          const jsonStartIndex = responseText.indexOf('{');
          if (jsonStartIndex > 0) {
            console.log('Detected non-JSON characters at start of response, extracting JSON portion');
            validJson = responseText.substring(jsonStartIndex);
          }
          
          // Parse the JSON
          let profileData;
          try {
            profileData = JSON.parse(validJson);
          } catch (jsonError) {
            console.error('JSON parse error:', jsonError);
            throw new Error('Invalid JSON response from server');
          }
          
          if (profileData.success) {
            // Get user data from the response - handle both formats
            const userData = profileData.data || profileData;
            
            // Update username
            if (this.username && userData.name) {
              this.username.value = userData.name;
            }
            
            // Update profile picture
            if (this.profilePicture && userData.avatar) {
              // Use the consistent avatar processing method
              this.processAndSetAvatar(userData.avatar);
              
              // Get position and scale values from user_profiles data
              const posX = userData.image_position_x !== undefined ? parseFloat(userData.image_position_x) : 0;
              const posY = userData.image_position_y !== undefined ? parseFloat(userData.image_position_y) : 0;
              const scale = userData.image_scale !== undefined ? parseFloat(userData.image_scale) : 1;
              
              console.log('Retrieved image position from API:', { posX, posY, scale });
              
              // Update the image state with these values
              this.imageState.positionX = posX;
              this.imageState.positionY = posY;
              this.imageState.scale = scale;
              
              // Apply styling with a delay to ensure image is loaded
              setTimeout(() => {
                this.applyImageStyles();
                // Add loaded class to container
                if (this.pictureContainer) {
                  this.pictureContainer.classList.add('loaded');
                }
              }, 100);
            }
            
            // Populate hidden username field for password form with email for password managers
            if (userData.email) {
              const hiddenUsernameField = document.getElementById('passwordFormUsername');
              if (hiddenUsernameField) {
                hiddenUsernameField.value = userData.email;
              }
            }
          }
        }
      } catch (err) {
        console.warn('Could not load profile data:', err);
      }
      
      // Apply styles once after a delay to ensure it applies properly
      setTimeout(() => {
        if (this.profilePicture) {
          this.applyImageStyles();
        }
      }, 500);
    } catch (error) {
      console.error('Error loading settings:', error);
      this.showError('Failed to load settings');
    }
  }

  // Initialize image positioning controls
  initImageControls() {
    if (!this.profilePicture) return;
    
    // Add zoom controls
    const zoomControls = document.createElement('div');
    zoomControls.className = 'zoom-controls';
    
    const zoomIn = document.createElement('button');
    zoomIn.type = 'button';
    zoomIn.className = 'zoom-btn zoom-in';
    zoomIn.innerHTML = '<i class="fas fa-search-plus"></i>';
    zoomIn.setAttribute('aria-label', 'Zoom in');
    
    const zoomOut = document.createElement('button');
    zoomOut.type = 'button';
    zoomOut.className = 'zoom-btn zoom-out';
    zoomOut.innerHTML = '<i class="fas fa-search-minus"></i>';
    zoomOut.setAttribute('aria-label', 'Zoom out');
    
    const zoomReset = document.createElement('button');
    zoomReset.type = 'button';
    zoomReset.className = 'zoom-btn zoom-reset';
    zoomReset.innerHTML = '<i class="fas fa-redo"></i>';
    zoomReset.setAttribute('aria-label', 'Reset zoom');
    
    // Create adjust position button with just an icon
    const adjustBtn = document.createElement('button');
    adjustBtn.type = 'button';
    adjustBtn.id = 'adjustPositionBtn';
    adjustBtn.className = 'zoom-btn adjust-position';
    adjustBtn.innerHTML = '<i class="fas fa-expand-arrows-alt"></i>';
    adjustBtn.setAttribute('aria-label', 'Adjust position');
    
    // Add buttons to zoom controls
    zoomControls.appendChild(zoomOut);
    zoomControls.appendChild(zoomReset);
    zoomControls.appendChild(zoomIn);
    zoomControls.appendChild(adjustBtn);
    
    // Add controls below the picture container
    const pictureContainer = this.profilePicture.closest('.picture-container');
    if (pictureContainer) {
      const parentElement = pictureContainer.parentElement;
      if (parentElement) {
        parentElement.insertBefore(zoomControls, pictureContainer.nextSibling);
      }
    }
    
    // Define zoom limits
    this.ZOOM_MIN = 1.0;   // Minimum zoom level (100%) - same as reset
    this.ZOOM_MAX = 2.0;   // Maximum zoom level (200%)
    this.ZOOM_STEP = 0.15; // Zoom step increment (15%)
    
    // Direct event binding for better reliability
    zoomIn.addEventListener('click', () => {
      console.log("Zoom in button clicked");
      this.adjustZoom(this.ZOOM_STEP);
    });
    
    zoomOut.addEventListener('click', () => {
      console.log("Zoom out button clicked");
      this.adjustZoom(-this.ZOOM_STEP);
    });
    
    zoomReset.addEventListener('click', () => {
      console.log("Zoom reset button clicked");
      this.resetImagePosition();
      this.debounceSavePosition(500);
    });
    
    adjustBtn.addEventListener('click', () => {
      console.log("Adjust position button clicked");
      this.enterAdjustMode();
    });
    
    console.log('Image controls initialized and events attached');
  }

  // Separate method for zoom control events to ensure proper initialization
  _initZoomControlEvents(zoomIn, zoomOut, zoomReset, adjustBtn) {
    // This method is now deprecated as we use direct event binding above
    console.log("Using direct event binding instead of _initZoomControlEvents");
  }

  // Handle wheel zoom
  wheelZoom(e) {
    if (!this.isPositioningMode) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    // Use smaller delta for smoother zooming
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    
    // Apply zoom with logging
    console.log('Wheel zoom event detected');
    this.adjustZoom(delta);
    return false;
  }

  // Fix the enterAdjustMode method to properly check positioning mode and bind methods
  enterAdjustMode() {
    // If already in positioning mode, exit that mode first
    if (this.isPositioningMode) {
      console.log("Already in positioning mode, resetting state");
      this.saveAndExitPositioningMode();
      // Give some time for state to reset before trying again
      setTimeout(() => this.enterAdjustMode(), 300);
      return;
    }
    
    if (!this.profilePicture || this.isProcessingAction) {
      console.log("Cannot enter adjust mode - conditions not met:", {
        hasProfilePicture: !!this.profilePicture,
        isProcessingAction: this.isProcessingAction
      });
      return;
    }
    
    console.log("Entering adjust mode");
    
    // Prevent multiple actions
    this.isProcessingAction = true;
    
    try {
      // Make the image draggable
      this.profilePicture.style.cursor = 'move';
      this.profilePicture.style.pointerEvents = 'auto';
      
      if (this.pictureContainer) {
        this.pictureContainer.style.cursor = 'move';
        this.pictureContainer.classList.add('positioning-active');
      }
      
      // Add visual cue that the image is active
      this.profilePicture.classList.add('positioning-active');
      
      // Mark as being in positioning mode
      this.isPositioningMode = true;
      
      // Explicitly define the event handlers
      this.startDrag = (e) => {
        console.log("Start drag called");
        if (!this.isPositioningMode) return;
        
        e.preventDefault();
        e.stopPropagation();
        
        // Set dragging state
        this.imageState.isDragging = true;
        
        // Store starting positions
        this.imageState.startPositionX = this.imageState.positionX;
        this.imageState.startPositionY = this.imageState.positionY;
        
        if (e.type === 'mousedown' || e.type === 'pointerdown') {
          this.imageState.startX = e.clientX;
          this.imageState.startY = e.clientY;
        } else if (e.type === 'touchstart') {
          this.imageState.startX = e.touches[0].clientX;
          this.imageState.startY = e.touches[0].clientY;
        }
        
        // Visual feedback
        this.profilePicture.classList.add('dragging');
        console.log("Drag started:", {
          startX: this.imageState.startX,
          startY: this.imageState.startY,
          positionX: this.imageState.positionX,
          positionY: this.imageState.positionY
        });
      };
      
      this.drag = (e) => {
        if (!this.isPositioningMode || !this.imageState.isDragging) return;
        
        e.preventDefault();
        
        let currentX, currentY;
        
        if (e.type === 'mousemove') {
          currentX = e.clientX;
          currentY = e.clientY;
        } else if (e.type === 'touchmove') {
          currentX = e.touches[0].clientX;
          currentY = e.touches[0].clientY;
        } else {
          return;
        }
        
        // Calculate new position
        const deltaX = currentX - this.imageState.startX;
        const deltaY = currentY - this.imageState.startY;
        
        // Update position with limit constraints
        const maxOffset = 50;
        this.imageState.positionX = Math.max(Math.min(this.imageState.startPositionX + deltaX, maxOffset), -maxOffset);
        this.imageState.positionY = Math.max(Math.min(this.imageState.startPositionY + deltaY, maxOffset), -maxOffset);
        
        // Apply new position immediately
        this.applyImageStyles();
        
        console.log("Dragging:", {
          deltaX: deltaX,
          deltaY: deltaY,
          positionX: this.imageState.positionX,
          positionY: this.imageState.positionY
        });
      };
      
      this.endDrag = () => {
        if (!this.isPositioningMode || !this.imageState.isDragging) return;
        
        // Reset dragging state
        this.imageState.isDragging = false;
        
        // Remove visual feedback
        this.profilePicture.classList.remove('dragging');
        
        // Save position with delay
        this.debounceSavePosition();
      };
      
      this.wheelZoom = (e) => {
        if (!this.isPositioningMode) return;
        
        e.preventDefault();
        e.stopPropagation();
        
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        this.adjustZoom(delta);
        return false;
      };
      
      // Directly assign the handlers
      this.profilePicture.onmousedown = this.startDrag;
      window.onmousemove = this.drag;
      window.onmouseup = this.endDrag;
      this.profilePicture.onwheel = this.wheelZoom;
      
      // Add touch events for mobile
      this.profilePicture.ontouchstart = this.startDrag;
      window.ontouchmove = this.drag;
      window.ontouchend = this.endDrag;
      
      console.log("Positioning mode activated, handlers attached");
      
      // Add click handler to document to detect outside clicks
      setTimeout(() => {
        document.addEventListener('click', this._handleDocumentClick = (e) => {
          if (!this.profilePicture.contains(e.target) && 
              !e.target.closest('.zoom-controls')) {
            console.log("Outside click detected, exiting adjust mode");
            this.saveAndExitPositioningMode();
          }
        });
      }, 300);
      
      // Notify user
      this.showSuccess('Edit mode activated. Drag to position and use scroll wheel to zoom. Click elsewhere when done.');
    } catch(error) {
      console.error("Error in enterAdjustMode:", error);
      this.isPositioningMode = false;
      this.showError("Could not enter edit mode");
    } finally {
      // Reset processing flag with delay
      setTimeout(() => {
        this.isProcessingAction = false;
        console.log("Processing flag reset");
      }, 300);
    }
  }
  
  // Fix adjustZoom to handle positioning mode correctly and respect limits
  adjustZoom(delta) {
    if (!this.profilePicture) return;
    
    console.log("Adjusting zoom by:", delta);
    
    // If not in positioning mode, enter it
    if (!this.isPositioningMode) {
      this.enterAdjustMode();
      
      // Apply zoom after a slight delay to ensure positioning mode is active
      setTimeout(() => {
        this.adjustZoom(delta);
      }, 300);
      return;
    }
    
    // Calculate new scale with stricter limits
    const newScale = Math.max(
      this.ZOOM_MIN, 
      Math.min(this.ZOOM_MAX, this.imageState.scale + delta)
    );
    
    console.log(`Zoom change: Current=${this.imageState.scale}, New=${newScale}, Min=${this.ZOOM_MIN}, Max=${this.ZOOM_MAX}`);
    
    // Update if changed
    if (newScale !== this.imageState.scale) {
      // Store the old scale to check if rounding would make them equal
      const oldScale = this.imageState.scale;
      
      // Update scale
      this.imageState.scale = newScale;
      
      // Force a small position change if scales appear the same after rounding
      // This tricks the browser into redrawing the image at high quality
      if (Math.round(oldScale * 10) === Math.round(newScale * 10)) {
        // Apply a minimal position change to force redraw
        const currentX = this.imageState.positionX;
        this.imageState.positionX += 0.1;
        // Apply styles, then restore position
        this.applyImageStyles();
        this.imageState.positionX = currentX;
      }
      
      // Apply styles and save
      this.applyImageStyles();
      this.debounceSavePosition();
      
      // Show visual feedback of current zoom level
      const zoomPercent = Math.round(newScale * 100);
      notifications.info(`Zoom: ${zoomPercent}%`);
    } else {
      // Show message when limits are reached
      if (delta > 0 && newScale >= this.ZOOM_MAX) {
        notifications.info(`Maximum zoom level reached (${Math.round(this.ZOOM_MAX * 100)}%)`);
      } else if (delta < 0 && newScale <= this.ZOOM_MIN) {
        notifications.info(`Minimum zoom level reached (${Math.round(this.ZOOM_MIN * 100)}%)`);
      }
    }
  }

  // Save and exit positioning mode
  saveAndExitPositioningMode() {
    console.log("Exiting positioning mode");
    
    // Remove document click handler
    if (this._handleDocumentClick) {
      document.removeEventListener('click', this._handleDocumentClick);
      this._handleDocumentClick = null;
    }
    
    // Save current position
    this.debounceSavePosition(0);
    
    // Restore normal styles
    if (this.profilePicture) {
      this.profilePicture.style.cursor = 'default';
      this.profilePicture.style.pointerEvents = 'none';
      this.profilePicture.classList.remove('dragging');
      this.profilePicture.classList.remove('positioning-active');
    }
    
    if (this.pictureContainer) {
      this.pictureContainer.style.cursor = 'default';
      this.pictureContainer.classList.remove('positioning-active');
    }
    
    // Remove event handlers - direct removal
    if (this.profilePicture) {
      this.profilePicture.onmousedown = null;
      this.profilePicture.onwheel = null;
      this.profilePicture.ontouchstart = null;
    }
    
    window.onmousemove = null;
    window.onmouseup = null;
    window.ontouchmove = null;
    window.ontouchend = null;
    
    // Reset state - IMPORTANT
    this.isPositioningMode = false;
    this.imageState.isDragging = false;
    
    console.log("Positioning mode deactivated, handlers removed");
  }

  // Apply current position and scale to the profile picture
  applyImageStyles() {
    if (!this.profilePicture) return;
    
    // Use objectPosition for x,y positioning (like in the dashboard) without any adjustments
    const objectPositionX = Math.round(this.imageState.positionX);
    const objectPositionY = Math.round(this.imageState.positionY);
    this.profilePicture.style.objectPosition = `${objectPositionX}px ${objectPositionY}px`;
    
    // Force high-quality scaling for images with GPU acceleration
    const scale = Math.round(this.imageState.scale * 100) / 100; // Round to 2 decimal places
    const transform = `scale3d(${scale}, ${scale}, 1) translateZ(0)`;
    this.profilePicture.style.setProperty('transform', transform, 'important');
    
    // Add additional styling to improve rendering quality
    this.profilePicture.style.setProperty('image-rendering', 'high-quality', 'important');
    this.profilePicture.style.setProperty('backface-visibility', 'hidden', 'important');
    this.profilePicture.style.setProperty('transform-style', 'preserve-3d', 'important');
    
    // Store these values for immediate use on page refresh
    this.storeImageStyles(objectPositionX, objectPositionY, scale);
    
    // Mark container as loaded to reveal the image with transition
    setTimeout(() => {
      if (this.pictureContainer) {
        this.pictureContainer.classList.add('loaded');
      }
    }, 100);
    
    console.log('Image styles applied:', {
      objectPosition: `${objectPositionX}px ${objectPositionY}px`,
      scale: scale
    });
  }
  
  // Store image styles for immediate use on page load
  storeImageStyles(posX, posY, scale) {
    try {
      // Store precise values in localStorage for cross-page consistency
      const preciseX = this.imageState.positionX; // Use precise values from state
      const preciseY = this.imageState.positionY;
      const preciseScale = this.imageState.scale;
      
      // Store in localStorage with exact precision for dashboard
      localStorage.setItem('teacherImagePositionX', preciseX);
      localStorage.setItem('teacherImagePositionY', preciseY);
      localStorage.setItem('teacherImageScale', preciseScale);
      
      // Create or update an inline style element for early load styling
      let styleEl = document.getElementById('early-load-styles');
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'early-load-styles';
        document.head.appendChild(styleEl);
      }
      
      // Add CSS rule that will be applied before JavaScript fully loads
      styleEl.textContent = `
        #profilePicture {
          object-position: ${posX}px ${posY}px !important;
          transform: scale(${scale}) translateZ(0) !important;
          opacity: 1 !important;
          image-rendering: high-quality !important;
        }
      `;
      
      console.log('Stored image styles for next page load:', {
        x: preciseX,
        y: preciseY,
        scale: preciseScale
      });
    } catch (e) {
      console.error('Error storing image styles:', e);
    }
  }
  
  // Save position to server with debounce
  debounceSavePosition(delay = 300) {
    // Clear any existing timer
    if (this.savePositionTimer) {
      clearTimeout(this.savePositionTimer);
    }
    
    // Set new timer
    this.savePositionTimer = setTimeout(() => {
      this.saveImagePosition();
    }, delay);
  }
  
  // Save image position and scale to server
  async saveImagePosition() {
    if (!this.profilePicture) return;
    
    try {
      // Use precise values directly from the state
      const posX = this.imageState.positionX;
      const posY = this.imageState.positionY;
      const scale = this.imageState.scale;
      
      // Send to server
      const token = auth.getToken();
      
      // Check if the endpoint exists, if not use a fallback
      const endpoint = API_CONFIG.ENDPOINTS.TEACHER.IMAGE_POSITION || 
                     API_CONFIG.ENDPOINTS.TEACHER.PROFILE;
      
      console.log("Saving image position to endpoint:", endpoint, {
        x: posX,
        y: posY,
        scale: scale
      });
      
      const response = await fetch(`${API_CONFIG.BASE_URL}${endpoint}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          image_position_x: posX,
          image_position_y: posY,
          image_scale: scale
        })
      });
      
      if (response.ok) {
        console.log("Image position saved successfully");
      } else {
        console.warn("Failed to save image position to server, using localStorage backup");
      }
    } catch (error) {
      console.error("Error saving image position:", error);
    }
  }

  // Reset image position and scale to defaults
  resetImagePosition() {
    console.log("Resetting image position and scale");
    
    // Reset to default values
    this.imageState.positionX = 0;
    this.imageState.positionY = 0;
    this.imageState.scale = 1;
    
    // Apply the reset styles
    this.applyImageStyles();
    
    // Also update the UI to remove any adjustment mode
    if (this.isPositioningMode) {
      this.saveAndExitPositioningMode();
    } else {
      // If we're not in positioning mode, we need to explicitly save
      // the position to both localStorage and server
      this.storeImageStyles(0, 0, 1);
      this.saveImagePosition();
    }
    
    // Show success message
    this.showSuccess("Image position reset successfully");
  }

  showError(message) {
    notifications.error(message);
  }

  showSuccess(message) {
    notifications.success(message);
  }

  async handleLogout() {
    try {
      // Use auth module's logout method
      auth.logout(true);
    } catch (error) {
      console.error("Logout failed:", error);
    }
  }

  // Handle theme change
  async handleThemeChange() {
    try {
      const isDarkMode = this.darkModeToggle.checked;
      const theme = isDarkMode ? 'dark' : 'light';
      
      // Apply theme to body
      document.body.classList.toggle('dark-theme', isDarkMode);
      
      // Save preference to server
      const token = auth.getToken();
      const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.TEACHER.PREFERENCES}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          theme: theme
        })
      });
      
      if (response.ok) {
        this.showSuccess(`Theme changed to ${theme} mode`);
      } else {
        this.showError('Failed to save theme preference');
      }
    } catch (error) {
      console.error('Error changing theme:', error);
      this.showError('Failed to change theme');
    }
  }
  
  // Handle language change
  async handleLanguageChange() {
    try {
      const language = this.languageSelect.value;
      
      // Save preference to server
      const token = auth.getToken();
      const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.TEACHER.PREFERENCES}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          language: language
        })
      });
      
      if (response.ok) {
        this.showSuccess(`Language changed to ${language}`);
      } else {
        this.showError('Failed to save language preference');
      }
    } catch (error) {
      console.error('Error changing language:', error);
      this.showError('Failed to change language');
    }
  }
  
  // Handle password update
  async handlePasswordUpdate() {
    try {
      // Get form data
      const currentPassword = document.getElementById('currentPassword').value;
      const newPassword = document.getElementById('newPassword').value;
      const confirmPassword = document.getElementById('confirmPassword').value;
      
      // Validate passwords
      if (!currentPassword || !newPassword || !confirmPassword) {
        this.showError('All password fields are required');
        return;
      }
      
      if (newPassword !== confirmPassword) {
        this.showError('New passwords do not match');
        return;
      }
      
      // Validate new password
      const validation = validatePassword(newPassword);
      if (!validation.isValid) {
        this.showError(validation.message);
        return;
      }
      
      // Send request to server
      const token = auth.getToken();
      const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.TEACHER.PASSWORD}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword
        })
      });
      
      const data = await response.json();
      
      if (response.ok && data.success) {
        this.showSuccess('Password updated successfully');
        
        // Clear password fields
        document.getElementById('currentPassword').value = '';
        document.getElementById('newPassword').value = '';
        document.getElementById('confirmPassword').value = '';
        
        // Clear password feedback
        const feedbackEl = document.getElementById('password-feedback');
        if (feedbackEl) {
          feedbackEl.innerHTML = '';
        }
      } else {
        this.showError(data.message || 'Failed to update password');
      }
    } catch (error) {
      console.error('Error updating password:', error);
      this.showError('Failed to update password');
    }
  }
  
  // Handle profile update
  async handleProfileUpdate() {
    try {
      // Get form data
      const name = this.username.value;
      
      if (!name) {
        this.showError('Name is required');
        return;
      }
      
      // Validate username
      const validation = validateUsername(name);
      if (!validation.isValid) {
        this.showError(validation.message);
        return;
      }
      
      // Send request to server
      const token = auth.getToken();
      const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.TEACHER.PROFILE}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: name
        })
      });
      
      const data = await response.json();
      
      if (response.ok && data.success) {
        this.showSuccess('Profile updated successfully');
      } else {
        this.showError(data.message || 'Failed to update profile');
      }
    } catch (error) {
      console.error('Error updating profile:', error);
      this.showError('Failed to update profile');
    }
  }

  // Handle avatar upload
  async handleAvatarUpload(event) {
    if (!event.target.files || !event.target.files[0]) {
      return;
    }
    
    try {
      const file = event.target.files[0];
      
      // Check file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        this.showError('Image size should be less than 5MB');
        return;
      }
      
      // Check file type
      if (!file.type.match('image.*')) {
        this.showError('Please select an image file');
        return;
      }
      
      // Create form data
      const formData = new FormData();
      formData.append('avatar', file);
      
      // Add a flag to delete old image
      formData.append('delete_old', '1');
      
      // Add position and scale data
      formData.append('image_position_x', this.imageState.positionX.toString());
      formData.append('image_position_y', this.imageState.positionY.toString());
      formData.append('image_scale', this.imageState.scale.toString());
      
      console.log('Uploading with position data:', {
        x: this.imageState.positionX,
        y: this.imageState.positionY,
        scale: this.imageState.scale
      });
      
      // Show loading state
      this.isProcessingAction = true;
      if (this.pictureContainer) {
        this.pictureContainer.classList.add('uploading');
      }
      notifications.info('Uploading image...');
      
      const token = auth.getToken();
      let response;
      let data;
      let success = false;
      
      // Try the regular endpoint first
      try {
        console.log("Attempting upload with standard endpoint");
        response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.TEACHER.AVATAR}`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          },
          body: formData
        });
        
        data = await response.json();
        
        if (response.ok && data.success) {
          success = true;
          console.log("Upload successful with standard endpoint");
        } else {
          console.error("Standard endpoint failed:", data);
        }
      } catch (mainError) {
        console.error("Error with standard upload endpoint:", mainError);
      }
      
      // If the regular endpoint failed, try the simplified endpoint
      if (!success) {
        try {
          console.log("Attempting upload with simplified endpoint");
          // Add user_id to the form data for the simplified endpoint
          const userData = JSON.parse(localStorage.getItem('userData')) || {};
          formData.append('user_id', userData.id || '0');
          formData.append('token', token);
          
          response = await fetch(`${API_CONFIG.BASE_URL}/simple_upload.php`, {
            method: 'POST',
            body: formData
          });
          
          data = await response.json();
          
          if (response.ok && data.success) {
            success = true;
            console.log("Upload successful with simplified endpoint");
          } else {
            console.error("Simplified endpoint failed:", data);
          }
        } catch (fallbackError) {
          console.error("Error with simplified upload endpoint:", fallbackError);
        }
      }
      
      if (success) {
        // Process the new avatar path
        this.processAndSetAvatar(data.data?.avatar_url || data.avatar);
        
        // Update image state with returned values
        if (data.data) {
          this.imageState.positionX = parseFloat(data.data.position_x) || 0;
          this.imageState.positionY = parseFloat(data.data.position_y) || 0;
          this.imageState.scale = parseFloat(data.data.scale) || 1;
        }
        
        // Apply new styles
        this.applyImageStyles();
        
        // Save the new position to the server
        this.saveImagePosition();
        
        this.showSuccess('Profile picture updated successfully');
      } else {
        this.showError(data?.message || 'Failed to update profile picture');
      }
    } catch (error) {
      console.error('Error uploading avatar:', error);
      this.showError('Failed to update profile picture');
    } finally {
      // Reset the file input so the same file can be selected again if needed
      event.target.value = '';
      
      // Remove loading state
      if (this.pictureContainer) {
        this.pictureContainer.classList.remove('uploading');
      }
      this.isProcessingAction = false;
    }
  }

  // Reset profile picture to default
  async resetProfilePicture() {
    if (this.isProcessingAction) {
      return; // Prevent multiple actions
    }

    this.isProcessingAction = true;
    
    try {
      notifications.info('Resetting profile picture...');

      // Reset position and scale
      this.resetImagePosition();
      
      // Send a request to reset to the default avatar
      const token = auth.getToken();
      const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.TEACHER.PROFILE}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          reset_avatar: true
        })
      });

      if (response.ok) {
        // Set to default placeholder
        this.processAndSetAvatar('images/profile-placeholder.svg');
        
        this.showSuccess('Profile picture reset successfully');
      } else {
        this.showError('Failed to reset profile picture');
      }
    } catch (error) {
      console.error('Error resetting profile picture:', error);
      this.showError('Failed to reset profile picture');
    } finally {
      this.isProcessingAction = false;
    }
  }
}

// Initialize settings when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  window.teacherSettings = new TeacherSettings();
});
