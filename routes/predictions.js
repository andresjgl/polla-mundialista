// routes/predictions.js - Rutas de predicciones
const express = require('express');
const { authenticateToken } = require('./auth');

const router = express.Router();

// GET /api/predictions/match/:matchId - Obtener predicción del usuario para un partido
router.get('/match/:matchId', authenticateToken, async (req, res) => {
    try {
        const { db } = require('../database');
        const { matchId } = req.params;
        const userId = req.user.id;

        db.get(`
            SELECT * FROM predictions_new 
            WHERE user_id = ? AND match_id = ?
        `, [userId, matchId], (err, prediction) => {
            if (err) {
                console.error('Error obteniendo predicción:', err);
                return res.status(500).json({ error: 'Error interno del servidor' });
            }
            res.json(prediction || null);
        });
    } catch (error) {
        console.error('Error obteniendo predicción:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// En routes/predictions.js, en la ruta POST, AGREGAR esta validación después de las validaciones existentes:

// POST /api/predictions - Crear/actualizar predicción
router.post('/', authenticateToken, async (req, res) => {
    try {
        const { db } = require('../database');
        const userId = req.user.id;
        
        // NUEVA VALIDACIÓN: Verificar que no sea admin
        db.get('SELECT is_admin FROM users WHERE id = ?', [userId], (err, user) => {
            if (err) {
                console.error('Error verificando usuario:', err);
                return res.status(500).json({ error: 'Error interno del servidor' });
            }
            
            if (user && user.is_admin) {
                return res.status(403).json({ 
                    error: 'Los administradores no pueden hacer predicciones' 
                });
            }
            
            // Continuar con el resto del código existente...
            const { 
                match_id, 
                predicted_winner, 
                predicted_home_score, 
                predicted_away_score 
            } = req.body;

            console.log('🔍 DEBUG - Datos recibidos:', {
                userId,
                match_id,
                predicted_winner,
                predicted_home_score,
                predicted_away_score
            });

             // Validaciones
        if (!match_id || !predicted_winner) {
            console.log('❌ DEBUG - Validación fallida: falta match_id o predicted_winner');
            return res.status(400).json({ 
                error: 'match_id y predicted_winner son requeridos' 
            });
        }

        if (predicted_home_score < 0 || predicted_away_score < 0) {
            console.log('❌ DEBUG - Validación fallida: goles negativos');
            return res.status(400).json({ 
                error: 'Los goles no pueden ser negativos' 
            });
        }

        // Verificar que el partido existe y no ha empezado
        console.log('🔍 DEBUG - Buscando partido con ID:', match_id);
        console.log('🕐 DEBUG - Fecha actual del servidor:', new Date().toISOString());
        
        db.get(`
            SELECT * FROM matches_new 
            WHERE id = ?
        `, [match_id], (err, match) => {
            if (err) {
                console.error('❌ DEBUG - Error en consulta:', err);
                return res.status(500).json({ error: 'Error interno del servidor' });
            }

            console.log('🎯 DEBUG - Partido encontrado:', match);

            if (!match) {
                console.log('❌ DEBUG - Partido no existe en BD');
                return res.status(400).json({ 
                    error: 'Partido no encontrado' 
                });
            }

            // Verificar fecha
            const matchDate = new Date(match.match_date);
            const currentDate = new Date();
            const timeDiff = matchDate - currentDate;
            
            console.log('📅 DEBUG - Fecha del partido:', match.match_date);
            console.log('📅 DEBUG - Fecha del partido (Date):', matchDate.toISOString());
            console.log('📅 DEBUG - Fecha actual (Date):', currentDate.toISOString());
            console.log('⏰ DEBUG - Diferencia en minutos:', timeDiff / (1000 * 60));

            if (timeDiff <= 0) {
                console.log('❌ DEBUG - Partido ya empezó');
                return res.status(400).json({ 
                    error: 'El partido ya ha comenzado' 
                });
            }

            console.log('✅ DEBUG - Partido válido, procediendo a guardar predicción');
            
            // Insertar o actualizar predicción
            db.run(`
                INSERT OR REPLACE INTO predictions_new 
                (user_id, match_id, predicted_winner, predicted_home_score, predicted_away_score, updated_at)
                VALUES (?, ?, ?, ?, ?, datetime('now'))
            `, [userId, match_id, predicted_winner, predicted_home_score, predicted_away_score], 
            function(err) {
                if (err) {
                    console.error('❌ DEBUG - Error guardando predicción:', err);
                    return res.status(500).json({ error: 'Error interno del servidor' });
                }

                console.log('✅ DEBUG - Predicción guardada exitosamente');
                res.json({
                    message: 'Predicción guardada exitosamente',
                    prediction: {
                        match_id,
                        predicted_winner,
                        predicted_home_score,
                        predicted_away_score
                    }
                });
            });
        });

        });
    } catch (error) {
        console.error('❌ DEBUG - Error general:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// GET /api/predictions/user - Obtener predicciones del usuario (SOLO TORNEO ACTIVO)
router.get('/user', authenticateToken, async (req, res) => {
    try {
        const { db } = require('../database');
        const userId = req.user.id;

        db.all(`
            SELECT p.*, m.home_team, m.away_team, m.match_date, m.status,
                   m.home_score as actual_home_score, m.away_score as actual_away_score,
                   tp.name as phase_name, tp.points_multiplier,
                   t.name as tournament_name
            FROM predictions_new p
            JOIN matches_new m ON p.match_id = m.id
            JOIN tournaments t ON m.tournament_id = t.id
            LEFT JOIN tournament_phases tp ON m.phase_id = tp.id
            WHERE p.user_id = ? AND t.status = 'active'
            ORDER BY m.match_date ASC
        `, [userId], (err, predictions) => {
            if (err) {
                console.error('Error obteniendo predicciones:', err);
                return res.status(500).json({ error: 'Error interno del servidor' });
            }
            res.json(predictions || []);
        });
    } catch (error) {
        console.error('Error obteniendo predicciones:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

module.exports = router;
