import API_CONFIG from './config.js';
import notifications from './utils/notifications.js';
import auth, { fetchWithTokenRefresh } from './utils/auth.js';

class QuizzesManager {
  constructor() {
    // Initialize dark mode first
    this.initializeDarkMode();
    
    this.quizzesPerPage = 9;
    this.currentPage = 1;
    this.currentTab = "available";
    this.isLoading = false;
    this.selectedQuiz = null;
    this.showTestQuizzes = false;
    this.loadedQuizzes = []; // Store loaded quizzes for immediate access

    // DOM Elements
    this.container = document.querySelector(".quiz-container");
    this.quizGrid = document.querySelector(".quiz-grid");
    this.pagination = document.querySelector(".pagination");
    this.tabs = document.querySelectorAll(".tab-btn");
    this.tabDropdown = document.querySelector(".quiz-tabs-dropdown");
    this.sectionTitle = document.querySelector(".section-title");
    this.logoutButton = document.querySelector(".logout-btn");
    this.previewModal = document.getElementById("quizPreviewModal");
    this.closePreviewBtn = document.getElementById("closePreviewBtn");
    this.cancelQuizBtn = document.getElementById("cancelQuizBtn");
    this.startQuizBtn = document.getElementById("startQuizBtn");
    this.tabTitles = {
      available: "Available Quizzes",
      completed: "Completed Quizzes",
    };

    // Add CSS for avatar container positioning
    this.addTeacherAvatarStyles();

    this.init();
  }

  async init() {
    // Add state tracking
    this.state = {
      hasQuizzes: false
    };
    
    try {
      // Try to get cached data first
      const cachedData = this.getCachedData();
      if (cachedData) {
        this.processQuizData(cachedData);
        // Fetch fresh data in background
        this.fetchAndUpdateCache();
      } else {
        await this.loadQuizzes();
      }
      
      // Only update statistics if we actually have quizzes
      if (this.state.hasQuizzes) {
        try {
          await this.updateStatistics();
        } catch (error) {
          console.warn("Could not update statistics:", error);
          notifications.warning("Could not update statistics. Some features may be limited.");
        }
      }
      
    } catch (error) {
      console.error("Error initializing quizzes:", error);
      notifications.error("Failed to load quizzes. Please try again.");
    }
    
    this.setupEventListeners();
    if (this.tabDropdown) {
      console.log('[DEBUG] quiz-tabs-dropdown found:', this.tabDropdown);
      // Set dropdown to current tab
      this.tabDropdown.value = this.currentTab;
      this.tabDropdown.addEventListener("change", (e) => {
        console.log('[DEBUG] quiz-tabs-dropdown changed:', e.target.value);
        const tabName = e.target.value;
        if (tabName !== this.currentTab) {
          this.currentTab = tabName;
          this.currentPage = 1;
          // Update tab buttons
          this.tabs.forEach((t) => t.classList.remove("active"));
          const btn = Array.from(this.tabs).find(t => t.dataset.tab === tabName);
          if (btn) btn.classList.add("active");
          // Update section title
          if (this.sectionTitle && this.tabTitles[tabName]) {
            this.sectionTitle.textContent = this.tabTitles[tabName];
          }
          // Clear and reload quizzes
          if (this.quizGrid) this.quizGrid.innerHTML = '<div class="loading-indicator">Loading...</div>';
          this.loadQuizzes();
        }
      });
    } else {
      console.warn('[DEBUG] quiz-tabs-dropdown NOT found');
    }
  }

  async processQuizData(data) {
    if (data && data.quizzes) {
      this.state.hasQuizzes = data.quizzes.length > 0;
      // Rest of your existing processQuizData code...
    }
  }

  async loadQuizzes() {
    if (this.isLoading) return;
    
    this.setLoading(true);
    console.log("DEBUG: Loading quizzes...");
    
    try {
      const data = await this.fetchQuizzes();
      
      // Ensure we have a valid data structure
      const processedData = {
        quizzes: data.quizzes || [],
        totalPages: data.totalPages || 0,
        totalQuizzes: data.totalQuizzes || 0,
        currentPage: data.currentPage || 1,
        success: data.success || true
      };

      // Update section title based on current tab
      if (this.sectionTitle) {
        this.sectionTitle.textContent = this.tabTitles[this.currentTab] || 'Quizzes';
      }

      // Render the quizzes (or empty state)
      this.renderQuizzes(processedData);
      
    } catch (error) {
      console.error("Error loading quizzes:", error);
      // Show error in quiz grid
      this.quizGrid.innerHTML = `
        <div class="empty-state error">
          <img src="/quizmaster/frontend/images/error.svg" alt="Error" class="empty-state-icon">
          <h3>Failed to Load Quizzes</h3>
          <p>There was a problem loading your quizzes.</p>
          <p>Please try again later.</p>
        </div>
      `;
    } finally {
      this.setLoading(false);
    }
  }

  async previewQuiz(quizId) {
    try {
      console.log(`Fetching preview data for quiz ID: ${quizId}`);
      
      let quizData = null;
      
      // First check if the quiz is already in our loaded quizzes
      if (this.loadedQuizzes && this.loadedQuizzes.length > 0) {
        const loadedQuiz = this.loadedQuizzes.find(q => q.id == quizId);
        if (loadedQuiz) {
          console.log("Found quiz in loaded quizzes:", loadedQuiz);
          quizData = loadedQuiz;
        }
      }
      
      // If not found in loaded quizzes, try API with multiple possible paths
      if (!quizData) {
        try {
          const paths = [
            // Prioritize the get.php endpoint
            '/quizmaster/backend/quiz/get.php',
            '/quizmaster/backend/student/quizzes.php',
            '/quizmaster/backend/quiz/search.php'
          ];
          
          let response = null;
          let foundData = false;
          
          for (const path of paths) {
            if (foundData) break;
            
            try {
              console.log(`Trying preview from path: ${path}`);
              
              // Add cache-busting parameter
              const timestamp = new Date().getTime();
              response = await fetch(`${path}?id=${quizId}&_t=${timestamp}`, {
                method: 'GET',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${auth.getToken()}`
                }
              });
              
              if (response.ok) {
                console.log(`Successfully loaded preview from ${path}`);
                
                // Try to handle potential invalid JSON response
                const responseText = await response.text();
                
                // Log first part of response for debugging
                console.log(`Raw preview response (first 50 chars): ${responseText.substring(0, 50)}`);
                
                // Find the start of the JSON if there might be PHP errors before it
                let jsonStart = responseText.indexOf('{');
                let jsonText;
                
                if (jsonStart >= 0) {
                  jsonText = responseText.substring(jsonStart);
                  console.log("Found JSON in preview response starting at position", jsonStart);
                } else {
                  jsonText = responseText;
                }
                
                try {
                  // Try to parse with error handling
                  let data;
                  try {
                    data = JSON.parse(jsonText);
                  } catch (parseError) {
                    console.log(`JSON parse error in preview: ${parseError.message}`);
                    // Try a more aggressive approach - look for the first '{' and last '}'
                    const firstBrace = jsonText.indexOf('{');
                    const lastBrace = jsonText.lastIndexOf('}');
                    if (firstBrace >= 0 && lastBrace > firstBrace) {
                      try {
                        const cleanedJson = jsonText.substring(firstBrace, lastBrace + 1);
                        console.log("Attempting with cleaned JSON for preview:", cleanedJson.substring(0, 50));
                        data = JSON.parse(cleanedJson);
                      } catch (e) {
                        console.log("Failed with cleaned JSON too for preview");
                        continue; // Move to next path
                      }
                    } else {
                      continue; // Move to next path
                    }
                  }
                  
                  // Check that we have valid data
                  if (data && (data.success || data.id || (data.quizzes && data.quizzes.length))) {
                    if (data.quizzes && data.quizzes.length) {
                      // If we got a list of quizzes, find the one with matching ID
                      const matchingQuiz = data.quizzes.find(q => q.id == quizId);
                      if (matchingQuiz) {
                        quizData = matchingQuiz;
                        foundData = true;
                        break;
                      }
                    } else if (data.id) {
                      // If we got a single quiz directly
                      quizData = data;
                      foundData = true;
                      break;
                    } else if (data.success) {
                      // Extract quiz from successful response
                      quizData = data;
                      foundData = true;
                      break;
                    }
                  }
                } catch (parseError) {
                  console.log(`Error parsing JSON from ${path}:`, parseError.message);
                }
              } else {
                console.log(`Failed to load preview from ${path}: ${response.status}`);
              }
            } catch (fetchError) {
              console.log(`Request error with ${path}:`, fetchError.message);
            }
          }
        } catch (e) {
          console.log("Preview fetch attempt failed, will try fallbacks:", e.message);
        }
      }
      
      // If API failed, try to find the quiz in local storage
      if (!quizData) {
        const savedQuizzes = localStorage.getItem('studentQuizzes');
        if (savedQuizzes) {
          try {
            const parsedQuizzes = JSON.parse(savedQuizzes);
            if (Array.isArray(parsedQuizzes)) {
              const quiz = parsedQuizzes.find(q => q.id == quizId);
              if (quiz) {
                quizData = quiz;
                console.log("Found quiz in local storage:", quiz);
              }
            }
          } catch (e) {
            console.log("Error retrieving saved quiz:", e.message);
          }
        }
      }
      
      // If we still don't have data, create a mock quiz
      if (!quizData) {
        console.log("Creating mock quiz data for preview");
        const mockQuiz = {
          id: quizId,
          title: "Demo Quiz",
          description: "This is a demo quiz created because the API server is unavailable.",
          subject: "General Knowledge",
          teacherName: "Demo Teacher",
          questionCount: 10,
          passingScore: 60,
          questionTypes: ['multiple_choice', 'true_false']
        };
        quizData = mockQuiz;
      }
      
      this.selectedQuiz = quizData;
      
      // Log the quiz data for debugging
      console.log("Quiz data for preview:", quizData);
      
      // Process avatar path
      let avatarSrc = "";
      
      // Check multiple possible sources for the avatar
      if (quizData.teacherAvatar) {
        avatarSrc = quizData.teacherAvatar;
      } else if (quizData.teacher && quizData.teacher.avatar) {
        avatarSrc = quizData.teacher.avatar;
      } else if (quizData.teacher_avatar) {
        avatarSrc = quizData.teacher_avatar;
      } else {
        avatarSrc = "/quizmaster/frontend/images/profile-placeholder.svg";
      }
      
      // Process the avatar path
      if (avatarSrc.includes('profile_pictures/') || avatarSrc.includes('uploads/')) {
        // Ensure we preserve the uploads directory if it exists
        if (!avatarSrc.startsWith('uploads/') && !avatarSrc.includes('/uploads/')) {
          avatarSrc = 'uploads/' + avatarSrc;
        }
        // Add the backend prefix if not present
        if (!avatarSrc.startsWith('/quizmaster/backend/')) {
          avatarSrc = '/quizmaster/backend/' + avatarSrc;
        }
      } else if (avatarSrc === 'profile-placeholder.svg' || avatarSrc === 'images/profile-placeholder.svg') {
        avatarSrc = '/quizmaster/frontend/images/profile-placeholder.svg';
      } else if (!avatarSrc.startsWith('/quizmaster/') && !avatarSrc.startsWith('http')) {
        avatarSrc = '/quizmaster/frontend/images/' + avatarSrc;
      }

      // Add error handler to fall back to placeholder if image fails to load
      const img = document.createElement('img');
      img.onerror = () => {
        avatarSrc = '/quizmaster/frontend/images/profile-placeholder.svg';
      };
      img.src = avatarSrc;

      // Process teacher data to ensure we have consistent naming
      let teacherName = quizData.teacherName || 
                      (quizData.teacher ? quizData.teacher.name || quizData.teacher.full_name : '') || 
                      'Teacher';
                      
      // IMPORTANT: Always add "Dr." prefix to teacher names
      if (!teacherName.startsWith('Dr.')) {
        teacherName = 'Dr. ' + teacherName;
      }
                        
      // Get subject name from any available source
      const subjectName = quizData.subject || 
                        (quizData.subject_name || '') || 
                        'General Subject';
      
      // Get subject color from quiz data or use default purple
      // Look for the color in the correct properties based on the API response
      const subjectColor = quizData.subject_color || 
                          (quizData.subject && quizData.subject.color) || 
                          '#6A0DAD';
      
      // Extract position data using the universal method
      const previewPositionData = this.extractPositionData(quizData);
      
      // Apply strong defaults directly to image styling - same as in createQuizCard
      const x = previewPositionData ? previewPositionData.x : 0;
      const y = previewPositionData ? previewPositionData.y : 0;
      const scale = previewPositionData ? previewPositionData.scale : 1;
      
      // Create a more forceful style that will override any defaults
      const imagePositionStyles = `
        object-fit: cover !important;
        object-position: ${x}px ${y}px !important;
        transform: scale(${scale}) !important;
        transform-origin: center center !important;
        position: relative !important;
        z-index: 1 !important;
      `;
      
      console.log(`Applied forceful styles to preview modal image:`, {
        x, y, scale,
        styles: imagePositionStyles
      });
      
      // Populate the modal with quiz details
      document.getElementById("previewQuizTitle").textContent = quizData.title || "Quiz";
      // Always ensure "Dr." prefix appears in the preview modal
      document.getElementById("previewTeacherName").textContent = teacherName.startsWith("Dr.") ? teacherName : "Dr. " + teacherName;
      
      // Set the subject name with the correct color
      const previewSubject = document.getElementById("previewSubject");
      previewSubject.textContent = subjectName;
      previewSubject.style.color = subjectColor;
      
      // Add teacher avatar to the preview modal header if it doesn't exist
      const previewHeader = document.querySelector('.preview-header');
      if (previewHeader) {
        // Check if avatar container exists, if not create it
        let avatarContainer = previewHeader.querySelector('.preview-teacher-avatar.avatar-container');
        if (!avatarContainer) {
          avatarContainer = document.createElement('div');
          avatarContainer.className = 'preview-teacher-avatar avatar-container';
          previewHeader.insertBefore(avatarContainer, previewHeader.firstChild);
        }
        
        // Set the avatar image with the same structure and data attributes as quiz cards
        avatarContainer.innerHTML = `
          <img src="${avatarSrc}" alt="${teacherName}" class="teacher-avatar"
               data-position-x="${x}"
               data-position-y="${y}"
               data-scale="${scale}"
               onerror="this.src='/quizmaster/frontend/images/profile-placeholder.svg'">
        `;
        
        // Apply the styles directly to match the dashboard
        const avatarImg = avatarContainer.querySelector('.teacher-avatar');
        if (avatarImg) {
          // 1. Set object-fit and object-position
          avatarImg.style.objectFit = 'cover';
          avatarImg.style.objectPosition = `${x}px ${y}px`;
          
          // 2. Apply transform with GPU acceleration exactly like teacher dashboard
          const transform = `scale3d(${scale}, ${scale}, 1) translateZ(0)`;
          avatarImg.style.setProperty('transform', transform, 'important');
          
          // 3. Add additional styles for rendering quality
          avatarImg.style.setProperty('image-rendering', 'high-quality', 'important');
          avatarImg.style.setProperty('backface-visibility', 'hidden', 'important');
          avatarImg.style.setProperty('transform-origin', 'center center', 'important');
          avatarImg.style.setProperty('transform-style', 'preserve-3d', 'important');
          avatarImg.style.setProperty('will-change', 'transform, object-position', 'important');
        }
      }
      
      // Use actual question count from quiz data with proper fallbacks
      const questionCount = quizData.calculatedQuestionCount || quizData.questionCount || 0;
      document.getElementById("previewQuestionCount").textContent = `${questionCount} Questions`;
      
      // Calculate time limit based on actual questionCount * 15 seconds per question
      // First check if timeLimit is explicitly set
      let timeLimit;
      if (quizData.calculatedTimeLimit) {
        timeLimit = quizData.calculatedTimeLimit;
      } else if (quizData.timeLimit) {
        timeLimit = quizData.timeLimit;
      } else {
        // Calculate based on question count - 15 seconds per question
        timeLimit = questionCount * 15;
      }
      
      // Format time limit display
      let timeLimitDisplay;
      if (timeLimit >= 60) {
        const minutes = Math.floor(timeLimit / 60);
        const seconds = timeLimit % 60;
        timeLimitDisplay = `${minutes} minute${minutes !== 1 ? 's' : ''}${seconds > 0 ? ` ${seconds} second${seconds !== 1 ? 's' : ''}` : ''}`;
      } else {
        timeLimitDisplay = `${timeLimit} seconds`;
      }
      
      document.getElementById("previewTimeLimit").textContent = timeLimitDisplay;
      
      // Print detailed debug information about this quiz
      console.log("QUIZ DETAILS DEBUG:", {
        id: quizData.id,
        title: quizData.title,
        description: quizData.description,
        questionCount: questionCount,
        calculatedTimeLimit: timeLimit,
        passingScore: quizData.passingScore,
        questionTypes: quizData.questionTypes,
        rawQuizData: quizData
      });
      
      // Ensure passing score is properly displayed
      const passingScore = quizData.passingScore || 60; // Default to 60% if not set
      document.getElementById("previewPassingScore").textContent = `${passingScore}% to Pass`;
      
      // Show actual description or fallback message
      document.getElementById("previewDescription").textContent = quizData.description || 'No description available';

      // Display question types
      const questionTypesContainer = document.getElementById("previewQuestionTypes");
      questionTypesContainer.innerHTML = '';
      
      const questionTypes = this.getQuestionTypes(quizData.questionTypes);
      questionTypes.forEach(type => {
        const badge = document.createElement('span');
        badge.className = 'type-badge';
        badge.innerHTML = `
          <i class="fas ${this.getQuestionTypeIcon(type)}"></i>
          ${this.formatQuestionType(type)}
        `;
        questionTypesContainer.appendChild(badge);
      });

      // Show the modal
      this.previewModal.classList.add('active');

      // Additional debug log for position data
      console.log(`Preview quiz ${quizId} - Debug image and teacher properties:`, {
        'Direct Properties': {
          teacher_image_position_x: quizData.teacher_image_position_x,
          teacher_image_position_y: quizData.teacher_image_position_y,
          teacher_image_scale: quizData.teacher_image_scale,
          image_position_x: quizData.image_position_x,
          image_position_y: quizData.image_position_y,
          image_scale: quizData.image_scale,
        },
        'Teacher Object': quizData.teacher || 'Not available',
        'Extracted Position': previewPositionData
      });

    } catch (error) {
      console.error('Error loading quiz details:', error);
      notifications.error('Failed to load quiz details. The server may be unavailable.');
    }
  }

  getQuestionTypes(typesData) {
    // If we receive an array of types, return it
    if (Array.isArray(typesData)) {
      return typesData;
    }
    
    // If we receive a string of comma-separated types
    if (typeof typesData === 'string') {
      return typesData.split(',').map(type => type.trim());
    }
    
    // If we don't have type data, return default types
    return ['multiple_choice', 'true_false', 'short_answer'];
  }

  getQuestionTypeIcon(type) {
    switch (type) {
      case 'multiple_choice':
        return 'fa-list-ul';
      case 'true_false':
        return 'fa-toggle-on';
      case 'short_answer':
        return 'fa-keyboard';
      default:
        return 'fa-question';
    }
  }

  formatQuestionType(type) {
    switch (type) {
      case 'multiple_choice':
        return 'Multiple Choice';
      case 'true_false':
        return 'True/False';
      case 'short_answer':
        return 'Short Answer';
      default:
        return type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
    }
  }

  closePreviewModal() {
    this.previewModal.classList.remove('active');
    this.selectedQuiz = null;
  }

  startQuiz() {
    if (!this.selectedQuiz) return;
    
    // Navigate to the quiz answer page
    window.location.href = `quiz-answer.html?id=${this.selectedQuiz.id}`;
  }

  renderQuizzes(data) {
    // Clear any existing content
    this.quizGrid.innerHTML = '';
    this.pagination.innerHTML = '';

    // Check if we have quizzes
    if (!data.quizzes || data.quizzes.length === 0) {
      let emptyMessage = '';
      
      if (this.currentTab === 'available') {
        emptyMessage = `
          <div class="empty-state">
            <i class="fas fa-book-open fa-3x"></i>
            <h3>No Available Quizzes</h3>
            <p>There are no quizzes available for you at the moment.</p>
            <p>Check back later for new quizzes from your teachers!</p>
          </div>
        `;
      } else {
        emptyMessage = `
          <div class="empty-state">
            <i class="fas fa-graduation-cap fa-3x"></i>
            <h3>No Completed Quizzes</h3>
            <p>You haven't completed any quizzes yet.</p>
            <p>Head over to the "Available Quizzes" tab to start your first quiz!</p>
          </div>
        `;
      }
      
      // Add empty state styles if not already added
      if (!document.getElementById('empty-state-styles')) {
        const styleEl = document.createElement('style');
        styleEl.id = 'empty-state-styles';
        styleEl.textContent = `
          .empty-state {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 3rem;
            text-align: center;
            background: var(--surface);
            border-radius: 12px;
            margin: 2rem auto;
            max-width: 500px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
          }
          
          .empty-state i {
            color: var(--primary);
            margin-bottom: 1.5rem;
            opacity: 0.8;
          }
          
          .empty-state h3 {
            color: var(--text-dark);
            font-size: 1.5rem;
            margin-bottom: 1rem;
          }
          
          .empty-state p {
            color: var(--text-medium);
            margin: 0.5rem 0;
            font-size: 1rem;
            line-height: 1.5;
          }
          
          .empty-state.error i {
            color: var(--error);
          }
        `;
        document.head.appendChild(styleEl);
      }
      
      this.quizGrid.innerHTML = emptyMessage;
      return;
    }
    
    // If we have quizzes, render them as before
    this.quizGrid.innerHTML = data.quizzes.map(quiz => this.createQuizCard(quiz)).join("");
    
    // Add event listeners to the quiz cards and buttons
    const answerButtons = document.querySelectorAll('.answer-btn');
    answerButtons.forEach(button => {
      button.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent triggering card click
        const quizId = button.getAttribute('data-quiz-id');
        this.previewQuiz(quizId);
      });
    });
    
    // Add click event to entire card for available quizzes
    const quizCards = document.querySelectorAll('.quiz-card:not(.completed)');
    quizCards.forEach(card => {
      card.addEventListener('click', () => {
        const quizId = card.getAttribute('data-quiz-id');
        this.previewQuiz(quizId);
      });
    });
    
    // Force style application for teacher images
    this.forceTeacherImageStyles();
    
    // Update pagination if we have multiple pages
    if (data.totalPages > 1) {
    this.updatePagination(data.totalPages);
    }
  }

  createQuizCard(quiz) {
    // Process the avatar path to ensure it works correctly
    let avatarSrc = "";
    
    // Check multiple possible sources for the avatar
    if (quiz.teacherAvatar) {
      avatarSrc = quiz.teacherAvatar;
    } else if (quiz.teacher && quiz.teacher.avatar) {
      avatarSrc = quiz.teacher.avatar;
    } else if (quiz.teacher_avatar) {
      avatarSrc = quiz.teacher_avatar;
    } else {
      avatarSrc = "/quizmaster/frontend/images/profile-placeholder.svg";
    }
    
    // Process the avatar path
    if (avatarSrc.includes('profile_pictures/') || avatarSrc.includes('uploads/')) {
      // Ensure we preserve the uploads directory if it exists
      if (!avatarSrc.startsWith('uploads/') && !avatarSrc.includes('/uploads/')) {
        avatarSrc = 'uploads/' + avatarSrc;
      }
      // Add the backend prefix if not present
      if (!avatarSrc.startsWith('/quizmaster/backend/')) {
        avatarSrc = '/quizmaster/backend/' + avatarSrc;
      }
    } else if (avatarSrc === 'profile-placeholder.svg' || avatarSrc === 'images/profile-placeholder.svg') {
      avatarSrc = '/quizmaster/frontend/images/profile-placeholder.svg';
    } else if (!avatarSrc.startsWith('/quizmaster/') && !avatarSrc.startsWith('http')) {
      avatarSrc = '/quizmaster/frontend/images/' + avatarSrc;
    }

    // Add error handler to fall back to placeholder if image fails to load
    const img = document.createElement('img');
    img.onerror = () => {
      avatarSrc = '/quizmaster/frontend/images/profile-placeholder.svg';
    };
    img.src = avatarSrc;
    
    // Get teacher name from any available source
    let teacherName = quiz.teacherName || 
                    (quiz.teacher ? quiz.teacher.name || quiz.teacher.full_name : '') || 
                    'Teacher';
    
    // IMPORTANT: Always add "Dr." prefix to teacher names
    if (!teacherName.startsWith('Dr.')) {
      teacherName = 'Dr. ' + teacherName;
    }
                      
    // Get subject name from any available source
    const subjectName = quiz.subject || 
                      (quiz.subject_name || '') || 
                      'General Subject';
    
    // Get subject color from the quiz data or use default purple
    // Look for the color in the correct properties based on the API response
    const subjectColor = quiz.subject_color || 
                        (quiz.subject && quiz.subject.color) || 
                        '#6A0DAD';
    
    // Process question count
    // Look for questionCount in all its possible formats
    let questionCount = 0;
    if (typeof quiz.questionCount === 'number') {
      questionCount = quiz.questionCount;
    } else if (typeof quiz.question_count === 'number') {
      questionCount = quiz.question_count;
    } else if (quiz.questions && Array.isArray(quiz.questions)) {
      questionCount = quiz.questions.length;
    }
    
    // Calculate time limit
    let timeLimit = 0;
    if (typeof quiz.timeLimit === 'number') {
      timeLimit = quiz.timeLimit;
    } else if (typeof quiz.time_limit === 'number') {
      timeLimit = quiz.time_limit;
    } else {
      // Default to 15 seconds per question
      timeLimit = questionCount * 15;
    }
    
    // Add these fields to the quiz object for later use
    quiz.calculatedQuestionCount = questionCount;
    quiz.calculatedTimeLimit = timeLimit;
    
    // Try to extract position data using our universal method
    const positionData = this.extractPositionData(quiz);
    
    // Apply strong defaults directly to image styling
    // Force specific style properties to ensure they get applied
    const x = positionData ? positionData.x : 0;
    const y = positionData ? positionData.y : 0; 
    const scale = positionData ? positionData.scale : 1;
    
    // This object-fit + object-position style is critical for positioning
    const imagePositionStyles = {
      x: x,
      y: y,
      scale: scale
    };
    
    // Log the styles to be applied
    console.log(`Applied forceful styles to quiz ${quiz.id} teacher image:`, imagePositionStyles);
    
    const questionTypesBadges = this.getQuizTypesBadges(quiz);

    if (this.currentTab === "available") {
      return `
        <div class="quiz-card" data-quiz-id="${quiz.id}">
          <div class="teacher-info">
            <div class="avatar-container">
              <img src="${avatarSrc}" alt="${teacherName}" class="teacher-avatar"
                   data-position-x="${x}"
                   data-position-y="${y}"
                   data-scale="${scale}"
                   onerror="this.src='/quizmaster/frontend/images/profile-placeholder.svg'">
            </div>
            <div class="teacher-details">
              <div class="teacher-name">${teacherName}</div>
              <div class="subject" style="color: ${subjectColor}">${subjectName}</div>
            </div>
          </div>
          <div class="quiz-content">
            <h3 class="quiz-title">${quiz.title}</h3>
            <p class="quiz-description">${this.truncateText(quiz.description, 120)}</p>
            ${questionTypesBadges}
          </div>
          <button class="answer-btn" data-quiz-id="${quiz.id}">
            <i class="fas fa-play"></i>
            <span>Take Quiz</span>
          </button>
        </div>
      `;
    } else {
      // Format completed date
      const completedDate = new Date(quiz.completedDate).toLocaleDateString();
      
      // Debug logging for isCorrect value
      console.log(`Quiz ${quiz.id}: score=${quiz.score}, passingScore=${quiz.passingScore}`);
      
      // Directly compare score with passing score to determine if passed
      const score = parseInt(quiz.score || 0);
      const passingScore = parseInt(quiz.passingScore || 60);
      const isPassed = score >= passingScore;
      
      const statusClass = isPassed ? "correct" : "wrong";
      const statusText = isPassed ? "Passed" : "Failed";
      
      return `
        <div class="quiz-card completed" data-quiz-id="${quiz.id}">
          <div class="teacher-info">
            <div class="avatar-container">
              <img src="${avatarSrc}" alt="${teacherName}" class="teacher-avatar"
                   data-position-x="${x}"
                   data-position-y="${y}"
                   data-scale="${scale}"
                   onerror="this.src='/quizmaster/frontend/images/profile-placeholder.svg'">
            </div>
            <div class="teacher-details">
              <div class="teacher-name">${teacherName}</div>
              <div class="subject" style="color: ${subjectColor}">${subjectName}</div>
            </div>
          </div>
          <div class="quiz-content">
            <h3 class="quiz-title">${quiz.title}</h3>
            <p class="quiz-description">${this.truncateText(quiz.description, 100)}</p>
          </div>
          <div class="quiz-status">
            <span class="status-badge ${statusClass}">
              ${statusText}
            </span>
            <span class="score-display">${quiz.score || 0}%</span>
            <span class="completed-date">${completedDate}</span>
          </div>
        </div>
      `;
    }
  }

  getQuizTypesBadges(quiz) {
    if (!quiz.questionTypes) return '';
    
    const types = this.getQuestionTypes(quiz.questionTypes);
    
    if (types.length === 0) return '';
    
    let badges = '<div class="question-type-badges">';
    
    types.forEach(type => {
      badges += `
        <span class="type-indicator" title="${this.formatQuestionType(type)}">
          <i class="fas ${this.getQuestionTypeIcon(type)}"></i>
        </span>
      `;
    });
    
    badges += '</div>';
    return badges;
  }

  truncateText(text, maxLength) {
    if (!text) return '';
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
  }

  updatePagination(totalPages) {
    if (totalPages <= 1) {
      this.pagination.innerHTML = '';
      return;
    }
    
    let html = `
      <button class="page-button prev" ${this.currentPage === 1 ? "disabled" : ""}>
        <i class="fas fa-chevron-left"></i>
      </button>
    `;

    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= this.currentPage - 1 && i <= this.currentPage + 1)) {
        html += `
          <button class="page-button ${i === this.currentPage ? "active" : ""}" data-page="${i}">${i}</button>
        `;
      } else if (i === this.currentPage - 2 || i === this.currentPage + 2) {
        html += `<span class="page-ellipsis">...</span>`;
      }
    }

    html += `
      <button class="page-button next" ${this.currentPage === totalPages ? "disabled" : ""}>
        <i class="fas fa-chevron-right"></i>
      </button>
    `;

    this.pagination.innerHTML = html;
    
    // Add event listeners to pagination buttons
    const pageButtons = this.pagination.querySelectorAll('.page-button[data-page]');
    pageButtons.forEach(button => {
      button.addEventListener('click', () => {
        const page = parseInt(button.getAttribute('data-page'));
        this.navigateToPage(page);
      });
    });
    
    // Add event listeners for prev/next buttons
    const prevButton = this.pagination.querySelector('.page-button.prev');
    if (prevButton && !prevButton.disabled) {
      prevButton.addEventListener('click', () => {
        this.navigateToPage(this.currentPage - 1);
      });
    }
    
    const nextButton = this.pagination.querySelector('.page-button.next');
    if (nextButton && !nextButton.disabled) {
      nextButton.addEventListener('click', () => {
        this.navigateToPage(this.currentPage + 1);
      });
    }
  }

  async navigateToPage(page) {
    if (page === this.currentPage || this.isLoading) return;
    this.currentPage = page;
    await this.loadQuizzes();
  }

  /**
   * Set loading state
   * @param {boolean} isLoading 
   */
  setLoading(isLoading) {
    const loader = document.getElementById('loader');
    if (loader) {
      loader.style.display = isLoading ? 'flex' : 'none';
    }
    
    if (this.quizzesContainer) {
      this.quizzesContainer.style.opacity = isLoading ? '0.5' : '1';
    }
  }

  handleError(error) {
    console.error("Error:", error);
    
    // For 404 and 500 errors related to quizzes.php and update-statistics.php,
    // we're already handling those with fallbacks, so don't show error messages
    if (error.message && (
        error.message.includes("quizzes.php") || 
        error.message.includes("update-statistics.php") ||
        error.message.includes("404") ||
        error.message.includes("500"))) {
      console.log("Error already handled with fallbacks");
      return;
    }
    
    // Determine a more specific error message based on the error
    let errorMessage = error.message || "An error occurred";
    
    if (errorMessage.includes("Failed to fetch") || errorMessage.includes("NetworkError")) {
      errorMessage = "Network error: Using demo data while offline.";
      
      // No need for additional API calls since we're clearly offline
      notifications.warning(errorMessage);
      return;
    } else if (errorMessage.includes("Invalid response") || errorMessage.includes("parse JSON")) {
      errorMessage = "Server returned an invalid response. Using demo data instead.";
      notifications.warning(errorMessage);
      return;
    } else if (errorMessage.includes("Unauthorized") || errorMessage.includes("expired")) {
      // Try to refresh the token first
      auth.refreshToken().then(success => {
        if (success) {
          // Token refreshed successfully, retry the operation
          notifications.info("Session renewed. Reloading data...");
          this.loadQuizzes();
        } else {
          // Token refresh failed, redirect to login
          errorMessage = "Your session has expired. Please log in again.";
          notifications.error(errorMessage);
          setTimeout(() => {
            auth.logout();
          }, 2000);
        }
      });
      return;
    }
    
    // Only show error for non-fallback issues
    notifications.error(errorMessage);
  }
  
  // Check URL parameters for quiz completion or abandonment
  checkCompletionMessage() {
    // Check URL parameters for status messages
    const params = new URLSearchParams(window.location.search);
    const completedQuizId = params.get('completed');
    const abandonedQuizId = params.get('abandoned');
    
    // Clean URL parameters to prevent showing the message again on refresh
    if (completedQuizId || abandonedQuizId) {
      const newUrl = new URL(window.location.href);
      if (completedQuizId) newUrl.searchParams.delete('completed');
      if (abandonedQuizId) newUrl.searchParams.delete('abandoned');
      window.history.replaceState({}, document.title, newUrl.toString());
            
      // Show appropriate message
      if (completedQuizId) {
      notifications.success('Quiz completed! Your results have been saved.');
      this.forceDatabaseRefreshAfterQuizCompletion(completedQuizId);
      } 
      
      if (abandonedQuizId) {
        notifications.error('Quiz abandoned. This attempt has been marked as failed.');
        this.forceDatabaseRefreshAfterQuizCompletion(abandonedQuizId);
        
        // Switch to the completed tab to show the failed quiz
        this.tabs.forEach(btn => {
          if (btn.dataset.tab === 'completed') {
            btn.click();
          }
        });
      }
    }
  }
  
  // Force database refresh after a quiz completion and update statistics
  async forceDatabaseRefreshAfterQuizCompletion(quizId) {
    console.log(`Updating data after completing quiz ID: ${quizId}`);
    
    try {
      // First call update-statistics.php to refresh the user statistics
      const userId = auth.getUserId();
      if (userId) {
        console.log(`Updating statistics for user ${userId} after quiz ${quizId} completion`);
        try {
          const timestamp = Date.now();
          const response = await fetch(`/quizmaster/backend/student/update-statistics.php?_t=${timestamp}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${auth.getToken()}`,
              'Cache-Control': 'no-store, no-cache, must-revalidate'
            },
            body: JSON.stringify({
              userId: userId,
              forceUpdate: true,
              quizId: quizId
            }),
            cache: 'no-store'
          });
          
          if (response.ok) {
            console.log("Statistics updated successfully");
          } else {
            console.log(`Statistics update failed with status: ${response.status} - continuing anyway`);
          }
        } catch (statsError) {
          console.log("Failed to update statistics but continuing:", statsError.message);
        }
      }
      
      // Add a small delay
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Reload quizzes without full page reload
      await this.loadQuizzes();
    } catch (error) {
      console.error("Error refreshing after quiz completion:", error);
      this.loadQuizzes();
    }
  }
  
  // Special method to force a complete database cleanup and reload quizzes
  async forceCleanupAndLoadQuizzes() {
    this.setLoading(true);
    
    try {
      console.log("Skipping server update due to 500 errors");
      
      // Switch to completed tab if needed
      if (this.currentTab !== 'completed') {
        // Find and click the completed tab button
        this.tabs.forEach(btn => {
          if (btn.dataset.tab === 'completed') {
            btn.classList.add('active');
            this.tabs.forEach(otherBtn => {
              if (otherBtn !== btn) otherBtn.classList.remove('active');
            });
            this.currentTab = 'completed';
          }
        });
      }
      
      // Add a small delay to ensure UI updates
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Load quizzes with fresh timestamp
      await this.loadQuizzes();
      
    } catch (error) {
      console.log("Error during cleanup:", error.message);
      this.loadQuizzes(); // Still try to load quizzes
    } finally {
      this.setLoading(false);
    }
  }

  // Simple debounce function
  debounce(func, wait) {
    let timeout;
    return function(...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }

  // This method used to generate mock quizzes, but we now return an empty array
  // to ensure users only see real quizzes from the database
  generateMockQuizzes() {
    console.log("Mock quizzes have been disabled");
    return [];
  }

  async loadQuizDetails(quizId) {
    try {
      const token = auth.getToken();
      if (!token) {
        throw new Error('Authentication required');
      }

      // Try to load quiz details from the API
      const response = await fetch(`/quizmaster/backend/quiz/get.php?id=${quizId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      // Check if the response is valid
      if (!response.ok) {
        throw new Error(`Failed to load quiz details: ${response.status} ${response.statusText}`);
      }

      // Check the content type to avoid parsing non-JSON responses
      const contentType = response.headers.get('Content-Type');
      if (!contentType || !contentType.includes('application/json')) {
        console.warn(`Unexpected content type: ${contentType}`);
        throw new Error('Invalid response format');
      }

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to load quiz details');
      }

      return data.quiz;
    } catch (error) {
      console.error('Error loading quiz details:', error);
      throw error;
    }
  }

  async openQuizDetails(quizId) {
    try {
      this.setLoading(true);
      const quizDetails = await this.loadQuizDetails(quizId);
      
      // Store the quiz details in local storage for the quiz page to use
      localStorage.setItem('current_quiz', JSON.stringify(quizDetails));
      
      // Navigate to the quiz details page
      window.location.href = 'quiz-details.html?id=' + quizId;
    } catch (error) {
      console.error('Failed to open quiz details:', error);
      this.showError('Failed to load quiz details. Please try again later.');
      this.setLoading(false);
    }
  }

  // Extract position data using the universal method
  extractPositionData(quiz) {
    // Get position data from any available source
    const x = quiz.image_position_x || quiz.teacher_image_position_x || 
              (quiz.teacher && quiz.teacher.image_position_x) || 0;
              
    const y = quiz.image_position_y || quiz.teacher_image_position_y || 
              (quiz.teacher && quiz.teacher.image_position_y) || 0;
              
    const scale = quiz.image_scale || quiz.teacher_image_scale || 
                  (quiz.teacher && quiz.teacher.image_scale) || 1;

    return { x, y, scale };
  }

  // Force the teacher image styles to be applied directly via DOM manipulation
  forceTeacherImageStyles() {
    // Get all teacher avatar images
    const avatarImages = document.querySelectorAll('.teacher-avatar');
    
    // Apply styles to each image
    avatarImages.forEach((img) => {
      const quizId = img.closest('.quiz-card')?.dataset.quizId;
      let quiz = null;
      
      if (quizId && this.loadedQuizzes) {
        quiz = this.loadedQuizzes.find(q => q.id == quizId);
      }
      
      if (quiz) {
        const positionData = this.extractPositionData(quiz);
        
        // Apply the position and scale
        img.style.objectFit = 'cover';
        img.style.objectPosition = `${positionData.x}px ${positionData.y}px`;
        img.style.transform = `scale(${positionData.scale})`;
        img.style.transformOrigin = 'center center';
        img.style.willChange = 'transform, object-position';
        img.style.backfaceVisibility = 'hidden';
        img.style.imageRendering = 'high-quality';
      }

      // Add error handler to fall back to placeholder
      img.onerror = () => {
        img.src = '/quizmaster/frontend/images/profile-placeholder.svg';
        img.onerror = null;
      };
    });
    
    // Style preview modal avatar if it exists
    const previewAvatar = document.querySelector('.preview-teacher-avatar img');
    if (previewAvatar && this.selectedQuiz) {
      const positionData = this.extractPositionData(this.selectedQuiz);
      
      previewAvatar.style.objectFit = 'cover';
      previewAvatar.style.objectPosition = `${positionData.x}px ${positionData.y}px`;
      previewAvatar.style.transform = `scale(${positionData.scale})`;
      previewAvatar.style.transformOrigin = 'center center';
      previewAvatar.style.willChange = 'transform, object-position';
      previewAvatar.style.backfaceVisibility = 'hidden';
      previewAvatar.style.imageRendering = 'high-quality';
    }
  }

  // Add custom CSS styles for teacher avatars to match dashboard
  addTeacherAvatarStyles() {
    // Create a style element
    const styleEl = document.createElement('style');
    styleEl.id = 'teacher-avatar-styles';
    
    // Add CSS that matches the teacher dashboard exactly
    styleEl.textContent = `
      .teacher-info {
        position: relative;
        overflow: hidden;
        display: flex;
        align-items: center;
        gap: 12px;
      }
      
      .avatar-container {
        width: 50px;
        height: 50px;
        border-radius: 50%;
        overflow: hidden;
        position: relative;
        border: 2px solid #6a0dad;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      
      .teacher-avatar {
        width: 100%;
        height: 100%;
        object-fit: cover;
        transform-origin: center center;
        will-change: transform, object-position;
        backface-visibility: hidden;
        transform-style: preserve-3d;
        image-rendering: high-quality;
        position: relative;
      }
      
      /* Preview modal specific styles */
      .preview-teacher-avatar {
        width: 60px;
        height: 60px;
        border-radius: 50%;
        overflow: hidden;
        position: relative;
        border: 3px solid #6a0dad;
        margin-right: 15px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      
      .preview-header {
        display: flex;
        align-items: center;
      }
    `;
    
    // Add to document head
    document.head.appendChild(styleEl);
  }

  async updateStatistics() {
    try {
      console.log("Updating student statistics...");
      const response = await fetchWithTokenRefresh(`${API_CONFIG.baseUrl}/backend/student/update-statistics.php`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        console.log("Statistics updated successfully");
        return true;
      } else {
        const data = await response.json();
        console.error("Statistics update failed:", data.error);
        notifications.warning("Statistics update delayed - will retry automatically");
        
        // Schedule a retry
        setTimeout(() => this.updateStatistics(), 5000);
        return false;
      }
    } catch (error) {
      console.error("Error updating statistics:", error);
      notifications.warning("Statistics update delayed - will retry automatically");
      
      // Schedule a retry
      setTimeout(() => this.updateStatistics(), 5000);
      return false;
    }
  }

  getCachedData() {
    try {
      const cachedData = localStorage.getItem('studentQuizzes');
      if (cachedData) {
        return JSON.parse(cachedData);
      }
    } catch (error) {
      console.warn('Error reading cached data:', error);
    }
    return null;
  }

  setupEventListeners() {
    // Tab switching
    this.tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        const tabName = tab.getAttribute("data-tab");
        if (tabName !== this.currentTab) {
          this.currentTab = tabName;
          this.currentPage = 1;
          this.tabs.forEach((t) => t.classList.remove("active"));
          tab.classList.add("active");
          this.loadQuizzes();
        }
      });
    });

    // Logout button
    if (this.logoutButton) {
      this.logoutButton.addEventListener("click", () => auth.logout());
    }

    // Preview modal
    if (this.closePreviewBtn) {
      this.closePreviewBtn.addEventListener("click", () => this.closePreviewModal());
    }

    if (this.cancelQuizBtn) {
      this.cancelQuizBtn.addEventListener("click", () => this.closePreviewModal());
    }

    if (this.startQuizBtn) {
      this.startQuizBtn.addEventListener("click", () => this.startQuiz());
    }

    // Close modal on outside click
    window.addEventListener("click", (event) => {
      if (event.target === this.previewModal) {
        this.closePreviewModal();
      }
    });

    // Mobile menu toggle
    const menuToggle = document.querySelector(".menu-toggle");
    const sidebar = document.querySelector(".sidebar");
    if (menuToggle && sidebar) {
      menuToggle.addEventListener("click", () => {
        sidebar.classList.toggle("active");
      });

      // Close sidebar when clicking outside
      document.addEventListener("click", (e) => {
        if (!e.target.closest(".sidebar") && !e.target.closest(".menu-toggle")) {
          sidebar.classList.remove("active");
        }
      });
    }

    // Check for completion messages
    this.checkCompletionMessage();
  }

  async fetchAndUpdateCache() {
    try {
      const data = await this.fetchQuizzes();
      if (data && data.quizzes) {
        localStorage.setItem('studentQuizzes', JSON.stringify(data));
      }
    } catch (error) {
      console.warn('Error updating cache:', error);
    }
  }

  async fetchQuizzes() {
    try {
      // Build the URL with query parameters
      const params = new URLSearchParams({
        page: this.currentPage,
        type: this.currentTab,
        search: this.searchQuery || '',
        subject: this.filteredSubject || ''
      }).toString();

      // Use the correct path without API_CONFIG
      const url = params ? 
        `student/quizzes.php?${params}` : 
        'student/quizzes.php';

      const response = await fetchWithTokenRefresh(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.message || 'Failed to fetch quizzes');
      }

      // Store the loaded quizzes for immediate access
      if (data.quizzes) {
        this.loadedQuizzes = data.quizzes;
      }

      return data;
    } catch (error) {
      console.error('Error fetching quizzes:', error);
      // Return empty data structure instead of throwing
      return {
        quizzes: [],
        totalPages: 1,
        success: true
      };
    }
  }

  initializeDarkMode() {
    const isDarkMode = localStorage.getItem('darkMode') === 'true';
    if (isDarkMode) {
      document.documentElement.classList.add('dark-theme');
      document.body.classList.add('dark-theme');
    }
  }
} // End of QuizzesManager class

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  const quizManager = new QuizzesManager();
});

export default QuizzesManager;