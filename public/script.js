// public/script.js - JavaScript del cliente

// Configuración base
const API_BASE = window.location.origin;

// Funciones de navegación
// Actualizar estas funciones en script.js
function goToRegister() {
    window.location.href = '/register.html';
}

function goToLogin() {
    window.location.href = '/login.html';
}


// Función para cargar información de la quiniela
async function loadQuinielaInfo() {
    try {
        const response = await fetch(`${API_BASE}/api/info`);
        const data = await response.json();
        
        // Actualizar el número de participantes
        const participantesElement = document.getElementById('participantes');
        if (participantesElement) {
            participantesElement.textContent = data.participantes || 0;
        }
        
        console.log('Información de la quiniela cargada:', data);
        
    } catch (error) {
        console.error('Error al cargar información de la quiniela:', error);
    }
}

// Función para mostrar mensajes de notificación
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    
    // Estilos de la notificación
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        border-radius: 8px;
        color: white;
        font-weight: 500;
        z-index: 1000;
        animation: slideIn 0.3s ease-out;
        max-width: 300px;
    `;
    
    // Colores según el tipo
    const colors = {
        success: '#48bb78',
        error: '#f56565',
        warning: '#ed8936',
        info: '#4299e1'
    };
    
    notification.style.backgroundColor = colors[type] || colors.info;
    
    document.body.appendChild(notification);
    
    // Remover después de 4 segundos
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-in';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 4000);
}

// Función para formatear fechas
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-ES', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Función para validar email
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

// Función para validar formularios
function validateForm(formData) {
    const errors = [];
    
    if (!formData.email || !isValidEmail(formData.email)) {
        errors.push('Email inválido');
    }
    
    if (!formData.password || formData.password.length < 6) {
        errors.push('La contraseña debe tener al menos 6 caracteres');
    }
    
    if (!formData.name || formData.name.trim().length < 2) {
        errors.push('El nombre debe tener al menos 2 caracteres');
    }
    
    return errors;
}

// Función para manejar errores de API
function handleApiError(error) {
    console.error('Error de API:', error);
    
    if (error.message.includes('Failed to fetch')) {
        showNotification('Error de conexión. Verifica tu internet.', 'error');
    } else if (error.message.includes('401')) {
        showNotification('Sesión expirada. Inicia sesión nuevamente.', 'warning');
    } else if (error.message.includes('403')) {
        showNotification('No tienes permisos para esta acción.', 'error');
    } else {
        showNotification('Ocurrió un error inesperado.', 'error');
    }
}

// Inicialización cuando se carga la página
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Quiniela Mundial cargada correctamente');
    
    // Cargar información inicial
    loadQuinielaInfo();
    
    // Agregar eventos a elementos si existen
    const testButton = document.querySelector('.btn-test');
    if (testButton) {
        testButton.addEventListener('click', testServer);
    }
    
    // Mostrar mensaje de bienvenida
    setTimeout(() => {
        showNotification('¡Bienvenido a la Quiniela Mundial!', 'success');
    }, 1000);
});

// Agregar estilos para las animaciones de notificaciones
const notificationStyles = document.createElement('style');
notificationStyles.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
`;
document.head.appendChild(notificationStyles);

// Exportar funciones para uso global
window.goToRegister = goToRegister;
window.goToLogin = goToLogin;