import type { AccountInfo } from "./alldebrid.js";
import { config } from "./config.js";
import { recentLogs } from "./logger.js";
import { fileProgress, jobProgress } from "./manager.js";
import { relativeSegments } from "./paths.js";
import type { Job, JobStore } from "./store.js";

const STARTED_AT = Date.now();

/** Dernier état connu du compte AllDebrid, rafraîchi périodiquement. */
export interface AccountState {
  info?: AccountInfo;
  error?: string;
  checkedAt?: number;
}

/** Étape affichée dans l'interface. */
type Stage = "queued" | "debrid" | "downloading" | "completed" | "error";

const STAGE_ORDER: Record<Stage, number> = { downloading: 0, debrid: 1, queued: 2, error: 3, completed: 4 };

function stage(job: Job): Stage {
  if (job.phase === "debrid") return job.debridStatusCode === 0 ? "queued" : "debrid";
  return job.phase;
}

function compareJobs(a: Job, b: Job): number {
  const byStage = STAGE_ORDER[stage(a)] - STAGE_ORDER[stage(b)];
  if (byStage !== 0) return byStage;
  return (b.completedOn ?? b.addedOn) - (a.completedOn ?? a.addedOn);
}

/** Données renvoyées à l'interface web (GET /ui/status). */
export function dashboardStatus(store: JobStore, account: AccountState) {
  const jobs = store
    .all()
    .sort(compareJobs)
    .map((job) => {
      const progress = jobProgress(job);
      const remaining = Math.max(0, job.size * (1 - progress));
      const active = job.phase === "debrid" || job.phase === "downloading";
      const speed = active ? Math.round(job.downloadSpeed) : 0;
      return {
        hash: job.hash,
        name: job.name,
        category: job.category,
        stage: stage(job),
        progress,
        size: job.size,
        downloaded: Math.round(job.size - remaining),
        speed,
        eta: speed > 0 ? Math.round(remaining / speed) : null,
        addedOn: job.addedOn,
        completedOn: job.completedOn ?? null,
        error: job.error ?? null,
        files: job.files.map((file) => ({
          name: relativeSegments(job, file).join("/"),
          size: file.size,
          progress: fileProgress(file),
        })),
      };
    });

  return {
    now: Date.now(),
    startedAt: STARTED_AT,
    downloadDir: config.downloadDir,
    pollIntervalMs: config.pollIntervalMs,
    account: {
      username: account.info?.username ?? null,
      isPremium: account.info?.isPremium ?? false,
      premiumUntil: account.info?.premiumUntil ? account.info.premiumUntil * 1000 : null,
      error: account.error ?? null,
      checkedAt: account.checkedAt ?? null,
    },
    jobs,
    logs: recentLogs(),
  };
}
