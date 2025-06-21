// public/sw.js - Service Worker para notificaciones push
const CACHE_NAME = 'quiniela-v1';
const urlsToCache = [
    '/',
    '/dashboard.html',
    '/styles.css',
    '/dashboard.js'
];

// Instalar Service Worker
self.addEventListener('install', event => {
    console.log('🔧 Service Worker instalando...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('✅ Cache abierto');
                return cache.addAll(urlsToCache);
            })
    );
});

// Activar Service Worker
self.addEventListener('activate', event => {
    console.log('✅ Service Worker activado');
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
        })
    );
});

// Escuchar mensajes push
self.addEventListener('push', event => {
    console.log('🔔 Push notification recibida:', event);
    
    if (!event.data) {
        console.warn('❌ Push notification sin datos');
        return;
    }

    const data = event.data.json();
    console.log('📄 Datos del push:', data);

    const options = {
        body: data.message,
        icon: '/favicon.ico', // Cambia por el ícono de tu app
        badge: '/favicon.ico',
        vibrate: [200, 100, 200],
        data: {
            url: data.url || '/dashboard.html',
            matchId: data.matchId,
            type: data.type
        },
        actions: [
            {
                action: 'view',
                title: '👀 Ver Dashboard',
                icon: '/favicon.ico'
            },
            {
                action: 'close',
                title: '❌ Cerrar',
                icon: '/favicon.ico'
            }
        ],
        requireInteraction: true, // Mantiene la notificación visible
        tag: data.type || 'general' // Agrupa notificaciones del mismo tipo
    };

    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

// Manejar clicks en notificaciones
self.addEventListener('notificationclick', event => {
    console.log('👆 Click en notificación:', event);
    
    const notification = event.notification;
    const action = event.action;
    
    if (action === 'close') {
        notification.close();
        return;
    }
    
    // Abrir o enfocar la aplicación
    event.waitUntil(
        clients.matchAll({ type: 'window' }).then(clientList => {
            const url = notification.data.url || '/dashboard.html';
            
            // Si ya hay una ventana abierta, enfocarla
            for (const client of clientList) {
                if (client.url.includes('dashboard') && 'focus' in client) {
                    return client.focus();
                }
            }
            
            // Si no hay ventana abierta, abrir una nueva
            if (clients.openWindow) {
                return clients.openWindow(url);
            }
        })
    );
    
    notification.close();
});

// Manejar cierre de notificaciones
self.addEventListener('notificationclose', event => {
    console.log('🔕 Notificación cerrada:', event.notification.tag);
});
