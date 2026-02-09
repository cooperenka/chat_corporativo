// Chat Client con Autenticación - Versión Corregida
let authToken = localStorage.getItem('chatAuthToken') || null;
let currentUsername = null;
let currentDisplayName = null;
let activeUsers = [];
let selectedUser = null;
let messages = [];
let attachedFile = null;

// Nuevo: Estado de mensajes no leídos
let unreadMessages = JSON.parse(localStorage.getItem('unreadMessages') || '{}');
let archivedChats = JSON.parse(localStorage.getItem('archivedChats') || '[]');
let lastSeenMessages = JSON.parse(localStorage.getItem('lastSeenMessages') || '{}');

// Estados de la aplicación
const AppState = {
    LOGIN: 'login',
    REGISTER: 'register',
    CHAT: 'chat'
};
let currentState = AppState.LOGIN;

// Variables para controlar los intervalos
let presenceInterval = null;
let usersInterval = null;
let messagesInterval = null;

// Variable para evitar múltiples verificaciones simultáneas
let isVerifying = false;

// Sonido de notificación - Audio WAV funcional
const notificationSound = new Audio('data:audio/wav;base64,UklGRigBAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQDAAAAAAEAAQACAAIADP////3///z////8////+////Pn//vr+//7////+/////v////3////+/////v////7////+/////v////7////+/////v////7////9/////f////3////9/////f////3////9/////f////3////9/////f////3////9/////f////3////9/////f////3////9/////v////7////+/////v////7////+/////v////7////+/////v////7////+/////v////7////+/////v////7////+/////v////7////+/////v////7////+/////v////7////+/////v///////P////z////8////+////vr+//78///+////////////////////////////////////////////////////////////////////');

// Variable para controlar las notificaciones
let lastMessageCount = 0;

// Lista de emoticones populares
const emojis = [
    '😀', '😃', '😄', '😁', '😅', '😂', '🤣', '😊', '😇', '🙂',
    '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋',
    '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🤩', '🥳',
    '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '😣', '😖', '😫',
    '😩', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬', '🤯', '😳',
    '🥵', '🥶', '😱', '😨', '😰', '😥', '😓', '🤗', '🤔', '🤭',
    '🤫', '🤥', '😶', '😐', '😑', '😬', '🙄', '😯', '😦', '😧',
    '😮', '😲', '🥱', '😴', '🤤', '😪', '😵', '🤐', '🥴', '🤢',
    '🤮', '🤧', '😷', '🤒', '🤕', '🤑', '🤠', '😈', '👿', '👹',
    '👺', '🤡', '💩', '👻', '💀', '👽', '👾', '🤖', '🎃', '😺',
    '😸', '😹', '😻', '😼', '😽', '🙀', '😿', '😾',
    '👋', '🤚', '🖐', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞',
    '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '👍',
    '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝',
    '🙏', '✍️', '💅', '🤳', '💪', '🦾', '🦿', '🦵', '🦶', '👂',
    '🦻', '👃', '🧠', '🫀', '🫁', '🦷', '🦴', '👀', '👁', '👅',
    '👄', '💋', '🩸',
    '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔',
    '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟',
    '⭐', '🌟', '✨', '💫', '🔥', '💥', '💯', '✔️', '✅', '❌',
    '🎉', '🎊', '🎈', '🎁', '🏆', '🥇', '🥈', '🥉', '⚽', '🏀',
    '🏈', '⚾', '🥎', '🎾', '🏐', '🏉', '🥏', '🎱', '🪀', '🏓',
    '🏸', '🏒', '🏑', '🥍', '🏏', '🥅', '⛳', '🪁', '🏹', '🎣'
];

function playNotificationSound() {
    try {
        // Crear una copia del audio para permitir múltiples reproducciones simultáneas
        const sound = notificationSound.cloneNode();
        sound.volume = 0.5;
        sound.play().catch(e => console.log('Error reproduciendo sonido:', e));
    } catch(e) {
        console.log('Error en playNotificationSound:', e);
    }
}

function showNotification(title, body, username = null) {
    console.log('Intentando mostrar notificación:', title, body);
    
    // Verificar si las notificaciones están disponibles
    if (!('Notification' in window)) {
        console.log('Este navegador no soporta notificaciones');
        return;
    }
    
    if (Notification.permission === 'granted') {
        try {
            const notification = new Notification(title, {
                body: body,
                icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y="75" font-size="75">💬</text></svg>',
                tag: username || 'chat-message',
                requireInteraction: false,
                silent: false
            });
            
            notification.onclick = function() {
                window.focus();
                notification.close();
            };
            
            setTimeout(() => notification.close(), 5000);
            console.log('Notificación mostrada exitosamente');
        } catch(e) {
            console.error('Error al crear notificación:', e);
        }
    } else if (Notification.permission === 'denied') {
        console.log('Las notificaciones están bloqueadas');
    } else {
        console.log('Solicitando permiso de notificaciones...');
        Notification.requestPermission().then(permission => {
            console.log('Permiso de notificaciones:', permission);
        });
    }
}

// Función para marcar mensajes como leídos
function markMessagesAsRead(username) {
    if (username) {
        // Limpiar contador de no leídos
        if (unreadMessages[username]) {
            delete unreadMessages[username];
            localStorage.setItem('unreadMessages', JSON.stringify(unreadMessages));
        }
        
        // Guardar el timestamp del último mensaje visto
        if (messages.length > 0) {
            const lastMessage = messages[messages.length - 1];
            lastSeenMessages[username] = lastMessage.timestamp;
            localStorage.setItem('lastSeenMessages', JSON.stringify(lastSeenMessages));
        }
        
        updateUnreadBadges();
    }
}

// Función para actualizar los badges de mensajes no leídos
function updateUnreadBadges() {
    const userItems = document.querySelectorAll('[data-username]');
    userItems.forEach(item => {
        const username = item.getAttribute('data-username');
        const badge = item.querySelector('.unread-badge');
        const count = unreadMessages[username] || 0;
        
        if (badge) {
            if (count > 0) {
                badge.textContent = count > 99 ? '99+' : count;
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        }
    });
}

// Función para archivar/desarchivar conversación
function toggleArchiveChat(username) {
    const index = archivedChats.indexOf(username);
    if (index > -1) {
        archivedChats.splice(index, 1);
        showSuccess('Conversación desarchivada');
    } else {
        archivedChats.push(username);
        showSuccess('Conversación archivada');
    }
    localStorage.setItem('archivedChats', JSON.stringify(archivedChats));
    
    // Si estamos viendo el chat archivado, salir
    if (selectedUser && selectedUser.username === username) {
        closeCurrentChat();
    }
    
    renderUsersList();
}

// Función para cerrar el chat actual
function closeCurrentChat() {
    selectedUser = null;
    render();
}

// Función para mostrar/ocultar el selector de emojis
function toggleEmojiPicker() {
    const picker = document.getElementById('emojiPicker');
    if (picker) {
        picker.classList.toggle('hidden');
    }
}

// Función para insertar emoji en el input
function insertEmoji(emoji) {
    const input = document.getElementById('msgInput');
    if (input) {
        const start = input.selectionStart;
        const end = input.selectionEnd;
        const text = input.value;
        const before = text.substring(0, start);
        const after = text.substring(end, text.length);
        input.value = before + emoji + after;
        input.selectionStart = input.selectionEnd = start + emoji.length;
        input.focus();
    }
    // Cerrar el picker después de insertar
    toggleEmojiPicker();
}

// Función para mostrar/ocultar menú del chat
function toggleChatMenu(event) {
    event.stopPropagation();
    const menu = document.getElementById('chatMenu');
    if (menu) {
        menu.classList.toggle('hidden');
    }
}

// Función auxiliar para escapar HTML (prevenir XSS)
function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

// Función auxiliar para mostrar mensajes de error
function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'fixed top-4 right-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded shadow-lg z-50 max-w-md fade-in';
    errorDiv.innerHTML = `
        <div class="flex items-center gap-2">
            <span class="text-2xl">❌</span>
            <span>${escapeHtml(message)}</span>
        </div>
    `;
    document.body.appendChild(errorDiv);
    setTimeout(() => errorDiv.remove(), 5000);
}

// Función auxiliar para mostrar mensajes de éxito
function showSuccess(message) {
    const successDiv = document.createElement('div');
    successDiv.className = 'fixed top-4 right-4 bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded shadow-lg z-50 max-w-md fade-in';
    successDiv.innerHTML = `
        <div class="flex items-center gap-2">
            <span class="text-2xl">✅</span>
            <span>${escapeHtml(message)}</span>
        </div>
    `;
    document.body.appendChild(successDiv);
    setTimeout(() => successDiv.remove(), 3000);
}

// Función para limpiar intervalos
function clearAllIntervals() {
    if (presenceInterval) {
        clearInterval(presenceInterval);
        presenceInterval = null;
    }
    if (usersInterval) {
        clearInterval(usersInterval);
        usersInterval = null;
    }
    if (messagesInterval) {
        clearInterval(messagesInterval);
        messagesInterval = null;
    }
}

// ============================================
// AUTENTICACIÓN
// ============================================

async function verifyToken() {
    if (isVerifying || !authToken) {
        return false;
    }
    
    isVerifying = true;
    
    try {
        const response = await fetch('/api/verify', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.success) {
                currentUsername = data.username;
                currentDisplayName = data.displayName;
                console.log('✅ Token válido:', currentUsername);
                isVerifying = false;
                return true;
            }
        }
        
        // Token inválido o expirado
        console.log('❌ Token inválido o expirado');
        authToken = null;
        localStorage.removeItem('chatAuthToken');
        isVerifying = false;
        return false;
        
    } catch (error) {
        console.error('Error verificando token:', error);
        isVerifying = false;
        return false;
    }
}

async function register() {
    const username = document.getElementById('regUsername').value.trim();
    const displayName = document.getElementById('regDisplayName').value.trim();
    const password = document.getElementById('regPassword').value;
    const confirmPassword = document.getElementById('regConfirmPassword').value;
    
    // Validaciones en cliente
    if (!username || !password) {
        showError('Usuario y contraseña son requeridos');
        return;
    }
    
    if (username.length < 3) {
        showError('El usuario debe tener al menos 3 caracteres');
        return;
    }
    
    if (password.length < 4) {
        showError('La contraseña debe tener al menos 4 caracteres');
        return;
    }
    
    if (password !== confirmPassword) {
        showError('Las contraseñas no coinciden');
        return;
    }
    
    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username,
                password,
                displayName: displayName || username
            })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            showSuccess('¡Cuenta creada exitosamente! Ahora puedes iniciar sesión');
            setTimeout(() => {
                currentState = AppState.LOGIN;
                render();
            }, 1500);
        } else {
            showError(data.error || 'Error al crear la cuenta');
        }
    } catch (error) {
        console.error('Error en registro:', error);
        showError('Error de conexión con el servidor');
    }
}

async function login() {
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;
    
    if (!username || !password) {
        showError('Usuario y contraseña son requeridos');
        return;
    }
    
    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            authToken = data.token;
            currentUsername = data.username;
            currentDisplayName = data.displayName;
            
            localStorage.setItem('chatAuthToken', authToken);
            
            showSuccess(`¡Bienvenido ${currentDisplayName}!`);
            
            currentState = AppState.CHAT;
            render();
            
            // Iniciar sesión de chat
            startChatSession();
        } else {
            showError(data.error || 'Error al iniciar sesión');
        }
    } catch (error) {
        console.error('Error en login:', error);
        showError('Error de conexión con el servidor');
    }
}

async function logout() {
    try {
        // Limpiar intervalos primero
        clearAllIntervals();
        
        if (authToken) {
            await fetch('/api/logout', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${authToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ token: authToken })
            });
        }
        
        authToken = null;
        currentUsername = null;
        currentDisplayName = null;
        selectedUser = null;
        activeUsers = [];
        messages = [];
        
        localStorage.removeItem('chatAuthToken');
        
        currentState = AppState.LOGIN;
        render();
        
        showSuccess('Sesión cerrada exitosamente');
    } catch (error) {
        console.error('Error en logout:', error);
        // Aun con error, forzar cierre de sesión local
        authToken = null;
        localStorage.removeItem('chatAuthToken');
        currentState = AppState.LOGIN;
        render();
    }
}

// ============================================
// FUNCIONES DE CHAT
// ============================================

function startChatSession() {
    // Solicitar permiso para notificaciones
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
    
    // Cargar usuarios y comenzar polling
    loadUsers();
    updatePresence();
    
    // Limpiar intervalos anteriores si existen
    clearAllIntervals();
    
    // Configurar intervalos
    presenceInterval = setInterval(updatePresence, 3000);
    usersInterval = setInterval(loadUsers, 5000);
    messagesInterval = setInterval(() => {
        if (selectedUser) loadMessages();
    }, 3000);
}

async function updatePresence() {
    if (!authToken) return;
    
    try {
        await fetch('/api/presence', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ token: authToken })
        });
    } catch (error) {
        console.error('Error actualizando presencia:', error);
        // Si hay error de autenticación, intentar reconectar
        if (error.message.includes('401')) {
            console.log('Token expirado, redirigiendo al login...');
            logout();
        }
    }
}

async function loadUsers() {
    if (!authToken) return;
    
    try {
        const response = await fetch('/api/users', {
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            if (response.status === 401) {
                console.log('Token inválido, cerrando sesión...');
                logout();
                return;
            }
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        activeUsers = data.users.filter(u => u.username !== currentUsername);
        
        // Verificar mensajes no leídos para cada usuario
        await checkUnreadMessagesForAllUsers();
        
        renderUsersList();
        
    } catch (error) {
        console.error('Error cargando usuarios:', error);
    }
}

// Nueva función: Verificar mensajes no leídos de todos los usuarios
async function checkUnreadMessagesForAllUsers() {
    if (!authToken) return;
    
    for (const user of activeUsers) {
        // Solo verificar si NO es el usuario seleccionado actualmente
        if (selectedUser && selectedUser.username === user.username) {
            continue;
        }
        
        try {
            const response = await fetch(`/api/messages/${user.username}`, {
                headers: {
                    'Authorization': `Bearer ${authToken}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                const userMessages = data.messages || [];
                
                // Obtener el último mensaje visto de este usuario
                const lastSeen = lastSeenMessages[user.username] || 0;
                
                // Contar mensajes nuevos de este usuario (que no sean míos)
                const newMessages = userMessages.filter(msg => 
                    msg.timestamp > lastSeen && msg.username !== currentUsername
                );
                
                if (newMessages.length > 0) {
                    unreadMessages[user.username] = newMessages.length;
                    
                    // Reproducir sonido solo para el primer mensaje no leído
                    if (!lastSeenMessages[user.username] || lastSeenMessages[user.username] === 0) {
                        playNotificationSound();
                    }
                } else {
                    // Si no hay mensajes nuevos, limpiar el contador
                    if (unreadMessages[user.username]) {
                        delete unreadMessages[user.username];
                    }
                }
                
                localStorage.setItem('unreadMessages', JSON.stringify(unreadMessages));
            }
        } catch (error) {
            console.error(`Error verificando mensajes de ${user.username}:`, error);
        }
    }
}

function renderUsersList() {
    const container = document.getElementById('usersListContainer');
    const counter = document.getElementById('usersCounter');
    
    if (!container || !counter) return;
    
    // Filtrar usuarios archivados
    const visibleUsers = activeUsers.filter(u => !archivedChats.includes(u.username));
    
    counter.innerHTML = `💬 ${visibleUsers.length} usuario${visibleUsers.length !== 1 ? 's' : ''} disponible${visibleUsers.length !== 1 ? 's' : ''}`;
    
    if (visibleUsers.length === 0) {
        container.innerHTML = `
            <div class="p-8 text-center text-gray-500">
                <div class="text-5xl mb-4">👤</div>
                <p class="text-sm">No hay usuarios disponibles</p>
                <p class="text-xs mt-2">Espera a que alguien se conecte</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = visibleUsers.map(user => {
        const unreadCount = unreadMessages[user.username] || 0;
        const isSelected = selectedUser && selectedUser.username === user.username;
        
        return `
            <button 
                class="w-full p-4 hover:bg-gray-50 transition-colors text-left border-b border-gray-100 ${isSelected ? 'bg-blue-50' : ''} ${unreadCount > 0 ? 'bg-blue-50/30' : ''}" 
                data-username="${user.username}"
                onclick="selectUser('${user.username}', '${escapeHtml(user.displayName)}')"
            >
                <div class="flex items-center gap-3">
                    <div class="relative">
                        <div class="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center text-white font-semibold shadow-md ${unreadCount > 0 ? 'ring-2 ring-red-400 ring-offset-2' : ''}">
                            ${user.displayName.charAt(0).toUpperCase()}
                        </div>
                        <div class="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white"></div>
                        ${unreadCount > 0 ? `
                            <div class="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center border-2 border-white animate-pulse">
                                <span class="text-white text-xs font-bold">${unreadCount > 9 ? '9+' : unreadCount}</span>
                            </div>
                        ` : ''}
                    </div>
                    <div class="flex-1">
                        <div class="font-semibold ${unreadCount > 0 ? 'text-gray-900' : 'text-gray-800'}">${escapeHtml(user.displayName)}</div>
                        <div class="text-xs ${unreadCount > 0 ? 'text-blue-600 font-semibold' : 'text-gray-500'}">
                            ${unreadCount > 0 ? `💬 ${unreadCount} mensaje${unreadCount > 1 ? 's' : ''} nuevo${unreadCount > 1 ? 's' : ''}` : `@${user.username}`}
                        </div>
                    </div>
                </div>
            </button>
        `;
    }).join('');
}

function selectUser(username, displayName) {
    selectedUser = { username, displayName };
    
    // Marcar como leídos
    markMessagesAsRead(username);
    
    // Cargar mensajes
    loadMessages();
    render();
}

async function loadMessages() {
    if (!authToken || !selectedUser) return;
    
    try {
        const response = await fetch(`/api/messages/${selectedUser.username}`, {
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            if (response.status === 401) {
                console.log('Token inválido, cerrando sesión...');
                logout();
                return;
            }
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        const newMessages = data.messages || [];
        const oldCount = messages.length;
        
        messages = newMessages;
        
        // Detectar mensajes nuevos y reproducir sonido/notificación
        if (newMessages.length > oldCount) {
            const newOnes = newMessages.slice(oldCount);
            const newFromOthers = newOnes.filter(m => m.username !== currentUsername);
            
            if (newFromOthers.length > 0) {
                // Reproducir sonido y notificación para CADA mensaje nuevo
                newFromOthers.forEach((msg, index) => {
                    setTimeout(() => {
                        playNotificationSound();
                        
                        // Mostrar notificación solo si no estamos viendo la ventana
                        if (!document.hasFocus()) {
                            const msgPreview = msg.text ? 
                                (msg.text.length > 50 ? msg.text.substring(0, 50) + '...' : msg.text) :
                                (msg.file ? `📎 ${msg.file.name}` : 'Nuevo mensaje');
                            showNotification(
                                `${msg.displayName} te envió un mensaje`,
                                msgPreview,
                                msg.username
                            );
                        }
                    }, index * 300); // 300ms entre notificaciones
                });
            }
        }
        
        renderMessages();
        
        // Marcar mensajes como leídos después de cargarlos
        markMessagesAsRead(selectedUser.username);
        
    } catch (error) {
        console.error('Error cargando mensajes:', error);
    }
}

function renderMessages() {
    const container = document.getElementById('messagesContainer');
    if (!container) return;
    
    if (messages.length === 0) {
        container.innerHTML = `
            <div class="flex items-center justify-center h-full">
                <div class="text-center text-gray-400">
                    <div class="text-6xl mb-4">💭</div>
                    <p>No hay mensajes aún</p>
                    <p class="text-sm mt-2">Envía el primer mensaje</p>
                </div>
            </div>
        `;
        return;
    }
    
    container.innerHTML = messages.map(msg => {
        const isMine = msg.username === currentUsername;
        const time = new Date(msg.timestamp).toLocaleTimeString('es-ES', { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
        
        if (msg.file) {
            const isImage = msg.file.type && msg.file.type.startsWith('image/');
            
            return `
                <div class="mb-4 flex ${isMine ? 'justify-end' : 'justify-start'}">
                    <div class="max-w-xs lg:max-w-md">
                        <div class="text-xs text-gray-500 mb-1 ${isMine ? 'text-right' : 'text-left'}">
                            ${escapeHtml(msg.displayName)} · ${time}
                        </div>
                        <div class="rounded-2xl p-3 shadow-md ${
                            isMine 
                                ? 'bg-gradient-to-br from-blue-500 to-indigo-600 text-white' 
                                : 'bg-white text-gray-800 border border-gray-200'
                        }">
                            ${msg.text ? `<p class="mb-2">${escapeHtml(msg.text)}</p>` : ''}
                            ${isImage ? `
                                <img src="${msg.file.data}" alt="${escapeHtml(msg.file.name)}" class="rounded-lg max-w-full">
                            ` : `
                                <div class="flex items-center gap-2 p-2 bg-gray-100 rounded">
                                    <span class="text-2xl">📎</span>
                                    <span class="text-sm">${escapeHtml(msg.file.name)}</span>
                                </div>
                            `}
                        </div>
                    </div>
                </div>
            `;
        }
        
        return `
            <div class="mb-4 flex ${isMine ? 'justify-end' : 'justify-start'}">
                <div class="max-w-xs lg:max-w-md">
                    <div class="text-xs text-gray-500 mb-1 ${isMine ? 'text-right' : 'text-left'}">
                        ${escapeHtml(msg.displayName)} · ${time}
                    </div>
                    <div class="rounded-2xl px-4 py-2 shadow-md ${
                        isMine 
                            ? 'bg-gradient-to-br from-blue-500 to-indigo-600 text-white' 
                            : 'bg-white text-gray-800 border border-gray-200'
                    }">
                        <p class="whitespace-pre-wrap break-words">${escapeHtml(msg.text)}</p>
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    // Scroll al final
    container.scrollTop = container.scrollHeight;
}

async function sendMessage() {
    const input = document.getElementById('msgInput');
    if (!input) return;
    
    const text = input.value.trim();
    
    if (!text && !attachedFile) {
        return;
    }
    
    if (!authToken || !selectedUser) {
        showError('No se puede enviar el mensaje');
        return;
    }
    
    const messageData = {
        to: selectedUser.username,
        text: text,
        file: attachedFile
    };
    
    try {
        const response = await fetch('/api/send', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(messageData)
        });
        
        if (!response.ok) {
            if (response.status === 401) {
                console.log('Token inválido, cerrando sesión...');
                logout();
                return;
            }
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            input.value = '';
            attachedFile = null;
            document.getElementById('filePreviewContainer').innerHTML = '';
            loadMessages();
        } else {
            showError(data.error || 'Error al enviar mensaje');
        }
        
    } catch (error) {
        console.error('Error enviando mensaje:', error);
        showError('Error de conexión al enviar mensaje');
    }
}

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    if (file.size > 5 * 1024 * 1024) {
        showError('El archivo es muy grande (máximo 5MB)');
        event.target.value = '';
        return;
    }
    
    const reader = new FileReader();
    reader.onload = function(e) {
        attachedFile = {
            name: file.name,
            type: file.type,
            data: e.target.result
        };
        
        showFilePreview();
    };
    reader.readAsDataURL(file);
}

function showFilePreview() {
    const container = document.getElementById('filePreviewContainer');
    if (!container || !attachedFile) return;
    
    const isImage = attachedFile.type.startsWith('image/');
    
    container.innerHTML = `
        <div class="mb-2 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-3">
            ${isImage ? `
                <img src="${attachedFile.data}" class="w-16 h-16 object-cover rounded">
            ` : `
                <div class="w-16 h-16 bg-gray-200 rounded flex items-center justify-center text-3xl">
                    📎
                </div>
            `}
            <div class="flex-1">
                <div class="font-medium text-sm text-gray-800">${escapeHtml(attachedFile.name)}</div>
                <div class="text-xs text-gray-500">${(attachedFile.data.length / 1024).toFixed(1)} KB</div>
            </div>
            <button onclick="removeAttachment()" class="text-red-500 hover:text-red-700 text-xl">
                ✕
            </button>
        </div>
    `;
}

function removeAttachment() {
    attachedFile = null;
    document.getElementById('filePreviewContainer').innerHTML = '';
    document.getElementById('fileInput').value = '';
}

async function deleteConversation() {
    if (!selectedUser) return;
    
    if (!confirm(`¿Estás seguro de eliminar toda la conversación con ${selectedUser.displayName}?`)) {
        return;
    }
    
    try {
        const response = await fetch(`/api/delete/${selectedUser.username}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ token: authToken })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            messages = [];
            showSuccess('Conversación eliminada');
            closeCurrentChat();
        } else {
            showError(data.error || 'Error al eliminar conversación');
        }
        
    } catch (error) {
        console.error('Error eliminando conversación:', error);
        showError('Error de conexión al eliminar conversación');
    }
}

// ============================================
// RENDERIZADO DE PANTALLAS
// ============================================

function renderLogin() {
    return `
        <div class="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center p-4">
            <div class="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
                <div class="text-center mb-8">
                    <div class="text-6xl mb-4">💬</div>
                    <h1 class="text-3xl font-bold text-gray-800 mb-2">Chat Corporativo</h1>
                    <p class="text-gray-600">Inicia sesión para continuar</p>
                </div>
                
                <div class="space-y-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2">Usuario</label>
                        <input 
                            id="loginUsername" 
                            type="text" 
                            class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition" 
                            placeholder="Ingresa tu usuario"
                            autocomplete="username"
                            onkeypress="if(event.key==='Enter') login()"
                        >
                    </div>
                    
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2">Contraseña</label>
                        <input 
                            id="loginPassword" 
                            type="password" 
                            class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition" 
                            placeholder="Ingresa tu contraseña"
                            autocomplete="current-password"
                            onkeypress="if(event.key==='Enter') login()"
                        >
                    </div>
                    
                    <button 
                        onclick="login()" 
                        class="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-3 rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all font-semibold shadow-lg hover:shadow-xl"
                    >
                        Iniciar Sesión
                    </button>
                    
                    <div class="text-center pt-4 border-t border-gray-200">
                        <p class="text-sm text-gray-600">
                            ¿No tienes cuenta? 
                            <button onclick="currentState = 'register'; render();" class="text-blue-600 hover:text-blue-700 font-semibold">
                                Regístrate aquí
                            </button>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function renderRegister() {
    return `
        <div class="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50 flex items-center justify-center p-4">
            <div class="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
                <div class="text-center mb-8">
                    <div class="text-6xl mb-4">✨</div>
                    <h1 class="text-3xl font-bold text-gray-800 mb-2">Crear Cuenta</h1>
                    <p class="text-gray-600">Únete a nuestro chat</p>
                </div>
                
                <div class="space-y-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2">Usuario *</label>
                        <input 
                            id="regUsername" 
                            type="text" 
                            class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 transition" 
                            placeholder="Elige un usuario único"
                            autocomplete="username"
                        >
                        <p class="text-xs text-gray-500 mt-1">Mínimo 3 caracteres</p>
                    </div>
                    
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2">Nombre para mostrar</label>
                        <input 
                            id="regDisplayName" 
                            type="text" 
                            class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 transition" 
                            placeholder="Tu nombre completo (opcional)"
                            autocomplete="name"
                        >
                    </div>
                    
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2">Contraseña *</label>
                        <input 
                            id="regPassword" 
                            type="password" 
                            class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 transition" 
                            placeholder="Mínimo 4 caracteres"
                            autocomplete="new-password"
                        >
                    </div>
                    
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2">Confirmar contraseña *</label>
                        <input 
                            id="regConfirmPassword" 
                            type="password" 
                            class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 transition" 
                            placeholder="Repite la contraseña"
                            autocomplete="new-password"
                            onkeypress="if(event.key==='Enter') register()"
                        >
                    </div>
                    
                    <button 
                        onclick="register()" 
                        class="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white py-3 rounded-lg hover:from-purple-700 hover:to-pink-700 transition-all font-semibold shadow-lg hover:shadow-xl"
                    >
                        Crear Cuenta
                    </button>
                    
                    <div class="text-center pt-4 border-t border-gray-200">
                        <p class="text-sm text-gray-600">
                            ¿Ya tienes cuenta? 
                            <button onclick="currentState = 'login'; render();" class="text-purple-600 hover:text-purple-700 font-semibold">
                                Inicia sesión aquí
                            </button>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function renderChat() {
    const root = document.getElementById('root');
    const totalUnread = Object.values(unreadMessages).reduce((sum, count) => sum + count, 0);
    
    root.innerHTML = `
        <div class="h-screen flex overflow-hidden bg-gray-100">
            <!-- Sidebar -->
            <div class="w-80 bg-white border-r border-gray-200 flex flex-col">
                <!-- Header -->
                <div class="p-4 border-b border-gray-200 bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
                    <div class="flex items-center justify-between mb-3">
                        <div class="flex-1">
                            <div class="flex items-center gap-2">
                                <h1 class="text-lg font-semibold text-white">Chats Privados</h1>
                                ${totalUnread > 0 ? `
                                    <div class="bg-red-500 text-white text-xs font-bold rounded-full px-2 py-1 animate-pulse">
                                        ${totalUnread}
                                    </div>
                                ` : ''}
                            </div>
                            <div class="flex items-center gap-2">
                                <div class="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                                <span class="text-sm text-white/90">${escapeHtml(currentDisplayName)}</span>
                            </div>
                        </div>
                        <button onclick="logout()" class="p-2 text-white hover:bg-white/20 rounded-lg transition-colors text-xl" title="Cerrar sesión">
                            🚪
                        </button>
                    </div>
                    <div class="flex items-center justify-between gap-2">
                        <div id="usersCounter" class="text-xs text-white/80 bg-white/20 p-2 rounded flex-1">
                            💬 0 usuarios disponibles
                        </div>
                        <button onclick="loadUsers()" class="p-2 bg-white/20 hover:bg-white/30 rounded transition-colors">
                            🔄
                        </button>
                    </div>
                </div>
                
                <!-- Lista de usuarios -->
                <div id="usersListContainer" class="flex-1 overflow-y-auto scrollbar-thin"></div>
            </div>
            
            <!-- Chat Area -->
            <div class="flex-1 flex flex-col">
                ${selectedUser ? `
                    <!-- Header del chat -->
                    <div class="bg-white shadow-sm border-b border-gray-200 p-4">
                        <div class="flex items-center gap-3">
                            <button onclick="closeCurrentChat()" class="p-2 hover:bg-gray-100 rounded-lg transition-colors text-xl" title="Cerrar chat">
                                ←
                            </button>
                            <div class="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-semibold shadow-lg">
                                ${selectedUser.displayName.charAt(0).toUpperCase()}
                            </div>
                            <div class="flex-1">
                                <h2 class="font-semibold text-gray-800">${escapeHtml(selectedUser.displayName)}</h2>
                                <div class="flex items-center gap-2">
                                    <div class="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                                    <span class="text-xs text-gray-500">En línea</span>
                                </div>
                            </div>
                            <div class="relative">
                                <button id="chatMenuButton" onclick="toggleChatMenu(event)" class="p-2 hover:bg-gray-100 rounded-lg transition-colors text-xl">
                                    ⋮
                                </button>
                                <div id="chatMenu" class="hidden absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-xl border border-gray-200 z-10">
                                    <button onclick="toggleArchiveChat('${selectedUser.username}'); event.stopPropagation();" class="w-full text-left px-4 py-3 hover:bg-gray-50 text-gray-700 transition-colors flex items-center gap-2 border-b border-gray-100">
                                        ${archivedChats.includes(selectedUser.username) ? '📂 Desarchivar' : '📦 Archivar'} conversación
                                    </button>
                                    <button onclick="deleteConversation(); event.stopPropagation();" class="w-full text-left px-4 py-3 hover:bg-red-50 text-red-600 rounded-b-lg transition-colors flex items-center gap-2">
                                        🗑️ Eliminar conversación
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Mensajes -->
                    <div id="messagesContainer" class="flex-1 overflow-y-auto p-4 bg-gray-50 scrollbar-thin"></div>
                    
                    <!-- Input de mensaje -->
                    <div class="bg-white border-t border-gray-200 p-4">
                        <div class="max-w-3xl mx-auto">
                            <div id="filePreviewContainer"></div>
                            
                            <!-- Selector de emojis -->
                            <div id="emojiPicker" class="hidden mb-2 p-3 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                                <div class="grid grid-cols-8 gap-2">
                                    ${emojis.map(emoji => `
                                        <button onclick="insertEmoji('${emoji}')" class="text-2xl hover:bg-gray-100 rounded p-1 transition">
                                            ${emoji}
                                        </button>
                                    `).join('')}
                                </div>
                            </div>
                            
                            <div class="flex gap-2">
                                <input type="file" id="fileInput" class="hidden" onchange="handleFileSelect(event)">
                                <label for="fileInput" class="flex items-center justify-center w-10 h-10 bg-gray-100 hover:bg-gray-200 rounded-lg cursor-pointer transition" title="Adjuntar archivo">
                                    📎
                                </label>
                                <button onclick="toggleEmojiPicker()" class="flex items-center justify-center w-10 h-10 bg-gray-100 hover:bg-gray-200 rounded-lg transition" title="Emojis">
                                    😀
                                </button>
                                <input 
                                    id="msgInput" 
                                    type="text" 
                                    placeholder="Escribe un mensaje..." 
                                    class="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition" 
                                    autocomplete="off" 
                                    onkeypress="if(event.key==='Enter' && !event.shiftKey) { event.preventDefault(); sendMessage(); }"
                                >
                                <button onclick="sendMessage()" class="flex items-center justify-center w-10 h-10 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all shadow-lg hover:shadow-xl">
                                    ➤
                                </button>
                            </div>
                        </div>
                    </div>
                ` : `
                    <!-- Placeholder cuando no hay chat seleccionado -->
                    <div class="flex-1 flex items-center justify-center bg-gray-50">
                        <div class="text-center">
                            <div class="text-7xl mb-4">💬</div>
                            <h3 class="text-xl font-semibold text-gray-700 mb-2">Selecciona un usuario</h3>
                            <p class="text-gray-500">Elige una persona de la lista para chatear</p>
                            ${activeUsers.length > 0 ? `
                                <p class="text-sm text-gray-400 mt-4">
                                    ${Object.keys(unreadMessages).length > 0 ? '🔴 Tienes mensajes sin leer' : ''}
                                </p>
                            ` : ''}
                        </div>
                    </div>
                `}
            </div>
        </div>
    `;
    
    renderUsersList();
    if (selectedUser) renderMessages();
}

function render() {
    const root = document.getElementById('root');
    
    if (currentState === AppState.LOGIN) {
        root.innerHTML = renderLogin();
    } else if (currentState === AppState.REGISTER) {
        root.innerHTML = renderRegister();
    } else if (currentState === AppState.CHAT) {
        renderChat();
    }
}

// Cerrar menú al hacer clic fuera
document.addEventListener('click', (e) => {
    const menu = document.getElementById('chatMenu');
    const button = document.getElementById('chatMenuButton');
    const emojiPicker = document.getElementById('emojiPicker');
    
    if (menu && !menu.contains(e.target) && !button?.contains(e.target)) {
        menu.classList.add('hidden');
    }
    
    // Cerrar selector de emojis si se hace clic fuera
    if (emojiPicker && !emojiPicker.contains(e.target)) {
        const emojiButton = e.target.closest('button[onclick="toggleEmojiPicker()"]');
        if (!emojiButton) {
            emojiPicker.classList.add('hidden');
        }
    }
});

// Limpiar intervalos cuando se cierra o recarga la página
window.addEventListener('beforeunload', () => {
    clearAllIntervals();
});

// Inicialización
async function init() {
    if (authToken) {
        const isValid = await verifyToken();
        if (isValid) {
            currentState = AppState.CHAT;
            render();
            startChatSession();
        } else {
            authToken = null;
            localStorage.removeItem('chatAuthToken');
            currentState = AppState.LOGIN;
            render();
        }
    } else {
        currentState = AppState.LOGIN;
        render();
    }
}

init();
