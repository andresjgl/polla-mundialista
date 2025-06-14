// routes/matches.js - Rutas de partidos
const express = require('express');
const { authenticateToken } = require('./auth');

const router = express.Router();

// GET /api/matches/upcoming - CORREGIDA para PostgreSQL
router.get('/upcoming', authenticateToken, async (req, res) => {
    console.log('🔍 GET /matches/upcoming solicitado');
    
    try {
        const { db } = require('../database');
        
        // CONSULTA CORREGIDA - Compatible con PostgreSQL
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
                COALESCE(tp.is_eliminatory, false) as is_eliminatory,
                COALESCE(tp.result_points, 1) as result_points,
                COALESCE(tp.exact_score_points, 3) as exact_score_points,
                t.name as tournament_name,
                t.status as tournament_status
            FROM matches_new m
            LEFT JOIN tournament_phases tp ON m.phase_id = tp.id
            LEFT JOIN tournaments t ON m.tournament_id = t.id
            WHERE t.status = 'active' 
            AND m.status = 'scheduled'
            ORDER BY m.match_date ASC
            LIMIT 20
        `;
        
        console.log('🔧 Ejecutando query corregida...');
        
        db.all(query, [], (err, matches) => {
            if (err) {
                console.error('❌ Error obteniendo partidos próximos:', err);
                return res.json([]); // Siempre devolver array vacío, no error
            }
            
            console.log(`✅ Partidos próximos encontrados: ${matches ? matches.length : 0}`);
            if (matches && matches.length > 0) {
                console.log('📊 Primer partido:', matches[0]);
            }
            
            res.json(matches || []); // Siempre array, nunca null
        });
        
    } catch (error) {
        console.error('❌ Error en route matches/upcoming:', error);
        res.json([]); // Siempre devolver array vacío
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



const { requireAdmin } = require('./auth');
const { pointsCalculator } = require('../database');

// POST /api/matches/:matchId/result - Actualizar resultado de partido (solo admin)
// POST /api/matches/:matchId/result - Actualizar resultado con validación de fases eliminatorias
router.post('/:matchId/result', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { matchId } = req.params;
        const { home_score, away_score, penalty_winner } = req.body;

        // Validaciones básicas
        if (home_score < 0 || away_score < 0) {
            return res.status(400).json({ 
                error: 'Los goles no pueden ser negativos' 
            });
        }

        if (home_score > 20 || away_score > 20) {
            return res.status(400).json({ 
                error: 'Marcador muy alto, verifica los datos' 
            });
        }

        const { db } = require('../database');

        // Primero validar si es fase eliminatoria
        const validationResponse = await fetch(`http://localhost:${process.env.PORT || 3000}/api/admin/phases/validate-elimination`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': req.headers.authorization
            },
            body: JSON.stringify({ match_id: matchId, home_score, away_score })
        }).catch(() => null);

        if (validationResponse && !validationResponse.ok) {
            const validationError = await validationResponse.json();
            
            // Si es fase eliminatoria con empate, requerir información adicional
            if (validationError.is_eliminatory && home_score === away_score) {
                if (!penalty_winner) {
                    return res.status(400).json({
                        error: validationError.error,
                        suggestion: validationError.suggestion,
                        requires_penalty_winner: true,
                        is_eliminatory: true
                    });
                }
                
                // Verificar que penalty_winner sea válido
                if (penalty_winner !== 'home' && penalty_winner !== 'away') {
                    return res.status(400).json({
                        error: 'Para fases eliminatorias con empate, debe especificarse quién ganó en penaltis',
                        requires_penalty_winner: true
                    });
                }
            }
        }

        // Actualizar resultado del partido
        db.run(`
            UPDATE matches_new 
            SET home_score = ?, away_score = ?, status = 'finished', 
                penalty_winner = ?, updated_at = datetime('now')
            WHERE id = ?
        `, [home_score, away_score, penalty_winner || null, matchId], async function(err) {
            if (err) {
                console.error('Error actualizando partido:', err);
                return res.status(500).json({ error: 'Error actualizando partido' });
            }

            if (this.changes === 0) {
                return res.status(404).json({ error: 'Partido no encontrado' });
            }

            try {
                // Calcular puntos para todas las predicciones
                const { pointsCalculator } = require('../database');
                const result = await pointsCalculator.updateMatchPredictions(
                    matchId, 
                    home_score, 
                    away_score
                );

                console.log(`🏆 Resultado actualizado: ${matchId} (${home_score}-${away_score})`);
                if (penalty_winner) {
                    console.log(`🥅 Ganador en penaltis: ${penalty_winner}`);
                }
                console.log(`📊 ${result.message}`);

                res.json({
                    message: 'Resultado actualizado exitosamente',
                    match_id: matchId,
                    score: `${home_score}-${away_score}`,
                    penalty_winner: penalty_winner || null,
                    predictions_updated: result.updated,
                    phase_info: result.phase_info
                });

            } catch (pointsError) {
                console.error('Error calculando puntos:', pointsError);
                res.status(500).json({ 
                    error: 'Resultado actualizado pero error calculando puntos',
                    details: pointsError.message 
                });
            }
        });

    } catch (error) {
        console.error('Error actualizando resultado:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});


// GET /api/matches/with-predictions - Partidos con conteo de predicciones (admin)
// GET /api/matches/with-predictions - Obtener partidos con predicciones
router.get('/with-predictions', authenticateToken, requireAdmin, async (req, res) => {
    console.log('🔍 GET /matches/with-predictions solicitado');
    
    try {
        const { db } = require('../database');
        
        // Query simplificada que funciona en PostgreSQL
        const query = `
            SELECT 
                m.id,
                m.home_team,
                m.away_team,
                m.match_date,
                m.home_score,
                m.away_score,
                m.status,
                COALESCE(t.name, 'Sin torneo') as tournament_name,
                COALESCE(tp.name, 'Sin fase') as phase_name
            FROM matches_new m
            LEFT JOIN tournaments t ON m.tournament_id = t.id
            LEFT JOIN tournament_phases tp ON m.phase_id = tp.id
            ORDER BY m.match_date DESC
            LIMIT 50
        `;
        
        db.all(query, [], (err, matches) => {
            if (err) {
                console.error('❌ Error obteniendo partidos:', err);
                console.log('📤 Devolviendo array vacío por error');
                return res.json([]);
            }
            
            console.log(`✅ Partidos encontrados: ${matches ? matches.length : 0}`);
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