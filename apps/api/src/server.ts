import { loadApiRuntimeConfig } from '@signal/config';
import { buildApp } from './app';
import { initFirebaseAdmin } from './lib/firebase-admin';

const config = loadApiRuntimeConfig();
initFirebaseAdmin(config.firebaseProjectId);

async function start() {
  const app = buildApp(config);

  try {
    await app.listen({ port: config.port, host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  function shutdown() {
    app.log.info('Shutting down');
    app.close().then(() => process.exit(0));
  }

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

start();
