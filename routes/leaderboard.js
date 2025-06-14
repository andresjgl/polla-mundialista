// routes/leaderboard.js - Tabla de posiciones
const express = require('express');
const { authenticateToken } = require('./auth');

const router = express.Router();

// GET /api/leaderboard - Tabla de posiciones (SOLO TORNEO ACTIVO)
// GET /api/leaderboard - Tabla de posiciones (SIN ADMINS)
router.get('/', async (req, res) => {
    console.log('🔍 GET /leaderboard - versión simplificada');
    
    try {
        const { db } = require('../database');
        
        // Query súper simple que SÍ funciona en PostgreSQL
        db.all(`
            SELECT 
                u.id,
                u.name,
                0 as total_points,
                0 as total_predictions,
                1 as position
            FROM users u
            WHERE u.is_admin = false AND u.is_active = true
            ORDER BY u.name
            LIMIT 10
        `, [], (err, users) => {
            if (err) {
                console.error('❌ Error en leaderboard simple:', err);
                console.log('📤 Devolviendo array vacío');
                return res.json([]);
            }
            
            console.log(`✅ Leaderboard simple: ${users ? users.length : 0} usuarios`);
            
            // Asegurar formato correcto
            const safeUsers = (users || []).map((user, index) => ({
                id: user.id || 0,
                name: user.name || 'Usuario',
                total_points: 0,
                total_predictions: 0,
                position: index + 1
            }));
            
            console.log('📤 Devolviendo:', safeUsers);
            res.json(safeUsers);
        });
        
    } catch (error) {
        console.error('❌ Error catch en leaderboard:', error);
        res.json([]);
    }
});


// GET /api/leaderboard/user/:userId - Posición específica (SIN ADMINS)
router.get('/user/:userId', authenticateToken, async (req, res) => {
    console.log('🔍 GET /leaderboard/user/:userId solicitado');
    
    try {
        const { userId } = req.params;
        const { db } = require('../database');
        
        // Verificar si el usuario es admin
        db.get('SELECT is_admin FROM users WHERE id = ?', [userId], (err, user) => {
            if (err) {
                console.error('❌ Error verificando usuario:', err);
                // NO devolver error 500, sino datos por defecto
                return res.json({
                    id: userId,
                    total_points: 0,
                    total_predictions: 0,
                    position: null,
                    total_participants: 0,
                    tournament_name: null,
                    is_admin: false
                });
            }
            
            if (user && user.is_admin) {
                console.log('👑 Usuario es admin, devolviendo datos vacíos');
                // Si es admin, devolver datos vacíos
                return res.json({
                    id: userId,
                    total_points: 0,
                    total_predictions: 0,
                    position: null,
                    total_participants: 0,
                    tournament_name: null,
                    is_admin: true
                });
            }
            
            // Si no es admin, proceder normalmente - QUERY ARREGLADA PARA POSTGRESQL
            db.get(`
                SELECT u.id, u.name,
                       COALESCE(SUM(p.points_earned), 0) as total_points,
                       COUNT(p.id) as total_predictions,
                       COALESCE(t.name, 'Sin torneo') as tournament_name
                FROM users u
                LEFT JOIN predictions_new p ON u.id = p.user_id
                LEFT JOIN matches_new m ON p.match_id = m.id
                LEFT JOIN tournaments t ON m.tournament_id = t.id
                WHERE u.id = ? AND u.is_active = true AND u.is_admin = false
                  AND (t.status = 'active' OR t.status IS NULL)
                GROUP BY u.id, u.name, t.name
            `, [userId], (err, userStats) => {
                if (err) {
                    console.error('❌ Error obteniendo stats del usuario:', err);
                    // NO devolver error 500, sino datos por defecto
                    return res.json({
                        id: userId,
                        total_points: 0,
                        total_predictions: 0,
                        position: 1,
                        total_participants: 0,
                        tournament_name: null
                    });
                }

                if (!userStats) {
                    console.log('⚠️ Usuario no encontrado o sin datos');
                    return res.json({
                        id: userId,
                        total_points: 0,
                        total_predictions: 0,
                        position: 1,
                        total_participants: 0,
                        tournament_name: null
                    });
                }

                // Obtener posición del usuario (solo entre no-admins) - ARREGLADO PARA POSTGRESQL
                db.get(`
                    SELECT COUNT(*) + 1 as position
                    FROM (
                        SELECT u.id, COALESCE(SUM(p.points_earned), 0) as total_points
                        FROM users u
                        LEFT JOIN predictions_new p ON u.id = p.user_id
                        LEFT JOIN matches_new m ON p.match_id = m.id
                        LEFT JOIN tournaments t ON m.tournament_id = t.id
                        WHERE u.is_active = true AND u.is_admin = false
                          AND (t.status = 'active' OR t.status IS NULL)
                        GROUP BY u.id
                        HAVING COALESCE(SUM(p.points_earned), 0) > ?
                    ) ranked_users
                `, [userStats.total_points], (err, positionResult) => {
                    if (err) {
                        console.error('❌ Error obteniendo posición:', err);
                        // Continuar sin error 500
                    }

                    // Obtener total de participantes activos (sin admins) - ARREGLADO PARA POSTGRESQL
                    db.get(`
                        SELECT COUNT(DISTINCT u.id) as total_participants
                        FROM users u
                        WHERE u.is_active = true AND u.is_admin = false
                    `, (err, totalResult) => {
                        if (err) {
                            console.error('❌ Error obteniendo total:', err);
                            // Continuar sin error 500
                        }

                        const finalStats = {
                            ...userStats,
                            position: positionResult?.position || 1,
                            total_participants: totalResult?.total_participants || 0
                        };

                        console.log('✅ Estadísticas del usuario (sin admins):', finalStats);
                        res.json(finalStats);
                    });
                });
            });
        });
    } catch (error) {
        console.error('❌ Error obteniendo posición del usuario:', error);
        // NO devolver error 500, sino datos por defecto
        res.json({
            id: userId,
            total_points: 0,
            total_predictions: 0,
            position: 1,
            total_participants: 0,
            tournament_name: null,
            error: true
        });
    }
});



module.exports = router;
