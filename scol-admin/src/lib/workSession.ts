export type WorkSession = {
  batchId: string;
  rowIndex: number;
  universityKey: string;
  rowCount: number;
};

const WORK_SESSION_KEY = 'scolWorkSession';

export function getWorkSession(): WorkSession | null {
  const raw = localStorage.getItem(WORK_SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as WorkSession;
    if (
      parsed?.batchId &&
      typeof parsed.rowIndex === 'number' &&
      parsed.universityKey
    ) {
      return parsed;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function setWorkSession(session: WorkSession) {
  localStorage.setItem(WORK_SESSION_KEY, JSON.stringify(session));
}

export function updateWorkSessionRow(rowIndex: number, rowCount?: number) {
  const current = getWorkSession();
  if (!current) return;
  setWorkSession({
    ...current,
    rowIndex,
    rowCount: rowCount ?? current.rowCount,
  });
}

export function clearWorkSession() {
  localStorage.removeItem(WORK_SESSION_KEY);
}

export function workSessionPath(session: WorkSession): string {
  const row = Math.max(1, Math.min(session.rowIndex, session.rowCount || session.rowIndex));
  return `/work/${session.batchId}/rows/${row}`;
}
