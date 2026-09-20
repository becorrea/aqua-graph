import { useEffect, useRef, useState } from "react";

/**
 * Interpola um valor numérico até o alvo.
 *
 * Usado nos KPIs que mudam durante simulações — a leitura precisa parecer um
 * indicador subindo, não um número trocando de golpe.
 */
export function useAnimatedNumber(target: number, duration = 900) {
  const [value, setValue] = useState(target);
  const valueRef = useRef(target);
  valueRef.current = value;

  useEffect(() => {
    const from = valueRef.current;
    if (from === target) return;

    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - progress) ** 3;
      setValue(from + (target - from) * eased);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);

  return value;
}
