import { INestApplication } from '@nestjs/common';
import { json, urlencoded } from 'express';

/** Keep ordinary JSON small while accepting existing, full-precision note drafts. */
export function configureBodyParsers(app: INestApplication) {
  const notes = json({ limit: '8mb' });
  const ordinary = json({ limit: '2mb' });
  app.use((req, res, next) => {
    const parser = /^\/api\/lesson-curricula(?:\/|$)/.test(req.path)
      ? notes : ordinary;
    parser(req, res, next);
  });
  app.use(urlencoded({ extended: true, limit: '2mb' }));
}
