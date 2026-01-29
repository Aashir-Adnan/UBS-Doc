import { useState } from 'react';
import { API_BASE_URL } from './config';

export default function LucidSanitize() {
  const [file, setFile] = useState(null);
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) return setResult('Select a file first');

    const formData = new FormData();
    formData.append('file', file);

    try {
      setLoading(true);
      setResult('');

      const res = await fetch(`${API_BASE_URL}/api/sanitize/lucid/chart`, {
        method: 'POST',
        body: formData,
      });

      const contentType = res.headers.get('content-type') || '';

      if (
        contentType.includes('application/zip') ||
        contentType.includes('application/octet-stream')
      ) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download =
          file.name?.replace(/\.[^.]+$/, '-sanitized.xml') ||
          'lucid-sanitized.xml';
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        setResult('Sanitized file downloaded.');
      } else {
        const text = await res.text();
        setResult(text || (res.ok ? 'Done.' : 'Request failed.'));
      }
    } catch (err) {
      setResult('Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="file-upload-root">
      <div className="file-upload-header">
        <h2>Sanitize Lucid chart export</h2>
        <p>Upload a Lucid chart export file to sanitize it.</p>
      </div>

      <form className="file-upload-form" onSubmit={handleSubmit}>
        <label className="file-input-label">
          <span className="file-input-text">
            {file ? file.name : 'Choose file'}
          </span>
          <input
            type="file"
            accept=".xml,.csv,.xlsx,.lucid"
            onChange={(e) => setFile(e.target.files?.[0])}
          />
        </label>

        <button type="submit" className="file-upload-button" disabled={loading}>
          {loading ? 'Sanitizing…' : 'Sanitize'}
        </button>
      </form>

      {loading && (
        <div className="file-upload-status">
          <span className="status-label">Processing…</span>
          <span className="status-spinner" aria-hidden="true" />
        </div>
      )}

      {result && <pre className="file-upload-output">{result}</pre>}
    </div>
  );
}
