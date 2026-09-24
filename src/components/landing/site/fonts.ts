import { EB_Garamond, Plus_Jakarta_Sans } from 'next/font/google';

/** Landing-only faces; the dashboard keeps Inter + Fraunces. */
export const landingSerif = EB_Garamond({
  subsets: ['latin'],
  variable: '--font-lp-serif-face',
  style: ['normal', 'italic'],
});

export const landingSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-lp-sans-face',
});
