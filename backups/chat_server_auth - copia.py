#!/usr/bin/env python3
"""
Servidor de Chat Corporativo con Autenticación y Persistencia
Ejecutar con: python chat_server_auth.py
"""

from http.server import HTTPServer, BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import socket
from urllib.parse import urlparse, parse_qs
import time
from threading import Lock
import hashlib
import secrets
import os
import sys

def disable_quick_edit_mode():
    """
    Desactiva el Quick Edit Mode de la consola de Windows.
    Esto evita que el proceso se pause al hacer clic en la ventana CMD.
    Solo aplica en Windows; en otros SO no hace nada.
    """
    if sys.platform != 'win32':
        return
    try:
        import ctypes
        import ctypes.wintypes
        kernel32 = ctypes.windll.kernel32
        handle = kernel32.GetStdHandle(-10)  # STD_INPUT_HANDLE
        mode = ctypes.wintypes.DWORD()
        kernel32.GetConsoleMode(handle, ctypes.byref(mode))
        # Desactivar ENABLE_QUICK_EDIT_MODE (0x0040) y ENABLE_INSERT_MODE (0x0020)
        new_mode = mode.value & ~0x0040 & ~0x0020
        kernel32.SetConsoleMode(handle, new_mode)
        print("✅ Quick Edit Mode desactivado (no más pausas al hacer clic)")
    except Exception as e:
        print(f"⚠️  No se pudo desactivar Quick Edit Mode: {e}")

# Archivos de persistencia
USERS_FILE = 'chat_users.json'
MESSAGES_FILE = 'chat_messages.json'
SESSIONS_FILE = 'chat_sessions.json'
GROUPS_FILE = 'chat_groups.json'

# Usuario administrador inicial (se migra automáticamente al campo isAdmin en users_db)
INITIAL_ADMIN_USERNAME = 'arendon98'

def is_admin(username):
    """Verificar si un usuario tiene rol de administrador"""
    user = users_db.get(username)
    if not user:
        return False
    # Soporte para el admin inicial hardcodeado si aún no se migró
    return user.get('isAdmin', False) or username == INITIAL_ADMIN_USERNAME

# Almacenamiento en memoria
users_db = {}
messages_db = {}
sessions = {}    # token -> username
groups_db = {}   # groupId -> {id, name, description, members, createdAt, createdBy}
active_users = {}  # userId -> {name, lastSeen, token}
data_lock = Lock()
import random, string

def load_data():
    """Cargar datos desde archivos JSON"""
    global users_db, messages_db, sessions, groups_db
    
    # Cargar usuarios
    if os.path.exists(USERS_FILE):
        try:
            with open(USERS_FILE, 'r', encoding='utf-8') as f:
                users_db = json.load(f)
            print(f"✅ Cargados {len(users_db)} usuarios desde {USERS_FILE}")
        except Exception as e:
            print(f"⚠️  Error cargando usuarios: {e}")
            users_db = {}
    else:
        users_db = {}
        print("ℹ️  No se encontró archivo de usuarios, creando nuevo...")
    
    # Migrar: asegurar que el admin inicial tenga el campo isAdmin
    if INITIAL_ADMIN_USERNAME in users_db and not users_db[INITIAL_ADMIN_USERNAME].get('isAdmin'):
        users_db[INITIAL_ADMIN_USERNAME]['isAdmin'] = True
        save_users()
        print(f"✅ Admin inicial migrado: {INITIAL_ADMIN_USERNAME}")

    # Cargar mensajes
    if os.path.exists(MESSAGES_FILE):
        try:
            with open(MESSAGES_FILE, 'r', encoding='utf-8') as f:
                messages_db = json.load(f)
            print(f"✅ Cargados mensajes desde {MESSAGES_FILE}")
            # Migrar: asegurar que todos los mensajes tengan campo 'id'
            migrated = False
            for chat_key, msgs in messages_db.items():
                for msg in msgs:
                    if 'id' not in msg:
                        msg['id'] = f"{int(msg.get('timestamp', int(time.time() * 1000)))}_{''.join(random.choices(string.ascii_lowercase + string.digits, k=9))}"
                        migrated = True
            if migrated:
                save_messages()
                print("✅ Migración completada: IDs asignados a mensajes antiguos")
        except Exception as e:
            print(f"⚠️  Error cargando mensajes: {e}")
            messages_db = {}
    else:
        messages_db = {}
        print("ℹ️  No se encontró archivo de mensajes, creando nuevo...")

    # Cargar sesiones
    if os.path.exists(SESSIONS_FILE):
        try:
            with open(SESSIONS_FILE, 'r', encoding='utf-8') as f:
                sessions = json.load(f)
            print(f"✅ Cargadas {len(sessions)} sesiones desde {SESSIONS_FILE}")
        except Exception as e:
            print(f"⚠️  Error cargando sesiones: {e}")
            sessions = {}
    else:
        sessions = {}
        print("ℹ️  No se encontró archivo de sesiones, creando nuevo...")

    # Restaurar active_users desde sesiones guardadas (sobrevive reinicios del servidor)
    global active_users
    active_users = {}
    for token, username in sessions.items():
        if username in users_db and username not in active_users:
            active_users[username] = {
                'username': username,
                'displayName': users_db[username]['displayName'],
                'lastSeen': time.time() - 60,  # marcado como ausente hasta que el cliente haga ping
                'token': token,
                'status': 'away'
            }
    print(f"✅ Restaurados {len(active_users)} usuarios activos desde sesiones")

    # Cargar grupos
    if os.path.exists(GROUPS_FILE):
        try:
            with open(GROUPS_FILE, 'r', encoding='utf-8') as f:
                groups_db = json.load(f)
            print(f"✅ Cargados {len(groups_db)} grupos desde {GROUPS_FILE}")
        except Exception as e:
            print(f"⚠️  Error cargando grupos: {e}")
            groups_db = {}
    else:
        groups_db = {}
        print("ℹ️  No se encontró archivo de grupos, creando nuevo...")

def save_users():
    """Guardar usuarios en archivo JSON"""
    try:
        with open(USERS_FILE, 'w', encoding='utf-8') as f:
            json.dump(users_db, f, indent=2, ensure_ascii=False)
        return True
    except Exception as e:
        print(f"❌ Error guardando usuarios: {e}")
        return False

def save_messages():
    """Guardar mensajes en archivo JSON"""
    try:
        with open(MESSAGES_FILE, 'w', encoding='utf-8') as f:
            json.dump(messages_db, f, indent=2, ensure_ascii=False)
        return True
    except Exception as e:
        print(f"❌ Error guardando mensajes: {e}")
        return False

def save_sessions():
    """Guardar sesiones en archivo JSON"""
    try:
        with open(SESSIONS_FILE, 'w', encoding='utf-8') as f:
            json.dump(sessions, f, indent=2, ensure_ascii=False)
        return True
    except Exception as e:
        print(f"❌ Error guardando sesiones: {e}")
        return False

def save_groups():
    """Guardar grupos en archivo JSON"""
    try:
        with open(GROUPS_FILE, 'w', encoding='utf-8') as f:
            json.dump(groups_db, f, indent=2, ensure_ascii=False)
        return True
    except Exception as e:
        print(f"❌ Error guardando grupos: {e}")
        return False

def add_user_to_all_groups(username):
    """Agregar usuario a todos los grupos existentes (se llama al crear/registrar usuario)"""
    for group in groups_db.values():
        if username not in group.get('members', []):
            group['members'].append(username)
    save_groups()

def hash_password(password):
    """Crear hash SHA-256 de la contraseña"""
    return hashlib.sha256(password.encode('utf-8')).hexdigest()

def generate_token():
    """Generar token de sesión único"""
    return secrets.token_urlsafe(32)

class ChatHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

    def _set_headers(self, content_type='application/json', status=200):
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        self.end_headers()

    def do_OPTIONS(self):
        self._set_headers()

    def do_GET(self):
        parsed_path = urlparse(self.path)
        
        if parsed_path.path == '/' or parsed_path.path == '/index.html':
            self._serve_html()
        elif parsed_path.path == '/favicon.ico':
            self.send_response(204)
            self.end_headers()
        elif parsed_path.path == '/chat_client_auth.js':
            self._serve_js()
        elif parsed_path.path == '/api/verify':
            self._verify_token()
        elif parsed_path.path == '/api/users':
            self._get_users()
        elif parsed_path.path.startswith('/api/messages'):
            self._get_messages(parsed_path)
        elif parsed_path.path == '/api/admin/users':
            self._admin_get_users()
        elif parsed_path.path == '/api/admin/groups':
            self._admin_get_all_groups()
        elif parsed_path.path == '/api/contacts':
            self._get_contacts()
        elif parsed_path.path == '/api/groups':
            self._get_groups()
        elif parsed_path.path.startswith('/api/groups/') and parsed_path.path.endswith('/messages'):
            self._get_group_messages(parsed_path)
        else:
            self.send_error(404)

    def do_POST(self):
        parsed_path = urlparse(self.path)
        
        if parsed_path.path == '/api/register':
            self._register()
        elif parsed_path.path == '/api/change-password':
            self._change_own_password()
        elif parsed_path.path == '/api/login':
            self._login()
        elif parsed_path.path == '/api/logout':
            self._logout()
        elif parsed_path.path == '/api/presence':
            self._update_presence()
        elif parsed_path.path == '/api/send':
            self._send_message()
        elif parsed_path.path.startswith('/api/delete/'):
            self._delete_chat(parsed_path)
        elif parsed_path.path == '/api/verify':
            self._verify_token()
        elif parsed_path.path == '/api/admin/create-user':
            self._admin_create_user()
        elif parsed_path.path == '/api/admin/change-password':
            self._admin_change_password()
        elif parsed_path.path == '/api/admin/update-displayname':
            self._admin_update_displayname()
        elif parsed_path.path == '/api/admin/delete-user':
            self._admin_delete_user()
        elif parsed_path.path == '/api/admin/groups/create':
            self._admin_create_group()
        elif parsed_path.path == '/api/admin/groups/add-member':
            self._admin_add_group_member()
        elif parsed_path.path == '/api/admin/groups/remove-member':
            self._admin_remove_group_member()
        elif parsed_path.path == '/api/admin/groups/delete':
            self._admin_delete_group()
        elif parsed_path.path == '/api/admin/groups/rename':
            self._admin_rename_group()
        elif parsed_path.path == '/api/admin/groups/update-description':
            self._admin_update_group_description()
        elif parsed_path.path == '/api/admin/groups/add-all':
            self._admin_add_all_to_group()
        elif parsed_path.path == '/api/admin/update-area':
            self._admin_update_area()
        elif parsed_path.path == '/api/admin/set-admin':
            self._admin_set_admin()
        elif parsed_path.path.startswith('/api/groups/') and parsed_path.path.endswith('/send'):
            self._send_group_message(parsed_path)
        elif parsed_path.path.startswith('/api/messages/') and parsed_path.path.endswith('/read'):
            self._mark_messages_read(parsed_path)
        elif parsed_path.path == '/api/react':
            self._react_to_message()
        else:
            self.send_error(404)

    def _serve_html(self):
        self.send_response(200)
        self.send_header('Content-type', 'text/html; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        
        try:
            with open('chat_client_auth.html', 'r', encoding='utf-8') as f:
                html_content = f.read()
            self.wfile.write(html_content.encode('utf-8'))
        except FileNotFoundError:
            self.wfile.write(b'<html><body><h1>Error: chat_client_auth.html not found</h1></body></html>')

    def _serve_js(self):
        self.send_response(200)
        self.send_header('Content-type', 'application/javascript; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        
        try:
            with open('chat_client_auth.js', 'r', encoding='utf-8') as f:
                js_content = f.read()
            self.wfile.write(js_content.encode('utf-8'))
        except FileNotFoundError:
            self.wfile.write(b'console.error("chat_client_auth.js not found");')

    def _register(self):
        """Registrar nuevo usuario"""
        try:
            content_length = int(self.headers['Content-Length'])
            post_data = json.loads(self.rfile.read(content_length))
            
            username = post_data.get('username', '').strip()
            password = post_data.get('password', '').strip()
            display_name = post_data.get('displayName', '').strip()
            
            # Validaciones
            if not username or not password:
                self._set_headers(status=400)
                self.wfile.write(json.dumps({
                    'error': 'Usuario y contraseña son requeridos'
                }).encode())
                return
            
            if len(username) < 3:
                self._set_headers(status=400)
                self.wfile.write(json.dumps({
                    'error': 'El usuario debe tener al menos 3 caracteres'
                }).encode())
                return
            
            if len(password) < 4:
                self._set_headers(status=400)
                self.wfile.write(json.dumps({
                    'error': 'La contraseña debe tener al menos 4 caracteres'
                }).encode())
                return
            
            with data_lock:
                # Verificar si el usuario ya existe
                if username in users_db:
                    self._set_headers(status=400)
                    self.wfile.write(json.dumps({
                        'error': 'El usuario ya existe'
                    }).encode())
                    return
                
                # Crear nuevo usuario
                users_db[username] = {
                    'username': username,
                    'password': hash_password(password),
                    'displayName': display_name if display_name else username,
                    'area': '',
                    'createdAt': time.time()
                }
                save_users()
            
            print(f"✅ Nuevo usuario registrado: {username}")
            
            self._set_headers()
            self.wfile.write(json.dumps({
                'success': True,
                'message': 'Usuario registrado exitosamente'
            }).encode())
            
        except Exception as e:
            print(f"❌ Error en registro: {e}")
            self._set_headers(status=500)
            self.wfile.write(json.dumps({'error': 'Error interno del servidor'}).encode())

    def _login(self):
        """Iniciar sesión"""
        try:
            content_length = int(self.headers['Content-Length'])
            post_data = json.loads(self.rfile.read(content_length))
            
            username = post_data.get('username', '').strip()
            password = post_data.get('password', '').strip()
            
            with data_lock:
                # Verificar credenciales
                if username not in users_db:
                    self._set_headers(status=401)
                    self.wfile.write(json.dumps({
                        'error': 'Usuario o contraseña incorrectos'
                    }).encode())
                    return
                
                user = users_db[username]
                if user['password'] != hash_password(password):
                    self._set_headers(status=401)
                    self.wfile.write(json.dumps({
                        'error': 'Usuario o contraseña incorrectos'
                    }).encode())
                    return
                
                # Generar token de sesión
                token = generate_token()
                sessions[token] = username
                save_sessions()
                
                # Marcar usuario como activo
                active_users[username] = {
                    'username': username,
                    'displayName': user['displayName'],
                    'lastSeen': time.time(),
                    'token': token,
                    'status': 'available'   # available | away | busy | dnd | invisible
                }
            
            print(f"✅ Usuario autenticado: {username}")
            
            self._set_headers()
            self.wfile.write(json.dumps({
                'success': True,
                'token': token,
                'username': username,
                'displayName': user['displayName'],
                'isAdmin': is_admin(username)
            }).encode())
            
        except Exception as e:
            print(f"❌ Error en login: {e}")
            self._set_headers(status=500)
            self.wfile.write(json.dumps({'error': 'Error interno del servidor'}).encode())

    def _logout(self):
        """Cerrar sesión"""
        try:
            content_length = int(self.headers['Content-Length'])
            post_data = json.loads(self.rfile.read(content_length))
            
            token = post_data.get('token')
            
            with data_lock:
                if token in sessions:
                    username = sessions[token]
                    del sessions[token]
                    if username in active_users:
                        del active_users[username]
                    save_sessions()
                    print(f"✅ Usuario desconectado: {username}")
            
            self._set_headers()
            self.wfile.write(json.dumps({'success': True}).encode())
            
        except Exception as e:
            print(f"❌ Error en logout: {e}")
            self._set_headers(status=500)
            self.wfile.write(json.dumps({'error': 'Error interno del servidor'}).encode())

    def _verify_token(self):
        """Verificar si un token es válido"""
        try:
            # Obtener token del header Authorization
            auth_header = self.headers.get('Authorization', '')
            token = auth_header.replace('Bearer ', '') if auth_header.startswith('Bearer ') else None
            
            if not token:
                self._set_headers(status=401)
                self.wfile.write(json.dumps({'success': False, 'error': 'No token provided'}).encode())
                return
            
            with data_lock:
                if token in sessions:
                    username = sessions[token]
                    user = users_db.get(username)
                    if user:
                        self._set_headers()
                        self.wfile.write(json.dumps({
                            'success': True,
                            'username': username,
                            'displayName': user['displayName'],
                            'isAdmin': is_admin(username)
                        }).encode())
                        return
            
            self._set_headers(status=401)
            self.wfile.write(json.dumps({'success': False}).encode())
            
        except Exception as e:
            print(f"❌ Error verificando token: {e}")
            self._set_headers(status=500)
            self.wfile.write(json.dumps({'success': False, 'error': 'Error interno del servidor'}).encode())

    def _update_presence(self):
        """Actualizar presencia del usuario"""
        try:
            auth_header = self.headers.get('Authorization', '')
            token = auth_header.replace('Bearer ', '') if auth_header.startswith('Bearer ') else None
            
            if not token:
                self._set_headers(status=401)
                self.wfile.write(json.dumps({'error': 'No token provided'}).encode())
                return

            # Leer body para obtener el status opcional
            new_status = 'available'
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                if content_length > 0:
                    body = json.loads(self.rfile.read(content_length))
                    raw = body.get('status', 'available')
                    if raw in ('available', 'away', 'busy', 'dnd', 'invisible'):
                        new_status = raw
            except Exception:
                pass

            with data_lock:
                if token in sessions:
                    username = sessions[token]
                    if username in users_db:
                        prev = active_users.get(username, {})
                        active_users[username] = {
                            'username': username,
                            'displayName': users_db[username]['displayName'],
                            'lastSeen': time.time(),
                            'token': token,
                            'status': new_status
                        }
            
            self._set_headers()
            self.wfile.write(json.dumps({'status': 'ok'}).encode())
            
        except Exception as e:
            print(f"❌ Error actualizando presencia: {e}")
            self._set_headers(status=500)
            self.wfile.write(json.dumps({'error': 'Error interno del servidor'}).encode())

    def _get_users(self):
        """Obtener lista de usuarios activos — basado en sesiones activas, no en timeout de ping"""
        try:
            # Usuarios con sesion activa (token valido guardado)
            users_with_session = set(sessions.values())
            now = time.time()
            with data_lock:
                users_list = []
                for username in users_with_session:
                    user = users_db.get(username)
                    if not user:
                        continue
                    au = active_users.get(username)
                    # Excluir invisibles
                    if au and au.get('status') == 'invisible':
                        continue
                    users_list.append({
                        'username': user['username'],
                        'displayName': user['displayName'],
                        'area': user.get('area', '')
                    })

            self._set_headers()
            self.wfile.write(json.dumps({'success': True, 'users': users_list}).encode())
            
        except Exception as e:
            print(f"❌ Error obteniendo usuarios: {e}")
            self._set_headers(status=500)
            self.wfile.write(json.dumps({'success': False, 'error': 'Error interno del servidor'}).encode())

    def _get_contacts(self):
        """Obtener todos los usuarios registrados con su estado online/offline"""
        try:
            auth_header = self.headers.get('Authorization', '')
            token = auth_header.replace('Bearer ', '') if auth_header.startswith('Bearer ') else None

            if not token or token not in sessions:
                self._set_headers(status=401)
                self.wfile.write(json.dumps({'success': False, 'error': 'No autorizado'}).encode())
                return

            current_username = sessions[token]
            now = time.time()

            # Usuarios con sesion activa (cualquier token valido guardado)
            users_with_session = set(sessions.values())

            with data_lock:
                contacts_list = []
                for user in users_db.values():
                    uname = user['username']
                    if uname == current_username:
                        continue

                    au = active_users.get(uname)
                    has_session = uname in users_with_session

                    # ONLINE = tiene sesion activa. Solo se desconecta con logout explicito.
                    if not has_session:
                        user_status = 'offline'
                    elif au and au.get('status') == 'invisible':
                        user_status = 'offline'
                    elif au:
                        declared = au.get('status', 'available')
                        # Si dijo 'available' pero no ha hecho ping en mas de 5 min -> mostrar como away
                        if declared == 'available' and (now - au['lastSeen']) > 300:
                            user_status = 'away'
                        else:
                            user_status = declared
                    else:
                        # Tiene sesion pero no ha hecho ping aun (recien restaurado)
                        user_status = 'away'

                    contacts_list.append({
                        'username': uname,
                        'displayName': user['displayName'],
                        'area': user.get('area', ''),
                        'online': user_status != 'offline',
                        'status': user_status
                    })

            # Ordenar: disponible > ocupado/dnd > ausente > offline
            STATUS_ORDER = {'available': 0, 'busy': 1, 'dnd': 1, 'away': 2, 'offline': 3}
            contacts_list.sort(key=lambda u: (STATUS_ORDER.get(u['status'], 3), u['displayName'].lower()))

            self._set_headers()
            self.wfile.write(json.dumps({'success': True, 'contacts': contacts_list}).encode())

        except Exception as e:
            print(f"❌ Error obteniendo contactos: {e}")
            self._set_headers(status=500)
            self.wfile.write(json.dumps({'success': False, 'error': 'Error interno del servidor'}).encode())

    def _get_messages(self, parsed_path):
        """Obtener mensajes de un chat"""
        try:
            # Extraer username del path: /api/messages/username
            path_parts = parsed_path.path.split('/')
            if len(path_parts) >= 4:
                other_username = path_parts[3]
                
                # Obtener el username del usuario actual desde el token
                auth_header = self.headers.get('Authorization', '')
                token = auth_header.replace('Bearer ', '') if auth_header.startswith('Bearer ') else None
                
                if not token or token not in sessions:
                    self._set_headers(status=401)
                    self.wfile.write(json.dumps({'success': False, 'error': 'No autorizado'}).encode())
                    return
                
                current_username = sessions[token]
                
                # Crear la clave del chat (ordenada alfabéticamente)
                chat_key = '_'.join(sorted([current_username, other_username]))
                
                with data_lock:
                    chat_messages = messages_db.get(chat_key, [])
                
                self._set_headers()
                self.wfile.write(json.dumps({'success': True, 'messages': chat_messages}).encode())
            else:
                self._set_headers(status=400)
                self.wfile.write(json.dumps({'success': False, 'error': 'Username requerido'}).encode())
            
        except Exception as e:
            print(f"❌ Error obteniendo mensajes: {e}")
            self._set_headers(status=500)
            self.wfile.write(json.dumps({'success': False, 'error': 'Error interno del servidor'}).encode())

    def _send_message(self):
        """Enviar mensaje"""
        try:
            content_length = int(self.headers['Content-Length'])
            post_data = json.loads(self.rfile.read(content_length))
            
            # Obtener token del header Authorization
            auth_header = self.headers.get('Authorization', '')
            token = auth_header.replace('Bearer ', '') if auth_header.startswith('Bearer ') else None
            
            if not token or token not in sessions:
                self._set_headers(status=401)
                self.wfile.write(json.dumps({'success': False, 'error': 'No autorizado'}).encode())
                return
            
            current_username = sessions[token]
            to_username = post_data.get('to')
            text = post_data.get('text', '')
            file = post_data.get('file')
            
            if not to_username:
                self._set_headers(status=400)
                self.wfile.write(json.dumps({'success': False, 'error': 'Destinatario requerido'}).encode())
                return
            
            # Crear la clave del chat (ordenada alfabéticamente)
            chat_key = '_'.join(sorted([current_username, to_username]))
            
            # Crear el mensaje
            msg_id = f"{int(time.time() * 1000)}_{''.join(random.choices(string.ascii_lowercase + string.digits, k=9))}"
            
            reply_to = post_data.get('replyTo')
            message = {
                'id': msg_id,
                'username': current_username,
                'displayName': users_db[current_username]['displayName'],
                'text': text,
                'file': file,
                'replyTo': reply_to,
                'timestamp': int(time.time() * 1000),
                'readAt': None   # None = no leído, timestamp = leído
            }
            
            with data_lock:
                if chat_key not in messages_db:
                    messages_db[chat_key] = []
                messages_db[chat_key].append(message)
                save_messages()
            
            print(f"✅ Mensaje enviado de {current_username} a {to_username}")
            
            self._set_headers()
            self.wfile.write(json.dumps({'success': True, 'message': message}).encode())
            
        except Exception as e:
            print(f"❌ Error enviando mensaje: {e}")
            import traceback
            traceback.print_exc()
            self._set_headers(status=500)
            self.wfile.write(json.dumps({'success': False, 'error': 'Error interno del servidor'}).encode())

    def _mark_messages_read(self, parsed_path):
        """Marcar como leídos los mensajes del otro usuario en esta conversación.
        Ruta: POST /api/messages/{username}/read
        El token identifica al lector; {username} es quien envió los mensajes.
        """
        try:
            # Autenticación
            auth_header = self.headers.get('Authorization', '')
            token = auth_header.replace('Bearer ', '') if auth_header.startswith('Bearer ') else None
            if not token or token not in sessions:
                self._set_headers(status=401)
                self.wfile.write(json.dumps({'success': False, 'error': 'No autorizado'}).encode())
                return

            current_username = sessions[token]

            # Extraer el otro usuario del path: /api/messages/{username}/read
            parts = parsed_path.path.split('/')
            # parts = ['', 'api', 'messages', '{username}', 'read']
            if len(parts) < 5:
                self._set_headers(status=400)
                self.wfile.write(json.dumps({'success': False, 'error': 'Username requerido'}).encode())
                return

            sender_username = parts[3]
            chat_key = '_'.join(sorted([current_username, sender_username]))
            now_ts = int(time.time() * 1000)
            updated = 0

            with data_lock:
                for msg in messages_db.get(chat_key, []):
                    # Solo marcar mensajes enviados por el otro usuario que aún no tienen readAt
                    if msg.get('username') == sender_username and msg.get('readAt') is None:
                        msg['readAt'] = now_ts
                        updated += 1
                if updated > 0:
                    save_messages()

            self._set_headers()
            self.wfile.write(json.dumps({'success': True, 'updated': updated}).encode())

        except Exception as e:
            print(f"❌ Error _mark_messages_read: {e}")
            self._set_headers(status=500)
            self.wfile.write(json.dumps({'success': False, 'error': 'Error interno'}).encode())

    def _react_to_message(self):
        """Agregar o quitar reacción a un mensaje: POST /api/react
        Body: { chatKey: string, msgId: string, emoji: string }
        chatKey puede ser un chat privado (user1_user2) o un grupo (GROUP_id)
        Si el usuario ya reaccionó con ese emoji, se quita (toggle).
        """
        try:
            auth_header = self.headers.get('Authorization', '')
            token = auth_header.replace('Bearer ', '') if auth_header.startswith('Bearer ') else None
            if not token or token not in sessions:
                self._set_headers(status=401)
                self.wfile.write(json.dumps({'success': False, 'error': 'No autorizado'}).encode())
                return

            username = sessions[token]
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = json.loads(self.rfile.read(content_length).decode('utf-8')) if content_length > 0 else {}

            chat_key = post_data.get('chatKey', '')
            msg_id = post_data.get('msgId', '')
            emoji = post_data.get('emoji', '')

            if not chat_key or not msg_id or not emoji:
                self._set_headers(status=400)
                self.wfile.write(json.dumps({'success': False, 'error': 'chatKey, msgId y emoji son requeridos'}).encode())
                return

            with data_lock:
                msgs = messages_db.get(chat_key, [])
                target = None
                for m in msgs:
                    if m.get('id') == msg_id:
                        target = m
                        break

                if not target:
                    self._set_headers(status=404)
                    self.wfile.write(json.dumps({'success': False, 'error': 'Mensaje no encontrado'}).encode())
                    return

                # Inicializar reactions si no existe
                if 'reactions' not in target:
                    target['reactions'] = {}

                # Toggle: si el usuario ya tiene ese emoji, quitarlo; si no, ponerlo
                current = target['reactions'].get(emoji, [])
                if username in current:
                    current.remove(username)
                    if not current:
                        del target['reactions'][emoji]
                    else:
                        target['reactions'][emoji] = current
                    action = 'removed'
                else:
                    target['reactions'][emoji] = current + [username]
                    action = 'added'

                # Limpiar dict vacío
                if not target['reactions']:
                    del target['reactions']

                save_messages()

            self._set_headers()
            self.wfile.write(json.dumps({
                'success': True,
                'action': action,
                'reactions': target.get('reactions', {})
            }).encode())

        except Exception as e:
            print(f"❌ Error _react_to_message: {e}")
            self._set_headers(status=500)
            self.wfile.write(json.dumps({'success': False, 'error': 'Error interno'}).encode())

    def _delete_chat(self, parsed_path):
        """Eliminar conversación"""
        try:
            # Extraer username del path: /api/delete/username
            path_parts = parsed_path.path.split('/')
            if len(path_parts) >= 4:
                other_username = path_parts[3]
                
                # Obtener el username del usuario actual desde el token
                auth_header = self.headers.get('Authorization', '')
                token = auth_header.replace('Bearer ', '') if auth_header.startswith('Bearer ') else None
                
                if not token or token not in sessions:
                    self._set_headers(status=401)
                    self.wfile.write(json.dumps({'success': False, 'error': 'No autorizado'}).encode())
                    return
                
                current_username = sessions[token]
                
                # Crear la clave del chat (ordenada alfabéticamente)
                chat_key = '_'.join(sorted([current_username, other_username]))
                
                with data_lock:
                    if chat_key in messages_db:
                        del messages_db[chat_key]
                        save_messages()
                        print(f"✅ Conversación eliminada: {chat_key}")
                
                self._set_headers()
                self.wfile.write(json.dumps({'success': True}).encode())
            else:
                self._set_headers(status=400)
                self.wfile.write(json.dumps({'success': False, 'error': 'Username requerido'}).encode())
            
        except Exception as e:
            print(f"❌ Error eliminando chat: {e}")
            self._set_headers(status=500)
            self.wfile.write(json.dumps({'success': False, 'error': 'Error interno del servidor'}).encode())

    # =============================================
    # CAMBIO DE CONTRASEÑA (PROPIO USUARIO)
    # =============================================

    def _change_own_password(self):
        """Permite a cualquier usuario autenticado cambiar su propia contraseña"""
        try:
            auth_header = self.headers.get('Authorization', '')
            token = auth_header.replace('Bearer ', '') if auth_header.startswith('Bearer ') else None

            if not token or token not in sessions:
                self._set_headers(status=401)
                self.wfile.write(json.dumps({'success': False, 'error': 'No autorizado'}).encode())
                return

            username = sessions[token]

            content_length = int(self.headers['Content-Length'])
            post_data = json.loads(self.rfile.read(content_length))

            current_password = post_data.get('currentPassword', '').strip()
            new_password     = post_data.get('newPassword', '').strip()

            if not current_password or not new_password:
                self._set_headers(status=400)
                self.wfile.write(json.dumps({'success': False, 'error': 'Contraseña actual y nueva son requeridas'}).encode())
                return

            if len(new_password) < 4:
                self._set_headers(status=400)
                self.wfile.write(json.dumps({'success': False, 'error': 'La nueva contraseña debe tener al menos 4 caracteres'}).encode())
                return

            with data_lock:
                user = users_db.get(username)
                if not user:
                    self._set_headers(status=404)
                    self.wfile.write(json.dumps({'success': False, 'error': 'Usuario no encontrado'}).encode())
                    return

                if user['password'] != hash_password(current_password):
                    self._set_headers(status=400)
                    self.wfile.write(json.dumps({'success': False, 'error': 'La contraseña actual es incorrecta'}).encode())
                    return

                if hash_password(new_password) == user['password']:
                    self._set_headers(status=400)
                    self.wfile.write(json.dumps({'success': False, 'error': 'La nueva contraseña debe ser diferente a la actual'}).encode())
                    return

                users_db[username]['password'] = hash_password(new_password)
                save_users()

            print(f"✅ [{username}] Contraseña actualizada correctamente")
            self._set_headers()
            self.wfile.write(json.dumps({'success': True, 'message': 'Contraseña actualizada correctamente'}).encode())

        except Exception as e:
            print(f"❌ Error change_own_password: {e}")
            self._set_headers(status=500)
            self.wfile.write(json.dumps({'success': False, 'error': 'Error interno del servidor'}).encode())

    # =============================================
    # MÉTODOS DE ADMINISTRACIÓN
    # =============================================

    def _get_admin_token(self):
        """Extraer y validar token de admin del header"""
        auth_header = self.headers.get('Authorization', '')
        token = auth_header.replace('Bearer ', '') if auth_header.startswith('Bearer ') else None
        if not token or token not in sessions:
            return None
        username = sessions[token]
        if not is_admin(username):
            return None
        return username

    def _admin_get_users(self):
        """Obtener todos los usuarios registrados (solo admin)"""
        try:
            if not self._get_admin_token():
                self._set_headers(status=403)
                self.wfile.write(json.dumps({'success': False, 'error': 'Acceso denegado'}).encode())
                return

            with data_lock:
                users_list = [
                    {
                        'username': u['username'],
                        'displayName': u['displayName'],
                        'area': u.get('area', ''),
                        'createdAt': u.get('createdAt', 0),
                        'isAdmin': is_admin(u['username'])
                    }
                    for u in users_db.values()
                ]

            self._set_headers()
            self.wfile.write(json.dumps({'success': True, 'users': users_list}).encode())

        except Exception as e:
            print(f"❌ Error admin_get_users: {e}")
            self._set_headers(status=500)
            self.wfile.write(json.dumps({'success': False, 'error': 'Error interno del servidor'}).encode())

    def _admin_get_all_groups(self):
        """Obtener TODOS los grupos (solo admin, sin filtrar por membresía)"""
        try:
            if not self._get_admin_token():
                self._set_headers(status=403)
                self.wfile.write(json.dumps({'success': False, 'error': 'Acceso denegado'}).encode())
                return

            with data_lock:
                all_groups = [
                    {
                        'id': g['id'],
                        'name': g['name'],
                        'description': g.get('description', ''),
                        'members': g.get('members', []),
                        'memberCount': len(g.get('members', [])),
                        'createdBy': g.get('createdBy', ''),
                        'createdAt': g.get('createdAt', 0)
                    }
                    for g in groups_db.values()
                ]

            all_groups.sort(key=lambda g: g['name'].lower())
            self._set_headers()
            self.wfile.write(json.dumps({'success': True, 'groups': all_groups}).encode())

        except Exception as e:
            print(f"❌ Error admin_get_all_groups: {e}")
            self._set_headers(status=500)
            self.wfile.write(json.dumps({'success': False, 'error': 'Error interno del servidor'}).encode())

    def _admin_create_user(self):
        """Crear usuario desde el panel admin (sin necesidad de registro)"""
        try:
            if not self._get_admin_token():
                self._set_headers(status=403)
                self.wfile.write(json.dumps({'success': False, 'error': 'Acceso denegado'}).encode())
                return

            content_length = int(self.headers['Content-Length'])
            post_data = json.loads(self.rfile.read(content_length))

            username = post_data.get('username', '').strip()
            password = post_data.get('password', '').strip()
            display_name = post_data.get('displayName', '').strip()
            area = post_data.get('area', '').strip()

            if not username or not password:
                self._set_headers(status=400)
                self.wfile.write(json.dumps({'success': False, 'error': 'Usuario y contraseña son requeridos'}).encode())
                return

            if len(username) < 3:
                self._set_headers(status=400)
                self.wfile.write(json.dumps({'success': False, 'error': 'El usuario debe tener al menos 3 caracteres'}).encode())
                return

            if len(password) < 4:
                self._set_headers(status=400)
                self.wfile.write(json.dumps({'success': False, 'error': 'La contraseña debe tener al menos 4 caracteres'}).encode())
                return

            with data_lock:
                if username in users_db:
                    self._set_headers(status=400)
                    self.wfile.write(json.dumps({'success': False, 'error': 'El usuario ya existe'}).encode())
                    return

                users_db[username] = {
                    'username': username,
                    'password': hash_password(password),
                    'displayName': display_name if display_name else username,
                    'area': area,
                    'createdAt': time.time()
                }
                save_users()

            print(f"✅ [ADMIN] Usuario creado: {username}")
            self._set_headers()
            self.wfile.write(json.dumps({'success': True, 'message': f'Usuario {username} creado exitosamente'}).encode())

        except Exception as e:
            print(f"❌ Error admin_create_user: {e}")
            self._set_headers(status=500)
            self.wfile.write(json.dumps({'success': False, 'error': 'Error interno del servidor'}).encode())

    def _admin_change_password(self):
        """Cambiar contraseña de cualquier usuario (solo admin)"""
        try:
            if not self._get_admin_token():
                self._set_headers(status=403)
                self.wfile.write(json.dumps({'success': False, 'error': 'Acceso denegado'}).encode())
                return

            content_length = int(self.headers['Content-Length'])
            post_data = json.loads(self.rfile.read(content_length))

            username = post_data.get('username', '').strip()
            new_password = post_data.get('newPassword', '').strip()

            if not username or not new_password:
                self._set_headers(status=400)
                self.wfile.write(json.dumps({'success': False, 'error': 'Usuario y nueva contraseña son requeridos'}).encode())
                return

            if len(new_password) < 4:
                self._set_headers(status=400)
                self.wfile.write(json.dumps({'success': False, 'error': 'La contraseña debe tener al menos 4 caracteres'}).encode())
                return

            with data_lock:
                if username not in users_db:
                    self._set_headers(status=404)
                    self.wfile.write(json.dumps({'success': False, 'error': 'Usuario no encontrado'}).encode())
                    return

                users_db[username]['password'] = hash_password(new_password)
                save_users()

            print(f"✅ [ADMIN] Contraseña cambiada para: {username}")
            self._set_headers()
            self.wfile.write(json.dumps({'success': True, 'message': f'Contraseña de {username} actualizada'}).encode())

        except Exception as e:
            print(f"❌ Error admin_change_password: {e}")
            self._set_headers(status=500)
            self.wfile.write(json.dumps({'success': False, 'error': 'Error interno del servidor'}).encode())

    def _admin_update_displayname(self):
        """Actualizar nombre de display de un usuario (solo admin)"""
        try:
            if not self._get_admin_token():
                self._set_headers(status=403)
                self.wfile.write(json.dumps({'success': False, 'error': 'Acceso denegado'}).encode())
                return

            content_length = int(self.headers['Content-Length'])
            post_data = json.loads(self.rfile.read(content_length))

            username = post_data.get('username', '').strip()
            new_name = post_data.get('displayName', '').strip()

            if not username or not new_name:
                self._set_headers(status=400)
                self.wfile.write(json.dumps({'success': False, 'error': 'Usuario y nombre son requeridos'}).encode())
                return

            if len(new_name) < 2:
                self._set_headers(status=400)
                self.wfile.write(json.dumps({'success': False, 'error': 'El nombre debe tener al menos 2 caracteres'}).encode())
                return

            with data_lock:
                if username not in users_db:
                    self._set_headers(status=404)
                    self.wfile.write(json.dumps({'success': False, 'error': 'Usuario no encontrado'}).encode())
                    return

                users_db[username]['displayName'] = new_name
                save_users()

            print(f"✅ [ADMIN] Nombre actualizado para {username}: {new_name}")
            self._set_headers()
            self.wfile.write(json.dumps({'success': True, 'message': f'Nombre de {username} actualizado', 'displayName': new_name}).encode())

        except Exception as e:
            print(f"❌ Error admin_update_displayname: {e}")
            self._set_headers(status=500)
            self.wfile.write(json.dumps({'success': False, 'error': 'Error interno del servidor'}).encode())

    def _admin_delete_user(self):
        """Eliminar un usuario (solo admin, no puede eliminar a otro admin)"""
        try:
            requester = self._get_admin_token()
            if not requester:
                self._set_headers(status=403)
                self.wfile.write(json.dumps({'success': False, 'error': 'Acceso denegado'}).encode())
                return

            content_length = int(self.headers['Content-Length'])
            post_data = json.loads(self.rfile.read(content_length))
            username = post_data.get('username', '').strip()

            if not username:
                self._set_headers(status=400)
                self.wfile.write(json.dumps({'success': False, 'error': 'Usuario requerido'}).encode())
                return

            if is_admin(username) and username != requester:
                self._set_headers(status=400)
                self.wfile.write(json.dumps({'success': False, 'error': 'No puedes eliminar a otro administrador'}).encode())
                return

            with data_lock:
                if username not in users_db:
                    self._set_headers(status=404)
                    self.wfile.write(json.dumps({'success': False, 'error': 'Usuario no encontrado'}).encode())
                    return

                del users_db[username]
                # Eliminar sesiones activas del usuario
                tokens_to_delete = [t for t, u in sessions.items() if u == username]
                for t in tokens_to_delete:
                    del sessions[t]
                if username in active_users:
                    del active_users[username]
                save_users()
                save_sessions()

            print(f"✅ [ADMIN] Usuario eliminado: {username}")
            self._set_headers()
            self.wfile.write(json.dumps({'success': True, 'message': f'Usuario {username} eliminado'}).encode())

        except Exception as e:
            print(f"❌ Error admin_delete_user: {e}")
            self._set_headers(status=500)
            self.wfile.write(json.dumps({'success': False, 'error': 'Error interno del servidor'}).encode())


    def _admin_set_admin(self):
        """Asignar o revocar rol de administrador a un usuario (solo admin)"""
        try:
            requester = self._get_admin_token()
            if not requester:
                self._set_headers(status=403)
                self.wfile.write(json.dumps({'success': False, 'error': 'Acceso denegado'}).encode())
                return

            content_length = int(self.headers['Content-Length'])
            post_data = json.loads(self.rfile.read(content_length))
            username = post_data.get('username', '').strip()
            grant = post_data.get('grant', True)  # True = otorgar, False = revocar

            if not username:
                self._set_headers(status=400)
                self.wfile.write(json.dumps({'success': False, 'error': 'Usuario requerido'}).encode())
                return

            # No puede revocarse a sí mismo
            if not grant and username == requester:
                self._set_headers(status=400)
                self.wfile.write(json.dumps({'success': False, 'error': 'No puedes quitarte el rol de administrador a ti mismo'}).encode())
                return

            with data_lock:
                if username not in users_db:
                    self._set_headers(status=404)
                    self.wfile.write(json.dumps({'success': False, 'error': 'Usuario no encontrado'}).encode())
                    return

                users_db[username]['isAdmin'] = bool(grant)
                save_users()

            action = 'otorgado' if grant else 'revocado'
            print(f"✅ [ADMIN] Rol admin {action} para: {username} (por {requester})")
            self._set_headers()
            self.wfile.write(json.dumps({
                'success': True,
                'message': f'Rol de administrador {action} para {username}',
                'username': username,
                'isAdmin': bool(grant)
            }).encode())

        except Exception as e:
            print(f"❌ Error admin_set_admin: {e}")
            self._set_headers(status=500)
            self.wfile.write(json.dumps({'success': False, 'error': 'Error interno del servidor'}).encode())

    # =============================================
    # MÉTODOS DE GRUPOS
    # =============================================

    def _auth_token(self):
        """Extraer username del token del header Authorization. Retorna None si inválido."""
        auth_header = self.headers.get('Authorization', '')
        token = auth_header.replace('Bearer ', '') if auth_header.startswith('Bearer ') else None
        if not token or token not in sessions:
            return None
        return sessions[token]

    def _get_groups(self):
        """Obtener grupos donde el usuario es miembro"""
        try:
            username = self._auth_token()
            if not username:
                self._set_headers(status=401)
                self.wfile.write(json.dumps({'success': False, 'error': 'No autorizado'}).encode())
                return

            with data_lock:
                user_groups = [
                    {
                        'id': g['id'],
                        'name': g['name'],
                        'description': g.get('description', ''),
                        'members': g.get('members', []),
                        'memberCount': len(g.get('members', [])),
                        'createdBy': g.get('createdBy', ''),
                        'createdAt': g.get('createdAt', 0)
                    }
                    for g in groups_db.values()
                    if username in g.get('members', [])
                ]
            user_groups.sort(key=lambda g: g['name'].lower())

            self._set_headers()
            self.wfile.write(json.dumps({'success': True, 'groups': user_groups}).encode())

        except Exception as e:
            print(f"❌ Error obteniendo grupos: {e}")
            self._set_headers(status=500)
            self.wfile.write(json.dumps({'success': False, 'error': 'Error interno del servidor'}).encode())

    def _get_group_messages(self, parsed_path):
        """Obtener mensajes de un grupo: /api/groups/{groupId}/messages"""
        try:
            username = self._auth_token()
            if not username:
                self._set_headers(status=401)
                self.wfile.write(json.dumps({'success': False, 'error': 'No autorizado'}).encode())
                return

            parts = parsed_path.path.split('/')
            # /api/groups/{groupId}/messages  → parts[3] = groupId
            if len(parts) < 5:
                self._set_headers(status=400)
                self.wfile.write(json.dumps({'success': False, 'error': 'GroupId requerido'}).encode())
                return

            group_id = parts[3]

            with data_lock:
                group = groups_db.get(group_id)
                if not group:
                    self._set_headers(status=404)
                    self.wfile.write(json.dumps({'success': False, 'error': 'Grupo no encontrado'}).encode())
                    return
                if username not in group.get('members', []):
                    self._set_headers(status=403)
                    self.wfile.write(json.dumps({'success': False, 'error': 'No eres miembro de este grupo'}).encode())
                    return
                msg_key = f'GROUP_{group_id}'
                group_messages = messages_db.get(msg_key, [])

            self._set_headers()
            self.wfile.write(json.dumps({'success': True, 'messages': group_messages, 'group': {
                'id': group['id'], 'name': group['name'],
                'members': group.get('members', []),
                'memberCount': len(group.get('members', []))
            }}).encode())

        except Exception as e:
            print(f"❌ Error obteniendo mensajes del grupo: {e}")
            self._set_headers(status=500)
            self.wfile.write(json.dumps({'success': False, 'error': 'Error interno del servidor'}).encode())

    def _send_group_message(self, parsed_path):
        """Enviar mensaje a grupo: POST /api/groups/{groupId}/send"""
        try:
            username = self._auth_token()
            if not username:
                self._set_headers(status=401)
                self.wfile.write(json.dumps({'success': False, 'error': 'No autorizado'}).encode())
                return

            parts = parsed_path.path.split('/')
            if len(parts) < 5:
                self._set_headers(status=400)
                self.wfile.write(json.dumps({'success': False, 'error': 'GroupId requerido'}).encode())
                return

            group_id = parts[3]

            content_length = int(self.headers['Content-Length'])
            post_data = json.loads(self.rfile.read(content_length))
            text = post_data.get('text', '')
            file = post_data.get('file')

            with data_lock:
                group = groups_db.get(group_id)
                if not group:
                    self._set_headers(status=404)
                    self.wfile.write(json.dumps({'success': False, 'error': 'Grupo no encontrado'}).encode())
                    return
                if username not in group.get('members', []):
                    self._set_headers(status=403)
                    self.wfile.write(json.dumps({'success': False, 'error': 'No eres miembro de este grupo'}).encode())
                    return

                msg_id = f"{int(time.time() * 1000)}_{''.join(random.choices(string.ascii_lowercase + string.digits, k=9))}"
                reply_to = post_data.get('replyTo')
                message = {
                    'id': msg_id,
                    'username': username,
                    'displayName': users_db[username]['displayName'],
                    'text': text,
                    'file': file,
                    'replyTo': reply_to,
                    'timestamp': int(time.time() * 1000)
                }
                msg_key = f'GROUP_{group_id}'
                if msg_key not in messages_db:
                    messages_db[msg_key] = []
                messages_db[msg_key].append(message)
                save_messages()

            print(f"✅ [{group['name']}] Mensaje de {username}")
            self._set_headers()
            self.wfile.write(json.dumps({'success': True, 'message': message}).encode())

        except Exception as e:
            print(f"❌ Error enviando mensaje al grupo: {e}")
            self._set_headers(status=500)
            self.wfile.write(json.dumps({'success': False, 'error': 'Error interno del servidor'}).encode())

    # =============================================
    # ADMIN — GESTIÓN DE GRUPOS
    # =============================================

    def _admin_create_group(self):
        """Admin crea un nuevo grupo"""
        try:
            admin_user = self._get_admin_token()
            if not admin_user:
                self._set_headers(status=403)
                self.wfile.write(json.dumps({'success': False, 'error': 'Acceso denegado'}).encode())
                return

            content_length = int(self.headers['Content-Length'])
            post_data = json.loads(self.rfile.read(content_length))

            name = post_data.get('name', '').strip()
            description = post_data.get('description', '').strip()
            add_all = post_data.get('addAllUsers', False)  # Por defecto NO agrega a nadie automáticamente

            if not name:
                self._set_headers(status=400)
                self.wfile.write(json.dumps({'success': False, 'error': 'Nombre del grupo requerido'}).encode())
                return

            # Generar ID único
            group_id = ''.join(random.choices(string.ascii_lowercase + string.digits, k=10))
            while group_id in groups_db:
                group_id = ''.join(random.choices(string.ascii_lowercase + string.digits, k=10))

            with data_lock:
                members = list(users_db.keys()) if add_all else [admin_user]
                groups_db[group_id] = {
                    'id': group_id,
                    'name': name,
                    'description': description,
                    'members': members,
                    'createdAt': time.time(),
                    'createdBy': admin_user
                }
                save_groups()

            print(f"✅ [ADMIN] Grupo creado: {name} ({group_id}) con {len(members)} miembros")
            self._set_headers()
            self.wfile.write(json.dumps({
                'success': True,
                'message': f'Grupo "{name}" creado con {len(members)} miembros',
                'groupId': group_id
            }).encode())

        except Exception as e:
            print(f"❌ Error admin_create_group: {e}")
            self._set_headers(status=500)
            self.wfile.write(json.dumps({'success': False, 'error': 'Error interno del servidor'}).encode())

    def _admin_add_group_member(self):
        """Admin agrega miembro a un grupo"""
        try:
            if not self._get_admin_token():
                self._set_headers(status=403)
                self.wfile.write(json.dumps({'success': False, 'error': 'Acceso denegado'}).encode())
                return

            content_length = int(self.headers['Content-Length'])
            post_data = json.loads(self.rfile.read(content_length))
            group_id = post_data.get('groupId', '').strip()
            username = post_data.get('username', '').strip()

            with data_lock:
                if group_id not in groups_db:
                    self._set_headers(status=404)
                    self.wfile.write(json.dumps({'success': False, 'error': 'Grupo no encontrado'}).encode())
                    return
                if username not in users_db:
                    self._set_headers(status=404)
                    self.wfile.write(json.dumps({'success': False, 'error': 'Usuario no encontrado'}).encode())
                    return
                if username in groups_db[group_id]['members']:
                    self._set_headers(status=400)
                    self.wfile.write(json.dumps({'success': False, 'error': 'El usuario ya es miembro'}).encode())
                    return
                groups_db[group_id]['members'].append(username)
                save_groups()

            self._set_headers()
            self.wfile.write(json.dumps({'success': True, 'message': f'{username} agregado al grupo'}).encode())

        except Exception as e:
            print(f"❌ Error admin_add_group_member: {e}")
            self._set_headers(status=500)
            self.wfile.write(json.dumps({'success': False, 'error': 'Error interno del servidor'}).encode())

    def _admin_remove_group_member(self):
        """Admin quita miembro de un grupo"""
        try:
            if not self._get_admin_token():
                self._set_headers(status=403)
                self.wfile.write(json.dumps({'success': False, 'error': 'Acceso denegado'}).encode())
                return

            content_length = int(self.headers['Content-Length'])
            post_data = json.loads(self.rfile.read(content_length))
            group_id = post_data.get('groupId', '').strip()
            username = post_data.get('username', '').strip()

            with data_lock:
                if group_id not in groups_db:
                    self._set_headers(status=404)
                    self.wfile.write(json.dumps({'success': False, 'error': 'Grupo no encontrado'}).encode())
                    return
                if username not in groups_db[group_id].get('members', []):
                    self._set_headers(status=400)
                    self.wfile.write(json.dumps({'success': False, 'error': 'El usuario no es miembro'}).encode())
                    return
                groups_db[group_id]['members'].remove(username)
                save_groups()

            self._set_headers()
            self.wfile.write(json.dumps({'success': True, 'message': f'{username} removido del grupo'}).encode())

        except Exception as e:
            print(f"❌ Error admin_remove_group_member: {e}")
            self._set_headers(status=500)
            self.wfile.write(json.dumps({'success': False, 'error': 'Error interno del servidor'}).encode())

    def _admin_delete_group(self):
        """Admin elimina un grupo"""
        try:
            if not self._get_admin_token():
                self._set_headers(status=403)
                self.wfile.write(json.dumps({'success': False, 'error': 'Acceso denegado'}).encode())
                return

            content_length = int(self.headers['Content-Length'])
            post_data = json.loads(self.rfile.read(content_length))
            group_id = post_data.get('groupId', '').strip()

            with data_lock:
                if group_id not in groups_db:
                    self._set_headers(status=404)
                    self.wfile.write(json.dumps({'success': False, 'error': 'Grupo no encontrado'}).encode())
                    return
                group_name = groups_db[group_id]['name']
                del groups_db[group_id]
                # Eliminar mensajes del grupo también
                msg_key = f'GROUP_{group_id}'
                if msg_key in messages_db:
                    del messages_db[msg_key]
                save_groups()
                save_messages()

            print(f"✅ [ADMIN] Grupo eliminado: {group_name}")
            self._set_headers()
            self.wfile.write(json.dumps({'success': True, 'message': f'Grupo "{group_name}" eliminado'}).encode())

        except Exception as e:
            print(f"❌ Error admin_delete_group: {e}")
            self._set_headers(status=500)
            self.wfile.write(json.dumps({'success': False, 'error': 'Error interno del servidor'}).encode())


    def _admin_rename_group(self):
        """Admin renombra un grupo"""
        try:
            if not self._get_admin_token():
                self._set_headers(status=403)
                self.wfile.write(json.dumps({'success': False, 'error': 'Acceso denegado'}).encode())
                return
            content_length = int(self.headers['Content-Length'])
            post_data = json.loads(self.rfile.read(content_length))
            group_id = post_data.get('groupId', '').strip()
            new_name = post_data.get('name', '').strip()
            if not new_name:
                self._set_headers(status=400)
                self.wfile.write(json.dumps({'success': False, 'error': 'Nombre requerido'}).encode())
                return
            with data_lock:
                if group_id not in groups_db:
                    self._set_headers(status=404)
                    self.wfile.write(json.dumps({'success': False, 'error': 'Grupo no encontrado'}).encode())
                    return
                old_name = groups_db[group_id]['name']
                groups_db[group_id]['name'] = new_name
                save_groups()
            print(f"✅ [ADMIN] Grupo renombrado: {old_name} → {new_name}")
            self._set_headers()
            self.wfile.write(json.dumps({'success': True, 'message': f'Grupo renombrado a "{new_name}"'}).encode())
        except Exception as e:
            print(f"❌ Error admin_rename_group: {e}")
            self._set_headers(status=500)
            self.wfile.write(json.dumps({'success': False, 'error': 'Error interno'}).encode())

    def _admin_update_group_description(self):
        """Admin actualiza descripción de un grupo"""
        try:
            if not self._get_admin_token():
                self._set_headers(status=403)
                self.wfile.write(json.dumps({'success': False, 'error': 'Acceso denegado'}).encode())
                return
            content_length = int(self.headers['Content-Length'])
            post_data = json.loads(self.rfile.read(content_length))
            group_id = post_data.get('groupId', '').strip()
            description = post_data.get('description', '').strip()
            with data_lock:
                if group_id not in groups_db:
                    self._set_headers(status=404)
                    self.wfile.write(json.dumps({'success': False, 'error': 'Grupo no encontrado'}).encode())
                    return
                groups_db[group_id]['description'] = description
                save_groups()
            self._set_headers()
            self.wfile.write(json.dumps({'success': True, 'message': 'Descripción actualizada'}).encode())
        except Exception as e:
            print(f"❌ Error admin_update_group_description: {e}")
            self._set_headers(status=500)
            self.wfile.write(json.dumps({'success': False, 'error': 'Error interno'}).encode())

    def _admin_update_area(self):
        """Admin actualiza el área de un usuario"""
        try:
            if not self._get_admin_token():
                self._set_headers(status=403)
                self.wfile.write(json.dumps({'success': False, 'error': 'Acceso denegado'}).encode())
                return

            content_length = int(self.headers['Content-Length'])
            post_data = json.loads(self.rfile.read(content_length))

            username = post_data.get('username', '').strip()
            area = post_data.get('area', '').strip()

            if not username:
                self._set_headers(status=400)
                self.wfile.write(json.dumps({'success': False, 'error': 'Usuario requerido'}).encode())
                return

            with data_lock:
                if username not in users_db:
                    self._set_headers(status=404)
                    self.wfile.write(json.dumps({'success': False, 'error': 'Usuario no encontrado'}).encode())
                    return
                users_db[username]['area'] = area
                save_users()

            print(f"✅ [ADMIN] Área actualizada para {username}: {area or '(sin área)'}")
            self._set_headers()
            self.wfile.write(json.dumps({'success': True, 'message': f'Área de {username} actualizada', 'area': area}).encode())

        except Exception as e:
            print(f"❌ Error admin_update_area: {e}")
            self._set_headers(status=500)
            self.wfile.write(json.dumps({'success': False, 'error': 'Error interno del servidor'}).encode())

    def _admin_add_all_to_group(self):
        """Admin agrega todos los usuarios a un grupo"""
        try:
            if not self._get_admin_token():
                self._set_headers(status=403)
                self.wfile.write(json.dumps({'success': False, 'error': 'Acceso denegado'}).encode())
                return
            content_length = int(self.headers['Content-Length'])
            post_data = json.loads(self.rfile.read(content_length))
            group_id = post_data.get('groupId', '').strip()
            with data_lock:
                if group_id not in groups_db:
                    self._set_headers(status=404)
                    self.wfile.write(json.dumps({'success': False, 'error': 'Grupo no encontrado'}).encode())
                    return
                current = groups_db[group_id]['members']
                added = 0
                for u in users_db:
                    if u not in current:
                        current.append(u)
                        added += 1
                save_groups()
            self._set_headers()
            self.wfile.write(json.dumps({'success': True, 'message': f'{added} usuarios agregados al grupo'}).encode())
        except Exception as e:
            print(f"❌ Error admin_add_all_to_group: {e}")
            self._set_headers(status=500)
            self.wfile.write(json.dumps({'success': False, 'error': 'Error interno'}).encode())


def get_local_ip():
    """Obtener IP local de la máquina"""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
        return local_ip
    except Exception:
        return "127.0.0.1"

def run_server(port=5000):
    """Iniciar servidor"""
    # Desactivar Quick Edit Mode en Windows (evita pausas al hacer clic en la consola)
    disable_quick_edit_mode()

    # Cargar datos existentes
    load_data()
    
    server_address = ('0.0.0.0', port)
    httpd = ThreadingHTTPServer(server_address, ChatHandler)
    local_ip = get_local_ip()
    
    print("=" * 80)
    print("🚀 CHAT CORPORATIVO - SISTEMA CON AUTENTICACIÓN")
    print("=" * 80)
    print(f"\n📍 Accede desde ESTE computador:")
    print(f"   http://localhost:{port}")
    print(f"\n🌐 Accede desde OTROS computadores:")
    print(f"   ┌────────────────────────────────────────┐")
    print(f"   │  http://{local_ip}:{port:<23}│")
    print(f"   └────────────────────────────────────────┘")
    print(f"\n✨ Características:")
    print(f"   • 🔐 Sistema de registro y login")
    print(f"   • 🔑 Contraseñas encriptadas (SHA-256)")
    print(f"   • 💾 Persistencia de datos en JSON")
    print(f"   • 📝 Historial completo de mensajes")
    print(f"   • 💬 Chats privados 1 a 1")
    print(f"   • 📎 Envío de archivos e imágenes")
    print(f"   • 🔔 Notificaciones de sonido")
    print(f"   • 🗑️ Eliminar conversaciones")
    print(f"\n📂 Archivos de datos:")
    print(f"   • {USERS_FILE} - Base de datos de usuarios")
    print(f"   • {MESSAGES_FILE} - Historial de mensajes")
    print("\n🛑 Presiona Ctrl+C para detener")
    print("=" * 80)
    print("\n✅ Servidor activo...\n")
    
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n\n🛑 Deteniendo servidor...")
        httpd.server_close()
        print("✅ Servidor detenido correctamente")

if __name__ == '__main__':
    run_server(5001)
