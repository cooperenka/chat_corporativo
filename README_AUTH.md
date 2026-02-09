# 💬 Chat Corporativo con Autenticación

Sistema de chat en tiempo real con autenticación de usuarios, historial persistente y mensajería privada.

## 🌟 Características

### 🔐 Sistema de Autenticación
- ✅ Registro de nuevos usuarios
- ✅ Login con usuario y contraseña
- ✅ Contraseñas encriptadas con SHA-256
- ✅ Tokens de sesión seguros
- ✅ Persistencia de sesión (auto-login)

### 🔔 Notificaciones Mejoradas (NUEVO)
- ✅ Sonido clásico de Messenger para cada mensaje
- ✅ Notificaciones del navegador cuando estás en otras páginas
- ✅ Sonido independiente para CADA mensaje recibido
- ✅ Vista previa del contenido del mensaje en la notificación
- ✅ Click en notificación te lleva directo al chat
- ✅ Auto-cierre de notificaciones después de 5 segundos

### 💾 Persistencia de Datos
- ✅ Base de datos de usuarios en JSON (`chat_users.json`)
- ✅ Historial completo de mensajes en JSON (`chat_messages.json`)
- ✅ Los datos se guardan automáticamente
- ✅ Los mensajes permanecen después de cerrar sesión

### 💬 Funciones de Chat
- ✅ Chats privados 1 a 1
- ✅ Envío de texto y archivos
- ✅ Vista previa de imágenes
- ✅ Notificaciones de sonido
- ✅ Indicadores de presencia (en línea)
- ✅ Eliminar conversaciones
- ✅ Sincronización en tiempo real

## 📦 Archivos del Sistema

```
chat_server_auth.py       → Servidor con autenticación
chat_client_auth.html     → Interfaz HTML
chat_client_auth.js       → Cliente JavaScript
chat_users.json           → Base de datos de usuarios (se crea automáticamente)
chat_messages.json        → Historial de mensajes (se crea automáticamente)
README_AUTH.md            → Este archivo
```

## 🚀 Instalación y Uso

### 1️⃣ Preparación

Asegúrate de tener Python 3 instalado. No requiere librerías adicionales.

### 2️⃣ Iniciar el Servidor

```bash
python chat_server_auth.py
```

Verás algo como:
```
================================================================================
🚀 CHAT CORPORATIVO - SISTEMA CON AUTENTICACIÓN
================================================================================

📍 Accede desde ESTE computador:
   http://localhost:5000

🌐 Accede desde OTROS computadores:
   ┌────────────────────────────────────────┐
   │  http://192.168.1.XXX:5000             │
   └────────────────────────────────────────┘

✅ Servidor activo...
```

### 3️⃣ Acceder al Chat

#### Desde el mismo computador:
```
http://localhost:5000
```

#### Desde otros computadores en la red:
```
http://192.168.X.X:5000
```
(Usa la IP que muestra el servidor)

## 👤 Uso del Sistema

### Primera vez - Registro

1. Haz clic en "Regístrate aquí"
2. Completa el formulario:
   - **Usuario**: Mínimo 3 caracteres (será único)
   - **Nombre para mostrar**: Opcional, tu nombre visible
   - **Contraseña**: Mínimo 4 caracteres
   - **Confirmar contraseña**: Debe coincidir
3. Haz clic en "Crear Cuenta"
4. Serás redirigido al login automáticamente

### Iniciar Sesión

1. Ingresa tu usuario y contraseña
2. Haz clic en "Iniciar Sesión"
3. Tu sesión se guardará automáticamente

### Chatear

1. **Selecciona un usuario** de la lista lateral
2. **Escribe un mensaje** en el campo inferior
3. **Presiona Enter** o haz clic en ➤ para enviar
4. **Adjunta archivos** con el botón 📎 (máximo 5MB)

### Notificaciones

El sistema incluye notificaciones mejoradas:

- **🔊 Sonido**: Cada mensaje nuevo reproduce el sonido clásico de Messenger
- **🔔 Notificaciones del navegador**: 
  - Se activan automáticamente al iniciar sesión (te pedirá permiso)
  - Funcionan incluso cuando estás en otra pestaña o ventana
  - Muestran una vista previa del mensaje
  - Al hacer clic te llevan directo al chat
- **Múltiples mensajes**: Si recibes varios mensajes seguidos, cada uno tiene su propio sonido y notificación

**Activar notificaciones manualmente:**
1. Si las bloqueaste, ve a la configuración de tu navegador
2. Busca "Permisos" o "Notificaciones"
3. Encuentra la URL del chat y permite las notificaciones

### Funciones Adicionales

- **🔄 Actualizar lista**: Refresca la lista de usuarios en línea
- **⋮ Menú del chat**: Opciones para eliminar la conversación
- **🚪 Cerrar sesión**: Sal de tu cuenta

## 🔧 Características Técnicas

### Servidor (Python)
- HTTP Server nativo (no requiere frameworks)
- Persistencia en archivos JSON
- Hash SHA-256 para contraseñas
- Tokens de sesión seguros con `secrets`
- Sincronización con locks para concurrencia
- Auto-guardado de datos

### Cliente (JavaScript)
- Vanilla JavaScript (sin dependencias)
- TailwindCSS para estilos
- LocalStorage para sesión
- FileReader API para archivos
- Notifications API para alertas
- Polling cada 3-5 segundos

### Seguridad
- ✅ Contraseñas nunca se guardan en texto plano
- ✅ Hash SHA-256 de todas las contraseñas
- ✅ Tokens únicos por sesión
- ✅ Validación en servidor y cliente
- ✅ Sanitización de HTML para prevenir XSS

## 📊 Estructura de Datos

### chat_users.json
```json
{
  "usuario1": {
    "username": "usuario1",
    "password": "hash_sha256...",
    "displayName": "Juan Pérez",
    "createdAt": 1234567890
  }
}
```

### chat_messages.json
```json
{
  "usuario1_usuario2": [
    {
      "id": "msg_123",
      "username": "usuario1",
      "displayName": "Juan Pérez",
      "text": "Hola!",
      "timestamp": 1234567890
    }
  ]
}
```

## 🛠️ Personalización

### Cambiar Puerto
Edita la última línea de `chat_server_auth.py`:
```python
run_server(5000)  # Cambia 5000 por el puerto deseado
```

### Ajustar Límite de Archivo
En `chat_client_auth.js`, busca:
```javascript
if (file.size > 5 * 1024 * 1024) {  // 5MB
```

### Modificar Tiempos de Actualización
En `chat_client_auth.js`:
```javascript
presenceInterval = setInterval(updatePresence, 3000);  // 3 segundos
usersInterval = setInterval(loadUsers, 5000);          // 5 segundos
messagesInterval = setInterval(() => {
    if (selectedUser) loadMessages();
}, 3000);  // 3 segundos
```

## 🐛 Solución de Problemas

### El servidor no inicia
- Verifica que el puerto 5000 esté disponible
- Cambia el puerto si es necesario
- Verifica permisos de escritura en la carpeta

### No puedo acceder desde otro computador
- Verifica que ambos estén en la misma red
- Desactiva el firewall temporalmente para probar
- Usa la IP correcta que muestra el servidor

### Los mensajes no se guardan
- Verifica permisos de escritura en la carpeta
- Revisa que `chat_messages.json` se haya creado
- Revisa la consola del servidor por errores

### No puedo iniciar sesión
- Verifica que hayas creado la cuenta primero
- Las contraseñas son case-sensitive
- El usuario debe ser exactamente igual al registrado

## 📝 Notas Importantes

1. **Seguridad**: Este es un sistema para red local. Para internet, agrega HTTPS y mejores medidas de seguridad.

2. **Backups**: Los archivos JSON son tu base de datos. Haz backups regularmente:
   ```bash
   cp chat_users.json chat_users.backup.json
   cp chat_messages.json chat_messages.backup.json
   ```

3. **Escalabilidad**: Para muchos usuarios, considera migrar a una base de datos real (SQLite, PostgreSQL, etc.)

4. **Limpieza**: Puedes eliminar los archivos JSON para empezar de cero:
   ```bash
   rm chat_users.json chat_messages.json
   ```

## 🎯 Próximas Mejoras Sugeridas

- [ ] Grupos de chat
- [ ] Búsqueda de mensajes
- [ ] Editar/eliminar mensajes propios
- [ ] Estados personalizados (disponible, ocupado, etc.)
- [ ] Cifrado end-to-end
- [ ] Videollamadas
- [ ] Base de datos SQL
- [ ] Panel de administración
- [ ] Recuperación de contraseña

## 📄 Licencia

Código libre para uso personal y comercial.

## 👨‍💻 Soporte

Si tienes problemas:
1. Revisa esta documentación
2. Verifica los logs del servidor
3. Revisa la consola del navegador (F12)

---

**¡Disfruta tu nuevo sistema de chat corporativo! 💬✨**
