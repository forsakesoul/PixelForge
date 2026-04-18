import type { IncomingMessage, ServerResponse } from 'http';

// 不需要 serverless-http：Vercel Function 给的就是原生 (req, res)，
// Express app 本身可直接当 Node HTTP handler 使用。
// serverless-http 是 AWS API Gateway → Lambda event 的翻译层，
// 在 Vercel 上会试图把 req/res 当 Lambda event 解析，最终 10s 超时。

type ExpressApp = (req: IncomingMessage, res: ServerResponse) => void;

let appPromise: Promise<ExpressApp> | null = null;

async function getApp(): Promise<ExpressApp> {
  if (!appPromise) {
    appPromise = import('../server/src/app.js').then(
      ({ createApp }) => createApp({ serveClient: false }) as unknown as ExpressApp
    );
  }
  return appPromise;
}

export default async function vercelHandler(req: IncomingMessage, res: ServerResponse) {
  try {
    const app = await getApp();
    app(req, res);
  } catch (err) {
    console.error('[api/index] fatal error:', err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          code: 500,
          message: (err as Error)?.message ?? 'Internal Server Error',
          stack: process.env.VERCEL_ENV !== 'production' ? (err as Error)?.stack : undefined,
          data: null,
        })
      );
    }
  }
}
