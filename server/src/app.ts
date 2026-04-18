import express from 'express';
import cors from 'cors';
import { uploadRouter } from './routes/upload.js';
import { compressRouter } from './routes/compress.js';
import { quotaRouter } from './routes/quota.js';
import { adminRouter } from './routes/admin.js';
import { errorHandler } from './middleware/errorHandler.js';

export interface CreateAppOptions {
  serveClient?: boolean;
  clientDistDir?: string;
}

export function createApp(opts: CreateAppOptions = {}): express.Express {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  app.use('/api/upload', uploadRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api', quotaRouter);
  app.use('/api', compressRouter);

  if (opts.serveClient && opts.clientDistDir) {
    app.use(express.static(opts.clientDistDir));
    app.get('*', (_req, res) => {
      res.sendFile(`${opts.clientDistDir}/index.html`);
    });
  }

  app.use(errorHandler);
  return app;
}
