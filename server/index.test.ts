import { describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('服务启动失败', () => {
  it('占用端口返回非零退出并显示上下文，不误报就绪', async () => {
    const occupied = createServer();
    await new Promise<void>(resolve => occupied.listen(0, '127.0.0.1', resolve));
    const address = occupied.address();
    if (!address || typeof address === 'string') throw new Error('测试端口创建失败');
    const dataDir = mkdtempSync(join(tmpdir(), 'roam-startup-'));
    try {
      const result = await new Promise<{code:number|null;output:string}>((resolve, reject) => {
        const child = spawn(process.execPath, ['--import','tsx','server/index.ts'], { cwd: process.cwd(), env: {...process.env,PORT:String(address.port),HOST:'127.0.0.1',DATA_DIR:dataDir}, windowsHide:true });
        let output = '';
        child.stdout.on('data', chunk => output += chunk);
        child.stderr.on('data', chunk => output += chunk);
        child.on('error', reject);
        child.on('close', code => resolve({code,output}));
      });
      expect(result.code).toBe(1);
      expect(result.output).toContain(String(address.port));
      expect(result.output).not.toContain('is ready');
    } finally {
      await new Promise<void>(resolve => occupied.close(() => resolve()));
      rmSync(dataDir, {recursive:true,force:true});
    }
  });
});
