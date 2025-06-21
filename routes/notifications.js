// routes/notifications.js - Sistema de notificaciones
const express = require('express');
const { authenticateToken } = require('./auth');
const { db } = require('../database');
const webpush = require('web-push'); // ✨ NUEVA LÍNEA

const router = express.Router();

// ✨ CONFIGURACIÓN WEB PUSH
webpush.setVapidDetails(
    'mailto:andresjgl1986@gmail.com', // Cambia por tu email
    process.env.VAPID_PUBLIC_KEY || 'BNASXfnwv9-1BkWn9SrnrYIUM2uWRsab8of7a6ZaMojrWKirx8UNqOsSITCDsyv3d9jR_EXc4R2LzxGKZEgKEA0',
    process.env.VAPID_PRIVATE_KEY || 'khN7893QjeohVXC1ZPlsie3kMt3cPc7nvncA-VjekIQ'
);

console.log('🔧 Web Push configurado con claves VAPID');


// ============= FUNCIONES UTILITARIAS =============

// Crear notificación
async function createNotification(userId, type, title, message, data = {}) {
    return new Promise((resolve, reject) => {
        const query = `
            INSERT INTO notifications (user_id, type, title, message, data, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, NOW(), NOW())
        `;
        
        db.run(query, [userId, type, title, message, JSON.stringify(data)], function(err) {
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

// Detectar cambio de posición
async function detectPositionChange(userId) {
    return new Promise((resolve, reject) => {
        const query = `
            SELECT 
                ROW_NUMBER() OVER (ORDER BY total_points DESC) as position,
                total_points,
                name
            FROM (
                SELECT 
                    u.id,
                    u.name,
                    COALESCE(SUM(p.points_earned), 0) as total_points
                FROM users u
                LEFT JOIN predictions_new p ON u.id = p.user_id
                WHERE u.is_active = true
                GROUP BY u.id, u.name
            ) ranked
        `;
        
        db.all(query, [], (err, results) => {
            if (err) {
                reject(err);
            } else {
                const userRanking = results.find(r => r.id == userId);
                resolve(userRanking || { position: 0, total_points: 0 });
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
async function notifyMatchResult(matchId, homeScore, awayScore) {
    try {
        console.log(`🔔 Creando notificaciones para resultado: ${matchId}`);

        // Obtener información del partido y predicciones
        const matchQuery = `
            SELECT m.*, t.name as tournament_name, tp.name as phase_name
            FROM matches_new m
            LEFT JOIN tournaments t ON m.tournament_id = t.id
            LEFT JOIN tournament_phases tp ON m.phase_id = tp.id
            WHERE m.id = ?
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
            WHERE p.match_id = ? AND u.is_active = true
        `;

        const users = await new Promise((resolve, reject) => {
            db.all(predictionsQuery, [matchId], (err, results) => {
                if (err) reject(err);
                else resolve(results || []);
            });
        });

        // Crear notificación para cada usuario
        for (const user of users) {
            // Calcular nueva posición (opcional, puede ser costoso)
            let positionInfo = '';
            try {
                const ranking = await detectPositionChange(user.user_id);
                if (ranking.position) {
                    positionInfo = ` | Posición actual: #${ranking.position}`;
                }
            } catch (posErr) {
                console.warn('⚠️ Error calculando posición:', posErr);
            }

            const title = `📊 Resultado Actualizado`;
            const message = `${match.home_team} ${homeScore}-${awayScore} ${match.away_team} (${match.phase_name})${positionInfo}`;
            
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

            await createNotification(user.user_id, 'result_updated', title, message, data);
        }

        console.log(`✅ Notificaciones de resultado enviadas a ${users.length} usuarios`);

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

// ============= RUTAS PARA PUSH NOTIFICATIONS =============

// POST /api/notifications/subscribe - Suscribirse a notificaciones push
// POST /api/notifications/subscribe - VERSIÓN CORREGIDA
router.post('/subscribe', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { subscription, user_agent, device_type } = req.body;

        console.log(`📱 Nueva suscripción push para usuario ${userId}`);

        if (!subscription || !subscription.endpoint) {
            return res.status(400).json({ error: 'Datos de suscripción incompletos' });
        }

        const { endpoint, keys } = subscription;
        
        if (!keys || !keys.p256dh || !keys.auth) {
            return res.status(400).json({ error: 'Claves de suscripción faltantes' });
        }

        // ✅ USAR SINTAXIS CORRECTA SEGÚN ENTORNO
        const { db } = require('../database');
        const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL;

        // Para PostgreSQL usamos INSERT ... ON CONFLICT, para SQLite usamos INSERT OR REPLACE
        let query;
        let params;

        if (isProduction) {
            // PostgreSQL
            query = `
                INSERT INTO push_subscriptions 
                (user_id, endpoint, p256dh_key, auth_key, user_agent, device_type, created_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
                ON CONFLICT (user_id, endpoint) 
                DO UPDATE SET 
                    p256dh_key = EXCLUDED.p256dh_key,
                    auth_key = EXCLUDED.auth_key,
                    user_agent = EXCLUDED.user_agent,
                    device_type = EXCLUDED.device_type,
                    is_active = TRUE,
                    updated_at = NOW()
            `;
            params = [userId, endpoint, keys.p256dh, keys.auth, user_agent || '', device_type || 'desktop'];
        } else {
            // SQLite
            query = `
                INSERT OR REPLACE INTO push_subscriptions 
                (user_id, endpoint, p256dh_key, auth_key, user_agent, device_type, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
            `;
            params = [userId, endpoint, keys.p256dh, keys.auth, user_agent || '', device_type || 'desktop'];
        }

        db.run(query, params, function(err) {
            if (err) {
                console.error('❌ Error guardando suscripción:', err);
                return res.status(500).json({ error: 'Error guardando suscripción' });
            }

            console.log(`✅ Suscripción push guardada para usuario ${userId}`);
            
            // Enviar notificación de bienvenida (sin esperar)
            setTimeout(() => {
                sendWelcomePushNotification(userId).catch(error => {
                    console.error('⚠️ Error enviando notificación de bienvenida:', error);
                });
            }, 1000);

            res.json({ 
                message: 'Suscripción guardada exitosamente',
                subscription_id: this.lastID || 'updated'
            });
        });

    } catch (error) {
        console.error('❌ Error en suscripción push:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});


// POST /api/notifications/unsubscribe - Cancelar suscripción
router.post('/unsubscribe', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { endpoint } = req.body;

        if (endpoint) {
            // Desactivar suscripción específica
            db.run(`
                UPDATE push_subscriptions 
                SET is_active = FALSE, updated_at = NOW()
                WHERE user_id = ? AND endpoint = ?
            `, [userId, endpoint], function(err) {
                if (err) {
                    console.error('❌ Error desactivando suscripción:', err);
                    return res.status(500).json({ error: 'Error desactivando suscripción' });
                }

                console.log(`🔕 Suscripción desactivada para usuario ${userId}`);
                res.json({ message: 'Suscripción desactivada' });
            });
        } else {
            // Desactivar todas las suscripciones del usuario
            db.run(`
                UPDATE push_subscriptions 
                SET is_active = FALSE, updated_at = NOW()
                WHERE user_id = ?
            `, [userId], function(err) {
                if (err) {
                    console.error('❌ Error desactivando suscripciones:', err);
                    return res.status(500).json({ error: 'Error desactivando suscripciones' });
                }

                console.log(`🔕 Todas las suscripciones desactivadas para usuario ${userId}`);
                res.json({ message: 'Todas las suscripciones desactivadas' });
            });
        }

    } catch (error) {
        console.error('❌ Error cancelando suscripción:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// GET /api/notifications/push-status - Estado de notificaciones push del usuario
router.get('/push-status', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;

        db.all(`
            SELECT COUNT(*) as total_subscriptions,
                   COUNT(CASE WHEN is_active = TRUE THEN 1 END) as active_subscriptions,
                   MAX(created_at) as last_subscription
            FROM push_subscriptions 
            WHERE user_id = ?
        `, [userId], (err, result) => {
            if (err) {
                console.error('❌ Error obteniendo estado push:', err);
                return res.status(500).json({ error: 'Error interno del servidor' });
            }

            const status = result[0] || { total_subscriptions: 0, active_subscriptions: 0 };
            
            res.json({
                user_id: userId,
                has_push_subscriptions: status.active_subscriptions > 0,
                active_subscriptions: status.active_subscriptions,
                total_subscriptions: status.total_subscriptions,
                last_subscription: status.last_subscription
            });
        });

    } catch (error) {
        console.error('❌ Error obteniendo estado push:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// ============= FUNCIONES PARA ENVIAR PUSH NOTIFICATIONS =============

// Enviar notificación push a un usuario específico
// Enviar notificación push a un usuario específico - VERSIÓN CORREGIDA
async function sendPushNotification(userId, title, message, data = {}) {
    try {
        console.log(`📱 Enviando push notification a usuario ${userId}: ${title}`);

        // ✅ USAR FUNCIÓN DE DATABASE.JS EN LUGAR DE CONSULTA DIRECTA
        const { db } = require('../database');
        
        const subscriptions = await new Promise((resolve, reject) => {
            // Usar sintaxis correcta según el entorno
            const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL;
            const query = `
                SELECT endpoint, p256dh_key, auth_key, device_type
                FROM push_subscriptions 
                WHERE user_id = ${isProduction ? '$1' : '?'} AND is_active = TRUE
            `;
            
            db.all(query, [userId], (err, results) => {
                if (err) {
                    console.error('❌ Error obteniendo suscripciones:', err);
                    reject(err);
                } else {
                    resolve(results || []);
                }
            });
        });

        if (subscriptions.length === 0) {
            console.log(`⚠️ No hay suscripciones activas para usuario ${userId}`);
            return { sent: 0, errors: 0 };
        }

        const payload = JSON.stringify({
            title,
            message,
            url: '/dashboard.html',
            type: data.type || 'general',
            matchId: data.matchId,
            timestamp: new Date().toISOString()
        });

        let sent = 0;
        let errors = 0;

        // Enviar a todas las suscripciones del usuario
        for (const subscription of subscriptions) {
            try {
                const pushSubscription = {
                    endpoint: subscription.endpoint,
                    keys: {
                        p256dh: subscription.p256dh_key,
                        auth: subscription.auth_key
                    }
                };

                await webpush.sendNotification(pushSubscription, payload);
                sent++;
                console.log(`✅ Push enviado a dispositivo ${subscription.device_type}`);

            } catch (pushError) {
                errors++;
                console.error(`❌ Error enviando push:`, pushError.message);
                
                // Si la suscripción es inválida, desactivarla
                if (pushError.statusCode === 410 || pushError.statusCode === 404) {
                    console.log('🔕 Desactivando suscripción inválida');
                    const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL;
                    const updateQuery = `
                        UPDATE push_subscriptions 
                        SET is_active = FALSE 
                        WHERE endpoint = ${isProduction ? '$1' : '?'}
                    `;
                    db.run(updateQuery, [subscription.endpoint]);
                }
            }
        }

        console.log(`📊 Push notifications enviadas: ${sent} exitosas, ${errors} errores`);
        return { sent, errors };

    } catch (error) {
        console.error('❌ Error general enviando push notification:', error);
        return { sent: 0, errors: 1 };
    }
}

// Enviar notificación push a múltiples usuarios
async function sendPushNotificationToUsers(userIds, title, message, data = {}) {
    const results = [];
    
    for (const userId of userIds) {
        try {
            const result = await sendPushNotification(userId, title, message, data);
            results.push({ userId, ...result });
        } catch (error) {
            console.error(`❌ Error enviando push a usuario ${userId}:`, error);
            results.push({ userId, sent: 0, errors: 1 });
        }
    }
    
    const totalSent = results.reduce((sum, r) => sum + r.sent, 0);
    const totalErrors = results.reduce((sum, r) => sum + r.errors, 0);
    
    console.log(`📊 Resumen push notifications: ${totalSent} enviadas, ${totalErrors} errores`);
    return { totalSent, totalErrors, details: results };
}

// Notificación de bienvenida
async function sendWelcomePushNotification(userId) {
    return await sendPushNotification(
        userId,
        '🎉 ¡Notificaciones Activadas!',
        'Recibirás alertas de partidos próximos y resultados actualizados',
        { type: 'welcome' }
    );
}

// Notificar resultado con push notifications
// Notificar resultado con push notifications - VERSIÓN CORREGIDA
async function notifyMatchResultWithPush(matchId, homeScore, awayScore) {
    try {
        console.log(`🔔 Enviando push notifications para resultado: ${matchId}`);

        // ✅ USAR FUNCIÓN DE DATABASE.JS
        const { db } = require('../database');
        const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL;

        // Obtener información del partido con sintaxis correcta
        const match = await new Promise((resolve, reject) => {
            const query = `
                SELECT m.*, t.name as tournament_name, tp.name as phase_name
                FROM matches_new m
                LEFT JOIN tournaments t ON m.tournament_id = t.id
                LEFT JOIN tournament_phases tp ON m.phase_id = tp.id
                WHERE m.id = ${isProduction ? '$1' : '?'}
            `;
            
            db.get(query, [matchId], (err, result) => {
                if (err) {
                    console.error('❌ Error obteniendo partido:', err);
                    reject(err);
                } else {
                    resolve(result);
                }
            });
        });

        if (!match) {
            console.error('❌ Partido no encontrado para push notification');
            return;
        }

        // Obtener usuarios que predijeron este partido
        const users = await new Promise((resolve, reject) => {
            const query = `
                SELECT DISTINCT p.user_id
                FROM predictions_new p
                JOIN users u ON p.user_id = u.id
                WHERE p.match_id = ${isProduction ? '$1' : '?'} AND u.is_active = true
            `;
            
            db.all(query, [matchId], (err, results) => {
                if (err) {
                    console.error('❌ Error obteniendo usuarios:', err);
                    reject(err);
                } else {
                    resolve(results || []);
                }
            });
        });

        if (users.length === 0) {
            console.log('⚠️ No hay usuarios para notificar');
            return;
        }

        const userIds = users.map(u => u.user_id);
        const title = '📊 Resultado Actualizado';
        const message = `${match.home_team} ${homeScore}-${awayScore} ${match.away_team}`;
        
        // Enviar push notifications
        await sendPushNotificationToUsers(userIds, title, message, {
            type: 'result_updated',
            matchId: matchId
        });

        console.log(`✅ Push notifications enviadas para ${match.home_team} vs ${match.away_team}`);

    } catch (error) {
        console.error('❌ Error enviando push notifications de resultado:', error);
    }
}


// ============= EXPORTAR FUNCIONES =============

module.exports = router;
module.exports.createNotification = createNotification;
module.exports.notifyMatchResult = notifyMatchResult;
module.exports.checkUpcomingMatches = checkUpcomingMatches;
module.exports.sendPushNotification = sendPushNotification;
module.exports.sendPushNotificationToUsers = sendPushNotificationToUsers;
module.exports.notifyMatchResultWithPush = notifyMatchResultWithPush;

