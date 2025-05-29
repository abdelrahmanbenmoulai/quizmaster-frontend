document.addEventListener('DOMContentLoaded', async () => {
    // Check auth status
    if (!checkAuth()) return;

    try {
        // Fetch dashboard data using fetchWithAuth
        const response = await fetchWithAuth(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.DASHBOARD}`);
        if (!response.ok) throw new Error('Failed to fetch dashboard data');
        
        const data = await response.json();
        // Update dashboard with data
        updateDashboard(data);
    } catch (error) {
        console.error('Dashboard Error:', error);
        showNotification('Failed to load dashboard data', 'error');
    }
});

function updateDashboard(data) {
    // Your existing dashboard update logic
} 