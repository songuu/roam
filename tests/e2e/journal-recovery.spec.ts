import { test, expect, type Page } from '@playwright/test';
import sharp from 'sharp';
import { travelRequestSchema } from '../../shared/schema';
import type { JournalEntry, Photo, TravelPlan } from '../../shared/types';
import { TravelApp } from './pages/travel-app';

async function openJournal(page: Page) {
  const app = new TravelApp(page);
  await app.open();
  const response = await page.request.post('/api/trips', {
    data: travelRequestSchema.parse({ destination: '成都', startDate: '2026-11-06', endDate: '2026-11-08', adults: 2, budget: 6000 }),
  });
  expect(response.ok()).toBe(true);
  const plan = await response.json() as TravelPlan;
  await page.reload();
  await expect(app.button('生成我的行程')).toBeEnabled();
  await app.navigate('旅途手记');
  await expect(page.getByRole('heading', { name: '第一篇回忆，从此刻开始' })).toBeVisible();
  return { app, plan };
}

async function uploadPhoto(page: Page, name: string): Promise<Photo> {
  const bitmap = await sharp({ create: { width: 160, height: 120, channels: 3, background: '#527a65' } }).png().toBuffer();
  const uploaded = page.waitForResponse(response => response.url().endsWith('/api/uploads') && response.request().method() === 'POST');
  await page.getByLabel('上传旅途照片').setInputFiles({ name, mimeType: 'image/png', buffer: bitmap });
  const response = await uploaded;
  expect(response.ok()).toBe(true);
  await expect(page.getByRole('button', { name: '保存手记', exact: true })).toBeEnabled();
  const photo = await response.json() as Photo;
  expect((await page.request.get(photo.url)).status()).toBe(200);
  return photo;
}

test('删除正在编辑的手记，同时清理新上传的临时照片', async ({ page }) => {
  const { app, plan } = await openJournal(page);
  await page.getByLabel('手记标题').fill('准备编辑的手记');
  await page.getByLabel('旅途记载').fill('记录真实的城市漫步。');
  const original = await uploadPhoto(page, 'original.png');
  await app.button('保存手记').click();
  await expect(page.getByRole('heading', { name: '准备编辑的手记', exact: true })).toBeVisible();
  await app.button('编辑手记准备编辑的手记').click();
  await expect(page.getByRole('heading', { name: '编辑这一刻', exact: true })).toBeVisible();
  const temporary = await uploadPhoto(page, 'temporary.png');
  page.once('dialog', dialog => dialog.accept());
  await app.button('删除手记准备编辑的手记').click();
  await expect(page.getByRole('heading', { name: '第一篇回忆，从此刻开始' })).toBeVisible();
  expect(await (await page.request.get(`/api/trips/${plan.id}/journal`)).json()).toEqual([]);
  expect((await page.request.get(original.url)).status()).toBe(404);
  expect((await page.request.get(temporary.url)).status()).toBe(404);
  await expect(page.getByLabel('手记标题')).toHaveValue('');
});

test('保存响应丢失后清空草稿，已保存的手记和照片仍然存在', async ({ page }) => {
  const { app, plan } = await openJournal(page);
  await page.getByLabel('手记标题').fill('网络中断前的回忆');
  await page.getByLabel('旅途记载').fill('照片已经被服务器妥善保存。');
  const photo = await uploadPhoto(page, 'persisted.png');
  await page.route(`**/api/trips/${plan.id}/journal`, async route => {
    // Persist the real write first, then reproduce a response lost in transit.
    const response = await route.fetch();
    expect(response.status()).toBe(201);
    await route.abort('failed');
  }, { times: 1 });
  await app.button('保存手记').click();
  await expect(page.getByRole('alert')).toBeVisible();
  const entries = await (await page.request.get(`/api/trips/${plan.id}/journal`)).json() as JournalEntry[];
  expect(entries).toHaveLength(1);
  expect(entries[0].photos[0].id).toBe(photo.id);
  await app.button('清空草稿').click();
  await expect(page.getByLabel('手记标题')).toHaveValue('');
  expect((await page.request.get(photo.url)).status()).toBe(200);
  await page.reload();
  await expect(app.button('生成我的行程')).toBeEnabled();
  await app.navigate('旅途手记');
  await expect(page.getByRole('heading', { name: '网络中断前的回忆', exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: '网络中断前的回忆的旅途照片', exact: true })).toBeVisible();
});
