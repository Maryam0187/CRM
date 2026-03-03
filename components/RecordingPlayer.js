'use client';

import React, { useState, useEffect } from 'react';
import apiClient from '../lib/apiClient';

/**
 * Fetches a short-lived stream URL and renders an audio player.
 * Use for authenticated playback (no Twilio credentials on client).
 */
export default function RecordingPlayer({ callLogId, index = 0, recordingDuration, className = '' }) {
  const [streamUrl, setStreamUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (callLogId == null) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setStreamUrl(null);

    apiClient
      .get(`/api/calls/recording/stream-url?callLogId=${callLogId}&index=${index}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.success && data.url) {
          setStreamUrl(data.url);
        } else {
          setError(data.error || 'Could not load recording');
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || 'Failed to load recording');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [callLogId, index]);

  if (loading) {
    return (
      <div className={`text-sm text-gray-500 ${className}`}>
        Loading recording…
      </div>
    );
  }
  if (error) {
    return (
      <div className={`text-sm text-red-600 ${className}`}>
        {error}
      </div>
    );
  }
  if (!streamUrl) return null;

  return (
    <audio controls className={`w-full max-w-md ${className}`}>
      <source src={streamUrl} type="audio/wav" />
      Your browser does not support the audio element.
    </audio>
  );
}
