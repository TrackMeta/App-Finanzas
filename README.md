# Coach Finanzas 💰

Tu entrenador financiero personal. Registra gastos, metas, deudas y obtén insights automáticos.

## Pasos para publicar

### 1. Crear cuenta en Supabase
1. Ve a [supabase.com](https://supabase.com) y crea una cuenta gratis
2. Crea un nuevo proyecto (elige una región cercana, ej: São Paulo)
3. Espera ~2 minutos a que se inicialice

### 2. Ejecutar el schema SQL
1. En el panel de Supabase ve a **SQL Editor**
2. Copia y pega el contenido de `supabase/migrations/001_initial_schema.sql`
3. Haz clic en **Run**

### 3. Activar login con Google (opcional)
1. Ve a **Authentication → Providers → Google**
2. Activa el toggle
3. Necesitarás credenciales de [Google Cloud Console](https://console.cloud.google.com)
   - Crea un proyecto → APIs → Credentials → OAuth 2.0
   - URI de redirección: `https://TU-PROJECT-ID.supabase.co/auth/v1/callback`

### 4. Copiar tus credenciales
1. En Supabase ve a **Settings → API**
2. Copia **Project URL** y **anon public key**
3. Abre el archivo `js/config.js` y reemplaza:
```js
const SUPABASE_URL = 'https://TU-PROJECT-ID.supabase.co';
const SUPABASE_ANON_KEY = 'TU-ANON-KEY-AQUI';
```

### 5. Subir a GitHub Pages
1. Crea un repo en [github.com/new](https://github.com/new)
2. Sube todos los archivos
3. Ve a **Settings → Pages → Source: main branch**
4. Tu app estará en `https://TU-USUARIO.github.io/TU-REPO`

### 6. Instalar en el celular
- **iPhone**: Abre en Safari → Compartir ↑ → "Añadir a pantalla de inicio"
- **Android**: Abre en Chrome → Menú → "Añadir a pantalla de inicio"

## Estructura
```
index.html          → App completa (SPA)
css/app.css         → Estilos
js/
  config.js         → ⚠️ Aquí van tus claves de Supabase
  db.js             → Operaciones con la base de datos
  analytics.js      → Insights, score, predicciones (100% local)
  app.js            → Lógica de la app y UI
manifest.json       → Configuración PWA
sw.js               → Service Worker (offline)
supabase/           → Schema SQL para ejecutar en Supabase
```
