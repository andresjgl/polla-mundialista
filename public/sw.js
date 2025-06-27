// public/sw.js - Service Worker mejorado para PWA completa

const CACHE_NAME = 'quiniela-v2';
const urlsToCache = [
    '/',
    '/index.html',
    '/login.html',
    '/register.html',
    '/dashboard.html',
    '/admin.html',
    '/offline.html',
    '/styles.css',
    '/script.js',
    '/auth.js',
    '/dashboard.js',
    '/admin.js',
    '/manifest.json',
    '/favicon.ico',
    // Agregar iconos
    '/icons/icon-72x72.png',
    '/icons/icon-96x96.png',
    '/icons/icon-128x128.png',
    '/icons/icon-144x144.png',
    '/icons/icon-152x152.png',
    '/icons/icon-192x192.png',
    '/icons/icon-384x384.png',
    '/icons/icon-512x512.png'
];

// Instalar Service Worker
self.addEventListener('install', event => {
    console.log('🔧 Service Worker instalando v2...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('✅ Cache abierto');
                return cache.addAll(urlsToCache);
            })
            .then(() => self.skipWaiting())
    );
});

// Activar Service Worker
self.addEventListener('activate', event => {
    console.log('✅ Service Worker v2 activado');
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('🗑️ Eliminando cache viejo:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Estrategia de caché
self.addEventListener('fetch', event => {
    // Solo cachear peticiones GET
    if (event.request.method !== 'GET') return;

    // No cachear peticiones a la API
    if (event.request.url.includes('/api/')) {
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    return response;
                })
                .catch(() => {
                    // Si falla y es una petición importante, mostrar offline
                    if (event.request.headers.get('accept').includes('text/html')) {
                        return caches.match('/offline.html');
                    }
                    // Para APIs, devolver error JSON
                    return new Response(
                        JSON.stringify({ error: 'Sin conexión', offline: true }),
                        { 
                            headers: { 'Content-Type': 'application/json' },
                            status: 503
                        }
                    );
                })
        );
        return;
    }

    // Estrategia: Cache First para assets estáticos
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                if (response) {
                    return response;
                }

                return fetch(event.request).then(response => {
                    // No cachear respuestas no exitosas
                    if (!response || response.status !== 200 || response.type !== 'basic') {
                        return response;
                    }

                    // Clonar la respuesta
                    const responseToCache = response.clone();

                    caches.open(CACHE_NAME)
                        .then(cache => {
                            cache.put(event.request, responseToCache);
                        });

                    return response;
                });
            })
            .catch(() => {
                // Si todo falla, mostrar página offline
                if (event.request.destination === 'document') {
                    return caches.match('/offline.html');
                }
            })
    );
});

// Escuchar mensajes push (tu código existente mejorado)
self.addEventListener('push', event => {
    console.log('🔔 Push notification recibida');
    
    if (!event.data) {
        console.warn('❌ Push notification sin datos');
        return;
    }

    try {
        const data = event.data.json();
        console.log('📄 Datos del push:', data);

        const options = {
            body: data.message,
            icon: '/icons/icon-192x192.png',
            badge: '/icons/icon-72x72.png',
            vibrate: [200, 100, 200],
            data: {
                url: data.url || '/dashboard.html',
                matchId: data.matchId,
                type: data.type
            },
            actions: [
                {
                    action: 'view',
                    title: '👀 Ver',
                    icon: '/icons/icon-72x72.png'
                },
                {
                    action: 'close',
                    title: '❌ Cerrar',
                    icon: '/icons/icon-72x72.png'
                }
            ],
            requireInteraction: true,
            tag: data.type || 'general',
            renotify: true
        };

        event.waitUntil(
            self.registration.showNotification(
                data.title || '🏆 Quiniela Familiar',
                options
            )
        );
    } catch (error) {
        console.error('❌ Error procesando push:', error);
    }
});

// Manejar clicks en notificaciones (tu código existente)
self.addEventListener('notificationclick', event => {
    console.log('👆 Click en notificación:', event.action);
    
    event.notification.close();
    
    if (event.action === 'close') {
        return;
    }
    
    const urlToOpen = event.notification.data?.url || '/dashboard.html';
    
    event.waitUntil(
        clients.matchAll({ 
            type: 'window',
            includeUncontrolled: true
        }).then(clientList => {
            // Si ya hay una ventana abierta, enfocarla
            for (const client of clientList) {
                if (client.url.includes('dashboard') && 'focus' in client) {
                    return client.focus();
                }
            }
            
            // Si no hay ventana abierta, abrir una nueva
            if (clients.openWindow) {
                return clients.openWindow(urlToOpen);
            }
        })
    );
});

// Manejar cierre de notificaciones
self.addEventListener('notificationclose', event => {
    console.log('🔕 Notificación cerrada:', event.notification.tag);
});

// Sincronización en background
self.addEventListener('sync', event => {
    console.log('🔄 Background sync:', event.tag);
    
    if (event.tag === 'sync-predictions') {
        event.waitUntil(syncPendingPredictions());
    }
});

// Función para sincronizar predicciones pendientes
async function syncPendingPredictions() {
    console.log('📊 Sincronizando predicciones pendientes...');
    // Aquí puedes implementar la lógica para sincronizar datos offline
    // cuando vuelva la conexión
}
