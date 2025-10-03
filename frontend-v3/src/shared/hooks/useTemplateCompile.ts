import { useCallback, useRef, useState } from 'react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://100.93.158.19:8000';

export type CompileStatus = 'idle' | 'running' | 'success' | 'error' | 'cancelled';

export interface CompileResult {
  success: boolean;
  binary_filename: string | null;
  binary_path: string | null;
}

export const useTemplateCompile = () => {
  const [status, setStatus] = useState<CompileStatus>('idle');
  const [logLines, setLogLines] = useState<string[]>([]);
  const [result, setResult] = useState<CompileResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const resetCompilation = useCallback(() => {
    if (controllerRef.current) {
      controllerRef.current.abort();
      controllerRef.current = null;
    }
    setStatus('idle');
    setLogLines([]);
    setResult(null);
    setError(null);
  }, []);

  const appendLog = useCallback((line: string) => {
    if (!line) return;
    setLogLines((prev) => [...prev, line]);
  }, []);

  const startCompilation = useCallback(async (yaml: string) => {
    if (!yaml.trim()) {
      return;
    }

    if (controllerRef.current) {
      controllerRef.current.abort();
    }

    setStatus('running');
    setLogLines([]);
    setResult(null);
    setError(null);

    const controller = new AbortController();
    controllerRef.current = controller;

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/templates/compile-stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ yaml }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error(`Compile request failed (${response.status})`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let receivedCompletion = false;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let boundary = buffer.indexOf('\n\n');
        while (boundary !== -1) {
          const rawEvent = buffer.slice(0, boundary).trim();
          buffer = buffer.slice(boundary + 2);
          boundary = buffer.indexOf('\n\n');

          if (!rawEvent.startsWith('data:')) {
            continue;
          }

          const payloadText = rawEvent.replace(/^data:\s*/, '');
          if (!payloadText) continue;

          try {
            const payload = JSON.parse(payloadText);
            switch (payload.type) {
              case 'status':
              case 'output':
                if (payload.message) appendLog(payload.message);
                break;
              case 'error':
                if (payload.message) appendLog(payload.message);
                setStatus('error');
                setError(payload.message ?? 'Compilation error');
                receivedCompletion = true;
                break;
              case 'complete': {
                receivedCompletion = true;
                if (payload.message) appendLog(payload.message);
                const compileResult: CompileResult = {
                  success: Boolean(payload.success),
                  binary_filename: payload.binary_filename ?? null,
                  binary_path: payload.binary_path ?? null,
                };
                setResult(compileResult);
                setStatus(payload.success ? 'success' : 'error');
                if (!payload.success && payload.log) {
                  appendLog(payload.log);
                }
                break;
              }
              default:
                break;
            }
          } catch (err) {
            console.error('Failed to parse compilation event', err, payloadText);
          }
        }
      }

      if (controller.signal.aborted) {
        setStatus('cancelled');
        appendLog('Compilation cancelled.');
      } else if (!receivedCompletion) {
        setStatus('success');
        appendLog('Compilation complete.');
      }
    } catch (err) {
      if (controller.signal.aborted) {
        setStatus('cancelled');
        appendLog('Compilation cancelled.');
      } else {
        const message = err instanceof Error ? err.message : 'Compilation failed';
        setStatus('error');
        setError(message);
        appendLog(message);
      }
    } finally {
      controllerRef.current = null;
    }
  }, [appendLog]);

  const cancelCompilation = useCallback(() => {
    if (controllerRef.current) {
      controllerRef.current.abort();
    }
  }, []);

  return {
    status,
    logLines,
    result,
    error,
    startCompilation,
    cancelCompilation,
    resetCompilation,
  };
};
