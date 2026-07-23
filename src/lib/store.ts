/**
 * Durable domain storage — Redis when REDIS_URL is set, otherwise an
 * in-memory StorageAdapter (same pattern as toolkit session storage).
 *
 * Keys are explicit; collections are read through INDEX records only
 * (no KEYS/SCAN/readAll). Call resetDomainStore() between harness specs
 * when using the memory backend so state does not leak across tests.
 */
import type { StorageAdapter } from "grammy";
import { MemorySessionStorage } from "../toolkit/session/memory.js";
import type {
  FoodItem,
  GlobalSettings,
  LogEntry,
  UserProfile,
} from "./types.js";
import { DEFAULT_SETTINGS } from "./types.js";
import { SEED_FOODS } from "./foods.js";

type Json = unknown;

let memory: MemorySessionStorage<Json> | null = null;
let redisAdapter: StorageAdapter<Json> | null = null;
let redisInit: Promise<StorageAdapter<Json>> | null = null;

function memoryStore(): MemorySessionStorage<Json> {
  if (!memory) memory = new MemorySessionStorage<Json>();
  return memory;
}

async function backend(): Promise<StorageAdapter<Json>> {
  const url = typeof process !== "undefined" ? process.env.REDIS_URL : undefined;
  if (!url) return memoryStore();
  if (redisAdapter) return redisAdapter;
  if (!redisInit) {
    redisInit = (async () => {
      const { createRequire } = await import("node:module");
      const require = createRequire(import.meta.url);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ioredis: any = require("ioredis");
      const Redis = ioredis.default ?? ioredis.Redis ?? ioredis;
      const client = new Redis(url, { maxRetriesPerRequest: null, lazyConnect: false });
      const prefix = "cal:";
      const adapter: StorageAdapter<Json> = {
        async read(key) {
          const raw = await client.get(prefix + key);
          if (raw == null) return undefined;
          try {
            return JSON.parse(raw) as Json;
          } catch {
            return undefined;
          }
        },
        async write(key, value) {
          await client.set(prefix + key, JSON.stringify(value));
        },
        async delete(key) {
          await client.del(prefix + key);
        },
      };
      redisAdapter = adapter;
      return adapter;
    })();
  }
  return redisInit;
}

async function get<T>(key: string): Promise<T | undefined> {
  const b = await backend();
  return (await b.read(key)) as T | undefined;
}

async function set<T>(key: string, value: T): Promise<void> {
  const b = await backend();
  await b.write(key, value as Json);
}

async function del(key: string): Promise<void> {
  const b = await backend();
  await b.delete(key);
}

/** Wipe memory backend (tests / fresh Node process without Redis). */
export function resetDomainStore(): void {
  const url = typeof process !== "undefined" ? process.env.REDIS_URL : undefined;
  if (url) return; // never wipe Redis
  memory = new MemorySessionStorage<Json>();
}

// ── keys ──────────────────────────────────────────────────────────────
const kProfile = (uid: number) => `profile:${uid}`;
const kLog = (uid: number, id: string) => `log:${uid}:${id}`;
const kDayIndex = (uid: number, dateKey: string) => `logday:${uid}:${dateKey}`;
const kDays = (uid: number) => `logdays:${uid}`;
const kUsers = () => `users:index`;
const kFoods = () => `foods:all`;
const kSettings = () => `settings:global`;
const kIdSeq = () => `seq:entry`;

// ── profiles ──────────────────────────────────────────────────────────

export async function getProfile(userId: number): Promise<UserProfile | undefined> {
  return get<UserProfile>(kProfile(userId));
}

export async function saveProfile(profile: UserProfile): Promise<void> {
  await set(kProfile(profile.userId), profile);
  const idx = (await get<number[]>(kUsers())) ?? [];
  if (!idx.includes(profile.userId)) {
    idx.push(profile.userId);
    await set(kUsers(), idx);
  }
}

export async function listUserIds(): Promise<number[]> {
  return (await get<number[]>(kUsers())) ?? [];
}

// ── food database ─────────────────────────────────────────────────────

export async function ensureFoodsSeeded(): Promise<FoodItem[]> {
  let foods = await get<FoodItem[]>(kFoods());
  if (!foods || foods.length === 0) {
    foods = SEED_FOODS.map((f) => ({ ...f }));
    await set(kFoods(), foods);
  }
  return foods;
}

export async function listFoods(): Promise<FoodItem[]> {
  return ensureFoodsSeeded();
}

export async function getFood(id: string): Promise<FoodItem | undefined> {
  const foods = await listFoods();
  return foods.find((f) => f.id === id);
}

export async function upsertFood(item: FoodItem): Promise<void> {
  const foods = await listFoods();
  const i = foods.findIndex((f) => f.id === item.id);
  if (i >= 0) foods[i] = item;
  else foods.push(item);
  await set(kFoods(), foods);
}

export async function removeFood(id: string): Promise<boolean> {
  const foods = await listFoods();
  const next = foods.filter((f) => f.id !== id);
  if (next.length === foods.length) return false;
  await set(kFoods(), next);
  return true;
}

// ── log entries ───────────────────────────────────────────────────────

async function nextEntryId(): Promise<string> {
  const n = ((await get<number>(kIdSeq())) ?? 0) + 1;
  await set(kIdSeq(), n);
  return `e${n}`;
}

export async function addLogEntry(
  partial: Omit<LogEntry, "id"> & { id?: string },
): Promise<LogEntry> {
  const id = partial.id ?? (await nextEntryId());
  const entry: LogEntry = { ...partial, id };
  await set(kLog(entry.userId, id), entry);

  const dayKey = kDayIndex(entry.userId, entry.dateKey);
  const dayIds = (await get<string[]>(dayKey)) ?? [];
  if (!dayIds.includes(id)) {
    dayIds.push(id);
    await set(dayKey, dayIds);
  }

  const days = (await get<string[]>(kDays(entry.userId))) ?? [];
  if (!days.includes(entry.dateKey)) {
    days.push(entry.dateKey);
    days.sort();
    await set(kDays(entry.userId), days);
  }
  return entry;
}

export async function getLogEntry(
  userId: number,
  id: string,
): Promise<LogEntry | undefined> {
  return get<LogEntry>(kLog(userId, id));
}

export async function updateLogEntry(entry: LogEntry): Promise<void> {
  await set(kLog(entry.userId, entry.id), entry);
}

export async function deleteLogEntry(userId: number, id: string): Promise<boolean> {
  const entry = await getLogEntry(userId, id);
  if (!entry) return false;
  await del(kLog(userId, id));
  const dayKey = kDayIndex(userId, entry.dateKey);
  const dayIds = ((await get<string[]>(dayKey)) ?? []).filter((x) => x !== id);
  if (dayIds.length === 0) {
    await del(dayKey);
    const days = ((await get<string[]>(kDays(userId))) ?? []).filter(
      (d) => d !== entry.dateKey,
    );
    await set(kDays(userId), days);
  } else {
    await set(dayKey, dayIds);
  }
  return true;
}

export async function listEntriesForDay(
  userId: number,
  dateKey: string,
): Promise<LogEntry[]> {
  const ids = (await get<string[]>(kDayIndex(userId, dateKey))) ?? [];
  const out: LogEntry[] = [];
  for (const id of ids) {
    const e = await getLogEntry(userId, id);
    if (e) out.push(e);
  }
  out.sort((a, b) => a.timestamp - b.timestamp);
  return out;
}

/** Up to `limit` recent dateKeys (newest first) that have entries. */
export async function listRecentDays(
  userId: number,
  limit = 30,
): Promise<string[]> {
  const days = (await get<string[]>(kDays(userId))) ?? [];
  return days.slice().sort().reverse().slice(0, limit);
}

export async function listAllEntries(userId: number): Promise<LogEntry[]> {
  const days = (await get<string[]>(kDays(userId))) ?? [];
  const out: LogEntry[] = [];
  for (const d of days) {
    out.push(...(await listEntriesForDay(userId, d)));
  }
  out.sort((a, b) => a.timestamp - b.timestamp);
  return out;
}

// ── settings ──────────────────────────────────────────────────────────

export async function getSettings(): Promise<GlobalSettings> {
  return (await get<GlobalSettings>(kSettings())) ?? { ...DEFAULT_SETTINGS };
}

export async function saveSettings(s: GlobalSettings): Promise<void> {
  await set(kSettings(), s);
}
