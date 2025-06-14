// routes/leaderboard.js - VERSIÓN MEJORADA CON TABLA COMPLETA

const express = require('express');
const { db } = require('../database');
const { authenticateToken } = require('./auth');

const router = express.Router();

// GET /api/leaderboard - Tabla de posiciones para el DASHBOARD (TOP 5)
router.get('/', authenticateToken, async (req, res) => {
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
    try {
        const { rows } = await db.query(query);
        res.json(rows || []);
    } catch (error) {
        console.error('Error en GET /api/leaderboard:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// GET /api/leaderboard/full - Tabla de posiciones COMPLETA para el MODAL
router.get('/full', authenticateToken, async (req, res) => {
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
            JOIN matches_new m ON p.match_id = m.id
            JOIN tournaments t ON m.tournament_id = t.id AND t.status = 'active'
            WHERE u.is_admin = false AND u.is_active = true
            GROUP BY u.id, u.name
        )
        SELECT
            *,
            ROW_NUMBER() OVER (ORDER BY total_points DESC, name ASC) AS position
        FROM user_points
        ORDER BY position ASC;
    `;
    try {
        const { rows } = await db.query(query);
        res.json(rows || []);
    } catch (error) {
        console.error('Error en GET /api/leaderboard/full:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// GET /api/leaderboard/user/:userId - Posición de un usuario específico
router.get('/user/:userId', authenticateToken, async (req, res) => {
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
    try {
        const { rows } = await db.query(query, [userId]);
        if (rows.length > 0) {
            res.json(rows[0]);
        } else {
            // Si el usuario no tiene predicciones, no aparecerá en el ranking, así que le damos un resultado por defecto.
            const { rows: totalUsersRows } = await db.query('SELECT COUNT(*) as total_participants FROM users WHERE is_admin = false AND is_active = true');
            res.json({ total_points: 0, position: '-', total_participants: totalUsersRows[0].total_participants });
        }
    } catch (error) {
        console.error('Error en GET /api/leaderboard/user/:userId:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

module.exports = router;
