import API_CONFIG from './config.js';
import auth from './utils/auth.js';

class TeacherQuizzes {
  constructor() {
    this.init()
    this.setupEventListeners()
    this.loadInitialData()
  }

  init() {
    // Core elements
    this.sidebar = document.querySelector(".sidebar")
    this.menuToggle = document.querySelector(".menu-toggle")
    this.filterTabs = document.querySelectorAll(".filter-tab")
    this.searchInput = document.querySelector(".search-box input")
    this.quizList = document.querySelector(".quiz-list")
    this.pageButtons = document.querySelectorAll(".page-button")
    this.logoutButton = document.querySelector(".logout-btn")

    // State management
    this.currentFilter = "all"
    this.currentPage = 1
    this.searchQuery = ""
    this.quizzes = []
    this.loading = false

    // Hide all detail panels
    this.hideAllPanels()
    
    // Immediately show loading state
    this.showLoading()
    
    // Initialize counters with placeholder values
    const counterElements = document.querySelectorAll('[data-counter]')
    counterElements.forEach(el => {
      if (el.dataset.counter === 'average-score') {
        el.textContent = '0%'
      } else {
        el.textContent = '0'
      }
    })
  }

  async loadInitialData() {
    try {
      // Only show loading if not already in loading state
      if (!this.loading) {
        this.showLoading()
      }
      
      await this.fetchQuizzes()
      await this.fetchAnalytics()
      
      // Mark the page as loaded with JS data
      document.body.classList.add('js-loaded')
    } catch (error) {
      console.error("Failed to load data:", error)
      this.showError("Failed to load quizzes")
    } finally {
      this.hideLoading()
    }
  }

  async fetchQuizzes() {
    try {
      const queryParams = new URLSearchParams({
        filter: this.currentFilter,
        page: this.currentPage,
        query: this.searchQuery,
        search: this.searchQuery // Add search parameter as a backup
      });

      console.log(`Fetching quizzes with filter: ${this.currentFilter}, search: '${this.searchQuery}'`);
      
      // Get token from localStorage
      const token = localStorage.getItem('userToken');
      if (!token) {
        console.error("No auth token available");
        throw new Error("Authentication required");
      }

      // Try the search.php endpoint first (which we created)
      let response;
      let endpointUrl;
      
      try {
        endpointUrl = `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.QUIZ.SEARCH}?${queryParams}`;
        console.log(`Attempting to fetch quizzes from: ${endpointUrl}`);
        
        response = await fetch(endpointUrl, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        if (!response.ok) {
          console.log(`Search endpoint returned ${response.status}, falling back to quizzes.php`);
          throw new Error('Search endpoint failed');
        }
      } catch (searchError) {
        // Fallback to the teacher/quizzes.php endpoint
        endpointUrl = `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.TEACHER.QUIZZES}?${queryParams}`;
        console.log(`Falling back to: ${endpointUrl}`);
        
        response = await fetch(endpointUrl, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        if (!response.ok) {
          // Log the response text for debugging
          const errorText = await response.text();
          console.error('Server error response:', errorText);
          throw new Error(`Quizzes endpoint returned ${response.status}`);
        }
      }

      // Try to parse the response as JSON
      let data;
      try {
        const responseText = await response.text();
        console.log('Raw response:', responseText);
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error('Error parsing JSON response:', parseError);
        throw new Error('Failed to parse server response');
      }
      
      if (data.success) {
        this.quizzes = data.quizzes || [];
        console.log(`Received ${this.quizzes.length} quizzes`, this.quizzes);
        this.updateQuizList();
        
        // Update analytics if statistics are available in the response
        if (data.statistics) {
          console.log("Found statistics in quizzes response:", data.statistics);
          this.updateAnalytics(data.subject_stats || [], data.statistics);
        }
        
        // Handle different response formats from different endpoints
        if (data.pagination) {
          this.updatePagination(data.pagination.current_page, data.pagination.total_pages);
        } else if (data.currentPage && data.totalPages) {
          this.updatePagination(data.currentPage, data.totalPages);
        } else {
          this.updatePagination(1, 1);
        }
      } else {
        console.error("API returned error:", data.error);
        throw new Error(data.error || "Failed to fetch quizzes");
      }
    } catch (error) {
      console.error('Error fetching quizzes:', error);
      // Show the error in the UI
      this.quizList.innerHTML = `
        <div class="error-message">
          <i class="fas fa-exclamation-circle"></i>
          <p>${error.message}</p>
        </div>
      `;
      throw error;
    }
  }

  async fetchAnalytics() {
    try {
      const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.TEACHER.ANALYTICS}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('userToken')}`
        }
      });

      // First check if the response is OK
      if (!response.ok) {
        console.error(`Analytics API error: ${response.status} ${response.statusText}`);
        // Log the response text for debugging
        const text = await response.text();
        console.error(`Response text: ${text}`);
        throw new Error('Failed to fetch analytics');
      }

      let data;
      try {
        const rawText = await response.text();
        console.log("Raw analytics response:", rawText);
        data = JSON.parse(rawText);
        console.log("Parsed analytics data:", data);
      } catch (jsonError) {
        console.error('Failed to parse JSON:', jsonError);
        // Use default data
        data = {
          success: true,
          data: {
            statistics: {
              total_quizzes: 0,
              total_attempts: 0,
              average_score: 0
            },
            subject_stats: []
          },
          subject_stats: []
        };
      }
      
      if (data.success) {
        console.log("Analytics data:", data);
        
        // Check if statistics exists directly in data or in data.data
        const statistics = data.data?.statistics || data.statistics || {};
        const subjectStats = data.data?.subject_stats || data.subject_stats || [];
        
        console.log("Extracted statistics:", statistics);
        console.log("Extracted subject stats:", subjectStats);
        
        // Update total quiz count directly if available in statistics
        if (statistics && statistics.total_quizzes !== undefined) {
          const totalQuizzesEl = document.querySelector('[data-counter="total-quizzes"]');
          if (totalQuizzesEl) {
            totalQuizzesEl.textContent = statistics.total_quizzes;
          }
        }
        
        // Update subject stats
        this.updateAnalytics(subjectStats, statistics);
      } else {
        console.error('API returned error:', data.error);
        // Use default data if API returns an error
        this.updateAnalytics([
          {
            subject: 'Mathematics',
            total_quizzes: 0,
            total_students: 0,
            success_rate: 0
          },
          {
            subject: 'Science',
            total_quizzes: 0,
            total_students: 0,
            success_rate: 0
          },
          {
            subject: 'History',
            total_quizzes: 0,
            total_students: 0,
            success_rate: 0
          }
        ]);
      }
    } catch (error) {
      console.error('Error fetching analytics:', error);
      // Use default data on error
      this.updateAnalytics([
        {
          subject: 'Mathematics',
          total_quizzes: 0,
          total_students: 0,
          success_rate: 0
        },
        {
          subject: 'Science',
          total_quizzes: 0,
          total_students: 0,
          success_rate: 0
        },
        {
          subject: 'History',
          total_quizzes: 0,
          total_students: 0,
          success_rate: 0
        }
      ]);
    }
  }

  updateQuizList() {
    this.quizList.innerHTML = this.quizzes.map(quiz => this.createQuizItem(quiz)).join("");
    this.setupQuizActions();
  }

  createQuizItem(quiz) {
    // Safe default values for missing properties
    const safeQuiz = {
      id: quiz.id || 0,
      title: quiz.title || 'Untitled Quiz',
      subject: quiz.subject || 'General',
      status: quiz.status || 'draft',
      shuffle_questions: quiz.shuffle_questions || false,
      show_results_after: quiz.show_results_after || null
    };
    
    // Use status from the database, fallback to previous logic if not available
    const statusClass = safeQuiz.status === 'published' ? 'active' : 'draft';
    const statusText = safeQuiz.status === 'published' ? 'Published' : 'Draft';

    return `
      <div class="quiz-item" data-quiz-id="${safeQuiz.id}">
        <div class="quiz-info">
          <div class="quiz-subject">
            <i class="fas fa-${this.getSubjectIcon(safeQuiz.subject)}"></i>
            <h3>${safeQuiz.title}</h3>
          </div>
        </div>
        <div class="quiz-actions">
          <span class="status-badge ${statusClass}">${statusText}</span>
          <button class="action-btn" title="Edit Quiz">
            <i class="fas fa-edit"></i>
          </button>
          <button class="action-btn" title="View Analytics">
            <i class="fas fa-chart-bar"></i>
          </button>
          <button class="action-btn" title="More Options">
            <i class="fas fa-ellipsis-v"></i>
          </button>
        </div>
      </div>
    `;
  }

  getSubjectIcon(subject) {
    const icons = {
      'Mathematics': 'calculator',
      'Science': 'flask',
      'History': 'landmark',
      'Literature': 'book',
      'Computer Science': 'laptop-code'
    };
    return icons[subject] || 'book';
  }

  updateAnalytics(subjectStats, statistics = {}) {
    // If there's no data, keep default values
    if ((!subjectStats || subjectStats.length === 0) && Object.keys(statistics).length === 0) {
      console.log('No analytics data available, keeping default values');
      return;
    }
    
    // Get counter elements
    const totalQuizzesEl = document.querySelector('[data-counter="total-quizzes"]');
    const totalAttemptsEl = document.querySelector('[data-counter="total-attempts"]');
    const avgScoreEl = document.querySelector('[data-counter="average-score"]');
    
    // Update total quizzes
    if (totalQuizzesEl) {
      const total = statistics.total_quizzes || 0;
      totalQuizzesEl.textContent = total;
      
      // Update trend
      const trend = totalQuizzesEl.closest('.analytics-card').querySelector('.trend');
      if (trend && total > 0) {
        trend.innerHTML = `<i class="fas fa-arrow-up"></i> Recent activity`;
        trend.classList.add('positive');
      } else if (trend) {
        trend.innerHTML = `<i class="fas fa-minus"></i> No recent change`;
        trend.classList.remove('positive', 'negative');
      }
    }
    
    // Update total attempts
    if (totalAttemptsEl) {
      const total = statistics.total_attempts || 0;
      totalAttemptsEl.textContent = total.toLocaleString();
      
      // Update trend
      const trend = totalAttemptsEl.closest('.analytics-card').querySelector('.trend');
      if (trend && total > 0) {
        trend.innerHTML = `<i class="fas fa-arrow-up"></i> Active attempts`;
        trend.classList.add('positive');
      } else if (trend) {
        trend.innerHTML = `<i class="fas fa-minus"></i> No recent activity`;
        trend.classList.remove('positive', 'negative');
      }
    }
    
    // Update average score - using student_success_rate from statistics
    if (avgScoreEl) {
      const avg = statistics.average_score || 0;
      avgScoreEl.textContent = `${Math.round(avg)}%`;
      
      // Update trend
      const trend = avgScoreEl.closest('.analytics-card').querySelector('.trend');
      if (trend && avg > 0) {
        if (avg >= 70) {
          trend.innerHTML = `<i class="fas fa-arrow-up"></i> Good performance`;
          trend.classList.add('positive');
          trend.classList.remove('negative');
        } else if (avg >= 50) {
          trend.innerHTML = `<i class="fas fa-minus"></i> Average performance`;
          trend.classList.remove('positive', 'negative');
        } else {
          trend.innerHTML = `<i class="fas fa-arrow-down"></i> Needs improvement`;
          trend.classList.remove('positive');
          trend.classList.add('negative');
        }
      } else if (trend) {
        trend.innerHTML = `<i class="fas fa-minus"></i> No data available`;
        trend.classList.remove('positive', 'negative');
      }
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

    // Filter tabs
    this.filterTabs.forEach(tab => {
      tab.addEventListener("click", () => {
        this.filterTabs.forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        this.currentFilter = tab.textContent.split("(")[0].trim().toLowerCase();
        this.currentPage = 1;
        this.loadInitialData();
      });
    });

    // Search functionality
    this.searchInput.addEventListener("input", this.debounce(() => {
      console.log("Search input changed to:", this.searchInput.value);
      this.searchQuery = this.searchInput.value;
      this.currentPage = 1;
      
      // Show loading state
      if (this.searchQuery.length > 0) {
        this.showLoading();
        this.quizList.innerHTML = `
          <div class="loading-state">
            <i class="fas fa-search"></i>
            <p>Searching for "${this.searchQuery}"...</p>
          </div>
        `;
      }
      
      this.loadInitialData().catch(error => {
        console.error("Search error:", error);
        this.quizList.innerHTML = `
          <div class="error-message">
            <i class="fas fa-exclamation-circle"></i>
            <p>Search error: ${error.message}</p>
          </div>
        `;
      });
    }, 300));

    // Pagination
    this.pageButtons.forEach(btn => {
      if (!btn.disabled) {
        btn.addEventListener("click", () => {
          const newPage = parseInt(btn.textContent);
          if (newPage && newPage !== this.currentPage) {
            this.currentPage = newPage;
            this.loadInitialData();
          }
        });
      }
    });

    // Add logout handler
    if (this.logoutButton) {
      this.logoutButton.addEventListener("click", () => this.handleLogout())
    }
  }

  setupQuizActions() {
    this.quizList.querySelectorAll(".action-btn").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        const action = e.currentTarget.getAttribute("title");
        const quizItem = e.currentTarget.closest(".quiz-item");
        const quizId = quizItem.dataset.quizId;

        switch (action) {
          case "Edit Quiz":
            await this.showEditPanel(quizId);
            break;

          case "View Analytics":
            await this.showAnalyticsPanel(quizId);
            break;

          case "More Options":
            this.showOptionsMenu(e.currentTarget, quizId);
            break;
        }
      });
    });

    // Add close panel handlers
    document.querySelectorAll(".close-panel").forEach(btn => {
      btn.addEventListener("click", () => {
        this.hideAllPanels();
      });
    });
  }

  async showEditPanel(quizId) {
    try {
      // Hide any existing panels first
      this.hideAllPanels();
      
      // Find the quiz item
      const quizItem = document.querySelector(`.quiz-item[data-quiz-id="${quizId}"]`);
      if (!quizItem) return;
      
      // Check if edit panel already exists
      let editPanel = document.querySelector(`.edit-panel[data-quiz-id="${quizId}"]`);
      if (!editPanel) {
        // Create edit panel section if it doesn't exist
        editPanel = document.createElement('div');
        editPanel.className = 'edit-panel';
        editPanel.dataset.quizId = quizId;
        editPanel.innerHTML = `
          <div class="panel-header">
            <h3>Edit Quiz</h3>
            <button class="close-panel">
              <i class="fas fa-times"></i>
            </button>
          </div>
          <div class="panel-content">
            <div class="loading-state">
              <i class="fas fa-spinner fa-spin"></i>
              <p>Loading quiz data...</p>
            </div>
          </div>
        `;
        
        // Insert after the quiz item
        quizItem.insertAdjacentElement('afterend', editPanel);
        
        // Add click handler for close button
        editPanel.querySelector('.close-panel').addEventListener('click', () => {
          editPanel.remove();
        });
      } else {
        // Show the existing panel
        editPanel.style.display = 'block';
      }
      
      // Fetch quiz data
      const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.QUIZ.GET}?id=${quizId}&cache=${Date.now()}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('userToken')}`
        }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to load quiz data: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to load quiz data');
      }
      
      // Generate edit form with quiz data
      this.populateEditPanel(editPanel, data.quiz);
      
      // Scroll to the panel
      editPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      
    } catch (error) {
      console.error('Error loading quiz for edit:', error);
      this.showError(`Failed to load quiz: ${error.message}`);
    }
  }

  async showAnalyticsPanel(quizId) {
    this.hideAllPanels();
    
    try {
      const analyticsPanel = document.querySelector(".analytics-panel");
      if (!analyticsPanel) return;
      
      // Add loading indicator to the panel content
      const panelContent = analyticsPanel.querySelector('.panel-content');
      panelContent.innerHTML = `
        <div class="loading-state">
          <i class="fas fa-spinner fa-spin"></i>
          <p>Loading analytics data...</p>
        </div>
      `;
      
      // Show the panel
      document.querySelector(".quiz-details-section").style.display = "block";
      analyticsPanel.style.display = "block";
      
      // Get the authentication token
      const token = localStorage.getItem('userToken');
      if (!token) {
        throw new Error('Authentication token not found');
      }
      
      console.log('Fetching analytics with token:', token ? 'Token present' : 'No token');
      
      const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.TEACHER.ANALYTICS}?quiz_id=${quizId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Analytics API error response:', errorText);
        throw new Error(`Failed to fetch quiz analytics: ${response.status} ${response.statusText}`);
      }

      // Log the raw response for debugging
      const responseText = await response.text();
      console.log('Raw analytics response:', responseText);
      
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (e) {
        console.error('Failed to parse analytics response:', e);
        throw new Error('Invalid analytics data received');
      }
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to load analytics');
      }

      // Get quiz data - check both possible locations
      const quizStats = data.quiz_stats || data.data?.quiz_stats;
      console.log('Quiz stats:', quizStats);
      
      if (!quizStats) {
        throw new Error('No quiz statistics found in response');
      }
      
      // Update panel content with analytics data
      panelContent.innerHTML = this.createAnalyticsContent(quizStats);
      
      // Scroll to panel
      analyticsPanel.scrollIntoView({ behavior: "smooth", block: "start" });
      
    } catch (error) {
      console.error('Error fetching quiz analytics:', error);
      
      // Show error in the panel
      const panelContent = document.querySelector(".analytics-panel .panel-content");
      if (panelContent) {
        panelContent.innerHTML = `
          <div class="error-state">
            <i class="fas fa-exclamation-circle"></i>
            <p>Failed to load quiz analytics: ${error.message}</p>
          </div>
        `;
      } else {
        this.showError('Failed to load quiz analytics');
      }
    }
  }
  
  // Helper method to create analytics content HTML
  createAnalyticsContent(stats) {
    // Get statistics for associated students only
    const totalAttempts = stats.total_attempts || 0;
    const averageScore = stats.average_score !== undefined ? Math.round(stats.average_score) : 0;
    const totalStudents = stats.total_students || 0;
    const completionRate = stats.completion_rate !== undefined ? Math.round(stats.completion_rate) : 0;
    
    return `
      <div class="analytics-overview">
        <div class="stat-card">
          <span class="stat-value">${totalStudents}</span>
          <span class="stat-label">Total Students</span>
        </div>
        <div class="stat-card">
          <span class="stat-value">${averageScore}%</span>
          <span class="stat-label">Average Score</span>
        </div>
        <div class="stat-card">
          <span class="stat-value">${totalAttempts}</span>
          <span class="stat-label">Total Attempts</span>
        </div>
        <div class="stat-card">
          <span class="stat-value">${completionRate}%</span>
          <span class="stat-label">Completion Rate</span>
        </div>
      </div>
      <div class="recent-attempts">
        <h4>Recent Student Activity</h4>
        <div class="attempts-list">
          ${this.renderRecentAttempts(stats.recent_attempts || [])}
        </div>
      </div>
    `;
  }
  
  // Helper method to render recent attempts
  renderRecentAttempts(attempts) {
    if (!attempts || attempts.length === 0) {
      return '<p class="no-data">No recent student activity</p>';
    }
    
    return attempts.map(attempt => {
      const date = new Date(attempt.attempt_date || new Date());
      const formattedDate = date.toLocaleDateString();
      const formattedTime = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      
      return `
        <div class="attempt-item ${attempt.passed ? 'correct' : 'incorrect'}">
          <div class="attempt-user">
            <i class="fas fa-user-circle"></i>
            <span>${attempt.student_name || 'Unknown Student'}</span>
          </div>
          <div class="attempt-details">
            <span class="attempt-date">${formattedDate} at ${formattedTime}</span>
            <span class="attempt-score">Score: ${Math.round(attempt.score)}%</span>
            <span class="attempt-status">${attempt.passed ? 'Passed' : 'Failed'}</span>
            <span class="attempt-completion">${attempt.is_completed ? 'Completed' : 'Incomplete'}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  showOptionsMenu(button, quizId) {
    const existingMenu = document.querySelector(".options-menu");
    if (existingMenu) existingMenu.remove();

    const menu = document.createElement("div");
    menu.className = "options-menu";
    menu.innerHTML = `
      <button class="option-item" data-action="delete">
        <i class="fas fa-trash-alt"></i> Delete
      </button>
    `;

    document.body.appendChild(menu);

    const buttonRect = button.getBoundingClientRect();
    menu.style.top = `${buttonRect.bottom + 5}px`;
    menu.style.left = `${buttonRect.left - menu.offsetWidth + buttonRect.width}px`;

    // Handle menu item clicks
    menu.querySelectorAll(".option-item").forEach(item => {
      item.addEventListener("click", async () => {
        const action = item.dataset.action;
        if (action === "delete") {
          await this.deleteQuiz(quizId);
        }
        menu.remove();
      });
    });

    // Close menu when clicking outside
    document.addEventListener("click", (e) => {
      if (!menu.contains(e.target) && !button.contains(e.target)) {
        menu.remove();
      }
    });
  }

  async updateQuiz(quizId, data) {
    try {
      const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.TEACHER.QUIZZES}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('userToken')}`
        },
        body: JSON.stringify({ quiz_id: quizId, ...data })
      });

      if (!response.ok) throw new Error('Failed to update quiz');

      const responseData = await response.json();
      
      if (responseData.success) {
        this.hideAllPanels();
        this.loadInitialData();
        this.showSuccess('Quiz updated successfully');
      }
    } catch (error) {
      console.error('Error updating quiz:', error);
      this.showError('Failed to update quiz');
    }
  }

  async duplicateQuiz(quizId) {
    const quiz = this.quizzes.find(q => q.id === parseInt(quizId));
    if (!quiz) return;

    try {
      const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.TEACHER.QUIZZES}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('userToken')}`
        },
        body: JSON.stringify({
          title: `${quiz.title} (Copy)`,
          subject_id: quiz.subject_id,
          correct_answer: quiz.correct_answer
        })
      });

      if (!response.ok) throw new Error('Failed to duplicate quiz');

      const data = await response.json();
      
      if (data.success) {
        this.loadInitialData();
        this.showSuccess('Quiz duplicated successfully');
      }
    } catch (error) {
      console.error('Error duplicating quiz:', error);
      this.showError('Failed to duplicate quiz');
    }
  }

  async deleteQuiz(quizId) {
    if (!confirm('Are you sure you want to delete this quiz? This action cannot be undone.')) {
      return;
    }

    try {
      // Show loading state
      this.showLoading();
      
      // Use the DELETE endpoint from API_CONFIG
      console.log(`Attempting to delete quiz ${quizId}...`);
      
      const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.QUIZ.DELETE}?id=${quizId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('userToken')}`
        }
      });

      // First check the response type
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const responseText = await response.text();
        console.error('Non-JSON response received:', responseText.substring(0, 200));
        throw new Error('Server returned an invalid response format');
      }

      // Parse the JSON response
      const data = await response.json();
      console.log('Delete response:', data);
      
      // Check for success or error
      if (data.success) {
        this.loadInitialData();
        this.showSuccess(data.message || 'Quiz deleted successfully');
      } else {
        throw new Error(data.message || 'Failed to delete quiz');
      }
    } catch (error) {
      console.error('Error deleting quiz:', error);
      this.showError(error.message || 'Failed to delete quiz');
    } finally {
      this.hideLoading();
    }
  }

  updatePagination(currentPage, totalPages) {
    const pagination = document.querySelector(".pagination");
    if (!pagination) return;

    // Ensure we have valid page numbers
    currentPage = Math.max(1, parseInt(currentPage) || 1);
    totalPages = Math.max(1, parseInt(totalPages) || 1);
    
    let buttons = '';
    
    // Previous button
    buttons += `
      <button class="page-button prev" aria-label="Previous page" ${currentPage <= 1 ? 'disabled' : ''}>
        <i class="fas fa-chevron-left"></i>
      </button>
    `;

    // Page numbers - limit display for large numbers of pages
    if (totalPages <= 7) {
      // Show all page numbers for small total pages
      for (let i = 1; i <= totalPages; i++) {
        buttons += `
          <button class="page-button ${i === currentPage ? 'active' : ''}">${i}</button>
        `;
      }
    } else {
      // Show page 1
      buttons += `
        <button class="page-button ${1 === currentPage ? 'active' : ''}">1</button>
      `;
      
      // Show ellipsis if needed
      if (currentPage > 3) {
        buttons += `<span class="page-ellipsis">...</span>`;
      }
      
      // Show pages around current page
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);
      
      for (let i = start; i <= end; i++) {
        buttons += `
          <button class="page-button ${i === currentPage ? 'active' : ''}">${i}</button>
        `;
      }
      
      // Show ellipsis if needed
      if (currentPage < totalPages - 2) {
        buttons += `<span class="page-ellipsis">...</span>`;
      }
      
      // Show last page
      buttons += `
        <button class="page-button ${totalPages === currentPage ? 'active' : ''}">${totalPages}</button>
      `;
    }

    // Next button
    buttons += `
      <button class="page-button next" aria-label="Next page" ${currentPage >= totalPages ? 'disabled' : ''}>
        <i class="fas fa-chevron-right"></i>
      </button>
    `;

    pagination.innerHTML = buttons;

    // Add event listeners to new buttons
    pagination.querySelectorAll(".page-button").forEach(btn => {
      if (!btn.disabled) {
        btn.addEventListener("click", () => {
          if (btn.classList.contains('prev')) {
            this.currentPage = Math.max(1, this.currentPage - 1);
          } else if (btn.classList.contains('next')) {
            this.currentPage = Math.min(totalPages, this.currentPage + 1);
          } else {
            this.currentPage = parseInt(btn.textContent);
          }
          this.loadInitialData();
        });
      }
    });
  }

  hideAllPanels() {
    const detailsSection = document.querySelector(".quiz-details-section");
    const editPanel = document.querySelector(".edit-quiz-panel");
    const analyticsPanel = document.querySelector(".analytics-panel");

    if (detailsSection) detailsSection.style.display = "none";
    if (editPanel) editPanel.style.display = "none";
    if (analyticsPanel) analyticsPanel.style.display = "none";
  }

  showLoading() {
    this.loading = true;
    this.quizList.innerHTML = `
            <div class="loading-state">
                <i class="fas fa-spinner fa-spin"></i>
                <p>Loading quizzes...</p>
            </div>
    `;
  }

  hideLoading() {
    this.loading = false;
  }

  showError(message) {
    const error = document.createElement("div");
    error.className = "error-message";
    error.innerHTML = `
            <i class="fas fa-exclamation-circle"></i>
            <p>${message}</p>
    `;
    
    // Find a proper place to show the error
    const editPanel = document.querySelector(".edit-panel");
    if (editPanel && editPanel.style.display !== 'none') {
      // If an edit panel is open, show the error in the panel
      const formActions = editPanel.querySelector('.form-actions');
      if (formActions) {
        // Remove any existing error messages
        const existingError = formActions.querySelector('.error-message');
        if (existingError) {
          existingError.remove();
        }
        
        // Insert the error before the form actions
        formActions.insertAdjacentElement('beforebegin', error);
        
        // Scroll to the error
        error.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        // Remove the error after 8 seconds
        setTimeout(() => error.remove(), 8000);
        return;
      }
    }
    
    // Default: append to quiz list
    this.quizList.appendChild(error);
    setTimeout(() => error.remove(), 5000);
  }

  showSuccess(message) {
    const success = document.createElement("div");
    success.className = "success-message";
    success.innerHTML = `
      <i class="fas fa-check-circle"></i>
      <p>${message}</p>
    `;
    this.quizList.appendChild(success);
    setTimeout(() => success.remove(), 5000);
  }

  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  async handleLogout() {
    try {
      // Use auth module's logout method
      auth.logout(true);
    } catch (error) {
      console.error("Logout failed:", error);
    }
  }

  populateEditPanel(panel, quiz) {
    const panelContent = panel.querySelector('.panel-content');
    
    // Create the edit form
    const form = `
      <form class="edit-quiz-form">
        <div class="form-row">
          <div class="form-group">
            <label for="edit-title-${quiz.id}">Quiz Title</label>
            <input type="text" id="edit-title-${quiz.id}" class="edit-title" value="${quiz.title || ''}" required>
          </div>
          <div class="form-group">
            <label for="edit-subject-${quiz.id}">Subject</label>
            <select id="edit-subject-${quiz.id}" class="edit-subject" required>
              <option value="">Select subject</option>
              <!-- Will be populated dynamically -->
            </select>
          </div>
        </div>
        
        <div class="form-group">
          <label for="edit-description-${quiz.id}">Description</label>
          <textarea id="edit-description-${quiz.id}" class="edit-description" rows="3">${quiz.description || ''}</textarea>
        </div>
        
        <div class="form-row">
          <div class="form-group">
            <label for="edit-pass-score-${quiz.id}">Passing Score (%)</label>
            <input type="number" id="edit-pass-score-${quiz.id}" class="edit-pass-score" value="${quiz.passing_score || 60}" min="0" max="100">
          </div>
          <div class="form-group">
            <label for="edit-status-${quiz.id}">Status</label>
            <select id="edit-status-${quiz.id}" class="edit-status">
              <option value="draft" ${!quiz.is_active ? 'selected' : ''}>Draft</option>
              <option value="published" ${quiz.is_active ? 'selected' : ''}>Published</option>
            </select>
          </div>
        </div>
        
        <div class="questions-section">
          <h4>Questions</h4>
          <div class="questions-list" id="questions-list-${quiz.id}">
            <!-- Questions will be populated here -->
          </div>
          <button type="button" class="add-question-btn" data-quiz-id="${quiz.id}">
            <i class="fas fa-plus"></i> Add Question
          </button>
        </div>
        
        <!-- Quiz Settings Section -->
        <div class="settings-section">
          <h4><i class="fas fa-cog"></i> Quiz Settings</h4>
          <div class="settings-grid">
            <div class="setting-item">
              <label class="switch-label">
                <input type="checkbox" id="edit-shuffle-${quiz.id}" class="edit-shuffle" ${quiz.shuffle_questions ? 'checked' : ''}>
                <span class="switch"></span>
                Shuffle Questions
              </label>
              <p>Randomize question order for each student</p>
            </div>
            <div class="setting-item">
              <label class="switch-label">
                <input type="checkbox" id="edit-show-results-${quiz.id}" class="edit-show-results" ${quiz.show_results ? 'checked' : ''}>
                <span class="switch"></span>
                Show Results Immediately
              </label>
              <p>Display score after submission</p>
            </div>
          </div>
        </div>
        
        <div class="form-actions">
          <button type="button" class="action-btn outline cancel-edit">Cancel</button>
          <button type="button" class="action-btn primary save-quiz" data-quiz-id="${quiz.id}">Save Changes</button>
        </div>
      </form>
    `;
    
    // Replace loading state with form
    panelContent.innerHTML = form;
    
    // Add comprehensive styles to match create-quiz.html
    const styleEl = document.createElement('style');
    styleEl.textContent = `
      .edit-panel {
        background: #fff;
        border-radius: 12px;
        box-shadow: 0 5px 20px rgba(0,0,0,0.15);
        margin: 20px 0;
        overflow: hidden;
        max-width: 100%;
        transition: all 0.3s ease;
      }
      .panel-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 18px 24px;
        background: #f8f9fa;
        border-bottom: 1px solid #e9ecef;
      }
      .panel-header h3 {
        margin: 0;
        font-size: 20px;
        font-weight: 600;
        color: #343a40;
      }
      .close-panel {
        background: none;
        border: none;
        cursor: pointer;
        font-size: 18px;
        color: #6c757d;
        transition: color 0.2s;
      }
      .close-panel:hover {
        color: #343a40;
      }
      .panel-content {
        padding: 24px;
      }
      .edit-quiz-form .form-row {
        display: flex;
        gap: 24px;
        margin-bottom: 20px;
      }
      .edit-quiz-form .form-group {
        flex: 1;
        margin-bottom: 20px;
      }
      .edit-quiz-form label {
        display: block;
        margin-bottom: 8px;
        font-weight: 500;
        color: #495057;
      }
      .edit-quiz-form input,
      .edit-quiz-form select,
      .edit-quiz-form textarea {
        width: 100%;
        padding: 10px 14px;
        border: 1px solid #ced4da;
        border-radius: 6px;
        font-size: 15px;
        transition: border-color 0.2s;
      }
      .edit-quiz-form input:focus,
      .edit-quiz-form select:focus,
      .edit-quiz-form textarea:focus {
        border-color: #9d4edd;
        outline: none;
        box-shadow: 0 0 0 3px rgba(76, 175, 80, 0.1);
      }
      .questions-section, .settings-section {
        margin-top: 30px;
        border-top: 1px solid #e9ecef;
        padding-top: 24px;
      }
      .questions-section h4, .settings-section h4 {
        margin-top: 0;
        margin-bottom: 16px;
        font-size: 18px;
        color: #343a40;
      }
      .question-item {
        background: #f8f9fa;
        border: 1px solid #e9ecef;
        border-radius: 8px;
        padding: 18px;
        margin-bottom: 16px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.04);
        transition: box-shadow 0.2s;
      }
      .question-item:hover {
        box-shadow: 0 4px 8px rgba(0,0,0,0.08);
      }
      .question-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 16px;
      }
      .question-info .question-number {
        font-weight: 600;
        color: #495057;
      }
      .question-actions button {
        background: none;
        border: none;
        cursor: pointer;
        margin-left: 8px;
        color: #6c757d;
        transition: color 0.2s;
      }
      .question-actions button:hover {
        color: #343a40;
      }
      .question-actions button.delete-question:hover {
        color: #dc3545;
      }
      .add-question-btn, .add-option-btn {
        background: none;
        border: 1px dashed #ced4da;
        padding: 12px;
        border-radius: 6px;
        cursor: pointer;
        display: block;
        width: 100%;
        margin: 16px 0;
        text-align: center;
        color: #6c757d;
        font-weight: 500;
        transition: all 0.2s;
      }
      .add-question-btn:hover, .add-option-btn:hover {
        border-color: #6a0dad
        background: rgba(76, 175, 80, 0.05);
        color: #6a0dad;
      }
      .form-actions {
        display: flex;
        justify-content: flex-end;
        gap: 12px;
        margin-top: 30px;
      }
      .action-btn {
        padding: 10px 20px;
        border-radius: 6px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
        border: none;
        font-size: 15px;
      }
      .action-btn.primary {
        background: #9d4edd;;
        color: white;
        width: 10vw;
      }
      .action-btn.primary:hover {
        background: #6a0dad;
      }
      .action-btn.outline {
        background: transparent;
        border: 1px solid #ced4da;
        color: #495057;
        width: 5vw;
      }
      .action-btn.outline:hover {
        border-color: #6c757d;
        color: #343a40;
      }
      .options-list {
        margin: 16px 0;
      }
      .option-item {
        display: flex;
        align-items: center;
        margin-bottom: 10px;
        background: #fff;
        padding: 10px;
        border-radius: 5px;
        border: 1px solid #e9ecef;
      }
      .option-item input[type="checkbox"],
      .option-item input[type="radio"] {
        width: auto;
        margin-right: 12px;
        transform: scale(1.2);
      }
      .option-item input[type="text"] {
        flex: 1;
        margin: 0 10px;
      }
      .option-item button {
        background: none;
        border: none;
        cursor: pointer;
        color: #6c757d;
        transition: color 0.2s;
      }
      .option-item button:hover {
        color: #dc3545;
      }
      .text-answer {
        background: #fff;
        padding: 16px;
        border-radius: 5px;
        border: 1px solid #e9ecef;
        margin: 16px 0;
      }
      .text-answer .correct-answer {
        width: 100%;
      }
      .loading-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 30px;
        color: #6c757d;
      }
      .loading-state i {
        font-size: 24px;
        margin-bottom: 10px;
      }
      /* Animation for loading spinner */
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
      .fa-spinner {
        animation: spin 1s linear infinite;
      }
      .no-questions {
        text-align: center;
        padding: 20px;
        color: #6c757d;
        font-style: italic;
      }
      
      /* Animation for question movement */
      @keyframes questionMoved {
        0% { 
          transform: translateX(0);
          background-color: #f8f9fa;
        }
        25% { 
          transform: translateX(5px);
          background-color: rgba(76, 175, 80, 0.1);
        }
        50% { 
          transform: translateX(-5px);
          background-color: rgba(76, 175, 80, 0.2);
        }
        75% { 
          transform: translateX(5px);
          background-color: rgba(76, 175, 80, 0.1);
        }
        100% { 
          transform: translateX(0);
          background-color: #f8f9fa;
        }
      }
      
      .question-moved {
        animation: questionMoved 0.8s ease;
        border: 1px solid #9d4edd !important;
      }

      /* Settings section styles */
      .settings-section {
        margin-top: 30px;
        border-top: 1px solid #e9ecef;
        padding-top: 24px;
      }
      .settings-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
        gap: 20px;
      }
      .setting-item {
        background: #f8f9fa;
        border-radius: 8px;
        padding: 16px;
      }
      .setting-item p {
        margin-top: 8px;
        color: #6c757d;
        font-size: 14px;
      }
      .switch-label {
        display: flex;
        align-items: center;
        cursor: pointer;
        font-weight: 500;
      }
      .switch {
        position: relative;
        display: inline-block;
        width: 40px;
        height: 20px;
        background-color: #ccc;
        border-radius: 20px;
        margin-right: 10px;
        transition: all 0.3s;
      }
      .switch::after {
        content: '';
        position: absolute;
        width: 18px;
        height: 18px;
        border-radius: 18px;
        background-color: white;
        top: 1px;
        left: 1px;
        transition: all 0.3s;
      }
      input:checked + .switch::after {
        transform: translateX(20px);
      }
      input:checked + .switch {
        background-color: #6a0dad;
      }
      .switch-label input {
        display: none;
      }
    `;
    document.head.appendChild(styleEl);
    
    // Load subjects and populate select
    this.loadSubjectsForEdit(quiz.id, quiz.subject_id);
    
    // Load questions
    if (quiz.questions && Array.isArray(quiz.questions)) {
      this.populateQuestionsForEdit(quiz.id, quiz.questions);
    }
    
    // Setup event listeners
    this.setupEditPanelEvents(panel, quiz.id);
  }

  async loadSubjectsForEdit(quizId, selectedSubjectId) {
    try {
      const subjectSelect = document.getElementById(`edit-subject-${quizId}`);
      if (!subjectSelect) return;
      
      // Add loading state
      subjectSelect.innerHTML = '<option value="">Loading subjects...</option>';
      
      // Fetch subjects
      const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.COMMON.SUBJECTS}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('userToken')}`
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to load subjects');
      }
      
      const data = await response.json();
      
      if (data.success && Array.isArray(data.subjects)) {
        // Clear loading state
        subjectSelect.innerHTML = '<option value="">Select subject</option>';
        
        // Add subjects
        data.subjects.forEach(subject => {
          const option = document.createElement('option');
          option.value = subject.id;
          option.textContent = subject.name;
          option.selected = subject.id == selectedSubjectId;
          subjectSelect.appendChild(option);
        });
      } else {
        throw new Error('Invalid subject data format');
      }
    } catch (error) {
      console.error('Error loading subjects:', error);
      const subjectSelect = document.getElementById(`edit-subject-${quizId}`);
      if (subjectSelect) {
        subjectSelect.innerHTML = '<option value="">Failed to load subjects</option>';
      }
    }
  }

  populateQuestionsForEdit(quizId, questions) {
    const questionsList = document.getElementById(`questions-list-${quizId}`);
    if (!questionsList) return;
    
    // Clear existing questions
    questionsList.innerHTML = '';
    
    // Sort questions by order if available
    // This ensures questions appear in the correct order as stored in the database
    const sortedQuestions = [...questions].sort((a, b) => {
      const orderA = a.question_order || 0;
      const orderB = b.question_order || 0;
      return orderA - orderB;
    });
    
    // Add each question
    sortedQuestions.forEach((question, index) => {
      const questionNumber = index + 1;
      
      const questionItem = document.createElement('div');
      questionItem.className = 'question-item';
      questionItem.dataset.questionId = question.id;
      questionItem.dataset.questionOrder = question.question_order || questionNumber;
      
      let optionsHtml = '';
      
      // Generate different options based on question type
      if (question.question_type === 'multiple_choice' && question.answers) {
        // Multiple choice options
        optionsHtml = `
          <div class="options-list" data-type="multiple_choice">
            ${question.answers.map((answer, i) => `
              <div class="option-item">
                <input type="checkbox" name="correct-${question.id}-${i}" ${answer.is_correct ? 'checked' : ''}>
                <input type="text" value="${answer.answer_text || ''}" placeholder="Option ${i+1}">
                <button class="remove-option" data-question="${question.id}" data-option="${i}">
                  <i class="fas fa-times"></i>
                </button>
              </div>
            `).join('')}
          </div>
          <button type="button" class="add-option-btn" data-question="${question.id}">
            <i class="fas fa-plus"></i> Add Option
          </button>
        `;
      } else if (question.question_type === 'true_false') {
        // True/False options
        const trueChecked = question.answers && question.answers.find(a => a.answer_text.toLowerCase() === 'true' && a.is_correct);
        const falseChecked = question.answers && question.answers.find(a => a.answer_text.toLowerCase() === 'false' && a.is_correct);
        
        optionsHtml = `
          <div class="options-list" data-type="true_false">
            <div class="option-item">
              <input type="radio" name="correct-tf-${question.id}" value="true" ${trueChecked ? 'checked' : ''}>
              <input type="text" value="True" readonly>
            </div>
            <div class="option-item">
              <input type="radio" name="correct-tf-${question.id}" value="false" ${falseChecked ? 'checked' : ''}>
              <input type="text" value="False" readonly>
            </div>
          </div>
        `;
      } else if (question.question_type === 'short_answer') {
        // Short answer
        const correctAnswer = question.answers && question.answers.length > 0 ? 
          question.answers.find(a => a.is_correct)?.answer_text || '' : '';
        
        optionsHtml = `
          <div class="text-answer" data-type="short_answer">
            <input type="text" class="correct-answer" value="${correctAnswer}" placeholder="Enter the correct answer">
          </div>
        `;
      }
      
      questionItem.innerHTML = `
        <div class="question-header">
          <div class="question-info">
            <span class="question-number">Question ${questionNumber}</span>
          </div>
          <div class="question-actions">
            <button class="icon-btn move-up" title="Move Up" data-question="${question.id}">
              <i class="fas fa-arrow-up"></i>
            </button>
            <button class="icon-btn move-down" title="Move Down" data-question="${question.id}">
              <i class="fas fa-arrow-down"></i>
            </button>
            <button class="icon-btn delete-question" title="Delete" data-question="${question.id}">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </div>
        <div class="question-content">
          <div class="form-group">
            <label>Question Text</label>
            <input type="text" class="question-text" value="${question.question_text || ''}" placeholder="Enter your question">
          </div>
          <div class="form-group">
            <label>Question Type</label>
            <select class="question-type" data-question="${question.id}">
              <option value="multiple_choice" ${question.question_type === 'multiple_choice' ? 'selected' : ''}>Multiple Choice</option>
              <option value="true_false" ${question.question_type === 'true_false' ? 'selected' : ''}>True/False</option>
              <option value="short_answer" ${question.question_type === 'short_answer' ? 'selected' : ''}>Short Answer</option>
            </select>
          </div>
          ${optionsHtml}
        </div>
      `;
      
      questionsList.appendChild(questionItem);
    });
    
    // If no questions, add a message
    if (questions.length === 0) {
      questionsList.innerHTML = '<p class="no-questions">No questions yet. Click "Add Question" to create your first question.</p>';
    }
  }

  setupEditPanelEvents(panel, quizId) {
    // Cancel button
    panel.querySelector('.cancel-edit').addEventListener('click', () => {
      panel.remove();
    });
    
    // Save button
    panel.querySelector('.save-quiz').addEventListener('click', () => {
      this.saveQuizChanges(quizId);
    });
    
    // Add question button
    panel.querySelector('.add-question-btn').addEventListener('click', () => {
      this.addQuestionToEdit(quizId);
    });
    
    // Question type change
    panel.querySelectorAll('.question-type').forEach(select => {
      select.addEventListener('change', (e) => {
        this.handleEditQuestionTypeChange(e, select.dataset.question);
      });
    });
    
    // Add option buttons
    panel.querySelectorAll('.add-option-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.addOptionToEditQuestion(btn.dataset.question);
      });
    });
    
    // Remove option buttons
    panel.querySelectorAll('.remove-option').forEach(btn => {
      btn.addEventListener('click', () => {
        btn.closest('.option-item').remove();
      });
    });
    
    // Delete question buttons
    panel.querySelectorAll('.delete-question').forEach(btn => {
      btn.addEventListener('click', () => {
        if (confirm('Are you sure you want to delete this question?')) {
          const questionItem = btn.closest('.question-item');
          questionItem.remove();
          this.renumberEditQuestions(quizId);

          // Ensure the questions list is updated correctly
          const questionsList = document.getElementById(`questions-list-${quizId}`);
          if (questionsList && questionsList.children.length === 0) {
            questionsList.innerHTML = '<p class="no-questions">No questions yet. Click "Add Question" to create your first question.</p>';
          }
        }
      });
    });
    
    // Move question buttons
    panel.querySelectorAll('.move-up').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const questionItem = btn.closest('.question-item');
        const prevQuestion = questionItem.previousElementSibling;
        if (prevQuestion) {
          questionItem.parentNode.insertBefore(questionItem, prevQuestion);
          this.renumberEditQuestions(quizId);
          
          // Add visual feedback
          questionItem.classList.add('question-moved');
          setTimeout(() => {
            questionItem.classList.remove('question-moved');
          }, 800);
        }
      });
    });
    
    panel.querySelectorAll('.move-down').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const questionItem = btn.closest('.question-item');
        const nextQuestion = questionItem.nextElementSibling;
        if (nextQuestion) {
          questionItem.parentNode.insertBefore(nextQuestion, questionItem);
          this.renumberEditQuestions(quizId);
          
          // Add visual feedback
          questionItem.classList.add('question-moved');
          setTimeout(() => {
            questionItem.classList.remove('question-moved');
          }, 800);
        }
      });
    });
  }

  handleEditQuestionTypeChange(event, questionId) {
    const questionItem = event.target.closest('.question-item');
    const type = event.target.value;
    
    // Get the options container
    const questionContent = questionItem.querySelector('.question-content');
    const oldOptionsList = questionContent.querySelector('.options-list, .text-answer');
    const addOptionBtn = questionContent.querySelector('.add-option-btn');
    
    // Remove old options
    if (oldOptionsList) oldOptionsList.remove();
    if (addOptionBtn) addOptionBtn.remove();
    
    // Create new options based on type
    let newOptionsHTML = '';
    
    if (type === 'multiple_choice') {
      newOptionsHTML = `
        <div class="options-list" data-type="multiple_choice">
          <div class="option-item">
            <input type="checkbox" name="correct-${questionId}-0">
            <input type="text" placeholder="Option 1">
            <button class="remove-option" data-question="${questionId}" data-option="0">
              <i class="fas fa-times"></i>
            </button>
          </div>
        </div>
        <button type="button" class="add-option-btn" data-question="${questionId}">
          <i class="fas fa-plus"></i> Add Option
        </button>
      `;
    } else if (type === 'true_false') {
      newOptionsHTML = `
        <div class="options-list" data-type="true_false">
          <div class="option-item">
            <input type="radio" name="correct-tf-${questionId}" value="true" checked>
            <input type="text" value="True" readonly>
          </div>
          <div class="option-item">
            <input type="radio" name="correct-tf-${questionId}" value="false">
            <input type="text" value="False" readonly>
          </div>
        </div>
      `;
    } else if (type === 'short_answer') {
      newOptionsHTML = `
        <div class="text-answer" data-type="short_answer">
          <input type="text" class="correct-answer" placeholder="Enter the correct answer">
        </div>
      `;
    }
    
    // Add new options
    questionContent.insertAdjacentHTML('beforeend', newOptionsHTML);
    
    // Add event listeners for new elements
    const newAddOptionBtn = questionContent.querySelector('.add-option-btn');
    if (newAddOptionBtn) {
      newAddOptionBtn.addEventListener('click', () => {
        this.addOptionToEditQuestion(questionId);
      });
    }
    
    const newRemoveButtons = questionContent.querySelectorAll('.remove-option');
    newRemoveButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        btn.closest('.option-item').remove();
      });
    });
  }

  addQuestionToEdit(quizId) {
    const questionsList = document.getElementById(`questions-list-${quizId}`);
    if (!questionsList) return;
    
    // Remove "no questions" message if it exists
    const noQuestionsMsg = questionsList.querySelector('.no-questions');
    if (noQuestionsMsg) noQuestionsMsg.remove();
    
    // Generate unique question ID
    const newQuestionId = Date.now();
    
    // Create new question element
    const questionItem = document.createElement('div');
    questionItem.className = 'question-item';
    questionItem.dataset.questionId = newQuestionId;
    
    const questionNumber = questionsList.children.length + 1;
    
    questionItem.innerHTML = `
      <div class="question-header">
        <div class="question-info">
          <span class="question-number">Question ${questionNumber}</span>
        </div>
        <div class="question-actions">
          <button class="icon-btn move-up" title="Move Up" data-question="${newQuestionId}">
            <i class="fas fa-arrow-up"></i>
          </button>
          <button class="icon-btn move-down" title="Move Down" data-question="${newQuestionId}">
            <i class="fas fa-arrow-down"></i>
          </button>
          <button class="icon-btn delete-question" title="Delete" data-question="${newQuestionId}">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
      <div class="question-content">
        <div class="form-group">
          <label>Question Text</label>
          <input type="text" class="question-text" placeholder="Enter your question">
        </div>
        <div class="form-group">
          <label>Question Type</label>
          <select class="question-type" data-question="${newQuestionId}">
            <option value="multiple_choice">Multiple Choice</option>
            <option value="true_false">True/False</option>
            <option value="short_answer">Short Answer</option>
          </select>
        </div>
        <div class="options-list" data-type="multiple_choice">
          <div class="option-item">
            <input type="checkbox" name="correct-${newQuestionId}-0">
            <input type="text" placeholder="Option 1">
            <button class="remove-option" data-question="${newQuestionId}" data-option="0">
              <i class="fas fa-times"></i>
            </button>
          </div>
        </div>
        <button type="button" class="add-option-btn" data-question="${newQuestionId}">
          <i class="fas fa-plus"></i> Add Option
        </button>
      </div>
    `;
    
    questionsList.appendChild(questionItem);
    
    // Setup event listeners
    const typeSelect = questionItem.querySelector('.question-type');
    typeSelect.addEventListener('change', (e) => {
      this.handleEditQuestionTypeChange(e, newQuestionId);
    });
    
    const addOptionBtn = questionItem.querySelector('.add-option-btn');
    addOptionBtn.addEventListener('click', () => {
      this.addOptionToEditQuestion(newQuestionId);
    });
    
    const removeOptionBtn = questionItem.querySelector('.remove-option');
    removeOptionBtn.addEventListener('click', () => {
      removeOptionBtn.closest('.option-item').remove();
    });
    
    const deleteBtn = questionItem.querySelector('.delete-question');
    deleteBtn.addEventListener('click', () => {
      if (confirm('Are you sure you want to delete this question?')) {
        questionItem.remove();
        this.renumberEditQuestions(quizId);
      }
    });
    
    const moveUpBtn = questionItem.querySelector('.move-up');
    moveUpBtn.addEventListener('click', () => {
      const prevQuestion = questionItem.previousElementSibling;
      if (prevQuestion) {
        questionItem.parentNode.insertBefore(questionItem, prevQuestion);
        this.renumberEditQuestions(quizId);
      }
    });
    
    const moveDownBtn = questionItem.querySelector('.move-down');
    moveDownBtn.addEventListener('click', () => {
      const nextQuestion = questionItem.nextElementSibling;
      if (nextQuestion) {
        questionItem.parentNode.insertBefore(nextQuestion, questionItem);
        this.renumberEditQuestions(quizId);
      }
    });
    
    // Scroll to the new question
    questionItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  addOptionToEditQuestion(questionId) {
    const questionItem = document.querySelector(`.question-item[data-question-id="${questionId}"]`);
    if (!questionItem) return;
    
    const optionsList = questionItem.querySelector('.options-list[data-type="multiple_choice"]');
    if (!optionsList) return;
    
    const optionCount = optionsList.children.length;
    
    const optionItem = document.createElement('div');
    optionItem.className = 'option-item';
    optionItem.innerHTML = `
      <input type="checkbox" name="correct-${questionId}-${optionCount}">
      <input type="text" placeholder="Option ${optionCount + 1}">
      <button class="remove-option" data-question="${questionId}" data-option="${optionCount}">
        <i class="fas fa-times"></i>
      </button>
    `;
    
    optionsList.appendChild(optionItem);
    
    // Add event listener to remove button
    const removeBtn = optionItem.querySelector('.remove-option');
    removeBtn.addEventListener('click', () => {
      optionItem.remove();
    });
    
    // Focus on the new option
    optionItem.querySelector('input[type="text"]').focus();
  }

  renumberEditQuestions(quizId) {
    const questionsList = document.getElementById(`questions-list-${quizId}`);
    if (!questionsList) return;
    
    const questions = questionsList.querySelectorAll('.question-item');
    questions.forEach((question, index) => {
      const questionNumber = index + 1;
      question.querySelector('.question-number').textContent = `Question ${questionNumber}`;
      
      // Update data attribute with new order
      question.dataset.questionOrder = questionNumber;
      
      // Add a visual indicator that the order has changed
      question.classList.add('question-moved');
      setTimeout(() => {
        question.classList.remove('question-moved');
      }, 800);
    });
  }

  async saveQuizChanges(quizId) {
    try {
      // Show loading state
      const saveButton = document.querySelector(`.edit-panel[data-quiz-id="${quizId}"] .save-quiz`);
      if (saveButton) {
        saveButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
        saveButton.disabled = true;
      }
      
      // Gather form data
      const quizData = this.gatherEditFormData(quizId);
      
      // Log the data being sent for debugging
      console.log('Sending quiz data:', quizData);
      
      // Validate data
      if (!this.validateEditQuizData(quizData)) {
        if (saveButton) {
          saveButton.innerHTML = 'Save Changes';
          saveButton.disabled = false;
        }
        return;
      }
      
      // Send update request
      const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.QUIZ.UPDATE}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('userToken')}`
        },
        body: JSON.stringify(quizData)
      });
      
      // Log the response status for debugging
      console.log('Response status:', response.status);
      
      // Check if response is ok
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Server error response:', errorText);
        
        // Try to parse as JSON if possible
        try {
          const errorJson = JSON.parse(errorText);
          throw new Error(errorJson.error || `Failed to update quiz: ${response.status}`);
        } catch (parseError) {
          // If it's not valid JSON, just use the status code
          throw new Error(`Server error: ${response.status}. ${errorText.substring(0, 100)}`);
        }
      }
      
      // Try to parse the JSON response
      let data;
      try {
        const responseText = await response.text();
        console.log('Raw response:', responseText);
        
        // Handle empty response
        if (!responseText.trim()) {
          throw new Error('Empty response from server');
        }
        
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error('Error parsing JSON response:', parseError);
        throw new Error('Failed to parse server response. Please try again.');
      }
      
      if (data && data.success) {
        // Show success message
        this.showSuccess('Quiz updated successfully');
        
        // Close the panel
        const editPanel = document.querySelector(`.edit-panel[data-quiz-id="${quizId}"]`);
        if (editPanel) {
          editPanel.remove();
        }
        
        // Refresh the quiz list
        await this.loadInitialData();
      } else {
        throw new Error((data && data.error) || 'Failed to update quiz');
      }
    } catch (error) {
      console.error('Error saving quiz changes:', error);
      this.showError(`Failed to save changes: ${error.message}`);
    } finally {
      // Reset button state
      const saveButton = document.querySelector(`.edit-panel[data-quiz-id="${quizId}"] .save-quiz`);
      if (saveButton) {
        saveButton.innerHTML = 'Save Changes';
        saveButton.disabled = false;
      }
    }
  }

  gatherEditFormData(quizId) {
    const panel = document.querySelector(`.edit-panel[data-quiz-id="${quizId}"]`);
    if (!panel) return null;
    
    const quizData = {
      id: quizId,
      title: document.getElementById(`edit-title-${quizId}`).value,
      subject_id: document.getElementById(`edit-subject-${quizId}`).value,
      description: document.getElementById(`edit-description-${quizId}`).value,
      passing_score: parseInt(document.getElementById(`edit-pass-score-${quizId}`).value) || 60,
      status: document.getElementById(`edit-status-${quizId}`).value,
      // Add the quiz settings
      shuffle_questions: document.getElementById(`edit-shuffle-${quizId}`).checked,
      show_results: document.getElementById(`edit-show-results-${quizId}`).checked,
      questions: []
    };
    
    // Gather questions
    const questionItems = panel.querySelectorAll('.question-item');
    questionItems.forEach((item, index) => {
      const questionId = item.dataset.questionId;
      const questionText = item.querySelector('.question-text').value;
      const questionType = item.querySelector('.question-type').value;
      
      const questionData = {
        id: questionId,
        question_text: questionText,
        question_type: questionType,
        question_order: parseInt(item.dataset.questionOrder) || index + 1,
        answers: []
      };
      
      // Gather answers based on question type
      if (questionType === 'multiple_choice') {
        const optionItems = item.querySelectorAll('.options-list[data-type="multiple_choice"] .option-item');
        optionItems.forEach((option, optIndex) => {
          questionData.answers.push({
            answer_text: option.querySelector('input[type="text"]').value,
            is_correct: option.querySelector('input[type="checkbox"]').checked
          });
        });
      } else if (questionType === 'true_false') {
        const trueOption = item.querySelector('input[name="correct-tf-' + questionId + '"][value="true"]');
        const falseOption = item.querySelector('input[name="correct-tf-' + questionId + '"][value="false"]');
        
        questionData.answers.push({
          answer_text: 'True',
          is_correct: trueOption && trueOption.checked
        });
        
        questionData.answers.push({
          answer_text: 'False',
          is_correct: falseOption && falseOption.checked
        });
      } else if (questionType === 'short_answer') {
        const correctAnswer = item.querySelector('.text-answer .correct-answer').value;
        questionData.answers.push({
          answer_text: correctAnswer,
          is_correct: true
        });
      }
      
      quizData.questions.push(questionData);
    });
    
    return quizData;
  }

  validateEditQuizData(data) {
    if (!data) return false;
    
    if (!data.title || !data.subject_id) {
      this.showError('Quiz title and subject are required');
      return false;
    }
    
    if (data.questions.length === 0) {
      this.showError('At least one question is required');
      return false;
    }
    
    // Validate each question
    for (const question of data.questions) {
      if (!question.question_text) {
        this.showError('All questions must have text');
        return false;
      }
      
      if (question.question_type === 'multiple_choice') {
        if (question.answers.length < 2) {
          this.showError('Multiple choice questions must have at least 2 options');
          return false;
        }
        
        if (!question.answers.some(a => a.is_correct)) {
          this.showError('Multiple choice questions must have at least one correct answer');
          return false;
        }
        
        if (question.answers.some(a => !a.answer_text)) {
          this.showError('All options must have text');
          return false;
        }
      } else if (question.question_type === 'true_false') {
        if (question.answers.length !== 2) {
          this.showError('True/False questions must have exactly 2 options');
          return false;
        }
        
        if (!question.answers.some(a => a.is_correct)) {
          this.showError('True/False questions must have a correct answer');
          return false;
        }
      } else if (question.question_type === 'short_answer') {
        if (question.answers.length === 0 || !question.answers[0].answer_text) {
          this.showError('Short answer questions must have a correct answer');
          return false;
        }
      }
    }
    
    return true;
  }
}

// Initialize when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  const quizzes = new TeacherQuizzes();
});