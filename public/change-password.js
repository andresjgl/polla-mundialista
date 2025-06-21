// public/change-password.js - Lógica para cambio de contraseña obligatorio

document.addEventListener('DOMContentLoaded', () => {
    // Verificar autenticación
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('user') || '{}');

    if (!token) {
        window.location.href = '/login.html';
        return;
    }

    console.log('👤 Usuario en cambio de contraseña:', user.name);

    const changePasswordForm = document.getElementById('changePasswordForm');
    const messageDiv = document.getElementById('message');

    // Función para mostrar mensajes
    function showMessage(message, type = 'info') {
        messageDiv.textContent = message;
        messageDiv.className = `message ${type} show`;
        setTimeout(() => {
            messageDiv.className = 'message';
        }, 5000);
    }

    // Manejo del formulario
    changePasswordForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const submitButton = e.target.querySelector('button[type="submit"]');
        submitButton.disabled = true;
        submitButton.textContent = 'Cambiando...';

        const currentPassword = document.getElementById('currentPassword').value;
        const newPassword = document.getElementById('newPassword').value;
        const confirmPassword = document.getElementById('confirmPassword').value;

        // Validaciones del cliente
        if (newPassword.length < 6) {
            showMessage('La nueva contraseña debe tener al menos 6 caracteres', 'error');
            submitButton.disabled = false;
            submitButton.textContent = 'Cambiar Contraseña';
            return;
        }

        if (newPassword !== confirmPassword) {
            showMessage('Las contraseñas nuevas no coinciden', 'error');
            submitButton.disabled = false;
            submitButton.textContent = 'Cambiar Contraseña';
            return;
        }

        try {
            const response = await fetch('/api/auth/change-required-password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    current_password: currentPassword,
                    new_password: newPassword
                })
            });

            const data = await response.json();

            // En change-password.js, reemplaza la parte del success:
if (response.ok) {
    showMessage('¡Contraseña cambiada exitosamente!', 'success');
    
    // ✅ NUEVO: OBTENER DATOS FRESCOS DEL USUARIO
    try {
        const userResponse = await fetch('/api/auth/me', {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (userResponse.ok) {
            const freshUserData = await userResponse.json();
            console.log('📊 Datos frescos del usuario:', freshUserData);
            
            // Actualizar localStorage con datos frescos
            const updatedUser = {
                ...freshUserData,
                must_change_password: false  // Ya cambió la contraseña
            };
            
            localStorage.setItem('user', JSON.stringify(updatedUser));
            console.log('✅ Datos del usuario actualizados en localStorage');
                }
                } catch (error) {
                    console.warn('⚠️ Error obteniendo datos frescos:', error);
                    // Continuar con los datos anteriores actualizados
                    const updatedUser = { ...user, must_change_password: false };
                    localStorage.setItem('user', JSON.stringify(updatedUser));
                }
                
                setTimeout(() => {
                    if (user.is_admin) {
                        window.location.href = '/admin.html';
                    } else {
                        window.location.href = '/dashboard.html';
                    }
                }, 2000);
            } else {
                showMessage(data.error || 'Error cambiando contraseña', 'error');
            }
        } catch (error) {
            showMessage('Error de conexión. Inténtalo de nuevo.', 'error');
            console.error('Error:', error);
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = 'Cambiar Contraseña';
        }
    });
});
