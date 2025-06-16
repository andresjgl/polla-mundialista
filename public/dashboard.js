// public/dashboard.js - VERSIÓN FINAL CON LÓGICA DE CARGA CORREGIDA

let currentPage = 1;
let currentFilter = 'all';
const matchesPerPage = 10;

// ===== NUEVAS VARIABLES PARA PREDICCIONES =====
let currentPredictionsPage = 1;
let currentPredictionsFilter = 'all';
const predictionsPerPage = 10;


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
    
    checkAccountStatus(user);

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

    loadUpcomingMatches(1, 'all');

});

// --- FUNCIÓN DE UTILIDAD (¡AHORA DEFINIDA!) ---
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
        logout();
        return null;
    }
    return response;
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
        document.getElementById('userPoints').textContent = stats.total_points || 0;
        document.getElementById('userPosition').textContent = `#${stats.position || '-'}`;
        document.getElementById('totalParticipants').textContent = stats.total_participants || 0;
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
        const top5 = leaderboard.slice(0, 5);
        container.innerHTML = `<div class="leaderboard-table">${top5.map(user => `
            <div class="leaderboard-row ${user.id == JSON.parse(localStorage.getItem('user')).id ? 'current-user' : ''}">
                <div class="pos">#${user.position}</div>
                <div class="name">${user.name}</div>
                <div class="points"><strong>${user.total_points || 0}</strong> pts</div>
            </div>`).join('')}</div>`;
    } catch (error) {
        console.error('Error en loadLeaderboard:', error);
        container.innerHTML = `<div class="no-data"><p>Error al cargar la tabla.</p></div>`;
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

    // En dashboard.js, en displayUpcomingMatchesWithPagination, después de cargar predicciones:

    try {
        // Cargar predicciones del usuario
        const predictionsResponse = await fetchWithAuth('/api/predictions/user');
        const userPredictions = predictionsResponse && predictionsResponse.ok ? 
            await predictionsResponse.json() : [];
        
        // ✅ AGREGAR ESTOS LOGS DE DEBUGGING:
        console.log('🔍 Predicciones raw del API:', userPredictions);
        console.log('🔍 Cantidad de predicciones:', userPredictions?.length);
        console.log('🔍 Partidos en esta página:', matches.map(m => ({ id: m.id, teams: `${m.home_team} vs ${m.away_team}` })));
        
        const predictionsMap = new Map();
        if (Array.isArray(userPredictions)) {
            userPredictions.forEach(p => {
                predictionsMap.set(p.match_id, p);
                console.log(`🔍 Mapeando predicción: match_id=${p.match_id}, predicción=${p.predicted_home_score}-${p.predicted_away_score}`);
            });
        }
        
        console.log('🔍 Mapa de predicciones:', Array.from(predictionsMap.entries()));


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
                                <small>✅ Tu predicción: ${prediction.predicted_home_score} - ${prediction.predicted_away_score}</small>
                            </div>
                        ` : `
                            <div class="no-prediction">
                                <small>⏳ Sin predicción</small>
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
                    <div class="match-teams">
                        <strong>${p.home_team} vs ${p.away_team}</strong>
                    </div>
                    <div class="match-date">
                        <small>${formatFullDate(p.match_date)}</small>
                    </div>
                    <div class="phase-info">
                        <small>📋 ${p.phase_name || 'Sin fase'} - ${p.tournament_name || 'Sin torneo'}</small>
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

        console.log('🎯 Enviando predicción:', {
            match_id: matchId,
            predicted_home_score: parseInt(homeScore),
            predicted_away_score: parseInt(awayScore)
        });

        const response = await fetchWithAuth('/api/predictions', {
            method: 'POST',
            body: JSON.stringify({
                match_id: matchId,
                predicted_home_score: parseInt(homeScore),
                predicted_away_score: parseInt(awayScore)
            })
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
            await loadUpcomingMatches(); // Recarga partidos
            await loadUserPredictions(); // Recarga predicciones
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
    modal.className = 'leaderboard-modal'; // Usamos una clase específica para evitar conflictos
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
        // ✅ CORRECCIÓN: Llamamos a la nueva ruta /api/leaderboard/full
        const response = await fetchWithAuth('/api/leaderboard/full');
        if (!response || !response.ok) throw new Error('Error al cargar la tabla completa.');

        const leaderboardData = await response.json();
        const currentUserId = JSON.parse(localStorage.getItem('user')).id;
        
        const contentDiv = document.getElementById('fullLeaderboardContent');
        
        if (!leaderboardData || leaderboardData.length === 0) {
            contentDiv.innerHTML = `<div class="no-data"><p>No hay datos en la tabla de posiciones.</p></div>`;
            return;
        }

        contentDiv.innerHTML = `
            <div class="leaderboard-table full">
                <div class="leaderboard-header-row">
                    <div class="pos">Pos.</div>
                    <div class="name">Participante</div>
                    <div class="predictions">Aciertos</div>
                    <div class="points">Puntos</div>
                </div>
                ${leaderboardData.map(user => {
                    const isCurrentUser = user.id == currentUserId;
                    const isTop3 = user.position <= 3;
                    return `
                    <div class="leaderboard-row ${isCurrentUser ? 'current-user' : ''} ${isTop3 ? 'top-three' : ''}">
                        <div class="pos">${user.position}</div>
                        <div class="name">${user.name} ${isCurrentUser ? '<span class="you-badge">TÚ</span>' : ''}</div>
                        <div class="predictions">${user.successful_predictions}/${user.total_predictions}</div>
                        <div class="points"><strong>${user.total_points}</strong></div>
                    </div>
                    `
                }).join('')}
            </div>
        `;
    } catch (error) {
        console.error('Error en showFullLeaderboard:', error);
        document.getElementById('fullLeaderboardContent').innerHTML = `<div class="no-data"><p>No se pudo cargar la tabla.</p></div>`;
    }
}

window.closeLeaderboardModal = function() {
    const modal = document.querySelector('.leaderboard-modal');
    if (modal) {
        modal.remove();
    }
}
