import "server-only";
import { promises as fs } from "fs";
import path from "path";

// Small JSON-file persistence for the data/ directory (git-ignored). Works on a single long-lived server
// (`next start`, VPS); serverless hosts need these helpers swapped for a hosted database.

const DATA_DIR = path.join(process.cwd(), "data");

// One write queue per file so concurrent updates never overwrite each other
const queues = new Map<string, Promise<unknown>>();

const filePath = (name: string) => path.join(DATA_DIR, `${name}.json`);

export const readJson = async <T>(name: string, fallback: T): Promise<T> => {
  try {
    return JSON.parse(await fs.readFile(filePath(name), "utf8")) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw err;
  }
};

// Read-modify-write under the file's queue; the updater returns the new data plus a result for the caller
export const updateJson = <T, R>(name: string, fallback: T, updater: (current: T) => { data: T; result: R }): Promise<R> => {
  if (process.env.VERCEL) {
    // Vercel's filesystem is read-only; data must go to Postgres (see README)
    return Promise.reject(new Error("Database belum dikonfigurasi: hubungkan Postgres ke project Vercel ini."));
  }
  const previous = queues.get(name) ?? Promise.resolve();
  const task = previous.then(async () => {
    const { data, result } = updater(await readJson(name, fallback));
    await fs.mkdir(DATA_DIR, { recursive: true });
    // Write to a temp file then rename, so a crash mid-write never leaves a truncated file
    const tmpFile = `${filePath(name)}.${process.pid}.tmp`;
    await fs.writeFile(tmpFile, JSON.stringify(data, null, 2), "utf8");
    await fs.rename(tmpFile, filePath(name));
    return result;
  });
  queues.set(
    name,
    task.catch(() => undefined),
  );
  return task;
};
