// routes/admin.js - Rutas de administración
const express = require('express');
const { authenticateToken, requireAdmin } = require('./auth');
const { db } = require('../database');

const router = express.Router();


// ============= GESTIÓN DE TORNEOS =============

// GET /api/admin/active-tournament - VERSIÓN CORREGIDA CON LOGS
router.get('/active-tournament', (req, res) => {
    console.log('🔍 GET /active-tournament solicitado');
    
    try {
        // Paso 1: Obtener torneo activo
        db.get('SELECT * FROM tournaments WHERE status = ?', ['active'], (err, tournament) => {
            if (err) {
                console.error('❌ Error obteniendo torneo activo:', err);
                return res.status(500).json({ error: 'Error interno del servidor.' });
            }
            
            if (!tournament) {
                console.log('⚠️ No hay torneo activo');
                return res.json({ active_tournament: null });
            }
            
            console.log('🏆 Torneo activo encontrado:', tournament.name, 'ID:', tournament.id);
            
            // Paso 2: Contar partidos del torneo
            db.get('SELECT COUNT(*) as total FROM matches_new WHERE tournament_id = ?', [tournament.id], (err2, matchesResult) => {
                if (err2) {
                    console.error('❌ Error contando partidos:', err2);
                    matchesResult = { total: 0 };
                }
                
                console.log('⚽ Partidos encontrados:', matchesResult.total);
                
                // Paso 3: Contar partidos finalizados
                db.get('SELECT COUNT(*) as finished FROM matches_new WHERE tournament_id = ? AND status = ?', [tournament.id, 'finished'], (err3, finishedResult) => {
                    if (err3) {
                        console.error('❌ Error contando partidos finalizados:', err3);
                        finishedResult = { finished: 0 };
                    }
                    
                    console.log('✅ Partidos finalizados:', finishedResult.finished);
                    
                    // Paso 4: Contar predicciones
                    db.get(`
                        SELECT COUNT(DISTINCT p.id) as total 
                        FROM predictions_new p 
                        JOIN matches_new m ON p.match_id = m.id 
                        WHERE m.tournament_id = ?
                    `, [tournament.id], (err4, predictionsResult) => {
                        if (err4) {
                            console.error('❌ Error contando predicciones:', err4);
                            predictionsResult = { total: 0 };
                        }
                        
                        console.log('🎯 Predicciones encontradas:', predictionsResult.total);
                        
                        // Resultado final
                        const result = {
                            id: tournament.id,
                            name: tournament.name,
                            start_date: tournament.start_date,
                            end_date: tournament.end_date,
                            status: tournament.status,
                            total_matches: matchesResult.total || 0,
                            finished_matches: finishedResult.finished || 0,
                            total_predictions: predictionsResult.total || 0
                        };
                        
                        console.log('📊 Estadísticas finales del torneo:', result);
                        
                        res.json({ active_tournament: result });
                    });
                });
            });
        });
        
    } catch (error) {
        console.error('❌ Error general:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});


// GET /api/admin/tournaments - Listar todos los torneos
router.get('/tournaments', authenticateToken, requireAdmin, (req, res) => {
    db.all('SELECT * FROM tournaments ORDER BY created_at DESC', [], (err, tournaments) => {
        if (err) {
            console.error('❌ Error obteniendo torneos:', err);
            return res.json([]);
        }
        res.json(tournaments || []);
    });
});


// POST /api/admin/tournaments - Crear nuevo torneo
router.post('/tournaments', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { name, start_date, end_date, description } = req.body;

        if (!name || !start_date || !end_date) {
            return res.status(400).json({ 
                error: 'Nombre, fecha de inicio y fecha de fin son requeridos' 
            });
        }

        const { db } = require('../database');

        // Verificar primero si las columnas existen
        db.run(`
            INSERT INTO tournaments (name, start_date, end_date, status)
            VALUES (?, ?, ?, 'upcoming')
        `, [name, start_date, end_date], function(err) {
            if (err) {
                console.error('Error creando torneo:', err);
                return res.status(500).json({ 
                    error: 'Error creando torneo: ' + err.message 
                });
            }

            console.log(`✅ Torneo creado: ID ${this.lastID}`);

            res.status(201).json({
                message: 'Torneo creado exitosamente',
                tournament: {
                    id: this.lastID,
                    name,
                    start_date,
                    end_date,
                    status: 'upcoming'
                }
            });
        });
    } catch (error) {
        console.error('Error creando torneo:', error);
        res.status(500).json({ 
            error: 'Error interno del servidor: ' + error.message 
        });
    }
});


// PUT /api/admin/tournaments/:id/status - Cambiar estado del torneo
router.put('/tournaments/:id/status', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!['upcoming', 'active', 'finished', 'cancelled'].includes(status)) {
            return res.status(400).json({ 
                error: 'Estado inválido. Debe ser: upcoming, active, finished, cancelled' 
            });
        }

        const { db } = require('../database');

        // Si se activa un torneo, desactivar los demás
        if (status === 'active') {
            db.run(`UPDATE tournaments SET status = 'upcoming' WHERE status = 'active' AND id != ?`, [id], (err) => {
                if (err) {
                    console.error('Error desactivando otros torneos:', err);
                }
            });
        }

        db.run(`
            UPDATE tournaments 
            SET status = ?
            WHERE id = ?
        `, [status, id], function(err) {
            if (err) {
                console.error('Error actualizando estado del torneo:', err);
                return res.status(500).json({ 
                    error: 'Error actualizando torneo: ' + err.message 
                });
            }

            if (this.changes === 0) {
                return res.status(404).json({ error: 'Torneo no encontrado' });
            }

            console.log(`✅ Torneo ${id} actualizado a estado: ${status}`);

            res.json({
                message: `Torneo ${status === 'active' ? 'activado' : 'actualizado'} exitosamente`,
                tournament_id: id,
                new_status: status
            });
        });
    } catch (error) {
        console.error('Error actualizando estado del torneo:', error);
        res.status(500).json({ 
            error: 'Error interno del servidor: ' + error.message 
        });
    }
});


// ============= GESTIÓN DE FASES =============

// GET /api/admin/tournaments/:id/phases - Fases de un torneo
router.get('/tournaments/:id/phases', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { db } = require('../database');
        
        db.all(`
            SELECT tp.*, COUNT(m.id) as matches_count
            FROM tournament_phases tp
            LEFT JOIN matches_new m ON tp.id = m.phase_id
            WHERE tp.tournament_id = ?
            GROUP BY tp.id
            ORDER BY tp.order_index ASC
        `, [id], (err, phases) => {
            if (err) {
                console.error('Error obteniendo fases:', err);
                return res.status(500).json({ error: 'Error interno del servidor' });
            }
            res.json(phases || []);
        });
    } catch (error) {
        console.error('Error obteniendo fases:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// POST /api/admin/tournaments/:id/phases - Crear fase
router.post('/tournaments/:id/phases', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, points_multiplier, order_index } = req.body;

        if (!name || !points_multiplier || !order_index) {
            return res.status(400).json({ 
                error: 'Nombre, multiplicador de puntos y orden son requeridos' 
            });
        }

        const { db } = require('../database');

        db.run(`
            INSERT INTO tournament_phases (tournament_id, name, points_multiplier, order_index)
            VALUES (?, ?, ?, ?)
        `, [id, name, points_multiplier, order_index], function(err) {
            if (err) {
                console.error('Error creando fase:', err);
                return res.status(500).json({ error: 'Error creando fase' });
            }

            res.status(201).json({
                message: 'Fase creada exitosamente',
                phase: {
                    id: this.lastID,
                    tournament_id: id,
                    name,
                    points_multiplier,
                    order_index
                }
            });
        });
    } catch (error) {
        console.error('Error creando fase:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});


// PUT /api/admin/phases/:id - Editar fase (CORREGIDA PARA POSTGRESQL)
router.put('/phases/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { 
            name, 
            points_multiplier, 
            order_index, 
            is_eliminatory,
            result_points,
            exact_score_points,
            winner_points,
            top_scorer_points,
            description 
        } = req.body;

        console.log(`🔧 Actualizando fase ${id} con datos:`, {
            name, points_multiplier, order_index, is_eliminatory,
            result_points, exact_score_points, winner_points, top_scorer_points
        });

        if (!name || !points_multiplier || order_index === undefined) {
            return res.status(400).json({ 
                error: 'Nombre, multiplicador de puntos y orden son requeridos' 
            });
        }

        // Validaciones especiales para fases eliminatorias
        if (is_eliminatory && !result_points) {
            return res.status(400).json({
                error: 'Las fases eliminatorias deben tener puntos por resultado definidos'
            });
        }

        const { db } = require('../database');

        // CONSULTA CORREGIDA PARA POSTGRESQL
        const updateQuery = `
            UPDATE tournament_phases 
            SET name = ?, 
                points_multiplier = ?, 
                order_index = ?, 
                is_eliminatory = ?, 
                allows_draw = ?, 
                result_points = ?, 
                exact_score_points = ?, 
                winner_points = ?, 
                top_scorer_points = ?, 
                description = ?, 
                updated_at = NOW()
            WHERE id = ?
        `;

        const params = [
            name, 
            points_multiplier, 
            order_index, 
            is_eliminatory ? true : false,  // PostgreSQL boolean
            is_eliminatory ? false : true,  // allows_draw es lo opuesto
            result_points || 1, 
            exact_score_points || 3, 
            winner_points || 0, 
            top_scorer_points || 0, 
            description || '', 
            parseInt(id)  // Asegurar que es número
        ];

        console.log('🔧 Ejecutando query de actualización...');
        console.log('📝 Parámetros:', params);

        db.run(updateQuery, params, function(err) {
            if (err) {
                console.error('❌ Error actualizando fase en BD:', err);
                return res.status(500).json({ 
                    error: 'Error actualizando fase: ' + err.message 
                });
            }

            if (this.changes === 0) {
                console.log('⚠️ No se encontró la fase para actualizar');
                return res.status(404).json({ error: 'Fase no encontrada' });
            }

            console.log(`✅ Fase "${name}" actualizada exitosamente (${this.changes} cambios)`);

            res.json({
                message: 'Fase actualizada exitosamente',
                phase: {
                    id: parseInt(id),
                    name,
                    points_multiplier,
                    order_index,
                    is_eliminatory: is_eliminatory ? true : false,
                    allows_draw: is_eliminatory ? false : true,
                    result_points: result_points || 1,
                    exact_score_points: exact_score_points || 3,
                    winner_points: winner_points || 0,
                    top_scorer_points: top_scorer_points || 0,
                    description: description || ''
                }
            });
        });
    } catch (error) {
        console.error('❌ Error general actualizando fase:', error);
        res.status(500).json({ 
            error: 'Error interno del servidor: ' + error.message 
        });
    }
});


// DELETE /api/admin/phases/:id - Eliminar fase
router.delete('/phases/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { db } = require('../database');

        // Verificar si la fase está siendo usada en partidos
        db.get(`
            SELECT COUNT(*) as count 
            FROM matches_new 
            WHERE phase_id = ?
        `, [id], (err, result) => {
            if (err) {
                console.error('Error verificando uso de la fase:', err);
                return res.status(500).json({ error: 'Error interno del servidor' });
            }

            if (result.count > 0) {
                return res.status(400).json({ 
                    error: `No se puede eliminar la fase porque está siendo usada en ${result.count} partidos` 
                });
            }

            // Eliminar fase
            db.run('DELETE FROM tournament_phases WHERE id = ?', [id], function(err) {
                if (err) {
                    console.error('Error eliminando fase:', err);
                    return res.status(500).json({ error: 'Error eliminando fase' });
                }

                if (this.changes === 0) {
                    return res.status(404).json({ error: 'Fase no encontrada' });
                }

                console.log(`🗑️ Fase eliminada: ID ${id}`);
                res.json({ message: 'Fase eliminada exitosamente' });
            });
        });
    } catch (error) {
        console.error('Error eliminando fase:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// POST /api/admin/phases/validate-elimination - Validar predicción en fase eliminatoria
router.post('/phases/validate-elimination', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { match_id, home_score, away_score } = req.body;
        const { db } = require('../database');

        // Obtener información del partido y fase
        db.get(`
            SELECT m.*, tp.is_eliminatory, tp.allows_draw, tp.name as phase_name
            FROM matches_new m
            JOIN tournament_phases tp ON m.phase_id = tp.id
            WHERE m.id = ?
        `, [match_id], (err, match) => {
            if (err) {
                return res.status(500).json({ error: 'Error interno del servidor' });
            }

            if (!match) {
                return res.status(404).json({ error: 'Partido no encontrado' });
            }

            // Validar si es fase eliminatoria y hay empate
            if (match.is_eliminatory && home_score === away_score) {
                return res.status(400).json({
                    error: `Esta es una fase eliminatoria (${match.phase_name}). No se permiten empates.`,
                    suggestion: 'Debe definirse un ganador. Si hubo empate en 90 minutos, ingresa el resultado después de penaltis.',
                    is_eliminatory: true,
                    phase_name: match.phase_name
                });
            }

            res.json({
                valid: true,
                is_eliminatory: match.is_eliminatory,
                phase_name: match.phase_name,
                allows_draw: match.allows_draw,
                message: match.is_eliminatory ? 
                    'Fase eliminatoria: Se requiere ganador' : 
                    'Fase normal: Se permite empate'
            });
        });
    } catch (error) {
        console.error('Error validando eliminatoria:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// POST /api/admin/tournaments/:id/phases/standard - Crear fases estándar (CORREGIDA)
router.post('/tournaments/:id/phases/standard', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { tournament_type = 'world_cup' } = req.body;
        const { db } = require('../database');

        console.log(`🏆 Creando fases estándar para torneo ${id}, tipo: ${tournament_type}`);

        // CONFIGURACIONES MEJORADAS CON VALORES CORRECTOS
        const standardPhasesConfigs = {
            world_cup: [
                { 
                    name: 'Fase de Grupos', 
                    points_multiplier: 1, 
                    order_index: 1,
                    is_eliminatory: false,
                    result_points: 1,
                    exact_score_points: 3,
                    description: 'Fase inicial donde los equipos compiten en grupos. Se permiten empates.'
                },
                { 
                    name: 'Octavos de Final', 
                    points_multiplier: 4, 
                    order_index: 2,
                    is_eliminatory: true,
                    result_points: 4,        // ✅ VALOR CORRECTO
                    exact_score_points: 8,   // ✅ VALOR CORRECTO
                    description: 'Primera fase eliminatoria. No se permiten empates, debe haber ganador.'
                },
                { 
                    name: 'Cuartos de Final', 
                    points_multiplier: 6, 
                    order_index: 3,
                    is_eliminatory: true,
                    result_points: 6,
                    exact_score_points: 12,
                    description: 'Segunda fase eliminatoria.'
                },
                { 
                    name: 'Semifinal', 
                    points_multiplier: 8, 
                    order_index: 4,
                    is_eliminatory: true,
                    result_points: 8,
                    exact_score_points: 16,
                    description: 'Penúltima fase del torneo.'
                },
                { 
                    name: 'Tercer Puesto', 
                    points_multiplier: 7, 
                    order_index: 5,
                    is_eliminatory: true,
                    result_points: 7,
                    exact_score_points: 14,
                    description: 'Partido por el tercer lugar.'
                },
                { 
                    name: 'Final', 
                    points_multiplier: 10, 
                    order_index: 6,
                    is_eliminatory: true,
                    result_points: 10,
                    exact_score_points: 20,
                    winner_points: 15,
                    description: 'Partido final del torneo. Puntos extra por acertar al campeón.'
                }
            ],
            club_world_cup: [
                { 
                    name: 'Fase de Grupos', 
                    points_multiplier: 1, 
                    order_index: 1,
                    is_eliminatory: false,
                    result_points: 1,
                    exact_score_points: 3,
                    description: 'Fase de grupos del Mundial de Clubes.'
                },
                { 
                    name: 'Semifinal', 
                    points_multiplier: 5, 
                    order_index: 2,
                    is_eliminatory: true,
                    result_points: 5,
                    exact_score_points: 10,
                    description: 'Semifinales del Mundial de Clubes.'
                },
                { 
                    name: 'Final', 
                    points_multiplier: 8, 
                    order_index: 3,
                    is_eliminatory: true,
                    result_points: 8,
                    exact_score_points: 16,
                    winner_points: 12,
                    description: 'Final del Mundial de Clubes.'
                }
            ]
        };

        const standardPhases = standardPhasesConfigs[tournament_type] || standardPhasesConfigs.world_cup;

        let created = 0;
        let errors = 0;

        for (const phase of standardPhases) {
            try {
                await new Promise((resolve, reject) => {
                    const insertQuery = `
                        INSERT INTO tournament_phases 
                        (tournament_id, name, points_multiplier, order_index, is_eliminatory, 
                         allows_draw, result_points, exact_score_points, winner_points, 
                         top_scorer_points, description, created_at, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
                    `;

                    const params = [
                        parseInt(id), 
                        phase.name, 
                        phase.points_multiplier, 
                        phase.order_index,
                        phase.is_eliminatory,
                        !phase.is_eliminatory,  // allows_draw es lo opuesto
                        phase.result_points,
                        phase.exact_score_points,
                        phase.winner_points || 0, 
                        phase.top_scorer_points || 0,
                        phase.description
                    ];

                    console.log(`🔧 Creando fase: ${phase.name} con puntos ${phase.result_points}/${phase.exact_score_points}`);

                    db.run(insertQuery, params, function(err) {
                        if (err) {
                            console.error(`❌ Error creando fase ${phase.name}:`, err);
                            reject(err);
                        } else {
                            console.log(`✅ Fase creada: ${phase.name} (ID: ${this.lastID})`);
                            resolve(this.lastID);
                        }
                    });
                });
                created++;
            } catch (error) {
                console.error(`❌ Error creando fase ${phase.name}:`, error);
                errors++;
            }
        }

        res.json({
            message: `Fases estándar creadas: ${created} exitosas, ${errors} errores`,
            created_phases: created,
            errors: errors,
            tournament_type: tournament_type
        });

    } catch (error) {
        console.error('❌ Error creando fases estándar:', error);
        res.status(500).json({ 
            error: 'Error interno del servidor: ' + error.message 
        });
    }
});


// ============= GESTIÓN COMPLETA DE FASES =============

// Función para gestionar fases de un torneo (NUEVA IMPLEMENTACIÓN)
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
                            <label for="phaseMultiplier">Multiplicador de Puntos</label>
                            <input type="number" id="phaseMultiplier" name="points_multiplier" required 
                                   min="1" max="20" placeholder="1">
                        </div>
                        
                        <div class="form-group">
                            <label class="checkbox-label">
                                <input type="checkbox" id="isEliminatory" name="is_eliminatory">
                                <span>Es Fase Eliminatoria</span>
                            </label>
                            <small>En fases eliminatorias no se permiten empates</small>
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
    document.getElementById('isEliminatory').addEventListener('change', function(e) {
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
                <button class="close-modal" onclick="closeModal()">&times;</button>
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
                        <textarea id="edit
                    <textarea id="editPhaseDescription" name="description" rows="3"
                                placeholder="Descripción de la fase...">${phase.description || ''}</textarea>
                    </div>
                    
                    <div class="modal-actions">
                        <button type="button" class="btn btn-secondary" onclick="closeModal()">
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
                    <button class="close-modal" onclick="closeModal(); resolve(null);">&times;</button>
                </div>
                <div class="modal-body">
                    <p>Selecciona el tipo de torneo para crear las fases estándar correspondientes:</p>
                    
                    <div class="tournament-type-options">
                        ${types.map(type => `
                            <div class="tournament-type-option" onclick="selectTournamentType('${type.value}')">
                                <h4>${type.label}</h4>
                                <small>Crea automáticamente las fases típicas de este tipo de torneo</small>
                            </div>
                        `).join('')}
                    </div>
                    
                    <div class="modal-actions">
                        <button type="button" class="btn btn-secondary" onclick="closeModal(); resolve(null);">
                            Cancelar
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Función global temporal para selección
        window.selectTournamentType = (type) => {
            closeModal();
            resolve(type);
        };

        window.resolve = resolve;
    });
}



// ============= GESTIÓN DE EQUIPOS =============

// GET /api/admin/teams - Listar equipos
router.get('/teams', authenticateToken, requireAdmin, async (req, res) => {
    console.log('🔍 GET /teams solicitado');
    
    try {
        const { db } = require('../database');
        
        db.all('SELECT * FROM teams ORDER BY name', [], (err, teams) => {
            if (err) {
                console.error('❌ Error obteniendo equipos:', err);
                console.log('📤 Devolviendo array vacío por error');
                return res.json([]); // Siempre array, nunca error 500
            }
            
            console.log(`✅ Equipos encontrados: ${teams ? teams.length : 0}`);
            console.log('📤 Devolviendo equipos:', teams);
            res.json(teams || []);
        });
    } catch (error) {
        console.error('❌ Error en route teams:', error);
        console.log('📤 Devolviendo array vacío por catch');
        res.json([]); // Siempre array, nunca error 500
    }
});

// POST /api/admin/teams - Crear equipo
router.post('/teams', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { name, country, logo_url } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Nombre del equipo es requerido' });
        }

        const { db } = require('../database');

        db.run(`
            INSERT INTO teams (name, country, logo_url)
            VALUES (?, ?, ?)
        `, [name, country || '', logo_url || ''], function(err) {
            if (err) {
                console.error('Error creando equipo:', err);
                return res.status(500).json({ error: 'Error creando equipo' });
            }

            res.status(201).json({
                message: 'Equipo creado exitosamente',
                team: {
                    id: this.lastID,
                    name,
                    country: country || '',
                    logo_url: logo_url || ''
                }
            });
        });
    } catch (error) {
        console.error('Error creando equipo:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});


// PUT /api/admin/teams/:id - Editar equipo
router.put('/teams/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, country, logo_url } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Nombre del equipo es requerido' });
        }

        const { db } = require('../database');

        db.run(`
            UPDATE teams 
            SET name = ?, country = ?, logo_url = ?
            WHERE id = ?
        `, [name, country || '', logo_url || '', id], function(err) {
            if (err) {
                console.error('Error actualizando equipo:', err);
                return res.status(500).json({ error: 'Error actualizando equipo' });
            }

            if (this.changes === 0) {
                return res.status(404).json({ error: 'Equipo no encontrado' });
            }

            res.json({
                message: 'Equipo actualizado exitosamente',
                team: {
                    id: parseInt(id),
                    name,
                    country: country || '',
                    logo_url: logo_url || ''
                }
            });
        });
    } catch (error) {
        console.error('Error actualizando equipo:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// DELETE /api/admin/teams/:id - Eliminar equipo
router.delete('/teams/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { db } = require('../database');

        // Verificar si el equipo está siendo usado en partidos
        db.get(`
            SELECT COUNT(*) as count 
            FROM matches_new 
            WHERE home_team_id = ? OR away_team_id = ?
        `, [id, id], (err, result) => {
            if (err) {
                console.error('Error verificando uso del equipo:', err);
                return res.status(500).json({ error: 'Error interno del servidor' });
            }

            if (result.count > 0) {
                return res.status(400).json({ 
                    error: 'No se puede eliminar el equipo porque está siendo usado en partidos' 
                });
            }

            // Eliminar equipo
            db.run('DELETE FROM teams WHERE id = ?', [id], function(err) {
                if (err) {
                    console.error('Error eliminando equipo:', err);
                    return res.status(500).json({ error: 'Error eliminando equipo' });
                }

                if (this.changes === 0) {
                    return res.status(404).json({ error: 'Equipo no encontrado' });
                }

                res.json({ message: 'Equipo eliminado exitosamente' });
            });
        });
    } catch (error) {
        console.error('Error eliminando equipo:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});


// ============= GESTIÓN DE PARTIDOS =============

// POST /api/admin/matches - Crear partido (CON ZONA HORARIA COLOMBIA)
router.post('/matches', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { 
            tournament_id, 
            phase_id, 
            home_team_id, 
            away_team_id, 
            match_date,
            external_match_id 
        } = req.body;

        console.log('🕐 Fecha recibida del frontend:', match_date);

        if (!tournament_id || !phase_id || !home_team_id || !away_team_id || !match_date) {
            return res.status(400).json({ 
                error: 'Torneo, fase, equipos y fecha son requeridos' 
            });
        }

        if (home_team_id === away_team_id) {
            return res.status(400).json({ 
                error: 'Un equipo no puede jugar contra sí mismo' 
            });
        }

        // ✅ NUEVO: PROCESAR FECHA PARA ZONA HORARIA COLOMBIA
        let formattedDate;
        try {
            // El input datetime-local envía formato: "2025-06-14T19:00"
            // Necesitamos agregarlo como zona horaria Colombia (-05:00)
            if (match_date.includes('T')) {
                // Si ya tiene formato ISO, agregar zona horaria Colombia
                formattedDate = `${match_date}:00-05:00`;
            } else {
                // Si no tiene formato completo, procesarlo
                const date = new Date(match_date);
                formattedDate = date.toISOString().slice(0, 19) + '-05:00';
            }
            console.log('🇨🇴 Fecha procesada para Colombia:', formattedDate);
        } catch (error) {
            console.error('❌ Error procesando fecha:', error);
            return res.status(400).json({ error: 'Formato de fecha inválido' });
        }

        const { db } = require('../database');

        // Obtener nombres de equipos
        db.all(`
            SELECT id, name FROM teams WHERE id IN (?, ?)
        `, [home_team_id, away_team_id], (err, teams) => {
            if (err || teams.length !== 2) {
                return res.status(400).json({ error: 'Equipos no válidos' });
            }

            const homeTeam = teams.find(t => t.id == home_team_id);
            const awayTeam = teams.find(t => t.id == away_team_id);

            // Generar ID único para el partido
            const matchId = `${tournament_id}_${phase_id}_${home_team_id}_${away_team_id}_${Date.now()}`;

            // ✅ USAR LA FECHA PROCESADA CON ZONA HORARIA
            db.run(`
                INSERT INTO matches_new 
                (id, tournament_id, phase_id, home_team_id, away_team_id, 
                 home_team, away_team, match_date, external_match_id, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?::timestamptz, ?, 'scheduled')
            `, [matchId, tournament_id, phase_id, home_team_id, away_team_id, 
                homeTeam.name, awayTeam.name, formattedDate, external_match_id || ''], 
            function(err) {
                if (err) {
                    console.error('❌ Error creando partido:', err);
                    return res.status(500).json({ error: 'Error creando partido: ' + err.message });
                }

                console.log(`✅ Partido creado: ${homeTeam.name} vs ${awayTeam.name} para ${formattedDate}`);

                res.status(201).json({
                    message: 'Partido creado exitosamente',
                    match: {
                        id: matchId,
                        tournament_id,
                        phase_id,
                        home_team: homeTeam.name,
                        away_team: awayTeam.name,
                        match_date: formattedDate,
                        status: 'scheduled'
                    }
                });
            });
        });
    } catch (error) {
        console.error('❌ Error creando partido:', error);
        res.status(500).json({ error: 'Error interno del servidor: ' + error.message });
    }
});

// POST /api/admin/reset-match/:matchId - FUNCIÓN TEMPORAL PARA TESTING
router.post('/reset-match/:matchId', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { matchId } = req.params;
        console.log(`🔄 Reseteando partido ${matchId} para testing...`);
        
        const { db } = require('../database');
        
        // Resetear el partido a estado original
        db.run(`
            UPDATE matches_new 
            SET home_score = NULL, 
                away_score = NULL, 
                status = 'scheduled',
                penalty_winner = NULL,
                updated_at = NOW()
            WHERE id = ?
        `, [matchId], function(err) {
            if (err) {
                console.error('❌ Error reseteando partido:', err);
                return res.status(500).json({ error: 'Error reseteando partido' });
            }
            
            console.log(`✅ Partido ${matchId} reseteado`);
            
            // También resetear las predicciones
            db.run(`
                UPDATE predictions_new 
                SET points_earned = 0, result_points = 0, score_points = 0, updated_at = NOW()
                WHERE match_id = ?
            `, [matchId], function(err2) {
                if (err2) {
                    console.error('❌ Error reseteando predicciones:', err2);
                }
                
                console.log(`✅ Predicciones del partido ${matchId} reseteadas`);
                
                res.json({
                    message: 'Partido reseteado exitosamente',
                    match_id: matchId
                });
            });
        });
        
    } catch (error) {
        console.error('❌ Error reseteando partido:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});


module.exports = router;
