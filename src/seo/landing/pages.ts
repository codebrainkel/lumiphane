import { howToPage } from './pages/howTo';
import { lampPage } from './pages/lamp';
import { photoPage } from './pages/photo';
import { printedPage } from './pages/printed';
import { settingsPage } from './pages/settings';
import type { LandingPage } from './types';

/** Learning order: tutorial, photo, lamp, printing, settings. */
export const LANDING_PAGES: readonly LandingPage[] = [
  howToPage,
  photoPage,
  lampPage,
  printedPage,
  settingsPage,
];
