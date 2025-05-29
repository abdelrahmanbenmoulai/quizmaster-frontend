import API_CONFIG from './config.js';
import notifications from './utils/notifications.js';
import auth, { fetchWithTokenRefresh } from './utils/auth.js';
import webSocketService from './utils/websocket-service.js';

class LeaderboardManager {
  constructor() {
    // Initialize dark mode first
    this.initializeDarkMode();
    
    this.state = {
      itemsPerPage: 5,
      currentPage: 1,
      isLoading: false,
      userId: null,
      isSearchActive: false,
      previousRank: null,
      allLeaderboardItems: [],
      filteredItems: [],
      totalItems: 0
    };

    this.elements = {
      container: document.querySelector(".leaderboard-container"),
      leaderboardList: document.querySelector(".leaderboard-list"),
      pagination: document.querySelector(".pagination"),
      topPerformers: document.querySelector(".top-performers"),
      logoutButton: document.querySelector(".logout-btn"),
      menuToggle: document.querySelector(".menu-toggle"),
      sidebar: document.querySelector(".sidebar"),
      searchInput: document.getElementById("student-search"),
      searchButton: document.querySelector(".search-button")
    };

    this.init();
  }

  async init() {
    this.getUserIdFromToken();
    this.setupEventListeners();
    this.initializeAvatarStyles();
    
    if (localStorage.getItem('refreshDashboard') === 'true') {
      await this.updateCurrentUserAvatar();
      localStorage.removeItem('refreshDashboard');
    }
    
    // Get previous rank before loading new data
    this.retrievePreviousRank();
    await this.loadLeaderboardData();

    // Initialize WebSocket connection
    this.initializeWebSocket();
  }

  getUserIdFromToken() {
    const token = auth.getToken();
    if (!token) return;

    try {
      const payload = auth.parseToken(token);
      if (payload && payload.user_id) {
        this.state.userId = payload.user_id;
        console.log('Current user ID:', this.state.userId);
      }
      } catch (error) {
        console.error('Error extracting user ID from token:', error);
      }
  }

  retrievePreviousRank() {
    try {
      const rankData = localStorage.getItem('previousRank');
      if (rankData) {
        const { rank, timestamp } = JSON.parse(rankData);
        // Only use rank data if it's less than 24 hours old
        if (Date.now() - timestamp < 24 * 60 * 60 * 1000) {
          this.state.previousRank = rank;
        }
      }
    } catch (error) {
      console.error('Error retrieving previous rank:', error);
    }
  }

  savePreviousRank(rank) {
    try {
      localStorage.setItem('previousRank', JSON.stringify({
        rank,
        timestamp: Date.now()
      }));
    } catch (error) {
      console.error('Error saving previous rank:', error);
    }
  }

  setupEventListeners() {
    // Pagination
    this.elements.pagination.addEventListener("click", (e) => {
      const button = e.target.closest(".page-button");
      if (!button || button.classList.contains("disabled")) return;

      const page = button.classList.contains("prev") ? 
        this.state.currentPage - 1 : 
        button.classList.contains("next") ? 
          this.state.currentPage + 1 : 
          Number.parseInt(button.textContent);
      
      this.navigateToPage(page);
    });

    // Mobile menu
    this.elements.menuToggle?.addEventListener('click', () => {
      this.elements.sidebar.classList.toggle('active');
    });

    // Close sidebar on outside click
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.sidebar') && !e.target.closest('.menu-toggle')) {
        this.elements.sidebar.classList.remove('active');
      }
    });

    // Logout
    this.elements.logoutButton?.addEventListener("click", () => auth.logout());
    
    // Search functionality
    if (this.elements.searchInput && this.elements.searchButton) {
      this.elements.searchButton.addEventListener("click", () => this.handleSearch());
      this.elements.searchInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") this.handleSearch();
      });
      this.elements.searchInput.addEventListener("input", () => {
        if (this.elements.searchInput.value === "" && this.state.isSearchActive) {
          this.clearSearch();
        }
      });
    }
  }
  
  handleSearch() {
    const searchTerm = this.elements.searchInput.value.trim().toLowerCase();
    if (searchTerm === "") {
      this.clearSearch();
      return;
    }
    
    this.state.isSearchActive = true;
    this.state.filteredItems = this.state.allLeaderboardItems.filter(item => {
      const studentName = item.name || item.fullname || '';
      return studentName.toLowerCase().includes(searchTerm);
    });
    this.state.currentPage = 1;
    this.renderSearchResults();
  }
  
  renderSearchResults() {
    if (this.state.filteredItems.length === 0) {
      this.elements.leaderboardList.innerHTML = `
        <div class="empty-search-state">
          <i class="fas fa-search"></i>
          <h3>No Results Found</h3>
          <p>Try a different search term</p>
        </div>
      `;
      this.elements.pagination.innerHTML = '';
      return;
    }
    
    this.renderPaginatedList();
    const totalPages = Math.ceil(this.state.filteredItems.length / this.state.itemsPerPage);
    this.updatePagination(totalPages);
  }

  clearSearch() {
    if (this.state.isSearchActive) {
      this.state.isSearchActive = false;
      this.elements.searchInput.value = "";
      this.state.filteredItems = [];
      this.state.currentPage = 1;
      this.renderLeaderboard();
    }
  }

  async loadLeaderboardData() {
    if (this.state.isLoading) return;
    this.setLoading(true);

    try {
      const params = new URLSearchParams(window.location.search);
      const fromQuiz = params.get('from_quiz') === 'true' || params.get('quiz_completed') === 'true';
    
      // Clear cache if coming from a quiz completion
      if (fromQuiz) {
        localStorage.removeItem('leaderboardCache');
        await this.updateStatistics();
        this.clearUrlParameters(['from_quiz', 'quiz_completed']);
      }
      
      // Try to get cached data first
      const cachedData = this.getCachedData();
      if (cachedData && !fromQuiz) {
        this.processLeaderboardData(cachedData);
        // Fetch fresh data in background
        this.fetchAndUpdateCache();
      } else {
        const response = await this.fetchLeaderboardData();
        const data = await this.processLeaderboardResponse(response);
        this.cacheData(data);
        this.processLeaderboardData(data);
      }
    } catch (error) {
      this.handleError(error);
    } finally {
      this.setLoading(false);
      }
  }

  processLeaderboardData(data) {
    this.state.allLeaderboardItems = data.items || [];
    this.state.totalItems = data.totalItems || 0;
    this.processTiedRanks(this.state.allLeaderboardItems);
    this.renderLeaderboard(data.userRank);
    this.checkForRankChange(data.userRank);
      }

  getCachedData() {
    const cached = localStorage.getItem('leaderboardCache');
    if (!cached) return null;
    
    const { data, timestamp } = JSON.parse(cached);
    // Cache valid for 1 minute
    if (Date.now() - timestamp > 60000) {
      localStorage.removeItem('leaderboardCache');
      return null;
    }
    return data;
  }

  cacheData(data) {
    localStorage.setItem('leaderboardCache', JSON.stringify({
      data,
      timestamp: Date.now()
    }));
  }

  async fetchAndUpdateCache() {
    try {
      const response = await this.fetchLeaderboardData();
      const data = await this.processLeaderboardResponse(response);
      this.cacheData(data);
      this.processLeaderboardData(data);
    } catch (error) {
      console.warn('Background refresh failed:', error);
    }
  }

  async updateStatistics() {
    try {
          const updateStatsUrl = API_CONFIG.ENDPOINTS.STUDENT.UPDATE_STATISTICS;
      await fetchWithTokenRefresh(updateStatsUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'no-store, no-cache, must-revalidate'
            },
            body: JSON.stringify({
              forceUpdate: true,
              fullRecalculate: true
        })
          });
        } catch (e) {
      console.warn('Error updating statistics:', e);
    }
        }
        
  async fetchLeaderboardData() {
      const timestamp = new Date().getTime();
      const queryParams = new URLSearchParams({
        page: 1,
      limit: 50,
      t: timestamp,
        nocache: 'true'
      });

    const endpoint = `${API_CONFIG.ENDPOINTS.STUDENT.LEADERBOARD}?${queryParams}`;
    return await fetchWithTokenRefresh(endpoint, {
        headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0'
        }
      });
  }
      
  async processLeaderboardResponse(response) {
        const responseText = await response.text();
    try {
      return JSON.parse(responseText);
      } catch (parseError) {
        console.error('Error parsing JSON response:', parseError);
        throw new Error('Failed to parse server response');
      }
  }

  clearUrlParameters(params) {
    const newUrl = new URL(window.location.href);
    params.forEach(param => newUrl.searchParams.delete(param));
    window.history.replaceState({}, document.title, newUrl.toString());
  }
  
  checkForRankChange(currentRank) {
    if (!this.state.userId || !currentRank) return;
    
    // Only show notification if we have a previous rank stored
    if (this.state.previousRank !== null) {
      const rankDifference = this.state.previousRank - currentRank;
      
      if (rankDifference > 0) {
        // User rank improved (lower number is better)
        notifications.success(`Your rank improved by ${rankDifference} position${rankDifference > 1 ? 's' : ''}! Now at #${currentRank}.`);
      } else if (rankDifference < 0) {
        // User rank decreased
        notifications.warning(`Your rank dropped by ${Math.abs(rankDifference)} position${Math.abs(rankDifference) > 1 ? 's' : ''}. Now at #${currentRank}.`);
      }

      // Dispatch rank change event for the dashboard
      const rankChangeEvent = new CustomEvent('rankChange', {
        detail: {
          currentRank: currentRank,
          previousRank: this.state.previousRank
        }
      });
      window.dispatchEvent(rankChangeEvent);
    }
    
    // Save current rank for next comparison
    this.state.previousRank = currentRank;
  }
  
  getBadgeInfo(correctQuizzes) {
    if (correctQuizzes >= 25) {
      return { class: 'gold', label: 'Gold' };
    } else if (correctQuizzes >= 15) {
      return { class: 'silver', label: 'Silver' };
    } else if (correctQuizzes >= 5) {
      return { class: 'bronze', label: 'Bronze' };
    } else {
      return { class: 'beginner', label: 'Beginner' };
    }
  }

  renderLeaderboard(userRank) {
    // If no data or empty items array
    if (!this.state.allLeaderboardItems || this.state.allLeaderboardItems.length === 0) {
      this.showEmptyState();
      return;
    }
    
    // Get top 3 performers for the podium (if available)
    const topPerformers = this.state.allLeaderboardItems.slice(0, Math.min(3, this.state.allLeaderboardItems.length));
    
    // Render top performers
    this.renderTopPerformers(topPerformers);

    // Render the paginated list below the podium
    this.renderPaginatedList();
    
    // Update pagination controls - account for variable number of podium students
    let numOnPodium = Math.min(this.state.allLeaderboardItems.length, 2); // At least show 1st and 2nd place
    if (this.state.allLeaderboardItems.length >= 3) {
      numOnPodium = 3; // Add 3rd place if it exists
    }
    
    const totalPaginatedItems = Math.max(0, this.state.allLeaderboardItems.length - numOnPodium);
    const totalPages = Math.ceil(totalPaginatedItems / this.state.itemsPerPage);
    this.updatePagination(totalPages);
    
    // Highlight current user's position
    this.highlightCurrentUser(userRank);
  }

  renderPaginatedList() {
    // Calculate how many items to skip based on how many are on the podium
    // (instead of always skipping the top 3)
    let numOnPodium = Math.min(this.state.allLeaderboardItems.length, 2); // Show 1st and 2nd place
    if (this.state.allLeaderboardItems.length >= 3) {
      numOnPodium = 3; // Add 3rd place if it exists
    }
    
    // Determine which array to use based on search state
    const itemsToUse = this.state.isSearchActive ? this.state.filteredItems : this.state.allLeaderboardItems;
    
    // For search, we don't need to skip any items
    const startIndex = this.state.isSearchActive ? 0 : numOnPodium;
    
    // Calculate the start and end indices for the current page
    const pageStartIndex = startIndex + (this.state.currentPage - 1) * this.state.itemsPerPage;
    const pageEndIndex = Math.min(pageStartIndex + this.state.itemsPerPage, itemsToUse.length);
    
    // Get items for the current page
    const pageItems = itemsToUse.slice(pageStartIndex, pageEndIndex);
    
    // Render the list
    if (pageItems.length === 0) {
      this.elements.leaderboardList.innerHTML = `
        <div class="empty-page-state">
          <p>No more students to display</p>
        </div>
      `;
    } else {
      this.elements.leaderboardList.innerHTML = pageItems.map(item => this.createLeaderboardItem(item)).join("");
    }
    
    console.log(`Rendered page ${this.state.currentPage} with ${pageItems.length} items (indices ${pageStartIndex}-${pageEndIndex-1})`);
  }

  processTiedRanks(items) {
    // Keep track of previous rank to detect ties
    let prevRank = null;
    let prevItem = null;

    for (let i = 0; i < items.length; i++) {
      const currentItem = items[i];
      
      // Skip placeholders
      if (currentItem.isPlaceholder) continue;
      
      // Compare with previous real user's rank
      if (prevRank !== null && currentItem.rank === prevRank) {
        // Mark both as tied
        currentItem.isTied = true;
        if (prevItem) {
          prevItem.isTied = true;
        }
      }
      
      prevRank = currentItem.rank;
      prevItem = currentItem;
    }
  }

  showEmptyState() {
    this.elements.topPerformers.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-trophy"></i>
        <h3>No Leaderboard Data</h3>
        <p>Be the first to complete quizzes and appear on the leaderboard!</p>
      </div>
    `;
    this.elements.leaderboardList.innerHTML = '';
    this.elements.pagination.innerHTML = '';
  }

  renderTopPerformers(topPerformers) {
    if (!topPerformers || topPerformers.length === 0) {
      this.elements.topPerformers.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-trophy"></i>
          <h3>No Leaderboard Data</h3>
          <p>Be the first to complete quizzes and appear on the leaderboard!</p>
        </div>
      `;
      return;
    }
    
    // Check if there's only one user and add special class for styling
    if (topPerformers.length === 1) {
      this.elements.topPerformers.classList.add('single-user-fix');
    } else {
      this.elements.topPerformers.classList.remove('single-user-fix');
    }
    
    // Create HTML for the top performers (1st and 2nd place, 3rd only if exists)
    let html = '';
    
    // Second place (index 1)
    if (topPerformers.length >= 2) {
      const secondPlace = topPerformers[1];
      const isCurrentUser = secondPlace.id.toString() === this.state.userId?.toString();
      const avatarPath = this.processAvatarPath(secondPlace.avatar);
      const studentName = secondPlace.name || secondPlace.fullname || `Student ${secondPlace.id}`;
      
      // Use the updated badge logic
      const correctQuizzes = secondPlace.correct_quizzes || 0;
      const totalQuizzes = secondPlace.total_quizzes || 0;
      const badgeInfo = this.getBadgeInfo(correctQuizzes);
      const badgeClass = badgeInfo.class;
      const badgeLabel = badgeInfo.label;
      
      // Apply border color to match badge
      const borderColorClass = `border-${badgeClass}`;
      
      // Apply image positioning if available
      let imageStyle = 'object-fit: cover;';
      if (typeof secondPlace.image_position_x === 'number' &&
          typeof secondPlace.image_position_y === 'number' &&
          typeof secondPlace.image_scale === 'number') {
        
        imageStyle += ` object-position: ${secondPlace.image_position_x || 0}px ${secondPlace.image_position_y || 0}px;`;
        imageStyle += ` transform: scale(${secondPlace.image_scale || 1}) translateZ(0);`;
        imageStyle += ` transform-origin: center center;`;
      }
      
      html += `
        <div class="performer second ${isCurrentUser ? 'current-user' : ''}" data-user-id="${secondPlace.id}">
          <div class="performer-avatar avatar-container ${borderColorClass}" data-rank="2">
            <img src="${avatarPath}" alt="${studentName}'s avatar" class="avatar-image" style="${imageStyle}">
          </div>
          <div class="performer-name">${studentName}${isCurrentUser ? ' (You)' : ''}</div>
          <div class="performer-score">
            <div class="quiz-count">
              <i class="fas fa-check-circle"></i>
              <span>${correctQuizzes} correct out of ${totalQuizzes} quizzes</span>
            </div>
            <span class="rank-badge ${badgeClass}">${badgeLabel}</span>
          </div>
        </div>
      `;
    }
    
    // First place (index 0)
    if (topPerformers.length >= 1) {
      const firstPlace = topPerformers[0];
      const isCurrentUser = firstPlace.id.toString() === this.state.userId?.toString();
      const avatarPath = this.processAvatarPath(firstPlace.avatar);
      const studentName = firstPlace.name || firstPlace.fullname || `Student ${firstPlace.id}`;
      
      // Use the updated badge logic
      const correctQuizzes = firstPlace.correct_quizzes || 0;
      const totalQuizzes = firstPlace.total_quizzes || 0;
      const badgeInfo = this.getBadgeInfo(correctQuizzes);
      const badgeClass = badgeInfo.class;
      const badgeLabel = badgeInfo.label;
      
      // Apply border color to match badge
      const borderColorClass = `border-${badgeClass}`;
      
      // Apply image positioning if available
      let imageStyle = 'object-fit: cover;';
      if (typeof firstPlace.image_position_x === 'number' &&
          typeof firstPlace.image_position_y === 'number' &&
          typeof firstPlace.image_scale === 'number') {
        
        imageStyle += ` object-position: ${firstPlace.image_position_x || 0}px ${firstPlace.image_position_y || 0}px;`;
        imageStyle += ` transform: scale(${firstPlace.image_scale || 1}) translateZ(0);`;
        imageStyle += ` transform-origin: center center;`;
      }
      
      html += `
        <div class="performer first ${isCurrentUser ? 'current-user' : ''}" data-user-id="${firstPlace.id}">
          <div class="performer-avatar avatar-container ${borderColorClass}" data-rank="1">
            <img src="${avatarPath}" alt="${studentName}'s avatar" class="avatar-image" style="${imageStyle}">
          </div>
          <div class="performer-name">${studentName}${isCurrentUser ? ' (You)' : ''}</div>
          <div class="performer-score">
            <div class="quiz-count">
              <i class="fas fa-check-circle"></i>
              <span>${correctQuizzes} correct out of ${totalQuizzes} quizzes</span>
            </div>
            <span class="rank-badge ${badgeClass}">${badgeLabel}</span>
          </div>
        </div>
      `;
    }
    
    // Only display third place if there are at least 3 students
    if (topPerformers.length >= 3) {
      const thirdPlace = topPerformers[2];
      const isCurrentUser = thirdPlace.id.toString() === this.state.userId?.toString();
      const avatarPath = this.processAvatarPath(thirdPlace.avatar);
      const studentName = thirdPlace.name || thirdPlace.fullname || `Student ${thirdPlace.id}`;
      
      // Use the updated badge logic
      const correctQuizzes = thirdPlace.correct_quizzes || 0;
      const totalQuizzes = thirdPlace.total_quizzes || 0;
      const badgeInfo = this.getBadgeInfo(correctQuizzes);
      const badgeClass = badgeInfo.class;
      const badgeLabel = badgeInfo.label;
      
      // Apply border color to match badge
      const borderColorClass = `border-${badgeClass}`;
      
      // Apply image positioning if available
      let imageStyle = 'object-fit: cover;';
      if (typeof thirdPlace.image_position_x === 'number' &&
          typeof thirdPlace.image_position_y === 'number' &&
          typeof thirdPlace.image_scale === 'number') {
        
        imageStyle += ` object-position: ${thirdPlace.image_position_x || 0}px ${thirdPlace.image_position_y || 0}px;`;
        imageStyle += ` transform: scale(${thirdPlace.image_scale || 1}) translateZ(0);`;
        imageStyle += ` transform-origin: center center;`;
      }
      
      html += `
        <div class="performer third ${isCurrentUser ? 'current-user' : ''}" data-user-id="${thirdPlace.id}">
          <div class="performer-avatar avatar-container ${borderColorClass}" data-rank="3">
            <img src="${avatarPath}" alt="${studentName}'s avatar" class="avatar-image" style="${imageStyle}">
          </div>
          <div class="performer-name">${studentName}${isCurrentUser ? ' (You)' : ''}</div>
          <div class="performer-score">
            <div class="quiz-count">
              <i class="fas fa-check-circle"></i>
              <span>${correctQuizzes} correct out of ${totalQuizzes} quizzes</span>
            </div>
            <span class="rank-badge ${badgeClass}">${badgeLabel}</span>
          </div>
        </div>
      `;
    }
    
    // Set the HTML content
    this.elements.topPerformers.innerHTML = html;
  }

  // Helper function to process avatar paths - use absolute path
  processAvatarPath(originalPath) {
    if (!originalPath) {
        return '/quizmaster/frontend/images/profile-placeholder.svg';
    }
    
    console.log('Processing avatar path:', originalPath);
    
    // Handle the default placeholder image case specially
    if (originalPath === 'profile-placeholder.svg' || originalPath === 'images/profile-placeholder.svg' || originalPath === 'frontend/images/profile-placeholder.svg') {
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
        return '/quizmaster/backend/' + originalPath;
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

  createLeaderboardItem(item) {
    // Check if this is the current user - handle safely
    let isCurrentUser = false;
    if (item && item.id !== undefined && this.state.userId) {
      isCurrentUser = item.id.toString() === this.state.userId.toString();
    }
    
    // Process avatar path
    const avatarPath = this.processAvatarPath(item.avatar);
    
    // Get student name, fallback to ID if both name and fullname are null
    const studentName = item.name || item.fullname || `Student ${item.id}`;
    
    // Use the updated badge logic based on correct quizzes
    const correctQuizzes = item.correct_quizzes || 0;
    const totalQuizzes = item.total_quizzes || 0;
    const badgeInfo = this.getBadgeInfo(correctQuizzes);
    const badgeClass = badgeInfo.class;
    const badgeLabel = badgeInfo.label;
    
    // Generate rank change HTML
    const rankChangeHTML = this.getRankChangeHTML(item.rankChange);
    
    // Style class for tied positions
    const tiedClass = item.isTied ? 'tied-rank' : '';
    
    // Apply image positioning if available
    let imageStyle = 'object-fit: cover;';
    if (typeof item.image_position_x === 'number' &&
        typeof item.image_position_y === 'number' &&
        typeof item.image_scale === 'number') {
      
      imageStyle += ` object-position: ${item.image_position_x || 0}px ${item.image_position_y || 0}px;`;
      imageStyle += ` transform: scale(${item.image_scale || 1}) translateZ(0);`;
      imageStyle += ` transform-origin: center center;`;
    }
    
    return `
      <div class="leaderboard-item ${isCurrentUser ? 'current-user' : ''} ${tiedClass}" data-user-id="${item.id}">
        <div class="leaderboard-item-content">
          <div class="user-profile-section">
            <div class="rank ${badgeClass}-rank">${item.rank}</div>
            <div class="avatar-container list-avatar">
              <img src="${avatarPath}" alt="${studentName}'s avatar" class="avatar-image" style="${imageStyle}">
            </div>
            <div class="user-details">
              <div class="user-name">${studentName}${isCurrentUser ? ' (You)' : ''}</div>
            </div>
          </div>
          
          <div class="stats-section">
            <div class="quiz-count">
              <i class="fas fa-check-circle"></i>
              <span>${correctQuizzes} correct out of ${totalQuizzes} quizzes</span>
            </div>
          </div>
          
          <div class="badge-section">
            <span class="rank-badge ${badgeClass}">${badgeLabel}</span>
            ${rankChangeHTML ? `<div class="rank-change-container">${rankChangeHTML}</div>` : ''}
          </div>
        </div>
      </div>
    `;
  }

  getRankChangeHTML(change) {
    if (!change) return "";

    const direction = change > 0 ? "up" : "down";
    const icon = direction === "up" ? "fa-arrow-up" : "fa-arrow-down";

    return `
      <span class="rank-change ${direction}">
        <i class="fas ${icon}"></i>
        <span>${Math.abs(change)}</span>
      </span>
    `;
  }

  updatePagination(totalPages) {
    if (!totalPages || totalPages <= 0) {
      this.elements.pagination.innerHTML = '';
      return;
    }
    
    let html = `
      <button class="page-button prev ${this.state.currentPage === 1 ? "disabled" : ""}">
        <i class="fas fa-chevron-left"></i>
      </button>
    `;

    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= this.state.currentPage - 1 && i <= this.state.currentPage + 1)) {
        html += `
          <button class="page-button ${i === this.state.currentPage ? "active" : ""}">${i}</button>
        `;
      } else if (i === this.state.currentPage - 2 || i === this.state.currentPage + 2) {
        html += `<span class="page-ellipsis">...</span>`;
      }
    }

    html += `
      <button class="page-button next ${this.state.currentPage === totalPages ? "disabled" : ""}">
        <i class="fas fa-chevron-right"></i>
      </button>
    `;

    this.elements.pagination.innerHTML = html;
  }

  highlightCurrentUser(userRank) {
    if (!userRank) return;
    
    // Add current-user class to the appropriate leaderboard item
    const leaderboardItems = document.querySelectorAll('.leaderboard-item');
    leaderboardItems.forEach(item => {
      const rankNumber = item.querySelector('.rank');
      if (rankNumber && parseInt(rankNumber.textContent) === userRank) {
        item.classList.add('current-user');
      }
    });
  }

  async navigateToPage(page) {
    if (page === this.state.currentPage || this.state.isLoading) return;
    this.state.currentPage = page;
    
    // No need to fetch data again, just render the new page
    if (this.state.isSearchActive) {
      this.renderSearchResults();
    } else {
      this.renderPaginatedList();
      
      // Update pagination controls
      const totalPaginatedItems = Math.max(0, this.state.allLeaderboardItems.length - 3);
      const totalPages = Math.ceil(totalPaginatedItems / this.state.itemsPerPage);
      this.updatePagination(totalPages);
    }
    
    // Scroll to top of leaderboard
    this.elements.container.scrollIntoView({ behavior: 'smooth' });
  }

  setLoading(loading) {
    this.state.isLoading = loading;
    this.elements.container.dataset.loading = loading;
  }

  handleError(error) {
    console.error("Leaderboard Error:", error);
    notifications.error("Failed to load leaderboard data. Please try again.");
    
    // Empty the leaderboard with an error message
    this.elements.leaderboardList.innerHTML = `
      <div class="error-state">
        <i class="fas fa-exclamation-circle"></i>
        <h3>Oops! Something went wrong</h3>
        <p>${error.message || 'Failed to load leaderboard data'}</p>
        <button class="retry-btn" onclick="location.reload()">
          <i class="fas fa-sync-alt"></i> Retry
        </button>
      </div>
    `;
  }

  initializeAvatarStyles() {
    // Find all avatar containers and apply base styling
    const avatars = document.querySelectorAll('.performer-avatar img, .avatar-container img, .leaderboard-item img.avatar-small');
    avatars.forEach(avatar => {
      avatar.style.objectFit = 'cover';
      avatar.style.transformOrigin = 'center center';
      avatar.style.transform = 'scale(1) translateZ(0)'; // Add translateZ for hardware acceleration
      avatar.style.willChange = 'transform'; // Limit to only what's necessary
      avatar.style.imageRendering = '-webkit-optimize-contrast'; // Improves sharpness
      avatar.style.backfaceVisibility = 'hidden'; // Prevents blurring
    });
    console.log('Applied base styling to', avatars.length, 'avatar images on leaderboard');
  }

  // Add a method to update current user's avatar from localStorage
  async updateCurrentUserAvatar() {
    try {
      const userData = JSON.parse(localStorage.getItem('userData') || '{}');
      
      if (userData && userData.profile_image) {
        console.log('Leaderboard - Updating current user avatar with:', userData.profile_image);
        
        // Use timestamp to prevent caching
        const timestamp = new Date().getTime();
        const newSrc = userData.profile_image + '?t=' + timestamp;
        
        // Update current user avatar in the leaderboard if it exists
        const currentUserItem = document.querySelector('.leaderboard-item.current-user');
        if (currentUserItem) {
          const avatar = currentUserItem.querySelector('img');
          if (avatar) {
            console.log('Leaderboard - Found current user avatar element, updating src');
            
            // Preload the image
            const tempImg = new Image();
            tempImg.onload = () => {
              avatar.src = newSrc;
              
              // Apply image positioning if available
              if (typeof userData.image_position_x === 'number' && 
                  typeof userData.image_position_y === 'number' && 
                  typeof userData.image_scale === 'number') {
                
                const posX = Number(userData.image_position_x);
                const posY = Number(userData.image_position_y);
                const scale = parseFloat(userData.image_scale);
                
                avatar.style.objectFit = 'cover';
                avatar.style.objectPosition = `${posX}px ${posY}px`;
                avatar.style.transform = `scale(${scale}) translateZ(0)`;
                avatar.style.transformOrigin = 'center center';
              }
            };
            tempImg.onerror = () => {
              console.error('Leaderboard - Failed to load updated avatar');
            };
            tempImg.src = newSrc;
          }
        }
        
        // Also check top performers
        const topPerformers = document.querySelectorAll('.performer');
        topPerformers.forEach(performer => {
          if (performer.dataset.userId === this.state.userId) {
            const avatar = performer.querySelector('img');
            if (avatar) {
              console.log('Leaderboard - Found current user in top performers, updating avatar');
              
              // Preload the image
              const tempImg = new Image();
              tempImg.onload = () => {
                avatar.src = newSrc;
                
                // Apply image positioning if available
                if (typeof userData.image_position_x === 'number' && 
                    typeof userData.image_position_y === 'number' && 
                    typeof userData.image_scale === 'number') {
                  
                  const posX = Number(userData.image_position_x);
                  const posY = Number(userData.image_position_y);
                  const scale = parseFloat(userData.image_scale);
                  
                  avatar.style.objectFit = 'cover';
                  avatar.style.objectPosition = `${posX}px ${posY}px`;
                  avatar.style.transform = `scale(${scale}) translateZ(0)`;
                  avatar.style.transformOrigin = 'center center';
                }
              };
              tempImg.onerror = () => {
                console.error('Leaderboard - Failed to load updated avatar for top performer');
              };
              tempImg.src = newSrc;
            }
          }
        });
      }
    } catch (error) {
      console.error('Leaderboard - Error updating current user avatar:', error);
    }
  }

  initializeWebSocket() {
    // Subscribe to rank updates
    webSocketService.subscribe('rankUpdate', (data) => {
        if (data.userId === this.state.userId) {
            this.handleRankUpdate(data);
            // Broadcast rank change to dashboard
            const rankChangeEvent = new CustomEvent('rankChange', {
                detail: {
                    oldRank: data.oldRank,
                    newRank: data.newRank,
                    timestamp: Date.now()
                }
            });
            window.dispatchEvent(rankChangeEvent);
        }
    });

    // Subscribe to leaderboard updates
    webSocketService.subscribe('leaderboardUpdate', () => {
        this.refreshLeaderboard();
    });

    // Connect to WebSocket server
    webSocketService.connect();
  }

  handleRankUpdate(data) {
    const oldRank = data.oldRank;
    const newRank = data.newRank;
    
    if (oldRank && newRank && oldRank !== newRank) {
        const difference = oldRank - newRank;
        
        console.log('Processing rank update:', {
            oldRank,
            newRank,
            difference
        });
        
        // Store rank change in localStorage with timestamp
        const rankChanges = JSON.parse(localStorage.getItem('weeklyRankChanges') || '[]');
        rankChanges.push({
            change: difference,
            timestamp: Date.now()
        });
        
        // Only keep changes from the current week
        const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
        const filteredChanges = rankChanges.filter(change => change.timestamp > oneWeekAgo);
        localStorage.setItem('weeklyRankChanges', JSON.stringify(filteredChanges));

        // Update previous rank in database
        this.updatePreviousRankInDatabase(newRank).then(() => {
            console.log('Previous rank updated in database:', newRank);
        }).catch(error => {
            console.error('Failed to update previous rank:', error);
        });
        
        if (difference > 0) {
            notifications.success(`Your rank improved by ${difference} position${difference > 1 ? 's' : ''}! Now at #${newRank}.`);
        } else {
            notifications.warning(`Your rank dropped by ${Math.abs(difference)} position${Math.abs(difference) > 1 ? 's' : ''}. Now at #${newRank}.`);
        }
        
        // Request push notification permission if not granted
        this.requestNotificationPermission();
    }
  }

  async updatePreviousRankInDatabase(newRank) {
    try {
        const response = await fetchWithTokenRefresh('student/update_rank.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-store, no-cache, must-revalidate'
            },
            body: JSON.stringify({
                previous_rank: newRank
            })
        });

        const data = await response.json();
        if (!data.success) {
            throw new Error(data.message || 'Failed to update previous rank');
        }
        return data;
    } catch (error) {
        console.error('Error updating previous rank:', error);
        throw error;
    }
  }

  async requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        notifications.success('Push notifications enabled for rank updates!');
      }
    }
  }

  async refreshLeaderboard() {
    if (!this.state.isLoading) {
      await this.loadLeaderboardData();
    }
  }

  // Clean up WebSocket connection when needed
  cleanup() {
    webSocketService.unsubscribe('rankUpdate');
    webSocketService.unsubscribe('leaderboardUpdate');
    webSocketService.disconnect();
  }

  initializeDarkMode() {
    const isDarkMode = localStorage.getItem('darkMode') === 'true';
    if (isDarkMode) {
      document.documentElement.classList.add('dark-theme');
      document.body.classList.add('dark-theme');
    }
  }
}

// Initialize leaderboard when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  const leaderboard = new LeaderboardManager();
  
  // Clean up on page unload
  window.addEventListener('unload', () => {
    leaderboard.cleanup();
  });
});