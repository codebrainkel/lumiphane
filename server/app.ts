import express from 'express';
import { createEmailExportRouter } from './emailExportRouter';
import { createPrintOrderRouter } from './printOrderRouter';

export function createApp(): express.Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(createPrintOrderRouter());
  app.use(createEmailExportRouter());
  return app;
}
