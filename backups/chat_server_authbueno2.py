#!/usr/bin/env python3
"""
Servidor de Chat Corporativo con Autenticación y Persistencia
Ejecutar con: python chat_server_auth.py
"""

from http.server import HTTPServer, BaseHTTPRequestHandler
import json
import socket
from urllib.parse import urlparse, parse_qs
import time
from threading import Lock
import hashlib
import secrets
import os

# Archivos de persistencia
USERS_FILE = 'chat_users.json'
MESSAGES_FILE = 'chat_messages.json'

# Almacenamiento en memoria
users_db = {}
messages_db = {}
sessions = {}  # token -> userId
active_users = {}  # userId -> {name, lastSeen, token}
data_lock = Lock()

def load_data():
    """Cargar datos desde archivos JSON"""
    global users_db, messages_db
    
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
    
    # Cargar mensajes
    if os.path.exists(MESSAGES_FILE):
        try:
            with open(MESSAGES_FILE, 'r', encoding='utf-8') as f:
                messages_db = json.load(f)
            print(f"✅ Cargados mensajes desde {MESSAGES_FILE}")
        except Exception as e:
            print(f"⚠️  Error cargando mensajes: {e}")
            messages_db = {}
    else:
        messages_db = {}
        print("ℹ️  No se encontró archivo de mensajes, creando nuevo...")

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
        elif parsed_path.path == '/chat_client_auth.js':
            self._serve_js()
        elif parsed_path.path == '/api/verify':
            self._verify_token()
        elif parsed_path.path == '/api/users':
            self._get_users()
        elif parsed_path.path.startswith('/api/messages'):
            self._get_messages(parsed_path)
        else:
            self.send_error(404)

    def do_POST(self):
        parsed_path = urlparse(self.path)
        
        if parsed_path.path == '/api/register':
            self._register()
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
                
                # Marcar usuario como activo
                active_users[username] = {
                    'username': username,
                    'displayName': user['displayName'],
                    'lastSeen': time.time(),
                    'token': token
                }
            
            print(f"✅ Usuario autenticado: {username}")
            
            self._set_headers()
            self.wfile.write(json.dumps({
                'success': True,
                'token': token,
                'username': username,
                'displayName': user['displayName']
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
                            'displayName': user['displayName']
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
            # Obtener token del header Authorization
            auth_header = self.headers.get('Authorization', '')
            token = auth_header.replace('Bearer ', '') if auth_header.startswith('Bearer ') else None
            
            if not token:
                self._set_headers(status=401)
                self.wfile.write(json.dumps({'error': 'No token provided'}).encode())
                return
            
            with data_lock:
                if token in sessions:
                    username = sessions[token]
                    if username in users_db:
                        active_users[username] = {
                            'username': username,
                            'displayName': users_db[username]['displayName'],
                            'lastSeen': time.time(),
                            'token': token
                        }
            
            self._set_headers()
            self.wfile.write(json.dumps({'status': 'ok'}).encode())
            
        except Exception as e:
            print(f"❌ Error actualizando presencia: {e}")
            self._set_headers(status=500)
            self.wfile.write(json.dumps({'error': 'Error interno del servidor'}).encode())

    def _get_users(self):
        """Obtener lista de usuarios activos"""
        try:
            with data_lock:
                now = time.time()
                users_list = [
                    {
                        'username': user['username'],
                        'displayName': user['displayName']
                    }
                    for user in active_users.values()
                    if now - user['lastSeen'] < 15
                ]
            
            self._set_headers()
            self.wfile.write(json.dumps({'success': True, 'users': users_list}).encode())
            
        except Exception as e:
            print(f"❌ Error obteniendo usuarios: {e}")
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
            import random
            import string
            msg_id = f"{int(time.time() * 1000)}_{''.join(random.choices(string.ascii_lowercase + string.digits, k=9))}"
            
            message = {
                'id': msg_id,
                'username': current_username,
                'displayName': users_db[current_username]['displayName'],
                'text': text,
                'file': file,
                'timestamp': int(time.time() * 1000)
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
    # Cargar datos existentes
    load_data()
    
    server_address = ('0.0.0.0', port)
    httpd = HTTPServer(server_address, ChatHandler)
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
