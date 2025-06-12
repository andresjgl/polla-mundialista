// public/dashboard.js - Lógica del dashboard de usuario

// En public/dashboard.js, BUSCAR y CORREGIR la función DOMContentLoaded:

document.addEventListener('DOMContentLoaded', async () => {
    // Verificar autenticación
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('user') || '{}');

    if (!token) {
        window.location.href = '/login.html';
        return;
    }

    // Si es admin, redirigir al panel de admin
    if (user.is_admin) {
        window.location.href = '/admin.html';
        return;
    }

    // Mostrar información del usuario
    document.getElementById('userName').textContent = user.name || 'Usuario';

    // NUEVO: Cargar torneo activo primero
    const activeTournament = await loadActiveTournament();
    
    // Solo cargar datos si hay torneo activo
    if (activeTournament) {
        // Verificar y mostrar estado de la cuenta
        await checkAccountStatus(user);

        // Cargar datos del dashboard
        await loadUserStats();
        await loadUpcomingMatches();
        await loadUserPredictions();
        await loadLeaderboard();
    } else {
        // Solo verificar estado de cuenta
        await checkAccountStatus(user);
        
        // Mostrar valores por defecto
        document.getElementById('userPoints').textContent = '0';
        document.getElementById('userPosition').textContent = '#-';
        document.getElementById('totalParticipants').textContent = '0';
    }
});


// En public/dashboard.js, REEMPLAZAR la función loadActiveTournament:

async function loadActiveTournament() {
    try {
        const response = await fetch('/api/matches/active-tournament');
        
        console.log('Response status:', response.status); // Debug
        
        if (response.ok) {
            const data = await response.json();
            console.log('Datos del torneo activo:', data); // Debug
            
            if (data.active_tournament) {
                displayActiveTournament(data.active_tournament);
                return data.active_tournament;
            } else {
                console.log('No hay torneo activo');
                displayNoActiveTournament();
                return null;
            }
        } else {
            console.error('Error response:', response.status);
            displayNoActiveTournament();
            return null;
        }
    } catch (error) {
        console.error('Error cargando torneo activo:', error);
        displayNoActiveTournament();
        return null;
    }
}


// Función para mostrar información del torneo activo (NUEVA)
function displayActiveTournament(tournament) {
    const container = document.getElementById('activeTournamentInfo');
    
    if (!tournament) {
        displayNoActiveTournament();
        return;
    }

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
                    <div class="progress-fill" style="width: ${progress}%"></div>
                </div>
                <span class="stat-value">${tournament.finished_matches}/${tournament.total_matches} partidos</span>
            </div>
            <div class="tournament-stat">
                <span class="stat-label">Predicciones totales</span>
                <span class="stat-value">${tournament.total_predictions}</span>
            </div>
            <div class="tournament-stat">
                <span class="stat-label">Período</span>
                <span class="stat-value">${formatDate(tournament.start_date)} - ${formatDate(tournament.end_date)}</span>
            </div>
        </div>
    `;
}

// Función para mostrar cuando no hay torneo activo (NUEVA)
function displayNoActiveTournament() {
    const container = document.getElementById('activeTournamentInfo');
    
    container.innerHTML = `
        <div class="no-active-tournament">
            <h3>⏸️ No hay torneo activo</h3>
            <p>Actualmente no hay ningún torneo en curso. Las predicciones y puntuaciones aparecerán cuando se active un torneo.</p>
            <small>Contacta al administrador para más información.</small>
        </div>
    `;
    
    // Deshabilitar funcionalidades cuando no hay torneo activo
    disableNoTournamentFeatures();
}

// Función para deshabilitar funcionalidades cuando no hay torneo (NUEVA)
function disableNoTournamentFeatures() {
    const upcomingMatches = document.getElementById('upcomingMatches');
    const myPredictions = document.getElementById('myPredictions');
    
    upcomingMatches.innerHTML = `
        <div class="disabled-section">
            <p>⏸️ No hay partidos disponibles</p>
            <small>Se mostrarán cuando haya un torneo activo</small>
        </div>
    `;
    
    myPredictions.innerHTML = `
        <div class="disabled-section">
            <p>⏸️ No hay predicciones disponibles</p>
            <small>Haz predicciones cuando haya un torneo activo</small>
        </div>
    `;
}


// Función para verificar estado de la cuenta
async function checkAccountStatus(user) {
    const statusBanner = document.getElementById('accountStatus');
    
    if (!user.is_active) {
        statusBanner.className = 'status-banner inactive';
        statusBanner.innerHTML = `
            <strong>⏳ Cuenta Pendiente de Activación</strong><br>
            Tu cuenta debe ser activada por un administrador antes de poder hacer predicciones.
            <br><small>Contacta al administrador si tienes dudas.</small>
        `;
        
        // Deshabilitar funcionalidades que requieren cuenta activa
        disableActiveUserFeatures();
    } else {
        statusBanner.className = 'status-banner active';
        statusBanner.innerHTML = `
            <strong>✅ Cuenta Activa</strong><br>
            ¡Tu cuenta está activa! Ya puedes hacer predicciones.
        `;
    }
}

// Función para deshabilitar funcionalidades de usuarios activos
function disableActiveUserFeatures() {
    const upcomingMatches = document.getElementById('upcomingMatches');
    const myPredictions = document.getElementById('myPredictions');
    
    upcomingMatches.innerHTML = `
        <div class="disabled-section">
            <p>🔒 Activa tu cuenta para ver y predecir partidos</p>
        </div>
    `;
    
    myPredictions.innerHTML = `
        <div class="disabled-section">
            <p>🔒 Activa tu cuenta para hacer predicciones</p>
        </div>
    `;
}

// Función para cargar estadísticas del usuario
async function loadUserStats() {
    try {
        const token = localStorage.getItem('token');
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        
        const response = await fetch(`/api/leaderboard/user/${user.id}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            const stats = await response.json();
            
            document.getElementById('userPoints').textContent = stats.total_points || 0;
            document.getElementById('userPosition').textContent = `#${stats.position || '-'}`;
            document.getElementById('totalParticipants').textContent = stats.total_participants || 0;
            
            // Agregar animación si la posición es buena
            const positionElement = document.getElementById('userPosition');
            if (stats.position <= 3) {
                positionElement.style.color = '#f6d55c'; // Dorado para top 3
            } else if (stats.position <= 5) {
                positionElement.style.color = '#ed8936'; // Naranja para top 5
            }
        } else {
            console.error('Error cargando estadísticas del usuario');
        }
    } catch (error) {
        console.error('Error cargando estadísticas:', error);
        // Mostrar valores por defecto
        document.getElementById('userPoints').textContent = '0';
        document.getElementById('userPosition').textContent = '#-';
        document.getElementById('totalParticipants').textContent = '0';
    }
}


// Función para cargar próximos partidos
async function loadUpcomingMatches() {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    
    if (!user.is_active) {
        return; // Ya manejado en disableActiveUserFeatures
    }

    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/matches/upcoming', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            const matches = await response.json();
            await displayUpcomingMatches(matches);
        } else {
            document.getElementById('upcomingMatches').innerHTML = '<p>Error cargando partidos</p>';
        }
    } catch (error) {
        console.error('Error cargando partidos:', error);
        document.getElementById('upcomingMatches').innerHTML = `
            <div class="no-matches">
                <p>📅 No hay partidos programados por el momento</p>
                <small>Los partidos aparecerán aquí cuando estén disponibles</small>
            </div>
        `;
    }
}

// Función para mostrar próximos partidos
async function displayUpcomingMatches(matches) {
    const container = document.getElementById('upcomingMatches');
    
    if (matches.length === 0) {
        container.innerHTML = `
            <div class="no-matches">
                <p>📅 No hay partidos próximos</p>
                <small>Los próximos partidos aparecerán aquí</small>
            </div>
        `;
        return;
    }

    // Obtener predicciones existentes del usuario
    const token = localStorage.getItem('token');
    const predictionsResponse = await fetch('/api/predictions/user', {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    
    const userPredictions = predictionsResponse.ok ? await predictionsResponse.json() : [];
    const predictionsMap = {};
    userPredictions.forEach(p => {
        predictionsMap[p.match_id] = p;
    });

    const matchesHTML = matches.map(match => {
        const prediction = predictionsMap[match.id];
        const hasPrediction = !!prediction;
        
        return `
            <div class="match-card" data-match-id="${match.id}">
                <div class="match-info">
                    <div class="teams">
                        <span class="team">${match.home_team}</span>
                        <span class="vs">vs</span>
                        <span class="team">${match.away_team}</span>
                    </div>
                    <div class="match-date">
                        ${formatDate(match.match_date)}
                    </div>
                    <div class="match-status">
                        ${getMatchStatusText(match.status)}
                    </div>
                    ${hasPrediction ? `
                        <div class="existing-prediction">
                            <small>Tu predicción: ${prediction.predicted_home_score}-${prediction.predicted_away_score} 
                            (${getPredictionText(prediction.predicted_winner)})</small>
                        </div>
                    ` : ''}
                </div>
                <div class="match-actions">
                    ${match.status === 'scheduled' ? 
                        `<button class="btn ${hasPrediction ? 'btn-secondary' : 'btn-primary'} btn-small" 
                                onclick="showPredictionForm('${match.id}', '${match.home_team}', '${match.away_team}')">
                            ${hasPrediction ? 'Editar' : 'Predecir'}
                        </button>` : 
                        `<span class="match-closed">Cerrado</span>`
                    }
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = matchesHTML;
}


// Función para cargar predicciones del usuario
async function loadUserPredictions() {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    
    if (!user.is_active) {
        return; // Ya manejado en disableActiveUserFeatures
    }

    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/predictions/user', {  // ✅ DEBE ser /api/predictions/user
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            const predictions = await response.json();
            displayUserPredictions(predictions);
        } else {
            console.error('Error cargando predicciones:', response.status);
            document.getElementById('myPredictions').innerHTML = '<p>Error cargando predicciones</p>';
        }
    } catch (error) {
        console.error('Error cargando predicciones:', error);
        document.getElementById('myPredictions').innerHTML = `
            <div class="no-predictions">
                <p>📝 Aún no has hecho predicciones</p>
                <small>Haz clic en "Predecir" en los partidos de arriba para empezar</small>
            </div>
        `;
    }
}

// Función para mostrar predicciones del usuario
function displayUserPredictions(predictions) {
    const container = document.getElementById('myPredictions');
    
    if (predictions.length === 0) {
        container.innerHTML = `
            <div class="no-predictions">
                <p>📝 Aún no has hecho predicciones</p>
                <small>Haz clic en "Predecir" en los partidos de arriba para empezar</small>
            </div>
        `;
        return;
    }

    const predictionsHTML = predictions.map(prediction => `
        <div class="prediction-card">
            <div class="prediction-match">
                <strong>${prediction.home_team} vs ${prediction.away_team}</strong>
                <small>${formatDate(prediction.match_date)}</small>
            </div>
            <div class="prediction-details">
                <span class="prediction-score">
                    ${prediction.predicted_home_score || 0} - ${prediction.predicted_away_score || 0}
                </span>
                <span class="prediction-points ${prediction.points_earned > 0 ? 'points-earned' : ''}">
                    ${prediction.points_earned || 0} pts
                </span>
            </div>
        </div>
    `).join('');

    container.innerHTML = predictionsHTML;
}


// Función para mostrar formulario de predicción (NUEVA)
function showPredictionForm(matchId, homeTeam, awayTeam) {
    // Crear modal de predicción
    const modal = document.createElement('div');
    modal.className = 'prediction-modal';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>Hacer Predicción</h3>
                <button class="close-modal" onclick="closePredictionModal()">&times;</button>
            </div>
            <div class="modal-body">
                <div class="match-title">
                    <strong>${homeTeam} vs ${awayTeam}</strong>
                </div>
                
                <form id="predictionForm" onsubmit="submitPrediction(event, '${matchId}')">
                    <div class="prediction-section">
                        <h4>1. ¿Quién ganará? (1 punto base)</h4>
                        <div class="winner-options">
                            <label class="radio-option">
                                <input type="radio" name="winner" value="home" required>
                                <span>${homeTeam}</span>
                            </label>
                            <label class="radio-option">
                                <input type="radio" name="winner" value="draw" required>
                                <span>Empate</span>
                            </label>
                            <label class="radio-option">
                                <input type="radio" name="winner" value="away" required>
                                <span>${awayTeam}</span>
                            </label>
                        </div>
                    </div>

                    <div class="prediction-section">
                        <h4>2. ¿Cuál será el marcador? (3 puntos adicionales)</h4>
                        <div class="score-inputs">
                            <div class="score-input">
                                <label>${homeTeam}</label>
                                <input type="number" name="homeScore" min="0" max="20" value="0" required>
                            </div>
                            <div class="score-separator">-</div>
                            <div class="score-input">
                                <label>${awayTeam}</label>
                                <input type="number" name="awayScore" min="0" max="20" value="0" required>
                            </div>
                        </div>
                        <small class="help-text">Los goles deben coincidir con tu predicción de ganador</small>
                    </div>

                    <div class="modal-actions">
                        <button type="button" class="btn btn-secondary" onclick="closePredictionModal()">
                            Cancelar
                        </button>
                        <button type="submit" class="btn btn-primary">
                            Guardar Predicción
                        </button>
                    </div>
                </form>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    
    // Auto-actualizar ganador cuando cambie el marcador
    const homeScoreInput = modal.querySelector('input[name="homeScore"]');
    const awayScoreInput = modal.querySelector('input[name="awayScore"]');
    
    function updateWinnerFromScore() {
        const homeScore = parseInt(homeScoreInput.value);
        const awayScore = parseInt(awayScoreInput.value);
        
        if (homeScore > awayScore) {
            modal.querySelector('input[value="home"]').checked = true;
        } else if (awayScore > homeScore) {
            modal.querySelector('input[value="away"]').checked = true;
        } else {
            modal.querySelector('input[value="draw"]').checked = true;
        }
    }
    
    homeScoreInput.addEventListener('input', updateWinnerFromScore);
    awayScoreInput.addEventListener('input', updateWinnerFromScore);
}

// Función para cerrar modal (NUEVA)
function closePredictionModal() {
    const modal = document.querySelector('.prediction-modal');
    if (modal) {
        modal.remove();
    }
}

// Función para enviar predicción (NUEVA)
async function submitPrediction(event, matchId) {
    event.preventDefault();
    
    const form = event.target;
    const formData = new FormData(form);
    
    const prediction = {
        match_id: matchId,
        predicted_winner: formData.get('winner'),
        predicted_home_score: parseInt(formData.get('homeScore')),
        predicted_away_score: parseInt(formData.get('awayScore'))
    };

    // Validar que el marcador coincida con el ganador
    const { predicted_home_score, predicted_away_score, predicted_winner } = prediction;
    
    if (predicted_winner === 'home' && predicted_home_score <= predicted_away_score) {
        alert('El marcador debe coincidir con el ganador seleccionado');
        return;
    }
    
    if (predicted_winner === 'away' && predicted_away_score <= predicted_home_score) {
        alert('El marcador debe coincidir con el ganador seleccionado');
        return;
    }
    
    if (predicted_winner === 'draw' && predicted_home_score !== predicted_away_score) {
        alert('Para empate, ambos equipos deben tener el mismo marcador');
        return;
    }

    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/predictions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(prediction)
        });

        const result = await response.json();

        if (response.ok) {
            alert('¡Predicción guardada exitosamente!');
            closePredictionModal();
            // Recargar partidos para mostrar la nueva predicción
            await loadUpcomingMatches();
        } else {
            alert('Error: ' + result.error);
        }
    } catch (error) {
        console.error('Error guardando predicción:', error);
        alert('Error de conexión');
    }
}

// Función auxiliar para texto de predicción (NUEVA)
function getPredictionText(winner) {
    switch(winner) {
        case 'home': return 'Local gana';
        case 'away': return 'Visitante gana';
        case 'draw': return 'Empate';
        default: return winner;
    }
}

// Función para cargar tabla de posiciones (NUEVA)
async function loadLeaderboard() {
    try {
        const token = localStorage.getItem('token');
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        
        const response = await fetch('/api/leaderboard', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            const leaderboard = await response.json();
            displayLeaderboard(leaderboard, user.id);
        } else {
            document.getElementById('leaderboardTable').innerHTML = '<p>Error cargando tabla de posiciones</p>';
        }
    } catch (error) {
        console.error('Error cargando tabla de posiciones:', error);
        document.getElementById('leaderboardTable').innerHTML = '<p>Error de conexión</p>';
    }
}

// Función para mostrar tabla de posiciones (NUEVA)
function displayLeaderboard(leaderboard, currentUserId) {
    const container = document.getElementById('leaderboardTable');
    
    if (leaderboard.length === 0) {
        container.innerHTML = `
            <div class="no-data">
                <p>📊 Aún no hay datos en la tabla de posiciones</p>
                <small>Haz predicciones y espera los resultados para ver tu posición</small>
            </div>
        `;
        return;
    }

    // Mostrar top 10 + usuario actual si no está en top 10
    let displayData = leaderboard.slice(0, 10);
    const currentUserInTop10 = displayData.find(user => user.id == currentUserId);
    
    if (!currentUserInTop10 && leaderboard.length > 10) {
        const currentUser = leaderboard.find(user => user.id == currentUserId);
        if (currentUser) {
            displayData.push({ ...currentUser, isCurrentUser: true });
        }
    }

    const leaderboardHTML = `
        <div class="leaderboard-table">
            <div class="leaderboard-header-row">
                <div class="pos">Pos</div>
                <div class="name">Participante</div>
                <div class="predictions">Predicciones</div>
                <div class="points">Puntos</div>
            </div>
            ${displayData.map((user, index) => {
                const isCurrentUser = user.id == currentUserId;
                const isTop3 = user.position <= 3;
                const showSeparator = user.isCurrentUser && index > 0;
                
                return `
                    ${showSeparator ? '<div class="position-separator">...</div>' : ''}
                    <div class="leaderboard-row ${isCurrentUser ? 'current-user' : ''} ${isTop3 ? 'top-three' : ''}">
                        <div class="pos">
                            ${user.position === 1 ? '🥇' : user.position === 2 ? '🥈' : user.position === 3 ? '🥉' : `#${user.position}`}
                        </div>
                        <div class="name">
                            ${user.name}
                            ${isCurrentUser ? '<span class="you-badge">TÚ</span>' : ''}
                        </div>
                        <div class="predictions">
                            <span class="successful">${user.successful_predictions}</span>/<span class="total">${user.total_predictions}</span>
                        </div>
                        <div class="points">
                            <strong>${user.total_points}</strong>
                            <small>${user.result_points}+${user.score_points}</small>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;

    container.innerHTML = leaderboardHTML;
}

// Función para mostrar tabla completa (NUEVA)
function showFullLeaderboard() {
    // Crear modal con tabla completa
    const modal = document.createElement('div');
    modal.className = 'leaderboard-modal';
    modal.innerHTML = `
        <div class="modal-content large">
            <div class="modal-header">
                <h3>🏆 Tabla de Posiciones Completa</h3>
                <button class="close-modal" onclick="closeLeaderboardModal()">&times;</button>
            </div>
            <div class="modal-body">
                <div id="fullLeaderboardTable">
                    <p>Cargando tabla completa...</p>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    
    // Cargar tabla completa
    loadFullLeaderboard();
}

// Función para cargar tabla completa (NUEVA)
async function loadFullLeaderboard() {
    try {
        const token = localStorage.getItem('token');
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        
        const response = await fetch('/api/leaderboard', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            const leaderboard = await response.json();
            displayFullLeaderboard(leaderboard, user.id);
        } else {
            document.getElementById('fullLeaderboardTable').innerHTML = '<p>Error cargando tabla completa</p>';
        }
    } catch (error) {
        console.error('Error cargando tabla completa:', error);
        document.getElementById('fullLeaderboardTable').innerHTML = '<p>Error de conexión</p>';
    }
}

// Función para mostrar tabla completa (NUEVA)
function displayFullLeaderboard(leaderboard, currentUserId) {
    const container = document.getElementById('fullLeaderboardTable');
    
    const leaderboardHTML = `
        <div class="leaderboard-table full">
            <div class="leaderboard-header-row">
                <div class="pos">Posición</div>
                <div class="name">Participante</div>
                <div class="predictions">Predicciones</div>
                <div class="accuracy">Efectividad</div>
                <div class="breakdown">Desglose</div>
                <div class="points">Puntos</div>
            </div>
            ${leaderboard.map(user => {
                const isCurrentUser = user.id == currentUserId;
                const isTop3 = user.position <= 3;
                const accuracy = user.total_predictions > 0 ? 
                    Math.round((user.successful_predictions / user.total_predictions) * 100) : 0;
                
                return `
                    <div class="leaderboard-row ${isCurrentUser ? 'current-user' : ''} ${isTop3 ? 'top-three' : ''}">
                        <div class="pos">
                            ${user.position === 1 ? '🥇' : user.position === 2 ? '🥈' : user.position === 3 ? '🥉' : user.position}
                        </div>
                        <div class="name">
                            ${user.name}
                            ${isCurrentUser ? '<span class="you-badge">TÚ</span>' : ''}
                        </div>
                        <div class="predictions">
                            <span class="successful">${user.successful_predictions}</span> / ${user.total_predictions}
                        </div>
                        <div class="accuracy">
                            ${accuracy}%
                        </div>
                        <div class="breakdown">
                            <span class="result-points">${user.result_points}R</span> + 
                            <span class="score-points">${user.score_points}M</span>
                        </div>
                        <div class="points">
                            <strong>${user.total_points}</strong>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
        
        <div class="leaderboard-legend">
            <p><strong>Leyenda:</strong></p>
            <p>• <span class="result-points">R</span> = Puntos por resultado (ganador/empate)</p>
            <p>• <span class="score-points">M</span> = Puntos por marcador exacto</p>
            <p>• Efectividad = % de predicciones con puntos</p>
        </div>
    `;

    container.innerHTML = leaderboardHTML;
}

// Función para cerrar modal de tabla completa (NUEVA)
function closeLeaderboardModal() {
    const modal = document.querySelector('.leaderboard-modal');
    if (modal) {
        modal.remove();
    }
}

// Funciones auxiliares
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-ES', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function getMatchStatusText(status) {
    const statusMap = {
        'scheduled': '⏰ Programado',
        'live': '🔴 En vivo',
        'finished': '✅ Finalizado',
        'postponed': '⏸️ Pospuesto',
        'cancelled': '❌ Cancelado'
    };
    return statusMap[status] || status;
}

// Funciones para futuras implementaciones
function makePrediction(matchId) {
    alert(`Funcionalidad próximamente: Predecir partido ${matchId}`);
    // Aquí implementaremos el modal de predicción
}

// Función para cerrar sesión
function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/index.html';
}

// En public/dashboard.js, agregar validaciones de elementos DOM:

function displayActiveTournament(tournament) {
    const container = document.getElementById('activeTournamentInfo');
    
    if (!container) {
        console.error('Elemento activeTournamentInfo no encontrado');
        return;
    }
    
    if (!tournament) {
        displayNoActiveTournament();
        return;
    }

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
                    <div class="progress-fill" style="width: ${progress}%"></div>
                </div>
                <span class="stat-value">${tournament.finished_matches}/${tournament.total_matches} partidos</span>
            </div>
            <div class="tournament-stat">
                <span class="stat-label">Predicciones totales</span>
                <span class="stat-value">${tournament.total_predictions}</span>
            </div>
            <div class="tournament-stat">
                <span class="stat-label">Período</span>
                <span class="stat-value">${formatDate(tournament.start_date)} - ${formatDate(tournament.end_date)}</span>
            </div>
        </div>
    `;
}

function displayNoActiveTournament() {
    const container = document.getElementById('activeTournamentInfo');
    
    if (!container) {
        console.error('Elemento activeTournamentInfo no encontrado');
        return;
    }
    
    container.innerHTML = `
        <div class="no-active-tournament">
            <h3>⏸️ No hay torneo activo</h3>
            <p>Actualmente no hay ningún torneo en curso. Las predicciones y puntuaciones aparecerán cuando se active un torneo.</p>
            <small>Contacta al administrador para más información.</small>
        </div>
    `;
    
    // Deshabilitar funcionalidades cuando no hay torneo activo
    disableNoTournamentFeatures();
}

// En public/dashboard.js, AGREGAR estas funciones al final:

// ============= MEJORAS PARA MOSTRAR INFORMACIÓN DE FASES =============

// Mejorar la función displayUpcomingMatches para mostrar info de fases
async function displayUpcomingMatches(matches) {
    const container = document.getElementById('upcomingMatches');
    
    if (matches.length === 0) {
        container.innerHTML = `
            <div class="no-matches">
                <p>📅 No hay partidos próximos</p>
                <small>Los próximos partidos aparecerán aquí</small>
            </div>
        `;
        return;
    }

    // Obtener predicciones existentes del usuario
    const token = localStorage.getItem('token');
    const predictionsResponse = await fetch('/api/predictions/user', {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    
    const userPredictions = predictionsResponse.ok ? await predictionsResponse.json() : [];
    const predictionsMap = {};
    userPredictions.forEach(p => {
        predictionsMap[p.match_id] = p;
    });

    // Agrupar partidos por fase
    const matchesByPhase = {};
    matches.forEach(match => {
        const phaseName = match.phase_name || 'Sin fase';
        if (!matchesByPhase[phaseName]) {
            matchesByPhase[phaseName] = [];
        }
        matchesByPhase[phaseName].push(match);
    });

    const matchesHTML = Object.entries(matchesByPhase).map(([phaseName, phaseMatches]) => {
        const firstMatch = phaseMatches[0];
        const isEliminatory = firstMatch.phase_name && firstMatch.phase_name.toLowerCase().includes('final');
        const multiplier = firstMatch.points_multiplier || 1;
        
        return `
            <div class="phase-section">
                <div class="phase-header-user">
                    <h4>${phaseName}</h4>
                    <div class="phase-info-user">
                        <span class="multiplier-badge">${multiplier}x puntos</span>
                        ${isEliminatory ? '<span class="eliminatory-badge-user">ELIMINATORIA</span>' : ''}
                    </div>
                </div>
                
                <div class="phase-matches">
                    ${phaseMatches.map(match => {
                        const prediction = predictionsMap[match.id];
                        const hasPrediction = !!prediction;
                        
                        return `
                            <div class="match-card ${isEliminatory ? 'eliminatory-match' : ''}" data-match-id="${match.id}">
                                <div class="match-info">
                                    <div class="teams">
                                        <span class="team">${match.home_team}</span>
                                        <span class="vs">vs</span>
                                        <span class="team">${match.away_team}</span>
                                    </div>
                                    <div class="match-date">
                                        ${formatDate(match.match_date)}
                                    </div>
                                    <div class="match-points-info">
                                        <small>
                                            Resultado: ${(firstMatch.result_points || 1) * multiplier} pts | 
                                            Marcador: ${(firstMatch.exact_score_points || 3) * multiplier} pts
                                        </small>
                                    </div>
                                    ${isEliminatory ? `
                                        <div class="eliminatory-warning-user">
                                            <small>⚠️ Fase eliminatoria: Debe haber ganador (no empates)</small>
                                        </div>
                                    ` : ''}
                                    ${hasPrediction ? `
                                        <div class="existing-prediction">
                                            <small>Tu predicción: ${prediction.predicted_home_score}-${prediction.predicted_away_score} 
                                            (${getPredictionText(prediction.predicted_winner)})</small>
                                        </div>
                                    ` : ''}
                                </div>
                                <div class="match-actions">
                                    ${match.status === 'scheduled' ? 
                                        `<button class="btn ${hasPrediction ? 'btn-secondary' : 'btn-primary'} btn-small" 
                                                onclick="showPredictionForm('${match.id}', '${match.home_team}', '${match.away_team}', ${isEliminatory})">
                                            ${hasPrediction ? 'Editar' : 'Predecir'}
                                        </button>` : 
                                        `<span class="match-closed">Cerrado</span>`
                                    }
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = matchesHTML;
}

// Mejorar la función showPredictionForm para considerar fases eliminatorias
function showPredictionForm(matchId, homeTeam, awayTeam, isEliminatory = false) {
    // Crear modal de predicción
    const modal = document.createElement('div');
    modal.className = 'prediction-modal';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>Hacer Predicción</h3>
                <button class="close-modal" onclick="closePredictionModal()">&times;</button>
            </div>
            <div class="modal-body">
                <div class="match-title">
                    <strong>${homeTeam} vs ${awayTeam}</strong>
                    ${isEliminatory ? '<span class="eliminatory-badge-modal">ELIMINATORIA</span>' : ''}
                </div>
                
                ${isEliminatory ? `
                    <div class="eliminatory-notice">
                        <h4>⚠️ Fase Eliminatoria</h4>
                        <p>En esta fase <strong>debe haber un ganador</strong>. Si predices empate en 90 minutos, 
                        el sistema considerará que el ganador se define en penaltis.</p>
                    </div>
                ` : ''}
                
                <form id="predictionForm" onsubmit="submitPrediction(event, '${matchId}', ${isEliminatory})">
                    <div class="prediction-section">
                        <h4>1. ¿Quién ganará?</h4>
                        <div class="winner-options">
                            <label class="radio-option">
                                <input type="radio" name="winner" value="home" required>
                                <span>${homeTeam}</span>
                            </label>
                            <label class="radio-option">
                                <input type="radio" name="winner" value="draw" required ${isEliminatory ? 'data-eliminatory="true"' : ''}>
                                <span>Empate${isEliminatory ? ' (a penaltis)' : ''}</span>
                            </label>
                            <label class="radio-option">
                                <input type="radio" name="winner" value="away" required>
                                <span>${awayTeam}</span>
                            </label>
                        </div>
                        ${isEliminatory ? `
                            <div id="penaltySelector" class="penalty-selector" style="display: none;">
                                <h5>¿Quién gana en penaltis?</h5>
                                <div class="penalty-options">
                                    <label class="radio-option">
                                        <input type="radio" name="penaltyWinner" value="home">
                                        <span>${homeTeam}</span>
                                    </label>
                                    <label class="radio-option">
                                        <input type="radio" name="penaltyWinner" value="away">
                                        <span>${awayTeam}</span>
                                    </label>
                                </div>
                            </div>
                        ` : ''}
                    </div>

                    <div class="prediction-section">
                        <h4>2. ¿Cuál será el marcador en 90 minutos?</h4>
                        <div class="score-inputs">
                            <div class="score-input">
                                <label>${homeTeam}</label>
                                <input type="number" name="homeScore" min="0" max="20" value="0" required>
                            </div>
                            <div class="score-separator">-</div>
                            <div class="score-input">
                                <label>${awayTeam}</label>
                                <input type="number" name="awayScore" min="0" max="20" value="0" required>
                            </div>
                        </div>
                        <small class="help-text">
                            ${isEliminatory ? 
                                'Marca el resultado en tiempo regular. Si hay empate, se define el ganador en penaltis.' :
                                'Los goles deben coincidir con tu predicción de ganador'
                            }
                        </small>
                    </div>

                    <div class="modal-actions">
                        <button type="button" class="btn btn-secondary" onclick="closePredictionModal()">
                            Cancelar
                        </button>
                        <button type="submit" class="btn btn-primary">
                            Guardar Predicción
                        </button>
                    </div>
                </form>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    
    // Lógica especial para fases eliminatorias
    if (isEliminatory) {
        const drawOption = modal.querySelector('input[value="draw"]');
        const penaltySelector = modal.querySelector('#penaltySelector');
        const penaltyOptions = modal.querySelectorAll('input[name="penaltyWinner"]');
        
        drawOption.addEventListener('change', function() {
            if (this.checked) {
                penaltySelector.style.display = 'block';
                penaltyOptions.forEach(opt => opt.required = true);
            }
        });
        
        modal.querySelectorAll('input[name="winner"]').forEach(opt => {
            if (opt.value !== 'draw') {
                opt.addEventListener('change', function() {
                    if (this.checked) {
                        penaltySelector.style.display = 'none';
                        penaltyOptions.forEach(pOpt => {
                            pOpt.required = false;
                            pOpt.checked = false;
                        });
                    }
                });
            }
        });
    }
    
    // Auto-actualizar ganador cuando cambie el marcador
    const homeScoreInput = modal.querySelector('input[name="homeScore"]');
    const awayScoreInput = modal.querySelector('input[name="awayScore"]');
    
    function updateWinnerFromScore() {
        const homeScore = parseInt(homeScoreInput.value);
        const awayScore = parseInt(awayScoreInput.value);
        
        if (homeScore > awayScore) {
            modal.querySelector('input[value="home"]').checked = true;
            if (isEliminatory) {
                document.getElementById('penaltySelector').style.display = 'none';
            }
        } else if (awayScore > homeScore) {
            modal.querySelector('input[value="away"]').checked = true;
            if (isEliminatory) {
                document.getElementById('penaltySelector').style.display = 'none';
            }
        } else {
            modal.querySelector('input[value="draw"]').checked = true;
            if (isEliminatory) {
                document.getElementById('penaltySelector').style.display = 'block';
            }
        }
    }
    
    homeScoreInput.addEventListener('input', updateWinnerFromScore);
    awayScoreInput.addEventListener('input', updateWinnerFromScore);
}

// Mejorar submitPrediction para manejar fases eliminatorias
async function submitPrediction(event, matchId, isEliminatory = false) {
    event.preventDefault();
    
    const form = event.target;
    const formData = new FormData(form);
    
    const prediction = {
        match_id: matchId,
        predicted_winner: formData.get('winner'),
        predicted_home_score: parseInt(formData.get('homeScore')),
        predicted_away_score: parseInt(formData.get('awayScore'))
    };

    // Validaciones especiales para fases eliminatorias
    if (isEliminatory && prediction.predicted_winner === 'draw') {
        const penaltyWinner = formData.get('penaltyWinner');
        if (!penaltyWinner) {
            alert('En fases eliminatorias con empate debes seleccionar quién gana en penaltis');
            return;
        }
        // Guardar información adicional de penaltis
        prediction.penalty_winner = penaltyWinner;
        prediction.predicted_winner = penaltyWinner; // El ganador real es quien gana en penaltis
    }

    // Validar que el marcador coincida con el ganador (solo si NO es eliminatoria o NO hay empate)
    const { predicted_home_score, predicted_away_score, predicted_winner } = prediction;
    
    if (!isEliminatory || (predicted_home_score !== predicted_away_score)) {
        if (predicted_winner === 'home' && predicted_home_score <= predicted_away_score) {
            alert('El marcador debe coincidir con el ganador seleccionado');
            return;
        }
        
        if (predicted_winner === 'away' && predicted_away_score <= predicted_home_score) {
            alert('El marcador debe coincidir con el ganador seleccionado');
            return;
        }
        
        if (predicted_winner === 'draw' && predicted_home_score !== predicted_away_score) {
            alert('Para empate, ambos equipos deben tener el mismo marcador');
            return;
        }
    }

    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/predictions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(prediction)
        });

        const result = await response.json();

        if (response.ok) {
            alert('¡Predicción guardada exitosamente!');
            closePredictionModal();
            // Recargar partidos para mostrar la nueva predicción
            await loadUpcomingMatches();
        } else {
            alert('Error: ' + result.error);
        }
    } catch (error) {
        console.error('Error guardando predicción:', error);
        alert('Error de conexión');
    }
}
