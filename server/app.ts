import express from 'express';
import { createEmailExportRouter } from './emailExportRouter';
import { createPrintOrderRouter } from './printOrderRouter';
import { createTipRouter } from './tipRouter';

export function createApp(): express.Express {
  const app = express();
  app.use(createPrintOrderRouter());
  app.use(createEmailExportRouter());
  app.use(createTipRouter());
  return app;
}
