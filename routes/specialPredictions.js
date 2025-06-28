const express = require('express');
const { authenticateToken } = require('./auth');
const { db } = require('../database');
const router = express.Router();

// GET - Obtener estado de pronósticos especiales
router.get('/special', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL;
        
        // Obtener torneo activo con equipos
        const tournamentQuery = `
            SELECT t.*, 
                   COUNT(DISTINCT te.id) as team_count
            FROM tournaments t
            LEFT JOIN teams te ON 1=1
            WHERE t.status = 'active'
            GROUP BY t.id
            LIMIT 1
        `;
        
        const tournament = await new Promise((resolve, reject) => {
            db.get(tournamentQuery, [], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
        
        if (!tournament) {
            return res.json({ tournament: null });
        }
        
        // Obtener todos los equipos
        const teams = await new Promise((resolve, reject) => {
            db.all('SELECT id, name, country FROM teams ORDER BY name', [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
        
        // Verificar si puede hacer pronósticos
        const now = new Date();
        const deadline = new Date(tournament.special_predictions_deadline);
        const canPredict = now < deadline;
        
        // Calcular tiempo restante
        let timeRemaining = null;
        if (canPredict) {
            const diff = deadline - now;
            const days = Math.floor(diff / (1000 * 60 * 60 * 24));
            const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            
            if (days > 0) timeRemaining = `${days} días, ${hours} horas`;
            else if (hours > 0) timeRemaining = `${hours} horas, ${minutes} minutos`;
            else timeRemaining = `${minutes} minutos`;
        }
        
        // Obtener predicción del usuario si existe
        const userPredictionQuery = `
            SELECT tp.*, t.name as champion_team_name
            FROM tournament_predictions tp
            LEFT JOIN teams t ON tp.champion_team_id = t.id
            WHERE tp.user_id = ${isProduction ? '$1' : '?'} AND tp.tournament_id = ${isProduction ? '$2' : '?'}
        `;
        
        const userPrediction = await new Promise((resolve, reject) => {
            db.get(userPredictionQuery, [userId, tournament.id], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
        
        res.json({
            tournament: {
                id: tournament.id,
                name: tournament.name,
                champion_points: tournament.champion_points || 15,
                top_scorer_points: tournament.top_scorer_points || 10,
                special_predictions_deadline: tournament.special_predictions_deadline
            },
            teams,
            userPrediction,
            canPredict,
            timeRemaining
        });
        
    } catch (error) {
        console.error('Error obteniendo pronósticos especiales:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// POST - Guardar pronósticos especiales
router.post('/special', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { champion_team_id, top_scorer_name } = req.body;
        const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL;
        
        // Validaciones
        if (!champion_team_id || !top_scorer_name) {
            return res.status(400).json({ error: 'Todos los campos son requeridos' });
        }
        
        // Obtener torneo activo
        const tournament = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM tournaments WHERE status = ?', ['active'], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
        
        if (!tournament) {
            return res.status(400).json({ error: 'No hay torneo activo' });
        }
        
        // Validar fecha límite
        const now = new Date();
        const deadline = new Date(tournament.special_predictions_deadline);
        
        if (now > deadline) {
            return res.status(400).json({ 
                error: 'El plazo para hacer estos pronósticos ha vencido',
                deadline: deadline
            });
        }
        
        // Verificar que el equipo existe
        const team = await new Promise((resolve, reject) => {
            db.get('SELECT id FROM teams WHERE id = ?', [champion_team_id], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
        
        if (!team) {
            return res.status(400).json({ error: 'Equipo no válido' });
        }
        
        // Insertar o actualizar predicción
        const upsertQuery = isProduction ?
            `INSERT INTO tournament_predictions 
                (user_id, tournament_id, champion_team_id, top_scorer_name, created_at, updated_at)
            VALUES ($1, $2, $3, $4, NOW(), NOW())
            ON CONFLICT(user_id, tournament_id) DO UPDATE SET
                champion_team_id = EXCLUDED.champion_team_id,
                top_scorer_name = EXCLUDED.top_scorer_name,
                updated_at = NOW()` :
            `INSERT INTO tournament_predictions 
                (user_id, tournament_id, champion_team_id, top_scorer_name, created_at, updated_at)
            VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
            ON CONFLICT(user_id, tournament_id) DO UPDATE SET
                champion_team_id = excluded.champion_team_id,
                top_scorer_name = excluded.top_scorer_name,
                updated_at = datetime('now')`;
        
        await new Promise((resolve, reject) => {
            db.run(upsertQuery, [userId, tournament.id, champion_team_id, top_scorer_name], function(err) {
                if (err) reject(err);
                else resolve(this);
            });
        });
        
        res.json({ 
            success: true, 
            message: 'Pronósticos guardados exitosamente' 
        });
        
    } catch (error) {
        console.error('Error guardando pronósticos especiales:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

module.exports = router;
