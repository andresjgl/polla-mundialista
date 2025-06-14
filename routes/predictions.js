// routes/predictions.js - VERSIÓN CORREGIDA PARA POSTGRESQL

const express = require('express');
const { db } = require('../database');
const { authenticateToken } = require('./auth');

const router = express.Router();

// GET /api/predictions/user - Obtener todas las predicciones del usuario para el torneo activo
router.get('/user', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const query = `
        SELECT p.*, m.home_team, m.away_team, m.match_date, m.status,
               m.home_score as actual_home_score, m.away_score as actual_away_score,
               tp.name as phase_name
        FROM predictions_new p
        JOIN matches_new m ON p.match_id = m.id
        JOIN tournaments t ON m.tournament_id = t.id
        LEFT JOIN tournament_phases tp ON m.phase_id = tp.id
        WHERE p.user_id = $1 AND t.status = 'active'
        ORDER BY m.match_date ASC;
    `;
    try {
        const { rows } = await db.query(query, [userId]);
        res.json(rows || []);
    } catch (error) {
        console.error('Error obteniendo predicciones del usuario:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// POST /api/predictions - Crear o actualizar una predicción
router.post('/', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const {
        match_id,
        predicted_home_score,
        predicted_away_score,
        penalty_prediction // Para fases eliminatorias
    } = req.body;

    // Validaciones
    if (!match_id || predicted_home_score === undefined || predicted_away_score === undefined) {
        return res.status(400).json({ error: 'Faltan datos en la predicción.' });
    }

    try {
        // Verificar si el partido ya empezó
        const matchResult = await db.query('SELECT match_date FROM matches_new WHERE id = $1', [match_id]);
        const match = matchResult.rows[0];

        if (!match) {
            return res.status(404).json({ error: 'El partido no existe.' });
        }

        if (new Date(match.match_date) < new Date()) {
            return res.status(403).json({ error: 'Este partido ya ha comenzado. No se puede predecir.' });
        }
        
        // Determinar el ganador basado en el marcador
        let predicted_winner;
        if (predicted_home_score > predicted_away_score) {
            predicted_winner = 'home';
        } else if (predicted_away_score > predicted_home_score) {
            predicted_winner = 'away';
        } else {
            predicted_winner = 'draw';
        }

        // Lógica para crear o actualizar la predicción (Upsert)
        const upsertQuery = `
            INSERT INTO predictions_new (user_id, match_id, predicted_home_score, predicted_away_score, predicted_winner, penalty_prediction, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, NOW())
            ON CONFLICT (user_id, match_id) 
            DO UPDATE SET
                predicted_home_score = EXCLUDED.predicted_home_score,
                predicted_away_score = EXCLUDED.predicted_away_score,
                predicted_winner = EXCLUDED.predicted_winner,
                penalty_prediction = EXCLUDED.penalty_prediction,
                updated_at = NOW()
            RETURNING *;
        `;

        const { rows } = await db.query(upsertQuery, [userId, match_id, predicted_home_score, predicted_away_score, predicted_winner, penalty_prediction || null]);
        res.status(201).json({ message: 'Predicción guardada exitosamente', prediction: rows[0] });

    } catch (error) {
        console.error('Error guardando la predicción:', error);
        res.status(500).json({ error: 'Error interno del servidor al guardar la predicción.' });
    }
});

module.exports = router;
