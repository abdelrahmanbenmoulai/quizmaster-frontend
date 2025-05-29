// Create a notifications object
const notifications = new (class NotificationManager {
    constructor() {
        // Create container when the DOM is ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.createContainer());
        } else {
            this.createContainer();
        }
        this.activeNotification = null;
    }

    createContainer() {
        // Check if container already exists
        let container = document.querySelector('.notification-container');
        
        if (!container) {
            console.log('Creating notification container');
            container = document.createElement('div');
            container.className = 'notification-container';
            container.setAttribute('role', 'alert');
            container.setAttribute('aria-live', 'polite');
            document.body.appendChild(container);
        }
        
        this.container = container;
        return container;
    }

    // Clear all existing notifications
    clearAllNotifications() {
        // Ensure container exists
        if (!this.container) {
            this.createContainer();
        }
        
        // Get all existing notification elements
        const existingNotifications = this.container.querySelectorAll('.notification');
        
        // Remove each notification immediately
        existingNotifications.forEach(notification => {
            notification.remove();
        });
        
        // Reset active notification
        this.activeNotification = null;
    }

    show(message, type = 'info', duration = 5000) {
        // Ensure container exists
        if (!this.container) {
            this.createContainer();
        }
        
        // Clear any existing notifications first
        this.clearAllNotifications();
        
        console.log(`Showing ${type} notification: ${message}`);
        
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        
        // Icon based on type
        const icon = this.getIcon(type);
        
        notification.innerHTML = `
            <div class="notification-content">
                ${icon}
                <p>${message}</p>
            </div>
            <button class="notification-close" aria-label="Close notification">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
        `;

        // Set ARIA attributes
        notification.setAttribute('role', type === 'error' ? 'alert' : 'status');
        notification.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');

        // Add close button functionality
        const closeBtn = notification.querySelector('.notification-close');
        closeBtn.addEventListener('click', () => this.hide(notification));

        // Add to container
        this.container.appendChild(notification);
        
        // Set as active notification
        this.activeNotification = notification;

        // Animate in
        setTimeout(() => {
            notification.classList.add('show');
        }, 10);

        // Auto hide after duration
        if (duration) {
            setTimeout(() => this.hide(notification), duration);
        }

        return notification;
    }

    hide(notification) {
        // Only proceed if the notification still exists in the DOM
        if (notification && notification.parentNode) {
            notification.classList.remove('show');
            notification.classList.add('hide');
            notification.addEventListener('animationend', () => {
                // Only remove if it still exists in the DOM
                if (notification.parentNode) {
                    notification.remove();
                }
                
                // Clear the active notification reference if this was the active one
                if (this.activeNotification === notification) {
                    this.activeNotification = null;
                }
            });
        }
    }

    getIcon(type) {
        switch (type) {
            case 'success':
                return `<svg class="notification-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                    <polyline points="22 4 12 14.01 9 11.01"></polyline>
                </svg>`;
            case 'error':
                return `<svg class="notification-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="8" x2="12" y2="12"></line>
                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>`;
            case 'warning':
                return `<svg class="notification-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                    <line x1="12" y1="9" x2="12" y2="13"></line>
                    <line x1="12" y1="17" x2="12.01" y2="17"></line>
                </svg>`;
            default:
                return `<svg class="notification-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="16" x2="12" y2="12"></line>
                    <line x1="12" y1="8" x2="12.01" y2="8"></line>
                </svg>`;
        }
    }

    success(message, duration = 5000) {
        // Show success notifications
        return this.show(message, 'success', duration);
    }

    error(message, duration = 5000) {
        return this.show(message, 'error', duration);
    }

    warning(message, duration = 5000) {
        return this.show(message, 'warning', duration);
    }

    info(message, duration = 5000) {
        return this.show(message, 'info', duration);
    }
})();

export default notifications; 