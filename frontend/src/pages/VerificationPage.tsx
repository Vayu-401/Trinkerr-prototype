import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { errorMessage } from "../api/client";
import { ALLOWED_TYPES, DOC_TYPES, MAX_BYTES, docTypeLabel, verificationApi } from "../api/verification";
import { useAuth } from "../auth/AuthContext";
import { PageHeader } from "../components/Layout";
import { useToast } from "../components/Toast";
import { ErrorBox, Loading, StatusChip, formatBytes, formatDate } from "../components/ui";

const MESSAGES = {
  unverified: "Upload at least one document. An admin checks it and unlocks surveys, posts and your dashboard.",
  pending: "An admin is reviewing your documents. You can add more while you wait.",
  rejected: "Your documents weren't accepted. Read the note below, then upload a clearer or different document.",
  verified: "You're verified. Surveys, posts and your dashboard are open to you.",
};

export default function VerificationPage() {
  const { user, refreshUser } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [docType, setDocType] = useState<string>("pan");
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const q = useQuery({ queryKey: ["verification", "me"], queryFn: verificationApi.me });

  const upload = useMutation({
    mutationFn: () => verificationApi.upload(file!, docType),
    onSuccess: async () => {
      toast.success("Document uploaded. It's now waiting for review.");
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      await Promise.all([qc.invalidateQueries({ queryKey: ["verification", "me"] }), refreshUser()]);
    },
    onError: (e) => toast.error(errorMessage(e, "Upload failed. Try again.")),
  });

  function pick(f: File | null) {
    setFileError(null);
    setFile(null);
    if (!f) return;
    if (!ALLOWED_TYPES.includes(f.type)) return setFileError("Use a PDF, JPG or PNG file.");
    if (f.size > MAX_BYTES) return setFileError("Files must be 5 MB or smaller.");
    setFile(f);
  }

  if (q.isLoading) return <Loading />;
  if (q.isError) return <ErrorBox>{errorMessage(q.error)}</ErrorBox>;
  const data = q.data!;
  const status = data.status;
  const docs = data.documents;
  const limitReached = docs.length >= 5;

  return (
    <div className="max-w-2xl">
      <PageHeader title="Verify your investor account" />

      <section className="panel p-6">
        <div className="flex items-center gap-3">
          <StatusChip status={status} />
          {status === "verified" && (
            <button className="btn-link" onClick={() => navigate("/")}>
              Go to the feed
            </button>
          )}
        </div>
        <p className="mt-3 text-muted">{MESSAGES[status]}</p>
        {status === "rejected" && data.note && (
          <blockquote className="mt-4 border-l-4 border-brick bg-brick-soft/60 px-4 py-3 text-sm">
            <span className="font-semibold">Reviewer's note:</span> {data.note}
          </blockquote>
        )}
        {status !== "verified" && (
          <button
            className="btn-link mt-4"
            disabled={q.isFetching}
            onClick={async () => {
              await Promise.all([q.refetch(), refreshUser()]);
              toast.success("Status refreshed");
            }}
          >
            Check status again
          </button>
        )}
      </section>

      {status !== "verified" && user?.role === "investor" && (
        <section className="mt-8">
          <h2>Upload a document</h2>
          <p className="mt-1 text-sm text-muted">PDF, JPG or PNG, up to 5 MB. You can upload five documents in total.</p>
          <form
            className="mt-4 grid gap-4 sm:grid-cols-[180px_1fr]"
            onSubmit={(e) => {
              e.preventDefault();
              if (file) upload.mutate();
            }}
          >
            <div>
              <label className="label" htmlFor="doc-type">Document type</label>
              <select id="doc-type" className="input" value={docType} onChange={(e) => setDocType(e.target.value)}>
                {DOC_TYPES.map((d) => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="doc-file">File</label>
              <input
                id="doc-file"
                ref={fileRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                className="input file:mr-3 file:rounded file:border-0 file:bg-line file:px-3 file:py-1 file:text-sm file:font-semibold"
                onChange={(e) => pick(e.target.files?.[0] ?? null)}
                disabled={limitReached}
              />
              {fileError && <p className="field-error">{fileError}</p>}
            </div>
            <div className="sm:col-span-2">
              <button className="btn-primary" disabled={!file || upload.isPending || limitReached}>
                {upload.isPending ? "Uploading…" : "Upload document"}
              </button>
              {limitReached && <span className="ml-3 text-sm text-muted">You've reached the five-document limit.</span>}
            </div>
          </form>
        </section>
      )}

      <section className="mt-10">
        <h2>Your documents</h2>
        {docs.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Nothing uploaded yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line border-y border-line">
            {docs.map((d) => (
              <li key={d.id} className="flex flex-wrap items-baseline justify-between gap-2 py-3">
                <div>
                  <div className="font-medium">{d.original_filename}</div>
                  <div className="text-sm text-muted">{docTypeLabel(d.doc_type)}, {formatBytes(d.size_bytes)}</div>
                </div>
                <span className="text-sm text-muted">Uploaded {formatDate(d.uploaded_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
