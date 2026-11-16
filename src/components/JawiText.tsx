import type { HTMLAttributes } from 'react';

/**
 * Renders Jawi in its logical Unicode order with RTL direction so the browser
 * performs bidi layout and contextual letter joining. Never reverse strings.
 */
export function JawiText({ text, className = '', ...rest }: { text: string } & HTMLAttributes<HTMLSpanElement>) {
  return (
    <span lang="ms-Arab" dir="rtl" className={`font-jawi ${className}`} {...rest}>
      {text}
    </span>
  );
}
