import { NestFactory } from '@nestjs/core';
import { configureBodyParsers } from './common/body-parsers';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  configureBodyParsers(app);
  await app.listen(4000, '127.0.0.1');
}
bootstrap();
