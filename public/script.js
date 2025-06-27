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
// En script.js, reemplaza la función loadQuinielaInfo:

// Función para cargar información de la quiniela - VERSIÓN MEJORADA
async function loadQuinielaInfo() {
    try {
        console.log('📊 Cargando estadísticas de la quiniela...');
        
        const response = await fetch(`${API_BASE}/api/public/stats`);
        const result = await response.json();
        
        if (result.success && result.data) {
            // Actualizar participantes
            const participantesElement = document.getElementById('participantes');
            if (participantesElement) {
                // Animación de conteo
                animateNumber(participantesElement, 0, result.data.active_participants, 1000);
            }
            
            // ✅ NUEVO: Actualizar partidos
            const partidosElement = document.getElementById('partidos');
            if (partidosElement) {
                // Animación de conteo
                animateNumber(partidosElement, 0, result.data.total_matches, 1200);
            }
            
            console.log('✅ Estadísticas cargadas:', result.data);
            
        } else {
            console.warn('⚠️ No se pudieron cargar las estadísticas completas');
            // Mantener valores por defecto
            updateElement('participantes', '0');
            updateElement('partidos', '0');
        }
        
    } catch (error) {
        console.error('❌ Error al cargar información de la quiniela:', error);
        // En caso de error, mostrar valores por defecto
        updateElement('participantes', '0');
        updateElement('partidos', '0');
    }
}

// ✅ NUEVA FUNCIÓN: Animación de números
function animateNumber(element, start, end, duration) {
    const startTime = performance.now();
    const difference = end - start;
    
    function updateNumber(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Función de easing para suavizar la animación
        const easeOutCubic = 1 - Math.pow(1 - progress, 3);
        const current = Math.round(start + (difference * easeOutCubic));
        
        element.textContent = current;
        
        if (progress < 1) {
            requestAnimationFrame(updateNumber);
        } else {
            element.textContent = end; // Asegurar el valor final
        }
    }
    
    requestAnimationFrame(updateNumber);
}

// ✅ NUEVA FUNCIÓN: Helper para actualizar elementos
function updateElement(id, value) {
    const element = document.getElementById(id);
    if (element) {
        element.textContent = value;
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

// ===== DETECCIÓN E INSTALACIÓN DE PWA =====

let deferredPrompt;
let isInstalled = false;

// Verificar si ya está instalada
if (window.matchMedia('(display-mode: standalone)').matches || 
    window.navigator.standalone === true) {
    console.log('🚀 App ejecutándose como PWA');
    isInstalled = true;
}

// Detectar evento de instalación
window.addEventListener('beforeinstallprompt', (e) => {
    console.log('📱 App es instalable');
    e.preventDefault();
    deferredPrompt = e;
    
    // Mostrar botón de instalación después de 30 segundos
    setTimeout(() => {
        if (!isInstalled) {
            showInstallPrompt();
        }
    }, 30000);
});

function showInstallPrompt() {
    const installDiv = document.createElement('div');
    installDiv.className = 'install-prompt';
    installDiv.innerHTML = `
        <div class="install-content">
            <span>📱 ¡Instala la app en tu dispositivo!</span>
            <button class="btn btn-primary btn-small" onclick="installPWA()">
                Instalar
            </button>
            <button class="close-install" onclick="dismissInstallPrompt()">
                ✕
            </button>
        </div>
    `;
    document.body.appendChild(installDiv);
    
    // Animación de entrada
    setTimeout(() => {
        installDiv.classList.add('show');
    }, 100);
}

window.installPWA = async function() {
    if (!deferredPrompt) {
        console.log('No hay prompt de instalación disponible');
        return;
    }
    
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    console.log(`Usuario ${outcome === 'accepted' ? 'aceptó' : 'rechazó'} la instalación`);
    
    if (outcome === 'accepted') {
        isInstalled = true;
        // Registrar evento en analytics si tienes
    }
    
    deferredPrompt = null;
    dismissInstallPrompt();
}

window.dismissInstallPrompt = function() {
    const prompt = document.querySelector('.install-prompt');
    if (prompt) {
        prompt.classList.remove('show');
        setTimeout(() => {
            prompt.remove();
        }, 300);
    }
}

// Detectar cuando se instala
window.addEventListener('appinstalled', () => {
    console.log('✅ PWA instalada');
    isInstalled = true;
    deferredPrompt = null;
    dismissInstallPrompt();
});


// Exportar funciones para uso global
window.goToRegister = goToRegister;
window.goToLogin = goToLogin;