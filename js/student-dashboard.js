import notifications from './utils/notifications.js';
import auth, { fetchWithTokenRefresh } from './utils/auth.js';
import API_CONFIG from './config.js';
import roleGuard from './utils/role-guard.js';

class StudentDashboard {
    constructor() {
        this.state = {
            lastQuizCheck: null,
            isLoading: false,
            userId: null,
            statistics: null,
            weeklyRankChanges: [],
            rankChange: undefined,
            notificationShown: false
        };

        this.elements = {
            sidebar: document.querySelector('.sidebar'),
            menuToggle: document.querySelector('.menu-toggle'),
            logoutButton: document.querySelector('.logout-btn'),
            progressBars: document.querySelectorAll('.progress-bar'),
            userAvatar: document.querySelector('.user-avatar img'),
            userName: document.querySelector('.user-name'),
            levelBadge: document.querySelector('.level-badge'),
            rankChangeElement: document.querySelector('.rank-increase'),
            counters: {
                'right-quizzes': document.querySelector('.right-quizzes .counter'),
                'wrong-quizzes': document.querySelector('.wrong-quizzes .counter'),
                'total-quizzes': document.querySelector('.total-quizzes .counter'),
                'available-quizzes': document.querySelector('.available-quizzes .counter')
            }
        };

        // Set default beginner badge class immediately
        if (this.elements.levelBadge) {
            this.elements.levelBadge.className = 'level-badge beginner';
        }

        // Apply basic styling to avatar immediately
        if (this.elements.userAvatar) {
            this.elements.userAvatar.style.objectFit = 'cover';
            this.elements.userAvatar.style.transformOrigin = 'center center';
            this.elements.userAvatar.style.transform = 'scale(1) translateZ(0)';
            this.elements.userAvatar.style.willChange = 'transform';
            this.elements.userAvatar.style.imageRendering = '-webkit-optimize-contrast';
            this.elements.userAvatar.style.backfaceVisibility = 'hidden';
        }

        // Initialize rank change listener
        this.initializeRankChangeListener();

        // Initialize dark mode first
        this.initializeDarkMode();

        this.init();
    }

    async init() {
        try {
            console.log('Dashboard initialized. Notification system ready.');
            
            // Initialize elements first
            this.initializeElements();
            
            // Initialize authentication with no redirect
            const authResult = await auth.initializeAuth(false);
            console.log('Dashboard - Auth initialization result:', authResult);
            
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
            console.log('Student Dashboard - Role check result:', roleCheck);
            
            if (!roleCheck) {
                console.log('Role check failed, redirecting to login');
                window.location.replace('/quizmaster/frontend/login.html');
                return;
            }

            // Store session data with longer expiry
            this.storeSessionData();
            
            // Set up periodic token refresh
            this.setupTokenRefresh();
            
            // Load dashboard data
            await this.loadData();

            // Set up periodic quiz checks if notifications are enabled
            this.setupQuizChecks();
        } catch (error) {
            console.error('Dashboard initialization error:', error);
            notifications.error('Failed to initialize dashboard. Please refresh the page.');
        }
    }

    storeSessionData() {
        try {
            const token = auth.getToken();
            if (token) {
                // Store session data with 24 hour expiry
                const sessionData = {
                    active: true,
                    lastActivity: Date.now(),
                    expiresAt: Date.now() + (24 * 60 * 60 * 1000), // 24 hours
                    token: token // Store token in session for validation
                };
                sessionStorage.setItem('dashboardSession', JSON.stringify(sessionData));
                
                // Also ensure localStorage has the token
                localStorage.setItem('userToken', token);
            }
        } catch (error) {
            console.error('Error storing session data:', error);
        }
    }

    setupTokenRefresh() {
        // Clear any existing refresh intervals
        if (this._refreshInterval) {
            clearInterval(this._refreshInterval);
        }

        // Refresh token every 30 minutes
        this._refreshInterval = setInterval(async () => {
            try {
                const token = auth.getToken();
                if (token) {
                    await auth.refreshToken();
                    this.storeSessionData(); // Update session data after refresh
                }
            } catch (error) {
                console.error('Token refresh error:', error);
            }
        }, 30 * 60 * 1000); // 30 minutes

        // Also refresh token on visibility change
        document.addEventListener('visibilitychange', async () => {
            if (document.visibilityState === 'visible') {
                try {
                    const token = auth.getToken();
                    if (token) {
                        await auth.refreshToken();
                        this.storeSessionData();
                    }
                } catch (error) {
                    console.error('Token refresh error on visibility change:', error);
                }
            }
        });
    }

    async checkRole() {
        console.log('Dashboard - Starting authentication check');
        try {
            // Get session data
            const sessionDataStr = sessionStorage.getItem('dashboardSession');
            if (sessionDataStr) {
                try {
                    const sessionData = JSON.parse(sessionDataStr);
                    const now = Date.now();
                    
                    // If session is still valid (within 24 hours) and token matches
                    if (sessionData.active && 
                        sessionData.expiresAt > now && 
                        sessionData.token === auth.getToken()) {
                        console.log('Using existing dashboard session');
                        // Update last activity
                        sessionData.lastActivity = now;
                        sessionStorage.setItem('dashboardSession', JSON.stringify(sessionData));
                        return true;
                    }
                } catch (e) {
                    console.error('Error parsing session data:', e);
                }
            }
            
            // Do full role check if session invalid or expired
            const hasAccess = await roleGuard.checkAccess('student');
            if (hasAccess) {
                this.storeSessionData();
            }
            return hasAccess;
        } catch (error) {
            console.error('Role check error:', error);
            return false;
        }
    }

    async initializeAuth() {
        try {
            // First try to refresh the token
            await auth.refreshToken();
            
            // Then initialize auth
            const result = await auth.initializeAuth(false);
            if (result) {
                this.storeSessionData();
            }
            return result;
        } catch (error) {
            console.error('Auth initialization error:', error);
            return false;
        }
    }

    // Add event listener for page visibility changes
    setupVisibilityCheck() {
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                // Update last activity when page becomes visible
                sessionStorage.setItem('lastActivity', Date.now().toString());
            }
        });
    }

    async loadData() {
        try {
            await this.loadUserData();
            await this.loadStatistics();
            await this.checkForNewQuizzes();
        } catch (error) {
            console.error('Error loading dashboard data:', error);
            notifications.error('Failed to load dashboard data. Please try refreshing the page.');
        }
    }

    async loadUserData() {
        try {
            // First try to get from localStorage
            const cachedData = localStorage.getItem('userData');
            if (cachedData) {
                const userData = JSON.parse(cachedData);
                console.log('Dashboard - Found user data in localStorage:', userData);
                this.updateUserProfile(userData);
            }

            // Always fetch fresh data
            console.log('Dashboard - Fetching fresh user data from /student/profile.php');
            const response = await fetchWithTokenRefresh(API_CONFIG.ENDPOINTS.STUDENT.PROFILE, {
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            const data = await response.json();
            
            if (data.success && data.profile) {
                console.log('Dashboard - Successfully fetched user data:', data.profile);
                // Update localStorage with new data
                localStorage.setItem('userData', JSON.stringify(data.profile));
                // Update UI with new data
                this.updateUserProfile(data.profile);
                return data.profile;
            } else {
                throw new Error('Invalid response format');
            }
        } catch (error) {
            console.error('Dashboard - Error loading user data:', error);
            notifications.error('Failed to load user profile. Please try refreshing the page.');
            return null;
        }
    }

    async loadStatistics() {
        try {
            await this.fetchStatistics();
        } catch (error) {
            console.error('Error loading statistics:', error);
            notifications.error('Failed to load statistics. Please try refreshing the page.');
        }
    }

    async fetchStatistics(forceUpdate = false) {
        try {
            // Get token directly instead of using isLoggedIn
            const token = auth.getToken();
            if (!token) {
                throw new Error('Authentication token missing');
            }
            
            // Check URL parameters for quiz completion
            const params = new URLSearchParams(window.location.search);
            const fromQuiz = params.get('from_quiz');
            const quizCompleted = params.get('quiz_completed');
            
            // Force update if coming from a completed quiz or if forceUpdate flag is true
            const shouldForceUpdate = forceUpdate || fromQuiz === 'true' || quizCompleted === 'true';
            
            // If forceUpdate is true, call update-statistics.php first
            if (shouldForceUpdate) {
                console.log('Forcing statistics update before fetch');
                try {
                    const userId = auth.getUserId();
                    const updateResponse = await fetch(`/quizmaster/backend/student/update-statistics.php`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`,
                            'Cache-Control': 'no-store, no-cache, must-revalidate'
                        },
                        body: JSON.stringify({
                            userId: userId,
                            forceUpdate: true,
                            fullRecalculate: true
                        }),
                        cache: 'no-store'
                    });
                    
                    if (updateResponse.ok) {
                        console.log('Statistics updated successfully before fetch');
                        // Get the updated statistics directly from the response
                        const updateData = await updateResponse.json();
                        if (updateData.success && updateData.statistics) {
                            console.log('Using statistics directly from update response');
                            this.updateStatistics(updateData.statistics);
                            return;
                        }
                    }
                } catch (updateError) {
                    console.warn('Error forcing statistics update:', updateError);
                }
            }

            // Also fetch current rank from leaderboard
            try {
                const rankResponse = await fetchWithTokenRefresh('student/statistics.php');
                const rankData = await rankResponse.json();
                if (rankData.success && rankData.statistics) {
                    const currentRank = rankData.statistics.rank;
                    // Get previous rank from localStorage
                    const storedRankData = localStorage.getItem('previousRank');
                    let previousRank = currentRank; // Default to current rank if no previous rank exists
                    
                    if (storedRankData) {
                        try {
                            const { rank, timestamp } = JSON.parse(storedRankData);
                            // Only use stored rank if it's less than 24 hours old
                            if (Date.now() - timestamp < 24 * 60 * 60 * 1000) {
                                previousRank = rank;
                            }
                        } catch (e) {
                            console.error('Error parsing stored rank:', e);
                        }
                    }
                    
                    // Calculate rank change
                    // A higher rank number means worse position, so:
                    // - Going from rank 4 to rank 1 means +3 (improved by 3 positions)
                    // - Going from rank 1 to rank 4 means -3 (got worse by 3 positions)
                    const rankIncrease = -(currentRank - previousRank);
                    
                    // Store the rank change in state
                    this.state.rankChange = rankIncrease;
                    
                    // Store current rank for next comparison
                    localStorage.setItem('previousRank', JSON.stringify({
                        rank: currentRank,
                        timestamp: Date.now()
                    }));
                    
                    console.log('Rank change calculated:', {
                        currentRank,
                        previousRank,
                        rankIncrease,
                        explanation: `Rank ${rankIncrease < 0 ? 'decreased' : 'improved'} by ${Math.abs(rankIncrease)} positions`
                    });
                }
            } catch (rankError) {
                console.warn('Error fetching rank data:', rankError);
            }
            
            // Show loading state on stat cards
            document.querySelectorAll('.stat-card').forEach(card => {
                card.setAttribute('data-loading', 'true');
            });

            // Add a timestamp to prevent caching
            const timestamp = new Date().getTime();
            
            try {
                // Try to fetch from statistics.php first
                const statisticsEndpoint = API_CONFIG.ENDPOINTS.STUDENT.STATS;
                console.log(`Trying to fetch student statistics from endpoint: ${statisticsEndpoint}`);
                
                const apiUrl = statisticsEndpoint + `?t=${timestamp}&nocache=true`;
                
                const response = await fetchWithTokenRefresh(apiUrl, {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
                        'Pragma': 'no-cache'
                    }
                });
                
                const data = await response.json();
                
                if (data && data.success) {
                    const stats = data.statistics;
                    console.log('Statistics received:', stats);
                    
                    // If available_quizzes is 0 or not present, fetch them separately
                    if (!stats.available_quizzes) {
                        try {
                            console.log('Fetching available quizzes separately...');
                            const quizzesResponse = await fetchWithTokenRefresh('student/available-quizzes.php', {
                                method: 'GET',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'Cache-Control': 'no-store, no-cache, must-revalidate'
                                }
                            });
                            
                            if (!quizzesResponse.ok) {
                                throw new Error(`HTTP error! status: ${quizzesResponse.status}`);
                            }
                            
                            const responseText = await quizzesResponse.text();
                            console.log('Available quizzes response:', responseText);
                            
                            const quizzesData = JSON.parse(responseText);
                            if (quizzesData.success && quizzesData.data) {
                                stats.available_quizzes = quizzesData.data.total || 0;
                                // Store quizzes data for later use
                                localStorage.setItem('availableQuizzes', JSON.stringify(quizzesData.data.quizzes));
                                console.log('Updated available quizzes count:', stats.available_quizzes);
                                
                                // Update UI immediately
                                const availableQuizzesCounter = document.querySelector('[data-counter="available-quizzes"]');
                                if (availableQuizzesCounter) {
                                    availableQuizzesCounter.textContent = stats.available_quizzes;
                                    availableQuizzesCounter.setAttribute('data-target', stats.available_quizzes);
                                    
                                    // Update progress bar
                                    const progressBar = availableQuizzesCounter.closest('.stat-card')?.querySelector('.progress-bar');
                                    if (progressBar) {
                                        progressBar.style.width = stats.available_quizzes > 0 ? '100%' : '0%';
                                        progressBar.setAttribute('aria-valuenow', stats.available_quizzes > 0 ? 100 : 0);
                                    }
                                }
                            } else {
                                console.warn('Failed to get available quizzes:', quizzesData.message);
                            }
                        } catch (error) {
                            console.error('Error fetching available quizzes:', error);
                            if (error instanceof SyntaxError) {
                                console.log('Raw response:', responseText);
                            }
                            // Don't throw here, just log the error and continue with other stats
                        }
                    }
                    
                    this.updateStatistics(stats);
                    return;
                } else {
                    console.warn('Failed to fetch from statistics.php. Falling back to dashboard.php');
                }
            } catch (statsError) {
                console.warn('Error fetching from statistics.php:', statsError);
                console.log('Falling back to dashboard.php endpoint');
            }

            // Fallback to dashboard.php if statistics.php fails
            try {
                const dashboardEndpoint = API_CONFIG.ENDPOINTS.STUDENT.DASHBOARD;
                console.log(`Falling back to fetch statistics from dashboard endpoint: ${dashboardEndpoint}`);
                
                const timestamp = new Date().getTime();
                const apiUrl = dashboardEndpoint + `?t=${timestamp}`;
                
                const response = await fetchWithTokenRefresh(apiUrl, {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });
                
                const data = await response.json();
                
                if (data && data.success && data.data && data.data.statistics) {
                    const stats = data.data.statistics;
                    console.log('Dashboard statistics received:', stats);
                    
                    // If available_quizzes is 0 or not present, fetch them separately
                    if (!stats.available_quizzes) {
                        try {
                            const quizzesResponse = await fetchWithTokenRefresh('student/available-quizzes.php', {
                                method: 'GET',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'Cache-Control': 'no-store, no-cache, must-revalidate'
                                }
                            });
                            
                            const responseText = await quizzesResponse.text();
                            console.log('Available quizzes response:', responseText);
                            
                            try {
                                const quizzesData = JSON.parse(responseText);
                                if (quizzesData.success && quizzesData.data) {
                                    stats.available_quizzes = quizzesData.data.total || 0;
                                    localStorage.setItem('availableQuizzes', JSON.stringify(quizzesData.data.quizzes));
                                    console.log('Updated available quizzes count:', stats.available_quizzes);
                                }
                            } catch (parseError) {
                                console.error('Error parsing available quizzes response:', parseError);
                                console.log('Raw response:', responseText);
                            }
                        } catch (quizzesError) {
                            console.warn('Error fetching available quizzes:', quizzesError);
                        }
                    }
                    
                    this.updateStatistics(stats);
                } else {
                    throw new Error(data?.message || 'Failed to fetch statistics');
                }
            } catch (dashboardError) {
                console.error('Dashboard API error:', dashboardError);
                throw dashboardError;
            }
        } catch (error) {
            console.error('Error fetching statistics:', error);
            notifications.error('Failed to load statistics: ' + error.message);
            
            // Provide default values even in case of error to avoid NaN
            const defaultStats = {
                correct: 0,
                wrong: 0, 
                total: 0,
                available: 0,
                streak: 0,
                success_rate: 0,
                best_subject: 'Not Available',
                rank_increase: 0
            };
            this.updateStatistics(defaultStats);
        } finally {
            // Hide loading state on stat cards
            document.querySelectorAll('.stat-card').forEach(card => {
                card.setAttribute('data-loading', 'false');
            });
        }
    }

    updateStatistics(stats) {
        console.log('Updating statistics with data:', stats);
        
        // Ensure stats object has all required properties with default values
        stats = Object.assign({
            quizzes_taken: 0,
            quizzes_completed: 0,
            correct_answers: 0,
            total_answers: 0,
            wrong_answers: 0,
            success_rate: 0,
            completion_rate: 0,
            current_streak: 0,
            rank_increase: 0,
            available_quizzes: 0,
            best_subject: 'Not Available'
        }, stats || {});

        console.log('Processed statistics:', stats);

        // Update badge based on correct answers
        if (this.elements.levelBadge) {
            const badgeInfo = this.getBadgeInfo(stats.correct_answers);
            this.elements.levelBadge.className = `level-badge ${badgeInfo.class}`;
            this.elements.levelBadge.textContent = badgeInfo.label;
        }

        // Map the statistics to the counter elements in the HTML
        const counters = {
            'right-quizzes': stats.correct_answers || 0,
            'wrong-quizzes': stats.wrong_answers || 0,
            'total-quizzes': stats.quizzes_taken || 0,
            'available-quizzes': stats.available_quizzes || 0,
            'streak': stats.current_streak || 0,
            'rank-increase': this.state.rankChange || 0 // Use our calculated rank change instead of stats
        };

        // Update each counter element
        Object.entries(counters).forEach(([id, value]) => {
            const element = document.querySelector(`[data-counter="${id}"]`);
            if (element) {
                console.log(`Updating counter ${id} with value:`, value);
                // Special handling for rank increase to show + sign for positive values
                if (id === 'rank-increase') {
                    if (value > 0) {
                        element.textContent = `+${value}`;
                        element.classList.add('positive');
                        element.classList.remove('negative');
                    } else if (value < 0) {
                        element.textContent = `${value}`; // The minus sign is already included in the value
                        element.classList.add('negative');
                        element.classList.remove('positive');
                    } else {
                        element.textContent = '0';
                        element.classList.remove('positive', 'negative');
                    }
                } else {
                    element.textContent = value;
                }
                element.setAttribute('data-target', value);

                // Update progress bar if it exists
                const card = element.closest('.stat-card');
                if (card) {
                    const progressBar = card.querySelector('.progress-bar');
                    if (progressBar) {
                        let percentage = 0;
                        if (id === 'right-quizzes' && stats.total_answers > 0) {
                            percentage = (stats.correct_answers / stats.total_answers) * 100;
                        } else if (id === 'wrong-quizzes' && stats.total_answers > 0) {
                            percentage = (stats.wrong_answers / stats.total_answers) * 100;
                        } else if (id === 'total-quizzes' && stats.quizzes_taken > 0) {
                            percentage = (stats.quizzes_completed / stats.quizzes_taken) * 100;
                        } else if (id === 'available-quizzes' && stats.available_quizzes > 0) {
                            percentage = 100;
                        }
                        progressBar.style.width = `${percentage}%`;
                        progressBar.setAttribute('aria-valuenow', percentage);
                        progressBar.setAttribute('data-width', `${percentage}%`);
                    }
                }
            }
        });

        // Update best subject
        const bestSubjectElement = document.querySelector('.best-subject');
        if (bestSubjectElement) {
            bestSubjectElement.textContent = stats.best_subject || 'Not Available';
        }

        // Update success rate
        const successRateElement = document.querySelector('.success-rate');
        if (successRateElement) {
            successRateElement.textContent = `${Math.round(stats.success_rate)}%`;
        }

        // Update streak with badge
        const streakElement = document.querySelector('.current-streak');
        if (streakElement) {
            streakElement.textContent = stats.current_streak || 0;
            
            // Update streak badge if it exists
            const streakBadge = document.querySelector('.streak-badge');
            if (streakBadge) {
                if (stats.current_streak >= 30) {
                    streakBadge.className = 'streak-badge diamond';
                    streakBadge.title = 'Diamond Streak (30+ days)';
                } else if (stats.current_streak >= 20) {
                    streakBadge.className = 'streak-badge platinum';
                    streakBadge.title = 'Platinum Streak (20+ days)';
                } else if (stats.current_streak >= 10) {
                    streakBadge.className = 'streak-badge gold';
                    streakBadge.title = 'Gold Streak (10+ days)';
                } else if (stats.current_streak >= 5) {
                    streakBadge.className = 'streak-badge silver';
                    streakBadge.title = 'Silver Streak (5+ days)';
                } else {
                    streakBadge.className = 'streak-badge bronze';
                    streakBadge.title = 'Bronze Streak';
                }
            }
        }

        // Update rank increase with arrow indicator
        const rankIncreaseElement = document.querySelector('.rank-increase');
        if (rankIncreaseElement) {
            // Use the calculated rank change from state instead of stats
            const increase = this.state.rankChange || 0;
            if (increase > 0) {
                rankIncreaseElement.innerHTML = `
                    <span class="rank-change up">
                        <i class="fas fa-arrow-up"></i>
                        <span>+${increase} this week</span>
                    </span>
                `;
                rankIncreaseElement.classList.add('positive');
                rankIncreaseElement.classList.remove('negative');
            } else if (increase < 0) {
                rankIncreaseElement.innerHTML = `
                    <span class="rank-change down">
                        <i class="fas fa-arrow-down"></i>
                        <span>${increase} this week</span>
                    </span>
                `;
                rankIncreaseElement.classList.add('negative');
                rankIncreaseElement.classList.remove('positive');
            } else {
                rankIncreaseElement.innerHTML = `
                    <span class="rank-change">
                        <i class="fas fa-minus"></i>
                        <span>No change this week</span>
                    </span>
                `;
                rankIncreaseElement.classList.remove('positive', 'negative');
            }
        }

        // Update donut chart if it exists
        const donutSegment = document.querySelector('.donut-segment');
        if (donutSegment) {
            this.initializeDonutChart(stats.success_rate || 0);
        }

        // Add js-loaded class to show content with transitions
        document.body.classList.add('js-loaded');
    }

    updateStatisticsSummary(stats) {
        const summaryElement = document.getElementById('statistics-summary');
        if (summaryElement) {
            const completionRate = stats.quizzes_taken > 0 
                ? Math.round((stats.quizzes_completed / stats.quizzes_taken) * 100) 
                : 0;
            
            const successRate = stats.total_answers > 0 
                ? Math.round((stats.correct_answers / stats.total_answers) * 100)
                : 0;

            summaryElement.innerHTML = `
                <div class="summary-item">
                    <span class="label">Quiz Completion</span>
                    <span class="value">${stats.quizzes_completed} / ${stats.quizzes_taken}</span>
                    <div class="progress">
                        <div class="progress-bar" style="width: ${completionRate}%">
                            ${completionRate}%
                        </div>
                    </div>
                </div>
                <div class="summary-item">
                    <span class="label">Answer Accuracy</span>
                    <span class="value">${stats.correct_answers} / ${stats.total_answers}</span>
                    <div class="progress">
                        <div class="progress-bar" style="width: ${successRate}%">
                            ${successRate}%
                        </div>
                    </div>
                </div>
                <div class="summary-item">
                    <span class="label">Current Streak</span>
                    <span class="value">${stats.current_streak} days</span>
                </div>
                <div class="summary-item">
                    <span class="label">Best Subject</span>
                    <span class="value">${stats.best_subject || 'Not Available'}</span>
                </div>
            `;
        }
    }

    setupQuizChecks() {
        // Check if notifications are enabled
        const notificationsEnabled = localStorage.getItem("quizNotifications") !== "false";
        console.log('Quiz notifications enabled:', notificationsEnabled);
        
        if (notificationsEnabled) {
            console.log('Setting up periodic quiz checks (every 5 minutes)');
            // Reset the notification shown state when setting up checks
            this.state.notificationShown = false;
            // Initial check
            this.checkForNewQuizzes();
            // Check for new quizzes every 5 minutes
            setInterval(() => {
                // Reset notification shown state before each check
                this.state.notificationShown = false;
                this.checkForNewQuizzes();
            }, 5 * 60 * 1000);
        } else {
            console.log('Quiz notifications are disabled in settings');
        }
    }

    async checkForNewQuizzes() {
        try {
            console.log('Starting quiz check...');
            
            // Skip if notifications are disabled
            if (localStorage.getItem("quizNotifications") === "false") {
                console.log('Quiz notifications are disabled');
                return;
            }

            const lastCheckTimestamp = localStorage.getItem('lastQuizCheckTimestamp');
            const now = new Date().getTime();
            
            console.log('Last check timestamp:', lastCheckTimestamp ? new Date(parseInt(lastCheckTimestamp)).toLocaleString() : 'Never');
            
            // Only check for new quizzes if we haven't checked in the last 5 minutes
            if (lastCheckTimestamp && (now - parseInt(lastCheckTimestamp)) < 300000) {
                console.log('Skipping new quiz check - last check was less than 5 minutes ago');
                return;
            }
            
            console.log('Checking for new quizzes...');
            
            // Get statistics to check available quizzes
            const response = await fetchWithTokenRefresh('student/statistics.php', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
                    'Pragma': 'no-cache'
                }
            });
            
            const data = await response.json();
            console.log('Statistics response:', data);
            
            if (data && data.success && data.statistics) {
                const currentCount = data.statistics.available_quizzes || 0;
                const previousCount = parseInt(localStorage.getItem('quizAvailableCount') || '0');
                
                console.log('Quiz counts:', {
                    previous: previousCount,
                    current: currentCount,
                    difference: currentCount - previousCount,
                    notificationShown: this.state.notificationShown
                });
                
                // Update the stored count and timestamp
                localStorage.setItem('quizAvailableCount', currentCount.toString());
                localStorage.setItem('lastQuizCheckTimestamp', now.toString());
                
                // Update the available quizzes counter in the UI if it exists
                if (this.elements.counters['available-quizzes']) {
                    this.elements.counters['available-quizzes'].textContent = currentCount;
                    console.log('Updated available quizzes counter in UI to:', currentCount);
                }
                
                // Show notification if:
                // 1. There are new quizzes compared to previous count
                // 2. This is the first check and there are available quizzes
                // 3. Notification hasn't been shown yet in this session
                if (!this.state.notificationShown && 
                    ((previousCount > 0 && currentCount > previousCount) || 
                     (previousCount === 0 && currentCount > 0))) {
                    const newQuizCount = previousCount === 0 ? currentCount : currentCount - previousCount;
                    console.log(`Detected ${newQuizCount} quiz(es). Showing notification...`);
                    this.showNewQuizzesNotification(newQuizCount);
                } else {
                    console.log('No new quizzes detected or notification already shown');
                }
            } else {
                console.error('Failed to get statistics data:', data);
            }
        } catch (error) {
            console.error('Error checking for new quizzes:', error);
            // Don't show error to user - this is a background check
        }
    }

    showNewQuizzesNotification(count) {
        console.log('Preparing to show notification for', count, 'new quiz(es)');
        
        // Mark that we've shown the notification
        this.state.notificationShown = true;
        
        // Show notification
        const message = count === 1 
            ? 'You have 1 new quiz available!' 
            : `You have ${count} new quizzes available!`;
        
        console.log('Displaying notification with message:', message);
        
        try {
            const notification = notifications.info(message, 8000);
            console.log('Notification displayed successfully:', notification);
            
            // Add click handler to notification to redirect to quizzes page
            const notificationElement = document.querySelector('.notification');
            if (notificationElement) {
                notificationElement.style.cursor = 'pointer';
                notificationElement.addEventListener('click', () => {
                    window.location.href = 'student-quizzes.html';
                });
            }
        } catch (error) {
            console.error('Error displaying notification:', error);
            // Fallback to success notification if info doesn't work
            try {
                const notification = notifications.success(message, 8000);
                console.log('Fallback notification displayed successfully:', notification);
            } catch (fallbackError) {
                console.error('Both notification attempts failed:', fallbackError);
            }
        }
    }

    showNotification(message, type) {
        // Map the type to our notification utility types
        const notificationType = type === 'success' ? 'success' : 
                                type === 'error' ? 'error' :
                                type === 'warning' ? 'warning' : 'info';
        
        // Use our notification utility
        notifications[notificationType](message);
    }

    initializeElements() {
        // Mobile menu toggle
        this.elements.menuToggle?.addEventListener('click', () => {
            this.elements.sidebar.classList.toggle('active');
        });

        // Close sidebar when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.sidebar') && !e.target.closest('.menu-toggle')) {
                this.elements.sidebar.classList.remove('active');
            }
        });

        // Add logout handler
        if (this.elements.logoutButton) {
            this.elements.logoutButton.addEventListener('click', () => this.handleLogout());
        }
    }

    async handleLogout() {
        try {
            // Use auth module's logout method
            auth.logout(true);
        } catch (error) {
            console.error('Logout failed:', error);
        }
    }

    startCounters() {
        const counters = document.querySelectorAll('.counter');
        
        counters.forEach(counter => {
            const target = parseInt(counter.getAttribute('data-target') || '0');
            const duration = 2000; // 2 seconds
            const frameDuration = 1000/60; // 60fps
            const totalFrames = Math.round(duration / frameDuration);
            const increment = target / totalFrames;
            
            let currentCount = 0;
            let frame = 0;
            
            const animate = () => {
                currentCount += increment;
                frame++;
                
                // Apply easing using cubic-bezier
                const progress = frame / totalFrames;
                const easedProgress = this.easeOutCubic(progress);
                const easedCount = Math.min(Math.floor(target * easedProgress), target);
                
                counter.textContent = easedCount;
                
                if (frame < totalFrames) {
                    requestAnimationFrame(animate);
                } else {
                    counter.textContent = target;
                }
            };
            
            animate();
        });

        // Animate progress bars
        this.elements.progressBars.forEach(bar => {
            const width = bar.getAttribute('data-width') || '0%';
            setTimeout(() => {
                bar.style.width = width;
            }, 200);
        });
    }

    // Easing function for smoother animations
    easeOutCubic(x) {
        return 1 - Math.pow(1 - x, 3);
    }

    initializeDonutChart(percentage) {
        const donutSegment = document.querySelector('.donut-segment');
        const donutNumber = document.querySelector('.donut-number');
        
        if (!donutSegment || !donutNumber) return;

        const circumference = 2 * Math.PI * 80; // r=80 from SVG
        
        let currentPercent = 0;
        const animate = () => {
            if (currentPercent < percentage) {
                currentPercent++;
                donutNumber.textContent = `${currentPercent}%`;
                
                const offset = circumference - (currentPercent / 100) * circumference;
                donutSegment.style.strokeDasharray = `${circumference} ${circumference}`;
                donutSegment.style.strokeDashoffset = offset;
                
                requestAnimationFrame(animate);
            }
        };
        
        animate();
    }

    updateUserProfile(userData) {
        // Update user name
        if (this.elements.userName && userData.name) {
            this.elements.userName.textContent = userData.name;
        }
        
        // Apply profile image positioning from user data
        if (this.elements.userAvatar && userData) {
            this.applyProfileImagePositioning(this.elements.userAvatar, userData, 'Dashboard');
        }
        
        // Update badge based on correct quizzes count
        if (this.elements.levelBadge) {
            const correctQuizzes = userData.correct_quizzes || 0;
            const badgeInfo = this.getBadgeInfo(correctQuizzes);
            
            // Set badge class and label
            this.elements.levelBadge.className = `level-badge ${badgeInfo.class}`;
            this.elements.levelBadge.textContent = badgeInfo.label;
        }
        
        // Update all profile pictures across the site
        if (userData.avatar !== undefined) {
            const avatarPath = userData.avatar || 'images/profile-placeholder.svg';
            this.updateAllProfilePictures(avatarPath);
        }
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

    // New method to update all profile pictures
    updateAllProfilePictures(avatarPath) {
        if (!avatarPath) return;
        
        console.log('Dashboard - Updating all profile pictures with:', avatarPath);
        
        // Process the avatar path
        const processedPath = this.processAvatarPath(avatarPath);
        
        // Log the original and processed paths for debugging
        console.log('Dashboard - Original avatar path:', avatarPath);
        console.log('Dashboard - Processed avatar path:', processedPath);
        
        // Add timestamp to prevent caching
        const timestamp = new Date().getTime();
        const newSrc = processedPath + '?t=' + timestamp;
        
        // Function to update an image safely
        const updateImage = (img, src) => {
            if (!img) return;
            
            // Create a new image object to preload
            const tempImg = new Image();
            tempImg.onload = () => {
                // Only update the src when image is loaded
                img.src = src;
                console.log('Dashboard - Updated image with src:', src);
            };
            tempImg.onerror = () => {
                console.error('Dashboard - Failed to load image:', src);
                // Fall back to default if available
                if (src !== 'images/profile-placeholder.svg') {
                    img.src = '/quizmaster/frontend/images/profile-placeholder.svg';
                }
            };
            tempImg.src = src;
        };
        
        // Update the main dashboard avatar
        if (this.elements.userAvatar) {
            updateImage(this.elements.userAvatar, newSrc);
        }
        
        // Update sidebar avatars
        const sidebarAvatar = document.querySelector('.sidebar .profile-pic img');
        if (sidebarAvatar) {
            updateImage(sidebarAvatar, newSrc);
        }
        
        // Update header avatars
        const headerAvatar = document.querySelector('.header .profile-pic img');
        if (headerAvatar) {
            updateImage(headerAvatar, newSrc);
        }
        
        // Update any other user avatars
        document.querySelectorAll('.user-avatar img').forEach(img => {
            updateImage(img, newSrc);
        });
        
        // Update any avatar in the leaderboard
        document.querySelectorAll('.leaderboard-item img').forEach(img => {
            // Only update if this is the current user's avatar
            const listItem = img.closest('.leaderboard-item');
            const isCurrentUser = listItem && listItem.classList.contains('current-user');
            
            if (isCurrentUser) {
                updateImage(img, newSrc);
            }
        });
    }

    // Helper function for applying image positioning
    applyProfileImagePositioning(imgElement, userData, logPrefix = '') {
        if (!imgElement || !userData) return;
        
        // First set the image source if it exists
        const avatarPath = userData.avatar || 'images/profile-placeholder.svg';
        const timestamp = new Date().getTime();
        imgElement.src = this.processAvatarPath(avatarPath) + `?t=${timestamp}`;
        console.log(`${logPrefix} - Set avatar src:`, imgElement.src);
        
        // Apply position and scale if available
        const posX = Number(userData.image_position_x || 0);
        const posY = Number(userData.image_position_y || 0);
        const scale = Math.max(0.1, Number(userData.image_scale || 1));
        
        // Make sure to set object-fit first for proper positioning
        imgElement.style.objectFit = 'cover';
        imgElement.style.objectPosition = `${posX}px ${posY}px`;
        imgElement.style.transform = `scale(${scale}) translateZ(0)`;
        imgElement.style.transformOrigin = 'center center';
        imgElement.style.willChange = 'transform';
        imgElement.style.imageRendering = '-webkit-optimize-contrast';
        imgElement.style.backfaceVisibility = 'hidden';
        
        console.log(`${logPrefix} - Applied image positioning: x=${posX}, y=${posY}, scale=${scale}`);
    }

    // Helper function to process avatar paths - use absolute path
    processAvatarPath(originalPath) {
        try {
            // Use default placeholder if path is missing or is 'default.png'
            if (!originalPath || originalPath === 'default.png') {
                return '/quizmaster/frontend/images/profile-placeholder.svg';
            }
            
            // If it's the default placeholder image, return with full path
            if (originalPath.includes('profile-placeholder.svg')) {
                return '/quizmaster/frontend/images/profile-placeholder.svg';
            }

            // If it's already an absolute URL, return as is
            if (originalPath.startsWith('http://') || originalPath.startsWith('https://')) {
                return originalPath;
            }

            // Handle backend paths
            if (originalPath.startsWith('backend/')) {
                return '/quizmaster/' + originalPath;
            }

            // Handle uploads paths directly
            if (originalPath.startsWith('uploads/')) {
                return '/quizmaster/backend/' + originalPath;
            }

            // Handle absolute paths
            if (originalPath.startsWith('/')) {
                if (!originalPath.startsWith('/quizmaster/')) {
                    return '/quizmaster' + originalPath;
                }
                return originalPath;
            }

            // Handle frontend paths
            if (originalPath.startsWith('frontend/')) {
                return '/quizmaster/' + originalPath;
            }

            // Default case - assume it's in backend/uploads/profile_pictures
            return '/quizmaster/backend/uploads/profile_pictures/' + originalPath;
            
        } catch (e) {
            console.error('Error processing avatar path:', e);
            return '/quizmaster/frontend/images/profile-placeholder.svg';
        }
    }

    initializeRankChangeListener() {
        // Listen for rank change events from the leaderboard
        window.addEventListener('rankChange', (event) => {
            const { currentRank, previousRank } = event.detail;
            
            // Calculate rank change (negative means went down in rank, positive means went up)
            const rankIncrease = -(currentRank - previousRank);
            
            // Store the rank change in state
            this.state.rankChange = rankIncrease;
            
            // Update the UI
            this.updateRankChangeDisplay();
            
            // Update the counter
            const rankIncreaseElement = document.querySelector('[data-counter="rank-increase"]');
            if (rankIncreaseElement) {
                if (rankIncrease > 0) {
                    rankIncreaseElement.textContent = `+${rankIncrease}`;
                    rankIncreaseElement.classList.add('positive');
                    rankIncreaseElement.classList.remove('negative');
                } else if (rankIncrease < 0) {
                    rankIncreaseElement.textContent = rankIncrease;
                    rankIncreaseElement.classList.add('negative');
                    rankIncreaseElement.classList.remove('positive');
                } else {
                    rankIncreaseElement.textContent = '0';
                    rankIncreaseElement.classList.remove('positive', 'negative');
                }
            }
            
            console.log('Rank change event received:', {
                currentRank,
                previousRank,
                rankIncrease,
                explanation: `Rank ${rankIncrease < 0 ? 'decreased' : 'improved'} by ${Math.abs(rankIncrease)} positions`
            });
        });
    }

    updateRankChangeDisplay() {
        if (!this.elements.rankChangeElement) return;
        
        const increase = this.state.rankChange || 0;
        
        // Update the UI
        if (increase !== 0) {
            const isPositive = increase > 0;
            const absChange = Math.abs(increase);
            
            this.elements.rankChangeElement.innerHTML = `
                <span class="rank-change ${isPositive ? 'up' : 'down'}">
                    <i class="fas fa-arrow-${isPositive ? 'up' : 'down'}"></i>
                    <span>${isPositive ? '+' : ''}${absChange} this week</span>
                </span>
            `;
            
            if (isPositive) {
                this.elements.rankChangeElement.classList.add('positive');
                this.elements.rankChangeElement.classList.remove('negative');
            } else {
                this.elements.rankChangeElement.classList.add('negative');
                this.elements.rankChangeElement.classList.remove('positive');
            }
        } else {
            this.elements.rankChangeElement.innerHTML = `
                <span class="rank-change">
                    <i class="fas fa-minus"></i>
                    <span>No change this week</span>
                </span>
            `;
            this.elements.rankChangeElement.classList.remove('positive', 'negative');
        }
    }

    initializeDarkMode() {
        const isDarkMode = localStorage.getItem('darkMode') === 'true';
        if (isDarkMode) {
            document.documentElement.classList.add('dark-theme');
            document.body.classList.add('dark-theme');
        }
    }
}

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const dashboard = new StudentDashboard();
});