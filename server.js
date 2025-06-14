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