import { cp, mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';

const frontendDistDir = path.resolve('welfare-frontend', 'dist');
const backendPublicDir = path.resolve('welfare-backend', 'dist', 'public');

async function ensureFrontendBuild() {
  try {
    const currentStat = await stat(frontendDistDir);
    if (!currentStat.isDirectory()) {
      throw new Error('前端 dist 不是目录');
    }
  } catch (error) {
    throw new Error(
      `未找到前端构建产物，请先执行 welfare-frontend 构建：${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

await ensureFrontendBuild();
await rm(backendPublicDir, { recursive: true, force: true });
await mkdir(path.dirname(backendPublicDir), { recursive: true });
await cp(frontendDistDir, backendPublicDir, { recursive: true });

console.log(`[build] 已同步前端静态资源到 ${backendPublicDir}`);
