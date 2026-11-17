import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AdminShell } from '../components/AdminShell';
import { FilePickField } from '../components/FilePickField';
import { LoadingSplash } from '../components/LoadingSplash';
import { apiFetch } from '../lib/api';
import type { BatchItem, BatchKind, CountryUniversityItem } from '../lib/batches';
import { parseBatchKind } from '../lib/batches';
import { uploadFileToCloudinary } from '../lib/cloudinaryUpload';
import type { CloudinarySignedUpload } from '../lib/cloudinaryUpload';
import { HELPER_TABS, type HelperKey } from '../lib/helpers';
import { resolveInitialRowIndex } from '../lib/initialWorkRow';
import { setWorkSession } from '../lib/workSession';
import type { DestinationItem } from '../lib/batches';

type UploadUrlResponse = {
  batchId: string;
  csv: CloudinarySignedUpload;
  helpers: Partial<Record<HelperKey, CloudinarySignedUpload>>;
};

export function ImportCsvPage() {
  const navigate = useNavigate();
  const { countryId } = useParams();
  const [params] = useSearchParams();
  const uploadType = parseBatchKind(params.get('type'));
  const sysUniversityId = params.get('sysUniversityId');
  const [country, setCountry] = useState<DestinationItem | null>(null);
  const [uniName, setUniName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [helperFiles, setHelperFiles] = useState<Partial<Record<HelperKey, File>>>(
    {},
  );

  const listPath = `/destinations/${countryId}`;
  const title = country?.countryName ?? 'Destination';
  const courseBlocked = uploadType === 'COURSE' && !sysUniversityId;

  useEffect(() => {
    if (!countryId) return;
    let cancelled = false;
    (async () => {
      try {
        const destinations = await apiFetch<DestinationItem[]>(
          '/data-entry/destinations',
        );
        if (cancelled) return;
        setCountry(
          destinations.find((d) => d.sysCountryId === countryId) ?? null,
        );
        if (sysUniversityId) {
          const unis = await apiFetch<CountryUniversityItem[]>(
            `/data-entry/destinations/${countryId}/universities`,
          );
          if (cancelled) return;
          setUniName(
            unis.find((u) => u.sysUniversityId === sysUniversityId)?.uniName ??
              null,
          );
        }
        setLoading(false);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Failed to load country');
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [countryId, sysUniversityId]);

  const helperKeys = useMemo(
    () => Object.keys(helperFiles) as HelperKey[],
    [helperFiles],
  );

  async function submitUpload() {
    if (!countryId || !csvFile) return;
    if (uploadType === 'COURSE' && !sysUniversityId) return;
    setBusy(true);
    setError(null);
    try {
      const body: {
        sysCountryId: string;
        type: BatchKind;
        fileName: string;
        fileSizeBytes: number;
        helperKeys: HelperKey[];
        sysUniversityId?: string;
      } = {
        sysCountryId: countryId,
        type: uploadType,
        fileName: csvFile.name,
        fileSizeBytes: csvFile.size,
        helperKeys: uploadType === 'COURSE' ? helperKeys : [],
      };
      if (uploadType === 'COURSE' && sysUniversityId) {
        body.sysUniversityId = sysUniversityId;
      }
      const signed = await apiFetch<UploadUrlResponse>(
        '/data-entry/batches/upload-url',
        {
          method: 'POST',
          body: JSON.stringify(body),
        },
      );
      await uploadFileToCloudinary(csvFile, signed.csv);
      for (const key of helperKeys) {
        const file = helperFiles[key];
        const payload = signed.helpers[key];
        if (file && payload) {
          await uploadFileToCloudinary(file, payload);
        }
      }
      const batch = await apiFetch<BatchItem>(
        `/data-entry/batches/${signed.batchId}/confirm-upload`,
        { method: 'POST', body: JSON.stringify({}) },
      );
      const rowIndex = await resolveInitialRowIndex(batch.id, {
        rowCount: batch.rowCount,
        invalidRowCount: batch.invalidRowCount,
      });
      setWorkSession({
        batchId: batch.id,
        rowIndex,
        universityKey:
          uniName || country?.countryName || 'batch',
        rowCount: batch.rowCount,
      });
      navigate(`/work/${batch.id}/rows/${rowIndex}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <AdminShell>
        <LoadingSplash title="Loading import" subtitle="Reading destination…" />
      </AdminShell>
    );
  }

  if (busy) {
    return (
      <AdminShell>
        <LoadingSplash
          title="Uploading to Cloudinary"
          subtitle="Signing, uploading CSV, then staging rows from Cloudinary…"
        />
      </AdminShell>
    );
  }

  return (
    <AdminShell>
      <div className="mx-auto max-w-3xl p-6">
        <header className="mb-6">
          <Link
            to={listPath}
            className="text-sm font-bold text-slate-600 hover:text-slate-900"
          >
            ← Back to {title}
          </Link>
          <h1 className="mt-2 text-2xl font-bold">
            Import {uploadType === 'UNIVERSITY' ? 'university' : 'course'} CSV
          </h1>
          <p className="mt-1 text-sm font-bold text-slate-600">
            {uploadType === 'COURSE' && uniName
              ? `${uniName} · ${title}`
              : title}
            . Files go to Cloudinary; the API only reads them.
          </p>
        </header>

        {error && <p className="mb-4 text-sm font-bold text-red-600">{error}</p>}

        {courseBlocked ? (
          <p className="font-bold text-slate-700">
            Pick a published university on the destination page, then import its
            course CSV.
          </p>
        ) : (
          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">
              Upload {uploadType === 'UNIVERSITY' ? 'university' : 'course'} CSV
            </h2>
            <FilePickField
              label="CSV file"
              accept=".csv,text/csv"
              file={csvFile}
              onFile={setCsvFile}
              cta={
                uploadType === 'UNIVERSITY'
                  ? 'Choose university CSV'
                  : 'Choose course CSV'
              }
              hint="Click or drop a .csv file"
            />
            {uploadType === 'COURSE' && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {HELPER_TABS.map((h) => (
                  <FilePickField
                    key={h.key}
                    label={h.label}
                    accept=".md,text/markdown,text/plain"
                    file={helperFiles[h.key] ?? null}
                    onFile={(file) => {
                      setHelperFiles((prev) => {
                        const next = { ...prev };
                        if (file) next[h.key] = file;
                        else delete next[h.key];
                        return next;
                      });
                    }}
                    cta="Choose markdown"
                    hint="Optional .md"
                  />
                ))}
              </div>
            )}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                disabled={!csvFile}
                onClick={() => void submitUpload()}
                className="rounded bg-emerald-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
              >
                Upload to Cloudinary
              </button>
              <Link
                to={listPath}
                className="rounded border border-slate-300 px-4 py-2 text-sm font-bold"
              >
                Cancel
              </Link>
            </div>
          </section>
        )}
      </div>
    </AdminShell>
  );
}
