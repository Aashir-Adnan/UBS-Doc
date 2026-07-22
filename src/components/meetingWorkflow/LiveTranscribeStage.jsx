import React, { useState, useRef, useEffect, useCallback } from 'react';
import { mwPost, mwPostForm } from './api';

const SEGMENT_MS = 60_000; // one segment per minute

function fmtTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ─── Timed Note Entry ─────────────────────────────────────────────────────────
function NoteInput({ elapsedSec, onAdd }) {
  const [text, setText] = useState('');

  function submit() {
    const t = text.trim();
    if (!t) return;
    onAdd({ text: t, at: elapsedSec });
    setText('');
  }

  return (
    <div className="lt-note-input-row">
      <span className="lt-note-timestamp">{fmtTime(elapsedSec)}</span>
      <input
        className="lt-note-input"
        placeholder="Add a note…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
      />
      <button type="button" className="lt-note-add-btn" onClick={submit} disabled={!text.trim()}>
        Save
      </button>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function LiveTranscribeStage({ meeting, detail, onDone, actingUrdd, canAI = true }) {
  const savedMeeting = detail?.meeting || {};
  const hasExistingTranscript = !!(savedMeeting.transcript || meeting.transcript);

  const [phase, setPhase] = useState('idle'); // idle | recording | processing | done | error
  const [elapsedSec, setElapsedSec] = useState(0);
  const [segments, setSegments] = useState([]); // { index, startSec, transcript, status }
  const [timedNotes, setTimedNotes] = useState([]);
  const [analysis, setAnalysis] = useState(savedMeeting.analysis_json || null);
  const [clarifications, setClarifications] = useState([]);
  const [error, setError] = useState('');
  const [segmentProcessing, setSegmentProcessing] = useState(false);

  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const segmentTimerRef = useRef(null);
  const elapsedRef = useRef(0);
  const segmentIndexRef = useRef(0);
  const segmentStartSecRef = useRef(0);

  // Keep elapsedRef in sync for use inside closures
  useEffect(() => { elapsedRef.current = elapsedSec; }, [elapsedSec]);

  function addTimedNote(note) {
    setTimedNotes((prev) => [...prev, note]);
  }

  // ── Send one audio blob segment to Whisper ──────────────────────────────────
  async function transcribeSegment(blob, segIdx, startSec) {
    setSegments((prev) => prev.map((s) =>
      s.index === segIdx ? { ...s, status: 'transcribing' } : s
    ));
    try {
      const fd = new FormData();
      fd.append('audio', blob, `segment_${segIdx}.webm`);
      fd.append('meeting_id', meeting.meeting_id);
      fd.append('segment_index', segIdx);
      fd.append('actionPerformerURDD', actingUrdd);
      const data = await mwPostForm('/meeting/workflow/transcribe', fd);
      const transcript = data.transcriptPreview || data.transcript || '(no speech detected)';
      setSegments((prev) => prev.map((s) =>
        s.index === segIdx ? { ...s, transcript, status: 'done' } : s
      ));
      return transcript;
    } catch (e) {
      setSegments((prev) => prev.map((s) =>
        s.index === segIdx ? { ...s, transcript: `[error: ${e.message}]`, status: 'error' } : s
      ));
      return `[transcription error]`;
    }
  }

  // ── Flush current recorder chunk and start a new one ───────────────────────
  function rotateSegment() {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== 'recording') return;

    const currentIdx = segmentIndexRef.current;
    const currentStartSec = segmentStartSecRef.current;

    // Collect data from current recorder
    recorder.stop(); // triggers ondataavailable → onstop

    // onstop handler (set below) restarts recording for the next segment
    segmentIndexRef.current = currentIdx + 1;
    segmentStartSecRef.current = elapsedRef.current;
  }

  // ── Start recording ─────────────────────────────────────────────────────────
  async function startRecording() {
    setError('');
    setSegments([]);
    setTimedNotes([]);
    setAnalysis(null);
    setClarifications([]);
    setElapsedSec(0);
    elapsedRef.current = 0;
    segmentIndexRef.current = 0;
    segmentStartSecRef.current = 0;

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      setError('Microphone access denied. Please allow microphone access and try again.');
      return;
    }
    streamRef.current = stream;

    function createRecorder(segIdx, startSec) {
      const chunks = [];
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : '';

      const opts = mimeType ? { mimeType } : {};
      const recorder = new MediaRecorder(stream, opts);

      // Add segment placeholder immediately
      setSegments((prev) => [
        ...prev,
        { index: segIdx, startSec, transcript: '', status: 'recording' },
      ]);

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType || 'audio/webm' });
        // Transcribe this segment in background
        transcribeSegment(blob, segIdx, startSec);

        // If still in recording phase, start next segment
        if (recorderRef.current === recorder && streamRef.current) {
          const nextIdx = segmentIndexRef.current;
          const nextStart = segmentStartSecRef.current;
          const next = createRecorder(nextIdx, nextStart);
          recorderRef.current = next;
          next.start();
        }
      };

      return recorder;
    }

    const firstRecorder = createRecorder(0, 0);
    recorderRef.current = firstRecorder;
    firstRecorder.start();

    // Elapsed timer — tick every second
    timerRef.current = setInterval(() => {
      setElapsedSec((s) => s + 1);
    }, 1000);

    // Segment rotation timer
    segmentTimerRef.current = setInterval(() => {
      rotateSegment();
    }, SEGMENT_MS);

    setPhase('recording');
  }

  // ── Stop recording ──────────────────────────────────────────────────────────
  function stopRecording() {
    clearInterval(timerRef.current);
    clearInterval(segmentTimerRef.current);

    const recorder = recorderRef.current;
    // Nullify stream ref so onstop doesn't spin up a new recorder
    const stream = streamRef.current;
    streamRef.current = null;
    recorderRef.current = null;

    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    }
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
    }

    setPhase('stopped');
  }

  // ── Run Claude analysis once segments are transcribed ───────────────────────
  async function runAnalysis() {
    setPhase('processing');
    setError('');

    // Wait briefly for any in-flight transcriptions to settle
    await new Promise((r) => setTimeout(r, 1500));

    // Read current segments from state via a ref-safe approach
    setSegments((currentSegments) => {
      const payload = buildPayload(currentSegments);
      submitAnalysis(payload);
      return currentSegments;
    });
  }

  function buildPayload(currentSegments) {
    // Build the structured meeting notes object
    const segmentMap = {};
    currentSegments.forEach((seg) => {
      const label = `segment_${seg.index + 1}`;
      const segNotes = timedNotes
        .filter((n) => n.at >= seg.startSec && n.at < (seg.startSec + SEGMENT_MS / 1000))
        .map((n) => `[${fmtTime(n.at)}] ${n.text}`)
        .join('\n');
      segmentMap[label] = {
        time_range: `${fmtTime(seg.startSec)} – ${fmtTime(seg.startSec + SEGMENT_MS / 1000)}`,
        transcription: seg.transcript || '(not yet transcribed)',
        user_notes: segNotes || null,
      };
    });

    return {
      meeting_id: meeting.meeting_id,
      meeting_notes: segmentMap,
      timed_notes: timedNotes,
      total_duration_sec: elapsedRef.current,
      actionPerformerURDD: actingUrdd,
    };
  }

  async function submitAnalysis(payload) {
    try {
      const data = await mwPost('/meeting/workflow/analyze-live', payload);
      setAnalysis(data);
      setClarifications(data.clarificationQuestions || []);
      setPhase('done');
      onDone?.();
    } catch (e) {
      setError(e.message);
      setPhase('error');
    }
  }

  // ── Cleanup on unmount ──────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      clearInterval(timerRef.current);
      clearInterval(segmentTimerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const isRecording = phase === 'recording';
  const isStopped = phase === 'stopped';
  const isProcessing = phase === 'processing';
  const isDone = phase === 'done';

  const allSegmentsDone = segments.length > 0 && segments.every((s) => s.status === 'done' || s.status === 'error');

  // Restore saved timed notes from DB when detail loads
  useEffect(() => {
    if (!detail?.meeting?.timed_notes_json) return;
    const saved = Array.isArray(detail.meeting.timed_notes_json)
      ? detail.meeting.timed_notes_json
      : [];
    if (saved.length > 0 && timedNotes.length === 0) {
      setTimedNotes(saved);
    }
  }, [detail]);

  // Restore saved analysis from DB when detail loads
  useEffect(() => {
    if (!detail?.meeting?.analysis_json) return;
    if (!analysis) setAnalysis(detail.meeting.analysis_json);
  }, [detail]);

  const savedTranscript = detail?.meeting?.transcript || meeting.transcript || '';
  const savedTimedNotes = Array.isArray(detail?.meeting?.timed_notes_json)
    ? detail.meeting.timed_notes_json
    : [];

  return (
    <div className="mw-stage-content lt-root">
      <h3 className="mw-stage-title">Live Transcription</h3>
      <p className="mw-stage-desc">
        Record the meeting live. Audio is transcribed in one-minute segments as you go.
        Add timestamped notes at any point — these are included in the Claude analysis alongside the transcript.
      </p>

      {/* ── Saved transcript (shown when revisiting an old meeting) ── */}
      {hasExistingTranscript && phase === 'idle' && (
        <div className="lt-saved-section">
          <div className="lt-section-label">Saved Transcript</div>
          <pre className="mw-pre lt-saved-transcript">{savedTranscript}</pre>
          {savedTimedNotes.length > 0 && (
            <div style={{ marginTop: '0.75rem' }}>
              <div className="lt-section-label">Saved Notes ({savedTimedNotes.length})</div>
              <ul className="lt-notes-list">
                {savedTimedNotes.map((n, i) => (
                  <li key={i} className="lt-note-item">
                    <span className="lt-note-time">{fmtTime(n.at)}</span>
                    <span className="lt-note-text">{n.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* ── Controls ── */}
      {phase === 'idle' && (
        <button
          className="mw-btn mw-btn--primary lt-record-btn"
          onClick={startRecording}
          disabled={!canAI}
          type="button"
          title={canAI ? undefined : "You need the 'run_meeting_ai' permission to transcribe meetings."}
        >
          <span className="lt-rec-dot lt-rec-dot--idle" /> {hasExistingTranscript ? 'Re-record Meeting' : 'Start Recording'}
        </button>
      )}

      {isRecording && (
        <div className="lt-recording-bar">
          <div className="lt-recording-left">
            <span className="lt-rec-dot lt-rec-dot--live" />
            <span className="lt-elapsed">{fmtTime(elapsedSec)}</span>
            <span className="lt-seg-hint">
              Segment {segmentIndexRef.current + 1} · {fmtTime(elapsedSec % (SEGMENT_MS / 1000))} / 1:00
            </span>
          </div>
          <button className="mw-btn mw-btn--danger" onClick={stopRecording} type="button">
            Stop Recording
          </button>
        </div>
      )}

      {isStopped && (
        <div className="lt-stopped-bar">
          <span className="lt-elapsed-final">Recorded {fmtTime(elapsedSec)}</span>
          {!allSegmentsDone && (
            <span className="lt-transcribing-hint">Finishing transcription…</span>
          )}
          <button
            className="mw-btn mw-btn--primary"
            onClick={runAnalysis}
            disabled={isProcessing || !canAI}
            type="button"
            title={canAI ? undefined : "You need the 'run_meeting_ai' permission to analyze the meeting."}
          >
            {isProcessing ? 'Analyzing with Claude…' : 'Analyze with Claude'}
          </button>
        </div>
      )}

      {isProcessing && (
        <div className="lt-processing">
          <span className="lt-spinner" />
          <span>Claude is analyzing your meeting…</span>
        </div>
      )}

      {error && <div className="mw-status mw-status--error">{error}</div>}

      {/* ── Live notes input (only while recording) ── */}
      {isRecording && (
        <div className="lt-notes-section">
          <div className="lt-section-label">Meeting Notes</div>
          <NoteInput elapsedSec={elapsedSec} onAdd={addTimedNote} />
          {timedNotes.length > 0 && (
            <ul className="lt-notes-list">
              {timedNotes.map((n, i) => (
                <li key={i} className="lt-note-item">
                  <span className="lt-note-time">{fmtTime(n.at)}</span>
                  <span className="lt-note-text">{n.text}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ── Segment transcripts ── */}
      {segments.length > 0 && (
        <div className="lt-segments">
          <div className="lt-section-label">Transcription Segments</div>
          {segments.map((seg) => (
            <div key={seg.index} className={`lt-segment lt-segment--${seg.status}`}>
              <div className="lt-segment-header">
                <span className="lt-segment-label">Segment {seg.index + 1}</span>
                <span className="lt-segment-time">{fmtTime(seg.startSec)}</span>
                <span className={`lt-segment-status lt-segment-status--${seg.status}`}>
                  {seg.status === 'recording' ? '● recording'
                    : seg.status === 'transcribing' ? '⟳ transcribing'
                    : seg.status === 'done' ? '✓ done'
                    : '✕ error'}
                </span>
              </div>
              {seg.transcript && (
                <p className="lt-segment-transcript">{seg.transcript}</p>
              )}
              {/* User notes that fall in this segment */}
              {(() => {
                const segEnd = seg.startSec + SEGMENT_MS / 1000;
                const notes = timedNotes.filter((n) => n.at >= seg.startSec && n.at < segEnd);
                return notes.length > 0 ? (
                  <ul className="lt-segment-notes">
                    {notes.map((n, i) => (
                      <li key={i}>
                        <span className="lt-note-time">{fmtTime(n.at)}</span>
                        <span className="lt-note-text">{n.text}</span>
                      </li>
                    ))}
                  </ul>
                ) : null;
              })()}
            </div>
          ))}
        </div>
      )}

      {/* ── Post-recording note review (before analysis) ── */}
      {isStopped && timedNotes.length > 0 && (
        <div className="lt-notes-section lt-notes-section--review">
          <div className="lt-section-label">Your Notes ({timedNotes.length})</div>
          <ul className="lt-notes-list">
            {timedNotes.map((n, i) => (
              <li key={i} className="lt-note-item">
                <span className="lt-note-time">{fmtTime(n.at)}</span>
                <span className="lt-note-text">{n.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Claude analysis output ── */}
      {(isDone || (phase === 'idle' && analysis)) && analysis && (
        <div className="lt-analysis">
          <div className="lt-section-label">Claude Analysis</div>

          {analysis.summary && (
            <p className="mw-summary">{analysis.summary}</p>
          )}

          {clarifications.length > 0 && (
            <div className="lt-clarifications">
              <div className="lt-clarifications-label">Questions for Clarification</div>
              <ol className="lt-clarifications-list">
                {clarifications.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ol>
            </div>
          )}

          {analysis.featuresIdentified?.length > 0 && (
            <div className="mw-chips-row" style={{ marginTop: '0.5rem' }}>
              <span className="mw-chips-label">Features identified:</span>
              {analysis.featuresIdentified.map((f, i) => (
                <span key={i} className="mw-chip mw-chip--platform">{f}</span>
              ))}
            </div>
          )}

          {analysis.markdown && (
            <div className="lt-output-tabs">
              <MdHtmlViewer markdown={analysis.markdown} html={analysis.html} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Markdown / HTML tab viewer ───────────────────────────────────────────────
function MdHtmlViewer({ markdown, html }) {
  const [view, setView] = useState(html ? 'html' : 'md');

  return (
    <div className="mw-note-editor" style={{ marginTop: '0.75rem' }}>
      <div className="mw-note-editor-header">
        <div className="mw-tab-row">
          {html && (
            <button
              className={`mw-tab${view === 'html' ? ' mw-tab--active' : ''}`}
              onClick={() => setView('html')}
              type="button"
            >
              HTML Preview
            </button>
          )}
          <button
            className={`mw-tab${view === 'md' ? ' mw-tab--active' : ''}`}
            onClick={() => setView('md')}
            type="button"
          >
            Markdown
          </button>
        </div>
      </div>
      {view === 'html' && html && (
        <iframe
          srcDoc={html}
          title="Meeting Notes"
          className="mw-html-iframe"
          sandbox="allow-same-origin"
        />
      )}
      {view === 'md' && (
        <div className="mw-notes-panel">
          <pre className="mw-pre" style={{ maxHeight: '60vh', overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
            {markdown}
          </pre>
        </div>
      )}
    </div>
  );
}
