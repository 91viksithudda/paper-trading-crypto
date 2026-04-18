document.addEventListener('DOMContentLoaded', () => {
    // Security Check: Redirect if not logged in or not an admin
    const token = localStorage.getItem('ag_token');
    const user = JSON.parse(localStorage.getItem('ag_user') || '{}');
    
    if (!token || user.role !== 'admin') {
        window.location.href = 'index.html';
        return;
    }
    
    // Tab switching logic
    const tabs = document.querySelectorAll('.nav-links li');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Remove active class from all tabs
            tabs.forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            
            // Add active class to clicked tab
            tab.classList.add('active');
            const targetId = tab.getAttribute('data-tab');
            document.getElementById(targetId).classList.add('active');

            // Load data based on tab
            if (targetId === 'dashboard') {
                loadDashboardStats();
            } else if (targetId === 'users') {
                loadAllUsers();
            }
        });
    });

    // Modal Logic
    const modal = document.getElementById('editBalanceModal');
    const closeBtn = document.querySelector('.close-modal');
    
    closeBtn.addEventListener('click', () => {
        modal.classList.remove('show');
    });

    window.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('show');
        }
    });

    document.getElementById('saveBalanceBtn').addEventListener('click', saveNewBalance);

    // Initial load
    loadDashboardStats();
});

// Create API base URL relative to current location
const API_BASE = window.location.hostname.includes('localhost') || window.location.hostname.includes('127.0.0.1')
    ? `http://${window.location.hostname}:5000/api`
    : '/api'; // Used for production proxy/vercel

// Helper to format currency
const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
    }).format(value);
};

// Load Dashboard Stats
async function loadDashboardStats() {
    try {
        const response = await fetch(`${API_BASE}/admin/stats`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('ag_token')}`
            }
        });
        
        if (!response.ok) throw new Error('Failed to load stats');
        
        const data = await response.json();
        
        // Update Stats Cards
        document.getElementById('totalUsers').textContent = data.userCount || 0;
        document.getElementById('totalTrades').textContent = data.tradeCount || 0;
        document.getElementById('totalTransactions').textContent = data.transactionCount || 0;
        document.getElementById('totalReferralPayouts').textContent = data.referralEarningsCount || 0;

        // Render Recent Users
        const tbody = document.querySelector('#recentUsersTable tbody');
        tbody.innerHTML = '';
        
        if (data.recentUsers && data.recentUsers.length > 0) {
            data.recentUsers.forEach(user => {
                const date = new Date(user.createdAt).toLocaleDateString();
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <img src="${user.avatar || 'https://ui-avatars.com/api/?name=' + user.username + '&background=random'}" 
                                 style="width: 30px; height: 30px; border-radius: 50%;">
                            <span>${user.username}</span>
                        </div>
                    </td>
                    <td>${user.email}</td>
                    <td>${date}</td>
                    <td style="color: var(--success); font-weight: 500;">${formatCurrency(user.cashBalance)}</td>
                `;
                tbody.appendChild(tr);
            });
        } else {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align: center;">No users found.</td></tr>`;
        }
    } catch (err) {
        console.error("Error loading dashboard stats:", err);
        // Optionally show toast error
    }
}

// Load All Users
async function loadAllUsers() {
    const tbody = document.querySelector('#allUsersTable tbody');
    tbody.innerHTML = `<tr><td colspan="4" style="text-align: center;"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</td></tr>`;

    try {
        const response = await fetch(`${API_BASE}/admin/users`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('ag_token')}`
            }
        });
        
        if (!response.ok) throw new Error('Failed to load users');
        
        const users = await response.json();
        tbody.innerHTML = '';
        
        if (users && users.length > 0) {
            users.forEach(user => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <img src="${user.avatar || 'https://ui-avatars.com/api/?name=' + user.username + '&background=random'}" 
                                 style="width: 30px; height: 30px; border-radius: 50%;">
                            <span>${user.username}</span>
                        </div>
                    </td>
                    <td>${user.email}</td>
                    <td style="color: var(--success); font-weight: 500;">${formatCurrency(user.cashBalance)}</td>
                    <td style="color: #f1c40f; font-weight: 500;">₹${user.referralEarnings || 0}</td>
                    <td>
                        <button class="btn btn-primary btn-sm" onclick="openEditModal('${user._id}', '${user.username}', ${user.cashBalance})">
                            <i class="fa-solid fa-pen"></i> Edit Balance
                        </button>
                        <button class="btn btn-danger btn-sm ml-2" onclick="deleteUser('${user._id}', '${user.username}')">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        } else {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align: center;">No users found.</td></tr>`;
        }
    } catch (err) {
        console.error("Error loading users:", err);
        tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--danger);">Failed to load users.</td></tr>`;
    }
}

// Global functions for inline handlers
window.openEditModal = (id, username, balance) => {
    document.getElementById('editUserId').value = id;
    document.getElementById('editUsername').textContent = username;
    document.getElementById('newBalance').value = balance;
    document.getElementById('editBalanceModal').classList.add('show');
};

window.saveNewBalance = async () => {
    const id = document.getElementById('editUserId').value;
    const newBalance = document.getElementById('newBalance').value;
    const btn = document.getElementById('saveBalanceBtn');
    
    if (!newBalance || newBalance < 0) {
        alert("Please enter a valid positive balance.");
        return;
    }

    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
    btn.disabled = true;

    try {
        const response = await fetch(`${API_BASE}/admin/users/${id}/balance`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('ag_token')}`
            },
            body: JSON.stringify({ newBalance })
        });
        
        if (!response.ok) throw new Error('Failed to update balance');
        
        document.getElementById('editBalanceModal').classList.remove('show');
        loadAllUsers(); // Refresh list
    } catch (err) {
        console.error("Error updating balance:", err);
        alert("Failed to update balance.");
    } finally {
        btn.innerHTML = 'Save Changes';
        btn.disabled = false;
    }
};

window.deleteUser = async (id, username) => {
    if (!confirm(`Are you absolutely sure you want to delete user ${username}? This cannot be undone.`)) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/admin/users/${id}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('ag_token')}`
            }
        });
        
        if (!response.ok) throw new Error('Failed to delete user');
        
        loadAllUsers(); // Refresh list
        loadDashboardStats(); // Refresh stats
    } catch (err) {
        console.error("Error deleting user:", err);
        alert("Failed to delete user.");
    }
};
