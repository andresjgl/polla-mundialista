// server.js - Servidor principal de la Quiniela Mundial
const express = require('express');
const path = require('path');
const cors = require('cors');

// Importar base de datos y rutas
require('./database'); // Inicializar base de datos
const { router: authRoutes } = require('./routes/auth');

// Importar rutas de partidos
const matchRoutes = require('./routes/matches');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;

const predictionsRoutes = require('./routes/predictions');
const leaderboardRoutes = require('./routes/leaderboard');

const notificationsRoutes = require('./routes/notifications');

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));


// Rutas de la API
app.use('/api/auth', authRoutes);
app.use('/api/matches', matchRoutes);
app.use('/api/predictions', predictionsRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/notifications', notificationsRoutes);

// Ruta principal - servir la página de inicio
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Ruta de prueba para verificar que el servidor funciona
app.get('/api/test', (req, res) => {
    res.json({ 
        message: '¡Servidor funcionando correctamente!', 
        timestamp: new Date().toISOString() 
    });
});

// Ruta para obtener información básica de la quiniela
app.get('/api/info', async (req, res) => {
    try {
        const { userOperations } = require('./database');
        const stats = await userOperations.getStats();
        
        res.json({
            nombre: 'Quiniela Mundial 2026',
            version: '1.0.0',
            estado: 'En desarrollo',
            participantes: stats.active_users || 0,
            total_registrados: stats.total_users || 0
        });
    } catch (error) {
        res.json({
            nombre: 'Quiniela Mundial 2026',
            version: '1.0.0',
            estado: 'En desarrollo',
            participantes: 0
        });
    }
});

// Ruta pública para estadísticas de la página de inicio
app.get('/api/public/stats', async (req, res) => {
    try {
        console.log('📊 Cargando estadísticas públicas...');
        
        const { db } = require('./database');
        
        // Obtener estadísticas en paralelo
        const statsPromises = [
            // Contar usuarios activos (no admins)
            new Promise((resolve) => {
                db.get('SELECT COUNT(*) as count FROM users WHERE is_active = ? AND is_admin = ?', 
                    [true, false], 
                    (err, result) => {
                        if (err) {
                            console.error('❌ Error contando usuarios:', err);
                            resolve(0);
                        } else {
                            resolve(result.count || 0);
                        }
                    }
                );
            }),
            
            // Obtener torneo activo y contar sus partidos
            new Promise((resolve) => {
                db.get('SELECT id FROM tournaments WHERE status = ?', ['active'], (err, tournament) => {
                    if (err || !tournament) {
                        console.log('⚠️ No hay torneo activo');
                        resolve(0);
                    } else {
                        // Contar partidos del torneo activo
                        db.get('SELECT COUNT(*) as count FROM matches_new WHERE tournament_id = ?', 
                            [tournament.id], 
                            (err2, matchResult) => {
                                if (err2) {
                                    console.error('❌ Error contando partidos:', err2);
                                    resolve(0);
                                } else {
                                    resolve(matchResult.count || 0);
                                }
                            }
                        );
                    }
                });
            })
        ];
        
        const [activeUsers, totalMatches] = await Promise.all(statsPromises);
        
        console.log(`✅ Estadísticas: ${activeUsers} usuarios activos, ${totalMatches} partidos`);
        
        res.json({
            success: true,
            data: {
                active_participants: activeUsers,
                total_matches: totalMatches,
                last_updated: new Date().toISOString()
            }
        });
        
    } catch (error) {
        console.error('❌ Error obteniendo estadísticas públicas:', error);
        res.json({
            success: false,
            data: {
                active_participants: 0,
                total_matches: 0,
                last_updated: new Date().toISOString()
            }
        });
    }
});


// Iniciar el servidor
app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
    console.log(`📁 Archivos estáticos desde: ${path.join(__dirname, 'public')}`);
    console.log(`🔧 Modo: Desarrollo`);
});

// Manejo de errores básico
process.on('uncaughtException', (err) => {
    console.error('❌ Error no capturado:', err);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Promesa rechazada no manejada:', reason);
    process.exit(1);
});