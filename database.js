// database.js - VERSIÓN SIN REQUIRE INMEDIATO
const path = require('path');
const bcrypt = require('bcryptjs');

// NO hacer require de sqlite3 ni pg aquí arriba

// Detectar entorno
const isVercel = !!process.env.VERCEL || !!process.env.VERCEL_ENV;
const isProduction = process.env.NODE_ENV === 'production' || isVercel;
const databaseUrl = process.env.DATABASE_URL;

console.log('🔍 Entorno detectado:');
console.log('   VERCEL:', !!process.env.VERCEL);
console.log('   NODE_ENV:', process.env.NODE_ENV);
console.log('   isProduction:', isProduction);
console.log('   DATABASE_URL presente:', !!databaseUrl);

let db;

if (isProduction && databaseUrl) {
    console.log('🌍 Configurando PostgreSQL para producción...');
    
    const { Pool } = require('pg');
    
    const pool = new Pool({
        connectionString: databaseUrl,
        ssl: {
            rejectUnauthorized: false
        },
        max: 1,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
    });
    
    db = {
        run: async (query, params = [], callback) => {
            console.log('🔧 [RUN] Query original:', query);
            console.log('🔧 [RUN] Params originales:', params);
            
            try {
                let pgQuery = query;
                let pgParams = params;
                
                if (Array.isArray(params) && params.length > 0) {
                    let paramIndex = 1;
                    pgQuery = query.replace(/\?/g, () => `$${paramIndex++}`);
                    pgParams = params;
                }
                
                console.log('🔧 [RUN] Query PostgreSQL:', pgQuery);
                console.log('🔧 [RUN] Params PostgreSQL:', pgParams);
                
                const result = await pool.query(pgQuery, pgParams);
                
                console.log('✅ [RUN] Resultado exitoso:', {
                    rowCount: result?.rowCount,
                    hasRows: !!result?.rows,
                    rowsLength: result?.rows?.length
                });
                
                const response = { 
                    lastID: result?.insertId || result?.rows?.[0]?.id,
                    changes: result?.rowCount || 0 
                };
                
                if (callback) callback(null, response);
                return response;
                
            } catch (error) {
                console.error('❌ [RUN] Error completo:', {
                    message: error.message,
                    code: error.code,
                    detail: error.detail,
                    query: query,
                    params: params
                });
                if (callback) callback(error);
                throw error;
            }
        },
        
        get: async (query, params = [], callback) => {
            console.log('🔍 [GET] Query original:', query);
            console.log('🔍 [GET] Params originales:', params);
            
            try {
                let pgQuery = query;
                let pgParams = params;
                
                if (Array.isArray(params) && params.length > 0) {
                    let paramIndex = 1;
                    pgQuery = query.replace(/\?/g, () => `$${paramIndex++}`);
                    pgParams = params;
                }
                
                console.log('🔍 [GET] Query PostgreSQL:', pgQuery);
                console.log('🔍 [GET] Params PostgreSQL:', pgParams);
                
                const result = await pool.query(pgQuery, pgParams);
                
                console.log('🔍 [GET] Resultado bruto:', {
                    isUndefined: result === undefined,
                    isNull: result === null,
                    hasRows: !!result?.rows,
                    rowsLength: result?.rows?.length,
                    firstRow: result?.rows?.[0]
                });
                
                if (!result) {
                    console.error('❌ [GET] Result es undefined/null');
                    if (callback) callback(null, null);
                    return null;
                }
                
                const row = result.rows?.[0] || null;
                console.log('✅ [GET] Row final:', row);
                
                if (callback) callback(null, row);
                return row;
                
            } catch (error) {
                console.error('❌ [GET] Error completo:', {
                    message: error.message,
                    code: error.code,
                    detail: error.detail,
                    query: query,
                    params: params
                });
                if (callback) callback(error);
                return null;
            }
        },
        
        all: async (query, params = [], callback) => {
            console.log('📋 [ALL] Query original:', query);
            console.log('📋 [ALL] Params originales:', params);
            
            try {
                let pgQuery = query;
                let pgParams = params;
                
                if (Array.isArray(params) && params.length > 0) {
                    let paramIndex = 1;
                    pgQuery = query.replace(/\?/g, () => `$${paramIndex++}`);
                    pgParams = params;
                }
                
                console.log('📋 [ALL] Query PostgreSQL:', pgQuery);
                console.log('📋 [ALL] Params PostgreSQL:', pgParams);
                
                const result = await pool.query(pgQuery, pgParams);
                
                console.log('📋 [ALL] Resultado bruto:', {
                    isUndefined: result === undefined,
                    isNull: result === null,
                    hasRows: !!result?.rows,
                    rowsLength: result?.rows?.length
                });
                
                if (!result) {
                    console.error('❌ [ALL] Result es undefined/null');
                    if (callback) callback(null, []);
                    return [];
                }
                
                const rows = result.rows || [];
                console.log('✅ [ALL] Rows finales:', rows.length, 'filas');
                
                if (callback) callback(null, rows);
                return rows;
                
            } catch (error) {
                console.error('❌ [ALL] Error completo:', {
                    message: error.message,
                    code: error.code,
                    detail: error.detail,
                    query: query,
                    params: params
                });
                if (callback) callback(error);
                return [];
            }
        }
    };
    
    console.log('✅ PostgreSQL configurado exitosamente');
    
   // Test de conexión con debugging (versión corregida)
    console.log('🧪 Probando conexión...');
    pool.query('SELECT NOW() as current_time')
        .then(testResult => {
            console.log('✅ Test de conexión exitoso:', testResult?.rows?.[0]);
            console.log('🔄 Iniciando base de datos...');
            initializeDatabase();
        })
        .catch(error => {
            console.error('❌ Error en test de conexión:', error);
            // Intentar inicializar de todos modos
            initializeDatabase();
        });


    
    console.log('✅ PostgreSQL configurado exitosamente');
    initializeDatabase();
    
} else {
    // SOLO aquí hacemos require de sqlite3
    console.log('🔧 Configurando SQLite para desarrollo...');
    
    const sqlite3 = require('sqlite3').verbose();
    
    const dbPath = path.join(__dirname, 'data', 'quiniela.db');
    db = new sqlite3.Database(dbPath, (err) => {
        if (err) {
            console.error('❌ Error al conectar con SQLite:', err.message);
        } else {
            console.log('✅ Conectado a SQLite para desarrollo');
            initializeDatabase();
        }
    });
}


// ============= FUNCIÓN PRINCIPAL DE INICIALIZACIÓN CON DEBUGGING =============
function initializeDatabase() {
    console.log('🔄 Inicializando base de datos...');
    console.log('🔍 isProduction:', isProduction);

    // Función helper para ejecutar queries con debugging
    function executeQuery(queryName, query, callback) {
        console.log(`🔧 Ejecutando ${queryName}...`);
        console.log(`📝 Query: ${query.substring(0, 100)}...`);
        
        db.run(query, (err) => {
            if (err) {
                console.error(`❌ ERROR en ${queryName}:`, {
                    message: err.message,
                    code: err.code,
                    detail: err.detail
                });
            } else {
                console.log(`✅ ${queryName} exitosa`);
            }
            if (callback) callback(err);
        });
    }

    // 1. Tabla de usuarios - SIMPLIFICADA para PostgreSQL
    const createUsersQuery = isProduction ? 
        `CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            is_active BOOLEAN DEFAULT false,
            is_admin BOOLEAN DEFAULT false,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        )` :
        `CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            is_active BOOLEAN DEFAULT 0,
            is_admin BOOLEAN DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`;

    executeQuery('CREATE TABLE users', createUsersQuery, (err) => {
        if (!err) {
            console.log('👤 Procediendo a crear usuario admin...');
            createAdminUser();
        }
    });

    // 2. Tabla de equipos
    const createTeamsQuery = isProduction ?
        `CREATE TABLE IF NOT EXISTS teams (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            country TEXT,
            logo_url TEXT,
            created_at TIMESTAMP DEFAULT NOW()
        )` :
        `CREATE TABLE IF NOT EXISTS teams (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            country TEXT,
            logo_url TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`;

    executeQuery('CREATE TABLE teams', createTeamsQuery);

    // 3. Tabla de torneos
    const createTournamentsQuery = isProduction ?
        `CREATE TABLE IF NOT EXISTS tournaments (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            start_date TIMESTAMP,
            end_date TIMESTAMP,
            status TEXT DEFAULT 'upcoming',
            description TEXT DEFAULT '',
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        )` :
        `CREATE TABLE IF NOT EXISTS tournaments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            start_date DATETIME,
            end_date DATETIME,
            status TEXT DEFAULT 'upcoming',
            description TEXT DEFAULT '',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`;

    executeQuery('CREATE TABLE tournaments', createTournamentsQuery);

    // 4. Tabla de fases - SIN FOREIGN KEYS para evitar problemas
    const createPhasesQuery = isProduction ?
        `CREATE TABLE IF NOT EXISTS tournament_phases (
            id SERIAL PRIMARY KEY,
            tournament_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            points_multiplier INTEGER DEFAULT 1,
            order_index INTEGER DEFAULT 0,
            is_eliminatory BOOLEAN DEFAULT false,
            allows_draw BOOLEAN DEFAULT true,
            result_points INTEGER DEFAULT 1,
            exact_score_points INTEGER DEFAULT 3,
            description TEXT DEFAULT '',
            winner_points INTEGER DEFAULT 0,
            top_scorer_points INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        )` :
        `CREATE TABLE IF NOT EXISTS tournament_phases (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tournament_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            points_multiplier INTEGER DEFAULT 1,
            order_index INTEGER DEFAULT 0,
            is_eliminatory BOOLEAN DEFAULT 0,
            allows_draw BOOLEAN DEFAULT 1,
            result_points INTEGER DEFAULT 1,
            exact_score_points INTEGER DEFAULT 3,
            description TEXT DEFAULT '',
            winner_points INTEGER DEFAULT 0,
            top_scorer_points INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`;

    executeQuery('CREATE TABLE tournament_phases', createPhasesQuery);

    // 5. Tabla de partidos - SIMPLIFICADA
    const createMatchesNewQuery = isProduction ?
        `CREATE TABLE IF NOT EXISTS matches_new (
            id TEXT PRIMARY KEY,
            tournament_id INTEGER,
            phase_id INTEGER,
            home_team_id INTEGER,
            away_team_id INTEGER,
            home_team TEXT NOT NULL,
            away_team TEXT NOT NULL,
            match_date TIMESTAMP NOT NULL,
            home_score INTEGER,
            away_score INTEGER,
            status TEXT DEFAULT 'scheduled',
            penalty_winner TEXT,
            external_match_id TEXT,
            api_source TEXT,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        )` :
        `CREATE TABLE IF NOT EXISTS matches_new (
            id TEXT PRIMARY KEY,
            tournament_id INTEGER,
            phase_id INTEGER,
            home_team_id INTEGER,
            away_team_id INTEGER,
            home_team TEXT NOT NULL,
            away_team TEXT NOT NULL,
            match_date DATETIME NOT NULL,
            home_score INTEGER,
            away_score INTEGER,
            status TEXT DEFAULT 'scheduled',
            penalty_winner TEXT DEFAULT NULL,
            external_match_id TEXT,
            api_source TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`;

    executeQuery('CREATE TABLE matches_new', createMatchesNewQuery);

    // 6. Tabla de predicciones - SIMPLIFICADA
    const createPredictionsNewQuery = isProduction ?
        `CREATE TABLE IF NOT EXISTS predictions_new (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            match_id TEXT NOT NULL,
            predicted_winner TEXT,
            predicted_home_score INTEGER,
            predicted_away_score INTEGER,
            penalty_prediction TEXT,
            points_earned INTEGER DEFAULT 0,
            result_points INTEGER DEFAULT 0,
            score_points INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        )` :
        `CREATE TABLE IF NOT EXISTS predictions_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            match_id TEXT NOT NULL,
            predicted_winner TEXT,
            predicted_home_score INTEGER,
            predicted_away_score INTEGER,
            penalty_prediction TEXT DEFAULT NULL,
            points_earned INTEGER DEFAULT 0,
            result_points INTEGER DEFAULT 0,
            score_points INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`;

    executeQuery('CREATE TABLE predictions_new', createPredictionsNewQuery);

    // Ejecutar funciones de inicialización después
    setTimeout(() => {
        console.log('⏰ Ejecutando funciones de inicialización...');
        // Solo verificar si las tablas se crearon correctamente
        db.get('SELECT COUNT(*) as count FROM users', [], (err, result) => {
            if (err) {
                console.error('❌ Error verificando tabla users:', err.message);
            } else {
                console.log('✅ Tabla users verificada, usuarios:', result);
            }
        });
    }, 5000);
}


// ============= CREAR USUARIO ADMINISTRADOR ============= 
// (Esta función mantenerla exactamente igual - no cambies nada)
async function createAdminUser() {
    const adminEmail = 'admin@quiniela.com';
    
    db.get('SELECT * FROM users WHERE email = ?', [adminEmail], async (err, user) => {
        if (err) {
            console.error('❌ Error verificando admin:', err.message);
            return;
        }
        
        if (!user) {
            try {
                const hashedPassword = await bcrypt.hash('admin123', 10);
                
                db.run(`
                    INSERT INTO users (name, email, password, is_active, is_admin)
                    VALUES (?, ?, ?, 1, 1)
                `, ['Administrador', adminEmail, hashedPassword], function(err) {
                    if (err) {
                        console.error('❌ Error creando admin:', err.message);
                    } else {
                        console.log('👑 Usuario administrador creado');
                        console.log('📧 Email: admin@quiniela.com');
                        console.log('🔐 Password: admin123');
                    }
                });
            } catch (error) {
                console.error('❌ Error hasheando password:', error);
            }
        }
    });
}


// ============= CREAR DATOS DE PRUEBA =============
function createSampleData() {
    createSampleTeams();
    createSampleTournament();
    createSampleMatches();
}

function createSampleTeams() {
    const teams = [
        { name: 'Real Madrid', country: 'España' },
        { name: 'Manchester City', country: 'Inglaterra' },
        { name: 'Bayern Munich', country: 'Alemania' },
        { name: 'Paris Saint-Germain', country: 'Francia' },
        { name: 'Al Hilal', country: 'Arabia Saudí' },
        { name: 'Flamengo', country: 'Brasil' },
        { name: 'Al Ahly', country: 'Egipto' },
        { name: 'Seattle Sounders', country: 'Estados Unidos' }
    ];

    db.get('SELECT COUNT(*) as count FROM teams', (err, result) => {
        if (err) {
            console.error('❌ Error verificando equipos:', err);
            return;
        }

        if (result.count === 0) {
            console.log('⚽ Creando equipos de prueba...');
            
            teams.forEach(team => {
                db.run('INSERT INTO teams (name, country) VALUES (?, ?)', 
                    [team.name, team.country], 
                    function(err) {
                        if (err) {
                            console.error('❌ Error creando equipo:', err.message);
                        } else {
                            console.log(`✅ Equipo creado: ${team.name}`);
                        }
                    }
                );
            });
        }
    });
}

function createSampleTournament() {
    db.get('SELECT COUNT(*) as count FROM tournaments', (err, result) => {
        if (err) {
            console.error('❌ Error verificando torneos:', err);
            return;
        }

        if (result.count === 0) {
            console.log('🏆 Creando torneo de prueba...');
            
            db.run(`
                INSERT INTO tournaments (name, start_date, end_date, status, description)
                VALUES (?, ?, ?, ?, ?)
            `, [
                'Mundial de Clubes 2025', 
                '2025-06-15', 
                '2025-07-13', 
                'upcoming',
                'Torneo mundial de clubes con los mejores equipos del mundo'
            ], function(err) {
                if (err) {
                    console.error('❌ Error creando torneo:', err.message);
                } else {
                    console.log('✅ Torneo creado: Mundial de Clubes 2025');
                    createTournamentPhases(this.lastID);
                }
            });
        }
    });
}

function createTournamentPhases(tournamentId) {
    const phases = [
        { 
            name: 'Fase de Grupos', 
            multiplier: 1, 
            order: 1,
            is_eliminatory: 0,
            result_points: 1,
            exact_score_points: 3,
            description: 'Fase inicial donde los equipos compiten en grupos. Se permiten empates.'
        },
        { 
            name: 'Octavos de Final', 
            multiplier: 4, 
            order: 2,
            is_eliminatory: 1,
            result_points: 4,
            exact_score_points: 8,
            description: 'Primera fase eliminatoria. No se permiten empates.'
        },
        { 
            name: 'Cuartos de Final', 
            multiplier: 6, 
            order: 3,
            is_eliminatory: 1,
            result_points: 6,
            exact_score_points: 12,
            description: 'Segunda fase eliminatoria.'
        },
        { 
            name: 'Semifinal', 
            multiplier: 8, 
            order: 4,
            is_eliminatory: 1,
            result_points: 8,
            exact_score_points: 16,
            description: 'Penúltima fase del torneo.'
        },
        { 
            name: 'Tercer Puesto', 
            multiplier: 7, 
            order: 5,
            is_eliminatory: 1,
            result_points: 7,
            exact_score_points: 14,
            description: 'Partido por el tercer lugar.'
        },
        { 
            name: 'Final', 
            multiplier: 10, 
            order: 6,
            is_eliminatory: 1,
            result_points: 10,
            exact_score_points: 20,
            winner_points: 15,
            description: 'Partido final del torneo. Puntos extra por acertar al campeón.'
        }
    ];

    phases.forEach(phase => {
        db.run(`
            INSERT INTO tournament_phases 
            (tournament_id, name, points_multiplier, order_index, is_eliminatory, 
             allows_draw, result_points, exact_score_points, winner_points, description)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            tournamentId, 
            phase.name, 
            phase.multiplier, 
            phase.order,
            phase.is_eliminatory,
            phase.is_eliminatory ? 0 : 1,
            phase.result_points,
            phase.exact_score_points,
            phase.winner_points || 0,
            phase.description
        ], function(err) {
            if (err) {
                console.error('❌ Error creando fase:', err.message);
            } else {
                console.log(`✅ Fase creada: ${phase.name} (${phase.multiplier}x puntos)`);
            }
        });
    });
}

function createSampleMatches() {
    const sampleMatches = [
        {
            id: 'wc2026_001',
            home_team: 'Real Madrid',
            away_team: 'Manchester City',
            match_date: '2026-06-15 20:00:00',
            status: 'scheduled'
        },
        {
            id: 'wc2026_002', 
            home_team: 'Bayern Munich',
            away_team: 'Paris Saint-Germain',
            match_date: '2026-06-16 16:00:00',
            status: 'scheduled'
        },
        {
            id: 'wc2026_003',
            home_team: 'Al Hilal',
            away_team: 'Flamengo',
            match_date: '2026-06-17 20:00:00',
            status: 'scheduled'
        },
        {
            id: 'wc2026_004',
            home_team: 'Al Ahly',
            away_team: 'Seattle Sounders',
            match_date: '2026-06-18 18:00:00',
            status: 'scheduled'
        }
    ];

    // Verificar si ya existen partidos en matches_new
    db.get('SELECT COUNT(*) as count FROM matches_new', (err, result) => {
        if (err) {
            console.error('❌ Error verificando partidos:', err);
            return;
        }

        if (result.count === 0) {
            console.log('📅 Creando partidos de prueba...');
            
            sampleMatches.forEach(match => {
                db.run(`
                    INSERT INTO matches_new (id, home_team, away_team, match_date, status, tournament_id, phase_id)
                    VALUES (?, ?, ?, ?, ?, 1, 1)
                `, [match.id, match.home_team, match.away_team, match.match_date, match.status], 
                function(err) {
                    if (err) {
                        console.error('❌ Error creando partido:', err.message);
                    } else {
                        console.log(`✅ Partido creado: ${match.home_team} vs ${match.away_team}`);
                    }
                });
            });
        } else {
            console.log(`📅 Ya existen ${result.count} partidos en la base de datos`);
        }
    });
}

// ============= MIGRACIÓN DE DATOS EXISTENTES =============
function migrateExistingData() {
    // Migrar partidos de la tabla legacy a la nueva
    db.all('SELECT * FROM matches', (err, oldMatches) => {
        if (err || !oldMatches || oldMatches.length === 0) {
            return;
        }

        console.log('🔄 Migrando partidos existentes...');
        
        oldMatches.forEach(match => {
            db.run(`
                INSERT OR IGNORE INTO matches_new 
                (id, home_team, away_team, match_date, home_score, away_score, status, tournament_id, phase_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1)
            `, [match.id, match.home_team, match.away_team, match.match_date, 
                match.home_score, match.away_score, match.status], function(err) {
                if (err) {
                    console.error('❌ Error migrando partido:', err.message);
                } else if (this.changes > 0) {
                    console.log(`✅ Partido migrado: ${match.home_team} vs ${match.away_team}`);
                }
            });
        });
    });
}

// ============= OPERACIONES DE USUARIO =============
const userOperations = {
    createUser: (userData) => {
        return new Promise(async (resolve, reject) => {
            try {
                const hashedPassword = await bcrypt.hash(userData.password, 10);
                
                db.run(`
                    INSERT INTO users (name, email, password)
                    VALUES (?, ?, ?)
                `, [userData.name, userData.email, hashedPassword], function(err) {
                    if (err) {
                        if (err.message.includes('UNIQUE constraint failed')) {
                            reject(new Error('El email ya está registrado'));
                        } else {
                            reject(err);
                        }
                    } else {
                        resolve({
                            id: this.lastID,
                            name: userData.name,
                            email: userData.email,
                            is_active: false
                        });
                    }
                });
            } catch (error) {
                reject(error);
            }
        });
    },

    findByEmail: (email) => {
        return new Promise((resolve, reject) => {
            db.get('SELECT * FROM users WHERE email = ?', [email], (err, user) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(user);
                }
            });
        });
    },

    findById: (id) => {
        return new Promise((resolve, reject) => {
            db.get('SELECT * FROM users WHERE id = ?', [id], (err, user) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(user);
                }
            });
        });
    },

    activateUser: (userId) => {
        return new Promise((resolve, reject) => {
            db.run('UPDATE users SET is_active = 1 WHERE id = ?', [userId], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.changes > 0);
                }
            });
        });
    },

    getStats: () => {
        return new Promise((resolve, reject) => {
            db.all(`
                SELECT 
                    COUNT(*) as total_users,
                    SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active_users,
                    SUM(CASE WHEN is_admin = 1 THEN 1 ELSE 0 END) as admin_users
                FROM users
            `, (err, result) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(result[0]);
                }
            });
        });
    },

    verifyPassword: async (plainPassword, hashedPassword) => {
        return await bcrypt.compare(plainPassword, hashedPassword);
    }
};

// ============= CALCULADORA DE PUNTOS =============
// ============= CALCULADORA DE PUNTOS CON DEBUGGING =============
const pointsCalculator = {
    calculatePredictionPoints: async (prediction, actualResult, phaseId) => {
    return new Promise((resolve, reject) => {
        db.get(`
            SELECT * FROM tournament_phases WHERE id = ?
        `, [phaseId], (err, phase) => {
            if (err) {
                console.error('Error obteniendo fase:', err);
                return reject(err);
            }

            if (!phase) {
                console.log('FASE NO ENCONTRADA, usando valores por defecto para phaseId:', phaseId);
                return resolve(pointsCalculator.calculateDefaultPoints(prediction, actualResult));
            }

            let resultPoints = 0;
            let scorePoints = 0;
            let bonusPoints = 0;

            // Determinar ganador actual
            const actualWinner = pointsCalculator.determineWinner(
                actualResult.home_score, 
                actualResult.away_score
            );

            // DEBUGGING SIMPLE
            console.log('CALCULANDO PUNTOS:');
            console.log('Prediccion:', prediction.predicted_winner, prediction.predicted_home_score + '-' + prediction.predicted_away_score);
            console.log('Resultado:', actualWinner, actualResult.home_score + '-' + actualResult.away_score);
            console.log('Fase:', phase.name, 'Result_points:', phase.result_points);

            // Calcular puntos por resultado
            if (prediction.predicted_winner === actualWinner) {
                resultPoints = phase.result_points || 1;
                console.log('RESULTADO CORRECTO: +' + resultPoints + ' puntos');
            } else {
                console.log('Resultado incorrecto');
            }

            // Calcular puntos por marcador exacto
            if (prediction.predicted_home_score === actualResult.home_score && 
                prediction.predicted_away_score === actualResult.away_score) {
                scorePoints = phase.exact_score_points || 3;
                console.log('MARCADOR EXACTO: +' + scorePoints + ' puntos');
            }

            // Bonus para finales
            if (phase.name.toLowerCase().includes('final') && 
                phase.winner_points > 0 && 
                prediction.predicted_winner === actualWinner) {
                bonusPoints = phase.winner_points;
                console.log('BONUS FINAL: +' + bonusPoints + ' puntos');
            }

            const totalPoints = resultPoints + scorePoints + bonusPoints;
            console.log('TOTAL:', totalPoints, 'puntos');

            resolve({
                resultPoints,
                scorePoints,
                bonusPoints,
                totalPoints: totalPoints,
                phase_config: {
                    name: phase.name,
                    is_eliminatory: phase.is_eliminatory,
                    allows_draw: phase.allows_draw
                }
            });
        });
    });
},


    calculateDefaultPoints: (prediction, actualResult) => {
        console.log('🔧 Usando calculateDefaultPoints (sin fase)');
        let resultPoints = 0;
        let scorePoints = 0;

        const actualWinner = pointsCalculator.determineWinner(
            actualResult.home_score, 
            actualResult.away_score
        );

        console.log('🎯 PUNTOS POR DEFECTO:');
        console.log(`   Predicho: "${prediction.predicted_winner}", Real: "${actualWinner}"`);

        if (prediction.predicted_winner === actualWinner) {
            resultPoints = 1;
            console.log(`✅ Resultado correcto: +${resultPoints} puntos`);
        }

        if (prediction.predicted_home_score === actualResult.home_score && 
            prediction.predicted_away_score === actualResult.away_score) {
            scorePoints = 3;
            console.log(`✅ Marcador exacto: +${scorePoints} puntos`);
        }

        const total = resultPoints + scorePoints;
        console.log(`🎯 Total por defecto: ${total} puntos`);

        return {
            resultPoints,
            scorePoints,
            bonusPoints: 0,
            totalPoints: total
        };
    },

    determineWinner: (homeScore, awayScore) => {
    const home = parseInt(homeScore);
    const away = parseInt(awayScore);
    
    console.log('Determinando ganador:', home, 'vs', away);
    
    if (home > away) {
        console.log('Ganador: home');
        return 'home';
    }
    if (away > home) {
        console.log('Ganador: away');
        return 'away';
    }
    console.log('Resultado: draw');
    return 'draw';
},


    updateMatchPredictions: (matchId, homeScore, awayScore) => {
    return new Promise((resolve, reject) => {
        console.log('Iniciando actualizacion de predicciones para partido:', matchId);
        
        db.get(`
            SELECT m.*, tp.* 
            FROM matches_new m
            LEFT JOIN tournament_phases tp ON m.phase_id = tp.id
            WHERE m.id = ?
        `, [matchId], (err, match) => {
            if (err) {
                console.error('Error obteniendo match:', err);
                return reject(err);
            }

            if (!match) {
                console.error('Partido no encontrado:', matchId);
                return reject(new Error('Partido no encontrado'));
            }

            console.log('Partido encontrado:', match.home_team, 'vs', match.away_team, 'Fase:', match.name);

            if (match.is_eliminatory && homeScore === awayScore) {
                return reject(new Error(
                    'Esta es una fase eliminatoria (' + match.name + '). No se permiten empates.'
                ));
            }

            const actualResult = { home_score: homeScore, away_score: awayScore };

            db.all(`
                SELECT * FROM predictions_new WHERE match_id = ?
            `, [matchId], async (err, predictions) => {
                if (err) {
                    console.error('Error obteniendo predicciones:', err);
                    return reject(err);
                }

                console.log('Predicciones encontradas:', predictions.length);

                let updatedCount = 0;

                if (predictions.length === 0) {
                    return resolve({ 
                        updated: 0, 
                        message: 'No hay predicciones para este partido'
                    });
                }

                for (const prediction of predictions) {
                    try {
                        console.log('Procesando usuario:', prediction.user_id);
                        
                        const points = await pointsCalculator.calculatePredictionPoints(
                            prediction, 
                            actualResult, 
                            match.phase_id
                        );

                        await new Promise((resolveUpdate, rejectUpdate) => {
                            db.run(`
                                UPDATE predictions_new 
                                SET result_points = ?, score_points = ?, points_earned = ?, updated_at = datetime('now')
                                WHERE id = ?
                            `, [points.resultPoints, points.scorePoints, points.totalPoints, prediction.id], 
                            function(updateErr) {
                                if (updateErr) {
                                    console.error('Error actualizando prediccion:', updateErr);
                                    rejectUpdate(updateErr);
                                } else {
                                    console.log('Usuario', prediction.user_id, 'actualizado con', points.totalPoints, 'puntos');
                                    resolveUpdate();
                                }
                            });
                        });

                        updatedCount++;
                    } catch (error) {
                        console.error('Error procesando prediccion:', error);
                    }
                }

                console.log('Actualizacion completa:', updatedCount, 'predicciones');

                resolve({ 
                    updated: updatedCount, 
                    message: 'Puntos actualizados para ' + updatedCount + ' predicciones'
                });
            });
        });
    });
}

};


// ============= CERRAR BASE DE DATOS =============
process.on('SIGINT', () => {
    if (db && db.close) {
        db.close((err) => {
            if (err) {
                console.error('❌ Error cerrando base de datos:', err.message);
            } else {
                console.log('✅ Base de datos cerrada');
            }
            process.exit(0);
        });
    } else {
        process.exit(0);
    }
});

// ============= EXPORTAR MÓDULOS =============
module.exports = {
    db,
    userOperations,
    pointsCalculator
};
