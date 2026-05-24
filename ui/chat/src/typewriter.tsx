import { useState, useEffect, useRef } from "react";

interface Props {
  text: string;
  speed?: number;
  onComplete?: () => void;
  children: (displayed: string) => React.ReactNode;
}

export function Typewriter({ text, speed = 20, onComplete, children }: Props) {
  const [displayed, setDisplayed] = useState("");
  const indexRef = useRef(0);
  const completedRef = useRef(false);

  useEffect(() => {
    indexRef.current = 0;
    completedRef.current = false;
    setDisplayed("");

    const interval = setInterval(() => {
      indexRef.current++;
      if (indexRef.current >= text.length) {
        setDisplayed(text);
        clearInterval(interval);
        if (!completedRef.current) {
          completedRef.current = true;
          onComplete?.();
        }
      } else {
        setDisplayed(text.slice(0, indexRef.current));
      }
    }, speed);

    return () => clearInterval(interval);
  }, [text, speed, onComplete]);

  return <>{children(displayed)}</>;
}
