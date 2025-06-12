// public/auth.js - Lógica de autenticación del cliente

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const messageDiv = document.getElementById('message');

    // Función para mostrar mensajes
    function showMessage(message, type = 'info') {
        messageDiv.textContent = message;
        messageDiv.className = `message ${type} show`;
        setTimeout(() => {
            messageDiv.className = 'message';
        }, 5000);
    }

    // Función para validar registro
    function validateRegister(name, email, password, confirmPassword, terms) {
        const errors = [];

        if (name.trim().length < 2) {
            errors.push('El nombre debe tener al menos 2 caracteres');
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            errors.push('Email inválido');
        }

        if (password.length < 6) {
            errors.push('La contraseña debe tener al menos 6 caracteres');
        }

        if (password !== confirmPassword) {
            errors.push('Las contraseñas no coinciden');
        }

        if (!terms) {
            errors.push('Debes aceptar los términos y condiciones');
        }

        return errors;
    }

    // Manejo de formulario de registro
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const submitButton = e.target.querySelector('button[type="submit"]');
            submitButton.disabled = true;
            submitButton.textContent = 'Creando cuenta...';

            const name = document.getElementById('name').value;
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            const confirmPassword = document.getElementById('confirmPassword').value;
            const terms = document.getElementById('terms').checked;

            const validationErrors = validateRegister(name, email, password, confirmPassword, terms);

            if (validationErrors.length > 0) {
                showMessage(validationErrors.join(', '), 'error');
                submitButton.disabled = false;
                submitButton.textContent = 'Crear Cuenta';
                return;
            }

            try {
                const response = await fetch('/api/auth/register', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ name, email, password })
                });

                const data = await response.json();

                if (response.ok) {
                    showMessage(data.message + '. Redirigiendo al login...', 'success');
                    setTimeout(() => {
                        window.location.href = '/login.html';
                    }, 2000);
                } else {
                    showMessage(data.error, 'error');
                }
            } catch (error) {
                showMessage('Error de conexión. Verifica que el servidor esté funcionando.', 'error');
            } finally {
                submitButton.disabled = false;
                submitButton.textContent = 'Crear Cuenta';
            }
        });
    }

    // Manejo de formulario de login
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const submitButton = e.target.querySelector('button[type="submit"]');
            submitButton.disabled = true;
            submitButton.textContent = 'Iniciando sesión...';

            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;

            if (!email || !password) {
                showMessage('Email y contraseña son requeridos', 'error');
                submitButton.disabled = false;
                submitButton.textContent = 'Iniciar Sesión';
                return;
            }

            try {
                const response = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ email, password })
                });

                const data = await response.json();

                if (response.ok) {
                    // Guardar token y datos del usuario
                    localStorage.setItem('token', data.token);
                    localStorage.setItem('user', JSON.stringify(data.user));
                    
                    showMessage('¡Inicio de sesión exitoso!', 'success');
                    
                    // Redirigir según rol
                    setTimeout(() => {
                        if (data.user.is_admin) {
                            window.location.href = '/admin.html';
                        } else {
                            window.location.href = '/dashboard.html';
                        }
                    }, 1500);
                } else {
                    showMessage(data.error, 'error');
                }
            } catch (error) {
                showMessage('Error de conexión. Verifica que el servidor esté funcionando.', 'error');
            } finally {
                submitButton.disabled = false;
                submitButton.textContent = 'Iniciar Sesión';
            }
        });
    }
});
