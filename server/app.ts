import express, { type ErrorRequestHandler, type Request, type Response } from 'express';
import helmet from 'helmet';
import multer from 'multer';
import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { z, ZodError } from 'zod';
import { feedbackSchema, journalSchema, profileSchema, shareSchema, travelRequestSchema } from '../shared/schema';
import type { JournalEntry, JournalInput, Photo, TravelPlan } from '../shared/types';
import { generatePlan, PlannerError } from './planner';
import { destinations } from './catalog';
import { getAppConfig } from './providers';
import { interpretIntent, IntentError } from './intent';
import { Store, type Workspace } from './store';
import { createShareDraft } from './share';
import { exportPlan } from './exports';

class HttpError extends Error { constructor(readonly status: number, readonly code: string, message: string) { super(message); } }
const missing = () => new HttpError(404, 'NOT_FOUND', '内容不存在或不属于当前工作空间');
const routeId = (request: Request) => String(request.params.id);
const workspace = (response: Response) => response.locals.workspace as Workspace;
const cookieName = 'roam_workspace';
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const MAX_WORKSPACE_BYTES = 100 * 1024 * 1024;
const MAX_WORKSPACE_PHOTOS = 200;

export function createApp(options: { dataDir?: string; planner?: typeof generatePlan } = {}) {
  const app = express();
  const store = new Store(resolve(options.dataDir || process.env.DATA_DIR || join(process.cwd(), 'data')));
  const plan = options.planner || generatePlan;
  const planningWindows=new Map<string,{startedAt:number;count:number;active:number}>();
  let activePlans=0;
  const withPlanningLimit = async <T>(workspaceId: string,action: ()=>Promise<T>): Promise<T> => {
    const now=Date.now();
    for(const [id,window] of planningWindows) if(!window.active && now-window.startedAt>600_000) planningWindows.delete(id);
    const window=planningWindows.get(workspaceId) || {startedAt:now,count:0,active:0};
    planningWindows.set(workspaceId,window);
    if(window.count>=30 || window.active>=2 || activePlans>=4) throw new HttpError(429,'PLANNING_LIMIT','规划请求较多，请稍后再试（每个工作空间每 10 分钟最多 30 次）');
    window.count++; window.active++; activePlans++;
    try { return await action(); } finally { window.active--;activePlans--; }
  };
  app.locals.store = store;
  app.disable('x-powered-by');
  app.use(helmet({contentSecurityPolicy:process.env.NODE_ENV === 'production' ? {directives:{defaultSrc:["'self'"],scriptSrc:["'self'"],styleSrc:["'self'","'unsafe-inline'"],imgSrc:["'self'",'data:','blob:','https://images.unsplash.com','https://*.tile.openstreetmap.org'],connectSrc:["'self'"],objectSrc:["'none'"]}} : false, crossOriginResourcePolicy:{policy:'same-origin'}}));
  const serverPort = process.env.PORT || '3001';
  const allowedOrigins = new Set([`http://localhost:${serverPort}`,`http://127.0.0.1:${serverPort}`,'http://localhost:5173','http://127.0.0.1:5173',...(process.env.APP_ORIGIN || '').split(',').map(value=>value.trim()).filter(Boolean)]);
  app.use('/api', (request,response,next)=> {
    response.setHeader('Cache-Control','no-store');
    const origin=request.headers.origin;
    if (origin && !allowedOrigins.has(origin)) return next(new HttpError(403,'ORIGIN_FORBIDDEN','请求来源未获允许'));
    if (request.headers['sec-fetch-site'] === 'cross-site' && !['GET','HEAD','OPTIONS'].includes(request.method)) return next(new HttpError(403,'ORIGIN_FORBIDDEN','不接受跨站修改请求'));
    if (origin) { response.setHeader('Access-Control-Allow-Origin',origin); response.setHeader('Access-Control-Allow-Credentials','true'); response.vary('Origin'); }
    if (request.method === 'OPTIONS') { response.setHeader('Access-Control-Allow-Methods','GET,POST,PUT,PATCH,DELETE,OPTIONS'); response.setHeader('Access-Control-Allow-Headers','Content-Type,Authorization'); response.status(204).end(); return; }
    next();
  });
  app.use(express.json({limit:'128kb'}));
  app.get('/api/health', (_request,response)=>response.json({status:'ok'}));
  app.use('/api', (request,response,next)=> {
    const authorization = request.headers.authorization;
    let current: Workspace | undefined;
    if (authorization) {
      const token = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(authorization)?.[1];
      current = token ? store.workspaceByBearer(token) : undefined;
      if (!current) return next(new HttpError(401,'INVALID_TOKEN','工作空间令牌无效'));
    } else {
      const cookie = (request.headers.cookie || '').split(';').map(value=>value.trim()).find(value=>value.startsWith(cookieName+'='))?.slice(cookieName.length+1);
      current = cookie && /^[A-Za-z0-9_-]{43}$/.test(cookie) ? store.workspaceByCookie(cookie) : undefined;
      if (!current) {
        const created=store.createWorkspace(); current=created.workspace;
        response.cookie(cookieName,created.cookie,{httpOnly:true,sameSite:'lax',secure:process.env.COOKIE_SECURE === 'true',maxAge:365*24*60*60*1000,path:'/'});
      }
    }
    response.locals.workspace=current; next();
  });
  const tripFor = (response: Response,id: string): TravelPlan => { const trip=store.trip(workspace(response).id,id); if (!trip) throw missing(); return trip; };
  const entryFor = (response: Response,id: string) => { const entry=store.entry(workspace(response).id,id); if (!entry) throw missing(); return entry; };
  const dateInTrip = (date: string,trip: TravelPlan) => date>=trip.request.startDate && date<=trip.request.endDate;
  const photosFor = (response: Response,input: JournalInput): Photo[] => {
    const unique=[...new Set(input.photoIds)];
    return unique.map(id=> { const photo=store.photo(workspace(response).id,id); if(!photo) throw missing(); return {id:photo.id,url:`/api/photos/${photo.id}/file`,caption:photo.caption}; });
  };
  const removePhotoFile = (workspaceId: string,id: string) => {
    const photo=store.photo(workspaceId,id); if (!photo) return;
    rmSync(join(store.photosDirectory,photo.file),{force:true}); store.removePhoto(workspaceId,id);
  };
  const removeUnused = (workspaceId: string,ids: string[]) => { const referenced=new Set(store.entries(workspaceId).flatMap(entry=>entry.photos.map(photo=>photo.id))); for(const id of new Set(ids)) if(!referenced.has(id)) removePhotoFile(workspaceId,id); };

  app.get('/api/session', (_request,response)=>response.json({bearerToken:workspace(response).bearerToken,workspaceMode:'private-local'}));
  app.get('/api/config', (_request,response)=>response.json(getAppConfig('private-local')));
  app.get('/api/destinations', (_request,response)=>response.json(destinations));
  app.post('/api/intent', async (request,response)=> { const input=travelRequestSchema.parse(request.body); response.json(await withPlanningLimit(workspace(response).id,()=>interpretIntent(input))); });
  app.get('/api/profile', (_request,response)=>response.json(store.profile(workspace(response).id)));
  app.put('/api/profile', (request,response)=> { const input=profileSchema.parse(request.body); const current=store.profile(workspace(response).id); response.json(store.saveProfile(workspace(response).id,{...current,...input,updatedAt:new Date().toISOString()})); });
  app.delete('/api/profile/memory', (_request,response)=>response.json(store.transaction(()=>store.clearFeedback(workspace(response).id))));
  app.get('/api/trips', (_request,response)=>response.json(store.trips(workspace(response).id)));
  app.get('/api/trips/:id', (request,response)=>response.json(tripFor(response,routeId(request))));
  app.post('/api/trips', async (request,response)=> {
    const input=travelRequestSchema.parse(request.body); const workspaceId=workspace(response).id;
    if(store.trips(workspaceId).length>=100) throw new HttpError(413,'TRIP_LIMIT','工作空间最多保存 100 个行程，请删除不再需要的行程');
    const trip=await withPlanningLimit(workspaceId,()=>plan(input,store.profile(workspaceId))); store.insertTrip(workspaceId,trip); response.status(201).json(trip);
  });
  app.post('/api/trips/:id/replan', async (request,response)=> {
    const input=z.object({request:travelRequestSchema,revision:z.number().int().positive().optional()}).strict().parse(request.body);
    const previous=tripFor(response,routeId(request)); const workspaceId=workspace(response).id;
    const expected=input.revision ?? previous.revision;
    if(expected!==previous.revision) throw new HttpError(409,'REVISION_CONFLICT','行程已更新，请刷新后重新规划');
    const trip=await withPlanningLimit(workspaceId,()=>plan(input.request,store.profile(workspaceId),{id:previous.id,revision:previous.revision+1,createdAt:previous.createdAt}));
    store.transaction(()=> {
      if(store.entries(workspaceId,trip.id).some(entry=>!dateInTrip(entry.date,trip))) throw new HttpError(409,'JOURNAL_DATE_CONFLICT','新的旅行日期不包含已有旅途记录，请先调整记录');
      if(!store.replaceTrip(workspaceId,trip,expected)) throw new HttpError(409,'REVISION_CONFLICT','行程已更新，请刷新后重新规划');
      store.pruneFeedback(workspaceId,trip); store.recomputeLearning(workspaceId);
    }); response.json(trip);
  });
  app.delete('/api/trips/:id', (request,response)=> {
    const trip=tripFor(response,routeId(request)); const workspaceId=workspace(response).id;
    const photos=store.entries(workspaceId,trip.id).flatMap(entry=>entry.photos.map(photo=>photo.id));
    store.transaction(()=>{store.deleteTrip(workspaceId,trip.id);store.recomputeLearning(workspaceId);}); removeUnused(workspaceId,photos); response.status(204).end();
  });
  app.get('/api/trips/:id/journal', (request,response)=> { const trip=tripFor(response,routeId(request)); response.json(store.entries(workspace(response).id,trip.id)); });
  app.post('/api/trips/:id/journal', (request,response)=> {
    const trip=tripFor(response,routeId(request)); const input=journalSchema.parse(request.body);
    if(!dateInTrip(input.date,trip)) throw new HttpError(400,'JOURNAL_DATE_INVALID','记录日期必须在旅行日期内');
    if(store.entries(workspace(response).id).length>=500) throw new HttpError(413,'JOURNAL_LIMIT','工作空间最多保存 500 条旅途记录');
    const now=new Date().toISOString(); const {photoIds:_photoIds,...fields}=input;
    const entry: JournalEntry={...fields,id:randomUUID(),tripId:trip.id,photos:photosFor(response,input),createdAt:now,updatedAt:now};
    store.saveEntry(workspace(response).id,entry); response.status(201).json(entry);
  });
  app.patch('/api/journal/:id', (request,response)=> {
    const previous=entryFor(response,routeId(request)); const trip=tripFor(response,previous.tripId); const input=journalSchema.parse(request.body);
    if(!dateInTrip(input.date,trip)) throw new HttpError(400,'JOURNAL_DATE_INVALID','记录日期必须在旅行日期内');
    const {photoIds:_photoIds,...fields}=input; const entry={...previous,...fields,photos:photosFor(response,input),updatedAt:new Date().toISOString()};
    store.saveEntry(workspace(response).id,entry); removeUnused(workspace(response).id,previous.photos.map(photo=>photo.id)); response.json(entry);
  });
  app.delete('/api/journal/:id', (request,response)=> { const entry=entryFor(response,routeId(request)); const workspaceId=workspace(response).id; store.deleteEntry(workspaceId,entry.id); removeUnused(workspaceId,entry.photos.map(photo=>photo.id)); response.status(204).end(); });

  const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:MAX_PHOTO_BYTES,files:1,fields:0,parts:2}});
  app.post('/api/uploads', upload.single('photo'),async (request,response)=> {
    if(!request.file) throw new HttpError(400,'PHOTO_REQUIRED','请选择一张照片');
    let bitmap: Buffer;
    try {
      const image=sharp(request.file.buffer,{limitInputPixels:25_000_000,failOn:'warning'}); const metadata=await image.metadata();
      if(!['jpeg','png','webp','heif','avif'].includes(metadata.format || '') || !metadata.width || !metadata.height || (metadata.pages || 1)>1) throw new Error('Unsupported bitmap');
      bitmap=await image.rotate().resize({width:2000,height:2000,fit:'inside',withoutEnlargement:true}).jpeg({quality:85}).toBuffer();
    } catch { throw new HttpError(400,'INVALID_IMAGE','照片内容无效；请上传普通 JPG、PNG 或 WebP 图片'); }
    const workspaceId=workspace(response).id,id=randomUUID(),file=id+'.jpg';
    let fileCreated=false;
    try { store.transaction(()=> { const quota=store.photoQuota(workspaceId); if(quota.bytes+bitmap.length>MAX_WORKSPACE_BYTES || quota.count>=MAX_WORKSPACE_PHOTOS) throw new HttpError(413,'PHOTO_QUOTA','照片空间已满（最多 100MB 或 200 张），请删除旧照片'); writeFileSync(join(store.photosDirectory,file),bitmap,{flag:'wx',mode:0o600}); fileCreated=true; store.addPhoto({id,workspaceId,file,bytes:bitmap.length,caption:''}); }); }
    catch(error) { if(fileCreated) rmSync(join(store.photosDirectory,file),{force:true}); throw error; }
    response.status(201).json({id,url:`/api/photos/${id}/file`,caption:''} satisfies Photo);
  });
  app.get('/api/photos/:id/file', (request,response)=> { const photo=store.photo(workspace(response).id,routeId(request)); if(!photo) throw missing(); response.type('image/jpeg').sendFile(join(store.photosDirectory,photo.file),{dotfiles:'allow',headers:{'Cache-Control':'private, no-store','Content-Disposition':'inline'}}); });
  app.delete('/api/photos/:id', (request,response)=> {
    const workspaceId=workspace(response).id,id=routeId(request);
    const onlyUnreferenced=request.query.unreferenced === 'true';
    if(!store.photo(workspaceId,id)) {
      if(onlyUnreferenced) { response.status(204).end(); return; }
      throw missing();
    }
    const entries=store.entries(workspaceId);
    // A save may have committed even when its response was lost. Draft cleanup
    // must never delete a photo that already belongs to a persisted journal.
    if(onlyUnreferenced && entries.some(entry=>entry.photos.some(photo=>photo.id===id))) { response.status(204).end(); return; }
    store.transaction(()=>{for(const entry of entries) if(entry.photos.some(photo=>photo.id===id)) store.saveEntry(workspaceId,{...entry,photos:entry.photos.filter(photo=>photo.id!==id),updatedAt:new Date().toISOString()});});
    removePhotoFile(workspaceId,id); response.status(204).end();
  });
  app.post('/api/trips/:id/share', (request,response)=> {
    const trip=tripFor(response,routeId(request)); const input=shareSchema.parse(request.body); const available=store.entries(workspace(response).id,trip.id);
    if(input.entryIds?.some(id=>!available.some(entry=>entry.id===id))) throw missing();
    const entries=input.entryIds ? available.filter(entry=>input.entryIds!.includes(entry.id)) : available;
    if(!entries.length) throw new HttpError(422,'NO_JOURNAL','请先记录真实旅途经历，再生成分享文案');
    response.json(createShareDraft(trip,entries,input.platform));
  });
  app.post('/api/trips/:id/feedback', (request,response)=> {
    const trip=tripFor(response,routeId(request)); const input=feedbackSchema.parse(request.body); const workspaceId=workspace(response).id;
    const stop=trip.days.flatMap(day=>day.stops).find(stop=>stop.id===input.stopId);
    if(!stop || !stop.tags.includes(input.interest)) throw new HttpError(400,'FEEDBACK_INVALID','反馈必须对应当前行程的真实地点和兴趣标签');
    const profile=store.profile(workspaceId);
    if(!profile.memoryEnabled) { response.json(profile); return; }
    response.json(store.transaction(()=>{store.feedback(workspaceId,trip.id,input);return store.recomputeLearning(workspaceId);}));
  });
  app.get('/api/trips/:id/export', (request,response)=> { const trip=tripFor(response,routeId(request)); const format=z.enum(['markdown','json','ics']).parse(request.query.format || 'markdown'); const result=exportPlan(trip,format); response.setHeader('Content-Disposition',`attachment; filename="travel-${trip.id}.${result.extension}"`); response.type(result.type).send(result.content); });
  app.use('/api', (_request,_response,next)=>next(missing()));

  const buildDirectory=resolve(process.cwd(),'dist');
  if(existsSync(join(buildDirectory,'index.html'))) { app.use(express.static(buildDirectory)); app.get('/{*path}',(_request,response)=>response.sendFile(join(buildDirectory,'index.html'))); }
  const errors: ErrorRequestHandler=(error,request,response,_next)=> {
    if(response.headersSent) return;
    if(error instanceof ZodError) { response.status(400).json({error:{code:'VALIDATION_ERROR',message:error.issues[0]?.message || '请求参数无效'}}); return; }
    if(error instanceof multer.MulterError) { response.status(error.code==='LIMIT_FILE_SIZE'?413:400).json({error:{code:error.code,message:error.code==='LIMIT_FILE_SIZE'?'单张照片不能超过 8MB':'上传请求无效，请每次上传一张照片'}}); return; }
    if(error instanceof HttpError || error instanceof PlannerError || error instanceof IntentError) { response.status(error.status).json({error:{code:error.code,message:error.message}}); return; }
    if(error instanceof SyntaxError && 'body' in error) { response.status(400).json({error:{code:'INVALID_JSON',message:'请求 JSON 格式无效'}}); return; }
    if(error?.type==='entity.too.large') { response.status(413).json({error:{code:'PAYLOAD_TOO_LARGE',message:'请求内容过大'}}); return; }
    console.error(`[api] ${request.method} ${request.path} failed:`,error instanceof Error ? error.name : 'UnknownError');
    response.status(500).json({error:{code:'INTERNAL_ERROR',message:'处理请求失败，请稍后重试'}});
  };
  app.use(errors); return app;
}
