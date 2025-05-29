// Common validation rules for the application

// Common passwords that are not allowed (add more as needed)
const commonPasswords = [
    'password123',
    'qwerty123',
    '12345678',
    'admin123',
    'letmein123',
    'welcome123',
    'password1',
    'abc123456',
    '123456789',
    'quizmaster'
];

// Reserved usernames that are not allowed
const reservedUsernames = [
    'admin',
    'administrator',
    'system',
    'root',
    'superuser',
    'quizmaster',
    'teacher',
    'student',
    'user',
    'test',
    'demo'
];

/**
 * Validate password strength and security
 * @param {string} password - The password to validate
 * @returns {Object} - Validation result with isValid and message
 */
export function validatePassword(password) {
    let feedback = [];
    let score = 0;

    // Check for common passwords first
    if (commonPasswords.includes(password.toLowerCase())) {
        return {
            isValid: false,
            message: '❌ Password is too common'
        };
    }

    // Check minimum length
    if (password.length < 8) {
        feedback.push('❌ At least 8 characters');
    } else {
        feedback.push('✓ At least 8 characters');
        score++;
    }

    // Check uppercase
    if (!/[A-Z]/.test(password)) {
        feedback.push('❌ One uppercase letter');
    } else {
        feedback.push('✓ One uppercase letter');
        score++;
    }

    // Check lowercase
    if (!/[a-z]/.test(password)) {
        feedback.push('❌ One lowercase letter');
    } else {
        feedback.push('✓ One lowercase letter');
        score++;
    }

    // Check numbers
    if (!/[0-9]/.test(password)) {
        feedback.push('❌ One number');
    } else {
        feedback.push('✓ One number');
        score++;
    }

    // Check special characters
    if (!/[^A-Za-z0-9]/.test(password)) {
        feedback.push('❌ One special character');
    } else {
        feedback.push('✓ One special character');
        score++;
    }

    // Check for sequential characters
    if (/(abc|bcd|cde|def|efg|fgh|ghi|hij|ijk|jkl|klm|lmn|mno|nop|opq|pqr|qrs|rst|stu|tuv|uvw|vwx|wxy|xyz|012|123|234|345|456|567|678|789)/i.test(password)) {
        feedback.push('❌ No sequential characters (e.g., abc, 123)');
        score = Math.max(0, score - 1);
    } else {
        feedback.push('✓ No sequential characters');
    }

    // Check for repeating characters
    if (/(.)\1{2,}/.test(password)) {
        feedback.push('❌ No repeating characters (e.g., aaa, 111)');
        score = Math.max(0, score - 1);
    } else {
        feedback.push('✓ No repeating characters');
    }

    return {
        isValid: score >= 5,
        message: feedback.join('\n')
    };
}

/**
 * Validate username format and restrictions
 * @param {string} username - The username to validate
 * @returns {Object} - Validation result with isValid and message
 */
export function validateUsername(username) {
    // Check if empty
    if (!username || username.trim() === '') {
        return {
            isValid: false,
            message: '❌ Username is required'
        };
    }

    // Trim the username
    username = username.trim();

    // Check maximum length
    if (username.length > 100) { // Changed to 100 to match database VARCHAR(100)
        return {
            isValid: false,
            message: '❌ Username must be less than 100 characters'
        };
    }

    // Check minimum length
    if (username.length < 3) {
        return {
            isValid: false,
            message: '❌ Username must be at least 3 characters long'
        };
    }

    // Check for valid characters (letters, numbers, spaces, and common special characters)
    if (!/^[A-Za-z0-9\s\-_.]+$/.test(username)) {
        return {
            isValid: false,
            message: '❌ Username can only contain letters, numbers, spaces, hyphens, underscores, and periods'
        };
    }

    // Check for reserved usernames
    if (reservedUsernames.includes(username.toLowerCase())) {
        return {
            isValid: false,
            message: '❌ This username is reserved'
        };
    }

    // If all checks pass
    return {
        isValid: true,
        message: '✓ Valid username format'
    };
} 