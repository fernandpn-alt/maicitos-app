import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import {
  DECISION_MODEL,
  executeDecisionAction
} from './server/decisionHandler.js';

function maicitosDecisionDevApi(apiKey) {
  const MAX_BODY_BYTES = 6 * 1024 * 1024;

  return {
    name: 'maicitos-decision-dev-api',
    configureServer(server) {
      server.middlewares.use('/api/decision', (req, res, next) => {
        if (req.method === 'GET') {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              configured: Boolean(apiKey),
              model: DECISION_MODEL
            })
          );
          return;
        }

        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: false, error: 'Método no permitido' }));
          return;
        }

        const chunks = [];
        let totalSize = 0;
        let aborted = false;

        req.on('data', (chunk) => {
          if (aborted) return;
          totalSize += chunk.length;
          if (totalSize > MAX_BODY_BYTES) {
            aborted = true;
            res.statusCode = 413;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: false, error: 'Archivo demasiado grande (máx 6 MB).' }));
            return;
          }
          chunks.push(chunk);
        });

        req.on('end', async () => {
          if (aborted) return;
          let body = {};
          try {
            const raw = Buffer.concat(chunks).toString('utf8');
            body = raw ? JSON.parse(raw) : {};
          } catch {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: false, error: 'JSON inválido' }));
            return;
          }

          try {
            const outcome = await executeDecisionAction({
              action: body?.action,
              payload: body?.payload || {},
              apiKey
            });
            res.statusCode = outcome.status || (outcome.ok ? 200 : 400);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(outcome));
          } catch (err) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(
              JSON.stringify({
                ok: false,
                error: err?.message || 'Error interno en /api/decision'
              })
            );
          }
        });

        req.on('error', (err) => {
          if (aborted) return;
          next(err);
        });
      });
    }
  };
}

function maicitosOfflinePrecacheSw() {
  return {
    name: 'maicitos-offline-precache-sw',
    closeBundle() {
      const distDir = path.resolve(process.cwd(), 'dist');
      const swPath = path.join(distDir, 'sw.js');
      const assetsDir = path.join(distDir, 'assets');
      if (!fs.existsSync(swPath)) return;

      let assetFiles = [];
      if (fs.existsSync(assetsDir)) {
        assetFiles = fs
          .readdirSync(assetsDir)
          .filter((f) => f.endsWith('.js') || f.endsWith('.css'))
          .sort()
          .map((f) => `/assets/${f}`);
      }

      const assetSnippet =
        assetFiles.length > 0
          ? ',\n' + assetFiles.map((f) => `  '${f}'`).join(',\n')
          : '';

      const versionTag = `maicitos-erp-v2-${Date.now()}`;
      const rawSw = fs.readFileSync(swPath, 'utf8');
      const updatedSw = rawSw
        .replace('__CACHE_VERSION__', versionTag)
        .replace('/*__PRECACHE_ASSETS__*/', assetSnippet);

      fs.writeFileSync(swPath, updatedSw, 'utf8');
    }
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const geminiApiKey = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';

  return {
    plugins: [react(), maicitosDecisionDevApi(geminiApiKey), maicitosOfflinePrecacheSw()],
    base: '/',
    server: {
      port: 3000,
      host: true
    }
  };
});
