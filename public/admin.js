// public/admin.js - Panel de administración completo

document.addEventListener('DOMContentLoaded', async () => {
    // Verificar autenticación
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('user') || '{}');

    if (!token || !user.is_admin) {
        window.location.href = '/login.html';
        return;
    }

    // Mostrar nombre del admin
    document.getElementById('adminName').textContent = user.name;

    // Cargar datos iniciales
    await loadStats();
    await loadPendingUsers();
    await loadTournaments();
});

// ============= VARIABLES GLOBALES PARA PAGINACIÓN =============

let currentPage = 1;
let totalPages = 1;
let currentFilters = { tournament_id: '', status: 'all' };

// Función para manejar errores 401 automáticamente - VERSIÓN CORREGIDA
// Función para manejar errores 401 automáticamente - VERSIÓN FINAL CORREGIDA
async function fetchWithAuth(url, options = {}) {
    const token = localStorage.getItem('token');
    
    // ✅ VERIFICAR TOKEN ANTES DE ENVIARLO
    if (!token || token === 'null' || token === 'undefined') {
        console.warn('🔐 No hay token válido disponible');
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        alert('Tu sesión ha expirado. Por favor, inicia sesión de nuevo.');
        window.location.href = '/login.html';
        return null;
    }

    // ✅ CORRECCIÓN CRÍTICA: Poner Authorization DESPUÉS del spread
    const defaultOptions = {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...options.headers,          // ← Opciones del usuario primero
            'Authorization': `Bearer ${token}` // ← Authorization AL FINAL (no se sobrescribe)
        }
    };

    try {
        console.log('🎫 Enviando token:', token.substring(0, 20) + '...');
        
        const response = await fetch(url, defaultOptions);
        
        // Si token expiró, redirigir a login
        if (response.status === 401) {
            console.log('🔐 Token expirado, redirigiendo a login...');
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            alert('Tu sesión ha expirado. Por favor, inicia sesión de nuevo.');
            
            setTimeout(() => {
                window.location.href = '/login.html';
            }, 1000);
            
            return null;
        }
        
        return response;
    } catch (error) {
        console.error('Error en fetchWithAuth:', error);
        throw error;
    }
}




// ============= GESTIÓN DE TABS =============

function showTab(tabName) {
    // Ocultar todas las tabs
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });

    // Remover clase active de todos los botones
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.classList.remove('active');
    });

    // Mostrar tab seleccionada
    document.getElementById(`${tabName}-tab`).classList.add('active');

    // Activar botón correspondiente
    event.target.classList.add('active');

    // Cargar datos según la tab
    switch (tabName) {
        case 'tournaments':
            loadTournaments();
            break;
        case 'teams':  // NUEVO
            loadTeams();
            break;
        case 'matches':
            loadMatches();
            loadTournamentFilter();
            break;
        case 'users':
            loadUsers();
            break;
    }
}


// ============= FUNCIONES EXISTENTES (Stats y Users) =============

// Actualizar loadStats para mostrar también pendientes
async function loadStats() {
    try {
        console.log('📊 Cargando estadísticas...');
        
        const token = localStorage.getItem('token');
        const response = await fetch('/api/auth/stats', {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (response.status === 401) {
            console.log('🔐 Token expirado, redirigiendo a login...');
            localStorage.removeItem('token');
            alert('Tu sesión ha expirado. Por favor, inicia sesión de nuevo.');
            window.location.href = '/login.html';
            return;
        }
        
        if (response.ok) {
            const stats = await response.json();
            console.log('✅ Estadísticas cargadas:', stats);
            
            document.getElementById('totalUsers').textContent = stats.total_users || 0;
            document.getElementById('activeUsers').textContent = stats.active_users || 0;
            
            // Actualizar contador de pendientes si existe
            const pendingElement = document.getElementById('pendingUsers');
            if (pendingElement) {
                pendingElement.textContent = stats.pending_users || 0;
            }
        } else {
            console.error('Error cargando estadísticas:', response.status);
            document.getElementById('totalUsers').textContent = '?';
            document.getElementById('activeUsers').textContent = '?';
        }
    } catch (error) {
        console.error('Error en loadStats:', error);
        document.getElementById('totalUsers').textContent = '?';
        document.getElementById('activeUsers').textContent = '?';
    }
}



async function loadPendingUsers() {
    try {
        console.log('👥 Cargando usuarios pendientes...');
        
        const token = localStorage.getItem('token');
        const response = await fetch('/api/auth/pending-users', {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (response.status === 401) {
            console.log('🔐 Token expirado, redirigiendo a login...');
            localStorage.removeItem('token');
            alert('Tu sesión ha expirado. Por favor, inicia sesión de nuevo.');
            window.location.href = '/login.html';
            return;
        }
        
        if (response.ok) {
            const users = await response.json();
            displayPendingUsers(users || []);
        } else {
            console.error('Error cargando usuarios pendientes:', response.status);
            displayPendingUsers([]);
        }
    } catch (error) {
        console.error('Error en loadPendingUsers:', error);
        displayPendingUsers([]);
    }
}

function displayPendingUsers(users) {
    const container = document.getElementById('pendingUsersList');

    if (!container) {
        console.log('⚠️ Container pendingUsersList no encontrado');
        return;
    }
    
    
    if (users.length === 0) {
        container.innerHTML = '<p>✅ No hay usuarios pendientes de activación</p>';
        return;
    }

    const usersHTML = users.map(user => `
        <div class="pending-user">
            <div class="user-details">
                <strong>${user.name}</strong>
                <span>${user.email}</span>
                <small>Registrado: ${new Date(user.created_at).toLocaleDateString()}</small>
            </div>
            <button class="btn btn-primary btn-small" onclick="activateUser(${user.id})">
                Activar
            </button>
        </div>
    `).join('');

    container.innerHTML = usersHTML;
}

async function activateUser(userId) {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`/api/auth/activate/${userId}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const data = await response.json();

        if (response.ok) {
            alert('Usuario activado exitosamente');
            await loadStats();
            await loadPendingUsers();
        } else {
            alert('Error: ' + data.error);
        }
    } catch (error) {
        console.error('Error activando usuario:', error);
        alert('Error de conexión');
    }
}

// ============= GESTIÓN DE TORNEOS =============

async function loadTournaments() {
    try {
        console.log('🏆 Cargando gestión de torneos...');
        
        // Cargar torneo activo con estadísticas
        await loadActiveTournament();
        
    } catch (error) {
        console.error('Error cargando torneos:', error);
        document.getElementById('tournamentsList').innerHTML = '<p>Error de conexión</p>';
    }
}


function displayTournaments(tournaments) {
    const container = document.getElementById('tournamentsList');

    if (tournaments.length === 0) {
        container.innerHTML = `
            <div class="no-data">
                <p>🏆 No hay torneos creados</p>
                <small>Crea tu primer torneo para comenzar</small>
            </div>
        `;
        return;
    }

    const tournamentsHTML = tournaments.map(tournament => `
        <div class="tournament-card">
            <div class="tournament-header">
                <div class="tournament-title">${tournament.name}</div>
                <div class="tournament-status status-${tournament.status}">
                    ${getStatusText(tournament.status)}
                </div>
            </div>
            
            <div class="tournament-info">
                <div><strong>Inicio:</strong> ${formatDate(tournament.start_date)}</div>
                <div><strong>Fin:</strong> ${formatDate(tournament.end_date)}</div>
                <div><strong>Partidos:</strong> ${tournament.matches_count || 0}</div>
                <div><strong>Predicciones:</strong> ${tournament.total_predictions || 0}</div>
            </div>
            
            <div class="tournament-actions">
                ${tournament.status !== 'active' ?
            `<button class="btn btn-primary btn-small" onclick="setTournamentStatus(${tournament.id}, 'active')">
                        Activar
                    </button>` :
            `<button class="btn btn-secondary btn-small" onclick="setTournamentStatus(${tournament.id}, 'upcoming')">
                        Desactivar
                    </button>`
        }
                <button class="btn btn-primary btn-small" onclick="editActiveTournament(${tournament.id})">
                    ✏️ Editar Torneo
                </button>
                <button class="btn btn-secondary btn-small" onclick="manageTournamentPhases(${tournament.id}, '${tournament.name}')">
                    ⚙️ Gestionar Fases
                </button>
                <button class="btn btn-secondary btn-small" onclick="viewTournamentDetails(${tournament.id})">
                    Ver Detalles
                </button>
            </div>
        </div>
    `).join('');

    container.innerHTML = tournamentsHTML;
}

function getStatusText(status) {
    const statusMap = {
        'upcoming': 'Próximo',
        'active': 'Activo',
        'finished': 'Finalizado',
        'cancelled': 'Cancelado'
    };
    return statusMap[status] || status;
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-ES');
}

async function setTournamentStatus(tournamentId, status) {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`/api/admin/tournaments/${tournamentId}/status`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ status })
        });

        const result = await response.json();

        if (response.ok) {
            alert(result.message);
            await loadTournaments();
        } else {
            alert('Error: ' + result.error);
        }
    } catch (error) {
        console.error('Error actualizando estado del torneo:', error);
        alert('Error de conexión');
    }
}

function showCreateTournamentForm() {
    const modal = document.createElement('div');
    modal.className = 'prediction-modal';
    modal.innerHTML = `
        <div class="modal-content large">
            <div class="modal-header">
                <h3>🏆 Crear Nuevo Torneo</h3>
                <button class="close-modal" onclick="closeModal()">&times;</button>
            </div>
            <div class="modal-body">
                <form id="createTournamentForm" onsubmit="createTournament(event)">
                    <div class="form-group">
                        <label for="tournamentName">Nombre del Torneo</label>
                        <input type="text" id="tournamentName" name="name" required 
                               placeholder="ej: Mundial de Clubes 2025">
                    </div>
                    
                    <div class="form-row">
                        <div class="form-group">
                            <label for="startDate">Fecha de Inicio</label>
                            <input type="date" id="startDate" name="start_date" required>
                        </div>
                        
                        <div class="form-group">
                            <label for="endDate">Fecha de Fin</label>
                            <input type="date" id="endDate" name="end_date" required>
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label for="description">Descripción (opcional)</label>
                        <textarea id="description" name="description" rows="3"
                                placeholder="Descripción del torneo..."></textarea>
                    </div>

                    <div class="form-group">
                        <label for="tournamentRules">Reglas del Torneo</label>
                        <textarea id="tournamentRules" name="rules" rows="8"
                                placeholder="Escribe aquí las reglas del torneo..."></textarea>
                        <small>Puedes usar saltos de línea y viñetas (•) para formatear las reglas</small>
                    </div>
                    
                    <!-- NUEVO: Sección de Pronósticos Especiales -->
                    <div class="special-predictions-section">
                        <h4>⚡ Pronósticos Especiales</h4>
                        
                        <div class="form-group">
                            <label for="predictionDeadline">Fecha límite para pronósticos de Campeón/Goleador</label>
                            <input type="datetime-local" id="predictionDeadline" name="special_predictions_deadline" required>
                            <small>Los usuarios no podrán hacer estos pronósticos después de esta fecha</small>
                        </div>
                        
                        <div class="deadline-suggestions">
                            <label>Sugerencias rápidas:</label>
                            <button type="button" class="btn btn-small btn-secondary" onclick="setDeadlineBeforeFirstMatch()">
                                📅 Día del 1er partido
                            </button>
                            <button type="button" class="btn btn-small btn-secondary" onclick="setDeadlineCustomDays(7)">
                                📅 7 días después
                            </button>
                        </div>
                        
                        <div class="form-row">
                            <div class="form-group">
                                <label for="championPoints">Puntos por acertar Campeón</label>
                                <input type="number" id="championPoints" name="champion_points" 
                                       min="0" max="100" value="15" required>
                                <small>Puntos extra si acierta el equipo campeón</small>
                            </div>
                            
                            <div class="form-group">
                                <label for="scorerPoints">Puntos por acertar Goleador</label>
                                <input type="number" id="scorerPoints" name="top_scorer_points" 
                                       min="0" max="100" value="10" required>
                                <small>Puntos extra si acierta el goleador del torneo</small>
                            </div>
                        </div>
                    </div>
                    
                    <div class="modal-actions">
                        <button type="button" class="btn btn-secondary" onclick="closeModal()">
                            Cancelar
                        </button>
                        <button type="submit" class="btn btn-primary">
                            Crear Torneo
                        </button>
                    </div>
                </form>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
}

// Agregar estas funciones después de showCreateTournamentForm
function setDeadlineBeforeFirstMatch() {
    const startDate = document.getElementById('startDate').value;
    if (startDate) {
        const deadline = new Date(startDate);
        deadline.setHours(23, 59, 59);
        document.getElementById('predictionDeadline').value = 
            deadline.toISOString().slice(0, 16);
    }
}

function setDeadlineCustomDays(days) {
    const startDate = document.getElementById('startDate').value;
    if (startDate) {
        const deadline = new Date(startDate);
        deadline.setDate(deadline.getDate() + days);
        deadline.setHours(23, 59, 59);
        document.getElementById('predictionDeadline').value = 
            deadline.toISOString().slice(0, 16);
    }
}

// Actualizar la función createTournament
async function createTournament(event) {
    event.preventDefault();

    const form = event.target;
    const formData = new FormData(form);

    const tournamentData = {
        name: formData.get('name'),
        start_date: formData.get('start_date'),
        end_date: formData.get('end_date'),
        description: formData.get('description'),
        rules: formData.get('rules'),
        special_predictions_deadline: formData.get('special_predictions_deadline'),
        champion_points: parseInt(formData.get('champion_points')),
        top_scorer_points: parseInt(formData.get('top_scorer_points'))
    };

    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/admin/tournaments', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(tournamentData)
        });

        const result = await response.json();

        if (response.ok) {
            alert('¡Torneo creado exitosamente!');
            closeModal();
            await loadTournaments();

            if (confirm('¿Quieres crear las fases estándar del torneo? (Grupos, Octavos, Cuartos, etc.)')) {
                await createStandardPhases(result.tournament.id);
            }
        } else {
            alert('Error: ' + result.error);
        }
    } catch (error) {
        console.error('Error creando torneo:', error);
        alert('Error de conexión');
    }
}

// Función para editar el torneo activo
async function editActiveTournament(tournamentId) {
    try {
        // Primero obtener los datos actuales del torneo
        const token = localStorage.getItem('token');
        const response = await fetch(`/api/admin/active-tournament`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) throw new Error('Error obteniendo torneo');
        
        const data = await response.json();
        const tournament = data.active_tournament;
        
        showEditTournamentForm(tournament);
        
    } catch (error) {
        console.error('Error:', error);
        alert('Error cargando datos del torneo');
    }
}

// Mostrar formulario de edición
function showEditTournamentForm(tournament) {
    const modal = document.createElement('div');
    modal.className = 'prediction-modal';
    modal.innerHTML = `
        <div class="modal-content large">
            <div class="modal-header">
                <h3>✏️ Editar Torneo: ${tournament.name}</h3>
                <button class="close-modal" onclick="closeModal()">&times;</button>
            </div>
            <div class="modal-body">
                <form id="editTournamentForm" onsubmit="updateTournament(event, ${tournament.id})">
                    <div class="form-group">
                        <label for="editTournamentName">Nombre del Torneo</label>
                        <input type="text" id="editTournamentName" name="name" required 
                               value="${tournament.name}">
                    </div>
                    
                    <div class="form-row">
                        <div class="form-group">
                            <label for="editStartDate">Fecha de Inicio</label>
                            <input type="date" id="editStartDate" name="start_date" required
                                   value="${tournament.start_date ? tournament.start_date.split('T')[0] : ''}">
                        </div>
                        
                        <div class="form-group">
                            <label for="editEndDate">Fecha de Fin</label>
                            <input type="date" id="editEndDate" name="end_date" required
                                   value="${tournament.end_date ? tournament.end_date.split('T')[0] : ''}">
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label for="editDescription">Descripción</label>
                        <textarea id="editDescription" name="description" rows="3">${tournament.description || ''}</textarea>
                    </div>

                    <div class="form-group">
                        <label for="editTournamentRules">Reglas del Torneo</label>
                        <textarea id="editTournamentRules" name="rules" rows="8">${tournament.rules || ''}</textarea>
                    </div>
                    
                    <!-- Sección de Pronósticos Especiales -->
                    <div class="special-predictions-section">
                        <h4>⚡ Pronósticos Especiales</h4>
                        
                        <div class="form-group">
                            <label for="editPredictionDeadline">Fecha límite para pronósticos</label>
                            <input type="datetime-local" id="editPredictionDeadline" 
                                   name="special_predictions_deadline" required
                                   value="${tournament.special_predictions_deadline ? 
                                           new Date(tournament.special_predictions_deadline).toISOString().slice(0, 16) : 
                                           ''}">
                            <small>Fecha actual: ${tournament.special_predictions_deadline ? 
                                    new Date(tournament.special_predictions_deadline).toLocaleString('es-CO') : 
                                    'No configurada'}</small>
                        </div>
                        
                        <div class="form-row">
                            <div class="form-group">
                                <label for="editChampionPoints">Puntos por acertar Campeón</label>
                                <input type="number" id="editChampionPoints" name="champion_points" 
                                       min="0" max="100" value="${tournament.champion_points || 15}" required>
                            </div>
                            
                            <div class="form-group">
                                <label for="editScorerPoints">Puntos por acertar Goleador</label>
                                <input type="number" id="editScorerPoints" name="top_scorer_points" 
                                       min="0" max="100" value="${tournament.top_scorer_points || 10}" required>
                            </div>
                        </div>
                    </div>
                    
                    <div class="modal-actions">
                        <button type="button" class="btn btn-secondary" onclick="closeModal()">
                            Cancelar
                        </button>
                        <button type="submit" class="btn btn-primary">
                            Actualizar Torneo
                        </button>
                    </div>
                </form>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
}

// Actualizar torneo
async function updateTournament(event, tournamentId) {
    event.preventDefault();

    const form = event.target;
    const formData = new FormData(form);

    const tournamentData = {
        name: formData.get('name'),
        start_date: formData.get('start_date'),
        end_date: formData.get('end_date'),
        description: formData.get('description'),
        rules: formData.get('rules'),
        special_predictions_deadline: formData.get('special_predictions_deadline'),
        champion_points: parseInt(formData.get('champion_points')),
        top_scorer_points: parseInt(formData.get('top_scorer_points'))
    };

    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`/api/admin/tournaments/${tournamentId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(tournamentData)
        });

        const result = await response.json();

        if (response.ok) {
            alert('¡Torneo actualizado exitosamente!');
            closeModal();
            await loadActiveTournament(); // Recargar info
        } else {
            alert('Error: ' + result.error);
        }
    } catch (error) {
        console.error('Error actualizando torneo:', error);
        alert('Error de conexión');
    }
}


async function createStandardPhases(tournamentId) {
    const standardPhases = [
        { name: 'Fase de Grupos', points_multiplier: 1, order_index: 1 },
        { name: 'Octavos de Final', points_multiplier: 4, order_index: 2 },
        { name: 'Cuartos de Final', points_multiplier: 6, order_index: 3 },
        { name: 'Semifinal', points_multiplier: 8, order_index: 4 },
        { name: 'Tercer Puesto', points_multiplier: 7, order_index: 5 },
        { name: 'Final', points_multiplier: 10, order_index: 6 }
    ];

    try {
        const token = localStorage.getItem('token');

        for (const phase of standardPhases) {
            await fetch(`/api/admin/tournaments/${tournamentId}/phases`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(phase)
            });
        }

        alert('Fases estándar creadas exitosamente');
    } catch (error) {
        console.error('Error creando fases:', error);
        alert('Error creando fases automáticas');
    }
}

// ============= GESTIÓN DE EQUIPOS =============

async function loadTeams() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/admin/teams', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            const teams = await response.json();
            displayTeams(teams);
        } else {
            document.getElementById('teamsList').innerHTML = '<p>Error cargando equipos</p>';
        }
    } catch (error) {
        console.error('Error cargando equipos:', error);
        document.getElementById('teamsList').innerHTML = '<p>Error de conexión</p>';
    }
}

function displayTeams(teams) {
    const container = document.getElementById('teamsList');

    if (teams.length === 0) {
        container.innerHTML = `
            <div class="no-data">
                <p>⚽ No hay equipos creados</p>
                <small>Crea equipos para poder crear partidos</small>
            </div>
        `;
        return;
    }

    const teamsHTML = teams.map(team => `
        <div class="team-card">
            <div class="team-header">
                <div class="team-info">
                    <div class="team-name">${team.name}</div>
                    <div class="team-country">${team.country || 'Sin país'}</div>
                </div>
                <div class="team-logo">
                    ${team.logo_url ?
            `<img src="${team.logo_url}" alt="${team.name}" class="team-logo-img">` :
            '⚽'
        }
                </div>
            </div>
            
            <div class="team-actions">
                <button class="btn btn-secondary btn-small" onclick="editTeam(${team.id}, '${team.name}', '${team.country || ''}', '${team.logo_url || ''}')">
                    ✏️ Editar
                </button>
                <button class="btn btn-danger btn-small" onclick="deleteTeam(${team.id}, '${team.name}')">
                    🗑️ Eliminar
                </button>
            </div>
        </div>
    `).join('');

    container.innerHTML = teamsHTML;
}

function showCreateTeamForm() {
    const modal = document.createElement('div');
    modal.className = 'prediction-modal';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>⚽ Crear Nuevo Equipo</h3>
                <button class="close-modal" onclick="closeModal()">&times;</button>
            </div>
            <div class="modal-body">
                <form id="createTeamForm" onsubmit="createTeam(event)">
                    <div class="form-group">
                        <label for="teamName">Nombre del Equipo</label>
                        <input type="text" id="teamName" name="name" required 
                               placeholder="ej: Real Madrid">
                    </div>
                    
                    <div class="form-group">
                        <label for="teamCountry">País</label>
                        <input type="text" id="teamCountry" name="country" 
                               placeholder="ej: España">
                    </div>
                    
                    <div class="form-group">
                        <label for="teamLogo">URL del Logo (opcional)</label>
                        <input type="url" id="teamLogo" name="logo_url" 
                               placeholder="https://ejemplo.com/logo.png">
                    </div>
                    
                    <div class="modal-actions">
                        <button type="button" class="btn btn-secondary" onclick="closeModal()">
                            Cancelar
                        </button>
                        <button type="submit" class="btn btn-primary">
                            Crear Equipo
                        </button>
                    </div>
                </form>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
}

async function createTeam(event) {
    event.preventDefault();

    const form = event.target;
    const formData = new FormData(form);

    const teamData = {
        name: formData.get('name').trim(),
        country: formData.get('country').trim(),
        logo_url: formData.get('logo_url').trim()
    };

    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/admin/teams', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(teamData)
        });

        const result = await response.json();

        if (response.ok) {
            alert(`¡Equipo "${teamData.name}" creado exitosamente!`);
            closeModal();
            await loadTeams(); // Recargar lista de equipos
        } else {
            alert('Error: ' + result.error);
        }
    } catch (error) {
        console.error('Error creando equipo:', error);
        alert('Error de conexión');
    }
}

function editTeam(id, name, country, logoUrl) {
    const modal = document.createElement('div');
    modal.className = 'prediction-modal';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>✏️ Editar Equipo</h3>
                <button class="close-modal" onclick="closeModal()">&times;</button>
            </div>
            <div class="modal-body">
                <form id="editTeamForm" onsubmit="updateTeam(event, ${id})">
                    <div class="form-group">
                        <label for="editTeamName">Nombre del Equipo</label>
                        <input type="text" id="editTeamName" name="name" required 
                               value="${name}" placeholder="ej: Real Madrid">
                    </div>
                    
                    <div class="form-group">
                        <label for="editTeamCountry">País</label>
                        <input type="text" id="editTeamCountry" name="country" 
                               value="${country}" placeholder="ej: España">
                    </div>
                    
                    <div class="form-group">
                        <label for="editTeamLogo">URL del Logo (opcional)</label>
                        <input type="url" id="editTeamLogo" name="logo_url" 
                               value="${logoUrl}" placeholder="https://ejemplo.com/logo.png">
                    </div>
                    
                    <div class="modal-actions">
                        <button type="button" class="btn btn-secondary" onclick="closeModal()">
                            Cancelar
                        </button>
                        <button type="submit" class="btn btn-primary">
                            Actualizar Equipo
                        </button>
                    </div>
                </form>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
}

async function updateTeam(event, teamId) {
    event.preventDefault();

    const form = event.target;
    const formData = new FormData(form);

    const teamData = {
        name: formData.get('name').trim(),
        country: formData.get('country').trim(),
        logo_url: formData.get('logo_url').trim()
    };

    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`/api/admin/teams/${teamId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(teamData)
        });

        const result = await response.json();

        if (response.ok) {
            alert(`¡Equipo "${teamData.name}" actualizado exitosamente!`);
            closeModal();
            await loadTeams(); // Recargar lista de equipos
        } else {
            alert('Error: ' + result.error);
        }
    } catch (error) {
        console.error('Error actualizando equipo:', error);
        alert('Error de conexión');
    }
}

async function deleteTeam(teamId, teamName) {
    if (!confirm(`¿Estás seguro de que quieres eliminar el equipo "${teamName}"?\n\nEsta acción no se puede deshacer.`)) {
        return;
    }

    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`/api/admin/teams/${teamId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const result = await response.json();

        if (response.ok) {
            alert(`Equipo "${teamName}" eliminado exitosamente`);
            await loadTeams(); // Recargar lista de equipos
        } else {
            alert('Error: ' + result.error);
        }
    } catch (error) {
        console.error('Error eliminando equipo:', error);
        alert('Error de conexión');
    }
}


// ============= GESTIÓN DE PARTIDOS =============

// ============= GESTIÓN DE PARTIDOS CON PAGINACIÓN =============

async function loadMatches(page = 1) {
    try {
        console.log(`📊 Cargando partidos - Página: ${page}`);
        
        // Mostrar loading
        const container = document.getElementById('matchesList');
        if (container) {
            container.innerHTML = `
                <div class="loading-state">
                    <div class="loading-spinner"></div>
                    <p>Cargando partidos...</p>
                </div>
            `;
        }
        
        const token = localStorage.getItem('token');
        const limit = 10; // Partidos por página
        
        // Construir URL con parámetros
        const params = new URLSearchParams({
            page: page,
            limit: limit,
            ...currentFilters
        });
        
        const response = await fetch(`/api/matches/with-predictions?${params}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
            const data = await response.json();
            currentPage = data.pagination.currentPage;
            totalPages = data.pagination.totalPages;
            
            displayMatches(data.matches, data.pagination);
            updatePaginationControls(data.pagination);
            
            console.log(`✅ ${data.matches.length} partidos cargados`);
        } else {
            throw new Error('Error cargando partidos');
        }
        
    } catch (error) {
        console.error('❌ Error cargando partidos:', error);
        const container = document.getElementById('matchesList');
        if (container) {
            container.innerHTML = `
                <div class="error-state">
                    <div class="error-icon">⚠️</div>
                    <p>Error cargando partidos</p>
                    <button class="btn btn-secondary btn-small" onclick="loadMatches()">
                        🔄 Reintentar
                    </button>
                </div>
            `;
        }
    }
}


// Función displayMatches mejorada con paginación
function displayMatches(matches, pagination) {
    const container = document.getElementById('matchesList');

    if (!container) {
        console.warn('⚠️ Container matchesList no encontrado');
        return;
    }

    if (!matches || matches.length === 0) {
        container.innerHTML = `
            <div class="no-data">
                <p>⚽ No hay partidos</p>
                <small>No se encontraron partidos con los filtros aplicados.</small>
            </div>
        `;
        return;
    }

    let html = `
        <!-- Info de paginación -->
        <div class="pagination-info">
            <span class="matches-count">
                📊 Mostrando ${pagination.startIndex}-${pagination.endIndex} de ${pagination.totalMatches} partidos
            </span>
            <div class="view-options">
                <select id="statusFilter" onchange="applyFilters()" class="filter-select">
                    <option value="all" ${currentFilters.status === 'all' ? 'selected' : ''}>Todos los estados</option>
                    <option value="scheduled" ${currentFilters.status === 'scheduled' ? 'selected' : ''}>Programados</option>
                    <option value="finished" ${currentFilters.status === 'finished' ? 'selected' : ''}>Finalizados</option>
                </select>
                <select id="tournamentFilter" onchange="applyFilters()" class="filter-select">
                    <option value="">Todos los torneos</option>
                </select>
            </div>
        </div>
        
        <!-- Lista de partidos -->
        <div class="matches-grid">
    `;
    
    matches.forEach(match => {
        // MANEJO DEFENSIVO DE VALORES UNDEFINED/NULL
        const phaseName = match.phase_name || 'Sin fase';
        const resultPoints = match.result_points || 1;          
        const exactScorePoints = match.exact_score_points || 3; 
        const predictionsCount = match.predictions_count || 0;
        const tournamentName = match.tournament_name || 'Sin torneo';
        
        // Formatear fecha de manera segura
        let formattedDate = 'Fecha inválida';
        try {
            formattedDate = formatDateTime(match.match_date);
        } catch (e) {
            console.warn('Error formateando fecha:', match.match_date);
        }

        // Estado del partido de manera segura
        const status = match.status || 'scheduled';
        const statusText = getMatchStatusText(status);

        // Resultado del partido
        let scoreDisplay;
        if (status === 'finished' && match.home_score !== null && match.away_score !== null) {
            scoreDisplay = `${match.home_score || 0} - ${match.away_score || 0}`;
        } else {
            scoreDisplay = statusText;
        }

        html += `
            <div class="match-card-admin" data-match-id="${match.id}">
                <div class="match-grid">
                    <div class="match-teams">
                        <div class="teams-line">
                            <strong>${match.home_team || 'Equipo Local'} vs ${match.away_team || 'Equipo Visitante'}</strong>
                        </div>
                        <small class="match-details">
                            📋 ${phaseName} (${resultPoints} pts) - ${tournamentName}
                        </small>
                    </div>
                    
                    <div class="match-date">
                        <span class="date-text">${formattedDate}</span>
                    </div>
                    
                    <div class="match-score ${status}">
                        <span class="score-text">${scoreDisplay}</span>
                    </div>
                    
                    <div class="match-actions">
                        <div class="predictions-info">
                            <small>${predictionsCount} predicción${predictionsCount !== 1 ? 'es' : ''}</small>
                        </div>
                        <div class="action-buttons">
                            ${status === 'scheduled' ? `
                                <button class="btn btn-primary btn-small" 
                                        onclick="updateMatchResult('${match.id}', '${match.home_team}', '${match.away_team}')">
                                    ⚽ Actualizar Resultado
                                </button>
                            ` : `
                                <button class="btn btn-secondary btn-small" 
                                        onclick="viewMatchDetails('${match.id}')">
                                    👁️ Ver Detalles
                                </button>
                                <button class="btn btn-outline btn-small" 
                                        onclick="resetMatch('${match.id}')">
                                    🔄 Resetear
                                </button>
                            `}
                        </div>
                    </div>
                </div>
            </div>
        `;
    });
    
    html += '</div>';
    container.innerHTML = html;
    
    // Cargar filtro de torneos si no está cargado
    loadTournamentFilterOptions();
    
    console.log('✅ Partidos renderizados correctamente con paginación');
}

// ============= FUNCIONES DE PAGINACIÓN =============

function updatePaginationControls(pagination) {
    // Buscar o crear contenedor de paginación
    let paginationContainer = document.getElementById('matchesPagination');
    if (!paginationContainer) {
        paginationContainer = document.createElement('div');
        paginationContainer.id = 'matchesPagination';
        paginationContainer.className = 'pagination-container';
        
        const matchesContainer = document.getElementById('matchesList');
        if (matchesContainer && matchesContainer.parentNode) {
            matchesContainer.parentNode.insertBefore(paginationContainer, matchesContainer.nextSibling);
        }
    }
    
    if (pagination.totalPages <= 1) {
        paginationContainer.innerHTML = '';
        return;
    }
    
    let html = '<div class="pagination-controls">';
    
    // Botón anterior
    if (pagination.hasPrevPage) {
        html += `
            <button class="btn btn-secondary btn-small" onclick="loadMatches(${pagination.currentPage - 1})">
                ◀️ Anterior
            </button>
        `;
    }
    
    // Números de página
    html += '<div class="page-numbers">';
    
    const startPage = Math.max(1, pagination.currentPage - 2);
    const endPage = Math.min(pagination.totalPages, pagination.currentPage + 2);
    
    if (startPage > 1) {
        html += `<button class="btn btn-outline btn-small" onclick="loadMatches(1)">1</button>`;
        if (startPage > 2) {
            html += '<span class="page-dots">...</span>';
        }
    }
    
    for (let i = startPage; i <= endPage; i++) {
        const isActive = i === pagination.currentPage;
        html += `
            <button class="btn ${isActive ? 'btn-primary' : 'btn-outline'} btn-small" 
                    onclick="loadMatches(${i})" 
                    ${isActive ? 'disabled' : ''}>
                ${i}
            </button>
        `;
    }
    
    if (endPage < pagination.totalPages) {
        if (endPage < pagination.totalPages - 1) {
            html += '<span class="page-dots">...</span>';
        }
        html += `<button class="btn btn-outline btn-small" onclick="loadMatches(${pagination.totalPages})">${pagination.totalPages}</button>`;
    }
    
    html += '</div>';
    
    // Botón siguiente
    if (pagination.hasNextPage) {
        html += `
            <button class="btn btn-secondary btn-small" onclick="loadMatches(${pagination.currentPage + 1})">
                Siguiente ▶️
            </button>
        `;
    }
    
    html += '</div>';
    paginationContainer.innerHTML = html;
}

// Función para aplicar filtros
async function applyFilters() {
    const statusFilter = document.getElementById('statusFilter')?.value || 'all';
    const tournamentFilter = document.getElementById('tournamentFilter')?.value || '';
    
    currentFilters = {
        status: statusFilter,
        tournament_id: tournamentFilter
    };
    
    // Resetear a página 1 cuando se aplican filtros
    await loadMatches(1);
}

// Función para cargar opciones del filtro de torneos
async function loadTournamentFilterOptions() {
    const tournamentFilter = document.getElementById('tournamentFilter');
    if (!tournamentFilter || tournamentFilter.children.length > 1) return; // Ya está cargado
    
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/admin/tournaments', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const tournaments = await response.json();
            tournaments.forEach(tournament => {
                const option = document.createElement('option');
                option.value = tournament.id;
                option.textContent = `${tournament.name} (${tournament.status})`;
                if (currentFilters.tournament_id == tournament.id) {
                    option.selected = true;
                }
                tournamentFilter.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Error cargando filtro de torneos:', error);
    }
}

// Función para resetear partido (nueva)
async function resetMatch(matchId) {
    if (!confirm('¿Estás seguro de que quieres resetear este partido?\\n\\nEsto eliminará el resultado y pondrá las predicciones en 0 puntos.')) {
        return;
    }
    
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`/api/admin/reset-match/${matchId}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (response.ok) {
            const result = await response.json();
            alert('✅ ' + result.message);
            await loadMatches(currentPage); // Recargar página actual
        } else {
            const error = await response.json();
            alert('❌ Error: ' + error.error);
        }
    } catch (error) {
        console.error('Error reseteando partido:', error);
        alert('❌ Error de conexión');
    }
}



// Reemplaza formatDateTime en admin.js:

function formatDateTime(dateString) {
    if (!dateString) return 'Sin fecha';
    
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return 'Fecha inválida';
        
        return date.toLocaleDateString('es-CO', {
            day: '2-digit',
            month: '2-digit', 
            year: 'numeric',
            timeZone: 'America/Bogota'
        }) + ' ' + date.toLocaleTimeString('es-CO', { 
            hour: '2-digit', 
            minute: '2-digit',
            timeZone: 'America/Bogota'
        });
    } catch (error) {
        return 'Fecha inválida';
    }
}


function getMatchStatusText(status) {
    const statusMap = {
        'scheduled': '⏰ Programado',
        'live': '🔴 En vivo',
        'finished': '✅ Finalizado',
        'postponed': '⏸️ Pospuesto',
        'cancelled': '❌ Cancelado'
    };
    return statusMap[status] || status || 'Estado desconocido';
}

async function updateMatchResult(matchId, homeTeam, awayTeam) {
    try {
        console.log(`🔍 Obteniendo información del partido: ${matchId}`);
        
        // Usar endpoint específico para obtener información del partido
        const token = localStorage.getItem('token');
        const response = await fetch(`/api/matches/${matchId}/info`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        let match = null;
        let isEliminatory = false;
        
        if (response.ok) {
            const data = await response.json();
            match = data.match;
            isEliminatory = data.is_eliminatory;
            
            console.log('✅ Información del partido obtenida:', {
                matchId,
                phase_name: match?.phase_name,
                is_eliminatory: isEliminatory,
                backend_is_eliminatory: match?.is_eliminatory
            });
        } else {
            console.warn('⚠️ No se pudo obtener información del partido, continuando sin datos de fase');
        }

        const modal = document.createElement('div');
        modal.className = 'prediction-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>⚽ Actualizar Resultado</h3>
                    <button class="close-modal" onclick="closeModal()">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="match-title">
                        <strong>${homeTeam} vs ${awayTeam}</strong>
                        ${match ? `<small>📋 Fase: ${match.phase_name} (${match.result_points || 1} pts resultado, ${match.exact_score_points || 3} pts exacto)</small>` : ''}
                        ${isEliminatory ? '<span class="eliminatory-badge-modal">🏆 ELIMINATORIA</span>' : ''}
                    </div>
                    
                    ${isEliminatory ? `
                        <div class="eliminatory-notice">
                            <h4>⚠️ Fase Eliminatoria Detectada</h4>
                            <p>Esta es una fase eliminatoria. Si el resultado es empate en 90 minutos, 
                            deberás especificar quién ganó en penaltis o alargue.</p>
                        </div>
                    ` : ''}
                    
                    <form id="updateResultForm" onsubmit="submitMatchResult(event, '${matchId}', ${isEliminatory})">
                        <div class="score-section">
                            <h4>Resultado en 90 minutos:</h4>
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
                        </div>
                        
                        ${isEliminatory ? `
                            <div id="penaltySection" class="advance-section" style="display: none;">
                                <h4>🥅 ¿Quién ganó en penaltis/alargue?</h4>
                                <div class="advance-options">
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
                        
                        <div class="validation-message" id="validationMessage" style="display: none;"></div>
                        
                        <div class="modal-actions">
                            <button type="button" class="btn btn-secondary" onclick="closeModal()">
                                Cancelar
                            </button>
                            <button type="submit" class="btn btn-primary" id="submitButton">
                                Actualizar Resultado
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Lógica para manejar empates en eliminatorias
        if (isEliminatory) {
            const homeScoreInput = modal.querySelector('input[name="homeScore"]');
            const awayScoreInput = modal.querySelector('input[name="awayScore"]');
            const penaltySection = modal.querySelector('#penaltySection');
            const validationMessage = modal.querySelector('#validationMessage');
            const penaltyOptions = modal.querySelectorAll('input[name="penaltyWinner"]');

            function checkForDraw() {
                const homeScore = parseInt(homeScoreInput.value);
                const awayScore = parseInt(awayScoreInput.value);

                console.log(`🔄 Verificando empate: ${homeScore} vs ${awayScore}`);

                if (homeScore === awayScore) {
                    console.log('⚠️ Empate detectado, mostrando sección de penaltis');
                    penaltySection.style.display = 'block';
                    validationMessage.style.display = 'block';
                    validationMessage.className = 'validation-message warning';
                    validationMessage.textContent = '⚠️ Empate detectado en fase eliminatoria. Selecciona el ganador en penaltis.';
                    penaltyOptions.forEach(opt => opt.required = true);
                } else {
                    console.log('✅ No hay empate, ocultando sección de penaltis');
                    penaltySection.style.display = 'none';
                    validationMessage.style.display = 'none';
                    penaltyOptions.forEach(opt => {
                        opt.required = false;
                        opt.checked = false;
                    });
                }
            }

            homeScoreInput.addEventListener('input', checkForDraw);
            awayScoreInput.addEventListener('input', checkForDraw);
            
            // Verificar inmediatamente al cargar
            checkForDraw();
        }

    } catch (error) {
        console.error('❌ Error preparando formulario de resultado:', error);
        alert('Error cargando información del partido: ' + error.message);
    }
}


// Función mejorada para enviar resultado (NUEVA)
async function submitMatchResult(event, matchId, isEliminatory = false) {
    event.preventDefault();

    const form = event.target;
    const formData = new FormData(form);
    const submitButton = form.querySelector('#submitButton');
    const validationMessage = form.querySelector('#validationMessage');

    const result = {
        home_score: parseInt(formData.get('homeScore')),
        away_score: parseInt(formData.get('awayScore'))
    };

    // ✅ VALIDACIÓN PARA ELIMINATORIAS
    if (isEliminatory && result.home_score === result.away_score) {
        const penaltyWinner = formData.get('penaltyWinner');
        if (!penaltyWinner) {
            validationMessage.style.display = 'block';
            validationMessage.className = 'validation-message error';
            validationMessage.textContent = '❌ Debes seleccionar el ganador en penaltis para fases eliminatorias.';
            return;
        }
        result.penalty_winner = penaltyWinner;
    }

    try {
        submitButton.disabled = true;
        submitButton.textContent = 'Actualizando...';

        const token = localStorage.getItem('token');
        const response = await fetch(`/api/matches/${matchId}/result`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(result)
        });

        const responseData = await response.json();

        if (response.ok) {
            let successMessage = `¡Resultado actualizado!\\n\\n`;
            successMessage += `${responseData.score}\\n`;
            if (responseData.penalty_winner) {
                const winnerName = responseData.penalty_winner === 'home' ? 
                    form.querySelector('input[name="homeScore"]').closest('.score-input').querySelector('label').textContent :
                    form.querySelector('input[name="awayScore"]').closest('.score-input').querySelector('label').textContent;
                successMessage += `🏆 Ganador en penaltis: ${winnerName}\\n`;
            }
            successMessage += `\\n${responseData.predictions_updated} predicciones procesadas.`;

            if (responseData.phase_info) {
                successMessage += `\\nFase: ${responseData.phase_info.name}`;
            }

            alert(successMessage);
            closeModal();
            await loadMatches(currentPage); // Recargar página actual
        } else {
            validationMessage.style.display = 'block';
            validationMessage.className = 'validation-message error';
            validationMessage.textContent = '❌ ' + responseData.error;

            if (responseData.requires_penalty_winner) {
                // Mostrar automáticamente la sección de penaltis
                const penaltySection = form.querySelector('#penaltySection');
                if (penaltySection) {
                    penaltySection.style.display = 'block';
                }
            }
        }
    } catch (error) {
        console.error('Error actualizando resultado:', error);
        validationMessage.style.display = 'block';
        validationMessage.className = 'validation-message error';
        validationMessage.textContent = '❌ Error de conexión: ' + error.message;
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = 'Actualizar Resultado';
    }
}



// ============= FUNCIONES AUXILIARES =============

// Función mejorada para cerrar modales específicos
function closeModal(modalElement = null) {
    if (modalElement) {
        // Cerrar modal específico
        modalElement.remove();
    } else {
        // Cerrar el modal más reciente (comportamiento por defecto)
        const modals = document.querySelectorAll('.prediction-modal, .leaderboard-modal');
        if (modals.length > 0) {
            modals[modals.length - 1].remove();
        }
    }
}

// Función específica para cerrar modal de edición de fase
function closePhaseEditModal() {
    const editModals = document.querySelectorAll('.prediction-modal');
    // Buscar el modal de edición (el más reciente)
    if (editModals.length > 0) {
        editModals[editModals.length - 1].remove();
    }
}


function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/index.html';
}

// Funciones placeholder para futuras implementaciones
// ============= GESTIÓN COMPLETA DE FASES =============

// Función para gestionar fases de un torneo (IMPLEMENTACIÓN COMPLETA)
async function manageTournamentPhases(tournamentId, tournamentName) {
    try {
        const token = localStorage.getItem('token');

        // Cargar fases del torneo
        const response = await fetch(`/api/admin/tournaments/${tournamentId}/phases`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            throw new Error('Error cargando fases');
        }

        const phases = await response.json();
        showPhasesManagementModal(tournamentId, tournamentName, phases);

    } catch (error) {
        console.error('Error gestionando fases:', error);
        alert('Error cargando fases: ' + error.message);
    }
}

// Modal para gestión de fases (NUEVA)
function showPhasesManagementModal(tournamentId, tournamentName, phases) {
    const modal = document.createElement('div');
    modal.className = 'prediction-modal';
    modal.innerHTML = `
        <div class="modal-content large">
            <div class="modal-header">
                <h3>⚙️ Gestionar Fases: ${tournamentName}</h3>
                <button class="close-modal" onclick="closeModal()">&times;</button>
            </div>
            <div class="modal-body">
                <div class="phases-header">
                    <div class="phases-actions">
                        <button class="btn btn-primary btn-small" onclick="showCreatePhaseForm(${tournamentId})">
                            + Crear Fase
                        </button>
                        <button class="btn btn-secondary btn-small" onclick="createStandardPhases(${tournamentId})">
                            🔄 Crear Fases Estándar
                        </button>
                    </div>
                </div>
                
                <div id="phasesList">
                    ${displayPhasesList(phases, tournamentId)}
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
}

// Mostrar lista de fases (NUEVA)
function displayPhasesList(phases, tournamentId) {
    if (phases.length === 0) {
        return `
            <div class="no-data">
                <p>📋 No hay fases creadas para este torneo</p>
                <small>Crea fases para organizar los partidos y configurar puntuación</small>
            </div>
        `;
    }

    return phases.map(phase => `
        <div class="phase-card" data-phase-id="${phase.id}">
            <div class="phase-header">
                <div class="phase-info">
                    <div class="phase-name">
                        ${phase.name}
                        ${phase.is_eliminatory ? '<span class="eliminatory-badge">ELIMINATORIA</span>' : ''}
                    </div>
                    <div class="phase-details">
                        <span>Orden: ${phase.order_index}</span>
                        <span>Multiplicador: ${phase.points_multiplier}x</span>
                        <span>Partidos: ${phase.matches_count || 0}</span>
                    </div>
                </div>
                <div class="phase-actions">
                    <button class="btn btn-secondary btn-small" onclick="editPhase(${phase.id}, ${tournamentId})">
                        ✏️ Editar
                    </button>
                    <button class="btn btn-danger btn-small" onclick="deletePhase(${phase.id}, '${phase.name}', ${tournamentId})">
                        🗑️ Eliminar
                    </button>
                </div>
            </div>
            
            <div class="phase-config">
                <div class="config-grid">
                    <div class="config-item">
                        <label>Resultado correcto:</label>
                        <span>${phase.result_points || 1} puntos</span>
                    </div>
                    <div class="config-item">
                        <label>Marcador exacto:</label>
                        <span>${phase.exact_score_points || 3} puntos</span>
                    </div>
                    ${phase.winner_points ? `
                        <div class="config-item">
                            <label>Bonus campeón:</label>
                            <span>${phase.winner_points} puntos</span>
                        </div>
                    ` : ''}
                </div>
                ${phase.description ? `
                    <div class="phase-description">
                        <small>${phase.description}</small>
                    </div>
                ` : ''}
            </div>
        </div>
    `).join('');
}

// Crear fase personalizada (NUEVA)
function showCreatePhaseForm(tournamentId) {
    const modal = document.createElement('div');
    modal.className = 'prediction-modal';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>➕ Crear Nueva Fase</h3>
                <button class="close-modal" onclick="closeModal()">&times;</button>
            </div>
            <div class="modal-body">
                <form id="createPhaseForm" onsubmit="createPhase(event, ${tournamentId})">
                    <div class="form-row">
                        <div class="form-group">
                            <label for="phaseName">Nombre de la Fase</label>
                            <input type="text" id="phaseName" name="name" required 
                                   placeholder="ej: Cuartos de Final">
                        </div>
                        
                        <div class="form-group">
                            <label for="phaseOrder">Orden</label>
                            <input type="number" id="phaseOrder" name="order_index" required 
                                   min="1" placeholder="1">
                        </div>
                    </div>
                    
                    <div class="form-row">
                        <div class="form-group">
                            <label for="phaseMultiplier">Multiplicador (Legacy - No usado)</label>
                            <input type="number" id="phaseMultiplier" name="points_multiplier" 
                                min="1" max="20" value="1" readonly style="background: #f7fafc;">
                            <small>Este campo se mantiene por compatibilidad pero no se usa en el cálculo</small>
                        </div>
                        
                        <div class="form-group">
                            <label class="checkbox-label">
                                <input type="checkbox" id="isEliminatory" name="is_eliminatory">
                                <span>Es Fase Eliminatoria</span>
                            </label>
                            <small>En fases eliminatorias no se permiten empates</small>
                        </div>
                    </div>

                    <div class="points-explanation">
                        <h4>📊 Cómo funciona la puntuación:</h4>
                        <ul>
                            <li><strong>Resultado Correcto:</strong> Si el usuario acierta quién gana (local/empate/visitante)</li>
                            <li><strong>Marcador Exacto:</strong> Si el usuario acierta el marcador exacto (ej: 2-1)</li>
                            <li><strong>Puntos Totales:</strong> Resultado Correcto + Marcador Exacto + Bonus</li>
                        </ul>
                        <div class="example">
                            <strong>Ejemplo:</strong> Si configuras 4 puntos por resultado y 8 por marcador exacto:
                            <br>• Usuario acierta solo resultado → 4 puntos
                            <br>• Usuario acierta solo marcador → 8 puntos  
                            <br>• Usuario acierta ambos → 4 + 8 = 12 puntos
                        </div>
                    </div>

                    
                    <div class="form-row">
                        <div class="form-group">
                            <label for="resultPoints">Puntos por Resultado Correcto</label>
                            <input type="number" id="resultPoints" name="result_points" 
                                   min="1" max="50" placeholder="1">
                        </div>
                        
                        <div class="form-group">
                            <label for="scorePoints">Puntos por Marcador Exacto</label>
                            <input type="number" id="scorePoints" name="exact_score_points" 
                                   min="1" max="50" placeholder="3">
                        </div>
                    </div>
                    
                    <div class="form-row">
                        <div class="form-group">
                            <label for="winnerPoints">Puntos Bonus Campeón (opcional)</label>
                            <input type="number" id="winnerPoints" name="winner_points" 
                                   min="0" max="100" placeholder="0">
                            <small>Solo para fase final</small>
                        </div>
                        
                        <div class="form-group">
                            <label for="topScorerPoints">Puntos Goleador (opcional)</label>
                            <input type="number" id="topScorerPoints" name="top_scorer_points" 
                                   min="0" max="100" placeholder="0">
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label for="phaseDescription">Descripción</label>
                        <textarea id="phaseDescription" name="description" rows="3"
                                placeholder="Descripción de la fase..."></textarea>
                    </div>
                    
                    <div class="modal-actions">
                        <button type="button" class="btn btn-secondary" onclick="closeModal()">
                            Cancelar
                        </button>
                        <button type="submit" class="btn btn-primary">
                            Crear Fase
                        </button>
                    </div>
                </form>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Auto-completar valores por defecto cuando se marca eliminatoria
    document.getElementById('isEliminatory').addEventListener('change', function (e) {
        if (e.target.checked) {
            document.getElementById('resultPoints').value = '4';
            document.getElementById('scorePoints').value = '8';
        } else {
            document.getElementById('resultPoints').value = '1';
            document.getElementById('scorePoints').value = '3';
        }
    });
}

// Crear fase (NUEVA)
async function createPhase(event, tournamentId) {
    event.preventDefault();

    const form = event.target;
    const formData = new FormData(form);

    const phaseData = {
        tournament_id: tournamentId,
        name: formData.get('name'),
        order_index: parseInt(formData.get('order_index')),
        points_multiplier: parseInt(formData.get('points_multiplier')),
        is_eliminatory: formData.get('is_eliminatory') === 'on',
        result_points: parseInt(formData.get('result_points')) || 1,
        exact_score_points: parseInt(formData.get('exact_score_points')) || 3,
        winner_points: parseInt(formData.get('winner_points')) || 0,
        top_scorer_points: parseInt(formData.get('top_scorer_points')) || 0,
        description: formData.get('description') || ''
    };

    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`/api/admin/tournaments/${tournamentId}/phases`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(phaseData)
        });

        const result = await response.json();

        if (response.ok) {
            alert(`¡Fase "${phaseData.name}" creada exitosamente!`);
            closeModal();
            // Recargar gestión de fases
            manageTournamentPhases(tournamentId, 'Torneo');
        } else {
            alert('Error: ' + result.error);
        }
    } catch (error) {
        console.error('Error creando fase:', error);
        alert('Error de conexión: ' + error.message);
    }
}

// Editar fase (NUEVA)
async function editPhase(phaseId, tournamentId) {
    try {
        const token = localStorage.getItem('token');

        // Obtener datos actuales de la fase
        const response = await fetch(`/api/admin/tournaments/${tournamentId}/phases`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const phases = await response.json();
        const phase = phases.find(p => p.id === phaseId);

        if (!phase) {
            alert('Fase no encontrada');
            return;
        }

        showEditPhaseForm(phase, tournamentId);

    } catch (error) {
        console.error('Error obteniendo datos de la fase:', error);
        alert('Error cargando datos de la fase');
    }
}

// Formulario de edición de fase (NUEVA)
function showEditPhaseForm(phase, tournamentId) {
    const modal = document.createElement('div');
    modal.className = 'prediction-modal';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>✏️ Editar Fase: ${phase.name}</h3>
                <button class="close-modal" onclick="closePhaseEditModal()">&times;</button>
            </div>
            <div class="modal-body">
                <form id="editPhaseForm" onsubmit="updatePhase(event, ${phase.id}, ${tournamentId})">
                    <div class="form-row">
                        <div class="form-group">
                            <label for="editPhaseName">Nombre de la Fase</label>
                            <input type="text" id="editPhaseName" name="name" required 
                                   value="${phase.name}" placeholder="ej: Cuartos de Final">
                        </div>
                        
                        <div class="form-group">
                            <label for="editPhaseOrder">Orden</label>
                            <input type="number" id="editPhaseOrder" name="order_index" required 
                                   value="${phase.order_index}" min="1">
                        </div>
                    </div>
                    
                    <div class="form-row">
                        <div class="form-group">
                            <label for="editPhaseMultiplier">Multiplicador de Puntos</label>
                            <input type="number" id="editPhaseMultiplier" name="points_multiplier" required 
                                   value="${phase.points_multiplier}" min="1" max="20">
                        </div>
                        
                        <div class="form-group">
                            <label class="checkbox-label">
                                <input type="checkbox" id="editIsEliminatory" name="is_eliminatory" 
                                       ${phase.is_eliminatory ? 'checked' : ''}>
                                <span>Es Fase Eliminatoria</span>
                            </label>
                            <small>En fases eliminatorias no se permiten empates</small>
                        </div>
                    </div>
                    
                    <div class="form-row">
                        <div class="form-group">
                            <label for="editResultPoints">Puntos por Resultado Correcto</label>
                            <input type="number" id="editResultPoints" name="result_points" 
                                   value="${phase.result_points || 1}" min="1" max="50">
                        </div>
                        
                        <div class="form-group">
                            <label for="editScorePoints">Puntos por Marcador Exacto</label>
                            <input type="number" id="editScorePoints" name="exact_score_points" 
                                   value="${phase.exact_score_points || 3}" min="1" max="50">
                        </div>
                    </div>
                    
                    <div class="form-row">
                        <div class="form-group">
                            <label for="editWinnerPoints">Puntos Bonus Campeón</label>
                            <input type="number" id="editWinnerPoints" name="winner_points" 
                                   value="${phase.winner_points || 0}" min="0" max="100">
                        </div>
                        
                        <div class="form-group">
                            <label for="editTopScorerPoints">Puntos Goleador</label>
                            <input type="number" id="editTopScorerPoints" name="top_scorer_points" 
                                   value="${phase.top_scorer_points || 0}" min="0" max="100">
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label for="editPhaseDescription">Descripción</label>
                        <textarea id="editPhaseDescription" name="description" rows="3"
                                placeholder="Descripción de la fase...">${phase.description || ''}</textarea>
                    </div>
                    
                    <div class="modal-actions">
                        <button type="button" class="btn btn-secondary" onclick="closePhaseEditModal()">
                            Cancelar
                        </button>
                        <button type="submit" class="btn btn-primary">
                            Actualizar Fase
                        </button>
                    </div>
                </form>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
}

// Actualizar fase (NUEVA)
async function updatePhase(event, phaseId, tournamentId) {
    event.preventDefault();

    const form = event.target;
    const formData = new FormData(form);

    const phaseData = {
        name: formData.get('name'),
        order_index: parseInt(formData.get('order_index')),
        points_multiplier: parseInt(formData.get('points_multiplier')),
        is_eliminatory: formData.get('is_eliminatory') === 'on',
        result_points: parseInt(formData.get('result_points')) || 1,
        exact_score_points: parseInt(formData.get('exact_score_points')) || 3,
        winner_points: parseInt(formData.get('winner_points')) || 0,
        top_scorer_points: parseInt(formData.get('top_scorer_points')) || 0,
        description: formData.get('description') || ''
    };

    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`/api/admin/phases/${phaseId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(phaseData)
        });

        const result = await response.json();

        if (response.ok) {
            alert(`¡Fase "${phaseData.name}" actualizada exitosamente!`);
            closeModal();
            // Recargar gestión de fases
            manageTournamentPhases(tournamentId, 'Torneo');
        } else {
            alert('Error: ' + result.error);
        }
    } catch (error) {
        console.error('Error actualizando fase:', error);
        alert('Error de conexión: ' + error.message);
    }
}

// Eliminar fase (NUEVA)
async function deletePhase(phaseId, phaseName, tournamentId) {
    if (!confirm(`¿Estás seguro de que quieres eliminar la fase "${phaseName}"?\n\nEsta acción no se puede deshacer.`)) {
        return;
    }

    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`/api/admin/phases/${phaseId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const result = await response.json();

        if (response.ok) {
            alert(`Fase "${phaseName}" eliminada exitosamente`);
            // Recargar gestión de fases
            manageTournamentPhases(tournamentId, 'Torneo');
        } else {
            alert('Error: ' + result.error);
        }
    } catch (error) {
        console.error('Error eliminando fase:', error);
        alert('Error de conexión: ' + error.message);
    }
}

// Crear fases estándar (MEJORADA)
async function createStandardPhases(tournamentId) {
    const tournamentTypes = [
        { value: 'world_cup', label: 'Mundial FIFA (6 fases)' },
        { value: 'club_world_cup', label: 'Mundial de Clubes (3 fases)' }
    ];

    const typeSelection = await showTournamentTypeSelector(tournamentTypes);
    if (!typeSelection) return;

    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`/api/admin/tournaments/${tournamentId}/phases/standard`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ tournament_type: typeSelection })
        });

        const result = await response.json();

        if (response.ok) {
            alert(`¡Fases estándar creadas exitosamente!\n\n✅ ${result.created_phases} fases creadas\n❌ ${result.errors} errores`);
            // Recargar gestión de fases
            manageTournamentPhases(tournamentId, 'Torneo');
        } else {
            alert('Error: ' + result.error);
        }
    } catch (error) {
        console.error('Error creando fases estándar:', error);
        alert('Error de conexión: ' + error.message);
    }
}

// Selector de tipo de torneo (NUEVA)
function showTournamentTypeSelector(types) {
    return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.className = 'prediction-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>🏆 Seleccionar Tipo de Torneo</h3>
                    <button class="close-modal" onclick="this.closest('.prediction-modal').remove(); window.tempResolve(null);">&times;</button>
                </div>
                <div class="modal-body">
                    <p>Selecciona el tipo de torneo para crear las fases estándar correspondientes:</p>
                    
                    <div class="tournament-type-options">
                        ${types.map(type => `
                            <div class="tournament-type-option" onclick="window.tempResolve('${type.value}')">
                                <h4>${type.label}</h4>
                                <small>Crea automáticamente las fases típicas de este tipo de torneo</small>
                            </div>
                        `).join('')}
                    </div>
                    
                    <div class="modal-actions">
                        <button type="button" class="btn btn-secondary" onclick="this.closest('.prediction-modal').remove(); window.tempResolve(null);">
                            Cancelar
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Función global temporal para selección
        window.tempResolve = (type) => {
            modal.remove();
            delete window.tempResolve;
            resolve(type);
        };
    });
}

function viewTournamentDetails(tournamentId) {
    alert(`Funcionalidad próximamente: Ver detalles del torneo ${tournamentId}`);
}


async function showCreateMatchForm() {
    try {
        // Cargar datos necesarios
        const token = localStorage.getItem('token');

        // Cargar torneos
        const tournamentsResponse = await fetch('/api/admin/tournaments', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const tournaments = tournamentsResponse.ok ? await tournamentsResponse.json() : [];

        // Cargar equipos
        const teamsResponse = await fetch('/api/admin/teams', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const teams = teamsResponse.ok ? await teamsResponse.json() : [];

        // Crear modal
        const modal = document.createElement('div');
        modal.className = 'prediction-modal';
        modal.innerHTML = `
            <div class="modal-content large">
                <div class="modal-header">
                    <h3>⚽ Crear Nuevo Partido</h3>
                    <button class="close-modal" onclick="closeModal()">&times;</button>
                </div>
                <div class="modal-body">
                    <form id="createMatchForm" onsubmit="createMatch(event)">
                        <div class="form-row">
                            <div class="form-group">
                                <label for="matchTournament">Torneo</label>
                                <select id="matchTournament" name="tournament_id" required onchange="loadTournamentPhases()">
                                    <option value="">Seleccionar torneo</option>
                                    ${tournaments.map(t => `
                                        <option value="${t.id}" ${t.status === 'active' ? 'selected' : ''}>${t.name} (${t.status})</option>
                                    `).join('')}
                                </select>
                            </div>
                            
                            <div class="form-group">
                                <label for="matchPhase">Fase</label>
                                <select id="matchPhase" name="phase_id" required>
                                    <option value="">Seleccionar fase</option>
                                </select>
                            </div>
                        </div>
                        
                        <div class="form-row">
                            <div class="form-group">
                                <label for="homeTeam">Equipo Local</label>
                                <select id="homeTeam" name="home_team_id" required>
                                    <option value="">Seleccionar equipo local</option>
                                    ${teams.map(t => `
                                        <option value="${t.id}">${t.name} ${t.country ? `(${t.country})` : ''}</option>
                                    `).join('')}
                                </select>
                            </div>
                            
                            <div class="form-group">
                                <label for="awayTeam">Equipo Visitante</label>
                                <select id="awayTeam" name="away_team_id" required>
                                    <option value="">Seleccionar equipo visitante</option>
                                    ${teams.map(t => `
                                        <option value="${t.id}">${t.name} ${t.country ? `(${t.country})` : ''}</option>
                                    `).join('')}
                                </select>
                            </div>
                        </div>
                        
                        <div class="form-group">
                            <label for="matchDate">Fecha y Hora del Partido</label>
                            <input type="datetime-local" id="matchDate" name="match_date" required>
                        </div>
                        
                        <div class="form-group">
                            <label for="externalMatchId">ID Externo (opcional)</label>
                            <input type="text" id="externalMatchId" name="external_match_id" 
                                   placeholder="ID de API externa para sincronización automática">
                        </div>
                        
                        <div class="modal-actions">
                            <button type="button" class="btn btn-secondary" onclick="closeModal()">
                                Cancelar
                            </button>
                            <button type="submit" class="btn btn-primary">
                                Crear Partido
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Si hay un torneo seleccionado, cargar sus fases automáticamente
        const selectedTournament = document.getElementById('matchTournament').value;
        if (selectedTournament) {
            loadTournamentPhases();
        }

    } catch (error) {
        console.error('Error cargando datos para crear partido:', error);
        alert('Error cargando datos necesarios: ' + error.message);
    }
}

// Función para cargar fases cuando se selecciona un torneo (NUEVA)
async function loadTournamentPhases() {
    const tournamentSelect = document.getElementById('matchTournament');
    const phaseSelect = document.getElementById('matchPhase');
    const tournamentId = tournamentSelect.value;

    // Limpiar fases
    phaseSelect.innerHTML = '<option value="">Seleccionar fase</option>';

    if (!tournamentId) return;

    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`/api/admin/tournaments/${tournamentId}/phases`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const phases = await response.json();
            phases.forEach(phase => {
                phaseSelect.innerHTML += `
                    <option value="${phase.id}">${phase.name} (${phase.result_points || 1} pts)</option>
                `;
            });
        } else {
            console.error('Error cargando fases:', response.status);
        }
    } catch (error) {
        console.error('Error cargando fases:', error);
    }
}

// Función para crear el partido (NUEVA)
async function createMatch(event) {
    event.preventDefault();

    const form = event.target;
    const formData = new FormData(form);

    const matchData = {
        tournament_id: parseInt(formData.get('tournament_id')),
        phase_id: parseInt(formData.get('phase_id')),
        home_team_id: parseInt(formData.get('home_team_id')),
        away_team_id: parseInt(formData.get('away_team_id')),
        match_date: formData.get('match_date'),
        external_match_id: formData.get('external_match_id') || ''
    };

    // Validación básica
    if (matchData.home_team_id === matchData.away_team_id) {
        alert('Un equipo no puede jugar contra sí mismo');
        return;
    }

    if (!matchData.match_date) {
        alert('La fecha y hora del partido son requeridas');
        return;
    }

    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/admin/matches', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(matchData)
        });

        const result = await response.json();

        if (response.ok) {
            alert(`¡Partido creado exitosamente!\n${result.match.home_team} vs ${result.match.away_team}`);
            closeModal();
            await loadMatches(); // Recargar lista de partidos
        } else {
            alert('Error: ' + result.error);
        }
    } catch (error) {
        console.error('Error creando partido:', error);
        alert('Error de conexión: ' + error.message);
    }
}

// También actualizar la función loadTournamentFilter (NUEVA)
async function loadTournamentFilter() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/admin/tournaments', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const tournaments = await response.json();
            const filterSelect = document.getElementById('tournamentFilter');

            if (filterSelect) {
                filterSelect.innerHTML = '<option value="">Todos los torneos</option>';
                tournaments.forEach(tournament => {
                    filterSelect.innerHTML += `
                        <option value="${tournament.id}">${tournament.name} (${tournament.status})</option>
                    `;
                });
            }
        }
    } catch (error) {
        console.error('Error cargando filtro de torneos:', error);
    }
}

// ✅ REEMPLAZAR CON ESTAS FUNCIONES REALES:

async function loadTournamentFilter() {
    await loadTournamentFilterOptions();
}

async function filterMatchesByTournament() {
    await applyFilters();
}


function filterMatchesByTournament() {
    // Placeholder
}

function loadAllUsers() {
    alert('Funcionalidad próximamente: Gestión completa de usuarios');
}

// Función placeholder para ver detalles (mejorada)
function viewMatchDetails(matchId) {
    console.log(`🔍 Ver detalles del partido: ${matchId}`);
    alert(`Funcionalidad próximamente: Ver detalles del partido ${matchId}`);
    
    // TODO: Implementar modal con:
    // - Todas las predicciones del partido
    // - Estadísticas de aciertos
    // - Distribución de predicciones
}

// ============= GESTIÓN DE TORNEO ACTIVO CON ESTADÍSTICAS =============

// Cargar torneo activo con estadísticas (SIN fetchWithAuth)
async function loadActiveTournament() {
    try {
        console.log('🏆 Cargando torneo activo con estadísticas...');
        
        const token = localStorage.getItem('token');
        const response = await fetch('/api/admin/active-tournament', {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response || !response.ok) {
            console.error('❌ Error obteniendo torneo activo:', response?.status);
            return;
        }
        
        const data = await response.json();
        console.log('📊 Datos del torneo activo:', data);
        
        if (data.active_tournament) {
            displayActiveTournament(data.active_tournament);
        } else {
            console.log('⚠️ No hay torneo activo');
        }
        
    } catch (error) {
        console.error('❌ Error cargando torneo activo:', error);
    }
}

// Mostrar torneo activo con estadísticas
// Mostrar torneo activo con estadísticas
function displayActiveTournament(tournament) {
    console.log('🎯 Mostrando torneo activo:', tournament);
    
    // Buscar el contenedor donde se muestra el torneo activo
    const container = document.getElementById('tournamentsList');
    if (!container) {
        console.warn('⚠️ Container tournamentsList no encontrado');
        return;
    }
    
    // Crear HTML del torneo activo con estadísticas correctas
    const tournamentHTML = `
        <div class="tournament-card">
            <div class="tournament-header">
                <div class="tournament-title">${tournament.name}</div>
                <div class="tournament-status status-${tournament.status}">
                    ACTIVO
                </div>
            </div>
            
            <div class="tournament-info">
                <div><strong>Inicio:</strong> ${formatDate(tournament.start_date)}</div>
                <div><strong>Fin:</strong> ${formatDate(tournament.end_date)}</div>
                <div><strong>Partidos:</strong> ${tournament.total_matches || 0}</div>
                <div><strong>Predicciones:</strong> ${tournament.total_predictions || 0}</div>
            </div>
            
            <div class="tournament-actions">
                <button class="btn btn-primary btn-small" onclick="editActiveTournament(${tournament.id})">
                    ✏️ Editar Torneo
                </button>
                <button class="btn btn-secondary btn-small" onclick="setTournamentStatus(${tournament.id}, 'upcoming')">
                    Desactivar
                </button>
                <button class="btn btn-secondary btn-small" onclick="manageTournamentPhases(${tournament.id}, '${tournament.name}')">
                    Gestionar Fases
                </button>
                <button class="btn btn-secondary btn-small" onclick="viewTournamentDetails(${tournament.id})">
                    Ver Detalles
                </button>
            </div>
        </div>
    `;
    
    container.innerHTML = tournamentHTML;
    console.log('✅ Torneo activo mostrado con estadísticas correctas');
}


// ============= GESTIÓN DE USUARIOS =============

// Función para cargar usuarios
async function loadUsers() {
    try {
        const response = await fetchWithAuth('/api/admin/users');
        
        if (!response || !response.ok) throw new Error('Error cargando usuarios');
        
        const users = await response.json();
        displayUsers(users);
        
    } catch (error) {
        console.error('Error cargando usuarios:', error);
        const container = document.getElementById('usersList'); // ✨ USAR TU ID EXISTENTE
        if (container) {
            container.innerHTML = `
                <div class="error-state">
                    <p>Error cargando usuarios</p>
                </div>
            `;
        }
    }
}

// Función para mostrar usuarios
function displayUsers(users) {
    const container = document.getElementById('usersList'); // ✨ USAR TU ID EXISTENTE
    
    if (!container) {
        console.warn('⚠️ Container usersList no encontrado');
        return;
    }
    
    if (!users || users.length === 0) {
        container.innerHTML = `
            <div class="no-data">
                <p>No hay usuarios registrados</p>
            </div>
        `;
        return;
    }

    const usersHTML = users.map(user => `
        <div class="user-card">
            <div class="user-info">
                <div class="user-name">
                    <strong>Nombre:</strong> ${user.name}
                    ${user.must_change_password ? '<span class="temp-password-badge">🔐 Temporal</span>' : ''}
                </div>
                <div class="user-email"><strong>E-mail: </strong>${user.email}</div>
                <div class="user-status">
                    <span class="status-badge ${user.is_active ? 'active' : 'inactive'}">
                        <strong>Estado: </strong>${user.is_active ? 'Activo' : 'Inactivo'}
                    </span>
                </div>
            </div>
            <div class="user-actions">
                <button class="btn btn-warning btn-small" onclick="resetUserPassword(${user.id}, '${user.name}')">
                    🔐 Resetear Contraseña
                </button>
            </div>
        </div>
    `).join('');

    container.innerHTML = `
        <div class="users-header">
            <h3>👥 Gestión de Usuarios</h3>
            <button class="btn btn-primary btn-small" onclick="loadUsers()">
                🔄 Actualizar
            </button>
        </div>
        <div class="users-list">
            ${usersHTML}
        </div>
    `;
}

// Función para resetear contraseña - VERSIÓN CORREGIDA
async function resetUserPassword(userId, userName) {
    if (!confirm(`¿Resetear la contraseña de ${userName}?\\n\\nSe generará una contraseña temporal.`)) {
        return;
    }

    try {
        console.log(`🔐 Iniciando reset para usuario ${userId}`);
        
        const response = await fetchWithAuth(`/api/admin/users/${userId}/reset-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        // ✅ VERIFICACIÓN MEJORADA - Si fetchWithAuth retorna null (token expirado)
        if (!response) {
            console.warn('⚠️ Token expirado o sin respuesta del servidor');
            // No mostrar alert adicional, fetchWithAuth ya maneja la redirección
            return;
        }

        console.log('📡 Respuesta recibida, status:', response.status);

        const result = await response.json();

        if (response.ok) {
            console.log('✅ Reset exitoso:', result);
            showTemporaryPasswordModal(userName, result.temporary_password);
            await loadUsers(); // Recargar para ver el estado actualizado
        } else {
            console.error('❌ Error del servidor:', result);
            alert('Error: ' + (result.error || 'Error desconocido'));
        }
    } catch (error) {
        console.error('❌ Error general:', error);
        alert('Error de conexión. Inténtalo de nuevo.\\n\\nDetalle: ' + error.message);
    }
}



// Modal para mostrar contraseña temporal
function showTemporaryPasswordModal(userName, temporaryPassword) {
    const modal = document.createElement('div');
    modal.className = 'prediction-modal';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>🔐 Contraseña Temporal</h3>
                <button class="close-modal" onclick="closeModal()">&times;</button>
            </div>
            <div class="modal-body">
                <p><strong>Usuario:</strong> ${userName}</p>
                <div class="temp-password-display">
                    <label>Nueva Contraseña:</label>
                    <div class="password-box">
                        <span class="password-text">${temporaryPassword}</span>
                        <button class="btn btn-small btn-secondary" onclick="copyPassword('${temporaryPassword}')">
                            📋 Copiar
                        </button>
                    </div>
                </div>
                <div class="instructions">
                    <h4>📋 Instrucciones:</h4>
                    <ol>
                        <li>Comparte esta contraseña con ${userName}</li>
                        <li>Al iniciar sesión se le pedirá cambiarla</li>
                        <li>La contraseña temporal expirará después del cambio</li>
                    </ol>
                </div>
            </div>
            <div class="modal-actions">
                <button class="btn btn-primary" onclick="closeModal()">Entendido</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
}

// Función para copiar contraseña
function copyPassword(password) {
    navigator.clipboard.writeText(password).then(() => {
        alert('✅ Contraseña copiada');
    }).catch(err => {
        // Fallback
        const textArea = document.createElement('textarea');
        textArea.value = password;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        alert('✅ Contraseña copiada');
    });
}
