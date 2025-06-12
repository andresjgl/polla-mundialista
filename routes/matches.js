// routes/matches.js - Rutas de partidos
const express = require('express');
const { authenticateToken } = require('./auth');

const router = express.Router();

// GET /api/matches/upcoming - Próximos partidos
router.get('/upcoming', authenticateToken, async (req, res) => {
    try {
        const { db } = require('../database');
        
        db.all(`
            SELECT m.*, tp.name as phase_name, tp.points_multiplier,
                   t.name as tournament_name
            FROM matches_new m
            JOIN tournaments t ON m.tournament_id = t.id
            LEFT JOIN tournament_phases tp ON m.phase_id = tp.id
            WHERE t.status = 'active' 
              AND m.match_date > datetime('now')
            ORDER BY m.match_date ASC 
            LIMIT 10
        `, (err, matches) => {
            if (err) {
                console.error('Error obteniendo partidos:', err);
                return res.status(500).json({ error: 'Error interno del servidor' });
            }
            console.log(`✅ Partidos del torneo activo encontrados: ${matches.length}`);
            res.json(matches || []);
        });
    } catch (error) {
        console.error('Error obteniendo próximos partidos:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});


// GET /api/matches - Todos los partidos (para admin)
router.get('/', authenticateToken, async (req, res) => {
    try {
        const { db } = require('../database');
        
        db.all('SELECT * FROM matches ORDER BY match_date ASC', (err, matches) => {
            if (err) {
                console.error('Error obteniendo todos los partidos:', err);
                return res.status(500).json({ error: 'Error interno del servidor' });
            }
            res.json(matches || []);
        });
    } catch (error) {
        console.error('Error obteniendo partidos:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
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
router.get('/with-predictions', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { db } = require('../database');
        
        db.all(`
            SELECT m.*, tp.name as phase_name, tp.points_multiplier,
                   COUNT(p.id) as predictions_count
            FROM matches_new m
            LEFT JOIN tournament_phases tp ON m.phase_id = tp.id
            LEFT JOIN predictions_new p ON m.id = p.match_id
            GROUP BY m.id
            ORDER BY m.match_date ASC
        `, (err, matches) => {
            if (err) {
                console.error('Error obteniendo partidos con predicciones:', err);
                return res.status(500).json({ error: 'Error interno del servidor' });
            }
            res.json(matches || []);
        });
    } catch (error) {
        console.error('Error obteniendo partidos:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
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



module.exports = router;