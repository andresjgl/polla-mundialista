// routes/predictions.js - VERSIÓN CORREGIDA Y SIMPLIFICADA

const express = require('express');
const { db } = require('../database');
const { authenticateToken } = require('./auth');

const router = express.Router();

// GET /api/predictions/user - Obtener todas las predicciones del usuario para el torneo activo
router.get('/user', authenticateToken, (req, res) => {
    const userId = req.user.id;
    
    // Esta consulta une las predicciones con los partidos y torneos para obtener toda la información
    const query = `
        SELECT 
            p.id,
            p.match_id,
            p.predicted_home_score,
            p.predicted_away_score,
            p.points_earned,
            m.home_team,
            m.away_team,
            m.match_date,
            m.status,
            m.home_score AS actual_home_score,
            m.away_score AS actual_away_score
        FROM predictions_new p
        JOIN matches_new m ON p.match_id = m.id
        JOIN tournaments t ON m.tournament_id = t.id
        WHERE p.user_id = $1 AND t.status = 'active'
        ORDER BY m.match_date DESC;
    `;
    
    // Usamos la función 'all' que adaptaste para PostgreSQL
    db.all(query, [userId], (err, rows) => {
        if (err) {
            console.error('❌ Error en GET /api/predictions/user:', err);
            // No enviar 'undefined'. Enviar un error JSON claro.
            return res.status(500).json({ error: 'Error al consultar la base de datos.' });
        }
        // Si no hay error, enviar las filas (puede ser un array vacío, lo cual es correcto)
        res.json(rows);
    });
});

// POST /api/predictions - Crear o actualizar una predicción (mantenemos el de la vez pasada que ya es robusto)
router.post('/', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const {
        match_id,
        predicted_home_score,
        predicted_away_score,
        penalty_prediction
    } = req.body;

    if (!match_id || predicted_home_score === undefined || predicted_away_score === undefined) {
        return res.status(400).json({ error: 'Faltan datos en la predicción.' });
    }

    try {
        const matchResult = await db.get('SELECT match_date FROM matches_new WHERE id = ?', [match_id]);
        if (!matchResult) return res.status(404).json({ error: 'El partido no existe.' });
        if (new Date(matchResult.match_date) < new Date()) return res.status(403).json({ error: 'Este partido ya ha comenzado.' });
        
        let predicted_winner = predicted_home_score > predicted_away_score ? 'home' : (predicted_away_score > predicted_home_score ? 'away' : 'draw');

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
        // Tu wrapper db.run/get/all necesita adaptarse para devolver 'rows' en PostgreSQL.
        // Asumiendo que tu 'db' object puede ejecutar la query de alguna forma:
        const { rows } = await db.query(upsertQuery, [userId, match_id, predicted_home_score, predicted_away_score, predicted_winner, penalty_prediction || null]);
        res.status(201).json({ message: 'Predicción guardada exitosamente', prediction: rows[0] });

    } catch (error) {
        console.error('Error guardando la predicción:', error);
        if(error.code === '23505') { // Código de violación de 'unique constraint'
             return res.status(409).json({ error: 'Ya existe una predicción para este partido.' });
        }
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// Añade esta línea al final si no está
module.exports = router;
