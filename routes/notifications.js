// routes/notifications.js - Sistema de notificaciones
const express = require('express');
const { authenticateToken } = require('./auth');
const { db } = require('../database');

const router = express.Router();

// ============= FUNCIONES UTILITARIAS =============

// Crear notificación - VERSIÓN CORREGIDA
async function createNotification(userId, type, title, message, data = {}) {
    return new Promise((resolve, reject) => {
        const { db } = require('../database');
        const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL;
        
        // ✅ USAR SINTAXIS CORRECTA SEGÚN ENTORNO
        let query, params;
        
        if (isProduction) {
            // PostgreSQL
            query = `
                INSERT INTO notifications (user_id, type, title, message, data, created_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
            `;
            params = [userId, type, title, message, JSON.stringify(data)];
        } else {
            // SQLite
            query = `
                INSERT INTO notifications (user_id, type, title, message, data, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
            `;
            params = [userId, type, title, message, JSON.stringify(data)];
        }
        
        db.run(query, params, function(err) {
            if (err) {
                console.error('❌ Error creando notificación:', err);
                reject(err);
            } else {
                console.log(`🔔 Notificación creada para usuario ${userId}: ${title}`);
                resolve(this.lastID);
            }
        });
    });
}

// ============= RUTAS DE API =============

// GET /api/notifications - Obtener notificaciones del usuario
router.get('/', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { limit = 20, offset = 0, unread_only = false } = req.query;

        let whereClause = 'WHERE user_id = ?';
        let params = [userId];

        if (unread_only === 'true') {
            whereClause += ' AND is_read = FALSE';
        }

        const query = `
            SELECT 
                id,
                type,
                title,
                message,
                data,
                is_read,
                created_at
            FROM notifications
            ${whereClause}
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
        `;

        params.push(parseInt(limit), parseInt(offset));

        db.all(query, params, (err, notifications) => {
            if (err) {
                console.error('❌ Error obteniendo notificaciones:', err);
                return res.status(500).json({ error: 'Error interno del servidor' });
            }

            // Contar notificaciones no leídas
            db.get('SELECT COUNT(*) as unread_count FROM notifications WHERE user_id = ? AND is_read = FALSE', 
                [userId], (countErr, countResult) => {
                if (countErr) {
                    console.error('❌ Error contando no leídas:', countErr);
                }

                res.json({
                    notifications: notifications || [],
                    unread_count: countResult?.unread_count || 0,
                    total: notifications?.length || 0
                });
            });
        });

    } catch (error) {
        console.error('❌ Error en ruta de notificaciones:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// POST /api/notifications/mark-read - Marcar notificaciones como leídas
router.post('/mark-read', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { notification_ids } = req.body;

        if (!notification_ids || !Array.isArray(notification_ids)) {
            return res.status(400).json({ error: 'IDs de notificaciones requeridos' });
        }

        const placeholders = notification_ids.map(() => '?').join(',');
        const query = `
            UPDATE notifications 
            SET is_read = TRUE, updated_at = NOW()
            WHERE user_id = ? AND id IN (${placeholders})
        `;

        const params = [userId, ...notification_ids];

        db.run(query, params, function(err) {
            if (err) {
                console.error('❌ Error marcando como leídas:', err);
                return res.status(500).json({ error: 'Error interno del servidor' });
            }

            console.log(`✅ ${this.changes} notificaciones marcadas como leídas`);
            res.json({ 
                message: 'Notificaciones marcadas como leídas',
                updated: this.changes 
            });
        });

    } catch (error) {
        console.error('❌ Error marcando notificaciones:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// POST /api/notifications/mark-all-read - Marcar todas como leídas
router.post('/mark-all-read', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;

        db.run(`
            UPDATE notifications 
            SET is_read = TRUE, updated_at = NOW()
            WHERE user_id = ? AND is_read = FALSE
        `, [userId], function(err) {
            if (err) {
                console.error('❌ Error marcando todas como leídas:', err);
                return res.status(500).json({ error: 'Error interno del servidor' });
            }

            console.log(`✅ ${this.changes} notificaciones marcadas como leídas`);
            res.json({ 
                message: 'Todas las notificaciones marcadas como leídas',
                updated: this.changes 
            });
        });

    } catch (error) {
        console.error('❌ Error marcando todas las notificaciones:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// ============= FUNCIONES DE NOTIFICACIÓN AUTOMÁTICA =============

// Notificación cuando se actualiza resultado de partido
// Notificación cuando se actualiza resultado de partido - VERSIÓN SIMPLIFICADA
async function notifyMatchResult(matchId, homeScore, awayScore) {
    try {
        console.log(`🔔 Creando notificaciones para resultado: ${matchId}`);

        // Obtener información del partido
        const { db } = require('../database');
        const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL;
        
        const matchQuery = `
            SELECT m.*, t.name as tournament_name, tp.name as phase_name
            FROM matches_new m
            LEFT JOIN tournaments t ON m.tournament_id = t.id
            LEFT JOIN tournament_phases tp ON m.phase_id = tp.id
            WHERE m.id = ${isProduction ? '$1' : '?'}
        `;

        const match = await new Promise((resolve, reject) => {
            db.get(matchQuery, [matchId], (err, result) => {
                if (err) reject(err);
                else resolve(result);
            });
        });

        if (!match) return;

        // Obtener todos los usuarios que predijeron este partido
        const predictionsQuery = `
            SELECT DISTINCT p.user_id, u.name
            FROM predictions_new p
            JOIN users u ON p.user_id = u.id
            WHERE p.match_id = ${isProduction ? '$1' : '?'} AND u.is_active = true
        `;

        const users = await new Promise((resolve, reject) => {
            db.all(predictionsQuery, [matchId], (err, results) => {
                if (err) reject(err);
                else resolve(results || []);
            });
        });

        // ✨ VERSIÓN SIMPLIFICADA - SIN CALCULAR POSICIONES
        for (const user of users) {
            const title = `📊 Resultado Actualizado`;
            const message = `${match.home_team} ${homeScore}-${awayScore} ${match.away_team} (${match.phase_name})`;
            
            const data = {
                match_id: matchId,
                match_info: {
                    home_team: match.home_team,
                    away_team: match.away_team,
                    home_score: homeScore,
                    away_score: awayScore,
                    phase_name: match.phase_name,
                    tournament_name: match.tournament_name
                }
            };

            // ✅ CREAR NOTIFICACIÓN SIN CALCULAR POSICIÓN
            await createNotification(user.user_id, 'result_updated', title, message, data);
        }

        console.log(`✅ Notificaciones simples enviadas a ${users.length} usuarios`);

    } catch (error) {
        console.error('❌ Error enviando notificaciones de resultado:', error);
    }
}


// Verificar partidos próximos sin predicción
async function checkUpcomingMatches() {
    try {
        console.log('🔍 Verificando partidos próximos sin predicción...');

        // Obtener partidos que empiezan en las próximas 2 horas y no tienen predicción de usuarios activos
        const query = `
            SELECT DISTINCT 
                m.id,
                m.home_team,
                m.away_team,
                m.match_date,
                u.id as user_id,
                u.name as user_name
            FROM matches_new m
            CROSS JOIN users u
            LEFT JOIN predictions_new p ON m.id = p.match_id AND u.id = p.user_id
            WHERE m.status = 'scheduled'
            AND u.is_active = true
            AND p.id IS NULL
            AND m.match_date > NOW()
            AND m.match_date <= NOW() + INTERVAL '2 hours'
        `;

        db.all(query, [], async (err, results) => {
            if (err) {
                console.error('❌ Error verificando partidos próximos:', err);
                return;
            }

            for (const result of results || []) {
                const title = `⏰ ¡Partido próximo!`;
                const message = `${result.home_team} vs ${result.away_team} empieza pronto. ¡No olvides hacer tu predicción!`;
                
                const data = {
                    match_id: result.id,
                    match_date: result.match_date,
                    home_team: result.home_team,
                    away_team: result.away_team
                };

                await createNotification(result.user_id, 'match_starting', title, message, data);
            }

            if (results && results.length > 0) {
                console.log(`✅ Enviadas ${results.length} notificaciones de partidos próximos`);
            }
        });

    } catch (error) {
        console.error('❌ Error verificando partidos próximos:', error);
    }
}

// ============= EXPORTAR FUNCIONES =============

module.exports = router;
module.exports.createNotification = createNotification;
module.exports.notifyMatchResult = notifyMatchResult;
module.exports.checkUpcomingMatches = checkUpcomingMatches;

