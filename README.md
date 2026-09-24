Mini-derivador: comparación en paralelo de dos motores de clasificación de intención (Jev vs. un LLM) sobre mensajes de un chat de atención al cliente bancario.

## Requisitos

- Node.js 20+
- Una cuenta gratuita en [Neon](https://neon.tech) (base de datos Postgres)
- Una API key de [OpenAI](https://platform.openai.com/api-keys)
- Una API key de [TypeSafe AI](https://typesafe.ai) (Jev)

## Setup local

1. **Instalar dependencias**

   ```bash
   npm install
   ```

2. **Crear un proyecto en Neon**

   Entra a [neon.tech](https://neon.tech), crea un proyecto nuevo y, en el dashboard, ve a "Connection Details". Ahí vas a encontrar dos connection strings:
   - Una **pooled** (la que usa la app en runtime)
   - Una **unpooled/direct** (la que usa drizzle-kit para aplicar el schema)

3. **Configurar variables de entorno**

   ```bash
   cp .env.example .env.local
   ```

   Completa `.env.local` con:
   - `DATABASE_URL`: connection string pooled de Neon
   - `DATABASE_URL_UNPOOLED`: connection string directa de Neon
   - `OPENAI_API_KEY`: tu API key de OpenAI
   - `TYPESAFE_API_KEY`: tu API key de TypeSafe AI

4. **Crear las tablas en la base de datos**

   El schema vive en `src/db/schema.ts` y se aplica directamente (sin carpeta de migraciones versionada):

   ```bash
   npx drizzle-kit push
   ```

   No hace falta seedear datos: la fila de configuración (`settings`) se crea sola con valores por defecto la primera vez que la app la lee.

5. **Levantar el servidor de desarrollo**

   ```bash
   npm run dev
   ```

   Abre [http://localhost:3000](http://localhost:3000).

## Stack

- [Next.js](https://nextjs.org) (App Router)
- [Neon](https://neon.tech) + [Drizzle ORM](https://orm.drizzle.team) — Postgres serverless (driver HTTP de Neon; no es compatible con un Postgres local genérico)
- [OpenAI](https://platform.openai.com) vía [Vercel AI SDK](https://sdk.vercel.dev) — motor de clasificación LLM
- [TypeSafe AI (Jev)](https://typesafe.ai) — motor de clasificación Jev
