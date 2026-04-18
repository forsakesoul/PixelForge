import type { IncomingMessage, ServerResponse } from 'http';

// 注意：这里引用 **源码**，不是 dist。Vercel @vercel/node (ncc) 会把 TS 源
// 一并打包进 function bundle。dist 路径在某些构建管线里会解析不到，导致
// 冷启动直接崩溃（返回 Vercel 的 "An error occurred" HTML 页）。
async function initHandler() {
  const [{ default: serverless }, { createApp }] = await Promise.all([
    import('serverless-http'),
    import('../server/src/app.js'),
  ]);
  const app = createApp({ serveClient: false });
  return serverless(app);
}

let handlerPromise: Promise<ReturnType<Awaited<ReturnType<typeof initHandler>>>> | null = null;
let handler: Awaited<ReturnType<typeof initHandler>> | null = null;

async function getHandler() {
  if (handler) return handler;
  if (!handlerPromise) {
    handlerPromise = initHandler().then((h) => {
      handler = h;
      return h as never;
    });
  }
  return handlerPromise;
}

export default async function vercelHandler(req: IncomingMessage, res: ServerResponse) {
  try {
    const h = await getHandler();
    return await (h as unknown as (req: IncomingMessage, res: ServerResponse) => Promise<void>)(req, res);
  } catch (err) {
    console.error('[api/index] fatal error:', err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          code: 500,
          message:
            (err as Error)?.message ??
            'Internal Server Error',
          stack: process.env.VERCEL_ENV === 'production' ? undefined : (err as Error)?.stack,
          data: null,
        })
      );
    }
  }
}
