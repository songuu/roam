import { expect, type Page, type TestInfo } from '@playwright/test';

export class TravelApp {
  readonly externalImageFailures = new Set<string>();

  constructor(readonly page: Page) {
    page.on('requestfailed', request => {
      if (request.url().startsWith('https://images.unsplash.com/')) this.externalImageFailures.add(`${request.url()} ${request.failure()?.errorText}`);
    });
    page.on('response', response => {
      if (response.url().startsWith('https://images.unsplash.com/') && response.status() >= 400) this.externalImageFailures.add(`${response.url()} HTTP ${response.status()}`);
    });
  }

  button(name: string) {
    return this.page.getByRole('button', { name, exact: true });
  }

  async open() {
    await this.page.goto('/');
    await expect(this.button('生成我的行程')).toBeEnabled();
  }

  async navigate(name: '旅途手记' | '分享工作室' | '旅行偏好') {
    const openNavigation = this.button('打开导航');
    if (await openNavigation.isVisible()) await openNavigation.click();
    await this.page.getByRole('navigation', { name: '主要导航' }).getByRole('button', { name, exact: true }).click();
  }

  async download(name: string, outputPath: string) {
    const download = this.page.waitForEvent('download');
    await this.button(name).click();
    await (await download).saveAs(outputPath);
  }

  async capture(name: string, testInfo: TestInfo) {
    const outputPath = testInfo.outputPath(`${name}.png`);
    if (name.endsWith('home')) {
      const destination = this.page.getByRole('button', { name: /^探索/ }).last();
      if (await destination.count()) await destination.scrollIntoViewIfNeeded();
      // Remote photography can fail independently of the journey; wait for load/error,
      // then record any pending assets instead of gating the app on a third-party CDN.
      await this.page.waitForFunction(() => Array.from(document.images).every(photo => photo.complete), undefined, { timeout: 10000 }).catch(() => undefined);
      const images = await this.page.locator('img').evaluateAll(elements => elements.map(element => {
        const photo = element as HTMLImageElement;
        return { url: photo.src, complete: photo.complete, width: photo.naturalWidth };
      }));
      await testInfo.attach(`${name}-image-status`, { body: JSON.stringify({ failures: [...this.externalImageFailures], images }, null, 2), contentType: 'application/json' });
    }
    await this.page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await this.page.screenshot({ path: outputPath, fullPage: true });
    await testInfo.attach(name, { path: outputPath, contentType: 'image/png' });
  }

  async expectNoHorizontalOverflow() {
    expect(await this.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  }
}
