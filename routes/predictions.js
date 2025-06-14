// routes/predictions.js - VERSIÓN CORREGIDA PARA POSTGRESQL

const express = require('express');
const { db } = require('../database');
const { authenticateToken } = require('./auth');

const router = express.Router();

// GET /api/predictions/user - Obtener predicciones del usuario
router.get('/user', authenticateToken, (req, res) => {
    const userId = req.user.id;
    
    console.log(`🔍 Obteniendo predicciones para usuario ${userId}`);
    
    const query = `
        SELECT 
            p.id,
            p.match_id,
            p.predicted_home_score,
            p.predicted_away_score,
            p.predicted_winner,
            p.penalty_prediction,
            p.points_earned,
            p.result_points,
            p.score_points,
            m.home_team,
            m.away_team,
            m.match_date,
            m.status,
            m.home_score AS actual_home_score,
            m.away_score AS actual_away_score
        FROM predictions_new p
        JOIN matches_new m ON p.match_id = m.id
        JOIN tournaments t ON m.tournament_id = t.id
        WHERE p.user_id = ? AND t.status = 'active'
        ORDER BY m.match_date DESC
    `;
    
    db.all(query, [userId], (err, rows) => {
        if (err) {
            console.error('❌ Error obteniendo predicciones del usuario:', err);
            return res.status(500).json({ error: 'Error al consultar predicciones.' });
        }
        
        console.log(`✅ Predicciones encontradas: ${rows ? rows.length : 0}`);
        res.json(rows || []);
    });
});

// POST /api/predictions - Crear o actualizar predicción
router.post('/', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const {
        match_id,
        predicted_home_score,
        predicted_away_score,
        penalty_prediction
    } = req.body;

    console.log(`🎯 Nueva predicción de usuario ${userId}:`, {
        match_id,
        predicted_home_score,
        predicted_away_score,
        penalty_prediction
    });

    // Validaciones básicas
    if (!match_id || predicted_home_score === undefined || predicted_away_score === undefined) {
        return res.status(400).json({ error: 'Faltan datos en la predicción.' });
    }

    if (predicted_home_score < 0 || predicted_away_score < 0) {
        return res.status(400).json({ error: 'Los goles no pueden ser negativos.' });
    }

    if (predicted_home_score > 20 || predicted_away_score > 20) {
        return res.status(400).json({ error: 'Marcador muy alto.' });
    }

    try {
        // 1. Verificar que el partido existe y no ha comenzado
        const matchQuery = 'SELECT match_date, status FROM matches_new WHERE id = ?';
        
        db.get(matchQuery, [match_id], (err, match) => {
            if (err) {
                console.error('❌ Error verificando partido:', err);
                return res.status(500).json({ error: 'Error verificando partido.' });
            }

            if (!match) {
                return res.status(404).json({ error: 'El partido no existe.' });
            }

            // Verificar que el partido no ha comenzado
            const matchDate = new Date(match.match_date);
            const now = new Date();
            
            if (matchDate <= now) {
                return res.status(403).json({ error: 'Este partido ya ha comenzado.' });
            }

            // 2. Determinar ganador predicho
            let predicted_winner;
            if (predicted_home_score > predicted_away_score) {
                predicted_winner = 'home';
            } else if (predicted_away_score > predicted_home_score) {
                predicted_winner = 'away';
            } else {
                predicted_winner = 'draw';
            }

            // 3. Verificar si ya existe una predicción
            const checkQuery = 'SELECT id FROM predictions_new WHERE user_id = ? AND match_id = ?';
            
            db.get(checkQuery, [userId, match_id], (checkErr, existingPrediction) => {
                if (checkErr) {
                    console.error('❌ Error verificando predicción existente:', checkErr);
                    return res.status(500).json({ error: 'Error verificando predicción.' });
                }

                if (existingPrediction) {
                    // 4a. Actualizar predicción existente
                    const updateQuery = `
                        UPDATE predictions_new 
                        SET predicted_home_score = ?, 
                            predicted_away_score = ?, 
                            predicted_winner = ?,
                            penalty_prediction = ?,
                            updated_at = NOW()
                        WHERE user_id = ? AND match_id = ?
                    `;

                    db.run(updateQuery, [
                        predicted_home_score,
                        predicted_away_score,
                        predicted_winner,
                        penalty_prediction || null,
                        userId,
                        match_id
                    ], function(updateErr) {
                        if (updateErr) {
                            console.error('❌ Error actualizando predicción:', updateErr);
                            return res.status(500).json({ error: 'Error actualizando predicción.' });
                        }

                        console.log(`✅ Predicción actualizada: ${predicted_home_score}-${predicted_away_score}`);
                        res.json({
                            message: 'Predicción actualizada exitosamente',
                            prediction: {
                                id: existingPrediction.id,
                                match_id,
                                predicted_home_score,
                                predicted_away_score,
                                predicted_winner,
                                penalty_prediction: penalty_prediction || null
                            }
                        });
                    });

                } else {
                    // 4b. Crear nueva predicción
                    const insertQuery = `
                        INSERT INTO predictions_new 
                        (user_id, match_id, predicted_home_score, predicted_away_score, 
                         predicted_winner, penalty_prediction, created_at, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
                    `;

                    db.run(insertQuery, [
                        userId,
                        match_id,
                        predicted_home_score,
                        predicted_away_score,
                        predicted_winner,
                        penalty_prediction || null
                    ], function(insertErr) {
                        if (insertErr) {
                            console.error('❌ Error creando predicción:', insertErr);
                            return res.status(500).json({ error: 'Error creando predicción.' });
                        }

                        console.log(`✅ Nueva predicción creada: ${predicted_home_score}-${predicted_away_score}`);
                        res.status(201).json({
                            message: 'Predicción creada exitosamente',
                            prediction: {
                                id: this.lastID,
                                match_id,
                                predicted_home_score,
                                predicted_away_score,
                                predicted_winner,
                                penalty_prediction: penalty_prediction || null
                            }
                        });
                    });
                }
            });
        });

    } catch (error) {
        console.error('❌ Error general guardando predicción:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

module.exports = router;
