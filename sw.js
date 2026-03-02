// ══════════════════════════════════════════════════════════════════════
// SERVICE WORKER - Cooperenka Chat Corporativo
// Maneja Push Notifications y notificaciones en segundo plano
// ══════════════════════════════════════════════════════════════════════

const SW_VERSION = '1.0.0';

// ── Evento: Push recibido del servidor ──
self.addEventListener('push', function(event) {
    let data = { title: 'Cooperenka Chat', body: 'Nuevo mensaje', tag: 'msg' };
    
    try {
        if (event.data) {
            data = event.data.json();
        }
    } catch(e) {
        if (event.data) {
            data.body = event.data.text();
        }
    }

    const options = {
        body: data.body || 'Nuevo mensaje',
        icon: data.icon || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="20" fill="%230095d9"/><text x="50" y="68" font-size="50" text-anchor="middle" fill="white">💬</text></svg>',
        badge: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="50" fill="%230095d9"/><text x="50" y="68" font-size="50" text-anchor="middle" fill="white">C</text></svg>',
        tag: data.tag || 'cooperenka-msg',
        renotify: true,
        requireInteraction: false,
        vibrate: [200, 100, 200],
        data: {
            url: data.url || '/',
            chatType: data.chatType || 'dm',
            chatId: data.chatId || ''
        },
        actions: [
            { action: 'open', title: 'Abrir chat' },
            { action: 'dismiss', title: 'Cerrar' }
        ]
    };

    event.waitUntil(
        self.registration.showNotification(data.title || 'Cooperenka Chat', options)
    );
});

// ── Evento: Click en notificación ──
self.addEventListener('notificationclick', function(event) {
    event.notification.close();

    if (event.action === 'dismiss') return;

    const url = event.notification.data?.url || '/';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
            // Si ya hay una ventana abierta, enfocarla
            for (const client of clientList) {
                if (client.url.includes(self.location.origin) && 'focus' in client) {
                    return client.focus();
                }
            }
            // Si no, abrir una nueva
            if (clients.openWindow) {
                return clients.openWindow(url);
            }
        })
    );
});

// ── Evento: Instalación ──
self.addEventListener('install', function(event) {
    console.log(`[SW v${SW_VERSION}] Instalado`);
    self.skipWaiting();
});

// ── Evento: Activación ──
self.addEventListener('activate', function(event) {
    console.log(`[SW v${SW_VERSION}] Activado`);
    event.waitUntil(self.clients.claim());
});
