// public/dashboard.js - VERSIÓN FINAL CON LÓGICA DE CARGA CORREGIDA

let currentPage = 1;
let currentFilter = 'all';
const matchesPerPage = 10;

// ===== NUEVAS VARIABLES PARA PREDICCIONES =====
let currentPredictionsPage = 1;
let currentPredictionsFilter = 'all';
const predictionsPerPage = 10;

let notificationsVisible = false;
let unreadCount = 0;

let currentTournamentRules = '';

let pushSubscription = null;
const applicationServerKey = 'BNASXfnwv9-1BkWn9SrnrYIUM2uWRsab8of7a6ZaMojrWKirx8UNqOsSITCDsyv3d9jR_EXc4R2LzxGKZEgKEA0'; // Lo configuraremos después

document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('user') || '{}');

    if (!token) {
        window.location.href = '/login.html';
        return;
    }
    if (user.is_admin) {
        window.location.href = '/admin.html';
        return;
    }

    // ✅ VERIFICAR SI DEBE CAMBIAR CONTRASEÑA
    if (user.must_change_password) {
        console.log('⚠️ Usuario debe cambiar contraseña, redirigiendo...');
        window.location.href = '/change-password.html';
        return;
    }

    document.getElementById('userName').textContent = user.name || 'Usuario';
    
    checkAccountStatus(user);

     // ✨ INICIALIZAR PUSH NOTIFICATIONS
    await registerServiceWorker();

    // Solo si la cuenta está activa, cargamos el resto.
    if (user.is_active) {
        const activeTournament = await loadActiveTournament();
        if (activeTournament) {
            await loadUserStats(user.id);
            await loadLeaderboard();
            await loadUpcomingMatches();
            await loadUserPredictions(1, 'all');
        }
    }

    // ✨ INICIALIZAR NOTIFICACIONES
    await loadNotifications();
    startNotificationsPolling();

    loadUpcomingMatches(1, 'all');

});

// ===== SISTEMA DE PUSH NOTIFICATIONS =====



// Registrar Service Worker
async function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        try {
            const registration = await navigator.serviceWorker.register('/sw.js');
            console.log('✅ Service Worker registrado:', registration);
            
            // Verificar si ya hay una suscripción
            const existingSubscription = await registration.pushManager.getSubscription();
            if (existingSubscription) {
                pushSubscription = existingSubscription;
                console.log('📱 Suscripción push existente encontrada');
            }
            
            return registration;
        } catch (error) {
            console.error('❌ Error registrando Service Worker:', error);
        }
    } else {
        console.warn('⚠️ Service Workers no soportados');
    }
}

// Pedir permisos y crear suscripción push
async function requestNotificationPermission() {
    if (!('Notification' in window)) {
        console.warn('⚠️ Este navegador no soporta notificaciones');
        showTemporaryMessage('❌ Tu navegador no soporta notificaciones');
        return false;
    }

    if (Notification.permission === 'granted') {
        console.log('✅ Permisos de notificación ya concedidos');
        await subscribeToPush();
        return true;
    }

    if (Notification.permission === 'denied') {
        console.warn('❌ Permisos de notificación denegados');
        showTemporaryMessage('❌ Permisos de notificación denegados. Actívalos en configuración del navegador.');
        return false;
    }

    // Pedir permisos
    const permission = await Notification.requestPermission();
    
    if (permission === 'granted') {
        console.log('✅ Permisos de notificación concedidos');
        showTemporaryMessage('✅ ¡Notificaciones activadas! Recibirás alertas de partidos y resultados.');
        await subscribeToPush();
        return true;
    } else {
        console.warn('❌ Permisos de notificación denegados por el usuario');
        showTemporaryMessage('❌ Sin permisos no podemos enviarte notificaciones automáticas');
        return false;
    }
}

// Crear suscripción push
// Modificar la función subscribeToPush() para manejar errores mejor
async function subscribeToPush() {
    try {
        const registration = await navigator.serviceWorker.ready;
        
        if (!registration.pushManager) {
            console.warn('⚠️ Push Manager no disponible');
            return null;
        }

        let subscription = await registration.pushManager.getSubscription();
        
        if (!subscription) {
            console.log('📱 Creando nueva suscripción push...');
            
            subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(applicationServerKey)
            });
        }

        pushSubscription = subscription;
        console.log('📱 Suscripción push activa:', subscription);

        // ✨ ENVIAR SUSCRIPCIÓN AL SERVIDOR CON MANEJO DE ERRORES
        try {
            await savePushSubscription(subscription);
        } catch (saveError) {
            console.warn('⚠️ Error guardando suscripción en servidor (continuando):', saveError);
            // No bloquear si falla el guardado en servidor
        }
        
        return subscription;
    } catch (error) {
        console.error('❌ Error creando suscripción push:', error);
        showTemporaryMessage('⚠️ Las notificaciones push no están disponibles temporalmente');
        return null;
    }
}

// Guardar suscripción con mejor manejo de errores
async function savePushSubscription(subscription) {
    try {
        const response = await fetchWithAuth('/api/notifications/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                subscription: subscription.toJSON(),
                user_agent: navigator.userAgent,
                device_type: /Mobile|Android|iPhone|iPad/.test(navigator.userAgent) ? 'mobile' : 'desktop'
            })
        });

        if (response && response.ok) {
            console.log('✅ Suscripción guardada en servidor');
            showTemporaryMessage('✅ Notificaciones push configuradas (en desarrollo)');
        } else {
            console.warn('⚠️ Error guardando suscripción');
            showTemporaryMessage('⚠️ Notificaciones push temporalmente no disponibles');
        }
    } catch (error) {
        console.error('❌ Error enviando suscripción al servidor:', error);
        throw error; // Re-lanzar para manejo en subscribeToPush
    }
}


// Convertir clave VAPID a formato correcto
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/-/g, '+')
        .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

// Testear notificación local
async function testLocalNotification() {
    if (Notification.permission === 'granted') {
        new Notification('🏆 Test - Quiniela Familiar', {
            body: 'Las notificaciones están funcionando correctamente',
            icon: '/favicon.ico',
            vibrate: [200, 100, 200]
        });
    } else {
        await requestNotificationPermission();
    }
}


// ===== SISTEMA DE NOTIFICACIONES =====

// Cargar notificaciones al iniciar
async function loadNotifications() {
    try {
        const response = await fetchWithAuth('/api/notifications?limit=10');
        if (!response || !response.ok) return;
        
        const data = await response.json();
        updateNotificationsBadge(data.unread_count);
        
        console.log(`🔔 ${data.unread_count} notificaciones no leídas`);
        
    } catch (error) {
        console.error('❌ Error cargando notificaciones:', error);
    }
}

// Actualizar badge de notificaciones
function updateNotificationsBadge(count) {
    unreadCount = count;
    const badge = document.getElementById('notificationsBadge');
    
    if (count > 0) {
        badge.textContent = count > 99 ? '99+' : count;
        badge.style.display = 'block';
        badge.style.animation = 'pulse 2s infinite';
    } else {
        badge.style.display = 'none';
    }
}

// Toggle modal de notificaciones
window.toggleNotifications = async function() {
    if (notificationsVisible) {
        closeNotifications();
    } else {
        await showNotifications();
    }
}

// Mostrar modal de notificaciones
async function showNotifications() {
    const modal = document.createElement('div');
    modal.className = 'notifications-modal';
    modal.id = 'notificationsModal';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>🔔 Notificaciones</h3>
                <div class="modal-actions">
                    <button class="btn btn-small btn-secondary" onclick="markAllAsRead()">
                        ✅ Marcar todas
                    </button>
                    <button class="close-modal" onclick="closeNotifications()">&times;</button>
                </div>
            </div>
            <div class="modal-body" id="notificationsContent">
                <div class="loading-state">
                    <div class="loading-spinner"></div>
                    <p>Cargando notificaciones...</p>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    notificationsVisible = true;

    try {
        const response = await fetchWithAuth('/api/notifications?limit=20');
        if (!response || !response.ok) throw new Error('Error cargando notificaciones');
        
        const data = await response.json();
        displayNotifications(data.notifications, data.unread_count);
        
    } catch (error) {
        console.error('❌ Error:', error);
        document.getElementById('notificationsContent').innerHTML = `
            <div class="error-state">
                <div class="error-icon">⚠️</div>
                <p>Error cargando notificaciones</p>
            </div>
        `;
    }
}

// Mostrar lista de notificaciones
function displayNotifications(notifications, unreadCount) {
    const contentDiv = document.getElementById('notificationsContent');
    
    if (!notifications || notifications.length === 0) {
        contentDiv.innerHTML = `
            <div class="no-notifications">
                <div class="no-notifications-icon">🔕</div>
                <p>No tienes notificaciones</p>
                <small>Te avisaremos cuando haya novedades</small>
            </div>
        `;
        return;
    }

    const notificationsHTML = notifications.map(notif => {
        const isUnread = !notif.is_read;
        const timeAgo = getTimeAgo(notif.created_at);
        const icon = getNotificationIcon(notif.type);
        
        return `
            <div class="notification-item ${isUnread ? 'unread' : 'read'}" data-id="${notif.id}">
                <div class="notification-icon">${icon}</div>
                <div class="notification-content">
                    <div class="notification-title">${notif.title}</div>
                    <div class="notification-message">${notif.message}</div>
                    <div class="notification-time">${timeAgo}</div>
                </div>
                ${isUnread ? '<div class="unread-indicator"></div>' : ''}
            </div>
        `;
    }).join('');

    contentDiv.innerHTML = `
        <div class="notifications-list">
            ${notificationsHTML}
        </div>
    `;

}

// Marcar una notificación individual como leída - MÁS SEGURA
window.markSingleAsRead = async function(notificationId) {
    try {
        console.log('🔄 Marcando notificación como leída:', notificationId);
        
        const response = await fetchWithAuth('/api/notifications/mark-read', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ notification_ids: [notificationId] })
        });

        if (response && response.ok) {
            // Actualizar UI inmediatamente
            const item = document.querySelector(`[data-id="${notificationId}"]`);
            if (item) {
                item.classList.remove('unread');
                item.classList.add('read');
                const indicator = item.querySelector('.unread-indicator');
                const actions = item.querySelector('.notification-actions');
                if (indicator) indicator.remove();
                if (actions) actions.remove();
            }
            
            // Actualizar contador
            const newUnreadCount = Math.max(0, unreadCount - 1);
            updateNotificationsBadge(newUnreadCount);
            
            console.log('✅ Notificación marcada como leída');
        } else {
            console.warn('⚠️ Error marcando notificación, pero no redirigiendo');
        }
    } catch (error) {
        console.error('❌ Error marcando como leída:', error);
        // NO redirigir al login, solo mostrar un mensaje discreto
        showTemporaryMessage('⚠️ Error al marcar notificación');
    }
}


// Obtener icono según tipo de notificación
function getNotificationIcon(type) {
    const icons = {
        'match_starting': '⏰',
        'result_updated': '📊',
        'position_change': '📈',
        'tournament_update': '🏆',
        'system': '🔧'
    };
    return icons[type] || '🔔';
}

// Calcular tiempo transcurrido
function getTimeAgo(dateString) {
    const now = new Date();
    const date = new Date(dateString);
    const diffInMinutes = Math.floor((now - date) / (1000 * 60));
    
    if (diffInMinutes < 1) return 'Ahora mismo';
    if (diffInMinutes < 60) return `${diffInMinutes}m`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h`;
    return `${Math.floor(diffInMinutes / 1440)}d`;
}

// Marcar notificaciones como leídas
async function markAsRead(notificationIds) {
    try {
        const response = await fetchWithAuth('/api/notifications/mark-read', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ notification_ids: notificationIds })
        });

        if (response && response.ok) {
            // Actualizar UI
            notificationIds.forEach(id => {
                const item = document.querySelector(`[data-id="${id}"]`);
                if (item) {
                    item.classList.remove('unread');
                    item.classList.add('read');
                    const indicator = item.querySelector('.unread-indicator');
                    if (indicator) indicator.remove();
                }
            });
            
            // Actualizar contador
            const newUnreadCount = Math.max(0, unreadCount - notificationIds.length);
            updateNotificationsBadge(newUnreadCount);
        }
    } catch (error) {
        console.error('❌ Error marcando como leída:', error);
    }
}

// Marcar todas como leídas
window.markAllAsRead = async function() {
    try {
        const response = await fetchWithAuth('/api/notifications/mark-all-read', {
            method: 'POST'
        });

        if (response && response.ok) {
            // Actualizar UI
            document.querySelectorAll('.notification-item.unread').forEach(item => {
                item.classList.remove('unread');
                item.classList.add('read');
                const indicator = item.querySelector('.unread-indicator');
                if (indicator) indicator.remove();
            });
            
            updateNotificationsBadge(0);
            
            // Mostrar mensaje de confirmación
            showTemporaryMessage('✅ Todas las notificaciones marcadas como leídas');
        }
    } catch (error) {
        console.error('❌ Error marcando todas como leídas:', error);
    }
}

// Cerrar modal de notificaciones
window.closeNotifications = function() {
    const modal = document.getElementById('notificationsModal');
    if (modal) {
        modal.remove();
        notificationsVisible = false;
    }
}

// Mostrar mensaje temporal
function showTemporaryMessage(message) {
    const toast = document.createElement('div');
    toast.className = 'toast-message';
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('show');
    }, 100);
    
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Verificar notificaciones periódicamente
function startNotificationsPolling() {
    // Verificar cada 2 minutos
    setInterval(loadNotifications, 2 * 60 * 1000);
}


// --- FUNCIÓN DE UTILIDAD (¡AHORA DEFINIDA!) ---
// En dashboard.js, mejora fetchWithAuth:
async function fetchWithAuth(url, options = {}) {
    const token = localStorage.getItem('token');
    
    if (!token) {
        console.warn('⚠️ No hay token, pero no redirigiendo automáticamente');
        return null;
    }

    // ✅ MEJORA: Configurar headers por defecto más completos
    const defaultHeaders = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'  // ← AGREGAR POR DEFECTO
    };

    const config = {
        ...options,
        headers: {
            ...defaultHeaders,
            ...options.headers  // Los headers específicos sobrescriben los por defecto
        }
    };

    try {
        const response = await fetch(url, config);
        
        // Solo redirigir a login si es una petición crítica y realmente no autorizada
        if (response.status === 401) {
            console.warn('⚠️ Token inválido o expirado');
            
            // Solo redirigir si no es una petición de notificaciones
            if (!url.includes('/notifications')) {
                localStorage.removeItem('token');
                localStorage.removeItem('user');
                window.location.href = '/login.html';
            }
            return null;
        }
        
        return response;
    } catch (error) {
        console.error('❌ Error en fetchWithAuth:', error);
        return null;
    }
}



// --- FUNCIONES DE CARGA Y VISUALIZACIÓN ---

function checkAccountStatus(user) {
    const statusBanner = document.getElementById('accountStatus');
    if (!user.is_active) {
        statusBanner.className = 'status-banner inactive';
        statusBanner.innerHTML = `<strong>⏳ Cuenta Pendiente de Activación</strong>`;
        disableFeaturesForInactiveUser();
    } else {
        statusBanner.className = 'status-banner active';
        statusBanner.innerHTML = `<strong>✅ ¡Tu cuenta está activa!</strong>`;
    }
}

async function loadActiveTournament() {
    try {
        const response = await fetchWithAuth('/api/admin/active-tournament');
        if (!response || !response.ok) throw new Error('No se pudo contactar al servidor.');
        const data = await response.json();
        
        if (data.active_tournament) {
            displayActiveTournament(data.active_tournament);

            // ✨ AÑADIR LÓGICA DE REGLAS AQUÍ
            const tournament = data.active_tournament;
            currentTournamentRules = tournament.rules || '';
            
            // Mostrar/ocultar botón de reglas
            const rulesButton = document.getElementById('rulesButton');
            if (rulesButton) {
                if (currentTournamentRules && currentTournamentRules.trim() !== '') {
                    rulesButton.style.display = 'block';
                } else {
                    rulesButton.style.display = 'none';
                }
            }

            return data.active_tournament;
        } else {
            displayNoActiveTournament();

            // ✨ OCULTAR BOTÓN DE REGLAS SI NO HAY TORNEO
            const rulesButton = document.getElementById('rulesButton');
            if (rulesButton) {
                rulesButton.style.display = 'none';
            }

            return null;
        }



    } catch (error) {
        console.error('Error cargando torneo activo:', error);
        displayNoActiveTournament();

        // ✨ OCULTAR BOTÓN DE REGLAS EN CASO DE ERROR
        const rulesButton = document.getElementById('rulesButton');
        if (rulesButton) {
            rulesButton.style.display = 'none';
        }

        return null;
    }
}

function displayActiveTournament(tournament) {
    const container = document.getElementById('activeTournamentInfo');
    const tournamentName = tournament.name || "Torneo";
    const totalMatches = tournament.total_matches || 0;
    const finishedMatches = tournament.finished_matches || 0;
    const totalPredictions = tournament.total_predictions || 0;
    const progress = totalMatches > 0 ? Math.round((finishedMatches / totalMatches) * 100) : 0;
    container.innerHTML = `
        <div class="tournament-active-header"><h3>🏆 ${tournamentName}</h3><span class="tournament-status-badge active">ACTIVO</span></div>
        <div class="tournament-stats">
            <div class="tournament-stat"><span class="stat-label">Progreso</span><div class="progress-bar"><div class="progress-fill" style="width: ${progress}%;"></div></div><span class="stat-value">${finishedMatches}/${totalMatches} partidos</span></div>
            <div class="tournament-stat"><span class="stat-label">Predicciones</span><span class="stat-value">${totalPredictions}</span></div>
            <div class="tournament-stat"><span class="stat-label">Período</span><span class="stat-value">${formatSimpleDate(tournament.start_date)} - ${formatSimpleDate(tournament.end_date)}</span></div>
        </div>`;
}


// Muestra el mensaje de que no hay torneo activo
function displayNoActiveTournament() {
    document.getElementById('activeTournamentInfo').innerHTML = `<div class="no-active-tournament"><h3>⏸️ No hay torneo activo</h3><p>Las predicciones aparecerán aquí cuando se active un torneo.</p></div>`;
    document.getElementById('upcomingMatches').innerHTML = `<div class="no-data"><p>No hay torneo activo.</p></div>`;
    document.getElementById('myPredictions').innerHTML = `<div class="no-data"><p>No hay torneo activo.</p></div>`;
}

// Deshabilita secciones si el usuario no ha sido activado
function disableFeaturesForInactiveUser() {
    document.getElementById('upcomingMatches').innerHTML = `<div class="disabled-section"><p>Activa tu cuenta para ver y predecir partidos.</p></div>`;
    document.getElementById('myPredictions').innerHTML = `<div class="disabled-section"><p>Activa tu cuenta para ver tus predicciones.</p></div>`;
}


async function loadUserStats(userId) {
    try {
        const response = await fetchWithAuth(`/api/leaderboard/user/${userId}`);
        if (!response || !response.ok) return;
        const stats = await response.json();
        
        // Actualizar puntos
        document.getElementById('userPoints').textContent = stats.total_points || 0;
        
        // Actualizar posición con emoji y color
        const position = parseInt(stats.position) || 0; // ← AÑADIR parseInt()
        const medalEmoji = getMedalEmoji(position);
        const positionText = position > 0 ? `${medalEmoji}#${position}` : '#-';
        
        document.getElementById('userPosition').textContent = positionText;
        document.getElementById('totalParticipants').textContent = stats.total_participants || 0;
        
        // ✨ APLICAR COLORES SEGÚN LA POSICIÓN
        applyPositionColors(position);
        
        console.log(`🏆 Posición del usuario: ${position} - Color aplicado`);
        
    } catch (error) {
        console.error('Error cargando estadísticas del usuario:', error);
    }
}


async function loadLeaderboard() {
    const container = document.getElementById('leaderboardContainer');
    container.innerHTML = `<p>Cargando tabla...</p>`;
    try {
        const response = await fetchWithAuth('/api/leaderboard');
        if (!response || !response.ok) throw new Error('Error en respuesta del servidor');
        const leaderboard = await response.json();
        if (!leaderboard || leaderboard.length === 0) {
            container.innerHTML = `<div class="no-data"><p>Aún no hay participantes en el ranking.</p></div>`;
            return;
        }
        const top10 = leaderboard.slice(0, 10);
        
        // ✨ NUEVA LÓGICA: Construir HTML paso a paso
        let tableHTML = `
            <div class="leaderboard-header-row">
                <div class="pos">Pos.</div>
                <div class="name">Participante</div>
                <div class="points">Puntos</div>
            </div>
            <div class="leaderboard-table">`;
        
        // Procesar cada usuario individualmente
        top10.forEach(user => {
            const isCurrentUser = user.id == JSON.parse(localStorage.getItem('user')).id;
            const positionClass = user.position <= 3 ? 'top-three' : '';
            
            // ✨ CALCULAR EMOJI EXPLÍCITAMENTE - CONVERTIR A NÚMERO
            let medalEmoji = '';
            const position = parseInt(user.position); // ← ESTA ES LA CLAVE
            if (position === 1) medalEmoji = '🥇';
            else if (position === 2) medalEmoji = '🥈';
            else if (position === 3) medalEmoji = '🥉';

            console.log(`🏆 Usuario ${user.name} - Posición: ${position} (tipo: ${typeof position}) - Emoji: "${medalEmoji}"`);
            
            tableHTML += `
                <div class="leaderboard-row ${isCurrentUser ? 'current-user' : ''} ${positionClass}">
                    <div class="pos">${medalEmoji} #${user.position}</div>
                    <div class="name">${user.name}</div>
                    <div class="points"><strong>${user.total_points || 0}</strong> pts</div>
                </div>`;
        });
        
        tableHTML += `</div>`;
        container.innerHTML = tableHTML;
        
        console.log('✅ Tabla de liderazgo renderizada con emojis');
        
    } catch (error) {
        console.error('Error en loadLeaderboard:', error);
        container.innerHTML = `<div class="no-data"><p>Error al cargar la tabla.</p></div>`;
    }
}



// === NUEVA FUNCIÓN: Aplicar colores por posición ===
function applyPositionColors(position) {
    const positionElement = document.getElementById('userPosition');
    if (!positionElement) return;
    
    // Remover clases anteriores
    positionElement.classList.remove('position-gold', 'position-silver', 'position-bronze', 'position-default');
    
    // Aplicar clase según la posición
    switch(position) {
        case 1:
            positionElement.classList.add('position-gold');
            break;
        case 2:
            positionElement.classList.add('position-silver');
            break;
        case 3:
            positionElement.classList.add('position-bronze');
            break;
        default:
            positionElement.classList.add('position-default');
            break;
    }
}

// === NUEVA FUNCIÓN: Obtener emoji de medalla ===
function getMedalEmoji(position) {
    switch(position) {
        case 1: return '🥇';
        case 2: return '🥈';
        case 3: return '🥉';
        default: return '';
    }
}


// --- ¡NUEVAS FUNCIONES! ---

// NUEVA función loadUpcomingMatches con paginación
async function loadUpcomingMatches(page = 1, filter = 'all') {
    const container = document.getElementById('upcomingMatches');
    container.innerHTML = `<p>Cargando partidos...</p>`;
    
    try {
        console.log(`🔍 Cargando página ${page} con filtro ${filter}...`);
        
        const url = `/api/matches/upcoming?page=${page}&limit=${matchesPerPage}&filter=${filter}`;
        const response = await fetchWithAuth(url);
        
        if (!response || !response.ok) {
            console.error('❌ Error en respuesta:', response?.status);
            throw new Error(`HTTP ${response?.status || 'unknown'}`);
        }
        
        const data = await response.json();
        console.log('📊 Datos recibidos:', data);
        
        // Actualizar variables globales
        currentPage = page;
        currentFilter = filter;
        
        // Mostrar partidos y controles
        await displayUpcomingMatchesWithPagination(data);
        
    } catch (error) {
        console.error('❌ Error cargando próximos partidos:', error);
        container.innerHTML = `
            <div class="no-data">
                <p>No se pudieron cargar los partidos.</p>
                <button class="btn btn-secondary btn-small" onclick="loadUpcomingMatches()">
                    Reintentar
                </button>
            </div>
        `;
    }
}

// NUEVA función para mostrar partidos con paginación
async function displayUpcomingMatchesWithPagination(data) {
    const container = document.getElementById('upcomingMatches');
    const { matches, pagination, filter } = data;
    
    console.log('🎯 Mostrando partidos con paginación:', { 
        matches: matches.length, 
        pagination, 
        filter 
    });
    
    if (!matches || matches.length === 0) {
        container.innerHTML = `
            <div class="matches-header">
                ${createFilterControls(pagination.total, filter)}
            </div>
            <div class="no-data">
                <p>📅 ${filter === 'no-prediction' ? 'No hay partidos sin predicción' : 'No hay partidos programados'}.</p>
            </div>
        `;
        return;
    }

    try {
        // Cargar predicciones del usuario  
        // ✅ CÓDIGO CORREGIDO - Usar mismos parámetros que "Mis Predicciones"
        const allPredictionsParams = new URLSearchParams({
            page: 1,
            limit: 1000, // Obtener TODAS las predicciones del usuario
            status: 'all'
        });

        const predictionsResponse = await fetchWithAuth(`/api/predictions/user?${allPredictionsParams}`);
        let userPredictions = [];

        if (predictionsResponse && predictionsResponse.ok) {
            const data = await predictionsResponse.json();
            
            console.log('🔍 [PRÓXIMOS PARTIDOS] Predicciones cargadas:', data);
            
            // La API SIEMPRE devuelve formato: {predictions: [], pagination: {}}
            if (data && data.predictions && Array.isArray(data.predictions)) {
                userPredictions = data.predictions;
                console.log('✅ Total predicciones encontradas:', userPredictions.length);
            } else {
                console.warn('⚠️ Formato inesperado de predicciones:', data);
                userPredictions = [];
            }
        } else {
            console.error('❌ Error cargando predicciones para próximos partidos');
        }

        
        console.log('🔍 Predicciones finales:', userPredictions.length);
        
        const predictionsMap = new Map();
        if (Array.isArray(userPredictions) && userPredictions.length > 0) {
            userPredictions.forEach(p => {
                if (p.match_id) {
                    predictionsMap.set(p.match_id, p);
                    console.log(`🔍 [MAPEO] ${p.match_id} -> ${p.predicted_home_score}-${p.predicted_away_score}`);
                }
            });
        } else {
            console.warn('⚠️ No hay predicciones para mapear');
        }

        console.log('📊 [RESUMEN] Predicciones mapeadas:', predictionsMap.size);
        console.log('📊 [RESUMEN] Partidos a mostrar:', matches.length);



        // Generar HTML
        const headerHTML = `
            <div class="matches-header">
                <h3>⚽ Próximos Partidos</h3>
                ${createFilterControls(pagination.total, filter)}
                ${createPaginationInfo(pagination)}
            </div>
        `;

        const matchesHTML = matches.map(match => {
        const prediction = predictionsMap.get(match.id);
        const hasPrediction = !!prediction;
        
        return `
            <div class="match-card" data-match-id="${match.id}">
                <div class="match-info">
                    <div class="phase-info">
                        <small>📋 ${match.phase_name} - ${match.tournament_name}</small>
                    </div>
                    <div class="match-date">${formatFullDate(match.match_date)}</div>
                    <div class="teams">
                        <div class="team">
                            ${match.home_team_logo ? 
                                `<img src="${match.home_team_logo}" alt="${match.home_team}" class="team-logo" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                                <div class="team-logo-placeholder" style="display:none;">⚽</div>` 
                                : '<div class="team-logo-placeholder">⚽</div>'
                            }
                            <span class="team-name">${match.home_team}</span>
                        </div>
                        <span class="vs">vs</span>
                        <div class="team">
                            ${match.away_team_logo ? 
                                `<img src="${match.away_team_logo}" alt="${match.away_team}" class="team-logo" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                                <div class="team-logo-placeholder" style="display:none;">⚽</div>` 
                                : '<div class="team-logo-placeholder">⚽</div>'
                            }
                            <span class="team-name">${match.away_team}</span>
                        </div>
                    </div>
                    ${hasPrediction ? `
                        <div class="existing-prediction">
                            <small>✅ Tu pronóstico: ${prediction.predicted_home_score} - ${prediction.predicted_away_score}</small>
                        </div>
                    ` : `
                        <div class="no-prediction">
                            <small>⏳ Sin pronóstico</small>
                        </div>
                    `}
                </div>
                <div class="match-actions">
                    <button class="btn ${hasPrediction ? 'btn-secondary' : 'btn-primary'} btn-small" 
                            onclick="showPredictionForm('${match.id}', '${match.home_team}', '${match.away_team}', ${hasPrediction ? `'${prediction.predicted_home_score}', '${prediction.predicted_away_score}'` : 'null, null'})">
                        ${hasPrediction ? 'Editar' : 'Predecir'}
                    </button>
                </div>
            </div>
        `;
    }).join('');

        const paginationHTML = createPaginationControls(pagination);

        container.innerHTML = headerHTML + matchesHTML + paginationHTML;
        console.log('✅ Partidos con paginación renderizados exitosamente');
        
    } catch (error) {
        console.error('❌ Error renderizando partidos:', error);
        container.innerHTML = `<div class="no-data"><p>Error mostrando partidos</p></div>`;
    }
}

// Crear controles de filtro
function createFilterControls(total, currentFilter) {
    return `
        <div class="filter-controls">
            <div class="filter-buttons">
                <button class="btn btn-small ${currentFilter === 'all' ? 'btn-primary' : 'btn-secondary'}" 
                        onclick="changeFilter('all')">
                    Todos (${total})
                </button>
                <button class="btn btn-small ${currentFilter === 'no-prediction' ? 'btn-primary' : 'btn-secondary'}" 
                        onclick="changeFilter('no-prediction')">
                    Sin predicción
                </button>
            </div>
        </div>
    `;
}

// Crear información de paginación
function createPaginationInfo(pagination) {
    const start = ((pagination.page - 1) * pagination.limit) + 1;
    const end = Math.min(pagination.page * pagination.limit, pagination.total);
    
    return `
        <div class="pagination-info">
            <small>Mostrando ${start}-${end} de ${pagination.total} partidos</small>
        </div>
    `;
}

// Crear controles de paginación
function createPaginationControls(pagination) {
    if (pagination.totalPages <= 1) return '';
    
    return `
        <div class="pagination-controls">
            <button class="btn btn-secondary btn-small" 
                    ${!pagination.hasPrevious ? 'disabled' : ''} 
                    onclick="changePage(${pagination.page - 1})">
                « Anterior
            </button>
            
            <span class="page-info">
                Página ${pagination.page} de ${pagination.totalPages}
            </span>
            
            <button class="btn btn-secondary btn-small" 
                    ${!pagination.hasNext ? 'disabled' : ''} 
                    onclick="changePage(${pagination.page + 1})">
                Siguiente »
            </button>
        </div>
    `;
}

// Funciones de navegación
window.changePage = function(page) {
    if (page >= 1) {
        loadUpcomingMatches(page, currentFilter);
    }
};

window.changeFilter = function(filter) {
    loadUpcomingMatches(1, filter); // Volver a página 1 al cambiar filtro
};




// En dashboard.js, reemplaza displayUpcomingMatches:
async function displayUpcomingMatches(matches) {
    const container = document.getElementById('upcomingMatches');
    
    console.log('🎯 displayUpcomingMatches llamada con:', matches);
    console.log('🎯 Es array?', Array.isArray(matches));
    console.log('🎯 Longitud:', matches?.length);
    
    // VALIDACIÓN ROBUSTA
    if (!matches || !Array.isArray(matches) || matches.length === 0) {
        container.innerHTML = `<div class="no-data"><p>📅 No hay partidos programados por el momento.</p></div>`;
        return;
    }

    try {
        // Cargar predicciones del usuario
        const predictionsResponse = await fetchWithAuth('/api/predictions/user');
        const userPredictions = predictionsResponse && predictionsResponse.ok ? 
            await predictionsResponse.json() : [];
        
        const predictionsMap = new Map();
        if (Array.isArray(userPredictions)) {
            userPredictions.forEach(p => predictionsMap.set(p.match_id, p));
        }

        const matchesHTML = matches.map(match => {
            const prediction = predictionsMap.get(match.id);
            const hasPrediction = !!prediction;
            
            return `
                <div class="match-card" data-match-id="${match.id}">
                    <div class="match-info">
                        <div class="teams">
                            <span class="team">${match.home_team}</span> 
                            <span class="vs">vs</span> 
                            <span class="team">${match.away_team}</span>
                        </div>
                        <div class="match-date">${formatFullDate(match.match_date)}</div>
                        <div class="phase-info">
                            <small>📋 ${match.phase_name} - ${match.tournament_name}</small>
                        </div>
                        ${hasPrediction ? `
                            <div class="existing-prediction">
                                <small>Tu predicción: ${prediction.predicted_home_score} - ${prediction.predicted_away_score}</small>
                            </div>
                        ` : ''}
                    </div>
                    <div class="match-actions">
                        <button class="btn ${hasPrediction ? 'btn-secondary' : 'btn-primary'} btn-small" 
                                onclick="showPredictionForm('${match.id}', '${match.home_team}', '${match.away_team}', ${hasPrediction ? `'${prediction.predicted_home_score}', '${prediction.predicted_away_score}'` : 'null, null'})">
                            ${hasPrediction ? 'Editar' : 'Predecir'}
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = matchesHTML;
        console.log('✅ Partidos renderizados exitosamente');
        
    } catch (error) {
        console.error('❌ Error renderizando partidos:', error);
        container.innerHTML = `<div class="no-data"><p>Error mostrando partidos</p></div>`;
    }
}


// ============= GESTIÓN DE PREDICCIONES CON PAGINACIÓN =============

async function loadUserPredictions(page = 1, filter = 'all') {
    const container = document.getElementById('myPredictions');
    
    // Mostrar loading
    container.innerHTML = `
        <div class="loading-state">
            <div class="loading-spinner"></div>
            <p>Cargando tus predicciones...</p>
        </div>
    `;
    
    try {
        console.log(`📊 Cargando predicciones - Página: ${page}, Filtro: ${filter}`);
        
        // Construir URL con parámetros
        const params = new URLSearchParams({
            page: page,
            limit: predictionsPerPage,
            status: filter
        });
        
        const response = await fetchWithAuth(`/api/predictions/user?${params}`);
        
        if (!response) return;

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Error del servidor');
        }
        
        const data = await response.json();
        console.log('📊 Datos de predicciones recibidos:', data);
        
        // Actualizar variables globales
        currentPredictionsPage = page;
        currentPredictionsFilter = filter;
        
        // Mostrar predicciones con paginación
        displayUserPredictionsWithPagination(data);
        
    } catch (error) {
        console.error('❌ Error cargando predicciones:', error);
        container.innerHTML = `
            <div class="error-state">
                <div class="error-icon">⚠️</div>
                <p>Error cargando tus predicciones</p>
                <button class="btn btn-secondary btn-small" onclick="loadUserPredictions()">
                    🔄 Reintentar
                </button>
            </div>
        `;
    }
}

function displayUserPredictionsWithPagination(data) {
    const container = document.getElementById('myPredictions');
    const { predictions, pagination, filters } = data;
    
    console.log('🎯 Mostrando predicciones con paginación:', {
        predictions: predictions.length,
        pagination,
        filters
    });
    
    if (!predictions || predictions.length === 0) {
        container.innerHTML = `
            <div class="predictions-header">
                <h3>📝 Mis Predicciones</h3>
                ${createPredictionsFilterControls(pagination?.totalPredictions || 0, filters.status)}
            </div>
            <div class="no-data">
                <p>📝 ${filters.status === 'pending' ? 'No tienes predicciones pendientes' : 
                    filters.status === 'finished' ? 'No tienes predicciones finalizadas' : 
                    'Aún no has hecho predicciones'}</p>
                <small>Tus predicciones aparecerán aquí cuando predecir partidos.</small>
            </div>
        `;
        return;
    }

    // Generar HTML
    const headerHTML = `
        <div class="predictions-header">
            <h3>📝 Mis Predicciones</h3>
            ${createPredictionsFilterControls(pagination.totalPredictions, filters.status)}
            ${createPredictionsPaginationInfo(pagination)}
        </div>
    `;

        const predictionsHTML = predictions.map(p => {
        const isFinished = p.status === 'finished';
        const pointsEarned = p.points_earned || 0;
        const hasPoints = isFinished && pointsEarned > 0;
        
        return `
            <div class="prediction-card ${isFinished ? 'finished' : 'pending'} ${hasPoints ? 'has-points' : ''}">
                <div class="prediction-match">
                    <div class="phase-info">
                        <small>📋 ${p.phase_name || 'Sin fase'} - ${p.tournament_name || 'Sin torneo'}</small>
                    </div>
                    <div class="match-date">
                        <small>${formatFullDate(p.match_date)}</small>
                    </div>
                    <div class="match-teams">
                        <div class="team">
                            ${p.home_team_logo ? 
                                `<img src="${p.home_team_logo}" alt="${p.home_team}" class="team-logo" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                                <div class="team-logo-placeholder" style="display:none;">⚽</div>` 
                                : '<div class="team-logo-placeholder">⚽</div>'
                            }
                            <span class="team-name">${p.home_team}</span>
                        </div>
                        <span class="vs">vs</span>
                        <div class="team">
                            ${p.away_team_logo ? 
                                `<img src="${p.away_team_logo}" alt="${p.away_team}" class="team-logo" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                                <div class="team-logo-placeholder" style="display:none;">⚽</div>` 
                                : '<div class="team-logo-placeholder">⚽</div>'
                            }
                            <span class="team-name">${p.away_team}</span>
                        </div>
                    </div>
                </div>
                
                <div class="prediction-details">
                    <div class="prediction-score">
                        <span class="prediction-label">Tu pronóstico:</span>
                        <span class="prediction-value">${p.predicted_home_score} - ${p.predicted_away_score}</span>
                    </div>
                    
                    ${isFinished ? `
                        <div class="actual-result">
                            <span class="result-label">Resultado:</span>
                            <span class="result-value">${p.actual_home_score} - ${p.actual_away_score}</span>
                        </div>
                    ` : ''}
                    
                    <div class="prediction-points">
                        ${isFinished ? `
                            <span class="points-earned ${hasPoints ? 'positive' : 'zero'}">
                                ${pointsEarned} pts
                            </span>
                        ` : `
                            <span class="status-pending">Pendiente</span>
                        `}
                    </div>
                </div>
                
                ${isFinished ? `
                    <div class="prediction-actions">
                        <button class="btn btn-secondary btn-small" onclick="showMatchPredictions('${p.match_id}')">
                            👥 Ver Predicciones
                        </button>
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');

    const paginationHTML = createPredictionsPaginationControls(pagination);

    container.innerHTML = headerHTML + predictionsHTML + paginationHTML;
    console.log('✅ Predicciones con paginación renderizadas exitosamente');
}

// Crear controles de filtro para predicciones
function createPredictionsFilterControls(total, currentFilter) {
    return `
        <div class="filter-controls">
            <div class="filter-buttons">
                <button class="btn btn-small ${currentFilter === 'all' ? 'btn-primary' : 'btn-secondary'}" 
                        onclick="changePredictionsFilter('all')">
                    Todas (${total})
                </button>
                <button class="btn btn-small ${currentFilter === 'pending' ? 'btn-primary' : 'btn-secondary'}" 
                        onclick="changePredictionsFilter('pending')">
                    Pendientes
                </button>
                <button class="btn btn-small ${currentFilter === 'finished' ? 'btn-primary' : 'btn-secondary'}" 
                        onclick="changePredictionsFilter('finished')">
                    Finalizadas
                </button>
            </div>
        </div>
    `;
}

// Crear información de paginación para predicciones
function createPredictionsPaginationInfo(pagination) {
    return `
        <div class="pagination-info">
            <small>Mostrando ${pagination.startIndex}-${pagination.endIndex} de ${pagination.totalPredictions} predicciones</small>
        </div>
    `;
}

// Crear controles de paginación para predicciones
function createPredictionsPaginationControls(pagination) {
    if (pagination.totalPages <= 1) return '';
    
    return `
        <div class="pagination-controls">
            <button class="btn btn-secondary btn-small" 
                    ${!pagination.hasPrevious ? 'disabled' : ''} 
                    onclick="changePredictionsPage(${pagination.currentPage - 1})">
                « Anterior
            </button>
            
            <span class="page-info">
                Página ${pagination.currentPage} de ${pagination.totalPages}
            </span>
            
            <button class="btn btn-secondary btn-small" 
                    ${!pagination.hasNext ? 'disabled' : ''} 
                    onclick="changePredictionsPage(${pagination.currentPage + 1})">
                Siguiente »
            </button>
        </div>
    `;
}

// Funciones de navegación para predicciones
window.changePredictionsPage = function(page) {
    if (page >= 1) {
        loadUserPredictions(page, currentPredictionsFilter);
    }
};

window.changePredictionsFilter = function(filter) {
    loadUserPredictions(1, filter); // Volver a página 1 al cambiar filtro
};


// --- FIN NUEVAS FUNCIONES ---

function disableFeaturesForInactiveUser() {
    document.getElementById('upcomingMatches').innerHTML = `<div class="disabled-section"><p>Activa tu cuenta para ver y predecir partidos.</p></div>`;
    document.getElementById('myPredictions').innerHTML = `<div class="disabled-section"><p>Activa tu cuenta para ver tus predicciones.</p></div>`;
}

function formatSimpleDate(dateString) {
    if (!dateString) return "Fecha inválida";
    
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('es-CO', { 
            month: 'short', 
            day: 'numeric',
            timeZone: 'America/Bogota'
        });
    } catch (error) {
        return "Fecha inválida";
    }
}

function formatFullDate(dateString) {
    if (!dateString) return "Fecha inválida";
    
    try {
        const date = new Date(dateString);
        return date.toLocaleString('es-CO', { 
            dateStyle: 'medium', 
            timeStyle: 'short',
            timeZone: 'America/Bogota'
        });
    } catch (error) {
        return "Fecha inválida";
    }
}

// Función para mostrar reglas del torneo
window.showTournamentRules = function() {
    if (!currentTournamentRules || currentTournamentRules.trim() === '') {
        showTemporaryMessage('📋 Este torneo no tiene reglas definidas');
        return;
    }

    const modal = document.createElement('div');
    modal.className = 'rules-modal';
    modal.innerHTML = `
        <div class="modal-content large">
            <div class="modal-header">
                <h3>📋 Reglas del Torneo</h3>
                <button class="close-modal" onclick="closeRulesModal()">&times;</button>
            </div>
            <div class="modal-body">
                <div class="rules-content">
                    ${formatRulesText(currentTournamentRules)}
                </div>
            </div>
            <div class="modal-actions">
                <button class="btn btn-primary" onclick="closeRulesModal()">
                    Entendido
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
}

// Formatear texto de reglas con saltos de línea y viñetas
function formatRulesText(rulesText) {
    if (!rulesText) return '<p>No hay reglas definidas para este torneo.</p>';
    
    // Convertir saltos de línea a <br>
    let formatted = rulesText.replace(/\n/g, '<br>');
    
    // Convertir viñetas • en elementos de lista
    formatted = formatted.replace(/•\s*([^<br>]+)/g, '<li>$1</li>');
    
    // Si hay elementos de lista, envolverlos en <ul>
    if (formatted.includes('<li>')) {
        formatted = formatted.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
        // Limpiar <br> antes y después de listas
        formatted = formatted.replace(/<br>\s*<ul>/g, '<ul>');
        formatted = formatted.replace(/<\/ul>\s*<br>/g, '</ul>');
    }
    
    // Convertir párrafos (doble salto de línea)
    formatted = formatted.replace(/<br><br>/g, '</p><p>');
    formatted = '<p>' + formatted + '</p>';
    
    return formatted;
}

// Cerrar modal de reglas
window.closeRulesModal = function() {
    const modal = document.querySelector('.rules-modal');
    if (modal) {
        modal.remove();
    }
}

window.logout = function() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/index.html';
}

window.showPredictionForm = function(matchId, homeTeam, awayTeam, homeScore, awayScore) {
    closePredictionModal(); // Cierra cualquier modal abierto
    const modal = document.createElement('div');
    modal.className = 'prediction-modal';
    modal.innerHTML = `
    <div class="modal-content">
        <div class="modal-header"><h3>Hacer Predicción</h3><button class="close-modal" onclick="closePredictionModal()">&times;</button></div>
        <div class="modal-body">
            <div class="match-title"><strong>${homeTeam} vs ${awayTeam}</strong></div>
            <form id="predictionForm" onsubmit="submitPrediction(event, '${matchId}')">
                <div class="score-inputs">
                    <div class="score-input"><label>${homeTeam}</label><input type="number" name="homeScore" min="0" max="20" value="${homeScore !== 'null' ? homeScore : 0}" required></div>
                    <div class="score-separator">-</div>
                    <div class="score-input"><label>${awayTeam}</label><input type="number" name="awayScore" min="0" max="20" value="${awayScore !== 'null' ? awayScore : 0}" required></div>
                </div>
                <div class="modal-actions">
                    <button type="button" class="btn btn-secondary" onclick="closePredictionModal()">Cancelar</button>
                    <button type="submit" class="btn btn-primary">Guardar</button>
                </div>
            </form>
        </div>
    </div>`;
    document.body.appendChild(modal);
}

window.closePredictionModal = function() {
    const modal = document.querySelector('.prediction-modal');
    if (modal) modal.remove();
}

// En dashboard.js, reemplaza submitPrediction:
// En dashboard.js, reemplaza submitPrediction:
window.submitPrediction = async function(event, matchId) {
    event.preventDefault();
    
    const form = event.target;
    const submitButton = form.querySelector('button[type="submit"]');
    const homeScore = form.querySelector('input[name="homeScore"]').value;
    const awayScore = form.querySelector('input[name="awayScore"]').value;

    // Validaciones del cliente
    if (homeScore < 0 || awayScore < 0) {
        alert('Los goles no pueden ser negativos');
        return;
    }

    if (homeScore > 20 || awayScore > 20) {
        alert('Marcador muy alto, verifica los datos');
        return;
    }

    try {
        submitButton.disabled = true;
        submitButton.textContent = 'Guardando...';

        const payload = {
            match_id: matchId,
            predicted_home_score: parseInt(homeScore),
            predicted_away_score: parseInt(awayScore)
        };

        console.log('🎯 Enviando predicción:', payload);

        // ✅ CORRECCIÓN: Agregar explícitamente Content-Type
        const response = await fetchWithAuth('/api/predictions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'  // ← ESTA ERA LA LÍNEA FALTANTE
            },
            body: JSON.stringify(payload)
        });

        if (!response) {
            alert('Error de conexión');
            return;
        }

        const responseData = await response.json();
        console.log('📊 Respuesta del servidor:', responseData);

        if (response.ok) {
            alert('¡Predicción guardada exitosamente!');
            closePredictionModal();
            
            // Recargar datos con paginación actual
            await loadUpcomingMatches(currentPage, currentFilter);
            await loadUserPredictions(currentPredictionsPage, currentPredictionsFilter);
        } else {
            console.error('❌ Error del servidor:', responseData);
            alert(`Error: ${responseData.error || 'Error desconocido'}`);
        }

    } catch (error) {
        console.error('❌ Error enviando predicción:', error);
        alert('Error de conexión: ' + error.message);
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = 'Guardar';
    }
}



// --- PEGA ESTAS FUNCIONES AL FINAL DE public/dashboard.js ---

window.showFullLeaderboard = async function() {
    const modal = document.createElement('div');
    modal.className = 'leaderboard-modal';
    modal.innerHTML = `
        <div class="modal-content large">
            <div class="modal-header">
                <h3>🏆 Tabla de Posiciones Completa</h3>
                <button class="close-modal" onclick="closeLeaderboardModal()">&times;</button>
            </div>
            <div class="modal-body" id="fullLeaderboardContent">
                <p>Cargando tabla completa...</p>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    try {
        const response = await fetchWithAuth('/api/leaderboard/full');
        if (!response || !response.ok) throw new Error('Error al cargar la tabla completa.');

        const leaderboardData = await response.json();
        const currentUserId = JSON.parse(localStorage.getItem('user')).id;
        
        const contentDiv = document.getElementById('fullLeaderboardContent');
        
        if (!leaderboardData || leaderboardData.length === 0) {
            contentDiv.innerHTML = `<div class="no-data"><p>No hay datos en la tabla de posiciones.</p></div>`;
            return;
        }

        // ✨ NUEVA LÓGICA: Construir HTML paso a paso
        let tableHTML = `
            <div class="leaderboard-table full">
                <div class="leaderboard-header-row">
                    <div class="pos">Pos.</div>
                    <div class="name">Participante</div>
                    <div class="predictions">Aciertos</div>
                    <div class="points">Puntos</div>
                </div>`;
        
        leaderboardData.forEach(user => {
            const isCurrentUser = user.id == currentUserId;
            const isTop3 = user.position <= 3;
            
            // ✨ CALCULAR EMOJI EXPLÍCITAMENTE - CONVERTIR A NÚMERO
            let medalEmoji = '';
            const position = parseInt(user.position); // ← AÑADIR ESTA LÍNEA
            if (position === 1) medalEmoji = '🥇';
            else if (position === 2) medalEmoji = '🥈';
            else if (position === 3) medalEmoji = '🥉';
            
            tableHTML += `
                <div class="leaderboard-row ${isCurrentUser ? 'current-user' : ''} ${isTop3 ? 'top-three' : ''}">
                    <div class="pos">${medalEmoji} #${user.position}</div>
                    <div class="name">${user.name} ${isCurrentUser ? '<span class="you-badge">TÚ</span>' : ''}</div>
                    <div class="predictions">${user.successful_predictions}/${user.total_predictions}</div>
                    <div class="points"><strong>${user.total_points}</strong></div>
                </div>`;
        });
        
        tableHTML += `</div>`;
        contentDiv.innerHTML = tableHTML;
        
    } catch (error) {
        console.error('Error en showFullLeaderboard:', error);
        document.getElementById('fullLeaderboardContent').innerHTML = `<div class="no-data"><p>No se pudo cargar la tabla.</p></div>`;
    }
}

// === FUNCIONES PARA VER PREDICCIONES DE OTROS USUARIOS ===

window.showMatchPredictions = async function(matchId) {
    console.log(`🔍 Cargando predicciones del partido ${matchId}...`);
    
    const modal = document.createElement('div');
    modal.className = 'predictions-modal';
    modal.innerHTML = `
        <div class="modal-content large">
            <div class="modal-header">
                <h3>👥 Predicciones del Partido</h3>
                <button class="close-modal" onclick="closePredictionsModal()">&times;</button>
            </div>
            <div class="modal-body" id="matchPredictionsContent">
                <div class="loading-state">
                    <div class="loading-spinner"></div>
                    <p>Cargando predicciones...</p>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    try {
        const response = await fetchWithAuth(`/api/predictions/match/${matchId}`);
        
        if (!response || !response.ok) {
            throw new Error('Error al cargar las predicciones');
        }

        const data = await response.json();
        displayMatchPredictions(data);
        
    } catch (error) {
        console.error('❌ Error cargando predicciones:', error);
        document.getElementById('matchPredictionsContent').innerHTML = `
            <div class="error-state">
                <div class="error-icon">⚠️</div>
                <p>Error cargando predicciones</p>
                <small>${error.message}</small>
            </div>
        `;
    }
}

function displayMatchPredictions(data) {
    const { match, predictions, statistics, current_user_id } = data;
    const contentDiv = document.getElementById('matchPredictionsContent');
    
    if (!predictions || predictions.length === 0) {
        contentDiv.innerHTML = `
            <div class="no-data">
                <p>No hay predicciones para este partido</p>
            </div>
        `;
        return;
    }

    contentDiv.innerHTML = `
        <div class="match-info-header">
            <div class="match-title">
                <h4>${match.home_team} ${match.home_score} - ${match.away_score} ${match.away_team}</h4>
                <small>${match.phase_name} - ${match.tournament_name}</small>
            </div>
            <div class="match-stats">
                <div class="stat-item">
                    <span class="stat-number">${statistics.total_predictions}</span>
                    <span class="stat-label">Predicciones</span>
                </div>
                <div class="stat-item">
                    <span class="stat-number">${statistics.exact_matches}</span>
                    <span class="stat-label">Exactas</span>
                </div>
                <div class="stat-item">
                    <span class="stat-number">${statistics.result_matches}</span>
                    <span class="stat-label">Resultado</span>
                </div>
                <div class="stat-item">
                    <span class="stat-number">${statistics.exact_percentage}%</span>
                    <span class="stat-label">Precisión</span>
                </div>
            </div>
        </div>

        <div class="predictions-table">
            <div class="table-header">
                <div class="col-position">#</div>
                <div class="col-user">Participante</div>
                <div class="col-prediction">Predicción</div>
                <div class="col-accuracy">Resultado</div>
                <div class="col-points">Puntos</div>
            </div>
            ${predictions.map((pred, index) => {
                const isCurrentUser = pred.user_id == current_user_id;
                const accuracyClass = pred.prediction_accuracy;
                const accuracyText = {
                    'exact': '🎯 Exacto',
                    'result': '✅ Resultado',
                    'miss': '❌ Falló'
                }[pred.prediction_accuracy];
                
                return `
                    <div class="table-row ${isCurrentUser ? 'current-user' : ''} accuracy-${accuracyClass}">
                        <div class="col-position">
                            ${pred.points_earned > 0 ? 
                                `<span class="position-medal">${index + 1}</span>` : 
                                `<span class="position-number">${index + 1}</span>`
                            }
                        </div>
                        <div class="col-user">
                            ${pred.user_name} ${isCurrentUser ? '<span class="you-badge">TÚ</span>' : ''}
                        </div>
                        <div class="col-prediction">
                            <span class="prediction-text">${pred.predicted_home_score} - ${pred.predicted_away_score}</span>
                        </div>
                        <div class="col-accuracy">
                            <span class="accuracy-badge accuracy-${accuracyClass}">${accuracyText}</span>
                        </div>
                        <div class="col-points">
                            <span class="points-display ${pred.points_earned > 0 ? 'positive' : 'zero'}">${pred.points_earned}</span>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

window.closePredictionsModal = function() {
    const modal = document.querySelector('.predictions-modal');
    if (modal) {
        modal.remove();
    }
}



window.closeLeaderboardModal = function() {
    const modal = document.querySelector('.leaderboard-modal');
    if (modal) {
        modal.remove();
    }
}
