// Chat Client con Autenticación - Versión Corregida
let authToken = localStorage.getItem('chatAuthToken') || null;
let currentUsername = null;
let currentDisplayName = null;
let isAdmin = false;
let activeUsers = [];
let contacts = [];      // Todos los usuarios registrados (con estado online/offline)
let groups = [];        // Grupos del usuario actual
let sidebarTab = 'contacts'; // 'online' | 'contacts' | 'groups'
let selectedUser = null;
let selectedGroup = null; // { id, name, members, memberCount }
let messages = [];
let groupMessages = [];
let attachedFile = null;

// Estados de la aplicación
const AppState = {
    LOGIN: 'login',
    REGISTER: 'register',
    CHAT: 'chat',
    ADMIN: 'admin'
};
let currentState = AppState.LOGIN;

// Nuevo: Estado de mensajes no leídos
let unreadMessages = JSON.parse(localStorage.getItem('unreadMessages') || '{}');
let unreadGroupMessages = JSON.parse(localStorage.getItem('unreadGroupMessages') || '{}');
let archivedChats = JSON.parse(localStorage.getItem('archivedChats') || '[]');
let lastSeenMessages = JSON.parse(localStorage.getItem('lastSeenMessages') || '{}');
let lastSeenGroupMessages = JSON.parse(localStorage.getItem('lastSeenGroupMessages') || '{}');

// Último mensaje por contacto/grupo: { timestamp, text, senderName }
let lastContactMessage = JSON.parse(localStorage.getItem('lastContactMessage') || '{}');

// Variables para controlar los intervalos
let presenceInterval = null;
let usersInterval = null;
let messagesInterval = null;
let groupMessagesInterval = null;

// Variable para evitar múltiples verificaciones simultáneas
let isVerifying = false;

// ============================================
// SISTEMA DE NOTIFICACIONES INTERNO
// ============================================

// Almacena los timestamps ya notificados para no repetir alertas
let notifiedTimestamps = new Set(JSON.parse(localStorage.getItem('notifiedTimestamps') || '[]'));

// --- SONIDO ---
let _audioCtx = null;
function getAudioContext() {
    if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return _audioCtx;
}

function playNotificationSound() {
    try {
        const ctx = getAudioContext();
        if (ctx.state === 'suspended') ctx.resume();
        const now = ctx.currentTime;
        const osc1 = ctx.createOscillator(), gain1 = ctx.createGain();
        osc1.connect(gain1); gain1.connect(ctx.destination);
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(880, now);
        osc1.frequency.exponentialRampToValueAtTime(660, now + 0.15);
        gain1.gain.setValueAtTime(0, now);
        gain1.gain.linearRampToValueAtTime(0.35, now + 0.01);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc1.start(now); osc1.stop(now + 0.35);

        const osc2 = ctx.createOscillator(), gain2 = ctx.createGain();
        osc2.connect(gain2); gain2.connect(ctx.destination);
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(1100, now + 0.12);
        osc2.frequency.exponentialRampToValueAtTime(880, now + 0.30);
        gain2.gain.setValueAtTime(0, now + 0.12);
        gain2.gain.linearRampToValueAtTime(0.3, now + 0.14);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.50);
        osc2.start(now + 0.12); osc2.stop(now + 0.50);
    } catch(e) { /* silencioso si el usuario no ha interactuado aún */ }
}

function playGroupNotificationSound() {
    try {
        const ctx = getAudioContext();
        if (ctx.state === 'suspended') ctx.resume();
        const now = ctx.currentTime;

        // Tres tonos descendentes tipo "bong bong bong" - más graves y cálidos
        const notes = [
            { freq: 520, time: 0 },
            { freq: 440, time: 0.18 },
            { freq: 370, time: 0.36 }
        ];

        notes.forEach(({ freq, time }) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination);
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, now + time);
            gain.gain.setValueAtTime(0, now + time);
            gain.gain.linearRampToValueAtTime(0.4, now + time + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.001, now + time + 0.35);
            osc.start(now + time);
            osc.stop(now + time + 0.4);
        });
    } catch(e) { /* silencioso */ }
}

// --- TÍTULO DE PESTAÑA ---
let _originalTitle = document.title;
let _titleInterval = null;
function updateTabTitle() {
    const total = getTotalUnread();
    if (total > 0) {
        document.title = `(${total}) ${_originalTitle}`;
        if (!_titleInterval) {
            _titleInterval = setInterval(() => {
                document.title = document.title.startsWith('(')
                    ? _originalTitle
                    : `(${getTotalUnread()}) ${_originalTitle}`;
            }, 1200);
        }
    } else {
        document.title = _originalTitle;
        if (_titleInterval) { clearInterval(_titleInterval); _titleInterval = null; }
    }
}

function getTotalUnread() {
    const dm = Object.values(unreadMessages).reduce((s, c) => s + c, 0);
    const gm = Object.values(unreadGroupMessages).reduce((s, c) => s + c, 0);
    return dm + gm;
}

// --- TOASTS INTERNOS ---
// Cola de toasts para apilar sin solaparse
const _toastQueue = [];
let _toastActive = 0;
const MAX_TOASTS = 4;

function showInternalToast({ senderName, senderInitial, text, color = '#6366f1', onClick = null, isGroup = false }) {
    if (_toastActive >= MAX_TOASTS) return; // no saturar pantalla

    const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const container = _ensureToastContainer();

    const toast = document.createElement('div');
    toast.id = id;
    toast.style.cssText = `
        display: flex; align-items: flex-start; gap: 12px;
        background: white; border-radius: 14px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.10);
        padding: 14px 16px; margin-bottom: 10px;
        max-width: 340px; width: 100%;
        border-left: 4px solid ${color};
        cursor: ${onClick ? 'pointer' : 'default'};
        transform: translateX(110%);
        transition: transform 0.35s cubic-bezier(0.34,1.56,0.64,1), opacity 0.3s ease;
        opacity: 0; position: relative; overflow: hidden;
    `;

    // Barra de progreso
    const progress = document.createElement('div');
    progress.style.cssText = `
        position: absolute; bottom: 0; left: 0; height: 3px;
        background: ${color}; width: 100%;
        transition: width 4.5s linear;
        border-radius: 0 0 14px 14px;
    `;

    // Avatar
    const avatar = document.createElement('div');
    avatar.style.cssText = `
        width: 40px; height: 40px; border-radius: ${isGroup ? '10px' : '50%'};
        background: ${color}; color: white;
        display: flex; align-items: center; justify-content: center;
        font-weight: 700; font-size: 16px; flex-shrink: 0;
    `;
    avatar.textContent = senderInitial;

    // Contenido
    const body = document.createElement('div');
    body.style.cssText = 'flex: 1; min-width: 0;';

    const title = document.createElement('div');
    title.style.cssText = 'font-weight: 700; font-size: 13px; color: #1f2937; margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;';
    title.textContent = senderName;

    const preview = document.createElement('div');
    preview.style.cssText = 'font-size: 12px; color: #6b7280; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 230px;';
    preview.textContent = text || '📎 Archivo adjunto';

    // Botón cerrar
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.style.cssText = `
        background: none; border: none; cursor: pointer;
        font-size: 18px; color: #9ca3af; line-height: 1;
        padding: 0 0 0 4px; flex-shrink: 0; align-self: flex-start;
        margin-top: -2px;
    `;
    closeBtn.onclick = (e) => { e.stopPropagation(); _dismissToast(toast, id); };

    body.appendChild(title);
    body.appendChild(preview);
    toast.appendChild(avatar);
    toast.appendChild(body);
    toast.appendChild(closeBtn);
    toast.appendChild(progress);
    container.appendChild(toast);
    _toastActive++;

    if (onClick) {
        toast.addEventListener('click', (e) => {
            if (e.target === closeBtn) return;
            onClick();
            _dismissToast(toast, id);
        });
    }

    // Animar entrada
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            toast.style.transform = 'translateX(0)';
            toast.style.opacity = '1';
            // Iniciar barra de progreso
            setTimeout(() => { progress.style.width = '0%'; }, 50);
        });
    });

    // Auto-dismiss
    const timer = setTimeout(() => _dismissToast(toast, id), 5000);
    toast._timer = timer;
}

function _ensureToastContainer() {
    let container = document.getElementById('_toastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = '_toastContainer';
        container.style.cssText = `
            position: fixed; bottom: 24px; right: 24px;
            z-index: 9999; display: flex; flex-direction: column-reverse;
            align-items: flex-end; pointer-events: none;
        `;
        document.body.appendChild(container);
    }
    // Hacer clickeable los toasts pero no el contenedor
    container.querySelectorAll('div[id^="toast_"]').forEach(t => { t.style.pointerEvents = 'all'; });
    return container;
}

function _dismissToast(toast, id) {
    if (!toast.parentNode) return;
    clearTimeout(toast._timer);
    toast.style.transform = 'translateX(110%)';
    toast.style.opacity = '0';
    setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
        _toastActive = Math.max(0, _toastActive - 1);
        // Hacer los nuevos toasts del container clickeables
        const c = document.getElementById('_toastContainer');
        if (c) c.querySelectorAll('div[id^="toast_"]').forEach(t => { t.style.pointerEvents = 'all'; });
    }, 350);
}

// --- NOTIFICACIÓN DEL NAVEGADOR (complementaria) ---
function showBrowserNotification(title, body, tag) {
    if (!('Notification' in window) || Notification.permission !== 'granted' || document.hasFocus()) return;
    try {
        const n = new Notification(title, {
            body,
            icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y="75" font-size="75">💬</text></svg>',
            tag,
            silent: true // el sonido ya lo manejamos nosotros
        });
        n.onclick = () => { window.focus(); n.close(); };
        setTimeout(() => n.close(), 6000);
    } catch(e) {}
}

// --- FUNCIÓN PRINCIPAL: disparar notificación completa ---
function fireNotification({ senderName, senderInitial, text, color, isGroup, onClick, tag }) {
    if (isGroup) playGroupNotificationSound();
    else playNotificationSound();
    showInternalToast({ senderName, senderInitial, text, color, isGroup, onClick });
    showBrowserNotification(senderName, text || '📎 Archivo', tag || 'msg');
    updateTabTitle();
}

// Variable para controlar las notificaciones
let lastMessageCount = 0;
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

// Lista de emoticones populares
function markMessagesAsRead(username) {
    if (!username) return;
    if (unreadMessages[username]) {
        delete unreadMessages[username];
        localStorage.setItem('unreadMessages', JSON.stringify(unreadMessages));
    }
    if (messages.length > 0) {
        lastSeenMessages[username] = messages[messages.length - 1].timestamp;
        localStorage.setItem('lastSeenMessages', JSON.stringify(lastSeenMessages));
    }
    updateTabTitle();
}

function markGroupMessagesAsRead(groupId) {
    if (!groupId) return;
    if (unreadGroupMessages[groupId]) {
        delete unreadGroupMessages[groupId];
        localStorage.setItem('unreadGroupMessages', JSON.stringify(unreadGroupMessages));
    }
    if (groupMessages.length > 0) {
        lastSeenGroupMessages[groupId] = groupMessages[groupMessages.length - 1].timestamp;
        localStorage.setItem('lastSeenGroupMessages', JSON.stringify(lastSeenGroupMessages));
    }
    updateTabTitle();
}

// Función para actualizar los badges de mensajes no leídos (legado, mantenemos por compatibilidad)
function updateUnreadBadges() { updateTabTitle(); }

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

function closeCurrentChat() {
    selectedUser = null;
    selectedGroup = null;
    groupMessages = [];
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

function clearAllIntervals() {
    if (presenceInterval) { clearInterval(presenceInterval); presenceInterval = null; }
    if (usersInterval) { clearInterval(usersInterval); usersInterval = null; }
    if (messagesInterval) { clearInterval(messagesInterval); messagesInterval = null; }
    if (groupMessagesInterval) { clearInterval(groupMessagesInterval); groupMessagesInterval = null; }
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
                isAdmin = data.isAdmin || false;
                console.log('✅ Token válido:', currentUsername, isAdmin ? '[ADMIN]' : '');
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
            isAdmin = data.isAdmin || false;
            
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
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
    
    loadUsers();
    loadContacts();
    loadGroups();
    updatePresence();
    
    clearAllIntervals();
    
    presenceInterval = setInterval(updatePresence, 5000);
    usersInterval = setInterval(() => { loadUsers(); loadContacts(); loadGroups(); checkUnreadGroupMessages(); }, 7000);
    messagesInterval = setInterval(() => {
        if (selectedUser) loadMessages();
    }, 3000);
    groupMessagesInterval = setInterval(() => {
        if (selectedGroup) loadGroupMessages();
        else checkUnreadGroupMessages();
    }, 3000);
}

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && authToken && currentState === AppState.CHAT) {
        updatePresence();
        loadUsers();
        loadContacts();
        loadGroups();
        if (selectedUser) loadMessages();
        if (selectedGroup) loadGroupMessages();
        else checkUnreadGroupMessages();
        updateTabTitle();
    } else if (document.visibilityState === 'hidden') {
        // El título parpadeante se activa solo si hay no leídos
        updateTabTitle();
    }
});

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

async function loadContacts() {
    if (!authToken) return;
    try {
        const response = await fetch('/api/contacts', {
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            }
        });
        if (!response.ok) {
            if (response.status === 401) { logout(); return; }
            return;
        }
        const data = await response.json();
        if (data.success) {
            contacts = data.contacts;
            await checkUnreadMessagesForAllUsers();
            renderUsersList();
        }
    } catch (error) {
        console.error('Error cargando contactos:', error);
    }
}

async function loadGroups() {
    if (!authToken) return;
    try {
        const response = await fetch('/api/groups', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        if (!response.ok) { if (response.status === 401) { logout(); return; } return; }
        const data = await response.json();
        if (data.success) {
            groups = data.groups;
            renderUsersList();
        }
    } catch (error) {
        console.error('Error cargando grupos:', error);
    }
}

async function loadGroupMessages() {
    if (!authToken || !selectedGroup) return;
    try {
        const response = await fetch(`/api/groups/${selectedGroup.id}/messages`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        if (!response.ok) { if (response.status === 401) { logout(); return; } return; }
        const data = await response.json();
        if (data.success) {
            const oldCount = groupMessages.length;
            groupMessages = data.messages || [];
            // Actualizar último mensaje del grupo activo
            if (groupMessages.length > 0) {
                const last = groupMessages[groupMessages.length - 1];
                lastContactMessage['g_' + selectedGroup.id] = {
                    timestamp: last.timestamp,
                    text: last.text || (last.file ? '📎 Archivo' : ''),
                    senderName: last.displayName
                };
                localStorage.setItem('lastContactMessage', JSON.stringify(lastContactMessage));
            }
            // Actualizar info del grupo (puede haber cambiado miembros)
            if (data.group) {
                selectedGroup = { ...selectedGroup, ...data.group };
            }
            if (groupMessages.length > oldCount) {
                const newOnes = groupMessages.slice(oldCount);
                const newFromOthers = newOnes.filter(m => m.username !== currentUsername);
                if (newFromOthers.length > 0) {
                    // Sonido inmediato (ya estamos en el grupo abierto)
                    playGroupNotificationSound();
                }
            }
            renderGroupMessages();
            markGroupMessagesAsRead(selectedGroup.id);
        }
    } catch (error) {
        console.error('Error cargando mensajes del grupo:', error);
    }
}

// Verificar mensajes no leídos de todos los contactos
async function checkUnreadMessagesForAllUsers() {
    if (!authToken) return;

    const allUsersToCheck = [
        ...activeUsers,
        ...contacts.filter(c => !activeUsers.some(a => a.username === c.username))
    ].filter(user => !(selectedUser && selectedUser.username === user.username));

    await Promise.all(allUsersToCheck.map(async (user) => {
        try {
            const response = await fetch(`/api/messages/${user.username}`, {
                headers: { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' }
            });
            if (!response.ok) return;

            const data = await response.json();
            const userMessages = data.messages || [];
            const lastSeen = lastSeenMessages[user.username] || 0;

            // Guardar el último mensaje del contacto para ordenar y mostrar hora
            if (userMessages.length > 0) {
                const last = userMessages[userMessages.length - 1];
                lastContactMessage[user.username] = {
                    timestamp: last.timestamp,
                    text: last.text || (last.file ? '📎 Archivo' : ''),
                    senderName: last.displayName
                };
                localStorage.setItem('lastContactMessage', JSON.stringify(lastContactMessage));
            }

            const newMsgs = userMessages.filter(m => m.timestamp > lastSeen && m.username !== currentUsername);

            if (newMsgs.length > 0) {
                const prevCount = unreadMessages[user.username] || 0;
                unreadMessages[user.username] = newMsgs.length;
                localStorage.setItem('unreadMessages', JSON.stringify(unreadMessages));

                // Solo notificar mensajes realmente nuevos (no notificados antes)
                const brandNew = newMsgs.filter(m => !notifiedTimestamps.has(m.timestamp));
                if (brandNew.length > 0) {
                    brandNew.forEach(msg => notifiedTimestamps.add(msg.timestamp));
                    // Guardar solo los últimos 500 para no crecer infinito
                    const arr = Array.from(notifiedTimestamps).slice(-500);
                    localStorage.setItem('notifiedTimestamps', JSON.stringify(arr));

                    const lastMsg = brandNew[brandNew.length - 1];
                    const preview = brandNew.length > 1
                        ? `${brandNew.length} mensajes nuevos`
                        : (lastMsg.text || '📎 Archivo adjunto');

                    fireNotification({
                        senderName: user.displayName,
                        senderInitial: user.displayName.charAt(0).toUpperCase(),
                        text: preview,
                        color: '#6366f1',
                        isGroup: false,
                        tag: `dm_${user.username}`,
                        onClick: () => {
                            sidebarTab = 'contacts';
                            selectUser(user.username, user.displayName);
                        }
                    });
                }
                updateTabTitle();
            } else {
                if (unreadMessages[user.username]) {
                    delete unreadMessages[user.username];
                    localStorage.setItem('unreadMessages', JSON.stringify(unreadMessages));
                    updateTabTitle();
                }
            }
        } catch (error) {
            console.error(`Error verificando mensajes de ${user.username}:`, error);
        }
    }));
}

// Verificar mensajes no leídos en todos los grupos
async function checkUnreadGroupMessages() {
    if (!authToken || groups.length === 0) return;

    await Promise.all(groups.map(async (group) => {
        if (selectedGroup && selectedGroup.id === group.id) return;
        try {
            const response = await fetch(`/api/groups/${group.id}/messages`, {
                headers: { 'Authorization': `Bearer ${authToken}` }
            });
            if (!response.ok) return;

            const data = await response.json();
            const msgs = data.messages || [];
            const lastSeen = lastSeenGroupMessages[group.id] || 0;

            // Guardar el último mensaje del grupo para ordenar y mostrar hora
            if (msgs.length > 0) {
                const last = msgs[msgs.length - 1];
                lastContactMessage['g_' + group.id] = {
                    timestamp: last.timestamp,
                    text: last.text || (last.file ? '📎 Archivo' : ''),
                    senderName: last.displayName
                };
                localStorage.setItem('lastContactMessage', JSON.stringify(lastContactMessage));
            }

            const newMsgs = msgs.filter(m => m.timestamp > lastSeen && m.username !== currentUsername);

            if (newMsgs.length > 0) {
                unreadGroupMessages[group.id] = newMsgs.length;
                localStorage.setItem('unreadGroupMessages', JSON.stringify(unreadGroupMessages));

                const brandNew = newMsgs.filter(m => !notifiedTimestamps.has(`g_${m.timestamp}_${m.username}`));
                if (brandNew.length > 0) {
                    brandNew.forEach(m => notifiedTimestamps.add(`g_${m.timestamp}_${m.username}`));
                    const arr = Array.from(notifiedTimestamps).slice(-500);
                    localStorage.setItem('notifiedTimestamps', JSON.stringify(arr));

                    const lastMsg = brandNew[brandNew.length - 1];
                    const preview = brandNew.length > 1
                        ? `${brandNew.length} mensajes en ${group.name}`
                        : (lastMsg.text || '📎 Archivo adjunto');
                    const color = stringToColor(group.id);

                    fireNotification({
                        senderName: `${lastMsg.displayName} · ${group.name}`,
                        senderInitial: group.name.charAt(0).toUpperCase(),
                        text: preview,
                        color,
                        isGroup: true,
                        tag: `group_${group.id}`,
                        onClick: () => {
                            sidebarTab = 'groups';
                            selectGroup(group.id);
                        }
                    });
                }
                updateTabTitle();
            } else {
                if (unreadGroupMessages[group.id]) {
                    delete unreadGroupMessages[group.id];
                    localStorage.setItem('unreadGroupMessages', JSON.stringify(unreadGroupMessages));
                    updateTabTitle();
                }
            }
        } catch(e) {
            console.error(`Error verificando grupo ${group.name}:`, e);
        }
    }));
}

function renderUsersList() {
    const container = document.getElementById('usersListContainer');
    if (!container) return;

    const onlineCount = activeUsers.filter(u => u.username !== currentUsername).length;
    const counter = document.getElementById('usersCounter');
    if (counter) counter.innerHTML = `🟢 ${onlineCount} en línea · 👥 ${contacts.length} · 🏢 ${groups.length} grupos`;

    const totalUnreadContacts = contacts.reduce((s, u) => s + (unreadMessages[u.username] || 0), 0);
    const totalUnreadGroups = groups.reduce((s, g) => s + (unreadGroupMessages[g.id] || 0), 0);

    container.innerHTML = `
        <div class="flex border-b border-gray-200 bg-white sticky top-0 z-10">
            <button onclick="switchSidebarTab('online')"
                class="flex-1 py-2 text-xs font-semibold transition-colors ${sidebarTab==='online' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}">
                🟢 (${onlineCount})
            </button>
            <button onclick="switchSidebarTab('contacts')"
                class="flex-1 py-2 text-xs font-semibold transition-colors relative ${sidebarTab==='contacts' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}">
                👥 (${contacts.length})
                ${totalUnreadContacts > 0 ? `<span class="absolute top-0.5 right-0.5 min-w-[18px] h-[18px] bg-red-500 rounded-full text-white text-xs flex items-center justify-center px-1 leading-none font-bold">${totalUnreadContacts > 99 ? '99+' : totalUnreadContacts}</span>` : ''}
            </button>
            <button onclick="switchSidebarTab('groups')"
                class="flex-1 py-2 text-xs font-semibold transition-colors relative ${sidebarTab==='groups' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}">
                🏢 (${groups.length})
                ${totalUnreadGroups > 0 ? `<span class="absolute top-0.5 right-0.5 min-w-[18px] h-[18px] bg-red-500 rounded-full text-white text-xs flex items-center justify-center px-1 leading-none font-bold">${totalUnreadGroups > 99 ? '99+' : totalUnreadGroups}</span>` : ''}
            </button>
        </div>
        <div id="sidebarListContent" class="overflow-y-auto"></div>
    `;

    renderSidebarContent();
}

function switchSidebarTab(tab) {
    sidebarTab = tab;
    renderUsersList();
}

function renderSidebarContent() {
    const content = document.getElementById('sidebarListContent');
    if (!content) return;
    if (sidebarTab === 'online') renderOnlineList(content);
    else if (sidebarTab === 'contacts') renderContactsList(content);
    else if (sidebarTab === 'groups') renderGroupsListSidebar(content);
}

function renderGroupsListSidebar(content) {
    if (groups.length === 0) {
        content.innerHTML = `
            <div class="p-8 text-center text-gray-400">
                <div class="text-5xl mb-3">🏢</div>
                <p class="text-sm font-medium text-gray-500">Sin grupos aún</p>
                ${isAdmin ? `<button onclick="openAdminPanel(); switchAdminTab('groups');" class="mt-3 text-xs text-blue-600 hover:underline">+ Crear grupo</button>` : ''}
            </div>
        `;
        return;
    }
    // Ordenar grupos: con no leídos primero, luego por último mensaje
    const sortedGroups = [...groups].sort((a, b) => {
        const unreadA = unreadGroupMessages[a.id] || 0;
        const unreadB = unreadGroupMessages[b.id] || 0;
        if (unreadA > 0 && unreadB === 0) return -1;
        if (unreadB > 0 && unreadA === 0) return 1;
        const tsA = (lastContactMessage['g_' + a.id] || {}).timestamp || 0;
        const tsB = (lastContactMessage['g_' + b.id] || {}).timestamp || 0;
        return tsB - tsA;
    });

    content.innerHTML = sortedGroups.map(group => {
        const isSelected = selectedGroup && selectedGroup.id === group.id;
        const groupColor = stringToColor(group.id);
        const unread = unreadGroupMessages[group.id] || 0;
        const lastMsg = lastContactMessage['g_' + group.id];
        const lastTime = lastMsg ? formatLastTime(lastMsg.timestamp) : '';
        const lastPreview = lastMsg
            ? `${lastMsg.senderName ? lastMsg.senderName.split(' ')[0] + ': ' : ''}${lastMsg.text || '📎 Archivo'}`
            : `${group.memberCount} miembro${group.memberCount !== 1 ? 's' : ''}${group.description ? ' · ' + escapeHtml(group.description.substring(0, 20)) : ''}`;
        return `
            <button onclick="selectGroup('${group.id}')"
                class="w-full p-3.5 hover:bg-gray-50 transition-colors text-left border-b border-gray-100
                    ${isSelected ? 'bg-green-50 border-l-4 border-l-green-500' : ''}
                    ${unread > 0 && !isSelected ? 'bg-indigo-50/40' : ''}">
                <div class="flex items-center gap-3">
                    <div class="relative flex-shrink-0">
                        <div class="w-11 h-11 rounded-xl flex items-center justify-center text-white text-lg font-bold shadow-md ${unread > 0 ? 'ring-2 ring-indigo-400 ring-offset-1' : ''}" style="background: ${groupColor}">
                            ${group.name.charAt(0).toUpperCase()}
                        </div>
                        ${unread > 0 ? `
                            <div class="absolute -top-1 -right-1 min-w-[20px] h-5 bg-red-500 rounded-full flex items-center justify-center border-2 border-white animate-pulse px-1">
                                <span class="text-white text-xs font-bold leading-none">${unread > 9 ? '9+' : unread}</span>
                            </div>
                        ` : ''}
                    </div>
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center justify-between gap-1">
                            <div class="font-semibold text-sm truncate ${unread > 0 ? 'text-gray-900' : 'text-gray-800'}">${escapeHtml(group.name)}</div>
                            ${lastTime ? `<span class="text-xs flex-shrink-0 ${unread > 0 ? 'text-indigo-600 font-semibold' : 'text-gray-400'}">${lastTime}</span>` : ''}
                        </div>
                        <div class="text-xs truncate ${unread > 0 ? 'text-indigo-600 font-semibold' : 'text-gray-500'}">
                            ${unread > 0 ? `💬 ${unread} mensaje${unread > 1 ? 's' : ''} nuevo${unread > 1 ? 's' : ''}` : escapeHtml(lastPreview.substring(0, 35))}
                        </div>
                    </div>
                </div>
            </button>
        `;
    }).join('');
}

function stringToColor(str) {
    const colors = ['#6366f1','#8b5cf6','#ec4899','#14b8a6','#f59e0b','#10b981','#3b82f6','#ef4444'];
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
}

function formatLastTime(timestamp) {
    if (!timestamp) return '';
    // Los timestamps de mensajes vienen en milisegundos
    const d = new Date(timestamp);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
    const isYesterday = d.toDateString() === yesterday.toDateString();
    const timeStr = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    if (isToday) return timeStr;
    if (isYesterday) return `Ayer ${timeStr}`;
    const dateStr = d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
    return `${dateStr} ${timeStr}`;
}

function renderOnlineList(content) {
    const visibleUsers = activeUsers.filter(u => !archivedChats.includes(u.username));

    if (visibleUsers.length === 0) {
        content.innerHTML = `
            <div class="p-8 text-center text-gray-400">
                <div class="text-5xl mb-3">😴</div>
                <p class="text-sm font-medium text-gray-500">Nadie conectado</p>
                <p class="text-xs mt-1">Revisa la pestaña "Contactos" para<br>enviar mensajes aunque estén offline</p>
            </div>
        `;
        return;
    }

    content.innerHTML = visibleUsers.map(user => buildUserCard(user, true)).join('');
}

function renderContactsList(content) {
    if (contacts.length === 0) {
        content.innerHTML = `
            <div class="p-8 text-center text-gray-400">
                <div class="text-5xl mb-3">👤</div>
                <p class="text-sm font-medium text-gray-500">Sin contactos aún</p>
            </div>
        `;
        return;
    }

    const visible = contacts.filter(u => !archivedChats.includes(u.username));
    const archived = contacts.filter(u => archivedChats.includes(u.username));

    // Ordenar por último mensaje (más reciente primero), luego con mensajes no leídos al tope
    const sortByActivity = (a, b) => {
        const unreadA = unreadMessages[a.username] || 0;
        const unreadB = unreadMessages[b.username] || 0;
        if (unreadA > 0 && unreadB === 0) return -1;
        if (unreadB > 0 && unreadA === 0) return 1;
        const tsA = (lastContactMessage[a.username] || {}).timestamp || 0;
        const tsB = (lastContactMessage[b.username] || {}).timestamp || 0;
        return tsB - tsA;
    };

    let html = [...visible].sort(sortByActivity).map(user => buildUserCard(user, user.online)).join('');

    if (archived.length > 0) {
        html += `
            <div class="px-4 py-2 bg-gray-50 border-t border-gray-200 text-xs text-gray-400 font-semibold uppercase tracking-wider">
                📦 Archivados (${archived.length})
            </div>
            ${archived.map(user => buildUserCard(user, user.online, true)).join('')}
        `;
    }

    content.innerHTML = html;
}

function buildUserCard(user, isOnline, isArchived = false) {
    const unreadCount = unreadMessages[user.username] || 0;
    const isSelected = selectedUser && selectedUser.username === user.username;
    const avatarColors = isOnline
        ? 'from-purple-500 to-pink-500'
        : 'from-gray-400 to-gray-500';
    const lastMsg = lastContactMessage[user.username];
    const lastTime = lastMsg ? formatLastTime(lastMsg.timestamp) : '';
    const lastPreview = lastMsg
        ? lastMsg.text || '📎 Archivo'
        : (isOnline ? '● En línea' : '○ Desconectado');

    return `
        <button 
            class="w-full p-3.5 hover:bg-gray-50 transition-colors text-left border-b border-gray-100 
                   ${isSelected ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''} 
                   ${unreadCount > 0 && !isSelected ? 'bg-blue-50/40' : ''}
                   ${isArchived ? 'opacity-60' : ''}" 
            data-username="${user.username}"
            onclick="selectUser('${user.username}', '${escapeHtml(user.displayName)}')"
        >
            <div class="flex items-center gap-3">
                <div class="relative flex-shrink-0">
                    <div class="w-11 h-11 bg-gradient-to-br ${avatarColors} rounded-full flex items-center justify-center text-white font-semibold shadow-md ${unreadCount > 0 ? 'ring-2 ring-red-400 ring-offset-1' : ''}">
                        ${user.displayName.charAt(0).toUpperCase()}
                    </div>
                    <!-- Indicador online/offline -->
                    <div class="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white ${isOnline ? 'bg-green-500' : 'bg-gray-400'}"></div>
                    ${unreadCount > 0 ? `
                        <div class="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center border-2 border-white animate-pulse">
                            <span class="text-white text-xs font-bold leading-none">${unreadCount > 9 ? '9+' : unreadCount}</span>
                        </div>
                    ` : ''}
                </div>
                <div class="flex-1 min-w-0">
                    <div class="flex items-center justify-between gap-1">
                        <div class="font-semibold text-sm truncate ${unreadCount > 0 ? 'text-gray-900' : 'text-gray-800'}">
                            ${escapeHtml(user.displayName)}
                        </div>
                        ${lastTime ? `<span class="text-xs flex-shrink-0 ${unreadCount > 0 ? 'text-blue-600 font-semibold' : 'text-gray-400'}">${lastTime}</span>` : ''}
                    </div>
                    <div class="text-xs truncate ${unreadCount > 0 ? 'text-blue-600 font-semibold' : lastMsg ? 'text-gray-500' : isOnline ? 'text-green-600' : 'text-gray-400'}">
                        ${unreadCount > 0 
                            ? `💬 ${unreadCount} mensaje${unreadCount > 1 ? 's' : ''} nuevo${unreadCount > 1 ? 's' : ''}`
                            : escapeHtml(lastPreview.substring(0, 35))
                        }
                    </div>
                </div>
            </div>
        </button>
    `;
}

function selectUser(username, displayName) {
    const contact = contacts.find(c => c.username === username);
    selectedUser = { username, displayName: contact ? contact.displayName : displayName };
    selectedGroup = null; // Cerrar grupo si había uno abierto
    markMessagesAsRead(username);
    loadMessages();
    render();
}

function selectGroup(groupId) {
    const group = groups.find(g => g.id === groupId);
    if (!group) return;
    selectedGroup = { ...group };
    selectedUser = null;
    groupMessages = [];
    markGroupMessagesAsRead(groupId);
    loadGroupMessages();
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
        
        // Actualizar último mensaje del contacto activo
        if (newMessages.length > 0) {
            const last = newMessages[newMessages.length - 1];
            lastContactMessage[selectedUser.username] = {
                timestamp: last.timestamp,
                text: last.text || (last.file ? '📎 Archivo' : ''),
                senderName: last.displayName
            };
            localStorage.setItem('lastContactMessage', JSON.stringify(lastContactMessage));
        }
        
        // Detectar mensajes nuevos mientras estamos en la conversación abierta
        if (newMessages.length > oldCount) {
            const newOnes = newMessages.slice(oldCount);
            const newFromOthers = newOnes.filter(m => m.username !== currentUsername);
            if (newFromOthers.length > 0) {
                // Sonido inmediato (estamos en la conversación, sin toast)
                playNotificationSound();
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
    if (!text && !attachedFile) return;

    // Redirigir al grupo si está activo
    if (selectedGroup) {
        await sendGroupMessage();
        return;
    }
    
    if (!authToken || !selectedUser) {
        showError('No se puede enviar el mensaje');
        return;
    }
    
    const messageData = { to: selectedUser.username, text, file: attachedFile };
    
    try {
        const response = await fetch('/api/send', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(messageData)
        });
        if (!response.ok) {
            if (response.status === 401) { logout(); return; }
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

async function sendGroupMessage() {
    const input = document.getElementById('msgInput');
    if (!input || !selectedGroup) return;
    const text = input.value.trim();
    if (!text && !attachedFile) return;

    try {
        const response = await fetch(`/api/groups/${selectedGroup.id}/send`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, file: attachedFile })
        });
        if (!response.ok) {
            if (response.status === 401) { logout(); return; }
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        if (data.success) {
            input.value = '';
            attachedFile = null;
            const fp = document.getElementById('filePreviewContainer');
            if (fp) fp.innerHTML = '';
            loadGroupMessages();
        } else {
            showError(data.error || 'Error al enviar mensaje al grupo');
        }
    } catch (error) {
        showError('Error de conexión al enviar mensaje');
    }
}

function renderGroupMessages() {
    const container = document.getElementById('messagesContainer');
    if (!container) return;

    if (groupMessages.length === 0) {
        container.innerHTML = `
            <div class="flex items-center justify-center h-full">
                <div class="text-center text-gray-400">
                    <div class="text-6xl mb-4">💬</div>
                    <p>Nadie ha escrito aún</p>
                    <p class="text-sm mt-2">¡Sé el primero en saludar!</p>
                </div>
            </div>
        `;
        return;
    }

    // Agrupar mensajes consecutivos del mismo usuario
    let html = '';
    let prevUsername = null;

    groupMessages.forEach((msg, idx) => {
        const isMine = msg.username === currentUsername;
        const time = new Date(msg.timestamp).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
        const showSender = !isMine && msg.username !== prevUsername;
        prevUsername = msg.username;

        const avatarColor = isMine ? 'from-blue-500 to-indigo-600' : 'from-purple-500 to-pink-500';

        if (msg.file) {
            const isImage = msg.file.type && msg.file.type.startsWith('image/');
            html += `
                <div class="mb-1 flex gap-2 ${isMine ? 'justify-end' : 'justify-start'}">
                    ${!isMine ? `
                        <div class="w-8 h-8 flex-shrink-0 ${showSender ? `bg-gradient-to-br ${avatarColor} rounded-full flex items-center justify-center text-white text-xs font-bold shadow` : ''}">
                            ${showSender ? msg.displayName.charAt(0).toUpperCase() : ''}
                        </div>
                    ` : ''}
                    <div class="max-w-xs lg:max-w-md">
                        ${showSender ? `<div class="text-xs font-semibold text-purple-600 mb-1 ml-1">${escapeHtml(msg.displayName)}</div>` : ''}
                        <div class="rounded-2xl p-3 shadow-sm ${isMine ? 'bg-gradient-to-br from-blue-500 to-indigo-600 text-white' : 'bg-white text-gray-800 border border-gray-200'}">
                            ${msg.text ? `<p class="mb-2 text-sm">${escapeHtml(msg.text)}</p>` : ''}
                            ${isImage ? `<img src="${msg.file.data}" alt="${escapeHtml(msg.file.name)}" class="rounded-lg max-w-full">` : `
                                <div class="flex items-center gap-2 p-2 ${isMine ? 'bg-white/20' : 'bg-gray-100'} rounded">
                                    <span class="text-xl">📎</span>
                                    <span class="text-xs">${escapeHtml(msg.file.name)}</span>
                                </div>
                            `}
                        </div>
                        <div class="text-xs text-gray-400 mt-0.5 ${isMine ? 'text-right' : 'ml-1'}">${time}</div>
                    </div>
                </div>
            `;
            return;
        }

        html += `
            <div class="mb-1 flex gap-2 ${isMine ? 'justify-end' : 'justify-start'}">
                ${!isMine ? `
                    <div class="w-8 h-8 flex-shrink-0 mt-1 ${showSender ? `bg-gradient-to-br ${avatarColor} rounded-full flex items-center justify-center text-white text-xs font-bold shadow` : ''}">
                        ${showSender ? msg.displayName.charAt(0).toUpperCase() : ''}
                    </div>
                ` : ''}
                <div class="max-w-xs lg:max-w-md">
                    ${showSender ? `<div class="text-xs font-semibold text-purple-600 mb-1 ml-1">${escapeHtml(msg.displayName)}</div>` : ''}
                    <div class="rounded-2xl px-3 py-2 shadow-sm text-sm ${isMine ? 'bg-gradient-to-br from-blue-500 to-indigo-600 text-white' : 'bg-white text-gray-800 border border-gray-200'}">
                        <p class="whitespace-pre-wrap break-words">${escapeHtml(msg.text)}</p>
                    </div>
                    <div class="text-xs text-gray-400 mt-0.5 ${isMine ? 'text-right' : 'ml-1'}">${time}</div>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
    container.scrollTop = container.scrollHeight;
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
                        <div id="usersCounter" class="text-xs text-white/80 bg-white/20 px-2 py-1.5 rounded flex-1 truncate">
                            🟢 0 en línea · 👥 0 contactos
                        </div>
                        <button onclick="loadUsers(); loadContacts();" class="p-2 bg-white/20 hover:bg-white/30 rounded transition-colors" title="Actualizar">
                            🔄
                        </button>
                        ${isAdmin ? `
                        <button onclick="openAdminPanel()" class="p-2 bg-yellow-400/80 hover:bg-yellow-400 text-yellow-900 rounded transition-colors font-bold text-sm" title="Panel de Administración">
                            ⚙️
                        </button>
                        ` : ''}
                    </div>
                </div>
                
                <!-- Lista de usuarios -->
                <div id="usersListContainer" class="flex-1 overflow-y-auto scrollbar-thin"></div>
            </div>
            
            <!-- Chat Area -->
            <div class="flex-1 flex flex-col">
                ${selectedGroup ? `
                    <!-- Header del grupo -->
                    <div class="bg-white shadow-sm border-b border-gray-200 p-4">
                        <div class="flex items-center gap-3">
                            <button onclick="closeCurrentChat()" class="p-2 hover:bg-gray-100 rounded-lg transition-colors text-xl">←</button>
                            <div class="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-lg shadow-lg" style="background: ${stringToColor(selectedGroup.id)}">
                                ${selectedGroup.name.charAt(0).toUpperCase()}
                            </div>
                            <div class="flex-1 min-w-0">
                                <h2 class="font-semibold text-gray-800 truncate">${escapeHtml(selectedGroup.name)}</h2>
                                <div class="text-xs text-gray-500">${selectedGroup.memberCount || selectedGroup.members?.length || 0} miembros · Canal grupal</div>
                            </div>
                            ${isAdmin ? `
                            <button onclick="openAdminPanel(); switchAdminTab('groups');" class="p-2 hover:bg-gray-100 rounded-lg transition-colors text-sm text-gray-500" title="Gestionar grupo">
                                ⚙️
                            </button>
                            ` : ''}
                        </div>
                    </div>
                    
                    <!-- Mensajes del grupo -->
                    <div id="messagesContainer" class="flex-1 overflow-y-auto p-4 bg-gray-50 scrollbar-thin"></div>
                    
                    <!-- Input mensaje grupo -->
                    <div class="bg-white border-t border-gray-200 p-4">
                        <div class="max-w-3xl mx-auto">
                            <div id="filePreviewContainer"></div>
                            <div id="emojiPicker" class="hidden mb-2 p-3 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                                <div class="grid grid-cols-8 gap-2">
                                    ${emojis.map(emoji => `<button onclick="insertEmoji('${emoji}')" class="text-2xl hover:bg-gray-100 rounded p-1 transition">${emoji}</button>`).join('')}
                                </div>
                            </div>
                            <div class="flex gap-2">
                                <input type="file" id="fileInput" class="hidden" onchange="handleFileSelect(event)">
                                <label for="fileInput" class="flex items-center justify-center w-10 h-10 bg-gray-100 hover:bg-gray-200 rounded-lg cursor-pointer transition" title="Adjuntar">📎</label>
                                <button onclick="toggleEmojiPicker()" class="flex items-center justify-center w-10 h-10 bg-gray-100 hover:bg-gray-200 rounded-lg transition">😀</button>
                                <input id="msgInput" type="text"
                                    placeholder="Escribe en ${escapeHtml(selectedGroup.name)}..."
                                    class="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 transition"
                                    autocomplete="off"
                                    onkeypress="if(event.key==='Enter' && !event.shiftKey) { event.preventDefault(); sendMessage(); }">
                                <button onclick="sendMessage()" class="flex items-center justify-center w-10 h-10 text-white rounded-lg transition-all shadow-lg hover:shadow-xl" style="background: ${stringToColor(selectedGroup.id)}">➤</button>
                            </div>
                        </div>
                    </div>
                ` : selectedUser ? `
                    <!-- Header del chat privado -->
                    <div class="bg-white shadow-sm border-b border-gray-200 p-4">
                        <div class="flex items-center gap-3">
                            <button onclick="closeCurrentChat()" class="p-2 hover:bg-gray-100 rounded-lg transition-colors text-xl" title="Cerrar chat">←</button>
                            <div class="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-semibold shadow-lg">
                                ${selectedUser.displayName.charAt(0).toUpperCase()}
                            </div>
                            <div class="flex-1">
                                <h2 class="font-semibold text-gray-800">${escapeHtml(selectedUser.displayName)}</h2>
                                <div class="flex items-center gap-2">
                                    ${(() => {
                                        const contact = contacts.find(c => c.username === selectedUser.username);
                                        const online = contact ? contact.online : activeUsers.some(u => u.username === selectedUser.username);
                                        return online
                                            ? `<div class="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div><span class="text-xs text-green-600 font-medium">En línea</span>`
                                            : `<div class="w-2 h-2 bg-gray-400 rounded-full"></div><span class="text-xs text-gray-400">Desconectado · el mensaje llegará cuando se conecte</span>`;
                                    })()}
                                </div>
                            </div>
                            <div class="relative">
                                <button id="chatMenuButton" onclick="toggleChatMenu(event)" class="p-2 hover:bg-gray-100 rounded-lg transition-colors text-xl">⋮</button>
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
                    
                    <!-- Mensajes privados -->
                    <div id="messagesContainer" class="flex-1 overflow-y-auto p-4 bg-gray-50 scrollbar-thin"></div>
                    
                    <!-- Input de mensaje privado -->
                    <div class="bg-white border-t border-gray-200 p-4">
                        <div class="max-w-3xl mx-auto">
                            <div id="filePreviewContainer"></div>
                            <div id="emojiPicker" class="hidden mb-2 p-3 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                                <div class="grid grid-cols-8 gap-2">
                                    ${emojis.map(emoji => `<button onclick="insertEmoji('${emoji}')" class="text-2xl hover:bg-gray-100 rounded p-1 transition">${emoji}</button>`).join('')}
                                </div>
                            </div>
                            <div class="flex gap-2">
                                <input type="file" id="fileInput" class="hidden" onchange="handleFileSelect(event)">
                                <label for="fileInput" class="flex items-center justify-center w-10 h-10 bg-gray-100 hover:bg-gray-200 rounded-lg cursor-pointer transition" title="Adjuntar archivo">📎</label>
                                <button onclick="toggleEmojiPicker()" class="flex items-center justify-center w-10 h-10 bg-gray-100 hover:bg-gray-200 rounded-lg transition" title="Emojis">😀</button>
                                <input id="msgInput" type="text" placeholder="Escribe un mensaje..."
                                    class="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                                    autocomplete="off"
                                    onkeypress="if(event.key==='Enter' && !event.shiftKey) { event.preventDefault(); sendMessage(); }">
                                <button onclick="sendMessage()" class="flex items-center justify-center w-10 h-10 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all shadow-lg hover:shadow-xl">➤</button>
                            </div>
                        </div>
                    </div>
                ` : `
                    <!-- Placeholder cuando no hay chat seleccionado -->
                    <div class="flex-1 flex items-center justify-center bg-gray-50">
                        <div class="text-center">
                            <div class="text-7xl mb-4">💬</div>
                            <h3 class="text-xl font-semibold text-gray-700 mb-2">Bienvenido, ${escapeHtml(currentDisplayName)}</h3>
                            <p class="text-gray-500">Selecciona un contacto o grupo para chatear</p>
                            <p class="text-sm text-gray-400 mt-2">Puedes escribirle a alguien aunque esté desconectado</p>
                            ${Object.keys(unreadMessages).length > 0 ? `<p class="text-sm text-red-400 mt-3 font-medium">🔴 Tienes mensajes sin leer</p>` : ''}
                        </div>
                    </div>
                `}
            </div>
        </div>
    `;
    
    renderUsersList();
    if (selectedUser) renderMessages();
    if (selectedGroup) renderGroupMessages();
}

function render() {
    const root = document.getElementById('root');
    
    if (currentState === AppState.LOGIN) {
        root.innerHTML = renderLogin();
    } else if (currentState === AppState.REGISTER) {
        root.innerHTML = renderRegister();
    } else if (currentState === AppState.CHAT) {
        renderChat();
    } else if (currentState === AppState.ADMIN) {
        renderAdminPanel();
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

// ============================================
// PANEL DE ADMINISTRACIÓN
// ============================================

let adminUsers = [];
let adminTab = 'users'; // 'users' | 'create'

function openAdminPanel() {
    if (!isAdmin) return;
    currentState = AppState.ADMIN;
    adminTab = 'users';
    render();
    loadAdminUsers();
    loadAdminGroups();
}

async function loadAdminUsers() {
    if (!authToken) return;
    try {
        const response = await fetch('/api/admin/users', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await response.json();
        if (data.success) {
            adminUsers = data.users;
            renderAdminUsers();
        }
    } catch (e) {
        showError('Error cargando usuarios');
    }
}

function renderAdminUsers() {
    const container = document.getElementById('adminUsersContainer');
    if (!container) return;

    if (adminUsers.length === 0) {
        container.innerHTML = `<p class="text-gray-500 text-center py-8">No hay usuarios registrados</p>`;
        return;
    }

    container.innerHTML = adminUsers.map(user => {
        const isCurrentAdmin = user.username === currentUsername;
        const createdDate = user.createdAt ? new Date(user.createdAt * 1000).toLocaleDateString('es-CO') : '—';
        return `
        <div class="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-4 shadow-sm">
            <div class="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
                ${user.displayName.charAt(0).toUpperCase()}
            </div>
            <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                    <span class="font-semibold text-gray-900">${escapeHtml(user.displayName)}</span>
                    ${isCurrentAdmin ? '<span class="bg-yellow-100 text-yellow-800 text-xs px-2 py-0.5 rounded-full font-medium">⚙️ Admin</span>' : ''}
                </div>
                <div class="text-sm text-gray-500">@${escapeHtml(user.username)}</div>
                <div class="text-xs text-gray-400">Registrado: ${createdDate}</div>
            </div>
            <div class="flex gap-2 flex-shrink-0">
                <button 
                    onclick="showEditNameModal('${escapeHtml(user.username)}', '${escapeHtml(user.displayName)}')"
                    class="px-3 py-1.5 bg-green-50 hover:bg-green-100 text-green-700 rounded-lg text-sm font-medium transition-colors"
                    title="Editar nombre"
                >
                    ✏️ Nombre
                </button>
                <button 
                    onclick="showChangePasswordModal('${escapeHtml(user.username)}', '${escapeHtml(user.displayName)}')"
                    class="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-sm font-medium transition-colors"
                    title="Cambiar contraseña"
                >
                    🔑 Contraseña
                </button>
                ${!isCurrentAdmin ? `
                <button 
                    onclick="adminDeleteUser('${escapeHtml(user.username)}', '${escapeHtml(user.displayName)}')"
                    class="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-sm font-medium transition-colors"
                    title="Eliminar usuario"
                >
                    🗑️
                </button>
                ` : ''}
            </div>
        </div>
        `;
    }).join('');
}

let _editNameTarget = null;

function showEditNameModal(username, displayName) {
    const modal = document.getElementById('adminModal');
    const modalContent = document.getElementById('adminModalContent');
    if (!modal || !modalContent) return;

    _editNameTarget = username; // guardamos en variable global, evitamos pasar por HTML

    modalContent.innerHTML = `
        <div class="p-6">
            <h3 class="text-lg font-bold text-gray-800 mb-1">✏️ Editar nombre</h3>
            <p class="text-sm text-gray-500 mb-5">Usuario: <strong>@${escapeHtml(username)}</strong></p>
            <div class="space-y-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Nombre para mostrar *</label>
                    <input 
                        id="modalNewDisplayName" 
                        type="text" 
                        class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                        placeholder="Nombre completo"
                        onkeypress="if(event.key==='Enter') submitEditName()"
                    >
                </div>
            </div>
            <div class="flex gap-3 mt-6">
                <button onclick="closeAdminModal()" class="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors font-medium">
                    Cancelar
                </button>
                <button onclick="submitEditName()" class="flex-1 px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors font-medium">
                    Guardar nombre
                </button>
            </div>
        </div>
    `;

    modal.classList.remove('hidden');

    // Asignamos el valor vía JS después de insertar el HTML, así funciona sin importar caracteres especiales
    setTimeout(() => {
        const input = document.getElementById('modalNewDisplayName');
        if (input) {
            input.value = displayName;
            input.focus();
            input.select();
        }
    }, 50);
}

async function submitEditName() {
    const username = _editNameTarget;
    if (!username) { showError('Error: usuario no identificado'); return; }

    const input = document.getElementById('modalNewDisplayName');
    if (!input) { showError('Error: campo no encontrado'); return; }

    const newName = input.value.trim();
    if (!newName) { showError('El nombre no puede estar vacío'); return; }
    if (newName.length < 2) { showError('El nombre debe tener al menos 2 caracteres'); return; }

    try {
        const response = await fetch('/api/admin/update-displayname', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, displayName: newName })
        });
        const data = await response.json();
        if (response.ok && data.success) {
            showSuccess(`Nombre actualizado: ${newName}`);
            _editNameTarget = null;
            closeAdminModal();
            await loadAdminUsers();
        } else {
            showError(data.error || 'Error al actualizar nombre');
        }
    } catch (error) {
        console.error('Error actualizando nombre:', error);
        showError('Error de conexión con el servidor');
    }
}

function showChangePasswordModal(username, displayName) {
    const modal = document.getElementById('adminModal');
    const modalContent = document.getElementById('adminModalContent');
    if (!modal || !modalContent) return;

    modalContent.innerHTML = `
        <div class="p-6">
            <h3 class="text-lg font-bold text-gray-800 mb-1">Cambiar contraseña</h3>
            <p class="text-sm text-gray-500 mb-5">Usuario: <strong>${escapeHtml(displayName)}</strong> (@${escapeHtml(username)})</p>
            <div class="space-y-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Nueva contraseña *</label>
                    <input 
                        id="modalNewPassword" 
                        type="password" 
                        class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Mínimo 4 caracteres"
                        autocomplete="new-password"
                    >
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Confirmar contraseña *</label>
                    <input 
                        id="modalConfirmPassword" 
                        type="password" 
                        class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Repite la contraseña"
                        autocomplete="new-password"
                        onkeypress="if(event.key==='Enter') submitChangePassword('${escapeHtml(username)}')"
                    >
                </div>
            </div>
            <div class="flex gap-3 mt-6">
                <button onclick="closeAdminModal()" class="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors font-medium">
                    Cancelar
                </button>
                <button onclick="submitChangePassword('${escapeHtml(username)}')" class="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium">
                    Guardar cambios
                </button>
            </div>
        </div>
    `;
    modal.classList.remove('hidden');
    setTimeout(() => document.getElementById('modalNewPassword')?.focus(), 50);
}

async function submitChangePassword(username) {
    const newPassword = document.getElementById('modalNewPassword')?.value;
    const confirmPassword = document.getElementById('modalConfirmPassword')?.value;

    if (!newPassword || newPassword.length < 4) {
        showError('La contraseña debe tener al menos 4 caracteres');
        return;
    }
    if (newPassword !== confirmPassword) {
        showError('Las contraseñas no coinciden');
        return;
    }

    try {
        const response = await fetch('/api/admin/change-password', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, newPassword })
        });
        const data = await response.json();
        if (data.success) {
            showSuccess(data.message || 'Contraseña actualizada');
            closeAdminModal();
        } else {
            showError(data.error || 'Error al cambiar la contraseña');
        }
    } catch (e) {
        showError('Error de conexión');
    }
}

async function adminCreateUser() {
    const username = document.getElementById('createUsername')?.value.trim();
    const displayName = document.getElementById('createDisplayName')?.value.trim();
    const password = document.getElementById('createPassword')?.value;
    const confirmPassword = document.getElementById('createConfirmPassword')?.value;

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
        const response = await fetch('/api/admin/create-user', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, displayName: displayName || username, password })
        });
        const data = await response.json();
        if (data.success) {
            showSuccess(data.message || 'Usuario creado exitosamente');
            document.getElementById('createUsername').value = '';
            document.getElementById('createDisplayName').value = '';
            document.getElementById('createPassword').value = '';
            document.getElementById('createConfirmPassword').value = '';
            await loadAdminUsers();
            switchAdminTab('users');
        } else {
            showError(data.error || 'Error al crear el usuario');
        }
    } catch (e) {
        showError('Error de conexión');
    }
}

async function adminDeleteUser(username, displayName) {
    if (!confirm(`¿Estás seguro de eliminar al usuario "${displayName}" (@${username})?\n\nEsta acción no se puede deshacer.`)) return;

    try {
        const response = await fetch('/api/admin/delete-user', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username })
        });
        const data = await response.json();
        if (data.success) {
            showSuccess(data.message || 'Usuario eliminado');
            await loadAdminUsers();
        } else {
            showError(data.error || 'Error al eliminar usuario');
        }
    } catch (e) {
        showError('Error de conexión');
    }
}

function closeAdminModal() {
    const modal = document.getElementById('adminModal');
    if (modal) modal.classList.add('hidden');
}

function switchAdminTab(tab) {
    adminTab = tab;
    const tabs = ['users', 'create', 'groups'];
    tabs.forEach(t => {
        const btn = document.getElementById(`tabAdmin_${t}`);
        const content = document.getElementById(`contentAdmin_${t}`);
        if (!btn || !content) return;
        if (t === tab) {
            btn.className = 'flex-1 py-3 text-sm font-semibold text-blue-600 border-b-2 border-blue-600 transition-colors';
            content.classList.remove('hidden');
        } else {
            btn.className = 'flex-1 py-3 text-sm font-semibold text-gray-500 hover:text-gray-700 border-b-2 border-transparent transition-colors';
            content.classList.add('hidden');
        }
    });
    if (tab === 'groups') loadAdminGroups();
}

// =============================================
// ADMIN — FUNCIONES DE GRUPOS
// =============================================

let adminGroups = [];

async function loadAdminGroups() {
    try {
        const response = await fetch('/api/groups', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await response.json();
        if (data.success) {
            adminGroups = data.groups;
            renderAdminGroups();
        }
    } catch(e) { showError('Error cargando grupos'); }
}

function renderAdminGroups() {
    const container = document.getElementById('adminGroupsContainer');
    if (!container) return;

    if (adminGroups.length === 0) {
        container.innerHTML = `
            <div class="text-center py-8 text-gray-400">
                <div class="text-4xl mb-2">🏢</div>
                <p class="text-sm">No hay grupos. Crea el primero abajo.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = adminGroups.map(group => {
        const color = stringToColor(group.id);
        const memberNames = group.members
            .map(u => { const found = adminUsers.find(au => au.username === u); return found ? found.displayName : u; })
            .join(', ');
        return `
        <div class="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <div class="flex items-center gap-3 mb-3">
                <div class="w-12 h-12 rounded-xl flex items-center justify-center text-white text-xl font-bold flex-shrink-0" style="background:${color}">
                    ${group.name.charAt(0).toUpperCase()}
                </div>
                <div class="flex-1 min-w-0">
                    <div class="font-semibold text-gray-900">${escapeHtml(group.name)}</div>
                    <div class="text-xs text-gray-500">${group.memberCount} miembros${group.description ? ' · ' + escapeHtml(group.description) : ''}</div>
                </div>
                <button onclick="adminDeleteGroup('${group.id}', '${escapeHtml(group.name)}')"
                    class="p-2 text-red-400 hover:bg-red-50 rounded-lg transition-colors" title="Eliminar grupo">🗑️</button>
            </div>
            <!-- Miembros -->
            <div class="bg-gray-50 rounded-lg p-3 mb-3">
                <div class="text-xs font-medium text-gray-500 mb-2">👥 Miembros:</div>
                <div class="flex flex-wrap gap-1.5">
                    ${group.members.map(u => {
                        const found = adminUsers.find(au => au.username === u);
                        const name = found ? found.displayName : u;
                        return `
                        <span class="flex items-center gap-1 bg-white border border-gray-200 rounded-full px-2 py-0.5 text-xs text-gray-700">
                            ${escapeHtml(name)}
                            <button onclick="adminRemoveMember('${group.id}', '${u}')" class="text-gray-400 hover:text-red-500 ml-0.5 font-bold leading-none" title="Quitar">×</button>
                        </span>`;
                    }).join('')}
                </div>
            </div>
            <!-- Agregar miembro -->
            <div class="flex gap-2">
                <select id="addMember_${group.id}" class="flex-1 text-sm px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">+ Agregar miembro...</option>
                    ${adminUsers.filter(u => !group.members.includes(u.username)).map(u =>
                        `<option value="${u.username}">${escapeHtml(u.displayName)} (@${u.username})</option>`
                    ).join('')}
                </select>
                <button onclick="adminAddMember('${group.id}')" class="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors">Agregar</button>
            </div>
        </div>
        `;
    }).join('');
}

async function adminAddMember(groupId) {
    const sel = document.getElementById(`addMember_${groupId}`);
    if (!sel || !sel.value) { showError('Selecciona un usuario'); return; }
    const username = sel.value;
    try {
        const response = await fetch('/api/admin/groups/add-member', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ groupId, username })
        });
        const data = await response.json();
        if (data.success) {
            showSuccess(data.message);
            await loadAdminGroups();
            await loadGroups(); // actualizar sidebar
        } else showError(data.error);
    } catch(e) { showError('Error de conexión'); }
}

async function adminRemoveMember(groupId, username) {
    try {
        const response = await fetch('/api/admin/groups/remove-member', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ groupId, username })
        });
        const data = await response.json();
        if (data.success) {
            showSuccess(data.message);
            await loadAdminGroups();
            await loadGroups();
        } else showError(data.error);
    } catch(e) { showError('Error de conexión'); }
}

async function adminDeleteGroup(groupId, groupName) {
    if (!confirm(`¿Eliminar el grupo "${groupName}"?\nSe borrarán también todos los mensajes del grupo.`)) return;
    try {
        const response = await fetch('/api/admin/groups/delete', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ groupId })
        });
        const data = await response.json();
        if (data.success) {
            showSuccess(data.message);
            if (selectedGroup && selectedGroup.id === groupId) closeCurrentChat();
            await loadAdminGroups();
            await loadGroups();
        } else showError(data.error);
    } catch(e) { showError('Error de conexión'); }
}

async function adminCreateGroup() {
    const name = document.getElementById('newGroupName')?.value.trim();
    const description = document.getElementById('newGroupDesc')?.value.trim();
    const addAll = document.getElementById('newGroupAddAll')?.checked !== false;
    if (!name) { showError('El nombre del grupo es requerido'); return; }
    try {
        const response = await fetch('/api/admin/groups/create', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, description, addAllUsers: addAll })
        });
        const data = await response.json();
        if (data.success) {
            showSuccess(data.message);
            document.getElementById('newGroupName').value = '';
            document.getElementById('newGroupDesc').value = '';
            await loadAdminGroups();
            await loadGroups();
        } else showError(data.error);
    } catch(e) { showError('Error de conexión'); }
}

function renderAdminPanel() {
    const root = document.getElementById('root');

    root.innerHTML = `
        <div class="min-h-screen bg-gray-50">
            <!-- Header Admin -->
            <div class="bg-gradient-to-r from-gray-800 to-gray-900 text-white shadow-lg">
                <div class="max-w-4xl mx-auto px-4 py-4 flex items-center gap-4">
                    <button onclick="currentState = AppState.CHAT; render(); startChatSession();" 
                        class="p-2 hover:bg-white/10 rounded-lg transition-colors text-xl" title="Volver al chat">
                        ←
                    </button>
                    <div class="flex-1">
                        <h1 class="text-xl font-bold flex items-center gap-2">
                            ⚙️ Panel de Administración
                        </h1>
                        <p class="text-sm text-gray-400">Gestión de usuarios del Chat Corporativo</p>
                    </div>
                    <div class="text-right text-sm text-gray-400">
                        <div class="text-white font-medium">${escapeHtml(currentDisplayName)}</div>
                        <div class="text-yellow-400 text-xs">Administrador</div>
                    </div>
                </div>
            </div>

            <!-- Content -->
            <div class="max-w-4xl mx-auto px-4 py-6">
                <!-- Stats card -->
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                    <div class="bg-white rounded-xl border border-gray-200 p-4 shadow-sm flex items-center gap-3">
                        <div class="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center text-xl">👥</div>
                        <div>
                            <div class="text-2xl font-bold text-gray-800" id="statTotalUsers">—</div>
                            <div class="text-xs text-gray-500">Usuarios totales</div>
                        </div>
                    </div>
                    <div class="bg-white rounded-xl border border-gray-200 p-4 shadow-sm flex items-center gap-3">
                        <div class="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center text-xl">🟢</div>
                        <div>
                            <div class="text-2xl font-bold text-gray-800" id="statActiveUsers">—</div>
                            <div class="text-xs text-gray-500">En línea ahora</div>
                        </div>
                    </div>
                    <div class="bg-white rounded-xl border border-gray-200 p-4 shadow-sm flex items-center gap-3">
                        <div class="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center text-xl">🏢</div>
                        <div>
                            <div class="text-2xl font-bold text-gray-800" id="statTotalGroups">—</div>
                            <div class="text-xs text-gray-500">Grupos activos</div>
                        </div>
                    </div>
                </div>

                <!-- Tabs -->
                <div class="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <div class="flex border-b border-gray-200">
                        <button id="tabAdmin_users" onclick="switchAdminTab('users')" 
                            class="flex-1 py-3 text-sm font-semibold text-blue-600 border-b-2 border-blue-600 transition-colors">
                            👥 Usuarios
                        </button>
                        <button id="tabAdmin_create" onclick="switchAdminTab('create')" 
                            class="flex-1 py-3 text-sm font-semibold text-gray-500 hover:text-gray-700 border-b-2 border-transparent transition-colors">
                            ➕ Crear usuario
                        </button>
                        <button id="tabAdmin_groups" onclick="switchAdminTab('groups')" 
                            class="flex-1 py-3 text-sm font-semibold text-gray-500 hover:text-gray-700 border-b-2 border-transparent transition-colors">
                            🏢 Grupos
                        </button>
                    </div>

                    <!-- Tab: Usuarios -->
                    <div id="contentAdmin_users" class="p-4">
                        <div class="flex items-center justify-between mb-4">
                            <h2 class="font-semibold text-gray-700">Todos los usuarios</h2>
                            <button onclick="loadAdminUsers()" class="text-sm text-blue-600 hover:text-blue-700">🔄 Actualizar</button>
                        </div>
                        <div id="adminUsersContainer" class="space-y-3">
                            <div class="text-center py-8 text-gray-400"><div class="text-3xl mb-2">⏳</div><p class="text-sm">Cargando usuarios...</p></div>
                        </div>
                    </div>

                    <!-- Tab: Crear usuario -->
                    <div id="contentAdmin_create" class="p-4 hidden">
                        <h2 class="font-semibold text-gray-700 mb-4">Crear nuevo usuario</h2>
                        <div class="max-w-md space-y-4">
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">Usuario * <span class="text-gray-400 font-normal">(mínimo 3 caracteres)</span></label>
                                <input id="createUsername" type="text" class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition" placeholder="Ej: jgomez">
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">Nombre para mostrar <span class="text-gray-400 font-normal">(opcional)</span></label>
                                <input id="createDisplayName" type="text" class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition" placeholder="Ej: Juan Gómez">
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">Contraseña * <span class="text-gray-400 font-normal">(mínimo 4 caracteres)</span></label>
                                <input id="createPassword" type="password" class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition" placeholder="••••••••" autocomplete="new-password">
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">Confirmar contraseña *</label>
                                <input id="createConfirmPassword" type="password" class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition" placeholder="••••••••" autocomplete="new-password" onkeypress="if(event.key==='Enter') adminCreateUser()">
                            </div>
                            <div class="flex items-center gap-2 p-3 bg-blue-50 rounded-lg text-sm text-blue-700">
                                <span>🏢</span>
                                <span>El usuario será agregado automáticamente a todos los grupos existentes</span>
                            </div>
                            <button onclick="adminCreateUser()" class="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white py-3 rounded-lg font-semibold shadow-md transition-all">
                                ➕ Crear usuario
                            </button>
                        </div>
                    </div>

                    <!-- Tab: Grupos -->
                    <div id="contentAdmin_groups" class="p-4 hidden">
                        <div class="flex items-center justify-between mb-4">
                            <h2 class="font-semibold text-gray-700">Grupos del chat</h2>
                            <button onclick="loadAdminGroups()" class="text-sm text-blue-600 hover:text-blue-700">🔄 Actualizar</button>
                        </div>

                        <!-- Crear nuevo grupo -->
                        <div class="bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-200 rounded-xl p-4 mb-5">
                            <h3 class="font-semibold text-indigo-800 mb-3 flex items-center gap-2">🏢 Crear nuevo grupo</h3>
                            <div class="space-y-3">
                                <input id="newGroupName" type="text" placeholder="Nombre del grupo *" 
                                    class="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                                <input id="newGroupDesc" type="text" placeholder="Descripción (opcional)"
                                    class="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                                <label class="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                                    <input id="newGroupAddAll" type="checkbox" checked class="w-4 h-4 accent-indigo-600">
                                    Agregar automáticamente a todos los usuarios registrados
                                </label>
                                <button onclick="adminCreateGroup()" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-lg font-semibold text-sm transition-colors">
                                    ✅ Crear grupo
                                </button>
                            </div>
                        </div>

                        <!-- Lista de grupos -->
                        <div id="adminGroupsContainer" class="space-y-4">
                            <div class="text-center py-8 text-gray-400"><div class="text-3xl mb-2">⏳</div><p class="text-sm">Cargando grupos...</p></div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Modal cambiar contraseña -->
            <div id="adminModal" class="hidden fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onclick="if(event.target===this) closeAdminModal()">
                <div id="adminModalContent" class="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
                </div>
            </div>
        </div>
    `;

    setTimeout(() => {
        const statTotal = document.getElementById('statTotalUsers');
        const statActive = document.getElementById('statActiveUsers');
        const statGroups = document.getElementById('statTotalGroups');
        if (statTotal) statTotal.textContent = adminUsers.length || '…';
        if (statActive) statActive.textContent = activeUsers.length;
        if (statGroups) statGroups.textContent = adminGroups.length || '…';
    }, 100);
}

// Inicialización
async function init() {
    if (authToken) {
        // Mostrar pantalla de carga inmediatamente mientras se verifica el token
        const root = document.getElementById('root');
        root.innerHTML = `
            <div class="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center">
                <div class="text-center">
                    <div class="text-6xl mb-4">💬</div>
                    <div class="flex items-center justify-center gap-3">
                        <div class="w-5 h-5 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                        <span class="text-gray-600 font-medium">Verificando sesión...</span>
                    </div>
                </div>
            </div>
        `;

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
