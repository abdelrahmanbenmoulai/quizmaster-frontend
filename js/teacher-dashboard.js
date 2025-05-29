import API_CONFIG from './config.js';
import auth, { fetchWithTokenRefresh } from './utils/auth.js';
import roleGuard from './utils/role-guard.js';

class TeacherDashboard {
  constructor() {
    this.init()
    this.setupEventListeners()
    this.initialize()
  }

  init() {
    this.sidebar = document.querySelector(".sidebar")
    this.menuToggle = document.querySelector(".menu-toggle")
    this.logoutButton = document.querySelector(".logout-btn")
    this.teacherName = document.querySelector(".teacher-name")
    this.teacherAvatar = document.getElementById("teacherProfileAvatar") || document.querySelector(".teacher-avatar")
    this.activityList = document.querySelector(".activity-list")
    this.counters = document.querySelectorAll("[data-counter]")
    this.welcomeSection = document.querySelector(".welcome-section")
    this.analyticsSection = document.querySelector(".analytics-section")
    
    console.log('Teacher Dashboard - init() - Avatar element found:', !!this.teacherAvatar);
    
    // Apply initial styles from localStorage to prevent flashing on refresh
    this.applyInitialImageStyles();
    
    if (this.teacherAvatar) {
      console.log('Teacher Dashboard - init() - Initial avatar src:', this.teacherAvatar.src);
      
      // Add error handling for avatar
      this.teacherAvatar.onerror = (e) => {
        console.log('Teacher Dashboard - Avatar failed to load:', e);
        // Use profile-placeholder.svg as fallback
        this.teacherAvatar.src = '/quizmaster/frontend/images/profile-placeholder.svg';
        // Still need to show the image even if using placeholder
        setTimeout(() => {
          this.teacherAvatar.classList.add('loaded');
          const profileContainer = this.teacherAvatar.closest('.teacher-profile');
          if (profileContainer) profileContainer.classList.add('loaded');
        }, 100);
      };
    }
    
    // Check if there's a stored avatar in localStorage
    let storedAvatar = localStorage.getItem('teacherAvatar');
    console.log('Teacher Dashboard - init() - Stored avatar in localStorage:', storedAvatar);
    
    // Clear cached avatar if it's the problematic default.png
    if (storedAvatar && (storedAvatar.includes('default.png') || !storedAvatar.includes('/'))) {
      console.log('Teacher Dashboard - init() - Clearing invalid stored avatar path');
      localStorage.removeItem('teacherAvatar');
      // Set to the correct placeholder
      this.loadTeacherAvatar('profile-placeholder.svg');
    }
    
    if (storedAvatar && this.teacherAvatar) {
      // Make sure the path is absolute and includes the base path
      let avatarSrc = storedAvatar;
      
      // Ensure the path is absolute
      if (!avatarSrc.startsWith('/')) {
        avatarSrc = '/' + avatarSrc;
      }
      
      // Ensure the path includes the base path
      if (!avatarSrc.startsWith('/quizmaster/')) {
        avatarSrc = '/quizmaster' + avatarSrc;
      }
      
      this.teacherAvatar.src = avatarSrc;
      console.log('Using avatar from localStorage with absolute path:', this.teacherAvatar.src);
      
      // Force image reload to ensure it's displayed
      this.teacherAvatar.onload = () => {
        console.log('Teacher Dashboard - Avatar loaded successfully from localStorage');
        // Apply stored styles as soon as image loads
        this.applyInitialImageStyles(); 
      };
      this.teacherAvatar.onerror = (e) => {
        console.error('Teacher Dashboard - Avatar failed to load from localStorage:', e);
        this.teacherAvatar.src = '/quizmaster/frontend/images/profile-placeholder.svg';
        // Still need to show the image even if using placeholder
        setTimeout(() => {
          this.teacherAvatar.classList.add('loaded');
          const profileContainer = this.teacherAvatar.closest('.teacher-profile');
          if (profileContainer) profileContainer.classList.add('loaded');
        }, 100);
      };
    }

    // Initialize counters
    this.initializeCounters()
  }

  initializeCounters() {
    this.counters = {
      students: document.querySelector("[data-counter='students']"),
      successRate: document.querySelector("[data-counter='success-rate']"),
      engagement: document.querySelector("[data-counter='engagement']")
    }
  }

  setupEventListeners() {
    // Mobile menu toggle
    this.menuToggle.addEventListener("click", () => {
      this.sidebar.classList.toggle("active")
    })

    // Close sidebar when clicking outside
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".sidebar") && !e.target.closest(".menu-toggle")) {
        this.sidebar.classList.remove("active")
      }
    })

    // Add logout handler
    if (this.logoutButton) {
      this.logoutButton.addEventListener("click", () => this.handleLogout())
    }
  }
  
  async initialize() {
    console.log('Teacher Dashboard - Initializing');
    
    // Check if we're already on the login page
    if (window.location.pathname.includes('login.html')) {
      console.log('Teacher Dashboard - Already on login page');
      return;
    }

    try {
      // First check if user is logged in and has correct role
      const token = auth.getToken();
      if (!token) {
        console.log('Teacher Dashboard - No token found, redirecting to login');
        auth.logout(true);
        return;
      }

      const tokenData = auth.parseToken(token);
      if (!tokenData || tokenData.role !== 'teacher') {
        console.log('Teacher Dashboard - User is not a teacher, logging out');
        auth.logout(true);
        return;
      }

      // Initialize role guard
      const accessGranted = await roleGuard.initialize('teacher');
      console.log('Teacher Dashboard - Role guard check result:', accessGranted);
      
      if (!accessGranted) {
        console.log('Teacher Dashboard - Access denied, role guard will handle redirect');
        return;
      }

      // Get user data
      const userData = auth.getCurrentUser();
      console.log('Teacher Dashboard - User data:', userData);
      
      if (!userData) {
        console.log('Teacher Dashboard - No user data found');
        auth.logout(true);
        return;
      }

      // Load dashboard data
      console.log('Teacher Dashboard - Loading data');
      await this.loadDashboardData();
      
    } catch (error) {
      console.error('Teacher Dashboard - Initialization error:', error);
      this.showError("Failed to initialize dashboard: " + error.message);
    }
  }

  async loadDashboardData() {
    try {
      console.log('Teacher Dashboard - Starting to load dashboard data');
      
      // Get dashboard data which includes profile, analytics, and recent activity
      console.log('Teacher Dashboard - Fetching dashboard data from:', API_CONFIG.ENDPOINTS.TEACHER.DASHBOARD);
      const dashboardResponse = await fetchWithTokenRefresh(API_CONFIG.ENDPOINTS.TEACHER.DASHBOARD, {
        method: 'GET'
      });
      
      console.log('Teacher Dashboard - Dashboard response status:', dashboardResponse.status);
      
      if (!dashboardResponse.ok) {
        const errorData = await dashboardResponse.json().catch(() => ({}));
        console.error('Teacher Dashboard - Dashboard fetch failed:', errorData);
        throw new Error(errorData.error || 'Failed to fetch dashboard data');
      }
      
      const dashboardData = await dashboardResponse.json();
      console.log('Teacher Dashboard - Dashboard data received:', dashboardData);

      if (dashboardData.success) {
        // Update welcome section with profile data
        if (dashboardData.data?.profile) {
          this.updateWelcomeSection(dashboardData.data.profile);
        }
        
        // Update analytics section with statistics
        this.updateAnalyticsSection(dashboardData.data);
        
        // Update recent activity
        if (dashboardData.data?.recent_activity) {
          this.updateRecentActivity(dashboardData.data.recent_activity);
        }
        
        console.log('Teacher Dashboard - All data loaded successfully');
      } else {
        throw new Error(dashboardData.error || 'Failed to load dashboard data');
      }
    } catch (error) {
      console.error("Teacher Dashboard - Error loading dashboard data:", error);
      this.showError("Failed to load dashboard data: " + error.message);
    }
  }
  
  // Helper method to process and set avatar path
  processAvatarPath(avatarPath) {
    console.log('Teacher Dashboard - Processing avatar path:', avatarPath);
    
    // If no avatar path provided, return placeholder
    if (!avatarPath) {
      return '/quizmaster/frontend/images/profile-placeholder.svg';
    }

    // If it's the default placeholder image, return with full path
    if (avatarPath.includes('profile-placeholder.svg')) {
      return '/quizmaster/frontend/images/profile-placeholder.svg';
    }

    // If it's already an absolute URL, return as is
    if (avatarPath.startsWith('http://') || avatarPath.startsWith('https://')) {
      return avatarPath;
    }

    // Handle backend paths
    if (avatarPath.startsWith('backend/')) {
      return '/quizmaster/' + avatarPath;
    }

    // Handle uploads paths directly
    if (avatarPath.startsWith('uploads/')) {
      return '/quizmaster/backend/' + avatarPath;
    }

    // Handle absolute paths
    if (avatarPath.startsWith('/')) {
      if (!avatarPath.startsWith('/quizmaster/')) {
        return '/quizmaster' + avatarPath;
      }
      return avatarPath;
    }

    // Handle frontend paths
    if (avatarPath.startsWith('frontend/')) {
      return '/quizmaster/' + avatarPath;
    }

    // Default case - assume it's in frontend/images
    return '/quizmaster/frontend/images/' + avatarPath;
  }

  // Apply image position and scale to the avatar
  applyImagePosition(positionX, positionY, scale) {
    if (!this.teacherAvatar) return;
    try {
      console.log('Teacher Dashboard - Raw position values:', { positionX, positionY, scale });
      
      // Parse and validate position values
      let posX = parseFloat(positionX);
      let posY = parseFloat(positionY);
      let scaleVal = parseFloat(scale);
      
      // Handle invalid or missing values
      if (isNaN(posX)) posX = 0;
      if (isNaN(posY)) posY = 0;
      if (isNaN(scaleVal) || scaleVal === 0) scaleVal = 1.0;
      
      // Visual enhancement: Apply a slight zoom-in effect ONLY for dashboard display
      // Original scale is preserved in localStorage and database
      const displayScale = scaleVal * 1.15; // 15% zoom enhancement
      
      console.log('Teacher Dashboard - Using enhanced display scale:', {
        posX,
        posY,
        originalScale: scaleVal,
        enhancedScale: displayScale
      });
      
      // Store original values in localStorage (not the enhanced ones)
      this.storeInitialImageStyles(posX, posY, scaleVal);
      
      // Apply EXACT same styling as settings page but with enhanced scale
      this.teacherAvatar.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
        object-position: ${posX}px ${posY}px;
        transform: scale(${displayScale});
        transform-origin: center center;
        will-change: transform;
        image-rendering: high-quality;
        backface-visibility: hidden;
        transform-style: preserve-3d;
      `;
      
      // Mark the image as loaded to reveal it with transition
      setTimeout(() => {
        if (this.teacherAvatar) {
          this.teacherAvatar.classList.add('loaded');
          const profileContainer = this.teacherAvatar.closest('.teacher-profile');
          if (profileContainer) {
            profileContainer.classList.add('loaded');
          }
        }
      }, 100);
      
      console.log(`Teacher Dashboard - Applied enhanced image: object-position: ${posX}px ${posY}px, scale(${displayScale}) [original: ${scaleVal}]`);
    } catch (e) {
      console.error('Teacher Dashboard - Error applying image position:', e);
      // Apply default centered position on error with slight zoom enhancement
      this.teacherAvatar.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
        object-position: center center;
        transform: scale(1.15);
        transform-origin: center center;
        will-change: transform;
        image-rendering: high-quality;
        backface-visibility: hidden;
      `;
      
      // Still show the image even on error
      setTimeout(() => {
        if (this.teacherAvatar) {
          this.teacherAvatar.classList.add('loaded');
          const profileContainer = this.teacherAvatar.closest('.teacher-profile');
          if (profileContainer) {
            profileContainer.classList.add('loaded');
          }
        }
      }, 100);
    }
  }
  
  // Store initial image styles to prevent flashing during refresh
  storeInitialImageStyles(posX, posY, scale) {
    try {
      // Store original values in localStorage (not the enhanced ones)
      localStorage.setItem('teacherImagePositionX', posX);
      localStorage.setItem('teacherImagePositionY', posY);
      localStorage.setItem('teacherImageScale', scale);
      
      // Create or update an inline style element for early load styling
      let styleEl = document.getElementById('early-load-styles');
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'early-load-styles';
        document.head.appendChild(styleEl);
      }
      
      // Apply zoom enhancement for dashboard only
      const displayScale = scale * 1.15;
      
      // Add CSS rule that will be applied before JavaScript fully loads
      // Use same approach as settings page but with zoom enhancement
      styleEl.textContent = `
        .teacher-avatar {
          position: absolute !important;
          top: 0 !important;
          left: 0 !important;
          width: 100% !important;
          height: 100% !important;
          object-fit: cover !important;
          object-position: ${posX}px ${posY}px !important;
          transform: scale(${displayScale}) !important;
          transform-origin: center center !important;
          will-change: transform !important;
          image-rendering: high-quality !important;
          backface-visibility: hidden !important;
          transform-style: preserve-3d !important;
        }
      `;
      
      console.log('Teacher Dashboard - Stored initial image styles for next page load', {
        originalScale: scale,
        displayScale: displayScale
      });
    } catch (e) {
      console.error('Teacher Dashboard - Error storing initial styles:', e);
    }
  }

  updateStatistics(stats) {
    // Update counter values
    this.counters.forEach(counter => {
      const type = counter.dataset.counter;
      let value = 0;
      let trend = '';

      switch (type) {
        case 'students':
          value = stats.total_students || 0;
          trend = stats.total_students ? `${stats.total_students} active student${stats.total_students !== 1 ? 's' : ''}` : 'No students yet';
          break;
        case 'success-rate':
          value = `${Math.round(stats.success_rate || 0)}%`;
          trend = (stats.success_rate || 0) > 80 ? 'Excellent performance!' : 'Room for improvement';
          break;
        case 'engagement':
          value = `${Math.round(stats.engagement_rate || 0)}%`;
          trend = (stats.engagement_rate || 0) > 70 ? 'High engagement' : 'Moderate engagement';
          break;
      }

      counter.textContent = value;
      const trendElement = counter.closest('.analytics-card').querySelector('.trend');
      if (trendElement) {
        trendElement.textContent = trend;
        trendElement.classList.toggle('positive', 
          (type === 'success-rate' && (stats.success_rate || 0) > 80) || 
          (type === 'engagement' && (stats.engagement_rate || 0) > 70)
        );
      }
    });
  }

  updateRecentActivity(activities) {
    if (!this.activityList) return;

    if (!activities || activities.length === 0) {
      this.activityList.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-info-circle"></i>
          <p>No recent activity to display</p>
        </div>
      `;
      return;
    }

    this.activityList.innerHTML = activities.map(activity => {
      // Get the proper avatar path
      const avatarPath = activity.student_avatar ? this.getAvatarPath(activity.student_avatar) : '/quizmaster/frontend/images/profile-placeholder.svg';
      
      // Format success rate to be more user friendly
      const successRateDisplay = activity.success_rate > 0 
        ? `<i class="fas fa-chart-line"></i> ${activity.success_rate}% success rate`
        : '';
      
      return `
        <div class="activity-item">
          <div class="activity-icon ${activity.is_correct ? 'success' : 'error'}">
            <i class="fas fa-${activity.is_correct ? 'check' : 'times'}"></i>
          </div>
          <div class="activity-details">
            <div class="student-info">
              <img src="${avatarPath}" 
                   alt="${this.escapeHtml(activity.student_name)}"
                   onerror="this.src='/quizmaster/frontend/images/profile-placeholder.svg'">
              <span class="student-name">${this.escapeHtml(activity.student_name)}</span>
            </div>
            <div class="activity-content">
              <p class="activity-description">
                ${activity.is_correct ? 'Correctly answered' : 'Attempted'} 
                <strong>${this.escapeHtml(activity.quiz_title)}</strong>
                ${activity.subject_name ? `in <span class="subject-name">${this.escapeHtml(activity.subject_name)}</span>` : ''}
              </p>
              <div class="activity-meta">
                <span class="activity-time">
                  <i class="far fa-clock"></i> 
                  ${this.formatTimeAgo(new Date(activity.start_time))}
                </span>
                ${successRateDisplay ? `<span class="activity-score">${successRateDisplay}</span>` : ''}
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Add CSS styles for the updated layout
    const styleEl = document.createElement('style');
    styleEl.textContent = `
      .activity-list {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        padding: 1rem;
      }
      
      .activity-item {
        display: flex;
        align-items: flex-start;
        gap: 1rem;
        padding: 1rem;
        background: #fff;
        border-radius: 8px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.05);
        transition: transform 0.2s ease, box-shadow 0.2s ease;
      }
      
      .activity-item:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 8px rgba(0,0,0,0.1);
      }
      
      .activity-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 40px;
        height: 40px;
        border-radius: 50%;
        flex-shrink: 0;
      }
      
      .activity-icon.success {
        background: #e8f5e9;
        color: #4caf50;
      }
      
      .activity-icon.error {
        background: #ffebee;
        color: #f44336;
      }
      
      .activity-details {
        flex: 1;
      }
      
      .student-info {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        margin-bottom: 0.5rem;
      }
      
      .student-info img {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        object-fit: cover;
      }
      
      .student-name {
        font-weight: 600;
        color: #2c3e50;
      }
      
      .activity-content {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }
      
      .activity-description {
        color: #4a5568;
        margin: 0;
      }
      
      .subject-name {
        color: #6366f1;
        font-weight: 500;
      }
      
      .activity-meta {
        display: flex;
        align-items: center;
        gap: 1rem;
        color: #718096;
        font-size: 0.875rem;
      }
      
      .activity-time, .activity-score {
        display: flex;
        align-items: center;
        gap: 0.25rem;
      }
      
      .activity-score i {
        color: #6366f1;
      }
      
      .empty-state {
        text-align: center;
        padding: 2rem;
        color: #718096;
      }
      
      .empty-state i {
        font-size: 2rem;
        margin-bottom: 1rem;
      }
    `;
    
    // Remove any existing style element with this ID
    const existingStyle = document.getElementById('activity-list-styles');
    if (existingStyle) {
      existingStyle.remove();
    }
    
    // Add ID to new style element and append to document
    styleEl.id = 'activity-list-styles';
    document.head.appendChild(styleEl);
  }

  getAvatarPath(avatar) {
    if (!avatar || avatar === 'default.png') {
      return '/quizmaster/frontend/images/profile-placeholder.svg';
    }
    
    // If it's already the placeholder image path, return it with proper prefix
    if (avatar === 'images/profile-placeholder.svg') {
      return '/quizmaster/frontend/' + avatar;
    }
    
    // Remove any duplicate 'backend/' prefixes
    avatar = avatar.replace(/^backend\/backend\//, 'backend/');
    
    // Handle paths that start with uploads/ or backend/uploads/ specially
    if (avatar.includes('uploads/profile_pictures/') || avatar.includes('uploads/profile_images/')) {
      // If it already has backend/ prefix, don't add it again
      if (avatar.startsWith('backend/')) {
        return `/quizmaster/${avatar}`;
      }
      return `/quizmaster/backend/${avatar}`;
    }
    
    return avatar.startsWith('http') ? avatar : `/quizmaster/${avatar}`;
  }

  updateWelcomeSection(profileData) {
    if (!this.welcomeSection) return;

    // Update teacher name with "Dr." prefix
    if (profileData.name && this.teacherName) {
      this.teacherName.textContent = `Dr. ${profileData.name}`;
    }

    // Update avatar with position and scale
    if (this.teacherAvatar) {
      console.log('Teacher Dashboard - Profile data for image:', {
        avatar: profileData.avatar,
        positionX: profileData.image_position_x,
        positionY: profileData.image_position_y,
        scale: profileData.image_scale
      });
      
      // Process the avatar path
      const processedPath = this.processAvatarPath(profileData.avatar);
      console.log('Teacher Dashboard - Processed avatar path:', processedPath);
      
      // Set the avatar path
      this.teacherAvatar.src = processedPath;
      
      // Store in localStorage for future use - but don't store placeholders
      if (!processedPath.includes('profile-placeholder.svg')) {
        localStorage.setItem('teacherAvatar', processedPath);
      }
      
      // Get position and scale values from profile data with fallbacks
      const positionX = profileData.image_position_x !== undefined ? parseFloat(profileData.image_position_x) : 0;
      const positionY = profileData.image_position_y !== undefined ? parseFloat(profileData.image_position_y) : 0;
      const scale = profileData.image_scale !== undefined ? parseFloat(profileData.image_scale) : 1;
      
      console.log('Teacher Dashboard - Applying image position from profile API data:', {
        positionX,
        positionY,
        scale
      });
      
      // Apply position and scale
      this.applyImagePosition(positionX, positionY, scale);
      
      // Add loaded class to show the image
      setTimeout(() => {
        this.teacherAvatar.classList.add('loaded');
        const profileContainer = this.teacherAvatar.closest('.teacher-profile');
        if (profileContainer) profileContainer.classList.add('loaded');
      }, 100);
    }
  }

  updateAnalyticsSection(analyticsData) {
    // Update students counter
    if (this.counters.students) {
      // Get total_students directly from the statistics object
      const totalStudents = analyticsData.statistics?.total_students || 0;
      this.counters.students.textContent = totalStudents;
      
      // Update the trend with more descriptive text based on the actual count
      const trendElement = this.counters.students.closest('.analytics-card').querySelector('.trend');
      if (trendElement) {
        if (totalStudents === 0) {
          trendElement.textContent = "No students yet";
          trendElement.classList.remove('positive');
        } else if (totalStudents === 1) {
          trendElement.textContent = "1 student in your class";
          trendElement.classList.add('positive');
        } else {
          trendElement.textContent = `${totalStudents} students in your class`;
          trendElement.classList.add('positive');
        }
      }
    }

    // Update success rate counter
    if (this.counters.successRate) {
      const successRate = analyticsData.statistics?.success_rate || 0;
      this.counters.successRate.textContent = `${Math.round(successRate)}%`;
      this.updateCounterTrend(this.counters.successRate, successRate, 'success-rate');
    }

    // Update engagement counter - Use completion_rate if available, otherwise calculate
    if (this.counters.engagement) {
      // Check if completion_rate is provided by the API (new method)
      const completionRate = analyticsData.statistics?.completion_rate;
      
      // If completion_rate is available, use it directly
      let engagementRate;
      if (completionRate !== undefined) {
        engagementRate = completionRate;
      } else {
        // Otherwise fall back to previous calculation method
        engagementRate = this.calculateEngagementRate(analyticsData);
      }
      
      this.counters.engagement.textContent = `${Math.round(engagementRate)}%`;
      this.updateCounterTrend(this.counters.engagement, engagementRate, 'engagement');
    }
  }

  calculateEngagementRate(analyticsData) {
    // Get total students from the statistics
    const totalStudents = analyticsData.statistics?.total_students || 0;
    
    // Get total attempts from statistics
    const totalAttempts = analyticsData.statistics?.total_attempts || 0;
    
    // If there are no students, engagement rate is 0
    if (totalStudents === 0) return 0;
    
    // If there are students and attempts, calculate a basic engagement rate
    // This considers students who have taken at least one quiz to be "engaged"
    // A better metric can be developed with more data points over time
    return totalAttempts > 0 ? Math.min(100, (totalAttempts / totalStudents) * 50) : 0;
  }

  updateCounterTrend(counter, value, type) {
    const trendElement = counter.closest('.analytics-card').querySelector('.trend');
    if (!trendElement) return;

    let trend = '';
    let isPositive = false;

    switch (type) {
      case 'students':
        trend = value > 0 ? `${value} active student${value !== 1 ? 's' : ''}` : 'No students yet';
        isPositive = value > 0;
        break;
      case 'success-rate':
        trend = value > 80 ? 'Excellent performance!' : 'Room for improvement';
        isPositive = value > 80;
        break;
      case 'engagement':
        trend = value > 70 ? 'High engagement' : 'Moderate engagement';
        isPositive = value > 70;
        break;
    }

    trendElement.textContent = trend;
    trendElement.classList.toggle('positive', isPositive);
  }

  formatTimeAgo(date) {
    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    const diffInHours = Math.floor(diffInMinutes / 60);
    const diffInDays = Math.floor(diffInHours / 24);

    if (diffInSeconds < 60) return 'just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    if (diffInHours < 24) return `${diffInHours}h ago`;
    return `${diffInDays}d ago`;
  }

  showError(message) {
    const error = document.createElement("div");
    error.className = "error-message";
    error.innerHTML = `
      <i class="fas fa-exclamation-circle"></i>
      <p>${message}</p>
    `;
    document.querySelector('.main-content').prepend(error);
    setTimeout(() => error.remove(), 5000);
  }

  async handleLogout() {
    try {
      // Use auth module's logout method
      auth.logout(true);
    } catch (error) {
      console.error("Logout failed:", error);
    }
  }

  // Display subject performance data
  // Display top performing students
  displayTopStudents(students) {
    const container = document.querySelector('.top-students');
    if (!container || !students || !students.length) return;
    
    container.innerHTML = '';
    
    // Create heading
    const heading = document.createElement('h3');
    heading.className = 'section-heading';
    heading.textContent = 'Top Performing Students';
    container.appendChild(heading);
    
    // Create list
    const list = document.createElement('div');
    list.className = 'student-list';
    
    students.forEach(student => {
      const studentItem = document.createElement('div');
      studentItem.className = 'student-item';
      
      // Get medal icon if applicable
      let medalIcon = '';
      if (student.medal) {
        const medalColor = student.medal;
        medalIcon = `<span class="medal ${medalColor}"><i class="fas fa-medal"></i></span>`;
      }
      
      // Prepare avatar
      const avatar = student.avatar 
        ? `/quizmaster${student.avatar.startsWith('/') ? '' : '/'}${student.avatar}` 
        : '/quizmaster/frontend/images/profile-placeholder.svg';
      
      studentItem.innerHTML = `
        <div class="student-avatar">
          <img src="${avatar}" alt="${this.escapeHtml(student.name)}" 
               onerror="this.src='/quizmaster/frontend/images/profile-placeholder.svg'">
          ${medalIcon}
        </div>
        <div class="student-info">
          <h4>${this.escapeHtml(student.name)}</h4>
          <p>
            <span class="stat">${student.quizzes_taken} quiz${student.quizzes_taken !== 1 ? 'zes' : ''}</span>
            <span class="stat">${student.success_rate}% success</span>
          </p>
        </div>
      `;
      
      list.appendChild(studentItem);
    });
    
    container.appendChild(list);
  }

  // Apply stored image styles on page load before API data is available
  applyInitialImageStyles() {
    if (!this.teacherAvatar) return;
    
    try {
      // Get stored position values - use position-based styling
      const posX = parseFloat(localStorage.getItem('teacherImagePositionX') || '0');
      const posY = parseFloat(localStorage.getItem('teacherImagePositionY') || '0');
      const scale = parseFloat(localStorage.getItem('teacherImageScale') || '1.0');
      
      // Apply dashboard-only visual enhancement (15% zoom)
      const displayScale = scale * 1.15;
      
      // Only apply if we have some valid values
      if (!isNaN(posX) && !isNaN(posY) && !isNaN(scale)) {
        console.log('Teacher Dashboard - Applying stored image styles with enhancement:', { 
          posX, 
          posY, 
          originalScale: scale,
          enhancedScale: displayScale 
        });
        
        // Apply stored styles immediately using the same styling as settings page but with zoom enhancement
        this.teacherAvatar.style.cssText = `
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: ${posX}px ${posY}px;
          transform: scale(${displayScale});
          transform-origin: center center;
          will-change: transform;
          image-rendering: high-quality;
          backface-visibility: hidden;
          transform-style: preserve-3d;
        `;
        
        // Mark the profile container as loaded after a short delay
        setTimeout(() => {
          if (this.teacherAvatar) {
            this.teacherAvatar.classList.add('loaded');
            const profileContainer = this.teacherAvatar.closest('.teacher-profile');
            if (profileContainer) profileContainer.classList.add('loaded');
          }
        }, 300);
      }
    } catch (e) {
      console.error('Teacher Dashboard - Error applying initial image styles:', e);
    }
  }

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  updateProfileImage(profileData) {
    console.log('Teacher Dashboard - Profile data for image:', {
      avatar: profileData.avatar,
      positionX: profileData.image_position_x,
      positionY: profileData.image_position_y,
      scale: profileData.image_scale
    });

    if (!this.teacherAvatar) {
      console.error('Teacher Dashboard - Avatar element not found');
      return;
    }

    // Get the avatar path
    let avatarPath = profileData.avatar || '/quizmaster/frontend/images/profile-placeholder.svg';
    
    // Process the avatar path
    const processedPath = this.processAvatarPath(avatarPath);
    
    // Set initial styles before loading the image
    this.teacherAvatar.style.cssText = `
      object-fit: cover;
      transform-origin: center center;
      will-change: transform;
      image-rendering: -webkit-optimize-contrast;
      backface-visibility: hidden;
      transform: translate(15%, -15%) scale(1.0) translateZ(0);
    `;
    
    // Set the avatar path
    this.teacherAvatar.src = processedPath;
    
    // Store in localStorage for future use - but don't store placeholders
    if (!processedPath.includes('profile-placeholder.svg')) {
      localStorage.setItem('teacherAvatar', processedPath);
    }
    
    // Add onload event to ensure image loaded properly
    this.teacherAvatar.onload = () => {
      console.log('Teacher Dashboard - Avatar loaded successfully:', processedPath);
      // Add loaded class to show the image
      this.teacherAvatar.classList.add('loaded');
      const profileContainer = this.teacherAvatar.closest('.teacher-profile');
      if (profileContainer) {
        profileContainer.classList.add('loaded');
      }
    };
    
    // Add onerror event for fallback
    this.teacherAvatar.onerror = (e) => {
      console.error('Teacher Dashboard - Avatar failed to load:', e);
      console.error('Teacher Dashboard - Failed path was:', processedPath);
      this.teacherAvatar.src = '/quizmaster/frontend/images/profile-placeholder.svg';
      // Still show the image even if using placeholder
      this.teacherAvatar.classList.add('loaded');
      const profileContainer = this.teacherAvatar.closest('.teacher-profile');
      if (profileContainer) {
        profileContainer.classList.add('loaded');
      }
    };

    // Get position and scale values from profile data with fallbacks
    const positionX = profileData.image_position_x ?? 0;
    const positionY = profileData.image_position_y ?? 0;
    const scale = profileData.image_scale ?? 1;

    this.applyImagePosition({
      positionX,
      positionY,
      scale
    });
  }
}

// Initialize dashboard when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  const dashboard = new TeacherDashboard();
});
