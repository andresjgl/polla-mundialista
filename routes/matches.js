// routes/matches.js - Rutas de partidos
const express = require('express');
const { authenticateToken, requireAdmin } = require('./auth'); // ✅ Importar todo junto

const router = express.Router();


// GET /api/matches/upcoming - VERSIÓN CON PAGINACIÓN Y FILTROS
router.get('/upcoming', authenticateToken, async (req, res) => {
    console.log('🔍 GET /matches/upcoming solicitado');
    
    try {
        const { db } = require('../database');
        const userId = req.user.id;
        
        // Parámetros de consulta
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const filter = req.query.filter; // 'no-prediction' o undefined
        const offset = (page - 1) * limit;
        
        console.log('📄 Parámetros:', { page, limit, filter, offset });

        // Construir WHERE clause base
        let whereClause = `
            WHERE t.status = 'active' 
            AND m.status = 'scheduled'
        `;
        
        // Agregar filtro de predicciones si se solicita
        if (filter === 'no-prediction') {
            whereClause += `
                AND m.id NOT IN (
                    SELECT p.match_id 
                    FROM predictions_new p 
                    WHERE p.user_id = ${userId}
                )
            `;
        }

        // Consulta principal con paginación
        const query = `
            SELECT 
                m.id,
                m.home_team,
                m.away_team,
                m.match_date,
                m.home_score,
                m.away_score,
                m.status,
                m.tournament_id,
                m.phase_id,
                COALESCE(tp.name, 'Sin fase') as phase_name,
                COALESCE(tp.points_multiplier, 1) as points_multiplier,
                COALESCE(tp.result_points, 1) as result_points,
                COALESCE(tp.exact_score_points, 3) as exact_score_points,
                COALESCE(tp.is_eliminatory, false) as is_eliminatory,
                t.name as tournament_name,
                t.status as tournament_status
            FROM matches_new m
            LEFT JOIN tournament_phases tp ON m.phase_id = tp.id
            LEFT JOIN tournaments t ON m.tournament_id = t.id
            ${whereClause}
            ORDER BY m.match_date ASC
            LIMIT ${limit} OFFSET ${offset}
        `;

        // Consulta para contar total
        const countQuery = `
            SELECT COUNT(*) as total
            FROM matches_new m
            LEFT JOIN tournament_phases tp ON m.phase_id = tp.id
            LEFT JOIN tournaments t ON m.tournament_id = t.id
            ${whereClause}
        `;
        
        console.log('🔧 Ejecutando consulta paginada...');
        
        // Ejecutar ambas consultas
        db.get(countQuery, [], (err, countResult) => {
            if (err) {
                console.error('❌ Error contando partidos:', err);
                return res.json({ 
                    matches: [], 
                    pagination: { page: 1, limit: 10, total: 0, totalPages: 0 }
                });
            }

            const total = countResult.total;
            const totalPages = Math.ceil(total / limit);

            db.all(query, [], (err, matches) => {
                if (err) {
                    console.error('❌ Error obteniendo partidos:', err);
                    return res.json({ 
                        matches: [], 
                        pagination: { page, limit, total: 0, totalPages: 0 }
                    });
                }
                
                console.log(`✅ Partidos encontrados: ${matches ? matches.length : 0} de ${total}`);
                console.log(`📄 Página ${page} de ${totalPages}`);
                
                res.json({
                    matches: matches || [],
                    pagination: {
                        page,
                        limit,
                        total,
                        totalPages,
                        hasNext: page < totalPages,
                        hasPrevious: page > 1
                    },
                    filter: filter || 'all'
                });
            });
        });
        
    } catch (error) {
        console.error('❌ Error en route matches/upcoming:', error);
        res.json({ 
            matches: [], 
            pagination: { page: 1, limit: 10, total: 0, totalPages: 0 }
        });
    }
});





// GET /api/matches - Todos los partidos (para admin)
// GET /api/matches - Obtener todos los partidos
router.get('/', authenticateToken, async (req, res) => {
    console.log('🔍 GET /matches solicitado');
    
    try {
        const { db } = require('../database');
        
        db.all('SELECT * FROM matches_new ORDER BY match_date DESC', [], (err, matches) => {
            if (err) {
                console.error('❌ Error obteniendo partidos:', err);
                return res.json([]);
            }
            
            console.log(`✅ Partidos encontrados: ${matches ? matches.length : 0}`);
            res.json(matches || []);
        });
    } catch (error) {
        console.error('❌ Error en route matches:', error);
        res.json([]);
    }
});

// POST /api/matches/:matchId/result - Actualizar resultado (VERSIÓN CORREGIDA)
router.post('/:matchId/result', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { matchId } = req.params;
        const { home_score, away_score, penalty_winner } = req.body;

        console.log(`⚽ Actualizando resultado del partido ${matchId}:`, {
            home_score, away_score, penalty_winner
        });

        // Validaciones básicas
        if (home_score === undefined || away_score === undefined) {
            return res.status(400).json({ error: 'Los marcadores son requeridos' });
        }

        if (home_score < 0 || away_score < 0) {
            return res.status(400).json({ error: 'Los goles no pueden ser negativos' });
        }

        if (home_score > 20 || away_score > 20) {
            return res.status(400).json({ error: 'Marcador muy alto, verifica los datos' });
        }

        const { db } = require('../database');

        // Verificar que el partido existe y obtener información
        db.get(`
            SELECT m.*, tp.name as phase_name, tp.is_eliminatory, 
                   t.name as tournament_name
            FROM matches_new m
            LEFT JOIN tournament_phases tp ON m.phase_id = tp.id
            LEFT JOIN tournaments t ON m.tournament_id = t.id
            WHERE m.id = ?
        `, [matchId], async (err, match) => {
            if (err) {
                console.error('❌ Error verificando partido:', err);
                return res.status(500).json({ error: 'Error verificando partido' });
            }

            if (!match) {
                return res.status(404).json({ error: 'Partido no encontrado' });
            }

            if (match.status === 'finished') {
                return res.status(400).json({ error: 'Este partido ya tiene resultado final' });
            }

            // Validar fase eliminatoria
            if (match.is_eliminatory && home_score === away_score && !penalty_winner) {
                return res.status(400).json({
                    error: `Esta es una fase eliminatoria (${match.phase_name}). No se permiten empates.`,
                    suggestion: 'Debe definirse un ganador. Si hubo empate en 90 minutos, ingresa el resultado después de penaltis.',
                    requires_penalty_winner: true,
                    is_eliminatory: true
                });
            }

            // Determinar ganador
            let winner = 'draw';
            if (home_score > away_score) {
                winner = 'home';
            } else if (away_score > home_score) {
                winner = 'away';
            }

            // Si hay ganador por penaltis
            if (home_score === away_score && penalty_winner) {
                winner = penalty_winner;
            }

            // Actualizar resultado del partido
            db.run(`
                UPDATE matches_new 
                SET home_score = ?, 
                    away_score = ?, 
                    status = 'finished',
                    penalty_winner = ?,
                    updated_at = NOW()
                WHERE id = ?
            `, [home_score, away_score, penalty_winner || null, matchId], async function(err) {
                if (err) {
                    console.error('❌ Error actualizando partido:', err);
                    return res.status(500).json({ error: 'Error actualizando resultado: ' + err.message });
                }

                if (this.changes === 0) {
                    return res.status(404).json({ error: 'Partido no encontrado' });
                }

                console.log(`✅ Resultado actualizado: ${match.home_team} ${home_score}-${away_score} ${match.away_team}`);

                // ✅ USAR EL SISTEMA DE PUNTOS EXISTENTE
                try {
                    const { pointsCalculator } = require('../database');
                    const pointsResult = await pointsCalculator.updateMatchPredictions(
                        matchId, 
                        home_score, 
                        away_score
                    );
                    
                    console.log(`🎯 Puntos calculados: ${pointsResult.updated} predicciones actualizadas`);
                    
                    res.json({
                        message: 'Resultado actualizado exitosamente',
                        match_id: matchId,
                        score: `${match.home_team} ${home_score}-${away_score} ${match.away_team}`,
                        penalty_winner: penalty_winner || null,
                        predictions_updated: pointsResult.updated || 0,
                        phase_info: {
                            name: match.phase_name,
                            is_eliminatory: match.is_eliminatory
                        }
                    });
                    
                } catch (pointsError) {
                    console.error('❌ Error calculando puntos:', pointsError);
                    
                    // Aunque falle el cálculo de puntos, el resultado se guardó correctamente
                    res.json({
                        message: 'Resultado actualizado exitosamente (sin calcular puntos)',
                        match_id: matchId,
                        score: `${match.home_team} ${home_score}-${away_score} ${match.away_team}`,
                        penalty_winner: penalty_winner || null,
                        predictions_updated: 0,
                        warning: 'Los puntos se calcularán manualmente',
                        phase_info: {
                            name: match.phase_name,
                            is_eliminatory: match.is_eliminatory
                        }
                    });
                }
            });
        });

    } catch (error) {
        console.error('❌ Error actualizando resultado:', error);
        res.status(500).json({ error: 'Error interno del servidor: ' + error.message });
    }
});


// GET /api/matches/with-predictions - Obtener partidos con predicciones (CORREGIDA)
router.get('/with-predictions', authenticateToken, requireAdmin, async (req, res) => {
    console.log('🔍 GET /matches/with-predictions solicitado');
    
    try {
        const { db } = require('../database');
        
        // CONSULTA COMPLETA CON TODOS LOS CAMPOS NECESARIOS
        const query = `
            SELECT 
                m.id,
                m.home_team,
                m.away_team,
                m.match_date,
                m.home_score,
                m.away_score,
                m.status,
                m.tournament_id,
                m.phase_id,
                COALESCE(t.name, 'Sin torneo') as tournament_name,
                COALESCE(tp.name, 'Sin fase') as phase_name,
                COALESCE(tp.points_multiplier, 1) as points_multiplier,
                COALESCE(tp.result_points, 1) as result_points,
                COALESCE(tp.exact_score_points, 3) as exact_score_points,
                COALESCE(tp.is_eliminatory, false) as is_eliminatory,
                (SELECT COUNT(*) FROM predictions_new p WHERE p.match_id = m.id) as predictions_count
            FROM matches_new m
            LEFT JOIN tournaments t ON m.tournament_id = t.id
            LEFT JOIN tournament_phases tp ON m.phase_id = tp.id
            ORDER BY m.match_date DESC
            LIMIT 50
        `;
        
        console.log('🔧 Ejecutando consulta completa de partidos...');
        
        db.all(query, [], (err, matches) => {
            if (err) {
                console.error('❌ Error obteniendo partidos:', err);
                console.log('📤 Devolviendo array vacío por error');
                return res.json([]);
            }
            
            console.log(`✅ Partidos encontrados: ${matches ? matches.length : 0}`);
            if (matches && matches.length > 0) {
                console.log('📊 Primer partido con datos:', {
                    id: matches[0].id,
                    teams: `${matches[0].home_team} vs ${matches[0].away_team}`,
                    phase_name: matches[0].phase_name,
                    points_multiplier: matches[0].points_multiplier,
                    predictions_count: matches[0].predictions_count
                });
            }
            
            res.json(matches || []);
        });
        
    } catch (error) {
        console.error('❌ Error en route matches/with-predictions:', error);
        res.json([]);
    }
});



// AGREGAR esta ruta en routes/matches.js:

// GET /api/matches/active-tournament - Obtener torneo activo (ruta pública)
router.get('/active-tournament', async (req, res) => {
    try {
        const { db } = require('../database');
        
        db.get(`
            SELECT t.*, 
                   COUNT(m.id) as total_matches,
                   COUNT(CASE WHEN m.status = 'finished' THEN 1 END) as finished_matches,
                   COUNT(p.id) as total_predictions
            FROM tournaments t
            LEFT JOIN matches_new m ON t.id = m.tournament_id
            LEFT JOIN predictions_new p ON m.id = p.match_id
            WHERE t.status = 'active'
            GROUP BY t.id
            LIMIT 1
        `, (err, tournament) => {
            if (err) {
                console.error('Error obteniendo torneo activo:', err);
                return res.status(500).json({ error: 'Error interno del servidor' });
            }
            
            if (!tournament) {
                return res.json({ 
                    active_tournament: null,
                    message: 'No hay torneo activo'
                });
            }
            
            res.json({ 
                active_tournament: tournament,
                message: 'Torneo activo encontrado'
            });
        });
    } catch (error) {
        console.error('Error obteniendo torneo activo:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// GET /api/matches/debug - Ruta temporal para debugging
router.get('/debug', authenticateToken, async (req, res) => {
    try {
        const { db } = require('../database');
        
        console.log('🐛 Debugging: Verificando estado de la base de datos...');
        
        // 1. Verificar torneos
        db.get('SELECT * FROM tournaments WHERE status = ?', ['active'], (err, activeTournament) => {
            if (err) {
                return res.json({ error: 'Error consultando torneos', details: err.message });
            }
            
            // 2. Contar todos los partidos
            db.get('SELECT COUNT(*) as total FROM matches_new', [], (err2, totalMatches) => {
                if (err2) {
                    return res.json({ error: 'Error contando partidos', details: err2.message });
                }
                
                // 3. Partidos por estado
                db.all(`
                    SELECT status, COUNT(*) as count 
                    FROM matches_new 
                    GROUP BY status
                `, [], (err3, statusCounts) => {
                    if (err3) {
                        return res.json({ error: 'Error agrupando por estado', details: err3.message });
                    }
                    
                    // 4. Algunos partidos de ejemplo
                    db.all('SELECT * FROM matches_new LIMIT 5', [], (err4, sampleMatches) => {
                        if (err4) {
                            return res.json({ error: 'Error obteniendo ejemplos', details: err4.message });
                        }
                        
                        res.json({
                            activeTournament,
                            totalMatches,
                            statusCounts,
                            sampleMatches,
                            timestamp: new Date().toISOString()
                        });
                    });
                });
            });
        });
        
    } catch (error) {
        console.error('❌ Error en debugging:', error);
        res.json({ error: 'Error general', details: error.message });
    }
});




module.exports = router;