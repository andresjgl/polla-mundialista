// routes/auth.js - Rutas de autenticación
const express = require('express');
const jwt = require('jsonwebtoken');
const { userOperations } = require('../database');

const router = express.Router();

// Clave secreta para JWT (en producción usar variable de entorno)
const JWT_SECRET = 'tu-clave-super-secreta-cambiala-en-produccion';

// Middleware para verificar token
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Token de acceso requerido' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Token inválido' });
        }
        req.user = user;
        next();
    });
};

// Middleware para verificar admin
const requireAdmin = async (req, res, next) => {
    try {
        const user = await userOperations.findById(req.user.id);
        if (!user || !user.is_admin) {
            return res.status(403).json({ error: 'Permisos de administrador requeridos' });
        }
        next();
    } catch (error) {
        res.status(500).json({ error: 'Error verificando permisos' });
    }
};

// POST /api/auth/register - Registro de usuarios
router.post('/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;

        // Validaciones básicas
        if (!name || !email || !password) {
            return res.status(400).json({ 
                error: 'Todos los campos son requeridos' 
            });
        }

        if (password.length < 6) {
            return res.status(400).json({ 
                error: 'La contraseña debe tener al menos 6 caracteres' 
            });
        }

        // Validar formato de email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ 
                error: 'Formato de email inválido' 
            });
        }

        // Crear usuario
        const newUser = await userOperations.createUser({
            name: name.trim(),
            email: email.toLowerCase().trim(),
            password
        });

        res.status(201).json({
            message: 'Usuario registrado exitosamente',
            user: {
                id: newUser.id,
                name: newUser.name,
                email: newUser.email,
                is_active: newUser.is_active
            },
            note: 'Tu cuenta debe ser activada por un administrador'
        });

    } catch (error) {
        console.error('Error en registro:', error);
        
        if (error.message.includes('ya está registrado')) {
            res.status(409).json({ error: error.message });
        } else {
            res.status(500).json({ error: 'Error interno del servidor' });
        }
    }
});

// POST /api/auth/login - Iniciar sesión
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Validaciones básicas
        if (!email || !password) {
            return res.status(400).json({ 
                error: 'Email y contraseña son requeridos' 
            });
        }

        // Buscar usuario
        const user = await userOperations.findByEmail(email.toLowerCase().trim());
        if (!user) {
            return res.status(401).json({ 
                error: 'Credenciales inválidas' 
            });
        }

        // Verificar contraseña
        const isValidPassword = await userOperations.verifyPassword(password, user.password);
        if (!isValidPassword) {
            return res.status(401).json({ 
                error: 'Credenciales inválidas' 
            });
        }

        // Verificar si el usuario está activo
        if (!user.is_active) {
            return res.status(403).json({ 
                error: 'Tu cuenta no ha sido activada. Contacta al administrador.' 
            });
        }

        // Generar token JWT
        const token = jwt.sign(
            { 
                id: user.id, 
                email: user.email, 
                name: user.name,
                is_admin: user.is_admin 
            },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            message: 'Inicio de sesión exitoso',
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                is_admin: user.is_admin,
                is_active: user.is_active
            }
        });

    } catch (error) {
        console.error('Error en login:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// GET /api/auth/profile - Obtener perfil del usuario
router.get('/profile', authenticateToken, async (req, res) => {
    try {
        const user = await userOperations.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        res.json({
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                is_admin: user.is_admin,
                is_active: user.is_active,
                created_at: user.created_at
            }
        });

    } catch (error) {
        console.error('Error obteniendo perfil:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// POST /api/auth/activate/:userId - Activar usuario (VERSIÓN CORREGIDA)
router.post('/activate/:userId', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { userId } = req.params;
        
        console.log(`🔓 Admin activando usuario ID: ${userId}`);
        
        if (!userId) {
            return res.status(400).json({ error: 'ID de usuario requerido' });
        }

        const { db } = require('../database');

        // Verificar que el usuario existe y obtener su información
        db.get('SELECT id, name, email, is_active FROM users WHERE id = ?', [userId], (err, user) => {
            if (err) {
                console.error('❌ Error verificando usuario:', err);
                return res.status(500).json({ error: 'Error interno del servidor' });
            }

            if (!user) {
                console.log('⚠️ Usuario no encontrado:', userId);
                return res.status(404).json({ error: 'Usuario no encontrado' });
            }

            if (user.is_active) {
                console.log('⚠️ Usuario ya está activo:', user.name);
                return res.status(400).json({ error: 'El usuario ya está activo' });
            }

            // Activar usuario
            db.run(`
                UPDATE users 
                SET is_active = ?, updated_at = NOW()
                WHERE id = ?
            `, [true, userId], function(err) {
                if (err) {
                    console.error('❌ Error activando usuario:', err);
                    return res.status(500).json({ error: 'Error activando usuario: ' + err.message });
                }

                if (this.changes === 0) {
                    return res.status(404).json({ error: 'Usuario no encontrado' });
                }

                console.log(`✅ Usuario activado exitosamente: ${user.name} (${user.email})`);

                res.json({
                    message: 'Usuario activado exitosamente',
                    user: {
                        id: parseInt(userId),
                        name: user.name,
                        email: user.email,
                        is_active: true
                    }
                });
            });
        });

    } catch (error) {
        console.error('❌ Error en activación de usuario:', error);
        res.status(500).json({ error: 'Error interno del servidor: ' + error.message });
    }
});


// GET /api/auth/stats - Estadísticas de usuarios
// GET /api/auth/stats - Estadísticas del dashboard
// GET /api/auth/stats - Estadísticas excluyendo admins
router.get('/stats', authenticateToken, requireAdmin, async (req, res) => {
    console.log('🔍 GET /stats solicitado');
    
    try {
        const { db } = require('../database');
        
        // Contar usuarios totales (NO admins)
        db.get('SELECT COUNT(*) as total FROM users WHERE is_admin = ?', [false], (err, totalResult) => {
            if (err) {
                console.error('❌ Error contando usuarios totales:', err);
                return res.json({ total_users: 0, active_users: 0, pending_users: 0 });
            }
            
            // Contar usuarios activos (NO admins)
            db.get('SELECT COUNT(*) as active FROM users WHERE is_active = ? AND is_admin = ?', [true, false], (err2, activeResult) => {
                if (err2) {
                    console.error('❌ Error contando usuarios activos:', err2);
                    return res.json({ 
                        total_users: totalResult.total || 0, 
                        active_users: 0,
                        pending_users: 0 
                    });
                }
                
                // Contar usuarios pendientes (NO admins)
                db.get('SELECT COUNT(*) as pending FROM users WHERE is_active = ? AND is_admin = ?', [false, false], (err3, pendingResult) => {
                    if (err3) {
                        console.error('❌ Error contando usuarios pendientes:', err3);
                        return res.json({ 
                            total_users: totalResult.total || 0, 
                            active_users: activeResult.active || 0,
                            pending_users: 0 
                        });
                    }
                    
                    const stats = {
                        total_users: totalResult.total || 0,
                        active_users: activeResult.active || 0,
                        pending_users: pendingResult.pending || 0
                    };
                    
                    console.log('✅ Estadísticas (sin admins):', stats);
                    res.json(stats);
                });
            });
        });
    } catch (error) {
        console.error('❌ Error en route stats:', error);
        res.json({ total_users: 0, active_users: 0, pending_users: 0 });
    }
});



// GET /api/auth/verify - Verificar token
router.get('/verify', authenticateToken, (req, res) => {
    res.json({ 
        valid: true, 
        user: req.user 
    });
});



// GET /api/auth/pending-users - Obtener usuarios pendientes
// GET /api/auth/pending-users - Solo usuarios NO admin
router.get('/pending-users', authenticateToken, requireAdmin, async (req, res) => {
    console.log('🔍 GET /pending-users solicitado');
    
    try {
        const { db } = require('../database');
        
        // Solo usuarios pendientes que NO sean admin
        db.all('SELECT id, name, email, created_at FROM users WHERE is_active = ? AND is_admin = ? ORDER BY created_at DESC', [false, false], (err, users) => {
            if (err) {
                console.error('❌ Error obteniendo usuarios pendientes:', err);
                return res.json([]);
            }
            
            console.log(`✅ Usuarios pendientes (sin admins): ${users ? users.length : 0}`);
            res.json(users || []);
        });
    } catch (error) {
        console.error('❌ Error en route pending-users:', error);
        res.json([]);
    }
});





// GET /api/user/stats - Estadísticas del usuario
router.get('/user/stats', authenticateToken, async (req, res) => {
    try {
        const { db } = require('../database');
        
        // Obtener puntos del usuario
        db.get(
            'SELECT COALESCE(SUM(points), 0) as total_points FROM predictions WHERE user_id = ?',
            [req.user.id],
            (err, pointsResult) => {
                if (err) {
                    console.error('Error obteniendo puntos:', err);
                    return res.status(500).json({ error: 'Error interno del servidor' });
                }

                // Obtener total de participantes activos
                db.get(
                    'SELECT COUNT(*) as total_participants FROM users WHERE is_active = 1',
                    (err, participantsResult) => {
                        if (err) {
                            console.error('Error obteniendo participantes:', err);
                            return res.status(500).json({ error: 'Error interno del servidor' });
                        }

                        // TODO: Calcular posición real del usuario
                        // Por ahora enviamos datos básicos
                        res.json({
                            points: pointsResult.total_points || 0,
                            position: 1, // Placeholder
                            total_participants: participantsResult.total_participants || 0
                        });
                    }
                );
            }
        );
    } catch (error) {
        console.error('Error obteniendo estadísticas del usuario:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// GET /api/user/predictions - Predicciones del usuario
router.get('/user/predictions', authenticateToken, async (req, res) => {
    try {
        const { db } = require('../database');
        
        db.all(
            `SELECT p.*, m.home_team, m.away_team, m.match_date 
             FROM predictions p 
             JOIN matches m ON p.match_id = m.id 
             WHERE p.user_id = ? 
             ORDER BY m.match_date DESC`,
            [req.user.id],
            (err, predictions) => {
                if (err) {
                    console.error('Error obteniendo predicciones:', err);
                    return res.status(500).json({ error: 'Error interno del servidor' });
                }
                res.json(predictions || []);
            }
        );
    } catch (error) {
        console.error('Error obteniendo predicciones del usuario:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

module.exports = {
    router,
    authenticateToken,
    requireAdmin
};