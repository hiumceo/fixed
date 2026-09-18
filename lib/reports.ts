export type StoredReport = {
  path: string;
  filename: string;
};

const globalForReports = globalThis as typeof globalThis & {
  __v1124Reports?: Map<string, StoredReport>;
};

const reports =
  globalForReports.__v1124Reports ??
  new Map<string, StoredReport>();

globalForReports.__v1124Reports = reports;

export function registerReport(
  reportId: string,
  report: StoredReport
) {
  reports.set(reportId, report);
}

export function getReport(
  reportId: string
) {
  return reports.get(reportId);
}