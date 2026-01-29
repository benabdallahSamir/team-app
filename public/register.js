document.getElementById('registerForm').addEventListener('submit', async function(e) {
    e.preventDefault();

    const firstName = document.getElementById('firstName').value.trim();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value.trim();

    if (!firstName || !email || !password) {
        Swal.fire({
            icon: 'error',
            title: 'Oops...',
            text: 'All fields are required!',
            confirmButtonColor: '#ff4b2b'
        });
        return;
    }

    try {
        const response = await fetch('/api/auth/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ firstName, email, password })
        });

        const data = await response.json();

        if (!response.ok) {
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: data.message || 'Registration failed',
                confirmButtonColor: '#ff4b2b'
            });
            return;
        }

        // Auto-login after registration
        localStorage.setItem('currentUser', JSON.stringify(data.user));
        localStorage.setItem('token', data.token);

        Swal.fire({
            icon: 'success',
            title: 'Welcome!',
            text: 'Account created successfully.',
            timer: 1500,
            showConfirmButton: false
        }).then(() => {
            window.location.href = 'dashboard.html';
        });
    } catch (error) {
        console.error('Registration error:', error);
        Swal.fire('Error', 'An error occurred during registration', 'error');
    }
});
