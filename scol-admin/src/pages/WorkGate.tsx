import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { LoadingSplash } from '../components/LoadingSplash';
import { apiFetch } from '../lib/api';
import { clearWorkSession } from '../lib/workSession';
import { RowEditorPage } from './RowEditorPage';
import { UniversityRowEditorPage } from './UniversityRowEditorPage';

export function WorkGate() {
  const { batchId } = useParams();
  const navigate = useNavigate();
  const [batchType, setBatchType] = useState<string | null>(null);

  useEffect(() => {
    if (!batchId) return;
    let cancelled = false;
    apiFetch<{ batchType?: string }>(`/data-entry/batches/${batchId}`)
      .then((b) => {
        if (!cancelled) setBatchType(b.batchType ?? 'COURSE');
      })
      .catch(() => {
        clearWorkSession();
        navigate('/destinations', { replace: true });
      });
    return () => {
      cancelled = true;
    };
  }, [batchId, navigate]);

  if (!batchType) {
    return (
      <LoadingSplash title="Opening batch" subtitle="Checking batch type…" />
    );
  }
  if (batchType === 'UNIVERSITY') {
    return <UniversityRowEditorPage />;
  }
  return <RowEditorPage />;
}
