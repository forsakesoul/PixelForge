import serverless from 'serverless-http';
import type { IncomingMessage, ServerResponse } from 'http';
// 引用 server 编译后的 JS（buildCommand 已先执行 server 的 tsc 构建）
// @ts-ignore - dist 路径在构建后才存在，编辑器静态检查会标红
import { createApp } from '../server/dist/server/src/app.js';

const app = createApp({ serveClient: false });
const handler = serverless(app);

export default async function vercelHandler(req: IncomingMessage, res: ServerResponse) {
  return handler(req, res);
}

export const config = {
  api: {
    bodyParser: false,
  },
};
