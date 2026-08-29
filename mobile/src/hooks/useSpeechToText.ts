import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";

/**
 * Dictation via the platform's own speech recognition.
 *
 * We do not implement speech recognition — this wraps what the platform
 * already provides.
 *
 * JUDGEMENT CALL (see the feature summary): on web this uses the browser's
 * built-in SpeechRecognition, which needs no key and no extra dependency. On
 * iOS and Android, native on-device recognition requires a config plugin and
 * a custom development build (Expo Go cannot load one), plus the microphone
 * and speech-recognition permission strings. Rather than ship a dependency
 * that silently fails in Expo Go, this hook reports `supported: false` on
 * native and the UI keeps typing available. Wiring the native module is a
 * follow-up, and typing must remain a first-class path regardless — dictation
 * is unreliable for someone in pain, distressed, or breathless.
 */

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
}

function getBrowserRecognition(): (new () => SpeechRecognitionLike) | null {
  if (Platform.OS !== "web" || typeof window === "undefined") return null;
  const w = window as any;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export interface UseSpeechToText {
  supported: boolean;
  listening: boolean;
  error: string | null;
  start: () => void;
  stop: () => void;
}

export function useSpeechToText(
  onTranscript: (text: string) => void
): UseSpeechToText {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  // Held in a ref so restarting recognition doesn't need a fresh listener.
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  const Recognition = getBrowserRecognition();
  const supported = Recognition !== null;

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  const start = useCallback(() => {
    if (!Recognition) {
      setError(
        "Dictation isn't available on this device yet. You can type your description instead."
      );
      return;
    }

    setError(null);
    try {
      const recognition = new Recognition();
      recognition.lang = "en-US";
      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.onresult = (event: any) => {
        const transcript = Array.from(event.results as ArrayLike<any>)
          .map((result: any) => result[0]?.transcript ?? "")
          .join(" ")
          .trim();
        if (transcript) onTranscriptRef.current(transcript);
      };

      recognition.onerror = (event: any) => {
        setError(
          event?.error === "not-allowed"
            ? "Microphone access was blocked. You can type your description instead."
            : "Dictation didn't work. You can type your description instead."
        );
        setListening(false);
      };

      recognition.onend = () => setListening(false);

      recognitionRef.current = recognition;
      recognition.start();
      setListening(true);
    } catch {
      setError("Dictation didn't start. You can type your description instead.");
      setListening(false);
    }
  }, [Recognition]);

  useEffect(() => {
    // Stop the microphone if the screen goes away mid-dictation.
    return () => recognitionRef.current?.abort();
  }, []);

  return { supported, listening, error, start, stop };
}
