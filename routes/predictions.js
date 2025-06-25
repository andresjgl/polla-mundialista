// routes/predictions.js - VERSIÓN CORREGIDA PARA POSTGRESQL

const express = require('express');
const { db } = require('../database');
const { authenticateToken } = require('./auth');

const router = express.Router();

// GET /api/predictions/user - Obtener predicciones del usuario CON PAGINACIÓN
router.get('/user', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { page = 1, limit = 10, status = 'all' } = req.query;
        const offset = (page - 1) * limit;

        console.log(`📊 Obteniendo predicciones paginadas - Usuario: ${userId}, Página: ${page}, Límite: ${limit}, Estado: ${status}`);

        // Construir filtros
        let whereConditions = ['p.user_id = ?', "t.status = 'active'"];
        let queryParams = [userId];

        if (status && status !== 'all') {
            if (status === 'pending') {
                whereConditions.push("m.status = 'scheduled'");
            } else if (status === 'finished') {
                whereConditions.push("m.status = 'finished'");
            }
        }

        const whereClause = whereConditions.join(' AND ');

        // Contar total de predicciones
        const countQuery = `
            SELECT COUNT(*) as total
            FROM predictions_new p
            JOIN matches_new m ON p.match_id = m.id
            JOIN tournaments t ON m.tournament_id = t.id
            WHERE ${whereClause}
        `;

        const totalResult = await new Promise((resolve, reject) => {
            db.get(countQuery, queryParams, (err, result) => {
                if (err) reject(err);
                else resolve(result);
            });
        });

        const total = totalResult?.total || 0;
        const totalPages = Math.ceil(total / limit);

        // Obtener predicciones paginadas
        // Obtener predicciones paginadas - ✅ AÑADIR LOGOS
        const predictionsQuery = `
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
                ht.logo_url as home_team_logo,
                at.logo_url as away_team_logo,
                m.match_date,
                m.status,
                m.home_score AS actual_home_score,
                m.away_score AS actual_away_score,
                tp.name as phase_name,
                t.name as tournament_name
            FROM predictions_new p
            JOIN matches_new m ON p.match_id = m.id
            JOIN tournaments t ON m.tournament_id = t.id
            LEFT JOIN tournament_phases tp ON m.phase_id = tp.id
            LEFT JOIN teams ht ON m.home_team_id = ht.id
            LEFT JOIN teams at ON m.away_team_id = at.id
            WHERE ${whereClause}
            ORDER BY m.match_date ASC, p.created_at DESC
            LIMIT ? OFFSET ?
        `;

        const finalParams = [...queryParams, parseInt(limit), parseInt(offset)];

        const predictions = await new Promise((resolve, reject) => {
            db.all(predictionsQuery, finalParams, (err, predictions) => {
                if (err) {
                    console.error('❌ Error obteniendo predicciones:', err);
                    reject(err);
                } else {
                    console.log(`✅ ${predictions?.length || 0} predicciones obtenidas`);
                    resolve(predictions || []);
                }
            });
        });

        // Calcular información de paginación
        const hasNextPage = page < totalPages;
        const hasPrevPage = page > 1;

        res.json({
            predictions,
            pagination: {
                currentPage: parseInt(page),
                totalPages,
                totalPredictions: total,
                limit: parseInt(limit),
                hasNext: hasNextPage,
                hasPrevious: hasPrevPage,
                startIndex: offset + 1,
                endIndex: Math.min(offset + predictions.length, total)
            },
            filters: {
                status
            }
        });

    } catch (error) {
        console.error('❌ Error obteniendo predicciones paginadas:', error);
        res.status(500).json({ 
            error: 'Error obteniendo predicciones',
            details: error.message 
        });
    }
});


// POST /api/predictions - Crear o actualizar predicción (VERSIÓN ACTUALIZADA)
router.post('/', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const {
        match_id,
        predicted_home_score,
        predicted_away_score,
        team_advances  // 🆕 NUEVO CAMPO
    } = req.body;

    console.log(`🎯 Nueva predicción de usuario ${userId}:`, {
        match_id,
        predicted_home_score,
        predicted_away_score,
        team_advances
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
        // 1. Verificar que el partido existe y obtener información de fase
        const matchQuery = `
            SELECT m.match_date, m.status, tp.is_eliminatory, tp.name as phase_name
            FROM matches_new m
            LEFT JOIN tournament_phases tp ON m.phase_id = tp.id
            WHERE m.id = ?
        `;
        
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

            // 🏆 VALIDACIÓN ELIMINATORIA
            if (match.is_eliminatory && predicted_home_score === predicted_away_score && !team_advances) {
                return res.status(400).json({ 
                    error: `Esta es una fase eliminatoria (${match.phase_name}). Si hay empate, debes seleccionar quién avanza.`,
                    is_eliminatory: true,
                    requires_advance_selection: true
                });
            }

            // 2. Determinar ganador predicho
            let predicted_winner;
            if (predicted_home_score > predicted_away_score) {
                predicted_winner = 'home';
            } else if (predicted_away_score > predicted_home_score) {
                predicted_winner = 'away';
            } else {
                // Si hay empate en eliminatoria, el ganador es quien avanza
                predicted_winner = match.is_eliminatory && team_advances ? team_advances : 'draw';
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
                            team_advances = ?,
                            updated_at = NOW()
                        WHERE user_id = ? AND match_id = ?
                    `;

                    db.run(updateQuery, [
                        predicted_home_score,
                        predicted_away_score,
                        predicted_winner,
                        team_advances || null,
                        userId,
                        match_id
                    ], function(updateErr) {
                        if (updateErr) {
                            console.error('❌ Error actualizando predicción:', updateErr);
                            return res.status(500).json({ error: 'Error actualizando predicción.' });
                        }

                        console.log(`✅ Predicción actualizada: ${predicted_home_score}-${predicted_away_score}${team_advances ? ` (Avanza: ${team_advances})` : ''}`);
                        res.json({
                            message: 'Predicción actualizada exitosamente',
                            prediction: {
                                id: existingPrediction.id,
                                match_id,
                                predicted_home_score,
                                predicted_away_score,
                                predicted_winner,
                                team_advances: team_advances || null
                            }
                        });
                    });

                } else {
                    // 4b. Crear nueva predicción
                    const insertQuery = `
                        INSERT INTO predictions_new 
                        (user_id, match_id, predicted_home_score, predicted_away_score, 
                         predicted_winner, team_advances, created_at, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
                    `;

                    db.run(insertQuery, [
                        userId,
                        match_id,
                        predicted_home_score,
                        predicted_away_score,
                        predicted_winner,
                        team_advances || null
                    ], function(insertErr) {
                        if (insertErr) {
                            console.error('❌ Error creando predicción:', insertErr);
                            return res.status(500).json({ error: 'Error creando predicción.' });
                        }

                        console.log(`✅ Nueva predicción creada: ${predicted_home_score}-${predicted_away_score}${team_advances ? ` (Avanza: ${team_advances})` : ''}`);
                        res.status(201).json({
                            message: 'Predicción creada exitosamente',
                            prediction: {
                                id: this.lastID,
                                match_id,
                                predicted_home_score,
                                predicted_away_score,
                                predicted_winner,
                                team_advances: team_advances || null
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


// GET /api/predictions/match/:matchId - Ver predicciones de un partido específico
router.get('/match/:matchId', authenticateToken, async (req, res) => {
    try {
        const { matchId } = req.params;
        const currentUserId = req.user.id;

        console.log(`🔍 Obteniendo predicciones del partido ${matchId} solicitadas por usuario ${currentUserId}`);

        // Verificar que el partido existe y está finalizado
        const matchQuery = `
            SELECT m.*, t.name as tournament_name, tp.name as phase_name
            FROM matches_new m
            LEFT JOIN tournaments t ON m.tournament_id = t.id
            LEFT JOIN tournament_phases tp ON m.phase_id = tp.id
            WHERE m.id = ? AND m.status = 'finished'
        `;

        const match = await new Promise((resolve, reject) => {
            db.get(matchQuery, [matchId], (err, result) => {
                if (err) reject(err);
                else resolve(result);
            });
        });

        if (!match) {
            return res.status(404).json({ 
                error: 'Partido no encontrado o aún no finalizado',
                message: 'Solo se pueden ver predicciones de partidos finalizados'
            });
        }

        // Obtener todas las predicciones del partido con información de usuarios
        const predictionsQuery = `
            SELECT 
                p.id,
                p.predicted_home_score,
                p.predicted_away_score,
                p.predicted_winner,
                p.points_earned,
                p.result_points,
                p.score_points,
                u.name as user_name,
                u.id as user_id,
                CASE 
                    WHEN p.predicted_home_score = m.home_score AND p.predicted_away_score = m.away_score THEN 'exact'
                    WHEN p.predicted_winner = (
                        CASE 
                            WHEN m.home_score > m.away_score THEN 'home'
                            WHEN m.away_score > m.home_score THEN 'away'
                            ELSE 'draw'
                        END
                    ) THEN 'result'
                    ELSE 'miss'
                END as prediction_accuracy
            FROM predictions_new p
            JOIN users u ON p.user_id = u.id
            JOIN matches_new m ON p.match_id = m.id
            WHERE p.match_id = ? AND u.is_active = true
            ORDER BY p.points_earned DESC, u.name ASC
        `;

        const predictions = await new Promise((resolve, reject) => {
            db.all(predictionsQuery, [matchId], (err, results) => {
                if (err) {
                    console.error('❌ Error obteniendo predicciones:', err);
                    reject(err);
                } else {
                    console.log(`✅ ${results?.length || 0} predicciones encontradas`);
                    resolve(results || []);
                }
            });
        });

        // Calcular estadísticas del partido
        const totalPredictions = predictions.length;
        const exactMatches = predictions.filter(p => p.prediction_accuracy === 'exact').length;
        const resultMatches = predictions.filter(p => p.prediction_accuracy === 'result').length;
        const missMatches = predictions.filter(p => p.prediction_accuracy === 'miss').length;

        res.json({
            match: {
                id: match.id,
                home_team: match.home_team,
                away_team: match.away_team,
                home_score: match.home_score,
                away_score: match.away_score,
                match_date: match.match_date,
                tournament_name: match.tournament_name,
                phase_name: match.phase_name
            },
            predictions,
            statistics: {
                total_predictions: totalPredictions,
                exact_matches: exactMatches,
                result_matches: resultMatches,
                misses: missMatches,
                exact_percentage: totalPredictions > 0 ? Math.round((exactMatches / totalPredictions) * 100) : 0,
                result_percentage: totalPredictions > 0 ? Math.round((resultMatches / totalPredictions) * 100) : 0
            },
            current_user_id: currentUserId
        });

    } catch (error) {
        console.error('❌ Error obteniendo predicciones del partido:', error);
        res.status(500).json({ 
            error: 'Error interno del servidor',
            details: error.message 
        });
    }
});


module.exports = router;
