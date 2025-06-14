// routes/leaderboard.js - VERSIÓN CORREGIDA Y COMPATIBLE

const express = require('express');
const { db } = require('../database'); // Usamos el db que exportaste
const { authenticateToken } = require('./auth');

const router = express.Router();

// GET /api/leaderboard - Tabla de posiciones para el DASHBOARD (TOP 5 y más)
router.get('/', authenticateToken, (req, res) => {
    const query = `
        SELECT
            u.id,
            u.name,
            COALESCE(SUM(p.points_earned), 0) AS total_points,
            ROW_NUMBER() OVER (ORDER BY COALESCE(SUM(p.points_earned), 0) DESC, u.name ASC) AS position
        FROM users u
        LEFT JOIN predictions_new p ON u.id = p.user_id
        WHERE u.is_admin = false AND u.is_active = true
        GROUP BY u.id, u.name
        ORDER BY total_points DESC, u.name ASC;
    `;
    
    db.all(query, [], (err, rows) => {
        if (err) {
            console.error('❌ Error en GET /api/leaderboard:', err);
            return res.status(500).json({ error: 'Error interno del servidor.' });
        }
        res.json(rows || []);
    });
});

// GET /api/leaderboard/full - Tabla de posiciones COMPLETA para el MODAL
router.get('/full', authenticateToken, (req, res) => {
    const query = `
        WITH user_points AS (
            SELECT
                u.id,
                u.name,
                COALESCE(SUM(p.points_earned), 0) AS total_points,
                COUNT(p.id) AS total_predictions,
                COALESCE(SUM(CASE WHEN p.points_earned > 0 THEN 1 ELSE 0 END), 0) AS successful_predictions,
                COALESCE(SUM(p.result_points), 0) as result_points,
                COALESCE(SUM(p.score_points), 0) as score_points
            FROM users u
            LEFT JOIN predictions_new p ON u.id = p.user_id
            WHERE u.is_admin = false AND u.is_active = true
            GROUP BY u.id, u.name
        )
        SELECT
            *,
            ROW_NUMBER() OVER (ORDER BY total_points DESC, name ASC) AS position
        FROM user_points
        ORDER BY position ASC;
    `;

    db.all(query, [], (err, rows) => {
        if (err) {
            console.error('❌ Error en GET /api/leaderboard/full:', err);
            return res.status(500).json({ error: 'Error interno del servidor.' });
        }
        res.json(rows || []);
    });
});

// GET /api/leaderboard/user/:userId - Posición de un usuario específico
router.get('/user/:userId', authenticateToken, (req, res) => {
    const { userId } = req.params;
    const query = `
        WITH ranked_users AS (
            SELECT
                u.id,
                COALESCE(SUM(p.points_earned), 0) AS total_points,
                ROW_NUMBER() OVER (ORDER BY COALESCE(SUM(p.points_earned), 0) DESC, u.name ASC) AS position
            FROM users u
            LEFT JOIN predictions_new p ON u.id = p.user_id
            WHERE u.is_admin = false AND u.is_active = true
            GROUP BY u.id, u.name
        )
        SELECT
            ru.total_points,
            ru.position,
            (SELECT COUNT(*) FROM users WHERE is_admin = false AND is_active = true) as total_participants
        FROM ranked_users ru
        WHERE ru.id = $1;
    `;

    db.get(query, [userId], (err, row) => {
        if (err) {
            console.error('❌ Error en GET /api/leaderboard/user/:userId:', err);
            return res.status(500).json({ error: 'Error interno del servidor.' });
        }

        if (row) {
            res.json(row);
        } else {
            // Si el usuario no está en el ranking (0 predicciones), damos un resultado por defecto.
            db.get('SELECT COUNT(*) as total_participants FROM users WHERE is_admin = false AND is_active = true', [], (err, countRow) => {
                if (err) {
                    return res.status(500).json({ error: 'Error interno del servidor.' });
                }
                res.json({ 
                    total_points: 0, 
                    position: '-', 
                    total_participants: countRow ? countRow.total_participants : 0 
                });
            });
        }
    });
});

module.exports = router;
