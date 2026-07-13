import React from 'react';

declare global {
  namespace React {
    namespace JSX {
      interface IntrinsicElements {
        'elevenlabs-convai': React.DetailedHTMLProps<
          React.HTMLAttributes<HTMLElement> & {
            'agent-id'?: string | null;
            'disable-banner'?: string | null;
            'dynamic-variables'?: string | null;
          },
          HTMLElement
        >;
      }
    }
  }
}
