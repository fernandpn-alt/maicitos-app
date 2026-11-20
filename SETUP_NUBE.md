# Guía Rápida de Puesta en Marcha en la Nube ($0 MXN/mes)

Esta guía conecta **Maicitos ERP 2.0** con **Supabase (base de datos + tiempo real)** y **Vercel o Cloudflare Pages (hosting automático desde GitHub)** en unos 5 minutos.

> Nota: Mientras no configures Supabase, la app funciona al 100% en **Modo Local** (guardando todo en IndexedDB de tu navegador/dispositivo).

---

## Paso 1: Crear la Base de Datos en Supabase (Gratis)

1. Crea una cuenta o entra en [supabase.com](https://supabase.com) y pulsa **New Project**.
2. Nómbralo por ejemplo `maicitos-erp`, elige una contraseña de base de datos (guárdala) y la región más cercana (ej. *US West* o *US East*).
3. Cuando termine de crearse:
   - Ve al menú **SQL Editor** → **New query**.
   - Copia y pega todo el contenido de [`supabase/schema.sql`](supabase/schema.sql) y presiona **Run**.
4. Crea el usuario único de tu negocio:
   - Ve a **Authentication** → **Users** → **Add user** → **Create new user**.
   - Ingresa un correo (ej. `negocio@maicitos.local` o tu correo real) y una contraseña segura.
   - Marca **Auto Confirm User** y guarda. *(Solo tú necesitarás esta clave una vez por dispositivo; después tu papá y tú solo usan el selector de dispositivo y el PIN).*
5. Copia tus credenciales en **Project Settings** → **API**:
   - **Project URL** (`VITE_SUPABASE_URL`)
   - **anon public key** (`VITE_SUPABASE_ANON_KEY`)

---

## Paso 2: Activar el Keep-Alive Anti-Pausa en GitHub (Gratis)

Supabase Free pausa proyectos tras 7 días sin actividad. Ya incluimos el flujo automático [`.github/workflows/keep-supabase-alive.yml`](.github/workflows/keep-supabase-alive.yml) que hace un ping cada 4 días.

Para activarlo:
1. En tu repositorio de GitHub ve a **Settings** → **Secrets and variables** → **Actions**.
2. Crea dos **Repository secrets**:
   - `SUPABASE_URL` = tu Project URL de Supabase
   - `SUPABASE_ANON_KEY` = tu `anon public` key

---

## Paso 3: Desplegar la App en la Nube (Vercel o Cloudflare Pages)

### Opción A — Vercel (recomendado por simplicidad)
1. Entra a [vercel.com](https://vercel.com) con tu cuenta de GitHub y selecciona **Add New Project** → elige `maicitos-app`.
2. Framework Preset: **Vite** (`npm run build`, carpeta `dist`).
3. En **Environment Variables** agrega:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `GEMINI_API_KEY` *(opcional, para activar las ayudas de Google Decision 1 sin exponer tu llave al navegador)*
4. Pulsa **Deploy**. Desde este momento, cada `git push` desde tu casa actualiza automáticamente todos los dispositivos.

### Opción B — Cloudflare Pages
1. Entra al panel de Cloudflare → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
2. Build command: `npm run build` | Build output directory: `dist`.
3. Agrega `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` y `GEMINI_API_KEY` en Environment Variables (para Production y Preview).

---

## Paso 4: Instalar en cada Dispositivo (1 sola vez)

1. Abre la URL desplegada en cada equipo y entra primero a **`🏠 Casa Admin`** (`/admin`, PIN inicial: `1234`) → pestaña **☁️ Nube (Supabase)** para iniciar sesión con el correo/contraseña del negocio.
2. Luego fija la app y elige el modo de ese equipo:
   - **📟 Tablet Lenovo (Bodega):** abre en Chrome → menú `⋮` → **Instalar aplicación / Agregar a pantalla principal** → selecciona **`Tablet Bodega`**.
   - **💻 Laptop Windows (Bodega):** abre en Edge o Chrome → icono de **Instalar app** en la barra de direcciones → selecciona **`Laptop Oficina`**.
   - **📱 Celulares (Calle):** abre en Chrome (Android) → **Instalar aplicación** → selecciona **`Celular Ruta`**.

---

## Cómo usar el Widget Relámpago con WhatsApp Business (Android)

1. Con la PWA instalada en el celular, cuando un cliente mande un pedido por **WhatsApp Business**:
   - Mantén presionado el mensaje del cliente → pulsa **Compartir** (o menú `⋮` → Compartir) → elige **Maicitos**.
   - Se abrirá directo la pantalla `/pedido-rapido` con los sabores, cajas/bolsas, prioridad y cliente detectados automáticamente.
2. También puedes crear un acceso directo en pantalla de inicio manteniendo presionado el ícono de **Maicitos** → **Pedido WhatsApp** (o copiar el texto y usar el botón gigante **📋 Pegar pedido de WhatsApp**).
