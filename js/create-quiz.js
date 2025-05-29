import notifications from './utils/notifications.js?v=1.0.1';
import API_CONFIG from './config.js?v=1.0.1';
import auth from './utils/auth.js';
import { validatePassword } from './utils/validation.js';

// Initialize EmailJS when the script loads
window.onload = function() {
  emailjs.init('N6vvB7wF7TnGfLNVM');
}

class QuizCreator {
  constructor() {
    // First check if we're editing an existing quiz
    this.isEditMode = false
    this.editQuizId = null
    this.checkForEditMode()
    
    // Then initialize the rest
    this.init()
    this.setupEventListeners()
    
    // Set initial state as not dirty (no unsaved changes yet)
    this.isDirty = false
    
    // Check if we're returning from a refresh with saved data
    this.checkForRefreshData()
    
    // Load subjects from API before setting up the first question
    this.loadSubjects().then(() => {
      // If in edit mode, load the quiz data
      if (this.isEditMode) {
        this.loadQuizData(this.editQuizId)
      } else {
        // Set initial question ID
        this.currentQuestionId = 1
        
        // Setup the first question that exists in HTML
        const firstQuestion = document.querySelector(".question-card")
        if (firstQuestion) {
          firstQuestion.dataset.questionId = this.currentQuestionId
          this.setupQuestionEvents(firstQuestion)
          
          // Set the initial question type to multiple_choice and trigger the change event
          const typeSelect = firstQuestion.querySelector(".question-type")
          if (typeSelect) {
            // Ensure the type is set to multiple_choice initially
            typeSelect.value = "multiple_choice";
            // Set up initial question view without marking as dirty
            this.handleInitialQuestionSetup(typeSelect, this.currentQuestionId)
          }
        }
      }
    })
  }

  init() {
    // Form elements
    this.quizForm = document.querySelector(".quiz-form-container")
    this.questionsList = document.querySelector("#questionsList")
    this.addQuestionBtn = document.querySelector(".add-question-btn")
    this.subjectSelect = document.getElementById("subject")
    this.createQuizBtn = document.querySelector(".action-btn.primary")
    this.saveDraftBtn = document.querySelector(".action-btn.outline")
    
    // Results timing elements
    this.showResultsToggle = document.getElementById("showResults")
    this.resultsTimingContainer = document.getElementById("resultsTimingContainer")
    this.resultsDelay = document.getElementById("resultsDelay")
    this.resultsDelayUnit = document.getElementById("resultsDelayUnit")

    // State management
    this.questions = []
    this.currentQuestionId = 0
    this.isDirty = false
    this.isSubmitting = false
    
    // Update button text if in edit mode
    if (this.isEditMode) {
      this.createQuizBtn.textContent = "Update Quiz"
      document.title = "Edit Quiz - QuizMaster"
      document.querySelector('.section-title').textContent = "Edit Quiz"
    }
    
    // Initialize results timing visibility
    this.updateResultsTimingVisibility()
  }

  setupEventListeners() {
    // Update form submission handler - target the specific button instead of the whole form
    this.createQuizBtn.addEventListener("click", (e) => {
      e.preventDefault()
      this.handleSubmit(e)
    })

    // Add question button
    this.addQuestionBtn.addEventListener("click", () => this.addNewQuestion())

    // Save draft
    this.saveDraftBtn.addEventListener("click", (e) => {
      e.preventDefault()
      this.saveDraft()
    })

    // Subject select change - set to dirty
    this.subjectSelect.addEventListener("change", () => {
      this.isDirty = true
    })

    // Question title and description changes - set to dirty
    document.getElementById("quizTitle").addEventListener("input", (e) => {
      // Only mark as dirty if there's actual content
      if (e.target.value.trim().length > 0) {
        this.isDirty = true
      }
    })
    
    document.getElementById("description").addEventListener("input", (e) => {
      // Only mark as dirty if there's actual content
      if (e.target.value.trim().length > 0) {
        this.isDirty = true
      }
    })

    // Create a custom modal for unsaved changes
    this.createUnsavedChangesModal()

    // Create a navigation interceptor that will show our custom modal
    this.setupNavigationInterceptor()

    // Results timing controls
    if (this.showResultsToggle) {
      this.showResultsToggle.addEventListener("change", () => {
        this.updateResultsTimingVisibility()
        this.isDirty = true
      })
    }

    if (this.resultsDelay) {
      this.resultsDelay.addEventListener("input", () => {
        this.validateResultsDelay()
        this.isDirty = true
      })
    }

    if (this.resultsDelayUnit) {
      this.resultsDelayUnit.addEventListener("change", () => {
        this.validateResultsDelay()
        this.isDirty = true
      })
    }
  }

  addNewQuestion() {
    this.currentQuestionId++
    const questionHTML = this.createQuestionTemplate(this.currentQuestionId)
    this.questionsList.insertAdjacentHTML("beforeend", questionHTML)

    // Setup new question events
    const newQuestion = this.questionsList.lastElementChild
    this.setupQuestionEvents(newQuestion)
    this.isDirty = true
  }

  createQuestionTemplate(id) {
    return `
            <div class="question-card" data-question-id="${id}">
                <div class="question-header">
                    <div class="question-info">
                        <span class="question-number">Question ${id}</span>
                        <span class="timer-badge">
                            <i class="fas fa-clock"></i> 15s
                        </span>
                    </div>
                    <div class="question-actions">
                        <button class="icon-btn" title="Move Up">
                            <i class="fas fa-arrow-up"></i>
                        </button>
                        <button class="icon-btn" title="Move Down">
                            <i class="fas fa-arrow-down"></i>
                        </button>
                        <button class="icon-btn delete" title="Delete">
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
                        <select class="question-type">
                            <option value="multiple_choice">Multiple Choice</option>
                            <option value="true_false">True/False</option>
                            <option value="short_answer">Short Answer</option>
                        </select>
                    </div>
                    <div class="options-list">
                        <div class="option-item">
                            <input type="checkbox" name="correct${id}">
                            <input type="text" placeholder="Option 1">
                            <button class="remove-option">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                    </div>
                    <button class="add-option-btn">
                        <i class="fas fa-plus"></i> Add Option
                    </button>
                </div>
            </div>
        `
  }

  setupQuestionEvents(questionCard) {
    const questionId = questionCard.dataset.questionId

    // Question type change
    const typeSelect = questionCard.querySelector(".question-type")
    typeSelect.addEventListener("change", (e) => {
      this.handleQuestionTypeChange(e, questionId)
    })

    // Add option button
    const addOptionBtn = questionCard.querySelector(".add-option-btn")
    if (addOptionBtn) {
      addOptionBtn.addEventListener("click", () => {
        this.addOption(questionId)
      })
    }

    // Setup existing remove option buttons
    questionCard.querySelectorAll(".remove-option").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.removeOption(btn.closest(".option-item"))
      })
    })

    // Delete question button
    questionCard.querySelector(".delete").addEventListener("click", () => this.deleteQuestion(questionId))

    // Move buttons
    questionCard.querySelector('[title="Move Up"]').addEventListener("click", () => this.moveQuestion(questionId, "up"))
    questionCard
      .querySelector('[title="Move Down"]')
      .addEventListener("click", () => this.moveQuestion(questionId, "down"))
  }

  handleInitialQuestionSetup(typeSelectElement, questionId) {
    const type = typeSelectElement.value;
    console.log(`Initial question type setup: ${type} for question ${questionId}`);
    
    const questionCard = document.querySelector(`[data-question-id="${questionId}"]`);
    if (!questionCard) {
      console.error(`Cannot find question card with id ${questionId}`);
      return;
    }
    
    const optionsList = questionCard.querySelector(".options-list");
    const addOptionBtn = questionCard.querySelector(".add-option-btn");
    
    // Clear existing options
    optionsList.innerHTML = "";
    
    // Handle each question type
    if (type === "short_answer") {
      console.log("Setting up short answer question");
      optionsList.innerHTML = `
        <div class="text-answer">
          <input type="text" class="correct-answer" placeholder="Enter the correct answer">
        </div>
      `;
      addOptionBtn.style.display = "none";
    } 
    else if (type === "true_false") {
      console.log("Setting up true/false question");
      optionsList.innerHTML = `
        <div class="option-item">
          <input type="radio" name="correct${questionId}" value="true" checked>
          <input type="text" value="True" readonly>
        </div>
        <div class="option-item">
          <input type="radio" name="correct${questionId}" value="false">
          <input type="text" value="False" readonly>
        </div>
      `;
      addOptionBtn.style.display = "none";
    } 
    else if (type === "multiple_choice") {
      console.log("Setting up multiple choice question");
      optionsList.innerHTML = `
        <div class="option-item">
          <input type="checkbox" name="correct${questionId}">
          <input type="text" placeholder="Option 1">
          <button class="remove-option">
            <i class="fas fa-times"></i>
          </button>
        </div>
      `;
      
      // Setup remove button for options
      const removeBtn = optionsList.querySelector(".remove-option");
      if (removeBtn) {
        removeBtn.addEventListener("click", () => {
          this.removeOption(removeBtn.closest(".option-item"));
        });
      }
      
      addOptionBtn.style.display = "block";
    }
    else {
      console.error(`Unknown question type: ${type}`);
    }
  }

  handleQuestionTypeChange(event, questionId) {
    const type = event.target.value;
    console.log(`Question type changed to: ${type} for question ${questionId}`);
    
    const questionCard = document.querySelector(`[data-question-id="${questionId}"]`);
    if (!questionCard) {
      console.error(`Cannot find question card with id ${questionId}`);
      return;
    }
    
    const optionsList = questionCard.querySelector(".options-list");
    const addOptionBtn = questionCard.querySelector(".add-option-btn");
    
    // Clear existing options
    optionsList.innerHTML = "";
    
    // Handle each question type
    if (type === "short_answer") {
      console.log("Setting up short answer question");
      optionsList.innerHTML = `
        <div class="text-answer">
          <input type="text" class="correct-answer" placeholder="Enter the correct answer">
        </div>
      `;
      addOptionBtn.style.display = "none";
    } 
    else if (type === "true_false") {
      console.log("Setting up true/false question");
      optionsList.innerHTML = `
        <div class="option-item">
          <input type="radio" name="correct${questionId}" value="true" checked>
          <input type="text" value="True" readonly>
        </div>
        <div class="option-item">
          <input type="radio" name="correct${questionId}" value="false">
          <input type="text" value="False" readonly>
        </div>
      `;
      addOptionBtn.style.display = "none";
    } 
    else if (type === "multiple_choice") {
      console.log("Setting up multiple choice question");
      optionsList.innerHTML = `
        <div class="option-item">
          <input type="checkbox" name="correct${questionId}">
          <input type="text" placeholder="Option 1">
          <button class="remove-option">
            <i class="fas fa-times"></i>
          </button>
        </div>
      `;
      
      // Setup remove button for options
      const removeBtn = optionsList.querySelector(".remove-option");
      if (removeBtn) {
        removeBtn.addEventListener("click", () => {
          this.removeOption(removeBtn.closest(".option-item"));
        });
      }
      
      addOptionBtn.style.display = "block";
    }
    else {
      console.error(`Unknown question type: ${type}`);
    }
    
    this.isDirty = true;
  }

  addOption(questionId) {
    const questionCard = document.querySelector(`[data-question-id="${questionId}"]`)
    const optionsList = questionCard.querySelector(".options-list")
    const questionType = questionCard.querySelector(".question-type").value
    const optionCount = optionsList.children.length + 1

    // Only allow adding options for multiple_choice questions
    if (questionType !== "multiple_choice") return;

    const optionHTML = `
            <div class="option-item">
                <input type="checkbox" name="correct${questionId}">
                <input type="text" placeholder="Option ${optionCount}">
                <button class="remove-option">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `

    optionsList.insertAdjacentHTML("beforeend", optionHTML)

    // Setup remove button
    const newOption = optionsList.lastElementChild
    newOption.querySelector(".remove-option").addEventListener("click", () => {
      this.removeOption(newOption)
    })

    this.isDirty = true
  }

  getInputType(questionId) {
    const questionType = document.querySelector(`[data-question-id="${questionId}"] .question-type`).value
    return questionType === "multiple_choice" ? "checkbox" : "radio"
  }

  removeOption(optionElement) {
    optionElement.remove()
    this.isDirty = true
  }

  deleteQuestion(questionId) {
    if (confirm("Are you sure you want to delete this question?")) {
      document.querySelector(`[data-question-id="${questionId}"]`).remove()
      this.renumberQuestions()
      this.isDirty = true
    }
  }

  moveQuestion(questionId, direction) {
    const questionCard = document.querySelector(`[data-question-id="${questionId}"]`)
    const sibling = direction === "up" ? questionCard.previousElementSibling : questionCard.nextElementSibling

    if (sibling) {
      if (direction === "up") {
        questionCard.parentNode.insertBefore(questionCard, sibling)
      } else {
        questionCard.parentNode.insertBefore(sibling, questionCard)
      }
      this.renumberQuestions()
      
      // Add animation to highlight the moved question
      questionCard.classList.add('question-moved')
      setTimeout(() => {
        questionCard.classList.remove('question-moved')
      }, 1000)
      
      this.isDirty = true
    }
  }

  renumberQuestions() {
    document.querySelectorAll(".question-card").forEach((card, index) => {
      const questionNumber = card.querySelector(".question-number");
      if (questionNumber) {
        questionNumber.textContent = `Question ${index + 1}`;
        
        // Update the data attribute with the new order
        card.dataset.questionOrder = index + 1;
        
        // Update the timer badge with the question number for clarity
        const timerBadge = card.querySelector(".timer-badge");
        if (timerBadge) {
          timerBadge.innerHTML = `<i class="fas fa-clock"></i> Q${index + 1}`;
        }
      }
    })
  }

  async handleSubmit(event) {
    event.preventDefault(); // Prevent default form submission
    
    // Get the submit button correctly
    const submitBtn = document.querySelector(".action-btn.primary");
    
    if (this.isSubmitting || !submitBtn) return;

    try {
      this.isSubmitting = true;
      
      // Only modify the button if it exists
      if (submitBtn) {
        const actionText = this.isEditMode ? 'Updating' : 'Creating';
        submitBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${actionText}...`;
        submitBtn.disabled = true;
      }

      const quizData = this.gatherQuizData();
      
      // Ensure we have a valid passing score
      if (isNaN(quizData.passScore) || quizData.passScore < 0 || quizData.passScore > 100) {
        console.warn("Invalid passing score detected, using default 60%");
        quizData.passScore = 60;
      }
      
      // IMPORTANT: Set the status to published explicitly for Create Quiz button
      quizData.status = 'published';
      console.log(`%c Setting quiz status to PUBLISHED (${this.isEditMode ? 'Edit' : 'Create'} mode)`, "background: green; color: white; padding: 4px; font-weight: bold;");
      console.log("Final quiz data before validation:", {
        title: quizData.title,
        passScore: quizData.passScore,
        subject: quizData.subject,
        questionCount: quizData.questions.length,
        isEditMode: this.isEditMode,
        editQuizId: this.editQuizId
      });
      
      if (!this.validateQuizData(quizData)) {
        // Reset the button state if validation fails
        if (submitBtn) {
          const actionText = this.isEditMode ? 'Update Quiz' : 'Create Quiz';
          submitBtn.innerHTML = actionText;
          submitBtn.disabled = false;
        }
        this.isSubmitting = false;
        return;
      }

      await this.submitQuiz(quizData);
      this.isDirty = false;
    } catch (error) {
      const actionText = this.isEditMode ? 'update' : 'create';
      this.showError(`Failed to ${actionText} quiz: ${error.message || ''}`);
    } finally {
      this.isSubmitting = false;
      
      // Only modify the button if it exists
      if (submitBtn) {
        const actionText = this.isEditMode ? 'Update Quiz' : 'Create Quiz';
        submitBtn.innerHTML = actionText;
        submitBtn.disabled = false;
      }
    }
  }

  gatherQuizData() {
    const quizData = {
      title: document.getElementById("quizTitle").value,
      subject: document.getElementById("subject").value,
      passScore: Number.parseInt(document.getElementById("passScore").value) || 60,
      description: document.getElementById("description").value,
      questionTimer: 15,
      questions: [],
      shuffle_questions: document.getElementById("shuffleQuestions").checked,
      settings: {
        showResults: document.getElementById("showResults").checked,
        showResultsAfter: this.calculateResultsDateTime()?.toISOString() || null
      },
    }

    document.querySelectorAll(".question-card").forEach((card, index) => {
      const questionData = {
        text: card.querySelector(".question-text").value,
        type: card.querySelector(".question-type").value,
        order: parseInt(card.dataset.questionOrder || index + 1),
        options: [],
      }

      // Handle different question types
      if (questionData.type === 'short_answer') {
        const correctAnswerInput = card.querySelector(".text-answer .correct-answer");
        if (correctAnswerInput) {
          const answerText = correctAnswerInput.value.trim();
          // Format short answer as an option array with one correct answer
          questionData.options = [{
            text: answerText,
            isCorrect: true
          }];
        }
      } else if (questionData.type === 'true_false') {
        const options = card.querySelectorAll(".option-item");
        options.forEach(option => {
          const radio = option.querySelector('input[type="radio"]');
          const text = option.querySelector('input[type="text"]').value;
        questionData.options.push({
            text: text,
            isCorrect: radio.checked
        });
        });
      } else if (questionData.type === 'multiple_choice') {
        card.querySelectorAll(".option-item").forEach(option => {
          const checkbox = option.querySelector('input[type="checkbox"]');
          const text = option.querySelector('input[type="text"]').value;
          questionData.options.push({
            text: text,
            isCorrect: checkbox.checked
          });
        });
      }

      quizData.questions.push(questionData);
    });

    return quizData;
  }

  validateQuizData(data) {
    if (!data.title || !data.subject) {
      this.showError("Please fill in all required fields");
      return false;
    }

    if (data.questions.length === 0) {
      this.showError("Please add at least one question");
      return false;
    }

    // Validate results timing if immediate results are disabled
    if (!data.settings.showResults) {
      if (!this.resultsDelay || !this.resultsDelayUnit) {
        this.showError("Please specify when results should be shown");
        return false;
      }
      
      const value = parseInt(this.resultsDelay.value)
      if (isNaN(value) || value <= 0) {
        this.showError("Please enter a valid delay for showing results");
        return false;
      }
    }

    for (const question of data.questions) {
      if (!question.text || question.text.trim() === "") {
        this.showError("All questions must have text");
        return false;
      }

      if (question.type === "short_answer") {
        if (!question.options || !Array.isArray(question.options) || question.options.length === 0) {
          this.showError("Short answer questions must have a correct answer");
          return false;
        }
        const answer = question.options[0];
        if (!answer || !answer.text || answer.text.trim() === "") {
          this.showError("Short answer questions must have a correct answer");
          return false;
        }
      } else if (question.type === "multiple_choice") {
        if (!question.options || question.options.length < 2) {
          this.showError("Multiple choice questions must have at least 2 options");
          return false;
        }
        
        if (!question.options.some(opt => opt.isCorrect)) {
          this.showError("Multiple choice questions must have at least one correct answer");
          return false;
        }
        
        // Check if all options have text
        for (const option of question.options) {
          if (!option.text || option.text.trim() === "") {
            this.showError("All options must have text");
            return false;
          }
        }
      } else if (question.type === "true_false") {
        if (!question.options || question.options.length !== 2) {
          this.showError("True/False questions must have both True and False options");
          return false;
        }
        
        if (!question.options.some(opt => opt.isCorrect)) {
          this.showError("True/False questions must have either True or False selected as the correct answer");
          return false;
        }
      } else {
        this.showError(`Invalid question type: ${question.type}`);
        return false;
      }
    }

    return true;
  }

  async submitQuiz(quizData) {
    try {
      console.log("Submitting quiz data:", quizData);
      
      // Verify passScore is valid before submitting
      if (isNaN(quizData.passScore) || quizData.passScore <= 0) {
        console.warn("Invalid passing score detected, using default 60");
        quizData.passScore = 60;
      }
      
      // Format the quiz data to match backend API expectations
      const formattedData = {
        title: quizData.title,
        description: quizData.description,
        subject: quizData.subject,
        passing_score: quizData.passScore,
        is_active: 1,
        shuffle_questions: quizData.shuffle_questions ? 1 : 0,
        show_results_after: !quizData.settings.showResults ? this.calculateResultsDateTime()?.toISOString() : null,
        status: quizData.status || 'draft',
        questions: []
      };

      // Format questions array
      if (quizData.questions && quizData.questions.length > 0) {
        formattedData.questions = quizData.questions.map(q => ({
          text: q.text,
          type: q.type,
          order: q.order,
          options: q.type === 'short_answer' ? 
            [{ text: q.options[0].text, is_correct: 1 }] :
            q.options.map(opt => ({
              text: opt.text,
              is_correct: opt.isCorrect ? 1 : 0
            }))
        }));
      }
      
      // If in edit mode, add the quiz ID to update
      if (this.isEditMode && this.editQuizId) {
        formattedData.id = this.editQuizId;
        console.log("Updating existing quiz with ID:", this.editQuizId);
      }
      
      console.log("Final formatted data for API:", formattedData);
      
      // Determine which endpoint to use
      const endpoint = this.isEditMode ? 
        `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.QUIZ.UPDATE}` : 
        `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.QUIZ.SUBMIT}`;
      
      const method = this.isEditMode ? 'PUT' : 'POST';
      
      const response = await fetch(endpoint, {
        method: method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('userToken')}`
        },
        body: JSON.stringify(formattedData)
      });

      // Log the raw response for debugging
      const responseText = await response.text();
      console.log('Raw server response:', responseText);

      let data;
      try {
        data = JSON.parse(responseText);
      } catch (error) {
        console.error('Failed to parse server response:', error);
        throw new Error('Invalid response from server');
      }

      if (!response.ok || !data.success) {
        throw new Error(data.error || `Failed to ${this.isEditMode ? 'update' : 'submit'} quiz`);
      }
      
      let successMessage;
      
      if (this.isEditMode) {
        successMessage = formattedData.status === 'published' 
          ? 'Quiz updated and published successfully!' 
          : 'Quiz updated and saved as draft successfully!';
      } else {
        successMessage = formattedData.status === 'published' 
          ? 'Quiz published successfully!' 
          : 'Quiz saved as draft successfully!';
      }
        
      console.log(successMessage, "Quiz status was:", formattedData.status);
      
      // Send email notifications if quiz is published
      if (formattedData.status === 'published') {
        try {
          // Get teacher's name using the auth module
          const currentUser = auth.getCurrentUser();
          console.log('Current user data:', currentUser);
          
          let teacherName = currentUser?.fullname || currentUser?.name || 'Your Teacher';
          console.log('Using teacher name:', teacherName);
          
          // Get subject name
          const subjectElement = document.getElementById('subject');
          const subjectName = subjectElement?.options[subjectElement.selectedIndex]?.text || 'General';
          
          console.log('Fetching students with notifications enabled...');
          
          // Fetch students assigned to this teacher
          const studentsResponse = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.TEACHER.STUDENTS}`, {
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('userToken')}`
            }
          });
          
          const studentsData = await studentsResponse.json();
          console.log('All students data:', studentsData);
          
          if (studentsData.success && studentsData.students) {
            // Fetch students with notifications enabled
            console.log('Fetching students with notifications...');
            const notificationsResponse = await fetch(`${API_CONFIG.BASE_URL}/teacher/students-with-notifications.php`, {
              headers: {
                'Authorization': `Bearer ${localStorage.getItem('userToken')}`
              }
            });
            
            // Check if response is OK and is JSON
            const contentType = notificationsResponse.headers.get("content-type");
            if (!notificationsResponse.ok || !contentType || !contentType.includes("application/json")) {
              console.error('Invalid response from notifications API:', {
                status: notificationsResponse.status,
                contentType: contentType,
                response: await notificationsResponse.text()
              });
              throw new Error('Invalid response from notifications API');
            }
            
            const notificationsData = await notificationsResponse.json();
            console.log('Students with notifications:', notificationsData);
            
            if (!notificationsData.success) {
              console.error('Failed to get notifications data:', notificationsData.message);
              throw new Error(notificationsData.message || 'Failed to get notifications data');
            }
            
            if (notificationsData.success && notificationsData.students) {
              // Create a Set of student IDs who have notifications enabled
              const notificationEnabledIds = new Set(notificationsData.students.map(s => s.id));
              console.log('Students with notifications enabled IDs:', notificationEnabledIds);
              
              // Filter students who have notifications enabled
              const studentsToNotify = studentsData.students.filter(student => notificationEnabledIds.has(student.id));
              console.log('Students to notify:', studentsToNotify);
              
              console.log(`Sending notifications to ${studentsToNotify.length} students with notifications enabled`);
              
              // Send email to each student with notifications enabled
              for (const student of studentsToNotify) {
                try {
                  console.log(`Sending email to student: ${student.email}`);
                  await emailjs.send(
                    'service_w04ei59',
                    'template_1tr6zkr',
                    {
                      to_email: student.email,
                      to_name: student.name,
                      from_name: 'QuizMaster Team',
                      teacher_name: teacherName,
                      quiz_title: formattedData.title,
                      subject_name: subjectName,
                      quiz_description: formattedData.description || 'No description provided'
                    },
                    'N6vvB7wF7TnGfLNVM'
                  );
                  console.log(`Email sent successfully to ${student.email}`);
                } catch (emailError) {
                  console.error(`Failed to send email to student ${student.email}:`, emailError);
                }
              }
              console.log('All student notifications sent successfully');
            } else {
              console.error('Failed to get students with notifications:', notificationsData);
            }
          } else {
            console.error('Failed to get students:', studentsData);
          }
        } catch (notificationError) {
          console.error('Error sending notifications:', notificationError);
        }
      }
      
      // Use the notification system instead of showSuccess
      notifications.success(successMessage);
      
      this.isDirty = false;
      
      // Add a delay before redirect to ensure user sees the success message
      setTimeout(() => {
        window.location.href = "teacher-quizzes.html";
      }, 1500);

    } catch (error) {
      console.error("Error submitting quiz:", error);
      this.showError(`Failed to ${this.isEditMode ? 'update' : 'create'} quiz: ${error.message}`);
      throw error;
    }
  }

  async saveDraft() {
    try {
      const quizData = this.gatherQuizData();
      
      // IMPORTANT: Explicitly set status to draft for Save Draft button
      quizData.status = 'draft';
      console.log("%c Setting quiz status to DRAFT", "background: orange; color: black; padding: 4px; font-weight: bold;");
      
      // Basic validation for required fields
      if (!quizData.title || !quizData.subject) {
        notifications.error("Quiz title and subject are required, even for drafts");
        return;
      }
      
      console.log("Saving draft quiz data:", quizData);
      
      // Use the submitQuiz method which now preserves the status
      const result = await this.submitQuiz(quizData);
      
      // Handle successful save - already showing success message in submitQuiz
      if (result && result.success) {
        this.isDirty = false;
      }
    } catch (error) {
      console.error('Error saving draft:', error);
      notifications.error(`Failed to save draft: ${error.message || ''}`);
    }
  }

  showError(message) {
    // Use the notification system instead
    notifications.error(message);
  }

  showSuccess(message) {
    // Use the notification system instead
    notifications.success(message);
  }

  // Load subjects from API
  async loadSubjects() {
    try {
      // Clear the select element
      this.subjectSelect.innerHTML = '<option value="">Select subject</option>';
      
      // Add a loading option
      const loadingOption = document.createElement('option');
      loadingOption.textContent = 'Loading subjects...';
      loadingOption.disabled = true;
      loadingOption.selected = true;
      this.subjectSelect.appendChild(loadingOption);
      
      // Disable the select while loading
      this.subjectSelect.disabled = true;
      
      // Fetch subjects from API
      const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.COMMON.SUBJECTS}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('userToken')}`
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to load subjects: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      // Remove the loading option
      this.subjectSelect.removeChild(loadingOption);
      this.subjectSelect.disabled = false;
      
      // Check if we got a successful response with subjects
      if (data.success && Array.isArray(data.subjects)) {
        // No subjects available
        if (data.subjects.length === 0) {
          const emptyOption = document.createElement('option');
          emptyOption.textContent = 'No subjects available';
          emptyOption.disabled = true;
          this.subjectSelect.appendChild(emptyOption);
          
          this.showError('No subjects are available. Please ask an administrator to add subjects.');
          return;
        }
        
        // Add each subject to the select element
        data.subjects.forEach(subject => {
          const option = document.createElement('option');
          option.value = subject.id;
          option.textContent = subject.name;
          
          // Add color as a data attribute if available
          if (subject.color) {
            option.dataset.color = subject.color;
          }
          
          this.subjectSelect.appendChild(option);
        });
        
        // Restore saved subject if available
        if (this.savedFormData && this.savedFormData.subject) {
          console.log('Restoring saved subject:', this.savedFormData.subject);
          this.subjectSelect.value = this.savedFormData.subject;
        }
      } else {
        throw new Error(data.message || 'Failed to load subjects due to invalid response format');
      }
    } catch (error) {
      console.error('Error loading subjects:', error);
      this.showError(`Failed to load subjects: ${error.message}`);
      
      // Reset the select element
      this.subjectSelect.innerHTML = '<option value="">Select subject (failed to load)</option>';
      this.subjectSelect.disabled = false;
    }
  }

  // Create a modal for unsaved changes prompt
  createUnsavedChangesModal() {
    const modalHTML = `
      <div id="unsaved-changes-modal" class="modal" style="display: none;">
        <div class="modal-content">
          <div class="modal-header">
            <h3>Unsaved Changes</h3>
          </div>
          <div class="modal-body">
            <p>You have unsaved changes that will be lost if you leave this page.</p>
          </div>
          <div class="modal-footer">
            <button id="modal-stay-btn" class="modal-btn primary">Stay on Page</button>
            <button id="modal-leave-btn" class="modal-btn outline">Leave Anyway</button>
          </div>
        </div>
      </div>
    `;

    // Add the modal HTML to the page
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // Add styles for the modal
    const modalStyles = document.createElement('style');
    modalStyles.textContent = `
      .modal {
        position: fixed;
        z-index: 1000;
        left: 0;
        top: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .modal-content {
        background-color: #fff;
        border-radius: 8px;
        max-width: 500px;
        width: 90%;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
      }
      .modal-header {
        padding: 15px 20px;
        border-bottom: 1px solid #eee;
      }
      .modal-header h3 {
        margin: 0;
        color: #333;
      }
      .modal-body {
        padding: 20px;
      }
      .modal-footer {
        padding: 15px 20px;
        border-top: 1px solid #eee;
        display: flex;
        justify-content: flex-end;
        gap: 10px;
      }
      .modal-btn {
        padding: 8px 16px;
        border-radius: 4px;
        border: none;
        cursor: pointer;
        font-weight: 500;
      }
      .modal-btn.primary {
        background-color: #4CAF50;
        color: white;
      }
      .modal-btn.outline {
        background-color: transparent;
        border: 1px solid #ccc;
        color: #333;
      }
      .modal-btn:hover {
        opacity: 0.9;
      }
    `;
    document.head.appendChild(modalStyles);
  }

  // Setup navigation interception
  setupNavigationInterceptor() {
    // Setup refresh detection
    let isRefreshing = false;
    
    // Detect refresh action (F5 or Ctrl+R)
    document.addEventListener('keydown', (e) => {
      // F5 key or Ctrl+R
      if (e.key === 'F5' || (e.ctrlKey && e.key === 'r')) {
        isRefreshing = true;
        // If we have changes, save them to sessionStorage
        if (this.isDirty && this.hasActualChanges()) {
          this.saveFormDataForRefresh();
        }
      }
    });
    
    // Store original beforeunload event to avoid default browser dialog
    window.addEventListener("beforeunload", (e) => {
      // For refresh actions
      if (isRefreshing) {
        // We already saved the data above, so just return without preventing
        isRefreshing = false;
        return;
      }
      
      // For other navigation, like closing tab or typing a new URL
      if (this.isDirty && this.hasActualChanges()) {
        e.preventDefault();
        e.returnValue = "";
      }
    });

    // Handle all link clicks to show our custom modal
    document.addEventListener('click', (e) => {
      // Only intercept if there are unsaved changes
      if (!this.isDirty || !this.hasActualChanges()) return;

      // Find closest anchor tag
      const anchor = e.target.closest('a');
      if (!anchor) return;

      // Only intercept links to other pages (not anchors in the same page or javascript: links)
      const href = anchor.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;

      // Prevent default navigation
      e.preventDefault();

      // Show our custom modal
      this.showUnsavedChangesModal(href);
    });
    
    // Listen for the refresh button click
    window.addEventListener('click', (e) => {
      if (e.target.matches('button.refresh-button, button.refresh-button *')) {
        if (this.isDirty && this.hasActualChanges()) {
          this.saveFormDataForRefresh();
        }
      }
    });
  }

  // Check if there are actual changes in the form
  hasActualChanges() {
    const title = document.getElementById("quizTitle").value.trim();
    const description = document.getElementById("description").value.trim();
    const subject = document.getElementById("subject").value;
    
    // Check if any essential fields have content
    if (title.length > 0 || description.length > 0 || subject !== "") {
      return true;
    }
    
    // Check if there are any questions with content
    const questions = document.querySelectorAll(".question-card");
    for (const question of questions) {
      const questionText = question.querySelector(".question-text").value.trim();
      if (questionText.length > 0) {
        return true;
      }
      
      // Check options
      const options = question.querySelectorAll(".option-item input[type='text']");
      for (const option of options) {
        if (option.value.trim().length > 0 && !option.readOnly) {
          return true;
        }
      }
      
      // Check short answer
      const shortAnswer = question.querySelector(".correct-answer");
      if (shortAnswer && shortAnswer.value.trim().length > 0) {
        return true;
      }
    }
    
    // No actual changes found
    return false;
  }

  // Show the custom unsaved changes modal
  showUnsavedChangesModal(targetUrl) {
    const modal = document.getElementById('unsaved-changes-modal');
    const stayBtn = document.getElementById('modal-stay-btn');
    const leaveBtn = document.getElementById('modal-leave-btn');

    // Show the modal
    modal.style.display = 'flex';

    // Set up the button event handlers
    stayBtn.onclick = () => {
      modal.style.display = 'none';
    };

    leaveBtn.onclick = () => {
      // Allow navigation by setting dirty flag to false
      this.isDirty = false;
      window.location.href = targetUrl;
    };
  }

  // Check for data saved during refresh
  checkForRefreshData() {
    try {
      const savedData = sessionStorage.getItem('quizFormData');
      if (savedData) {
        console.log('Found saved form data from refresh');
        const formData = JSON.parse(savedData);
        
        // Restore form data
        if (formData.title) document.getElementById('quizTitle').value = formData.title;
        if (formData.description) document.getElementById('description').value = formData.description;
        
        // We'll restore subject and other fields after they've loaded
        this.savedFormData = formData;
        
        // Clear the saved data after restoring
        sessionStorage.removeItem('quizFormData');
        
        // Show a notification
        this.showSuccess('Your quiz data has been restored after refresh');
      }
    } catch (error) {
      console.error('Error restoring form data after refresh:', error);
    }
  }

  // Save form data to sessionStorage before refresh
  saveFormDataForRefresh() {
    try {
      const formData = this.gatherQuizData();
      sessionStorage.setItem('quizFormData', JSON.stringify(formData));
      console.log('Saved form data for refresh');
    } catch (error) {
      console.error('Error saving form data for refresh:', error);
    }
  }

  // Check if we're in edit mode by looking for the "edit" query parameter
  checkForEditMode() {
    const urlParams = new URLSearchParams(window.location.search)
    const editId = urlParams.get("edit")
    
    if (editId) {
      this.isEditMode = true
      this.editQuizId = editId
      console.log(`Edit mode activated for quiz ID: ${editId}`)
    }
  }
  
  // Load quiz data for editing
  async loadQuizData(quizId) {
    try {
      // Show loading state
      this.questionsList.innerHTML = `
        <div class="loading-state">
          <i class="fas fa-spinner fa-spin"></i>
          <p>Loading quiz...</p>
        </div>
      `
      
      // Get token from localStorage
      const token = localStorage.getItem("userToken")
      if (!token) {
        this.showError("Authentication required. Please log in again.")
        setTimeout(() => {
          window.location.href = "/quizmaster/frontend/login.html"
        }, 2000)
        return
      }
      
      // Fetch quiz data
      const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.QUIZ.GET}?id=${quizId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      
      if (!response.ok) {
        throw new Error(`Failed to load quiz: ${response.status} ${response.statusText}`)
      }
      
      const data = await response.json()
      
      if (!data.success) {
        throw new Error(data.error || "Failed to load quiz data")
      }
      
      const quiz = data.quiz
      
      // Populate form fields with quiz data
      document.getElementById("quizTitle").value = quiz.title || ""
      document.getElementById("description").value = quiz.description || ""
      
      // Select the correct subject
      if (quiz.subject_id) {
        this.subjectSelect.value = quiz.subject_id
      }
      
      // Set quiz settings
      if (quiz.settings) {
        document.getElementById("shuffleQuestions").checked = quiz.settings.shuffleQuestions || false;
        document.getElementById("showResults").checked = quiz.settings.showResults || false;
      }
      
      // Handle show_results_after timing
      if (quiz.show_results_after) {
        // Parse the datetime and calculate the difference from now
        const resultsDate = new Date(quiz.show_results_after);
        const now = new Date();
        const diffMs = resultsDate.getTime() - now.getTime();
        
        // Convert to appropriate unit
        const diffSeconds = Math.floor(diffMs / 1000);
        const diffMinutes = Math.floor(diffSeconds / 60);
        const diffHours = Math.floor(diffMinutes / 60);
        const diffDays = Math.floor(diffHours / 24);
        const diffWeeks = Math.floor(diffDays / 7);
        const diffMonths = Math.floor(diffDays / 30);
        
        // Set the appropriate unit and value
        if (diffMonths >= 1 && diffMonths <= 4) {
          this.resultsDelay.value = diffMonths;
          this.resultsDelayUnit.value = 'months';
        } else if (diffWeeks >= 1) {
          this.resultsDelay.value = diffWeeks;
          this.resultsDelayUnit.value = 'weeks';
        } else if (diffDays >= 1) {
          this.resultsDelay.value = diffDays;
          this.resultsDelayUnit.value = 'days';
        } else if (diffHours >= 1) {
          this.resultsDelay.value = diffHours;
          this.resultsDelayUnit.value = 'hours';
        } else if (diffMinutes >= 1) {
          this.resultsDelay.value = diffMinutes;
          this.resultsDelayUnit.value = 'minutes';
        } else {
          this.resultsDelay.value = Math.max(1, diffSeconds);
          this.resultsDelayUnit.value = 'seconds';
        }
        
        // Update visibility
        document.getElementById("showResults").checked = false;
        this.updateResultsTimingVisibility();
      }
      
      // Clear the default question
      this.questionsList.innerHTML = ""
      
      // Add each question
      if (quiz.questions && quiz.questions.length > 0) {
        quiz.questions.forEach((question, index) => {
          // Set the current question ID
          this.currentQuestionId = index + 1
          
          // Add question template
          const questionHTML = this.createQuestionTemplate(this.currentQuestionId)
          this.questionsList.insertAdjacentHTML("beforeend", questionHTML)
          
          // Get the question card
          const questionCard = this.questionsList.lastElementChild
          
          // Set question text
          questionCard.querySelector(".question-text").value = question.question_text || ""
          
          // Set question type
          const typeSelect = questionCard.querySelector(".question-type")
          typeSelect.value = question.question_type || "multiple_choice"
          
          // Set up question events
          this.setupQuestionEvents(questionCard)
          
          // Handle the question type
          this.handleQuestionTypeChange({ target: typeSelect }, this.currentQuestionId)
          
          // Clear default options
          const optionsList = questionCard.querySelector(".options-list")
          optionsList.innerHTML = ""
          
          // Add options if they exist
          if (question.answers && question.answers.length > 0) {
            question.answers.forEach((answer, answerIndex) => {
              // Create option
              const optionItem = document.createElement("div")
              optionItem.className = "option-item"
              
              // Create correct checkbox
              const checkbox = document.createElement("input")
              checkbox.type = this.getInputType(this.currentQuestionId)
              checkbox.name = `correct${this.currentQuestionId}`
              checkbox.checked = answer.is_correct
              
              // Create text input
              const textInput = document.createElement("input")
              textInput.type = "text"
              textInput.placeholder = `Option ${answerIndex + 1}`
              textInput.value = answer.answer_text || ""
              
              // Create remove button
              const removeBtn = document.createElement("button")
              removeBtn.className = "remove-option"
              removeBtn.innerHTML = '<i class="fas fa-times"></i>'
              removeBtn.addEventListener("click", () => this.removeOption(optionItem))
              
              // Add elements to option item
              optionItem.appendChild(checkbox)
              optionItem.appendChild(textInput)
              optionItem.appendChild(removeBtn)
              
              // Add option to list
              optionsList.appendChild(optionItem)
            })
          }
        })
      } else {
        // If no questions, add a default one
        this.currentQuestionId = 1
        this.addNewQuestion()
      }
      
      // Show success message
      this.showSuccess("Quiz loaded successfully. You can now edit it.")
      
      // Reset the dirty state
      this.isDirty = false
      
    } catch (error) {
      console.error("Error loading quiz:", error)
      this.showError(`Failed to load quiz: ${error.message}`)
      
      // Add a default question as fallback
      this.questionsList.innerHTML = ""
      this.currentQuestionId = 1
      this.addNewQuestion()
    }
  }

  updateResultsTimingVisibility() {
    if (this.resultsTimingContainer && this.showResultsToggle) {
      this.resultsTimingContainer.style.display = this.showResultsToggle.checked ? 'none' : 'block'
    }
  }

  validateResultsDelay() {
    if (!this.resultsDelay || !this.resultsDelayUnit) return

    const value = parseInt(this.resultsDelay.value)
    const unit = this.resultsDelayUnit.value
    
    let maxValue = 120 // Default max value
    
    switch (unit) {
      case 'seconds':
        maxValue = 3600 // 1 hour in seconds
        break
      case 'minutes':
        maxValue = 1440 // 24 hours in minutes
        break
      case 'hours':
        maxValue = 720 // 30 days in hours
        break
      case 'days':
        maxValue = 120 // ~4 months in days
        break
      case 'weeks':
        maxValue = 16 // ~4 months in weeks
        break
      case 'months':
        maxValue = 4 // 4 months maximum
        break
    }
    
    // Update max attribute and validate current value
    this.resultsDelay.max = maxValue
    if (value > maxValue) {
      this.resultsDelay.value = maxValue
    }
  }

  calculateResultsDateTime() {
    if (!this.showResultsToggle || this.showResultsToggle.checked) {
      return null; // Show results immediately
    }

    if (!this.resultsDelay || !this.resultsDelayUnit) {
      console.warn('Results delay inputs not found');
      return null;
    }

    const value = parseInt(this.resultsDelay.value);
    const unit = this.resultsDelayUnit.value;
    
    if (isNaN(value) || value <= 0) {
      console.warn('Invalid delay value:', value);
      return null;
    }

    // Get current date
    const now = new Date();
    // Get timezone offset in minutes and convert to milliseconds
    const tzOffset = now.getTimezoneOffset() * 60000;
    
    // Create a new date object by subtracting the timezone offset to get true UTC
    const futureDate = new Date(now.getTime() - tzOffset);
    
    console.log('Starting calculation with adjusted UTC time:', {
      localTime: now.toISOString(),
      timezoneOffset: now.getTimezoneOffset(),
      adjustedTime: futureDate.toISOString()
    });
    
    try {
      switch (unit) {
        case 'seconds':
          futureDate.setSeconds(futureDate.getSeconds() + value);
          break;
        case 'minutes':
          futureDate.setMinutes(futureDate.getMinutes() + value);
          break;
        case 'hours':
          futureDate.setHours(futureDate.getHours() + value);
          break;
        case 'days':
          futureDate.setDate(futureDate.getDate() + value);
          break;
        case 'weeks':
          futureDate.setDate(futureDate.getDate() + (value * 7));
          break;
        case 'months':
          futureDate.setMonth(futureDate.getMonth() + value);
          break;
        default:
          console.warn('Unknown time unit:', unit);
          return null;
      }

      console.log('Calculated future date:', {
        value,
        unit,
        result: futureDate.toISOString(),
        difference: Math.round((futureDate.getTime() - now.getTime()) / 1000) + ' seconds'
      });

      return futureDate;
    } catch (error) {
      console.error('Error calculating future date:', error);
      return null;
    }
  }
}

// Initialize when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  const creator = new QuizCreator()
})

// Dashboard manager class
class DashboardManager {
  constructor() {
    this.initLogout()
    this.initMobileMenu()
  }

  async initLogout() {
    const logoutBtn = document.querySelector(".logout-btn")
    if (logoutBtn) {
      logoutBtn.addEventListener("click", async () => {
        try {
          // Use auth module's logout method
          auth.logout(true);
        } catch (error) {
          console.error('Logout failed:', error);
        }
      })
    }
  }

  initMobileMenu() {
    const menuToggle = document.querySelector(".menu-toggle")
    const sidebar = document.querySelector(".sidebar")

    if (menuToggle && sidebar) {
      menuToggle.addEventListener("click", () => {
        sidebar.classList.toggle("active")
      })
    }
  }
}

// Initialize when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  new DashboardManager()
})