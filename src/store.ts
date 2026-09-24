import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { errorMessage, logger } from "./logger.js";

export type Phase = "debrid" | "downloading" | "completed" | "error";

export interface FileTask {
  path: string[];
  size: number;
  link: string;
  downloaded: number;
  done: boolean;
}

export interface Job {
  hash: string;
  name: string;
  category: string;
  savePath: string;
  addedOn: number;
  completedOn?: number;
  debridId: number;
  debridStatusCode: number;
  debridProgress: number;
  debridRemoved?: boolean;
  phase: Phase;
  size: number;
  downloadSpeed: number;
  files: FileTask[];
  error?: string;
}

interface State {
  categories: string[];
  jobs: Job[];
}

/** Liste des téléchargements, sauvegardée sur disque pour survivre aux redémarrages. */
export class JobStore {
  private readonly jobs = new Map<string, Job>();
  readonly categories = new Set<string>();
  private timer: NodeJS.Timeout | undefined;
  private writing = Promise.resolve();

  constructor(private readonly file: string) {}

  async load(): Promise<void> {
    let raw: string;
    try {
      raw = await readFile(this.file, "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
      throw err;
    }
    const state = JSON.parse(raw) as State;
    for (const category of state.categories ?? []) this.categories.add(category);
    for (const job of state.jobs ?? []) this.jobs.set(job.hash, job);
  }

  get(hash: string): Job | undefined {
    return this.jobs.get(hash.toLowerCase());
  }

  all(): Job[] {
    return [...this.jobs.values()];
  }

  add(job: Job): void {
    this.jobs.set(job.hash, job);
    if (job.category) this.categories.add(job.category);
    this.save();
  }

  remove(hash: string): void {
    this.jobs.delete(hash.toLowerCase());
    this.save();
  }

  addCategory(name: string): void {
    this.categories.add(name);
    this.save();
  }

  /** Planifie une sauvegarde (regroupe les modifications rapprochées). */
  save(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.flush().catch((err) => logger.error(`Sauvegarde de l'état impossible : ${errorMessage(err)}`));
    }, 1000);
  }

  flush(): Promise<void> {
    clearTimeout(this.timer);
    this.timer = undefined;
    const state: State = { categories: [...this.categories], jobs: this.all() };
    this.writing = this.writing.catch(() => {}).then(async () => {
      await mkdir(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      await writeFile(tmp, JSON.stringify(state, null, 2));
      await rename(tmp, this.file);
    });
    return this.writing;
  }
}
