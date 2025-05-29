import API_CONFIG from './config.js';
import notifications from './utils/notifications.js';
import roleGuard from './utils/role-guard.js';
import auth, { fetchWithTokenRefresh } from './utils/auth.js';
import { validateUsername, validatePassword } from './utils/validation.js';

class SettingsManager {
  constructor() {
    // Add image state tracking
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
    this.isProcessingAction = false;
    
    // Add debounce timer for saving position
    this.savePositionTimer = null;
    
    // Core elements
    this.profilePicture = document.getElementById("profilePicture");
    this.pictureInput = document.getElementById("pictureInput");
    this.pictureContainer = document.getElementById("pictureContainer");
    this.changePictureBtn = document.querySelector(".change-picture-btn");
    
    // Remove any existing click handlers from picture container
    if (this.pictureContainer) {
      this.pictureContainer.onclick = null;
      this.pictureContainer.ondblclick = null;
      this.pictureContainer.style.pointerEvents = 'none';
    }
    
    if (this.profilePicture) {
      this.profilePicture.style.pointerEvents = 'none';
    }
    
    console.log('SettingsManager - Constructor called');
    // Log initial auth state
    const token = localStorage.getItem('token') || localStorage.getItem('userToken');
    const userData = localStorage.getItem('userData');
    console.log('Initial auth state:', {
      hasToken: !!token,
      tokenPrefix: token ? token.substring(0, 10) + '...' : null,
      hasUserData: !!userData,
      userData: userData ? JSON.parse(userData) : null
    });
    
    // Immediately try to initialize (don't wait for DOMContentLoaded)
    this.init();
    
    // Also add a DOM loaded handler as a backup
    document.addEventListener("DOMContentLoaded", () => {
      console.log('DOM fully loaded, ensuring settings manager is initialized');
      this.checkAndFixProfilePicture();
    });
  }

  checkAndFixProfilePicture() {
    // Direct fix for profile picture button
    const changeButton = document.querySelector(".change-picture-btn");
    const pictureInput = document.getElementById("pictureInput");
    const pictureContainer = document.getElementById("pictureContainer");
    const profilePicture = document.getElementById("profilePicture");
    
    // Remove any unwanted click handlers
    if (pictureContainer) {
      pictureContainer.onclick = null;
      pictureContainer.ondblclick = null;
      pictureContainer.style.pointerEvents = 'none';
    }
    
    if (profilePicture) {
      profilePicture.style.pointerEvents = 'none';
    }
    
    if (changeButton && pictureInput) {
      // Add direct onclick attribute to change button only
      changeButton.onclick = () => pictureInput.click();
      console.log('Added direct onclick handler to change picture button');
    }
  }

  async init() {
    try {
      console.log('Student Settings - Starting initialization');
      
      // Initialize authentication with no redirect
      const authResult = await auth.initializeAuth(false);
      console.log('Student Settings - Auth initialization result:', authResult);
      
      if (!authResult) {
        // Try to refresh token before giving up
        const refreshResult = await auth.refreshToken();
        if (!refreshResult) {
          console.log('Auth initialization and refresh failed, redirecting to login');
          window.location.replace('/quizmaster/frontend/login.html');
          return;
        }
      }

      // Check role after successful auth
      const roleCheck = await roleGuard.checkAccess('student');
      console.log('Student Settings - Role check result:', roleCheck);
      
      if (!roleCheck) {
        console.log('Role check failed, redirecting to appropriate page');
        const userData = auth.getCurrentUser();
        if (userData && userData.role === 'teacher') {
          window.location.replace('/quizmaster/frontend/teacher-settings.html');
        } else {
          window.location.replace('/quizmaster/frontend/login.html');
        }
        return;
      }

      // Initialize all components
      this.setupDashboardNav();
      this.setupPasswordToggles();
      this.setupDarkMode();
      this.setupLanguage();
      this.setupNotificationPreferences();
      this.setupFormSubmissions();
      this.setupProfilePicture();
      this.initImageControls();
      this.initializeProfilePictureStyles();
      
      // Load data
      await Promise.all([
        this.loadData(),
        this.loadPreferences()
      ]);
      
      // Re-initialize image controls after data is loaded
      setTimeout(() => {
        this.initImageControls();
      }, 500);
      
      console.log('Student Settings initialization complete');
    } catch (error) {
      console.error('Settings initialization error:', error);
      notifications.error('Failed to initialize settings. Please refresh the page.');
    }
  }

  initializeProfilePictureStyles() {
    // Find profile picture and apply base styling
    const profilePicture = document.getElementById("profilePicture");
    if (profilePicture) {
      profilePicture.style.objectFit = 'cover';
      profilePicture.style.transformOrigin = 'center center';
      profilePicture.style.transform = 'scale(1) translateZ(0)'; // Add translateZ for hardware acceleration
      profilePicture.style.willChange = 'transform'; // Limit to only needed properties
      profilePicture.style.imageRendering = '-webkit-optimize-contrast'; // Improves sharpness
      profilePicture.style.backfaceVisibility = 'hidden'; // Prevents blurring
      console.log('Applied optimized styling to profile picture before data load');
    } else {
      console.log('Profile picture element not found during initialization');
    }
  }

  setupDashboardNav() {
    // Setup dashboard navigation functionality
    console.log('Setting up dashboard navigation');
    
    // Handle sidebar toggle for mobile
    const menuToggle = document.querySelector('.menu-toggle');
    const sidebar = document.querySelector('.sidebar');
    
    if (menuToggle && sidebar) {
      menuToggle.addEventListener('click', () => {
        sidebar.classList.toggle('active');
      });
      
      // Close sidebar when clicking outside
      document.addEventListener('click', (e) => {
        if (!e.target.closest('.sidebar') && !e.target.closest('.menu-toggle')) {
          sidebar.classList.remove('active');
        }
      });
    }
    
    // Setup logout button
    this.setupLogout();
  }

  setupProfilePicture() {
    console.log('Setting up profile picture handlers');

    if (!this.pictureInput || !this.profilePicture) {
      console.error('Picture elements not found');
      return;
    }
    
    console.log('Profile picture elements found, adding event listeners');

    // Only add click handler to the change picture button
    if (this.changePictureBtn) {
      console.log('Found change picture button, adding click handler');
      this.changePictureBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('Change picture button clicked');
        if (!this.isProcessingAction) {
          this.pictureInput.click();
        }
      });
    }

    // Handle file selection
    this.pictureInput.addEventListener("change", async (e) => {
      console.log('Picture input changed, file selected');
      const file = e.target.files[0];
      
      if (!file) {
        console.log('No file selected');
        return;
      }
      
      if (!file.type.startsWith("image/")) {
        notifications.error('Please select an image file');
        return;
      }
      
      try {
        // Get the profile picture container once
        const profilePictureContainer = this.profilePicture.closest('.profile-picture');
        
        // Read the file as data URL
        const reader = new FileReader();
        
        reader.onload = async (e) => {
          const imageData = e.target.result;
          console.log('Image data loaded, length:', imageData.length);
          
          // Debug the image data format
          console.log('Original image data type:', typeof imageData);
          console.log('Original image data starts with:', imageData.substring(0, 50) + '...');
          
          if (!imageData || typeof imageData !== 'string' || !imageData.startsWith('data:image/')) {
            console.error('Invalid image data format received from FileReader');
            notifications.error('Invalid image format');
            return;
          }
          
          // Set the image preview immediately but don't show loading yet
          this.profilePicture.src = imageData;
          
          // Short delay before showing loading spinner to avoid flickering
          setTimeout(() => {
            // Show loading state
            if (profilePictureContainer) {
              profilePictureContainer.classList.add('loading');
            }
          }, 100);
          
          try {
            console.log('Saving image to server...');
            const success = await this.saveProfilePicture(imageData);
            
            // Wait a bit before removing the loading state to ensure smooth animation
            setTimeout(() => {
              // Remove loading state
              if (profilePictureContainer) {
                profilePictureContainer.classList.remove('loading');
              }
              
              // Show appropriate notification
              if (success) {
                notifications.success('Profile picture updated successfully');
              } else {
                notifications.error('Failed to update profile picture');
              }
            }, 500);
            
          } catch (err) {
            console.error('Error uploading image:', err);
            
            // Remove loading state
            if (profilePictureContainer) {
              profilePictureContainer.classList.remove('loading');
            }
            
            notifications.error('Error uploading image: ' + err.message);
          }
        };
        
        reader.onerror = (error) => {
          console.error('Error reading file:', error);
          notifications.error('Error reading the selected image');
        };
        
        // Start reading the file
        reader.readAsDataURL(file);
      } catch (error) {
        console.error('Error processing image:', error);
        notifications.error('Error processing the selected image');
        const profilePictureContainer = this.profilePicture.closest('.profile-picture');
        if (profilePictureContainer) {
          profilePictureContainer.classList.remove('loading');
        }
      }
    });
  }

  setupPasswordToggles() {
    document.querySelectorAll(".toggle-password").forEach((button) => {
      button.addEventListener("click", (e) => {
        const input = e.target.closest(".password-input").querySelector("input")
        const icon = e.target.closest(".toggle-password").querySelector("i")

        if (input.type === "password") {
          input.type = "text"
          icon.classList.remove("fa-eye")
          icon.classList.add("fa-eye-slash")
        } else {
          input.type = "password"
          icon.classList.remove("fa-eye-slash")
          icon.classList.add("fa-eye")
        }
      })
    })
  }

  setupDarkMode() {
    const darkModeToggle = document.getElementById("darkMode")
    const isDarkMode = localStorage.getItem("darkMode") === "true"

    darkModeToggle.checked = isDarkMode
    document.body.classList.toggle("dark-theme", isDarkMode)

    darkModeToggle.addEventListener("change", async (e) => {
      const darkMode = e.target.checked;
      document.body.classList.toggle("dark-theme", darkMode);
      localStorage.setItem("darkMode", darkMode);
      localStorage.setItem("theme", darkMode ? "dark" : "light");
      await this.savePreferences({ darkMode });
    })
  }

  setupLanguage() {
    const languageSelect = document.getElementById("language")
    const currentLang = localStorage.getItem("language") || "en"

    languageSelect.value = currentLang

    languageSelect.addEventListener("change", async (e) => {
      const language = e.target.value
      localStorage.setItem("language", language)
      await this.savePreferences({ language })
    })
  }

  setupNotificationPreferences() {
    // Quiz Notifications
    const quizNotificationsToggle = document.getElementById("quizNotifications")
    const quizNotificationsEnabled = localStorage.getItem("quizNotifications") !== "false"
    
    quizNotificationsToggle.checked = quizNotificationsEnabled
    
    quizNotificationsToggle.addEventListener("change", async (e) => {
      const quizNotifications = e.target.checked
      localStorage.setItem("quizNotifications", quizNotifications)
      await this.savePreferences({ quizNotifications })
    })
  }

  setupFormSubmissions() {
    // Get the profile form
    const profileForm = document.getElementById('profileForm');
    if (profileForm) {
        // Add name input if it doesn't exist
        let usernameInput = profileForm.querySelector('input[name="username"]');
        if (!usernameInput) {
            usernameInput = document.createElement('input');
            usernameInput.type = 'hidden';
            usernameInput.name = 'username';
            profileForm.appendChild(usernameInput);
        }

        // Update username input value when the visible input changes
        const visibleUsernameInput = document.getElementById('username');
        if (visibleUsernameInput) {
            visibleUsernameInput.addEventListener('input', (e) => {
                usernameInput.value = e.target.value;
            });
            // Set initial value
            usernameInput.value = visibleUsernameInput.value;
        }

        // Handle form submission
        profileForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            console.log('Profile form submitted');
            
            // Get form data
            const formData = new FormData(profileForm);
            
            // Get the visible username input value
            const visibleUsername = visibleUsernameInput ? visibleUsernameInput.value : '';
            if (visibleUsername) {
                formData.set('username', visibleUsername);
            }
            
            console.log('Form data before submission:', Object.fromEntries(formData));
            
            // Handle the profile update
            await this.handleProfileSubmit(e);
        });
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

    // Password form
    const passwordForm = document.getElementById("passwordForm");
    if (passwordForm) {
      passwordForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        
        const currentPassword = document.getElementById("currentPassword").value;
        const newPassword = document.getElementById("newPassword").value;
        const confirmPassword = document.getElementById("confirmPassword").value;
        
        // Basic validation
        if (!currentPassword || !newPassword || !confirmPassword) {
          notifications.error('All password fields are required');
          return;
        }
        
        if (newPassword !== confirmPassword) {
          notifications.error('New passwords do not match');
          return;
        }
        
        // Validate new password
        const validation = validatePassword(newPassword);
        if (!validation.isValid) {
          notifications.error(validation.message);
          return;
        }
        
        try {
          const response = await fetchWithTokenRefresh('student/password.php', {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              currentPassword,
              newPassword
            })
          });
          
          const data = await response.json();
          
          if (data.success) {
            // Clear form
            passwordForm.reset();
            notifications.success('Password updated successfully');
            
            // Clear password feedback
            const feedbackEl = document.getElementById('password-feedback');
            if (feedbackEl) {
              feedbackEl.innerHTML = '';
            }
          } else {
            throw new Error(data.message || 'Failed to update password');
          }
        } catch (error) {
          console.error('Error updating password:', error);
          notifications.error(error.message || 'Failed to update password');
        }
      });
    }

    // Preferences form
    const preferencesForm = document.getElementById("preferencesForm");
    if (preferencesForm) {
      preferencesForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const darkMode = document.getElementById("darkMode").checked;
        const language = document.getElementById("language").value;
        const quizNotifications = document.getElementById("quizNotifications").checked;
        
        await this.savePreferences({
          darkMode,
          language,
          quizNotifications
        });
      });
    }
  }

  // Add handleProfileSubmit method
  async handleProfileSubmit(e) {
    try {
        e.preventDefault();
        
        console.log('Profile form submitted');
        
        // Get form data
        const formData = new FormData(e.target);
        console.log('Raw form data:', Object.fromEntries(formData));
        
        // Get current user data
        const userData = JSON.parse(localStorage.getItem('userData') || '{}');
        console.log('Current user data:', userData);
        
        // Get username from the visible input
        const visibleUsernameInput = document.getElementById('username');
        let username = visibleUsernameInput ? visibleUsernameInput.value : formData.get('username');
        console.log('Username from input:', username);
        
        // If username is empty or unchanged, keep the current name
        if (!username || username.trim() === '') {
            username = userData.name;
            console.log('Using current username:', username);
        } else {
            username = username.trim();
            console.log('Using new username:', username);
        }
        
        // Only validate if username is different from current
        if (username !== userData.name) {
            console.log('Username changed, validating...');
            const validation = this.validateUsername(username);
            console.log('Validation result:', validation);
            
            if (!validation.isValid) {
                console.error('Username validation failed:', validation.message);
                notifications.error(validation.message || 'Invalid username format');
                return;
            }
            console.log('Username validation passed');
        } else {
            console.log('Username unchanged, skipping validation');
        }
        
        // Get current image state
        const imageState = {
            positionX: this.imageState?.positionX || 0,
            positionY: this.imageState?.positionY || 0,
            scale: this.imageState?.scale || 1
        };
        console.log('Current image state:', imageState);
        
        // Create profile data object
        const profileData = {
            name: username,
            image_position_x: imageState.positionX,
            image_position_y: imageState.positionY,
            image_scale: imageState.scale
        };
        
        console.log('Sending profile update with data:', profileData);
        
        // Send update request
        const response = await fetchWithTokenRefresh('student/profile.php', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(profileData)
        });
        
        // Get the response text first for debugging
        const responseText = await response.text();
        console.log('Profile update response:', responseText);
        
        // Try to parse the response as JSON
        let data;
        try {
            data = JSON.parse(responseText);
            console.log('Parsed response data:', data);
        } catch (error) {
            console.error('Error parsing response:', error);
            throw new Error('Invalid response from server');
        }
        
        if (!response.ok) {
            console.error('Profile update failed:', data);
            throw new Error(data.message || `HTTP error! status: ${response.status}`);
        }
        
        if (data.success) {
            console.log('Profile update successful');
            
            // Update local storage with new data
            const updatedUserData = { 
                ...userData,
                name: username,
                image_position_x: imageState.positionX.toString(),
                image_position_y: imageState.positionY.toString(),
                image_scale: imageState.scale.toString()
            };
            localStorage.setItem('userData', JSON.stringify(updatedUserData));
            console.log('Updated local storage with new data:', updatedUserData);
            
            // Update UI to reflect changes
            this.updateUserInterface(updatedUserData);
            
            // Update all profile pictures in the UI
            if (data.profile && data.profile.avatar) {
                console.log('Updating profile pictures with new avatar:', data.profile.avatar);
                this.updateAllProfilePictures(data.profile.avatar);
            }
            
            // Update image state if returned in response
            if (data.profile) {
                console.log('Updating image state with new values:', {
                    positionX: data.profile.image_position_x,
                    positionY: data.profile.image_position_y,
                    scale: data.profile.image_scale
                });
                
                this.imageState = {
                    ...this.imageState,
                    positionX: parseFloat(data.profile.image_position_x) || 0,
                    positionY: parseFloat(data.profile.image_position_y) || 0,
                    scale: parseFloat(data.profile.image_scale) || 1
                };
                this.applyImageStyles();
            }
            
            notifications.success('Profile updated successfully');
            
            // Reload data to ensure everything is in sync
            await this.loadData();
        } else {
            console.error('Profile update failed:', data.message);
            notifications.error(data.message || 'Failed to update profile');
        }
    } catch (error) {
        console.error('Error updating profile:', error);
        notifications.error(error.message || 'Failed to update profile');
    }
  }

  setupLogout() {
    // Use document.querySelector with a more specific selector
    const logoutButton = document.querySelector('.sidebar-footer .logout-btn')
    console.log('Logout button found:', !!logoutButton)
    
    if (logoutButton) {
      console.log('Adding event listener to logout button')
      
      // Use an inline function to ensure proper this context
      logoutButton.addEventListener('click', () => {
        console.log('Logout button clicked')
        this.handleLogout()
      })
    } else {
      console.error('Logout button not found in the DOM')
    }
  }

  handleLogout() {
    console.log('Handling logout');
    
    try {
      // Clear all stored data
      localStorage.removeItem('userToken');
      localStorage.removeItem('token');
      localStorage.removeItem('userData');
      localStorage.removeItem('language');
      localStorage.removeItem('quizNotifications');
      localStorage.removeItem('lastQuizCheckTimestamp');
      localStorage.removeItem('quizAvailableCount');
      sessionStorage.clear();
      
      console.log('User data cleared, redirecting to login page');
      
      // Redirect to login page
      window.location.replace('login.html');
    } catch (error) {
      console.error('Logout failed:', error);
      notifications.error('Logout failed: ' + error.message);
    }
  }

  async loadData() {
    try {
      // First check local storage for cached data
      const storedUserData = localStorage.getItem('userData');
      console.log('Stored user data found in localStorage:', !!storedUserData);
      
      if (storedUserData) {
        const userData = JSON.parse(storedUserData);
        console.log('Using cached user data:', userData);
        this.updateUserInterface(userData);
      }

      // Fetch fresh user data from server
      console.log('Fetching user profile data from server');
      const response = await fetchWithTokenRefresh('student/profile.php', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch profile: ${response.status}`);
      }

      // Parse the response text into JSON
      const responseText = await response.text();
      console.log('Raw response text:', responseText);
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (e) {
        console.error('Failed to parse profile response:', e);
        // If we have cached data, continue using that
        if (storedUserData) {
          return JSON.parse(storedUserData);
        }
        throw new Error('Invalid profile data received');
      }
      
      if (data.success && data.profile) {
        console.log('Received user profile from server:', data.profile);
        
        // Create complete user data object
        const userData = {
          ...data.profile,
          user_id: auth.getCurrentUser()?.user_id,
          role: 'student'
        };
        
        // Save to localStorage for future use
        localStorage.setItem('userData', JSON.stringify(userData));
        
        // Update UI with fresh data
        this.updateUserInterface(userData);
        
        return userData;
      } else {
        console.error('Invalid profile response format:', data);
        // If we have cached data, continue using that
        if (storedUserData) {
          return JSON.parse(storedUserData);
        }
        throw new Error('Invalid response format');
      }
    } catch (error) {
      console.error('Error loading user data:', error);
      notifications.error('Failed to load user profile');
      // If we have cached data, continue using that
      const storedUserData = localStorage.getItem('userData');
      if (storedUserData) {
        return JSON.parse(storedUserData);
      }
      return null;
    }
  }

  async loadPreferences() {
    try {
      console.log('Fetching user preferences from server');
      const endpointPath = 'student/preferences.php';
      console.log(`Trying to fetch preferences from endpoint: ${endpointPath}`);
      
      const response = await fetchWithTokenRefresh(endpointPath, {
        method: 'GET'
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch preferences: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.success && data.preferences) {
        console.log('Received preferences from server:', data.preferences);
        
        // Initialize default values if not present
        const preferences = {
          darkMode: false,
          language: 'en',
          quizNotifications: true,
          theme: 'light',
          ...data.preferences // Override defaults with server values
        };
        
        // Update localStorage with server values
        localStorage.setItem('darkMode', preferences.darkMode);
        localStorage.setItem('language', preferences.language);
        localStorage.setItem('quizNotifications', preferences.quizNotifications);
        
        // Update UI
        const darkModeToggle = document.getElementById("darkMode");
        if (darkModeToggle) {
          darkModeToggle.checked = preferences.darkMode;
          document.body.classList.toggle("dark-theme", preferences.darkMode);
        }
        
        const languageSelect = document.getElementById("language");
        if (languageSelect) {
          languageSelect.value = preferences.language;
        }
        
        const quizNotificationsToggle = document.getElementById("quizNotifications");
        if (quizNotificationsToggle) {
          quizNotificationsToggle.checked = preferences.quizNotifications;
        }
      }
    } catch (error) {
      console.error('Error loading preferences:', error);
      // Fall back to localStorage values if server fetch fails
      const darkModeToggle = document.getElementById("darkMode");
      if (darkModeToggle) {
        const darkMode = localStorage.getItem('darkMode') === 'true';
        darkModeToggle.checked = darkMode;
        document.body.classList.toggle("dark-theme", darkMode);
      }
      
      const languageSelect = document.getElementById("language");
      if (languageSelect) {
        languageSelect.value = localStorage.getItem('language') || 'en';
      }
      
      const quizNotificationsToggle = document.getElementById("quizNotifications");
      if (quizNotificationsToggle) {
        quizNotificationsToggle.checked = localStorage.getItem('quizNotifications') !== 'false';
      }
    }
  }

  updateUserInterface(userData) {
    console.log('Updating UI with user data:', userData);
    
    const profilePicture = document.getElementById("profilePicture");
    const username = document.getElementById("username");
    const email = document.getElementById("email");
    const hiddenUsernameField = document.getElementById("currentUsername");
      
    // Update username fields
    if (userData.name) {
      if (username) username.value = userData.name;
      if (hiddenUsernameField) hiddenUsernameField.value = userData.name;
    }

    // Update email field
    if (userData.email && email) {
      email.value = userData.email;
    }

    // Update profile picture
    if (profilePicture) {
      if (userData.avatar) {
        console.log('Setting profile picture to:', userData.avatar);
        
        // Process the avatar path
        let avatarPath = this.processAvatarPath(userData.avatar);
        console.log('Processed avatar path:', avatarPath);
          
        // Add timestamp to prevent caching
        const timestamp = new Date().getTime();
        avatarPath = `${avatarPath}?t=${timestamp}`;
              
        // Apply image position and scale if available
        if (userData.image_position_x !== undefined &&
            userData.image_position_y !== undefined &&
            userData.image_scale !== undefined) {
                
                const posX = Number(userData.image_position_x);
                const posY = Number(userData.image_position_y);
                const scale = parseFloat(userData.image_scale);
                
                profilePicture.style.objectFit = 'cover';
                profilePicture.style.objectPosition = `${Math.round(posX)}px ${Math.round(posY)}px`;
                profilePicture.style.transform = `scale(${scale}) translateZ(0)`;
                profilePicture.style.transformOrigin = 'center center';
                profilePicture.style.willChange = 'transform';
                profilePicture.style.imageRendering = '-webkit-optimize-contrast';
                profilePicture.style.backfaceVisibility = 'hidden';
          
          console.log('Applied image positioning:', { posX, posY, scale });
        }
        
        // Set the source after applying styles
        profilePicture.src = avatarPath;
                
        // Add error handler
        profilePicture.onerror = () => {
          console.error('Failed to load avatar from path:', avatarPath);
          profilePicture.src = '/quizmaster/frontend/images/profile-placeholder.svg';
              };
          } else {
      console.log('No avatar found, using default');
        profilePicture.src = "/quizmaster/frontend/images/profile-placeholder.svg";
      }
    }
    
    // Update any other UI elements that show the user's name
    document.querySelectorAll('.user-name').forEach(el => {
      if (userData.name) el.textContent = userData.name;
    });
  }

  async saveProfilePicture(imageData) {
    try {
      // Ensure imageData is a string containing a data URL
      const base64Data = typeof imageData === 'string' ? imageData : (imageData?.dataUrl || null);
      
      if (!base64Data) {
        console.error('No valid image data provided');
        return false;
      }
      
      // Add additional debugging
      console.log('Image data type:', typeof base64Data);
      console.log('Image data starts with:', base64Data.substring(0, 50) + '...');
      
      // Ensure the data is a proper base64 image string
      if (!base64Data.startsWith('data:image/')) {
        console.error('Invalid image data format:', base64Data.substring(0, 50) + '...');
        return false;
      }
      
      // Get current user data to preserve the name
      const userData = JSON.parse(localStorage.getItem('userData') || '{}');
      
      // Build payload for API
      const payload = {
        name: userData.name, // Include current name to avoid validation error
        avatar: base64Data,
        position: {
          x: this.imagePosition?.x || 0,
          y: this.imagePosition?.y || 0,
          scale: this.imagePosition?.scale || 1
        }
      };
      
      // Log info about what we're sending
      console.log('Sending profile image with position data:', {
        imageLength: base64Data.length,
        dataPrefix: base64Data.substring(0, 30) + '...',
        position: payload.position
      });
      
      // Use the avatar update endpoint
      const url = 'student/update-avatar';
      console.log(`Uploading profile picture to endpoint: ${url}`);
      
      // Make sure to specify the content type as JSON
      const response = await fetchWithTokenRefresh(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      
      // Parse the JSON response
      const data = await response.json();
      console.log('Server response:', data);
      
      if (data.success) {
        console.log('Profile picture updated successfully');
        
        // Update the localStorage data with the new avatar path
        const userData = JSON.parse(localStorage.getItem('userData') || '{}');
        
        // If we got a path back in the response, save it
        if (data.avatar) {
          userData.avatar = data.avatar;
          
          // If we got position data back, save that too
          if (data.position) {
            userData.image_position_x = data.position.x;
            userData.image_position_y = data.position.y;
            userData.image_scale = data.position.scale;
          }
          
          localStorage.setItem('userData', JSON.stringify(userData));
          console.log('Updated userData in localStorage with new avatar');
          
          // Update the UI with the new data
          this.updateUserInterface(userData);
        }
        
        notifications.success('Profile picture updated successfully');
        return true;
      } 
      
      throw new Error(data.message || 'Failed to update profile picture');
    } catch (error) {
      console.error('Error uploading profile picture:', error);
      notifications.error(error.message || 'Failed to update profile picture');
      return false;
    }
  }
  
  // New method to update all profile pictures across the site
  updateAllProfilePictures(avatarPath) {
    if (!avatarPath) return;
    
    console.log('Updating all profile pictures with new path:', avatarPath);
    
    // Process the avatar path to ensure it's correct
    const processedPath = this.processAvatarPath(avatarPath);
    console.log('Processed avatar path for all updates:', processedPath);
    
    // Add timestamp to prevent caching
    const timestamp = new Date().getTime();
    const newSrc = processedPath + '?t=' + timestamp;
    
    // Function to safely update an image with preloading
    const updateImageSafely = (imgElement, src) => {
      if (!imgElement) return;
      
      console.log(`Updating image element with src: ${src}`);
      
      // Create a new image to preload
      const tempImg = new Image();
      tempImg.onload = () => {
        // Only update the src when image is loaded
        imgElement.src = src;
        console.log('Image updated successfully');
      };
      
      tempImg.onerror = () => {
        console.error('Failed to load image:', src);
        // Try with a fallback if needed
        if (src.includes('/quizmaster/')) {
          const fallbackSrc = src.replace('/quizmaster/', '/');
          console.log('Trying fallback path:', fallbackSrc);
          imgElement.src = fallbackSrc;
        } else if (!src.includes('/quizmaster/')) {
          const fallbackSrc = '/quizmaster/' + src;
          console.log('Trying with /quizmaster/ prefix:', fallbackSrc);
          imgElement.src = fallbackSrc;
        }
      };
      
      tempImg.src = src;
    };
    
    // Update the profile pictures in the sidebar and header
    const sidebarProfilePic = document.querySelector('.sidebar .profile-pic img');
    if (sidebarProfilePic) {
      console.log('Updating sidebar profile picture');
      updateImageSafely(sidebarProfilePic, newSrc);
    }
    
    const headerProfilePic = document.querySelector('.header .profile-pic img');
    if (headerProfilePic) {
      console.log('Updating header profile picture');
      updateImageSafely(headerProfilePic, newSrc);
    }
    
    // Update any other profile pictures that might be on the page
    document.querySelectorAll('.user-avatar img').forEach(img => {
      console.log('Updating user avatar image');
      updateImageSafely(img, newSrc);
    });
    
    // Also check for avatar elements without img child
    document.querySelectorAll('.user-avatar').forEach(avatar => {
      if (avatar.tagName.toLowerCase() === 'img') {
        console.log('Updating avatar element that is an img');
        updateImageSafely(avatar, newSrc);
      }
    });
    
    // Special case for profile picture since it's important
    const profilePicture = document.getElementById('profilePicture');
    if (profilePicture) {
      console.log('Explicitly updating main profile picture');
      updateImageSafely(profilePicture, newSrc);
    }
    
    // Refresh dashboard if on settings page
    if (window.location.href.includes('settings.html')) {
      // Set a flag to refresh dashboard on next load
      localStorage.setItem('refreshDashboard', 'true');
      console.log('Set flag to refresh dashboard on next load');
    }
  }

  // Helper function to process avatar paths - use absolute path
  processAvatarPath(originalPath) {
    if (!originalPath) {
      return '/quizmaster/frontend/images/profile-placeholder.svg';
    }
    
    console.log('Settings - Processing avatar path:', originalPath);
    
    // Handle the default placeholder image case specially
    if (originalPath === 'profile-placeholder.svg' || originalPath === 'images/profile-placeholder.svg') {
      return '/quizmaster/frontend/images/profile-placeholder.svg';
    }
    
    // Handle backend paths - this is the key fix
    if (originalPath.startsWith('backend/')) {
      // Remove any duplicate 'backend' in the path
      const path = originalPath.replace(/^backend\//, '');
      return `/quizmaster/backend/${path}`;
    }
    
    // Handle uploads paths directly
    if (originalPath.startsWith('uploads/')) {
      return '/quizmaster/backend/uploads/' + originalPath.replace(/^uploads\//, '');
    }
    
    // Handle absolute paths
    if (originalPath.startsWith('/')) {
      if (originalPath.includes('/backend/')) {
        return originalPath; // Already has correct structure
      }
      if (originalPath.includes('/uploads/')) {
        return '/quizmaster/backend' + originalPath;
      }
      return originalPath;
    }
    
    // Handle frontend paths
    if (originalPath.startsWith('frontend/')) {
      return '/quizmaster/' + originalPath;
    }
    
    // If path contains profile_images, ensure correct structure
    if (originalPath.includes('profile_images/')) {
      const filename = originalPath.split('profile_images/').pop();
      return `/quizmaster/backend/uploads/profile_images/${filename}`;
    }
    
    // Default case - assume it's in frontend/images
    return '/quizmaster/frontend/images/' + originalPath;
  }

  validateUsername(username) {
    try {
        // Basic validation
        if (!username || username.trim() === '') {
            return {
                isValid: false,
                message: '❌ Username is required'
            };
        }

        // Use the imported validation function
        const validation = validateUsername(username.trim());
        console.log('Username validation result:', validation);
        return validation;
    } catch (error) {
        console.error('Error validating username:', error);
        return {
            isValid: false,
            message: '❌ Error validating username'
        };
    }
  }

  validatePassword(password) {
    const result = validatePassword(password);
    if (!result.isValid) {
        notifications.error(result.feedback);
    }
    return result.isValid;
  }

  async savePreferences(preferences) {
    try {
      console.log('Saving preferences:', preferences);
      
      // Ensure all required fields are present with defaults
      const updatedPreferences = {
        darkMode: false,
        language: 'en',
        quizNotifications: true,
        theme: 'light',
        ...preferences // Override defaults with provided values
      };
      
      const response = await fetchWithTokenRefresh('student/preferences.php', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updatedPreferences)
      });

      const data = await response.json();

      if (data.success) {
        // Update localStorage
        Object.entries(updatedPreferences).forEach(([key, value]) => {
          localStorage.setItem(key, value);
        });
        
        // Update UI theme if dark mode changed
        if (preferences.darkMode !== undefined) {
          document.body.classList.toggle("dark-theme", preferences.darkMode);
        }
        
        notifications.success('Preferences saved successfully');
        return true;
      } else {
        throw new Error(data.message || 'Failed to save preferences');
      }
    } catch (error) {
      console.error('Error saving preferences:', error);
      notifications.error(error.message || 'Failed to save preferences');
      return false;
    }
  }

  // Helper method to check API response
  async checkResponse(response, errorMessage) {
    if (!response.ok) {
      let errorDetail = errorMessage
      try {
        const errorData = await response.json()
        errorDetail = errorData.message || errorData.error || errorMessage
      } catch (e) {
        // If parsing failed, use the default message
      }
      throw new Error(errorDetail)
    }
    return await response.json()
  }

  // Debug helper method for API calls
  async fetchWithLogging(url, options, operationName = 'API call') {
    console.log(`${operationName} - Request:`, { 
      url, 
      method: options.method,
      headers: options.headers,
      bodyPreview: options.body ? (options.body.length > 100 ? options.body.substring(0, 100) + '...' : options.body) : null
    })
    
    try {
      const startTime = Date.now()
      const response = await fetch(url, options)
      const endTime = Date.now()
      
      console.log(`${operationName} - Response:`, {
        status: response.status,
        statusText: response.statusText,
        time: `${endTime - startTime}ms`
      })
      
      // Clone the response so we can read the body
      const clonedResponse = response.clone()
      
      // Try to parse JSON response for logging
      try {
        const data = await clonedResponse.json()
        console.log(`${operationName} - Response data:`, data)
      } catch (e) {
        console.log(`${operationName} - Non-JSON response`)
      }
      
      return response
    } catch (error) {
      console.error(`${operationName} - Error:`, error)
      throw error
    }
  }

  async updateProfile(formData) {
    try {
        console.log('Updating profile with data:', formData);
        
        // Get values from form
        const name = formData.get('username');
        if (!name) {
            throw new Error('Username is required');
        }

        // Get current image position and scale from the image state
        const imagePositionX = this.imageState.positionX;
        const imagePositionY = this.imageState.positionY;
        const imageScale = this.imageState.scale;

        console.log('Current image state:', {
            positionX: imagePositionX,
            positionY: imagePositionY,
            scale: imageScale
        });

        // Build profile data
        const profileData = {
            name,
            image_position_x: imagePositionX,
            image_position_y: imagePositionY,
            image_scale: imageScale
        };

        console.log('Sending profile update with data:', profileData);

        const response = await fetchWithTokenRefresh('student/profile', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(profileData)
        });

        const data = await response.json();
      
        if (data.success) {
            // Update local storage with new profile data
            const userData = JSON.parse(localStorage.getItem('userData') || '{}');
            Object.assign(userData, {
                name: profileData.name,
                image_position_x: profileData.image_position_x,
                image_position_y: profileData.image_position_y,
                image_scale: profileData.image_scale
            });
            localStorage.setItem('userData', JSON.stringify(userData));

            // Update UI
            this.updateUserInterface(userData);

            // Store the image styles
            this.storeImageStyles(
                profileData.image_position_x,
                profileData.image_position_y,
                profileData.image_scale
            );

            notifications.success('Profile updated successfully');
            return true;
        } else {
            throw new Error(data.message || 'Failed to update profile');
        }
    } catch (error) {
        console.error('Error updating profile:', error);
        notifications.error(error.message || 'Failed to update profile');
        return false;
    }
  }

  // Add these new methods for image adjustment functionality
  initImageControls() {
    if (!this.profilePicture) return;
    
    // Get zoom control buttons
    const zoomIn = document.querySelector('.zoom-in');
    const zoomOut = document.querySelector('.zoom-out');
    const zoomReset = document.querySelector('.zoom-reset');
    const adjustBtn = document.getElementById('adjustPositionBtn');
    
    // Define zoom limits
    this.ZOOM_MIN = 1.0;   // Minimum zoom level (100%) - same as reset
    this.ZOOM_MAX = 2.0;   // Maximum zoom level (200%)
    this.ZOOM_STEP = 0.15; // Zoom step increment (15%)
    
    // Direct event binding for better reliability
    if (zoomIn) {
      zoomIn.addEventListener('click', () => {
        console.log("Zoom in button clicked");
        this.adjustZoom(this.ZOOM_STEP);
      });
    }
    
    if (zoomOut) {
      zoomOut.addEventListener('click', () => {
        console.log("Zoom out button clicked");
        this.adjustZoom(-this.ZOOM_STEP);
      });
    }
    
    if (zoomReset) {
      zoomReset.addEventListener('click', () => {
        console.log("Zoom reset button clicked");
        this.resetImagePosition();
        this.debounceSavePosition(500);
      });
    }
    
    if (adjustBtn) {
      adjustBtn.addEventListener('click', () => {
        console.log("Adjust position button clicked");
        this.enterAdjustMode();
      });
    }
    
    console.log('Image controls initialized and events attached');
  }

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
      this.imageState.scale = newScale;
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
      console.log("Cannot enter adjust mode - conditions not met");
      return;
    }
    
    console.log("Entering adjust mode");
    
    // Prevent multiple actions
    this.isProcessingAction = true;
    
    try {
      // Make the image draggable
      this.profilePicture.style.cursor = 'move';
      this.profilePicture.style.pointerEvents = 'auto';
      
      const pictureContainer = this.profilePicture.closest('.picture-container');
      if (pictureContainer) {
        pictureContainer.style.cursor = 'move';
        pictureContainer.classList.add('positioning-active');
        
        // Remove any existing click handlers
        pictureContainer.onclick = null;
        pictureContainer.ondblclick = null;
      }
      
      // Add visual cue that the image is active
      this.profilePicture.classList.add('positioning-active');
      
      // Mark as being in positioning mode
      this.isPositioningMode = true;
      
      // Setup drag handlers
      this.startDrag = (e) => {
        if (!this.isPositioningMode) return;
        
        e.preventDefault();
        e.stopPropagation();
        
        this.imageState.isDragging = true;
        this.imageState.startPositionX = this.imageState.positionX;
        this.imageState.startPositionY = this.imageState.positionY;
        
        if (e.type === 'mousedown') {
          this.imageState.startX = e.clientX;
          this.imageState.startY = e.clientY;
        } else if (e.type === 'touchstart') {
          this.imageState.startX = e.touches[0].clientX;
          this.imageState.startY = e.touches[0].clientY;
        }
        
        this.profilePicture.classList.add('dragging');
      };
      
      this.drag = (e) => {
        if (!this.isPositioningMode || !this.imageState.isDragging) return;
        
        e.preventDefault();
        e.stopPropagation();
        
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
        
        const deltaX = currentX - this.imageState.startX;
        const deltaY = currentY - this.imageState.startY;
        
        const maxOffset = 50;
        this.imageState.positionX = Math.max(Math.min(this.imageState.startPositionX + deltaX, maxOffset), -maxOffset);
        this.imageState.positionY = Math.max(Math.min(this.imageState.startPositionY + deltaY, maxOffset), -maxOffset);
        
        this.applyImageStyles();
      };
      
      this.endDrag = (e) => {
        if (!this.isPositioningMode || !this.imageState.isDragging) return;
        
        e.preventDefault();
        e.stopPropagation();
        
        this.imageState.isDragging = false;
        this.profilePicture.classList.remove('dragging');
        this.debounceSavePosition();
      };
      
      // Remove any existing event listeners first
      this.profilePicture.removeEventListener('mousedown', this.startDrag);
      window.removeEventListener('mousemove', this.drag);
      window.removeEventListener('mouseup', this.endDrag);
      this.profilePicture.removeEventListener('touchstart', this.startDrag);
      window.removeEventListener('touchmove', this.drag);
      window.removeEventListener('touchend', this.endDrag);
      
      // Add event listeners
      this.profilePicture.addEventListener('mousedown', this.startDrag);
      window.addEventListener('mousemove', this.drag);
      window.addEventListener('mouseup', this.endDrag);
      
      // Add touch events
      this.profilePicture.addEventListener('touchstart', this.startDrag);
      window.addEventListener('touchmove', this.drag);
      window.addEventListener('touchend', this.endDrag);
      
      // Add wheel zoom
      this.wheelZoom = (e) => {
        if (!this.isPositioningMode) return;
        
        e.preventDefault();
        e.stopPropagation();
        
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        this.adjustZoom(delta);
        return false;
      };
      
      this.profilePicture.addEventListener('wheel', this.wheelZoom);
      
      // Prevent click events from bubbling up when in positioning mode
      this.profilePicture.addEventListener('click', (e) => {
        if (this.isPositioningMode) {
          e.preventDefault();
          e.stopPropagation();
        }
      });
      
      // Add click handler to document to detect outside clicks
      document.addEventListener('click', this._handleDocumentClick = (e) => {
        if (!this.profilePicture.contains(e.target) && 
            !e.target.closest('.zoom-controls')) {
          this.saveAndExitPositioningMode();
        }
      });
      
      notifications.success('Edit mode activated. Drag to position and use scroll wheel to zoom. Click elsewhere when done.');
    } catch(error) {
      console.error("Error in enterAdjustMode:", error);
      this.isPositioningMode = false;
      notifications.error("Could not enter edit mode");
    } finally {
      setTimeout(() => {
        this.isProcessingAction = false;
      }, 300);
    }
  }

  saveAndExitPositioningMode() {
    console.log("Exiting positioning mode");
    
    if (this._handleDocumentClick) {
      document.removeEventListener('click', this._handleDocumentClick);
      this._handleDocumentClick = null;
    }
    
    this.debounceSavePosition(0);
    
    if (this.profilePicture) {
      this.profilePicture.style.cursor = 'default';
      this.profilePicture.style.pointerEvents = 'none';
      this.profilePicture.classList.remove('dragging');
      this.profilePicture.classList.remove('positioning-active');
      
      // Remove event listeners
      this.profilePicture.removeEventListener('mousedown', this.startDrag);
      this.profilePicture.removeEventListener('touchstart', this.startDrag);
      this.profilePicture.removeEventListener('wheel', this.wheelZoom);
    }
    
    const pictureContainer = this.profilePicture?.closest('.picture-container');
    if (pictureContainer) {
      pictureContainer.style.cursor = 'default';
      pictureContainer.classList.remove('positioning-active');
    }
    
    window.removeEventListener('mousemove', this.drag);
    window.removeEventListener('mouseup', this.endDrag);
    window.removeEventListener('touchmove', this.drag);
    window.removeEventListener('touchend', this.endDrag);
    
    this.isPositioningMode = false;
    this.imageState.isDragging = false;
  }

  resetImagePosition() {
    console.log("Resetting image position and scale");
    
    this.imageState.positionX = 0;
    this.imageState.positionY = 0;
    this.imageState.scale = 1;
    
    this.applyImageStyles();
    
    if (this.isPositioningMode) {
      this.saveAndExitPositioningMode();
    } else {
      this.storeImageStyles(0, 0, 1);
      this.saveImagePosition();
    }
    
    notifications.success("Image position reset successfully");
  }

  applyImageStyles() {
    if (!this.profilePicture) return;
    
    const objectPositionX = Math.round(this.imageState.positionX);
    const objectPositionY = Math.round(this.imageState.positionY);
    this.profilePicture.style.objectPosition = `${objectPositionX}px ${objectPositionY}px`;
    
    const scale = Math.round(this.imageState.scale * 100) / 100;
    const transform = `scale3d(${scale}, ${scale}, 1) translateZ(0)`;
    this.profilePicture.style.setProperty('transform', transform, 'important');
    
    this.profilePicture.style.setProperty('image-rendering', 'high-quality', 'important');
    this.profilePicture.style.setProperty('backface-visibility', 'hidden', 'important');
    this.profilePicture.style.setProperty('transform-style', 'preserve-3d', 'important');
    
    this.storeImageStyles(objectPositionX, objectPositionY, scale);
    
    const pictureContainer = this.profilePicture.closest('.picture-container');
    if (pictureContainer) {
      pictureContainer.classList.add('loaded');
    }
  }

  storeImageStyles(posX, posY, scale) {
    try {
      const preciseX = this.imageState.positionX;
      const preciseY = this.imageState.positionY;
      const preciseScale = this.imageState.scale;
      
      localStorage.setItem('studentImagePositionX', preciseX);
      localStorage.setItem('studentImagePositionY', preciseY);
      localStorage.setItem('studentImageScale', preciseScale);
      
      let styleEl = document.getElementById('early-load-styles');
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'early-load-styles';
        document.head.appendChild(styleEl);
      }
      
      styleEl.textContent = `
        #profilePicture {
          object-position: ${posX}px ${posY}px !important;
          transform: scale(${scale}) translateZ(0) !important;
          opacity: 1 !important;
          image-rendering: high-quality !important;
        }
      `;
    } catch (e) {
      console.error('Error storing image styles:', e);
    }
  }

  debounceSavePosition(delay = 300) {
    if (this.savePositionTimer) {
      clearTimeout(this.savePositionTimer);
    }
    
    this.savePositionTimer = setTimeout(() => {
      this.saveImagePosition();
    }, delay);
  }

  async saveImagePosition() {
    if (!this.profilePicture) return;
    
    try {
      const posX = this.imageState.positionX;
      const posY = this.imageState.positionY;
      const scale = this.imageState.scale;
      
      // Get current user data to preserve the name
      const userData = JSON.parse(localStorage.getItem('userData') || '{}');
      
      const response = await fetchWithTokenRefresh('student/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: userData.name, // Include current name to avoid validation error
          image_position_x: posX,
          image_position_y: posY,
          image_scale: scale
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        console.log("Image position saved successfully");
        
        // Update localStorage with new position data
        if (data.profile) {
          const updatedUserData = {
            ...userData,
            image_position_x: data.profile.image_position_x,
            image_position_y: data.profile.image_position_y,
            image_scale: data.profile.image_scale
          };
          localStorage.setItem('userData', JSON.stringify(updatedUserData));
        }
      } else {
        console.warn("Failed to save image position to server");
        notifications.error(data.message || 'Failed to save image position');
      }
    } catch (error) {
      console.error("Error saving image position:", error);
      notifications.error('Failed to save image position');
    }
  }

  // Helper method to store session data
  storeSessionData() {
    try {
      const userData = auth.getCurrentUser();
      if (userData) {
        // Store in localStorage with longer expiry
        localStorage.setItem('userData', JSON.stringify(userData));
        console.log('Session data stored successfully');
      }
    } catch (error) {
      console.error('Error storing session data:', error);
    }
  }

  // Helper method to setup token refresh
  setupTokenRefresh() {
    // Set up periodic token refresh (every 30 minutes)
    setInterval(async () => {
      try {
        await auth.refreshToken();
        console.log('Token refreshed successfully');
      } catch (error) {
        console.error('Token refresh failed:', error);
      }
    }, 30 * 60 * 1000); // 30 minutes
  }
}

// Initialize the settings manager
const settings = new SettingsManager()
