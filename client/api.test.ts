import { afterEach, describe, expect, it, vi } from 'vitest';
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });
describe('首次工作空间建立', () => {
  it('并发初始化共享同一请求，成功后允许刷新配置', async () => {
    const resolvers: ((value: Response) => void)[] = [];
    const fetchMock=vi.fn(()=>new Promise<Response>(resolve=>resolvers.push(resolve)));
    vi.stubGlobal('fetch',fetchMock);
    const {api}=await import('./api');
    const first=api.config(),second=api.config();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolvers[0](new Response(JSON.stringify({mode:'local'}),{status:200}));
    expect(await first).toEqual(await second);
    const refresh=api.config();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    resolvers[1](new Response(JSON.stringify({mode:'model'}),{status:200}));
    expect((await refresh).mode).toBe('model');
  });
  it('初始化失败后可重试，不缓存拒绝结果', async () => {
    const fetchMock=vi.fn().mockRejectedValueOnce(new Error('网络中断')).mockResolvedValueOnce(new Response(JSON.stringify({mode:'local'}),{status:200}));
    vi.stubGlobal('fetch',fetchMock);
    const {api}=await import('./api');
    await expect(api.config()).rejects.toThrow('网络中断');
    expect((await api.config()).mode).toBe('local');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
