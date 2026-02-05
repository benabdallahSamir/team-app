document.addEventListener('DOMContentLoaded', () => {
    // 1. Check Auth (token from backend)
    const token = localStorage.getItem('token');
    const currentUser = JSON.parse(localStorage.getItem('currentUser'));
    if (!token || !currentUser) {
        window.location.href = 'index.html';
        return;
    }

    // 2. Initialize UI
    document.getElementById('userName').textContent = currentUser.name;
    const adminPanel = document.getElementById('adminPanel');
    const addIdeaBtn = document.getElementById('addIdeaBtn');
    const ideaTitleInput = document.getElementById('ideaTitle');
    const ideasList = document.getElementById('ideasList');
    const showUsersBtn = document.getElementById('showUsersBtn');
    const usersSection = document.getElementById('usersSection');
    const usersTableBody = document.getElementById('usersTableBody');
    const blacklistSection = document.getElementById('blacklistSection');
    const showBlacklistBtn = document.getElementById('showBlacklistBtn');
    const blacklistTableBody = document.getElementById('blacklistTableBody');
    const cgcAlert = document.getElementById('cgcAlert');
    const cgcYes = document.getElementById('cgcYes');
    const cgcNo = document.getElementById('cgcNo');
    const cgcConfirmBtn = document.getElementById('cgcConfirmBtn');
    const accessDeniedSection = document.getElementById('accessDeniedSection');
    const reAnswerBtn = document.getElementById('reAnswerBtn');

    // 3. Admin Check (prefer backend flag, keep legacy rule as fallback)
    const isAdmin = currentUser.isAdmin === true || (
        currentUser.email === 'samir@gmail.com' && 
        currentUser.name.toLowerCase() === 'samir'
    );

    if (isAdmin) {
        adminPanel.style.display = 'block';

        showUsersBtn.addEventListener('click', () => {
            if (usersSection.style.display === 'none') {
                renderAllUsers();
                usersSection.style.display = 'block';
                showUsersBtn.textContent = 'Hide Users';
                blacklistSection.style.display = 'none'; // Hide blacklist if open
                showBlacklistBtn.textContent = 'Show Blacklist';
            } else {
                usersSection.style.display = 'none';
                showUsersBtn.textContent = 'Show All Users';
            }
        });

        showBlacklistBtn.addEventListener('click', () => {
             if (blacklistSection.style.display === 'none') {
                renderBlacklist();
                blacklistSection.style.display = 'block';
                showBlacklistBtn.textContent = 'Hide Blacklist';
                usersSection.style.display = 'none'; // Hide users if open
                showUsersBtn.textContent = 'Show All Users';
            } else {
                blacklistSection.style.display = 'none';
                showBlacklistBtn.textContent = 'Show Blacklist';
            }
        });
    }

    // Global ideas state
    let ideas = [];

    // 4. CGC Status Check
    checkCGCStatus();

    function checkCGCStatus() {
        if (!currentUser.cgc_decision) {
            // No decision yet -> Show Alert, Hide Content
            cgcAlert.style.display = 'flex';
            document.querySelector('.header').style.filter = 'blur(5px)';
            ideasList.style.display = 'none';
            accessDeniedSection.style.display = 'none';
        } else if (currentUser.cgc_decision === 'no') {
            // Decision 'no' -> Hide Content, Show Access Denied Section
            ideasList.style.display = 'none';
            accessDeniedSection.style.display = 'block';
            document.querySelector('.header').style.display = 'none'; // Hide header controls too
        } else {
            // Decision 'yes' -> Show Content
            accessDeniedSection.style.display = 'none';
            ideasList.style.display = 'grid'; // Restore grid display
            document.querySelector('.header').style.display = 'flex'; // Restore header
            document.querySelector('.header').style.filter = 'none';
            loadIdeas();
        }
    }

    // Re-answer button logic
    if (reAnswerBtn) {
        reAnswerBtn.addEventListener('click', () => {
            // Reset UI to show alert
            accessDeniedSection.style.display = 'none';
            cgcAlert.style.display = 'flex';
            
            // Clear current selection
            cgcYes.checked = false;
            cgcNo.checked = false;
        });
    }

    // CGC Interactions
    if (cgcYes && cgcNo) {
        cgcYes.addEventListener('change', () => {
            if (cgcYes.checked) cgcNo.checked = false;
        });
        cgcNo.addEventListener('change', () => {
            if (cgcNo.checked) cgcYes.checked = false;
        });

        cgcConfirmBtn.addEventListener('click', async () => {
            if (!cgcYes.checked && !cgcNo.checked) {
                Swal.fire('Selection Required', 'Please select Yes or No.', 'warning');
                return;
            }

            const decision = cgcYes.checked ? 'yes' : 'no';
            try {
                const res = await fetch('/api/user/cgc-decision', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ decision })
                });

                if (!res.ok) throw new Error('Failed to save decision');

                // Update local user
                currentUser.cgc_decision = decision;
                localStorage.setItem('currentUser', JSON.stringify(currentUser));

                // Update UI
                cgcAlert.style.display = 'none';
                document.querySelector('.header').style.filter = 'none';
                
                checkCGCStatus(); // Re-run status check to show/hide content
            } catch (error) {
                console.error('CGC decision error:', error);
                Swal.fire('Error', 'Failed to save your choice.', 'error');
            }
        });
    }

    async function loadIdeas() {
        try {
            const res = await fetch('/api/ideas', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            if (!res.ok) throw new Error('Failed to load ideas');
            ideas = await res.json();
            renderIdeas();
        } catch (error) {
            console.error('Error loading ideas:', error);
            ideas = [];
            ideasList.innerHTML = '<p style="color: white; opacity: 0.7;">Failed to load ideas from server.</p>';
        }
    }

    // 5. Add Idea Logic (Admin Only, via backend)
    addIdeaBtn.addEventListener('click', async () => {
        const title = ideaTitleInput.value.trim();
        if (!title) {
            Swal.fire('Error', 'Please enter a title', 'error');
            return;
        }

        try {
            const res = await fetch('/api/ideas', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ title })
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.message || 'Failed to add idea');
            }

            ideas.push(data);
            ideaTitleInput.value = '';
            Swal.fire('Success', 'Idea added successfully!', 'success');
            renderIdeas();
        } catch (error) {
            console.error('Error adding idea:', error);
            Swal.fire('Error', 'Failed to add idea', 'error');
        }
    });

    // 6. Logout
    document.getElementById('logoutBtn').addEventListener('click', () => {
        localStorage.removeItem('currentUser');
        localStorage.removeItem('token');
        window.location.href = 'index.html';
    });

    // 6b. Delete Account (only if user has no roles on backend)
    document.getElementById('deleteAccountBtn').addEventListener('click', () => {
        Swal.fire({
            title: 'Delete Account?',
            text: 'This will permanently delete your account. You can only do this if you are not part of any project.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#e74c3c',
            cancelButtonColor: '#3085d6',
            confirmButtonText: 'Yes, delete it'
        }).then(async (result) => {
            if (!result.isConfirmed) return;

            try {
                const res = await fetch('/api/account', {
                    method: 'DELETE',
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
                const data = await res.json();

                if (!res.ok) {
                    throw new Error(data.message || 'Failed to delete account');
                }

                Swal.fire('Deleted', 'Your account has been deleted.', 'success').then(() => {
                    localStorage.removeItem('currentUser');
                    localStorage.removeItem('token');
                    window.location.href = 'index.html';
                });
            } catch (error) {
                console.error('Error deleting account:', error);
                Swal.fire('Error', error.message || 'Failed to delete account', 'error');
            }
        });
    });

    // 7. Render Function
    function renderIdeas() {
        ideasList.innerHTML = '';
        if (ideas.length === 0) {
            ideasList.innerHTML = '<p style="color: white; opacity: 0.7;">No ideas yet. Wait for Samir to add some!</p>';
            return;
        }

        ideas.forEach(idea => {
            const card = document.createElement('div');
            card.className = 'idea-card';
            
            const rolesHtml = `
                <div class="role-list">
                    ${createRoleItem(idea, 'Leader', 'leader')}
                    ${createRoleItem(idea, 'Content Manager', 'content_manager')}
                    ${createRoleItem(idea, 'Designer', 'designer')}
                    ${createRoleItem(idea, 'Programmer 1', 'programmer1')}
                    ${createRoleItem(idea, 'Programmer 2', 'programmer2')}
                </div>
            `;

            card.innerHTML = `
                <h3 class="idea-title">${idea.title}</h3>
                ${rolesHtml}
                ${isAdmin ? `<button class="delete-btn" onclick="deleteIdea(${idea.id})" style="background-color: #e74c3c; margin-top: 10px; width: 100%; border: none; padding: 5px; color: white; cursor: pointer; border-radius: 4px;">Delete Idea</button>` : ''}
            `;
            ideasList.appendChild(card);
        });
    }

    function createRoleItem(idea, label, roleKey) {
        const member = idea.members[roleKey];
        const memberName = member ? member.name : null;
        const memberEmail = member ? member.email : null;
        const isCurrentUser = member && memberEmail === currentUser.email;

        let content;
        if (member) {
            if (isCurrentUser) {
                content = `<span class="member-name" title="${memberEmail || ''}">\ud83d\udc64 ${memberName} <span style="font-size: 0.8em; opacity: 0.7;">(${memberEmail || 'No Email'})</span></span> <button class="delete-role-btn" onclick="leaveRole(${idea.id}, '${roleKey}')" title="Leave this role">\u2716</button>`;
            } else {
                content = `<span class="member-name" title="${memberEmail || ''}">\ud83d\udc64 ${memberName} <span style="font-size: 0.8em; opacity: 0.7;">(${memberEmail || 'No Email'})</span></span>`;
            }
        } else {
            content = `<button class="join-btn" onclick="requestJoin(${idea.id}, '${roleKey}')">Join Role</button>`;
        }

        return `
            <div class="role-item">
                <span class="role-name">${label}</span>
                <span class="role-status">${content}</span>
            </div>
        `;
    }

    // 8. Join Logic global function
    window.requestJoin = function(ideaId, roleKey) {
        const idea = ideas.find(i => i.id === ideaId);
        if (!idea) return;

        // Check if user is already in THIS team (client-side check)
        const alreadyInTeam = Object.values(idea.members).some(member => {
            if (!member) return false;
            return member.email === currentUser.email; 
        });

        if (alreadyInTeam) {
            Swal.fire({
                icon: 'error',
                title: 'Limit Reached',
                text: 'You are already in this team!'
            });
            return;
        }

        if (idea.members[roleKey] !== null) {
             Swal.fire('Oops', 'This role was just taken!', 'error');
             loadIdeas();
             return;
        }

        Swal.fire({
            title: 'Join Team?',
            text: `Join "${idea.title}" as ${roleKey}?`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonColor: '#00b09b',
            cancelButtonColor: '#d33',
            confirmButtonText: 'Yes, Join!'
        }).then(async (result) => {
            if (result.isConfirmed) {
                try {
                    const res = await fetch(`/api/ideas/${ideaId}/join`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify({ roleKey })
                    });

                    const data = await res.json();
                    if (!res.ok) {
                        throw new Error(data.message || 'Failed to join team');
                    }

                    // Update local copy
                    const idx = ideas.findIndex(i => i.id === ideaId);
                    if (idx !== -1) {
                        ideas[idx] = data;
                    }
                    
                    Swal.fire('Joined!', 'You are now part of the team.', 'success');
                    renderIdeas();
                } catch (error) {
                    console.error('Error joining team:', error);
                    Swal.fire('Error', 'Failed to join team', 'error');
                }
            }
        });
    };

    // Admin: Render all users (from backend)
    async function renderAllUsers() {
        try {
            const res = await fetch('/api/users', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            const users = await res.json();
            usersTableBody.innerHTML = '';

            if (!res.ok || users.length === 0) {
                usersTableBody.innerHTML = '<tr><td colspan="3" style="padding:10px;">No users found.</td></tr>';
                return;
            }

            users.forEach(user => {
                const row = document.createElement('tr');
                row.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
                row.innerHTML = `
                    <td style="padding: 10px;">${user.name}</td>
                    <td style="padding: 10px;">${user.email}</td>
                    <td style="padding: 10px;">${user.roleInfo || 'No active role'}</td>
                `;
                usersTableBody.appendChild(row);
            });
        } catch (error) {
            console.error('Error fetching users:', error);
        }
    }

    // Admin: Render Blacklist
    async function renderBlacklist() {
        try {
            const res = await fetch('/api/admin/blacklist', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const list = await res.json();
            blacklistTableBody.innerHTML = '';

            if (!res.ok || list.length === 0) {
                 blacklistTableBody.innerHTML = '<tr><td colspan="3" style="padding:10px;">No blacklist entries found.</td></tr>';
                 return;
            }

            list.forEach(item => {
                const row = document.createElement('tr');
                row.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
                row.innerHTML = `
                    <td style="padding: 10px;">${item.name}</td>
                    <td style="padding: 10px;">${item.email}</td>
                    <td style="padding: 10px;">${new Date(item.decisionDate).toLocaleString()}</td>
                `;
                blacklistTableBody.appendChild(row);
            });
        } catch (error) {
            console.error('Error fetching blacklist:', error);
        }
    }

    // Leave Role (delete user's role)
    window.leaveRole = function(ideaId, roleKey) {
        Swal.fire({
            title: 'Leave Role?',
            text: `Are you sure you want to leave this role?`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#e74c3c',
            cancelButtonColor: '#3085d6',
            confirmButtonText: 'Yes, leave!'
        }).then((result) => {
            if (result.isConfirmed) {
                (async () => {
                    try {
                        const res = await fetch(`/api/ideas/${ideaId}/leave`, {
                            method: 'DELETE',
                            headers: {
                                'Authorization': `Bearer ${token}`
                            }
                        });
                        const data = await res.json();
                        if (!res.ok) {
                            throw new Error(data.message || 'Failed to leave role');
                        }

                        // Update local copy
                        const idx = ideas.findIndex(i => i.id === ideaId);
                        if (idx !== -1) {
                            ideas[idx] = data;
                        }
                        
                        Swal.fire('Left!', 'You have left the role.', 'success');
                        renderIdeas();
                        if (usersSection.style.display === 'block') {
                            renderAllUsers();
                        }
                    } catch (error) {
                        console.error('Error leaving role:', error);
                        Swal.fire('Error', 'Failed to leave role', 'error');
                    }
                })();
            }
        });
    };

    // Admin: Delete Idea (via backend)
    window.deleteIdea = function(ideaId) {
        Swal.fire({
            title: 'Are you sure?',
            text: "This cannot be undone!",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#e74c3c',
            cancelButtonColor: '#3085d6',
            confirmButtonText: 'Yes, delete it!'
        }).then((result) => {
            if (result.isConfirmed) {
                (async () => {
                    try {
                        const res = await fetch(`/api/ideas/${ideaId}`, {
                            method: 'DELETE',
                            headers: {
                                'Authorization': `Bearer ${token}`
                            }
                        });
                        const data = await res.json();
                        if (!res.ok) {
                            throw new Error(data.message || 'Failed to delete idea');
                        }

                        ideas = ideas.filter(i => i.id !== ideaId);
                        
                        Swal.fire('Deleted!', 'The idea has been deleted.', 'success');
                        renderIdeas();
                        if (usersSection.style.display === 'block') {
                            renderAllUsers();
                        }
                    } catch (error) {
                        console.error('Error deleting idea:', error);
                        Swal.fire('Error', 'Failed to delete idea', 'error');
                    }
                })();
            }
        });
    };
});
