const API_CONFIG = {
  BASE_URL: "/quizmaster/backend",
  DEBUG_MODE: true,
  FALLBACK_ENDPOINTS: {
    ENABLED: true,
    AUTH: {
      REFRESH: "/auth/refresh-token.php",
      VERIFY: "/auth/verify.php"
    }
  },
  ENDPOINTS: {
    AUTH: {
      LOGIN: "/auth/login.php",
      REGISTER: "/auth/register.php",
      LOGOUT: "/auth/logout.php",
      VERIFY: "/auth/verify.php",
      FORGOT_PASSWORD: "/auth/forgot-password.php",
      RESET_PASSWORD: "/auth/reset-password.php",
      REFRESH_TOKEN: "/auth/refresh-token.php"
    },
    QUIZ: {
      GET: "/quiz/get.php",
      CREATE: "/quiz/create.php",
      UPDATE: "/quiz/update.php",
      DELETE: "/quiz/delete.php",
      SUBMIT: "/quiz/submit.php",
      ATTEMPT: "/quiz/attempt.php",
      SEARCH: "/quiz/search.php",
      START_ATTEMPT: "/quiz/attempt.php?action=start"
    },
    TEACHER: {
      DASHBOARD: "/teacher/dashboard.php",
      QUIZZES: "/teacher/quizzes.php",
      STUDENTS: "/teacher/students.php",
      PROFILE: "/teacher/profile.php",
      ANALYTICS: "/teacher/analytics.php",
      UPDATE_ANALYTICS: "/teacher/update-analytics.php",
      SEARCH_STUDENT: "/student/search-student.php",
      CHECK_UPDATES: "/teacher/check-updates.php",
      EXPORT_STUDENTS: "/teacher/export-students.php",
      PREFERENCES: "/teacher/preferences.php",
      PASSWORD: "/teacher/update-password.php",
      AVATAR: "/teacher/update-avatar.php",
      STUDENTS_WITH_NOTIFICATIONS: "/teacher/students-with-notifications.php"
    },
    STUDENT: {
      DASHBOARD: "/student/dashboard.php",
      QUIZZES: "/student/quizzes.php",
      LEADERBOARD: "/student/leaderboard.php",
      STATS: "/student/statistics.php",
      PROFILE: "/student/profile.php",
      UPDATE_STATISTICS: "/student/update-statistics.php",
    },
    COMMON: {
      SUBJECTS: "/common/subjects.php",
    },
    CONFIG: {
      CONFIGURATION: "/config/config.php",
      DATABASE: "/config/database.php",
    },
    UTILS: {
      SECURITY: "/utils/security.php",
      VALIDATION: "/utils/validation.php",
    },
    MIDDLEWARE: {
      AUTH: "/middleware/auth.php",
    },
  },
  PAGINATION: {
    DEFAULT_LIMIT: 10,
    DEFAULT_PAGE: 1,
  },
  UPLOAD: {
    MAX_FILE_SIZE: 5 * 1024 * 1024, // 5MB
    ALLOWED_IMAGE_TYPES: ["image/jpeg", "image/png", "image/gif"],
  },
  THEMES: {
    LIGHT: "light",
    DARK: "dark",
  },
  LANGUAGES: {
    DEFAULT: "en",
    SUPPORTED: ["en", "ar", "fr"],
  },
  TOAST: {
    DURATION: 5000,
    POSITION: "top-right",
  },
  CACHE: {
    TTL: 5 * 60 * 1000, // 5 minutes
  },
  DEBOUNCE: {
    SEARCH: 300,
    SAVE: 1000,
  },
  QUIZ: {
    MIN_QUESTIONS: 5,
    MAX_QUESTIONS: 50,
    TIME_LIMIT: {
      MIN: 0,
      MAX: 15,
    },
    PASSING_SCORE: 50,
  },
  MEDALS: {
    GOLD: {
      MIN_SCORE: 25,
      ICON: "medal-gold",
    },
    SILVER: {
      MIN_SCORE: 15,
      ICON: "medal-silver",
    },
    BRONZE: {
      MIN_SCORE: 5,
      ICON: "medal-bronze",
    },
  },
  ANALYTICS: {
    TIME_RANGES: {
      WEEK: "7days",
      MONTH: "30days",
      QUARTER: "90days",
    },
    CHART_COLORS: {
      PRIMARY: "#4CAF50",
      SECONDARY: "#2196F3",
      DANGER: "#F44336",
      WARNING: "#FFC107",
      INFO: "#00BCD4",
    },
  },
  SKIP_AUTH_CHECKS: false,
  IGNORE_TOKEN_EXPIRATION: false,
  DISABLE_AUTH_REDIRECT: true,
  AUTH: {
    TOKEN_REFRESH_INTERVAL: 30 * 60 * 1000, // 30 minutes
    SESSION_DURATION: 24 * 60 * 60 * 1000,  // 24 hours
    REFRESH_BEFORE_EXPIRY: 5 * 60,          // 5 minutes
    STORAGE_KEYS: {
      TOKEN: 'userToken',
      USER_DATA: 'userData',
      SESSION: 'dashboardSession'
    }
  },
};

export default API_CONFIG;
