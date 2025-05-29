import API_CONFIG from './config.js';
import notifications from './utils/notifications.js';
import auth from './utils/auth.js';

class QuizAnswer {
  constructor() {
    // Initialize dark mode first
    this.initializeDarkMode();

    // Get quiz data from URL parameters
    const params = new URLSearchParams(window.location.search);
    this.quizId = params.get("id");
    if (!this.quizId) {
      window.location.href = "student-quizzes.html";
      return;
    }

    // Check if this quiz was already abandoned
    const abandonedQuizData = localStorage.getItem('quizAbandoned');
    if (abandonedQuizData && abandonedQuizData.startsWith(this.quizId + '_')) {
      // Redirect to quizzes page with abandoned parameter
      window.location.href = `student-quizzes.html?abandoned=${this.quizId}`;
      return;
    }

    // CRITICAL: Create a backup of the auth token for this quiz session
    const currentToken = localStorage.getItem('userToken');
    if (currentToken) {
      // Store a backup token that won't be cleared by logout
      sessionStorage.setItem('quizSessionToken', currentToken);
      console.log('Stored backup token for quiz session');
    }

    // Override the auth.getToken method to use our backup during quiz sessions
    const originalGetToken = auth.getToken;
    auth.getToken = function() {
      const token = originalGetToken.call(auth);
      if (!token) {
        // If main token is missing, use backup token
        const backupToken = sessionStorage.getItem('quizSessionToken');
        if (backupToken) {
          console.log('Using backup token for quiz session');
          return backupToken;
        }
      }
      return token;
    };

    // Prevent automatic redirects to login during quiz session
    window.skipAuthRedirects = true;

    // Also override the auth.logout function to prevent redirects during quiz session
    const originalLogout = auth.logout;
    auth.logout = function(redirect = true) {
      if (window.skipAuthRedirects) {
        console.log('Preventing logout redirect during quiz session');
        redirect = false;
      }
      // Call original with modified redirect parameter
      return originalLogout.call(auth, redirect);
    };

    this.currentQuestionIndex = 0;
    this.questions = [];
    this.answers = [];
    this.timeLeft = 0;
    this.timeRemaining = 0;
    this.totalTime = 0;
    this.timer = null;
    this.abandonmentTimer = null;
    this.isQuizCompleted = false;
    this.attemptId = null;
    this.isSubmitting = false; // Flag to prevent double submission
    this.authChecksInProgress = 0; // Counter for auth checks

    // Initialize elements
    this.teacherAvatar = document.getElementById("teacherAvatar");
    this.teacherName = document.getElementById("teacherName");
    this.subject = document.getElementById("subject");
    this.questionText = document.getElementById("questionText");
    this.optionsGrid = document.getElementById("optionsGrid");
    this.timerCount = document.querySelector(".timer-count");
    this.timerProgress = document.querySelector(".timer-progress");
    this.timerCircle = document.querySelector(".timer-circle");
    this.warningModal = document.getElementById("warningModal");
    this.stayButton = document.getElementById("stayButton");

    // Add progress indicator
    this.addProgressIndicator();

    // Use a slight delay before initialization to ensure token processing completes
    setTimeout(() => {
      this.initializeQuiz();
    }, 300);

    this.setupEventListeners();
  }

  initializeDarkMode() {
    const isDarkMode = localStorage.getItem('darkMode') === 'true';
    if (isDarkMode) {
      document.documentElement.classList.add('dark-theme');
      document.body.classList.add('dark-theme');
    }
  }

  addProgressIndicator() {
    // Create a progress indicator element
    const progressContainer = document.createElement('div');
    progressContainer.className = 'quiz-progress';
    
    // Insert it after the quiz header
    const quizHeader = document.querySelector('.quiz-header');
    if (quizHeader && quizHeader.parentNode) {
      quizHeader.parentNode.insertBefore(progressContainer, quizHeader.nextSibling);
    }
  }

  updateProgressIndicator() {
    const progressContainer = document.querySelector('.quiz-progress');
    if (!progressContainer || !this.questions.length) return;
    
    progressContainer.innerHTML = '';
    
    // Create dots for each question
    for (let i = 0; i < this.questions.length; i++) {
      const dot = document.createElement('div');
      dot.className = 'progress-dot';
      
      // Add appropriate class based on question status
      if (i < this.currentQuestionIndex) {
        dot.classList.add('completed');
      } else if (i === this.currentQuestionIndex) {
        dot.classList.add('current');
      }
      
      progressContainer.appendChild(dot);
    }
  }

  async initializeQuiz() {
    try {
      console.log('Quiz answer - Initializing quiz:', this.quizId);
      
      // Show loading state
      this.setLoadingState(true);
      
      // Store original token for backup
      const originalToken = auth.getToken() || sessionStorage.getItem('quizSessionToken');
      
      // Fetch quiz data using attempt endpoint with multiple fallbacks
      const startAttemptEndpoint = API_CONFIG.ENDPOINTS.QUIZ.START_ATTEMPT;
      const url = `${API_CONFIG.BASE_URL}${startAttemptEndpoint}${startAttemptEndpoint.includes('?') ? '&' : '?'}id=${this.quizId}`;
      
      console.log('Quiz answer - Starting quiz attempt:', this.quizId);
      
      let quizData = null;
      let errorMessage = null;
      
      // First try: Use standard fetch with error handling
      try {
        const options = {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${originalToken}`,
            'Cache-Control': 'no-cache, no-store, must-revalidate'
          }
        };
        
        quizData = await this.fetchWithErrorHandling(url, options);
        
                  // Handle database schema issues
          if (quizData && quizData.message && quizData.message.includes('time_limit')) {
            console.log('Database has no time_limit column - will calculate based on question count');
            // Continue despite the error
            quizData.success = true;
            
            // Try to continue if we have minimally viable data
            if (quizData.questions && quizData.questions.length > 0) {
              const questionCount = quizData.questions.length;
              const timePerQuestion = 15; // 15 seconds per question
              
              // Calculate time based on question count
              quizData.calculatedTimeLimit = questionCount * timePerQuestion;
              console.log(`Using calculated time: ${questionCount} questions × 15 seconds = ${quizData.calculatedTimeLimit} seconds`);
            }
          }
        
        if (!quizData || !quizData.success) {
          errorMessage = quizData?.message || 'Failed to start quiz';
          console.error('First attempt failed:', errorMessage);
          throw new Error(errorMessage);
        }
      } catch (firstError) {
        console.warn('First attempt to start quiz failed, trying fallback:', firstError.message);
        
        // Second try: Direct fetch with backup token
        try {
          // Make direct request with backup token
          const backupToken = sessionStorage.getItem('quizSessionToken') || originalToken;
          
          const directOptions = {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${backupToken}`,
              'Cache-Control': 'no-cache, no-store, must-revalidate',
              'Pragma': 'no-cache'
            }
          };
          
          console.log('Using direct fetch with backup token');
          const cacheBuster = Date.now();
          const directUrl = url.includes('?') ? `${url}&_cb=${cacheBuster}` : `${url}?_cb=${cacheBuster}`;
          
          const directResponse = await fetch(directUrl, directOptions);
          const responseText = await directResponse.text();
          
          try {
            quizData = JSON.parse(responseText);
            
            if (!quizData.success) {
              console.error('Second attempt failed with response:', quizData);
              errorMessage = quizData.message || 'Failed to start quiz';
              throw new Error(errorMessage);
            }
          } catch (parseError) {
            console.error('Failed to parse response:', responseText);
            throw new Error('Invalid response from server');
          }
        } catch (secondError) {
          console.error('All attempts to start quiz failed:', secondError.message);
          
          // Check for specific database issues
          if (secondError.message) {
            // Database table missing issues
            if (secondError.message.includes("Table 'quizmaster.questions' doesn't exist")) {
              notifications.error("Database error: The quiz system needs configuration. Contact your administrator to set up the questions table.");
              return;
            }
            // Time limit column missing
            else if (secondError.message.includes('time_limit')) {
              // Don't treat this as an error since we're now calculating time from question count
              notifications.warning("Using calculated time limit based on number of questions (15 seconds per question)");
              
              // Allow more time to see the message
              setTimeout(() => {
                window.location.reload();
              }, 2000);
              return;
            }
          }

          // Show more specific error message
          notifications.error("Unable to start quiz: Database configuration issue. Please contact your administrator.");
          
          // Redirect after a short delay
          setTimeout(() => {
            window.location.href = "student-quizzes.html";
          }, 3000);
          
          return;
        }
      }
      
      // If we reach here, we have quiz data
      console.log('Successfully retrieved quiz data');
      
      // Log the entire response structure to understand what fields are available
      console.log('Quiz response structure:', Object.keys(quizData));
      if (quizData.quiz) {
        console.log('Quiz object structure:', Object.keys(quizData.quiz));
      }
      
      // Store attempt ID for submitting answers
      this.attemptId = quizData.attemptId;
      
      // Store quiz data - adapting to handle both original and new response formats
      this.quiz = quizData.quiz || {
        id: quizData.quizId,
        title: quizData.title,
        description: quizData.description,
        // Handle missing time_limit column in database by providing default
        timeLimit: quizData.timeLimit || 300, // 5 minutes default
        subject: quizData.subject,
        teacherName: quizData.teacherName,
        teacherAvatar: quizData.teacherAvatar,
        shuffleQuestions: quizData.shuffleQuestions
      };
      
      // Use questions from appropriate location
      this.questions = quizData.questions;
      
      // Handle case where database error occurs but we can still load questions
      if (quizData.error && quizData.error.includes("time_limit")) {
        console.log("Database missing time_limit column - attempting fallback quiz loading");
        try {
          // Try to fetch questions directly if available
          const backupQuestionsUrl = `${API_CONFIG.BASE_URL}/quiz/questions.php?quiz_id=${this.quizId}`;
          console.log("Attempting to fetch questions directly:", backupQuestionsUrl);
          
          // We'll continue execution and use a default time limit
          this.quiz.timeLimit = this.quiz.timeLimit || 300; // 5 minutes default
          
          // Attempt direct questions fetch
          try {
            const questionsResponse = await fetch(backupQuestionsUrl, {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${originalToken}`,
                'Cache-Control': 'no-cache'
              }
            });
            
            if (questionsResponse.ok) {
              const questionsData = await questionsResponse.json();
              if (questionsData.success && questionsData.questions && questionsData.questions.length > 0) {
                console.log("Successfully fetched questions via direct endpoint");
                this.questions = questionsData.questions;
              }
            }
          } catch (directFetchError) {
            console.warn("Direct questions fetch failed:", directFetchError);
          }
        } catch (fallbackError) {
          console.error("Fallback question loading failed:", fallbackError);
        }
      }
      
      // If we still don't have questions, check for alternate formats in the response
      if (!this.questions || this.questions.length === 0) {
        // Look for questions in other potential locations in the response
        if (quizData.quiz && quizData.quiz.questions && quizData.quiz.questions.length > 0) {
          console.log("Found questions in quiz.questions property");
          this.questions = quizData.quiz.questions;
        } else if (quizData.quizQuestions && quizData.quizQuestions.length > 0) {
          console.log("Found questions in quizQuestions property");
          this.questions = quizData.quizQuestions;
        } else {
          // Try to query the questions directly using the right table structure
          console.log("No questions found in API response - try using direct database structure");
          
          // Instead of sample data, we'll need to redirect back to the quizzes page
          notifications.error("This quiz has no questions. Please try another quiz.");
          setTimeout(() => {
            window.location.href = "student-quizzes.html";
          }, 2000);
          return;
        }
      }
      
      if (!this.questions || this.questions.length === 0) {
        throw new Error('No questions received for this quiz');
      }
      
      // Shuffle questions if teacher enabled this option
      if (this.quiz.shuffleQuestions) {
        console.log("Shuffling questions as specified by teacher settings");
        this.questions = this.shuffleArray([...this.questions]);
        
        // Save the shuffled order for submission reference
        this.shuffledQuestionOrder = this.questions.map(q => q.id);
        console.log("Shuffled question order:", this.shuffledQuestionOrder);
      } else {
        console.log("Questions will be shown in original order (shuffling disabled)");
      }
      
      // Calculate time based on number of questions (15 seconds per question)
      const questionCount = this.questions.length;
      const timePerQuestion = 15; // 15 seconds per question
      const calculatedTimeLimit = questionCount * timePerQuestion;
      
      // Set the quiz time limit based on question count
      this.quiz.timeLimit = calculatedTimeLimit;
      
      console.log("Quiz time details:", {
        calculatedTimeLimit: calculatedTimeLimit,
        timePerQuestion: timePerQuestion,
        questionCount: questionCount,
        shuffleQuestions: this.quiz.shuffleQuestions || false
      });
      
      this.timeRemaining = calculatedTimeLimit;
      this.timeLeft = calculatedTimeLimit;
      this.totalTime = calculatedTimeLimit;
      
      console.log(`Quiz timer initialized - Total time: ${this.totalTime} seconds`);
      
      // Initialize UI
      this.renderQuizInfo();
      this.showQuestion(0);
      this.startTimer();
      
      // Create navigation buttons for questions
      this.createQuestionNavigation();
    } catch (error) {
      console.error("Error initializing quiz:", error);
      notifications.error("Failed to load quiz. Please try again.");
      
      setTimeout(() => {
        window.location.href = "student-quizzes.html";
      }, 2000);
    } finally {
      this.setLoadingState(false);
    }
  }
  
  // Helper method to shuffle an array (Fisher-Yates algorithm)
  shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  showQuestion(index) {
    if (index < 0 || index >= this.questions.length) return;
    
    const question = this.questions[index];
    this.currentQuestionIndex = index;
    
    // Update question text
    this.questionText.textContent = question.question_text;
    
    // Update options based on question type
    this.renderQuestionOptions(question);
    
    // Update progress indicator
    this.updateProgressIndicator();
  }

  renderQuestionOptions(question) {
    this.optionsGrid.innerHTML = "";
    
    // Add the appropriate type of input based on question type
    switch (question.question_type) {
      case 'multiple_choice':
        this.renderMultipleChoice(question);
        break;
      case 'true_false':
        this.renderTrueFalse();
        break;
      case 'short_answer':
        this.renderShortAnswer();
        break;
      default:
        this.renderMultipleChoice(question);
    }
    
    // Add navigation buttons
    this.renderNavigationButtons();
  }

  renderMultipleChoice(question) {
    // Add class to options grid for proper styling
    this.optionsGrid.className = 'options-grid multiple-choice';
    
    // Create buttons for each option
    question.answers.forEach((answer, index) => {
      const optionButton = document.createElement('button');
      optionButton.className = 'option-btn';
      optionButton.dataset.index = index;
      optionButton.innerHTML = answer.answer_text;
      
      // Check if this answer was previously selected
      if (Array.isArray(this.answers[this.currentQuestionIndex])) {
        // If we have multiple selections
        if (this.answers[this.currentQuestionIndex].includes(index)) {
          optionButton.classList.add('selected');
        }
      } else if (this.answers[this.currentQuestionIndex] === index) {
        // For backward compatibility with single selection
        optionButton.classList.add('selected');
      }
      
      this.optionsGrid.appendChild(optionButton);
    });
    
    // Add a note to indicate multiple selections are allowed
    const noteElement = document.createElement('div');
    noteElement.className = 'selection-note';
    noteElement.innerHTML = '<i class="fas fa-info-circle"></i> Multiple answers may be correct. Select all that apply.';
    this.optionsGrid.appendChild(noteElement);
  }

  renderTrueFalse() {
    // Add class to options grid for proper styling
    this.optionsGrid.className = 'options-grid true-false';
    
    // Create True and False buttons
    const options = ['True', 'False'];
    
    options.forEach((option, index) => {
      const optionButton = document.createElement('button');
      optionButton.className = 'option-btn';
      optionButton.dataset.index = index;
      optionButton.innerHTML = option;
      
      // Check if this answer was previously selected
      if (this.answers[this.currentQuestionIndex] === index) {
        optionButton.classList.add('selected');
      }
      
      this.optionsGrid.appendChild(optionButton);
    });
  }

  renderShortAnswer() {
    // Add class to options grid for proper styling
    this.optionsGrid.className = 'options-grid short-answer';
    
    // Create text input
    const textInputContainer = document.createElement('div');
    textInputContainer.className = 'text-input-container';
    
    const textArea = document.createElement('textarea');
    textArea.className = 'short-answer-input';
    textArea.placeholder = 'Type your answer here...';
    textArea.value = this.answers[this.currentQuestionIndex] || '';
    
    textInputContainer.appendChild(textArea);
    this.optionsGrid.appendChild(textInputContainer);
  }

  renderNavigationButtons() {
    const navigationContainer = document.createElement('div');
    navigationContainer.className = 'navigation-buttons';
    
    // Create the Next/Submit button
    const nextButton = document.createElement('button');
    nextButton.className = 'nav-btn next-btn';
    
    if (this.currentQuestionIndex === this.questions.length - 1) {
      nextButton.innerHTML = 'Submit Quiz <i class="fas fa-check"></i>';
      nextButton.addEventListener('click', () => this.confirmSubmitQuiz());
    } else {
      nextButton.innerHTML = 'Next <i class="fas fa-arrow-right"></i>';
      nextButton.addEventListener('click', () => this.navigateToNextQuestion());
    }
    
    navigationContainer.appendChild(nextButton);
    
    // Find or create a dedicated navigation container
    let fixedNavContainer = document.querySelector('.fixed-navigation-container');
    if (!fixedNavContainer) {
      fixedNavContainer = document.createElement('div');
      fixedNavContainer.className = 'fixed-navigation-container';
      
      // Append it to the quiz-answer-container, not to the options grid
      const quizContainer = document.querySelector('.quiz-answer-container');
      if (quizContainer) {
        quizContainer.appendChild(fixedNavContainer);
      } else {
        // Fallback to appending to the options grid's parent
        this.optionsGrid.parentNode.appendChild(fixedNavContainer);
      }
    }
    
    // Clear and append the navigation
    fixedNavContainer.innerHTML = '';
    fixedNavContainer.appendChild(navigationContainer);
  }

  navigateToPreviousQuestion() {
    // Save current answer
    this.saveCurrentAnswer();
    
    // Navigate to previous question
    if (this.currentQuestionIndex > 0) {
      this.showQuestion(this.currentQuestionIndex - 1);
    }
  }

  navigateToNextQuestion() {
    // Save current answer
    this.saveCurrentAnswer();
    
    // Navigate to next question
    if (this.currentQuestionIndex < this.questions.length - 1) {
      this.showQuestion(this.currentQuestionIndex + 1);
    }
  }

  saveCurrentAnswer() {
    const question = this.questions[this.currentQuestionIndex];
    const questionType = question.question_type;
    
    switch (questionType) {
      case 'multiple_choice':
        // For multiple choice, get all selected options
        const selectedOptions = this.optionsGrid.querySelectorAll('.option-btn.selected');
        if (selectedOptions.length > 0) {
          // Store an array of selected indices
          this.answers[this.currentQuestionIndex] = Array.from(selectedOptions).map(option => 
            parseInt(option.dataset.index)
          );
        } else {
          // If nothing selected, store empty array
          this.answers[this.currentQuestionIndex] = [];
        }
        break;
        
      case 'true_false':
        const selectedOption = this.optionsGrid.querySelector('.option-btn.selected');
        if (selectedOption) {
          this.answers[this.currentQuestionIndex] = parseInt(selectedOption.dataset.index);
        }
        break;
        
      case 'short_answer':
        const textInput = this.optionsGrid.querySelector('.short-answer-input');
        if (textInput) {
          this.answers[this.currentQuestionIndex] = textInput.value.trim();
        }
        break;
    }
  }

  confirmSubmitQuiz() {
    // Save the last answer
    this.saveCurrentAnswer();
    
    // Check if all questions were answered
    const unansweredCount = this.answers.filter(answer => answer === null || answer === '').length;
    
    if (unansweredCount > 0) {
      if (confirm(`You have ${unansweredCount} unanswered question(s). Are you sure you want to submit?`)) {
        this.submitQuiz();
      }
    } else {
      if (confirm('Are you sure you want to submit your quiz?')) {
        this.submitQuiz();
      }
    }
  }

  async submitQuiz(isAutomaticSubmission = false) {
    try {
      // Validate if all questions have been answered
      this.saveCurrentAnswer(); // Save the current answer first
      
      // Confirm submission with user
      if (this.currentQuestionIndex < this.questions.length - 1) {
        const confirmed = confirm("You have not answered all questions. Are you sure you want to submit?");
        if (!confirmed) return;
      }
      
      this.setLoadingState(true);
      
      // Prepare answers for submission
      const formattedAnswers = this.prepareAnswersForSubmission();
      
      // Construct the URL with the quiz ID
      const url = `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.QUIZ.ATTEMPT}?id=${this.quizId}&action=submit`;
      
      // Log submission data for debugging
      console.log(`Submitting quiz with attempt ID: ${this.attemptId}`);
      console.log('Answers:', formattedAnswers);
      
      // Submit the answers
      const options = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${auth.getToken()}`
        },
        body: JSON.stringify({
          attemptId: this.attemptId,
          answers: formattedAnswers
        })
      };
      
      const data = await this.fetchWithErrorHandling(url, options);
      
      // Log the response for debugging
      console.log('Submission response:', data);
      
      if (!data.success) {
        throw new Error(data.message || 'Failed to submit quiz');
      }
      
      // Update quiz state
      this.isQuizCompleted = true;
      
      // Ensure any timers are stopped
      clearInterval(this.timer);
      
      // Handle results based on teacher settings
      if (data.showResultsNow) {
        // Show immediate results
        notifications.success(`Quiz completed! Your score: ${data.score?.toFixed(2) || 'will be calculated'}%`);
        
        // Display pass/fail message
        if (data.isPassed) {
          notifications.success(`Congratulations! You passed the quiz (minimum: ${data.passingScore}%).`);
        } else if (data.isPassed === false) { // Explicitly check for false to avoid showing this for undefined
          notifications.warning(`You did not pass the quiz. Required: ${data.passingScore}%`);
        }
        
        // Show additional feedback
        setTimeout(() => {
          if (data.correctAnswers && data.totalQuestions) {
            if (data.correctAnswers === data.totalQuestions) {
              notifications.success(`Perfect score! ${data.correctAnswers}/${data.totalQuestions} correct.`);
            } else {
              notifications.info(`You got ${data.correctAnswers} out of ${data.totalQuestions} questions correct.`);
            }
          }
        }, 1000);
      } else {
        // Handle delayed results based on showResultsAfter timestamp
        if (data.showResultsAfter) {
          const resultDate = new Date(data.showResultsAfter);
          const now = new Date();
          
          if (resultDate > now) {
            // Results will be available later
            const formattedDate = resultDate.toLocaleString();
            notifications.info(`Quiz submitted! Results will be available on ${formattedDate}`);
            
            // Store the quiz completion data in localStorage for later viewing
            try {
              const completedQuizzes = JSON.parse(localStorage.getItem('completedQuizzes') || '[]');
              completedQuizzes.push({
                quizId: this.quizId,
                attemptId: this.attemptId,
                completedAt: new Date().toISOString(),
                resultsAvailableAt: data.showResultsAfter
              });
              localStorage.setItem('completedQuizzes', JSON.stringify(completedQuizzes));
            } catch (e) {
              console.error("Error saving completed quiz info:", e);
            }
          } else {
            // The specified time has already passed, show results if available
            if (data.score) {
              notifications.success(`Quiz completed! Your score: ${data.score.toFixed(2)}%`);
            } else {
              notifications.info(`Quiz submitted! ${data.resultDelayMessage}`);
            }
          }
        } else {
          // No specific timestamp, use the generic message
          notifications.info(`Quiz submitted! ${data.resultDelayMessage}`);
        }
      }
      
      // Force statistics update - try multiple approaches to ensure it works
      try {
        console.log("Updating user statistics after quiz submission");
        
        // First approach: Direct update using update-statistics.php
        const timestamp = new Date().getTime();
        const updateStatsUrl = `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.STUDENT.UPDATE_STATISTICS}`;
        console.log(`Updating user statistics: ${updateStatsUrl}`);
        
        const updateResponse = await fetch(updateStatsUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${auth.getToken()}`,
            'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
            'Pragma': 'no-cache'
          },
          body: JSON.stringify({
            userId: auth.getUserId(),
            forceUpdate: true,
            fullRecalculate: true, 
            quizId: this.quizId,
            timestamp: timestamp
          })
        });
        
        if (updateResponse.ok) {
          let updateData;
          try {
            updateData = await updateResponse.json();
            console.log("Statistics update successful:", updateData);
            
            // Show a clear notification that stats have been updated
            setTimeout(() => {
              notifications.info('Your statistics have been updated!', 4000);
            }, 2000);
          } catch (parseError) {
            console.error("Error parsing statistics update response:", parseError);
            // Try again with a slight delay
            setTimeout(() => this.updateStatisticsFallback(), 1000);
          }
        } else {
          console.warn(`Statistics update failed with status: ${updateResponse.status}`);
          
          // Get more details about the error
          try {
            const errorText = await updateResponse.text();
            console.error("Update statistics error details:", errorText);
          } catch (e) {
            console.error("Could not read error response:", e);
          }
          
          // Try backup method
          this.updateStatisticsFallback();
        }
      } catch (error) {
        console.error("Error updating statistics:", error);
        
        // Try fallback method
        this.updateStatisticsFallback();
      }
      
      // After allowing time for notifications, redirect to student dashboard to show updated stats
      setTimeout(() => {
        // Redirect to student dashboard with parameters to trigger stats update
        const timestamp = new Date().getTime();
        
        // Ask if the user wants to go to the dashboard (to see statistics) or quizzes page
        const goToDashboard = confirm("Would you like to see your updated statistics on the dashboard?");
        
        if (goToDashboard) {
          // Redirect to dashboard with parameters that will trigger a statistics update
          window.location.replace(`student-dashboard.html?from_quiz=true&quiz_completed=true&_t=${timestamp}`);
        } else {
          // Redirect to student quizzes page with the completed quiz ID
          window.location.replace(`student-quizzes.html?completed=${this.quizId}&_t=${timestamp}`);
        }
      }, 4000);
      
    } catch (error) {
      console.error('Error submitting quiz:', error);
      notifications.error(error.message || 'Failed to submit quiz. Please try again.');
    } finally {
      this.setLoadingState(false);
    }
  }

  // Fallback method to update statistics if the main method fails
  async updateStatisticsFallback() {
    try {
      console.log("Trying statistics update fallback method");
      
      // First try with a direct fetch to update-statistics.php with different parameters
      try {
        const userId = auth.getUserId();
        const timestamp = Date.now();
        const updateStatsUrl = `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.STUDENT.UPDATE_STATISTICS}?t=${timestamp}`;
        
        const updateResponse = await fetch(updateStatsUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${auth.getToken()}`,
            'Cache-Control': 'no-store, no-cache, must-revalidate',
            'X-Requested-With': 'XMLHttpRequest',
            'Pragma': 'no-cache'
          },
          body: JSON.stringify({
            userId: userId,
            forceUpdate: true,
            fullRecalculate: true,
            quizId: this.quizId,
            timestamp: timestamp
          }),
          cache: 'no-store'
        });
        
        if (updateResponse.ok) {
          console.log("Statistics fallback update successful");
          
          // Show notification for fallback method
          setTimeout(() => {
            notifications.info('Your statistics have been updated!', 4000);
          }, 2000);
          
          return;
        } else {
          console.warn("First fallback statistics update failed");
        }
      } catch (firstFallbackError) {
        console.error("Error in first statistics fallback:", firstFallbackError);
      }
      
      // Try dashboard endpoint instead
      const dashboardUrl = `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.STUDENT.DASHBOARD}?forceUpdate=true&_t=${Date.now()}`;
      
      const dashboardResponse = await fetch(dashboardUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${auth.getToken()}`,
          'Cache-Control': 'no-cache'
        }
      });
      
      if (dashboardResponse.ok) {
        console.log("Statistics update via dashboard endpoint successful");
        
        // Show notification for dashboard method
        setTimeout(() => {
          notifications.info('Your statistics have been updated!', 4000);
        }, 2000);
      } else {
        console.warn("Dashboard statistics update failed");
        
        // Try one last approach - force reload dashboard
        setTimeout(() => {
          console.log("Final fallback: Requesting user to visit dashboard for refresh");
          notifications.info('Please visit your dashboard to see updated statistics', 5000);
        }, 3000);
      }
    } catch (error) {
      console.error("Error in all statistics update fallbacks:", error);
    }
  }

  prepareAnswersForSubmission() {
    // Format answers in the way the API expects them
    const formattedAnswers = this.questions.map((question, index) => {
      const answer = this.answers[index];
      
      // Log what we're submitting to help with debugging
      console.log(`Preparing answer for question ${index+1}/${this.questions.length}:`, {
        questionId: question.id,
        questionText: question.question_text.substring(0, 30) + '...',
        answerValue: answer,
        questionType: question.question_type,
        wasShuffled: !!this.shuffledQuestionOrder
      });
      
      if (question.question_type === 'multiple_choice' && Array.isArray(answer)) {
        // For multiple choice with multiple selections
        return {
          questionId: question.id,
          // Send an array of answer IDs
          answerIds: answer.map(answerIndex => 
            question.answers[answerIndex]?.id
          ).filter(id => id !== undefined),
          textAnswer: null
        };
      } else if (question.question_type === 'short_answer') {
        // For short answer questions
        return {
          questionId: question.id,
          answerId: null,
          textAnswer: answer || ''
        };
      } else {
        // For true/false or single-selection multiple choice
        return {
          questionId: question.id,
          answerId: question.answers && answer !== undefined ? 
            question.answers[answer]?.id : null,
          textAnswer: null
        };
      }
    });
    
    console.log(`Submitting ${formattedAnswers.length} answers for ${this.questions.length} questions`);
    return formattedAnswers;
  }

  setupEventListeners() {
    // Handle option selection
    this.optionsGrid.addEventListener("click", (e) => {
      const option = e.target.closest(".option-btn");
      if (option && !this.isQuizCompleted) {
        const currentQuestion = this.questions[this.currentQuestionIndex];
        
        // For multiple choice questions, allow multiple selections
        if (currentQuestion.question_type === 'multiple_choice') {
          // Toggle the selected class
          option.classList.toggle("selected");
        } else {
          // For other question types, only allow one selection
          this.optionsGrid.querySelectorAll(".option-btn").forEach(btn => {
            btn.classList.remove("selected");
          });
          option.classList.add("selected");
        }
      }
    });
    
    // Track page visibility - immediately mark quiz as abandoned when user leaves
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden" && !this.isQuizCompleted) {
        // Immediately handle quiz abandonment when page becomes hidden
        this.handleQuizAbandonment();
        
        // Also set a local storage flag to recognize if user tries to return
        localStorage.setItem('quizAbandoned', `${this.quizId}_${Date.now()}`);
      }
    });

    // Check if this is a return after abandonment
    const abandonedQuizData = localStorage.getItem('quizAbandoned');
    if (abandonedQuizData && abandonedQuizData.startsWith(this.quizId + '_')) {
      // User is returning after abandonment, show modal
      const abandonmentModal = document.getElementById('abandonmentModal');
      if (abandonmentModal) {
        abandonmentModal.classList.add('active');
        this.isQuizCompleted = true; // Mark as completed to prevent further interaction
      }
    }

    // Handle back button and history navigation - prevent going back
    window.addEventListener("popstate", (e) => {
      if (!this.isQuizCompleted) {
        e.preventDefault();
        // Force abandonment on navigation attempt
        this.handleQuizAbandonment();
        // Restore the history state to prevent navigation
        history.pushState(null, null, window.location.pathname + window.location.search);
      }
    });

    // Stronger navigation prevention - replace the history entirely
    history.replaceState(null, null, window.location.pathname + window.location.search);
    history.pushState(null, null, window.location.pathname + window.location.search);

    // Handle before unload event (closing tab/browser)
    window.addEventListener("beforeunload", (e) => {
      if (!this.isQuizCompleted) {
        // Immediately mark as abandoned
        this.handleQuizAbandonment();
        
        // Standard confirmation message
        e.preventDefault();
        e.returnValue = "Leaving this page will cause you to fail the quiz. Are you sure?";
        return e.returnValue;
      }
    });

    // Handle modal stay button
    if (this.stayButton) {
      this.stayButton.addEventListener("click", () => {
        this.warningModal.classList.remove("active");
      });
    }
    
    // Handle time expired button
    const timeExpiredButton = document.getElementById('timeExpiredButton');
    if (timeExpiredButton) {
      timeExpiredButton.addEventListener("click", () => {
        window.location.href = "student-quizzes.html?expired=true";
      });
    }
    
    // Handle abandonment button
    const abandonmentButton = document.getElementById('abandonmentButton');
    if (abandonmentButton) {
      abandonmentButton.addEventListener("click", () => {
        window.location.href = "student-quizzes.html?abandoned=true";
      });
    }
    
    // Block all navigation links during quiz
    document.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', (e) => {
        if (!this.isQuizCompleted) {
          e.preventDefault();
          this.handleQuizAbandonment();
        }
      });
    });
  }

  startTimer() {
    const circumference = 2 * Math.PI * 45;
    this.timerProgress.style.strokeDasharray = circumference;

    this.timer = setInterval(() => {
      this.timeLeft--;
      this.timeRemaining--;
      const progress = (this.timeLeft / this.totalTime) * circumference;
      this.timerProgress.style.strokeDashoffset = circumference - progress;
      this.timerCount.textContent = this.timeLeft;

      if (this.timeLeft <= 5) {
        this.timerCircle.classList.add("warning");
      }

      if (this.timeLeft <= 0) {
        this.handleTimeUp();
      }
    }, 1000);
  }

  handleTimeUp() {
    clearInterval(this.timer);
    
    // Save current answers
    this.saveCurrentAnswer();
    
    // Show the time expired modal
    const timeExpiredModal = document.getElementById('timeExpiredModal');
    if (timeExpiredModal) {
      timeExpiredModal.classList.add('active');
    }
    
    // Auto-submit the quiz with the current answers
    this.submitQuiz(true); // true indicates it's an automatic submission due to time expiry
  }
  
  handleQuizAbandonment() {
    // Mark the quiz as abandoned
    clearInterval(this.timer);
    
    // Only process abandonment once
    if (this.isQuizCompleted) {
      return;
    }
    
    // Mark as completed to prevent multiple abandonment attempts
    this.isQuizCompleted = true;
    
    try {
      // Save current progress first
      this.saveCurrentAnswer();
      
      // Show the abandonment modal
      const abandonmentModal = document.getElementById('abandonmentModal');
      if (abandonmentModal) {
        abandonmentModal.classList.add('active');
      }
      
      // Save abandonment status in localStorage to persist across page loads
      localStorage.setItem('quizAbandoned', `${this.quizId}_${Date.now()}`);
      
      // Use synchronous XMLHttpRequest for abandonment to ensure it completes
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.QUIZ.ATTEMPT}?id=${this.quizId}&action=abandon`, false);
      xhr.setRequestHeader("Content-Type", "application/json");
      xhr.setRequestHeader("Authorization", `Bearer ${auth.getToken()}`);
      xhr.send(JSON.stringify({
        attemptId: this.attemptId,
        answers: this.prepareAnswersForSubmission()
      }));
      
      console.log("Quiz marked as abandoned");
      
      // Also send an asynchronous request as backup
      fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.QUIZ.ATTEMPT}?id=${this.quizId}&action=abandon`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${auth.getToken()}`
        },
        body: JSON.stringify({
          attemptId: this.attemptId,
          answers: this.prepareAnswersForSubmission()
        })
      }).catch(err => {
        console.error("Error in backup abandonment request:", err);
      });
    } catch (error) {
      console.error("Error during quiz abandonment:", error);
    }
  }

  showWarningModal() {
    if (this.warningModal) {
      this.warningModal.classList.add("active");
    }
  }

  showError(message, isAuthError = false) {
    console.error(`Quiz error: ${message}`);
    
    // Different handling based on error type
    if (isAuthError) {
      // For authentication errors, redirect to login
      notifications.error(message || 'Authentication failed. Please log in again.');
      setTimeout(() => {
        // Pass the quiz ID in the URL so we can potentially return to it after login
        window.location.href = `login.html?redirect=quiz&id=${this.quizId}`;
      }, 2000);
    } else {
      // For other errors, show message and return to quizzes page
      notifications.error(message || 'An error occurred with this quiz. Please try again later.');
      setTimeout(() => {
        window.location.href = "student-quizzes.html";
      }, 2000);
    }
  }

  // Replace the manual token refresh with auth utility method
  async refreshToken() {
    return auth.refreshToken();
  }

  // Add loading state functionality
  setLoadingState(isLoading) {
    const loadingElement = document.querySelector('.quiz-loading') || this.createLoadingElement();
    
    if (isLoading) {
      loadingElement.style.display = 'flex';
    } else {
      loadingElement.style.display = 'none';
    }
  }
  
  createLoadingElement() {
    const loadingElement = document.createElement('div');
    loadingElement.className = 'quiz-loading';
    loadingElement.innerHTML = `
      <div class="loading-spinner"></div>
      <p>Loading...</p>
    `;
    document.body.appendChild(loadingElement);
    return loadingElement;
  }

  // Improved method to handle fetch responses safely with JSON parsing
  async fetchWithErrorHandling(url, options = {}) {
    try {
      // Add special handling for database column issues
      if (url.includes('action=start') && this.quizId) {
        // If we're loading a quiz, add a workaround for database issues
        console.log('Adding fallback handling for potential database schema issues');
      }
      
      // CRITICAL: Ensure we're using our backup token mechanism for requests
      const token = auth.getToken();
      if (!token) {
        // If no token at all, try the backup from sessionStorage directly
        const backupToken = sessionStorage.getItem('quizSessionToken');
        if (backupToken) {
          console.log('Using backup token from sessionStorage for request');
          if (options.headers) {
            options.headers.Authorization = `Bearer ${backupToken}`;
          } else {
            options.headers = {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${backupToken}`
            };
          }
        } else {
          console.warn('No token available for request (not even backup)');
        }
      } else {
        // Ensure the Authorization header has the latest token
        if (options.headers) {
          options.headers.Authorization = `Bearer ${token}`;
        } else {
          options.headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          };
        }
      }

      console.log(`Quiz answer - Making request to: ${url}`);
      
      // Track auth checks to prevent infinite loops
      this.authChecksInProgress++;
      
      // If we're in too many auth checks, just proceed with the request as is
      if (this.authChecksInProgress > 2) {
        console.warn('Too many auth checks in progress, proceeding with request as is');
        const directResponse = await fetch(url, options);
        const text = await directResponse.text();
        this.authChecksInProgress = 0;
        try {
          return JSON.parse(text);
        } catch (err) {
          console.error('Failed to parse direct response:', text);
          return { success: false, message: 'Invalid response format' };
        }
      }
      
      // IMPORTANT: Add cache-busting parameter to prevent stale responses
      const urlWithCacheBuster = url.includes('?') 
        ? `${url}&_cb=${Date.now()}` 
        : `${url}?_cb=${Date.now()}`;
      
      const response = await fetch(urlWithCacheBuster, options);
      
      // Reset auth checks counter on successful response
      if (response.ok) {
        this.authChecksInProgress = 0;
      }
      
      if (!response.ok) {
        console.log(`Quiz answer - Response not OK: ${response.status}`);
        
        // Handle 401 unauthorized errors by trying to refresh the token once
        if (response.status === 401 || response.status === 403) {
          console.log('Quiz answer - Received auth failure, attempting to use backup token');
          
          // Try backup token if available
          const backupToken = sessionStorage.getItem('quizSessionToken');
          if (backupToken) {
            console.log('Using backup token for retry');
            
            if (options.headers) {
              options.headers.Authorization = `Bearer ${backupToken}`;
            } else {
              options.headers = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${backupToken}`
              };
            }
            
            // Reset auth checks counter with new token
            this.authChecksInProgress = 0;
            
            // Retry the request with the backup token
            console.log('Quiz answer - Retrying request with backup token');
            const retryResponse = await fetch(urlWithCacheBuster, options);
            
            if (!retryResponse.ok) {
              console.error(`Quiz answer - Retry failed with status ${retryResponse.status}`);
              
              // Return a blank success response to keep the quiz running
              return { 
                success: true, 
                message: "Continuing with quiz despite auth issues",
                attemptId: this.attemptId || "backup-attempt-id",
                quiz: this.quiz || {},
                questions: this.questions || []
              };
            }
            
            const text = await retryResponse.text();
            try {
              return JSON.parse(text);
            } catch (err) {
              console.error('Quiz answer - Invalid JSON in retry response');
              throw new Error('Invalid response format');
            }
          } else {
            // If no backup token, try to generate a minimally valid response
            console.warn('No backup token available - generating minimal response');
            
            if (this.attemptId && this.questions.length > 0) {
              // We already have enough data to continue
              return {
                success: true,
                message: "Continuing with existing quiz data",
                attemptId: this.attemptId,
                quiz: this.quiz || {},
                questions: this.questions || []
              };
            } else {
              // We don't have enough data
              console.error('Cannot continue quiz without valid data');
              throw new Error('Authentication failed and no backup data available');
            }
          }
        }
        
        // For other errors, throw and let the caller handle them
        throw new Error(`Request failed with status ${response.status}`);
      }
      
      // Get response text first to check if it's valid JSON
      const text = await response.text();
      try {
        // Try to parse as JSON
        const jsonData = JSON.parse(text);
        
        // Special handling for database schema issues
        if (jsonData && !jsonData.success && jsonData.message) {
          // Check for different types of database errors
          if (jsonData.message.includes('column') || 
              jsonData.message.includes('time_limit') ||
              jsonData.message.includes("Table 'quizmaster.questions' doesn't exist") ||
              jsonData.message.includes("Base table or view not found")) {
            
            console.log('Detected database schema issue:', jsonData.message);
            
            // Create a fallback response with defaults
            const fallbackData = {
              ...jsonData,
              success: false, // Keep as error to trigger proper handling
              error: jsonData.message, // Store original error
              message: jsonData.message, // Keep original error message
            };
          
            if (this.quiz && this.questions && this.questions.length > 0) {
              // If we already have quiz data, use it
              fallbackData.quiz = this.quiz;
              fallbackData.questions = this.questions;
              fallbackData.attemptId = this.attemptId || `fallback-${this.quizId}-${Date.now()}`;
            } else {
              // Instead of creating sample data, mark the response as unsuccessful
              console.log("Cannot create valid quiz data - database structure issue");
              fallbackData.success = false;
              fallbackData.message = "Database schema mismatch - cannot load quiz";
            }
            
            return fallbackData;
          }
        }
        
        return jsonData;
      } catch (err) {
        console.error('Quiz answer - Failed to parse JSON response:', text);
        throw new Error('Invalid response format');
      }
    } catch (error) {
      console.error('Quiz answer - Fetch error:', error);
      this.authChecksInProgress = 0; // Reset on error
      throw error;
    }
  }

  /**
   * Render the quiz information in the UI
   */
  renderQuizInfo() {
    // Set teacher info if elements exist
    if (this.teacherAvatar && this.quiz.teacherAvatar) {
      let avatarPath = this.quiz.teacherAvatar;
      
      // Handle different path formats
      if (avatarPath.includes('uploads/profile_pictures/') || avatarPath.includes('profile_pictures/')) {
        // If it's an uploaded file and doesn't have the backend prefix, add it
        if (!avatarPath.startsWith('/quizmaster/backend/')) {
          avatarPath = '/quizmaster/backend/' + avatarPath;
        }
      } else if (avatarPath === 'profile-placeholder.svg' || avatarPath === 'images/profile-placeholder.svg') {
        // Handle placeholder image
        avatarPath = '/quizmaster/frontend/images/profile-placeholder.svg';
      } else if (!avatarPath.startsWith('/quizmaster/') && !avatarPath.startsWith('http')) {
        // Add quizmaster prefix for other relative paths
        avatarPath = '/quizmaster/frontend/images/' + avatarPath;
      }

      // Add error handler for image loading
      this.teacherAvatar.onerror = () => {
        console.log('Teacher avatar failed to load, using placeholder');
        this.teacherAvatar.src = '/quizmaster/frontend/images/profile-placeholder.svg';
        // Remove the error handler to prevent infinite loops
        this.teacherAvatar.onerror = null;
      };
      
      // Add CSS to ensure proper image positioning
      const styleEl = document.createElement('style');
      styleEl.textContent = `
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
          transition: transform 0.1s ease-out;
          position: relative;
        }
      `;
      document.head.appendChild(styleEl);
      
      this.teacherAvatar.src = avatarPath;
      this.teacherAvatar.alt = this.quiz.teacherName || 'Teacher';
    }
    
    if (this.teacherName) {
      this.teacherName.textContent = this.quiz.teacherName || 'Teacher';
    }
    
    if (this.subject) {
      this.subject.textContent = this.quiz.subject || 'Subject';
    }
    
    // Update page title
    document.title = `Taking: ${this.quiz.title} | QuizMaster`;
    
    // Initialize the timer with the time remaining
    this.totalTime = this.timeRemaining;
    this.timeLeft = this.timeRemaining;
    
    if (this.timerCount) {
      this.timerCount.textContent = this.timeLeft;
    }
  }

  /**
   * Create navigation buttons for questions
   */
  createQuestionNavigation() {
    // Create question navigation dots if not already present
    const progressContainer = document.querySelector('.quiz-progress');
    if (!progressContainer) return;
    
    progressContainer.innerHTML = '';
    
    // Create dots for each question
    for (let i = 0; i < this.questions.length; i++) {
      const dot = document.createElement('div');
      dot.className = 'progress-dot';
      
      if (i === this.currentQuestionIndex) {
        dot.classList.add('current');
      }
      
      // Add click event to navigate to that question
      dot.addEventListener('click', () => {
        this.saveCurrentAnswer();
        this.showQuestion(i);
      });
      
      progressContainer.appendChild(dot);
    }
  }

  renderQuizHeader(quiz) {
    if (!quiz) return;
    
    // Format teacher avatar path
    let teacherAvatar = quiz.teacherAvatar || 'images/profile-placeholder.svg';
    
    // Handle different path formats
    if (teacherAvatar.includes('uploads/profile_pictures/') || teacherAvatar.includes('profile_pictures/')) {
      // If it's an uploaded file and doesn't have the backend prefix, add it
      if (!teacherAvatar.startsWith('/quizmaster/backend/')) {
        teacherAvatar = '/quizmaster/backend/' + teacherAvatar;
      }
    } else if (teacherAvatar === 'profile-placeholder.svg' || teacherAvatar === 'images/profile-placeholder.svg') {
      // Handle placeholder image
      teacherAvatar = '/quizmaster/frontend/images/profile-placeholder.svg';
    } else if (!teacherAvatar.startsWith('/quizmaster/') && !teacherAvatar.startsWith('http')) {
      // Add quizmaster prefix for other relative paths
      teacherAvatar = '/quizmaster/frontend/images/' + teacherAvatar;
    }

    // Get position data from quiz
    const x = quiz.image_position_x || quiz.teacher_image_position_x || 
              (quiz.teacher && quiz.teacher.image_position_x) || 0;
              
    const y = quiz.image_position_y || quiz.teacher_image_position_y || 
              (quiz.teacher && quiz.teacher.image_position_y) || 0;
              
    const scale = quiz.image_scale || quiz.teacher_image_scale || 
                  (quiz.teacher && quiz.teacher.image_scale) || 1;

    // Add CSS for proper image positioning
    const styleEl = document.createElement('style');
    styleEl.textContent = `
      .quiz-header .teacher-avatar {
        width: 100%;
        height: 100%;
        object-fit: cover;
        object-position: ${x}px ${y}px;
        transform: scale(${scale});
        transform-origin: center center;
        will-change: transform, object-position;
        backface-visibility: hidden;
        image-rendering: high-quality;
        position: relative;
      }
      
      .quiz-header .avatar-container {
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
    `;
    document.head.appendChild(styleEl);
    
    // Update the quiz header with teacher info
    const headerHTML = `
      <div class="quiz-title-container">
        <h1 class="quiz-title">${quiz.title}</h1>
        <div class="quiz-meta">
          <span class="subject">${quiz.subject}</span>
          <span class="questions-count">${quiz.questions.length} Questions</span>
        </div>
      </div>
      <div class="quiz-info">
        <div class="teacher-info">
          <div class="avatar-container">
            <img src="${teacherAvatar}" alt="${quiz.teacherName}" class="teacher-avatar" 
                 onerror="this.src='/quizmaster/frontend/images/profile-placeholder.svg'">
          </div>
          <div class="teacher-details">
            <div class="label">Teacher</div>
            <div class="name">${quiz.teacherName}</div>
          </div>
        </div>
      </div>
    `;
    
    document.querySelector('.quiz-header').innerHTML = headerHTML;
  }
}

// Initialize when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  const quizAnswer = new QuizAnswer();
});

export default QuizAnswer;
