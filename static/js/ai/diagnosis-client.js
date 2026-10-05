(function initDiagnosisClient(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.KFAIDiagnosisClient = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createDiagnosisClient() {
  'use strict';

  const config = Object.freeze({
    supabaseUrl: 'https://xzetqijeucldbfgjuoes.supabase.co',
    supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh6ZXRxaWpldWNsZGJmZ2p1b2VzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1NjIwODYsImV4cCI6MjA5NTEzODA4Nn0.QAizDLXQC1DrRi5C0sPahK6s_-6X4zkTEjzJZ6CFprw',
    diagnosisFunction: 'bright-action',
    accountDeletionFunction: 'request-account-deletion'
  });

  function functionUrl(name) {
    return `${config.supabaseUrl}/functions/v1/${encodeURIComponent(name)}`;
  }

  function buildRequest(input = {}) {
    const symptom = String(input.symptom || '').trim();
    const crop = String(input.crop || '').trim();
    const cultivationEnv = String(input.cultivationEnv || '').trim();
    const region = String(input.region || '').trim();
    const detail = [
      crop ? `작물명: ${crop}` : '',
      cultivationEnv ? `재배환경: ${cultivationEnv}` : '',
      symptom ? `증상: ${symptom}` : ''
    ].filter(Boolean).join('\n');
    const payload = { symptom: detail || symptom, crop, cultivationEnv, region };
    if (input.imageBase64) payload.image_base64 = String(input.imageBase64);
    return payload;
  }

  async function analyze(input, options = {}) {
    const fetchImpl = options.fetchImpl || globalThis.fetch;
    if (typeof fetchImpl !== 'function') throw new Error('DIAGNOSIS_FETCH_UNAVAILABLE');
    const response = await fetchImpl(functionUrl(config.diagnosisFunction), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.supabaseAnonKey}`
      },
      body: JSON.stringify(buildRequest(input)),
      signal: options.signal
    });
    if (!response.ok) throw new Error(`DIAGNOSIS_HTTP_${response.status}`);
    const data = await response.json();
    if (!data || typeof data !== 'object') throw new Error('DIAGNOSIS_INVALID_RESPONSE');
    return data;
  }

  return Object.freeze({ config, functionUrl, buildRequest, analyze });
});
