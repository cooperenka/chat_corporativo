#!/usr/bin/env python3
"""
Servidor de Chat Corporativo con HTTPS (Certificados Autofirmados)
Ejecutar con: python chat_server_https.py
"""

from http.server import HTTPServer, BaseHTTPRequestHandler
import ssl
import json
import socket
from urllib.parse import urlparse, parse_qs
import time
from threading import Lock
import hashlib
import secrets
import os
import subprocess
import sys

# Archivos de persistencia
USERS_FILE = 'chat_users.json'
MESSAGES_FILE = 'chat_messages.json'

# Archivos de certificados
CERT_FILE = 'cert.pem'
KEY_FILE = 'key.pem'

# Almacenamiento en memoria
users_db = {}
messages_db = {}
sessions = {}
active_users = {}
data_lock = Lock()

def generate_self_signed_cert():
    """Generar certificado autofirmado si no existe"""
    if os.path.exists(CERT_FILE) and os.path.exists(KEY_FILE):
        print(f"✅ Certificados existentes encontrados")
        return True
    
    print("🔐 Generando certificado autofirmado...")
    
    try:
        # Obtener IP local
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
        
        # Generar certificado con openssl
        openssl_cmd = [
            'openssl', 'req', '-x509', '-newkey', 'rsa:4096',
            '-keyout', KEY_FILE, '-out', CERT_FILE,
            '-days', '365', '-nodes',
            '-subj', f'/CN={local_ip}'
        ]
        
        result = subprocess.run(openssl_cmd, capture_output=True, text=True)
        
        if result.returncode == 0:
            print(f"✅ Certificado generado exitosamente")
            print(f"   • Archivo de certificado: {CERT_FILE}")
            print(f"   • Archivo de clave: {KEY_FILE}")
            return True
        else:
            print(f"❌ Error generando certificado: {result.stderr}")
            return False
            
    except FileNotFoundError:
        print("❌ OpenSSL no está instalado")
        print("\n📦 Instalación de OpenSSL:")
        print("\nWindows:")
        print("   1. Descarga desde: https://slproweb.com/products/Win32OpenSSL.html")
        print("   2. Instala 'Win64 OpenSSL v3.x.x'")
        print("   3. Reinicia este script")
        print("\nLinux:")
        print("   sudo apt-get install openssl   # Ubuntu/Debian")
        print("   sudo yum install openssl       # CentOS/RHEL")
        print("\nmacOS:")
        print("   brew install openssl")
        return False
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

def load_data():
    """Cargar datos desde archivos JSON"""
    global users_db, messages_db
    
    if os.path.exists(USERS_FILE):
        try:
            with open(USERS_FILE, 'r', encoding='utf-8') as f:
                users_db = json.load(f)
            print(f"✅ Cargados {len(users_db)} usuarios")
        except Exception as e:
            print(f"⚠️  Error cargando usuarios: {e}")
            users_db = {}
    else:
        users_db = {}
    
    if os.path.exists(MESSAGES_FILE):
        try:
            with open(MESSAGES_FILE, 'r', encoding='utf-8') as f:
                messages_db = json.load(f)
            print(f"✅ Cargados mensajes")
        except Exception as e:
            print(f"⚠️  Error cargando mensajes: {e}")
            messages_db = {}
    else:
        messages_db = {}

def save_users():
    """Guardar usuarios a archivo"""
    try:
        with open(USERS_FILE, 'w', encoding='utf-8') as f:
            json.dump(users_db, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"❌ Error guardando usuarios: {e}")

def save_messages():
    """Guardar mensajes a archivo"""
    try:
        with open(MESSAGES_FILE, 'w', encoding='utf-8') as f:
            json.dump(messages_db, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"❌ Error guardando mensajes: {e}")

def hash_password(password):
    """Hashear contraseña con SHA-256"""
    return hashlib.sha256(password.encode()).hexdigest()

def generate_token():
    """Generar token seguro"""
    return secrets.token_urlsafe(32)

class ChatHandler(BaseHTTPRequestHandler):
    def _set_headers(self, status=200, content_type='application/json'):
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.end_headers()
    
    def do_OPTIONS(self):
        self._set_headers()
    
    def do_GET(self):
        parsed_path = urlparse(self.path)
        path = parsed_path.path
        
        if path == '/':
            self._serve_file('chat_client_auth.html', 'text/html')
        elif path == '/chat_client_auth.js':
            self._serve_file('chat_client_auth.js', 'application/javascript')
        elif path == '/api/users':
            self._get_users()
        elif path == '/api/messages':
            self._get_messages()
        elif path == '/api/presence':
            self._update_presence()
        else:
            self._set_headers(404)
            self.wfile.write(json.dumps({'error': 'Not found'}).encode())
    
    def _serve_file(self, filename, content_type):
        try:
            with open(filename, 'rb') as f:
                content = f.read()
            self._set_headers(200, content_type)
            self.wfile.write(content)
        except FileNotFoundError:
            self._set_headers(404)
            self.wfile.write(json.dumps({'error': 'File not found'}).encode())
    
    def _get_auth_token(self):
        auth_header = self.headers.get('Authorization', '')
        if auth_header.startswith('Bearer '):
            return auth_header[7:]
        return None
    
    def _verify_token(self):
        token = self._get_auth_token()
        if token and token in sessions:
            return sessions[token]
        return None
    
    def _get_users(self):
        user_id = self._verify_token()
        if not user_id:
            self._set_headers(401)
            self.wfile.write(json.dumps({'error': 'Unauthorized'}).encode())
            return
        
        with data_lock:
            users_list = [
                {
                    'username': u['username'],
                    'displayName': u.get('displayName', u['username']),
                    'online': u['username'] in active_users
                }
                for u in users_db.values()
                if u['username'] != user_id
            ]
        
        self._set_headers()
        self.wfile.write(json.dumps(users_list).encode())
    
    def _get_messages(self):
        user_id = self._verify_token()
        if not user_id:
            self._set_headers(401)
            self.wfile.write(json.dumps({'error': 'Unauthorized'}).encode())
            return
        
        query_params = parse_qs(parsed_path.query) if '?' in self.path else {}
        other_user = query_params.get('user', [None])[0]
        
        if not other_user:
            self._set_headers(400)
            self.wfile.write(json.dumps({'error': 'User parameter required'}).encode())
            return
        
        chat_key = '_'.join(sorted([user_id, other_user]))
        
        with data_lock:
            messages = messages_db.get(chat_key, [])
        
        self._set_headers()
        self.wfile.write(json.dumps(messages).encode())
    
    def _update_presence(self):
        user_id = self._verify_token()
        if not user_id:
            self._set_headers(401)
            self.wfile.write(json.dumps({'error': 'Unauthorized'}).encode())
            return
        
        with data_lock:
            active_users[user_id] = {
                'lastSeen': time.time()
            }
        
        self._set_headers()
        self.wfile.write(json.dumps({'success': True}).encode())
    
    def do_POST(self):
        parsed_path = urlparse(self.path)
        path = parsed_path.path
        
        content_length = int(self.headers.get('Content-Length', 0))
        post_data = self.rfile.read(content_length).decode('utf-8')
        
        try:
            data = json.loads(post_data) if post_data else {}
        except json.JSONDecodeError:
            self._set_headers(400)
            self.wfile.write(json.dumps({'error': 'Invalid JSON'}).encode())
            return
        
        if path == '/api/register':
            self._register(data)
        elif path == '/api/login':
            self._login(data)
        elif path == '/api/messages':
            self._send_message(data)
        else:
            self._set_headers(404)
            self.wfile.write(json.dumps({'error': 'Not found'}).encode())
    
    def _register(self, data):
        username = data.get('username', '').strip()
        password = data.get('password', '')
        display_name = data.get('displayName', '').strip() or username
        
        if not username or not password:
            self._set_headers(400)
            self.wfile.write(json.dumps({'error': 'Username and password required'}).encode())
            return
        
        with data_lock:
            if username in users_db:
                self._set_headers(400)
                self.wfile.write(json.dumps({'error': 'Username already exists'}).encode())
                return
            
            users_db[username] = {
                'username': username,
                'password': hash_password(password),
                'displayName': display_name,
                'createdAt': time.time()
            }
            save_users()
        
        self._set_headers()
        self.wfile.write(json.dumps({'success': True, 'message': 'User registered'}).encode())
    
    def _login(self, data):
        username = data.get('username', '').strip()
        password = data.get('password', '')
        
        with data_lock:
            user = users_db.get(username)
            
            if not user or user['password'] != hash_password(password):
                self._set_headers(401)
                self.wfile.write(json.dumps({'error': 'Invalid credentials'}).encode())
                return
            
            token = generate_token()
            sessions[token] = username
            active_users[username] = {'lastSeen': time.time()}
        
        self._set_headers()
        self.wfile.write(json.dumps({
            'token': token,
            'username': username,
            'displayName': user.get('displayName', username)
        }).encode())
    
    def _send_message(self, data):
        user_id = self._verify_token()
        if not user_id:
            self._set_headers(401)
            self.wfile.write(json.dumps({'error': 'Unauthorized'}).encode())
            return
        
        to_user = data.get('to')
        text = data.get('text', '').strip()
        file_data = data.get('file')
        
        if not to_user:
            self._set_headers(400)
            self.wfile.write(json.dumps({'error': 'Recipient required'}).encode())
            return
        
        chat_key = '_'.join(sorted([user_id, to_user]))
        
        with data_lock:
            if chat_key not in messages_db:
                messages_db[chat_key] = []
            
            user_info = users_db.get(user_id, {})
            
            message = {
                'id': f"{int(time.time() * 1000)}_{secrets.token_urlsafe(6)}",
                'username': user_id,
                'displayName': user_info.get('displayName', user_id),
                'text': text,
                'file': file_data,
                'timestamp': int(time.time() * 1000)
            }
            
            messages_db[chat_key].append(message)
            save_messages()
        
        self._set_headers()
        self.wfile.write(json.dumps({'success': True, 'message': message}).encode())
    
    def do_DELETE(self):
        parsed_path = urlparse(self.path)
        path = parsed_path.path
        
        if path == '/api/messages':
            self._delete_chat()
        else:
            self._set_headers(404)
            self.wfile.write(json.dumps({'error': 'Not found'}).encode())
    
    def _delete_chat(self):
        user_id = self._verify_token()
        if not user_id:
            self._set_headers(401)
            self.wfile.write(json.dumps({'error': 'Unauthorized'}).encode())
            return
        
        query_params = parse_qs(urlparse(self.path).query) if '?' in self.path else {}
        other_user = query_params.get('user', [None])[0]
        
        if not other_user:
            self._set_headers(400)
            self.wfile.write(json.dumps({'error': 'User parameter required'}).encode())
            return
        
        chat_key = '_'.join(sorted([user_id, other_user]))
        
        with data_lock:
            if chat_key in messages_db:
                del messages_db[chat_key]
                save_messages()
        
        self._set_headers()
        self.wfile.write(json.dumps({'success': True}).encode())
    
    def log_message(self, format, *args):
        return  # Silenciar logs de requests

def get_local_ip():
    """Obtener IP local"""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
        return local_ip
    except:
        return "127.0.0.1"

def run_server(port=5001):
    """Iniciar servidor HTTPS"""
    print("\n" + "=" * 80)
    print("🔐 GENERANDO CERTIFICADOS SSL")
    print("=" * 80)
    
    if not generate_self_signed_cert():
        print("\n❌ No se pudieron generar los certificados")
        print("El servidor no puede iniciarse sin HTTPS")
        sys.exit(1)
    
    load_data()
    
    server_address = ('0.0.0.0', port)
    httpd = HTTPServer(server_address, ChatHandler)
    
    # Configurar SSL
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain(CERT_FILE, KEY_FILE)
    httpd.socket = context.wrap_socket(httpd.socket, server_side=True)
    
    local_ip = get_local_ip()
    
    print("\n" + "=" * 80)
    print("🚀 CHAT CORPORATIVO - SERVIDOR HTTPS SEGURO")
    print("=" * 80)
    print(f"\n📍 Accede desde ESTE computador:")
    print(f"   https://localhost:{port}")
    print(f"\n🌐 Accede desde OTROS computadores:")
    print(f"   ┌────────────────────────────────────────┐")
    print(f"   │  https://{local_ip}:{port:<23}│")
    print(f"   └────────────────────────────────────────┘")
    print(f"\n⚠️  ADVERTENCIA DE CERTIFICADO:")
    print(f"   • El navegador mostrará una advertencia de seguridad")
    print(f"   • Esto es NORMAL con certificados autofirmados")
    print(f"   • Es SEGURO proceder en tu red local")
    print(f"\n📱 Cómo proceder en el navegador:")
    print(f"   Chrome: Clic en 'Avanzado' → 'Acceder a {local_ip} (sitio no seguro)'")
    print(f"   Firefox: Clic en 'Avanzado' → 'Aceptar el riesgo y continuar'")
    print(f"   Edge: Clic en 'Detalles' → 'Acceder a la página web'")
    print(f"\n✨ Características:")
    print(f"   • 🔐 HTTPS habilitado (certificado autofirmado)")
    print(f"   • 🔔 Notificaciones funcionan en TODOS los equipos")
    print(f"   • 🔑 Contraseñas encriptadas (SHA-256)")
    print(f"   • 💾 Persistencia de datos")
    print(f"   • 💬 Chats privados 1 a 1")
    print(f"   • 📎 Envío de archivos")
    print(f"\n🛑 Presiona Ctrl+C para detener")
    print("=" * 80)
    print("\n✅ Servidor HTTPS activo...\n")
    
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n\n🛑 Deteniendo servidor...")
        httpd.server_close()
        print("✅ Servidor detenido")

if __name__ == '__main__':
    run_server(5001)
