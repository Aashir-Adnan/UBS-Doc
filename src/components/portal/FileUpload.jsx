import { useState } from 'react';
import { API_BASE_URL } from './config';

export default function FileUpload() {
  const [file, setFile] = useState(null);
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) return setResult('Select a file first');

    const formData = new FormData();
    formData.append('sqlFile', file);

    try {
      setLoading(true);
      setResult('');

      const res = await fetch(
        `${API_BASE_URL}/api/gen/objects?admin_email=aashiradnan99@gmail.com`,
        {
          method: 'POST',
          body: formData,
        },
      );

      const contentType = res.headers.get('content-type');

      if (contentType?.includes('application/zip')) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'GenOutput.zip';
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        setResult('ZIP downloaded successfully!');
      } else {
        const text = await res.text();
        setResult(text);
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
        <h2>Upload SQL File</h2>
        <p>Mount a database schema to generate internal resources.</p>
      </div>

      <form className="file-upload-form" onSubmit={handleSubmit}>
        <label className="file-input-label">
          <span className="file-input-text">
            {file ? file.name : 'Choose .sql file'}
          </span>
          <input
            type="file"
            accept=".sql"
            onChange={(e) => setFile(e.target.files?.[0])}
          />
        </label>

        <button type="submit" className="file-upload-button">
          Upload &amp; Mount DB
        </button>
      </form>

      {loading && (
        <div className="file-upload-status">
          <span className="status-label">Processing file...</span>
          <span className="status-spinner" aria-hidden="true" />
        </div>
      )}

      {result && <pre className="file-upload-output">{result}</pre>}
    </div>
  );
}
