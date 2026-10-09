import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { defaultProfile } from '../shared/schema';
import { INTERESTS, type Feedback, type JournalEntry, type Profile, type TravelPlan } from '../shared/types';

export interface Workspace { id: string; cookieHash: string; bearerToken: string; profile: string }
export interface StoredPhoto { id: string; workspaceId: string; file: string; bytes: number; caption: string }
export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
export class Store {
  readonly database: DatabaseSync;
  readonly photosDirectory: string;
  constructor(dataDirectory: string) {
    mkdirSync(dataDirectory, { recursive: true });
    this.photosDirectory = join(dataDirectory, 'photos');
    mkdirSync(this.photosDirectory, {recursive:true});
    // Workspace credentials and private photographs belong to this process user.
    try { chmodSync(dataDirectory, 0o700); chmodSync(this.photosDirectory, 0o700); } catch { /* Windows uses inherited ACLs. */ }
    this.database = new DatabaseSync(join(dataDirectory, 'travel.sqlite'));
    this.database.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS workspaces(id TEXT PRIMARY KEY, cookieHash TEXT UNIQUE NOT NULL, bearerToken TEXT UNIQUE NOT NULL, bearerHash TEXT UNIQUE NOT NULL, profile TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS trips(id TEXT PRIMARY KEY, workspaceId TEXT NOT NULL REFERENCES workspaces(id), revision INTEGER NOT NULL, payload TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS trips_workspace ON trips(workspaceId);
      CREATE TABLE IF NOT EXISTS journals(id TEXT PRIMARY KEY, workspaceId TEXT NOT NULL REFERENCES workspaces(id), tripId TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE, payload TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS journals_trip ON journals(workspaceId,tripId);
      CREATE TABLE IF NOT EXISTS photos(id TEXT PRIMARY KEY, workspaceId TEXT NOT NULL REFERENCES workspaces(id), file TEXT NOT NULL, bytes INTEGER NOT NULL, caption TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS feedback(workspaceId TEXT NOT NULL REFERENCES workspaces(id), tripId TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE, stopId TEXT NOT NULL, interest TEXT NOT NULL, rating INTEGER NOT NULL, note TEXT NOT NULL, PRIMARY KEY(workspaceId,tripId,stopId));`);
  }
  close() { this.database.close(); }
  transaction<T>(action: () => T): T { this.database.exec('BEGIN IMMEDIATE'); try { const result = action(); this.database.exec('COMMIT'); return result; } catch(error) { this.database.exec('ROLLBACK'); throw error; } }
  createWorkspace() {
    const cookie = randomBytes(32).toString('base64url');
    const workspace: Workspace = {id:randomUUID(),cookieHash:tokenHash(cookie),bearerToken:randomBytes(32).toString('base64url'),profile:JSON.stringify(defaultProfile())};
    this.database.prepare('INSERT INTO workspaces VALUES(?,?,?,?,?)').run(workspace.id,workspace.cookieHash,workspace.bearerToken,tokenHash(workspace.bearerToken),workspace.profile);
    return {workspace,cookie};
  }
  workspaceByCookie(cookie: string) { return this.database.prepare('SELECT id,cookieHash,bearerToken,profile FROM workspaces WHERE cookieHash=?').get(tokenHash(cookie)) as unknown as Workspace | undefined; }
  workspaceByBearer(token: string) { return this.database.prepare('SELECT id,cookieHash,bearerToken,profile FROM workspaces WHERE bearerHash=?').get(tokenHash(token)) as unknown as Workspace | undefined; }
  profile(workspaceId: string): Profile { return JSON.parse((this.database.prepare('SELECT profile FROM workspaces WHERE id=?').get(workspaceId) as {profile:string}).profile) as Profile; }
  saveProfile(workspaceId: string, profile: Profile) { this.database.prepare('UPDATE workspaces SET profile=? WHERE id=?').run(JSON.stringify(profile),workspaceId); return profile; }
  trips(workspaceId: string): TravelPlan[] { return this.database.prepare('SELECT payload FROM trips WHERE workspaceId=? ORDER BY rowid DESC').all(workspaceId).map(row => JSON.parse(row.payload as string) as TravelPlan); }
  trip(workspaceId: string,id: string): TravelPlan | undefined { const row = this.database.prepare('SELECT payload FROM trips WHERE workspaceId=? AND id=?').get(workspaceId,id); return row ? JSON.parse(row.payload as string) as TravelPlan : undefined; }
  insertTrip(workspaceId: string, trip: TravelPlan) { this.database.prepare('INSERT INTO trips VALUES(?,?,?,?)').run(trip.id,workspaceId,trip.revision,JSON.stringify(trip)); }
  replaceTrip(workspaceId: string,trip: TravelPlan, expectedRevision: number) { return Number(this.database.prepare('UPDATE trips SET revision=?,payload=? WHERE workspaceId=? AND id=? AND revision=?').run(trip.revision,JSON.stringify(trip),workspaceId,trip.id,expectedRevision).changes) === 1; }
  deleteTrip(workspaceId: string, id: string) { this.database.prepare('DELETE FROM trips WHERE workspaceId=? AND id=?').run(workspaceId,id); }
  entries(workspaceId: string,tripId?: string): JournalEntry[] { return (tripId ? this.database.prepare('SELECT payload FROM journals WHERE workspaceId=? AND tripId=?').all(workspaceId,tripId) : this.database.prepare('SELECT payload FROM journals WHERE workspaceId=?').all(workspaceId)).map(row => JSON.parse(row.payload as string) as JournalEntry).sort((a,b)=>a.date.localeCompare(b.date)||a.createdAt.localeCompare(b.createdAt)); }
  entry(workspaceId: string,id: string): JournalEntry | undefined { const row=this.database.prepare('SELECT payload FROM journals WHERE workspaceId=? AND id=?').get(workspaceId,id); return row ? JSON.parse(row.payload as string) as JournalEntry : undefined; }
  saveEntry(workspaceId: string,entry: JournalEntry) { this.database.prepare('INSERT INTO journals VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload WHERE journals.workspaceId=excluded.workspaceId').run(entry.id,workspaceId,entry.tripId,JSON.stringify(entry)); }
  deleteEntry(workspaceId: string,id: string) { this.database.prepare('DELETE FROM journals WHERE workspaceId=? AND id=?').run(workspaceId,id); }
  photo(workspaceId: string,id: string) { return this.database.prepare('SELECT * FROM photos WHERE workspaceId=? AND id=?').get(workspaceId,id) as unknown as StoredPhoto | undefined; }
  addPhoto(photo: StoredPhoto) { this.database.prepare('INSERT INTO photos VALUES(?,?,?,?,?)').run(photo.id,photo.workspaceId,photo.file,photo.bytes,photo.caption); }
  photoQuota(workspaceId: string) { return this.database.prepare('SELECT COALESCE(SUM(bytes),0) AS bytes,COUNT(*) AS count FROM photos WHERE workspaceId=?').get(workspaceId) as {bytes:number;count:number}; }
  removePhoto(workspaceId: string,id: string) { this.database.prepare('DELETE FROM photos WHERE workspaceId=? AND id=?').run(workspaceId,id); }
  feedback(workspaceId: string,tripId: string,input: Feedback) { this.database.prepare('INSERT INTO feedback VALUES(?,?,?,?,?,?) ON CONFLICT(workspaceId,tripId,stopId) DO UPDATE SET interest=excluded.interest,rating=excluded.rating,note=excluded.note').run(workspaceId,tripId,input.stopId,input.interest,input.rating,input.note || ''); }
  pruneFeedback(workspaceId: string,trip: TravelPlan) { const tags = new Map(trip.days.flatMap(day=>day.stops.map(stop=>[stop.id,stop.tags] as const))); const rows=this.database.prepare('SELECT stopId,interest FROM feedback WHERE workspaceId=? AND tripId=?').all(workspaceId,trip.id); for (const row of rows) if (!tags.get(row.stopId as string)?.includes(row.interest as typeof INTERESTS[number])) this.database.prepare('DELETE FROM feedback WHERE workspaceId=? AND tripId=? AND stopId=?').run(workspaceId,trip.id,row.stopId as string); }
  clearFeedback(workspaceId: string) { this.database.prepare('DELETE FROM feedback WHERE workspaceId=?').run(workspaceId); return this.recomputeLearning(workspaceId); }
  recomputeLearning(workspaceId: string) { const profile=this.profile(workspaceId); const rows=this.database.prepare('SELECT interest,rating FROM feedback WHERE workspaceId=?').all(workspaceId); profile.learnedWeights=Object.fromEntries(INTERESTS.map(interest=>[interest,0])) as Profile['learnedWeights']; for (const row of rows) profile.learnedWeights[row.interest as typeof INTERESTS[number]] += Number(row.rating); for(const interest of INTERESTS) profile.learnedWeights[interest]=Math.max(-10,Math.min(10,profile.learnedWeights[interest])); profile.feedbackCount=rows.length; profile.updatedAt=new Date().toISOString(); return this.saveProfile(workspaceId,profile); }
}
