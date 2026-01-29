import { useState } from 'react';
import { API_BASE_URL } from './config';

export default function BugReport() {
  const [subject, setSubject] = useState('Bug Report');
  const [message, setMessage] = useState(
    'I am having a problem with the website',
  );
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus('');

    try {
      setLoading(true);
      const res = await fetch(`${API_BASE_URL}/api/custom/send/email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: 'aashiradnan99@gmail.com',
          subject,
          message,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || 'Failed to send email');
      }

      setStatus('Email sent successfully.');
    } catch (err) {
      setStatus(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="portal-card portal-card-hover">
      <div className="portal-section-header">
        <h3>Notify maintainer</h3>
        <p>Send a quick email to report bugs or request changes.</p>
      </div>

      <form className="bug-form" onSubmit={handleSubmit}>
        <label className="bug-field">
          <span>Subject</span>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
          />
        </label>

        <label className="bug-field">
          <span>Message</span>
          <textarea
            rows={4}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Describe the issue or request"
          />
        </label>

        <button type="submit" className="bug-submit" disabled={loading}>
          {loading ? 'Sending...' : 'Send email'}
        </button>
      </form>

      {status && <p className="bug-status">{status}</p>}
    </div>
  );
}
