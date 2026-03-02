// ══════════════════════════════════════════════════════════════════════
// VERSIÓN ALTERNATIVA: AVATARES CON IMÁGENES REALES (PNG/SVG)
// ══════════════════════════════════════════════════════════════════════
// Esta versión usa imágenes en lugar de emojis para un look más profesional
// ══════════════════════════════════════════════════════════════════════

// ── CONFIGURACIÓN DE AVATARES CON IMÁGENES ──
const AREA_AVATARS_IMAGES = {
    'Sistemas': {
        image: '/assets/avatars/sistemas.png', // Ruta a la imagen
        fallbackIcon: '💻',                     // Fallback si la imagen no carga
        gradient: 'from-blue-600 to-cyan-500',
        color: '#0095d9',
        bgColor: '#e3f2fd'
    },
    'Seguros': {
        image: '/assets/avatars/seguros.png',
        fallbackIcon: '🛡️',
        gradient: 'from-green-600 to-emerald-500',
        color: '#10b981',
        bgColor: '#d1fae5'
    },
    'Directoras': {
        image: '/assets/avatars/directoras.png',
        fallbackIcon: '👔',
        gradient: 'from-purple-600 to-pink-500',
        color: '#9333ea',
        bgColor: '#fae8ff'
    },
    'Comercial': {
        image: '/assets/avatars/comercial.png',
        fallbackIcon: '📊',
        gradient: 'from-orange-600 to-red-500',
        color: '#ea580c',
        bgColor: '#ffedd5'
    },
    'Tesorería': {
        image: '/assets/avatars/tesoreria.png',
        fallbackIcon: '💰',
        gradient: 'from-yellow-600 to-amber-500',
        color: '#d97706',
        bgColor: '#fef3c7'
    },
    'Contabilidad': {
        image: '/assets/avatars/contabilidad.png',
        fallbackIcon: '📈',
        gradient: 'from-indigo-600 to-blue-500',
        color: '#4f46e5',
        bgColor: '#e0e7ff'
    },
    'Creditos': {
        image: '/assets/avatars/creditos.png',
        fallbackIcon: '💳',
        gradient: 'from-teal-600 to-cyan-500',
        color: '#0d9488',
        bgColor: '#ccfbf1'
    },
    'Cartera': {
        image: '/assets/avatars/cartera.png',
        fallbackIcon: '📁',
        gradient: 'from-rose-600 to-pink-500',
        color: '#e11d48',
        bgColor: '#ffe4e6'
    },
    'Riesgos': {
        image: '/assets/avatars/riesgos.png',
        fallbackIcon: '⚠️',
        gradient: 'from-red-600 to-orange-500',
        color: '#dc2626',
        bgColor: '#fee2e2'
    },
    'default': {
        image: '/assets/avatars/default.png',
        fallbackIcon: '👤',
        gradient: 'from-gray-600 to-slate-500',
        color: '#64748b',
        bgColor: '#f1f5f9'
    }
};

// Función para obtener configuración de avatar por área
function getAreaConfigImages(area) {
    return AREA_AVATARS_IMAGES[area] || AREA_AVATARS_IMAGES['default'];
}

// Función para generar avatar con imagen corporativa
function generateAvatarWithImage(user, size = 'md', showInitial = true) {
    const areaConfig = getAreaConfigImages(user.area);
    const initial = user.displayName.charAt(0).toUpperCase();
    
    const sizes = {
        'sm': { w: 'w-8 h-8', text: 'text-xs', img: '32' },
        'md': { w: 'w-11 h-11', text: 'text-sm', img: '44' },
        'lg': { w: 'w-16 h-16', text: 'text-xl', img: '64' }
    };
    
    const s = sizes[size] || sizes['md'];
    
    return `
        <div class="relative flex-shrink-0">
            <div class="${s.w} bg-gradient-to-br ${areaConfig.gradient} rounded-full overflow-hidden shadow-lg border-2 border-white flex items-center justify-center">
                <img 
                    src="${areaConfig.image}" 
                    alt="${user.area || 'Usuario'}" 
                    class="w-full h-full object-cover"
                    onerror="this.onerror=null; this.style.display='none'; this.nextElementSibling.style.display='flex';"
                >
                <div class="hidden w-full h-full absolute inset-0 flex flex-col items-center justify-center text-white font-bold" style="display: none;">
                    <div class="text-2xl">${areaConfig.fallbackIcon}</div>
                    ${showInitial ? `<div class="${s.text} font-extrabold">${initial}</div>` : ''}
                </div>
            </div>
            ${user.area ? `
                <div class="absolute -bottom-1 -right-1 ${size === 'sm' ? 'w-4 h-4' : 'w-5 h-5'} rounded-full flex items-center justify-center border-2 border-white shadow-sm text-xs" 
                     style="background: ${areaConfig.color};" 
                     title="${escapeHtml(user.area)}">
                    <span class="text-white font-bold">${initial}</span>
                </div>
            ` : ''}
        </div>
    `;
}

// ══════════════════════════════════════════════════════════════════════
// ESTRUCTURA DE CARPETAS RECOMENDADA:
// ══════════════════════════════════════════════════════════════════════
/*
/proyecto/
├── assets/
│   └── avatars/
│       ├── sistemas.png (512x512px recomendado)
│       ├── seguros.png
│       ├── directoras.png
│       ├── comercial.png
│       ├── tesoreria.png
│       ├── contabilidad.png
│       ├── creditos.png
│       ├── cartera.png
│       ├── riesgos.png
│       └── default.png
├── chat_client_auth.html
├── chat_client_auth.js
└── ...
*/

// ══════════════════════════════════════════════════════════════════════
// ESPECIFICACIONES DE IMÁGENES:
// ══════════════════════════════════════════════════════════════════════
/*
FORMATO RECOMENDADO:
- PNG con transparencia o SVG
- Tamaño: 512x512px (se escalará automáticamente)
- Fondo: Transparente o del color del área
- Estilo: Íconos planos, isométricos o ilustraciones corporativas

EJEMPLO DE DISEÑO:
- Sistemas: Laptop o engranajes en azul
- Comercial: Gráfico de barras o apretón de manos en naranja
- Contabilidad: Calculadora o monedas en índigo
- Tesorería: Billete o caja fuerte en amarillo

HERRAMIENTAS PARA CREAR ÍCONOS:
1. Figma (https://figma.com) - Diseño profesional
2. Canva (https://canva.com) - Templates prediseñados
3. Flaticon (https://flaticon.com) - Íconos gratuitos
4. Icons8 (https://icons8.com) - Íconos corporativos
5. Adobe Illustrator - Para vectores SVG
*/

// ══════════════════════════════════════════════════════════════════════
// CÓMO USAR ESTA VERSIÓN:
// ══════════════════════════════════════════════════════════════════════
/*
1. Crea la carpeta /assets/avatars/ en tu proyecto
2. Agrega las imágenes de cada área (siguiendo los nombres exactos)
3. En el código JavaScript, reemplaza:
   - AREA_AVATARS por AREA_AVATARS_IMAGES
   - getAreaConfig() por getAreaConfigImages()
   - generateAvatar() por generateAvatarWithImage()

4. Si una imagen no carga, mostrará automáticamente el emoji fallback

EJEMPLO DE REEMPLAZO EN buildUserCard():
Antes:
    ${generateAvatar(user, 'md', true)}

Después:
    ${generateAvatarWithImage(user, 'md', true)}
*/

// ══════════════════════════════════════════════════════════════════════
// OPTIMIZACIÓN DE IMÁGENES:
// ══════════════════════════════════════════════════════════════════════
/*
Para mejor rendimiento:

1. Comprime las imágenes con TinyPNG (https://tinypng.com)
2. Usa WebP para menor tamaño: sistemas.webp
3. Implementa lazy loading:
   <img loading="lazy" src="...">
4. Considera usar SVG para escalabilidad perfecta
5. Cachea las imágenes en el navegador (headers de cache)

EJEMPLO DE OPTIMIZACIÓN AVANZADA:
<picture>
    <source srcset="sistemas.webp" type="image/webp">
    <img src="sistemas.png" alt="Sistemas">
</picture>
*/
