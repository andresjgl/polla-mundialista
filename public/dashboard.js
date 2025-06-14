// public/dashboard.js - VERSIÓN LIMPIA Y CORREGIDA

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

    document.getElementById('userName').textContent = user.name || 'Usuario';

    // Cargar y mostrar estado de la cuenta (activo/pendiente)
    checkAccountStatus(user);

    // Cargar datos principales del dashboard
    const activeTournament = await loadActiveTournament();
    
    if (activeTournament) {
        await loadUserStats(user.id);
        await loadUpcomingMatches();
        await loadUserPredictions();
        await loadLeaderboard();
    }
});

// Función para manejar errores 401 (token expirado) de forma centralizada
async function fetchWithAuth(url, options = {}) {
    const token = localStorage.getItem('token');
    const defaultOptions = {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...options.headers
        },
        ...options
    };

    const response = await fetch(url, defaultOptions);

    if (response.status === 401) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        alert('Tu sesión ha expirado. Por favor, inicia sesión de nuevo.');
        window.location.href = '/login.html';
        return null; // Devuelve null para que la función que lo llamó se detenga
    }
    return response;
}

// Muestra si la cuenta está activa o pendiente
function checkAccountStatus(user) {
    const statusBanner = document.getElementById('accountStatus');
    if (!user.is_active) {
        statusBanner.className = 'status-banner inactive';
        statusBanner.innerHTML = `
            <strong>⏳ Cuenta Pendiente de Activación</strong><br>
            Tu cuenta debe ser activada por un administrador.
        `;
        disableFeaturesForInactiveUser();
    } else {
        statusBanner.className = 'status-banner active';
        statusBanner.innerHTML = `
            <strong>✅ Cuenta Activa</strong><br>
            ¡Ya puedes hacer predicciones!
        `;
    }
}

// Carga la información del torneo activo
async function loadActiveTournament() {
    try {
        const response = await fetch('/api/admin/active-tournament'); // Usamos la ruta de admin que ya existe
        if (!response.ok) throw new Error('No se pudo cargar el torneo');
        
        const data = await response.json();
        if (data.active_tournament) {
            displayActiveTournament(data.active_tournament);
            return data.active_tournament;
        } else {
            displayNoActiveTournament();
            return null;
        }
    } catch (error) {
        console.error('Error cargando torneo activo:', error);
        displayNoActiveTournament();
        return null;
    }
}

function displayActiveTournament(tournament) {
    const container = document.getElementById('activeTournamentInfo');
    const progress = tournament.total_matches > 0 ?
        Math.round((tournament.finished_matches / tournament.total_matches) * 100) : 0;

    container.innerHTML = `
        <div class="tournament-active-header">
            <h3>🏆 ${tournament.name}</h3>
            <span class="tournament-status-badge active">ACTIVO</span>
        </div>
        <div class="tournament-stats">
            <div class="tournament-stat">
                <span class="stat-label">Progreso</span>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${progress}%;"></div>
                </div>
                <span class="stat-value">${tournament.finished_matches}/${tournament.total_matches} partidos</span>
            </div>
            <div class="tournament-stat">
                <span class="stat-label">Predicciones totales</span>
                <span class="stat-value">${tournament.total_predictions}</span>
            </div>
            <div class="tournament-stat">
                <span class="stat-label">Período</span>
                <span class="stat-value">${formatSimpleDate(tournament.start_date)} - ${formatSimpleDate(tournament.end_date)}</span>
            </div>
        </div>
    `;
}

function displayNoActiveTournament() {
    const container = document.getElementById('activeTournamentInfo');
    container.innerHTML = `
        <div class="no-active-tournament">
            <h3>⏸️ No hay torneo activo</h3>
            <p>Las predicciones y puntuaciones aparecerán cuando se active un torneo.</p>
        </div>
    `;
    disableFeaturesForInactiveUser();
}

// Carga las estadísticas del usuario (puntos, posición)
async function loadUserStats(userId) {
    try {
        const response = await fetchWithAuth(`/api/leaderboard/user/${userId}`);
        if (!response || !response.ok) return;

        const stats = await response.json();
        document.getElementById('userPoints').textContent = stats.total_points || 0;
        document.getElementById('userPosition').textContent = `#${stats.position || '-'}`;
        document.getElementById('totalParticipants').textContent = stats.total_participants || 0;
    } catch (error) {
        console.error('Error cargando estadísticas del usuario:', error);
    }
}

// Carga la tabla de posiciones
async function loadLeaderboard() {
    const container = document.getElementById('leaderboardContainer');
    try {
        const response = await fetchWithAuth('/api/leaderboard');
        if (!response || !response.ok) {
             container.innerHTML = `<p>Error al cargar la tabla de posiciones.</p>`;
             return;
        }

        const leaderboard = await response.json();
        if (!leaderboard || leaderboard.length === 0) {
            container.innerHTML = `<p>Aún no hay participantes en el ranking.</p>`;
            return;
        }

        // Tomamos solo el top 5 para el dashboard
        const top5 = leaderboard.slice(0, 5);

        const leaderboardHTML = `
            <div class="leaderboard-table">
                ${top5.map(user => `
                    <div class="leaderboard-row">
                        <div class="pos">#${user.position}</div>
                        <div class="name">${user.name}</div>
                        <div class="points"><strong>${user.total_points}</strong> pts</div>
                    </div>
                `).join('')}
            </div>
        `;
        container.innerHTML = leaderboardHTML;

    } catch (error) {
        console.error('Error en loadLeaderboard:', error);
        container.innerHTML = `<p>Error de conexión al cargar la tabla.</p>`;
    }
}

// Carga los próximos partidos para predecir
async function loadUpcomingMatches() {
    // ... (el resto de funciones como loadUpcomingMatches, showPredictionForm, etc. irían aquí, pero las dejaremos para el siguiente paso para mantener esto corto)
}

// Carga las predicciones que ya hizo el usuario
async function loadUserPredictions() {
    // ...
}


// Deshabilita secciones si la cuenta no está activa o no hay torneo
function disableFeaturesForInactiveUser() {
    document.getElementById('upcomingMatches').innerHTML = `<div class="disabled-section"><p>Activa tu cuenta para ver y predecir partidos.</p></div>`;
    document.getElementById('myPredictions').innerHTML = `<div class="disabled-section"><p>Activa tu cuenta para ver tus predicciones.</p></div>`;
}

// Funciones de formato y utilidad
function formatSimpleDate(dateString) {
    if (!dateString) return "Fecha inválida";
    const date = new Date(dateString);
    return date.toLocaleDateString('es-ES', { month: 'long', day: 'numeric' });
}

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/index.html';
}
