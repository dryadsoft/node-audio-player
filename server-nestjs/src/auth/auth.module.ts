import { Controller, Get, MiddlewareConsumer, Module, NestModule, Post, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';

@Controller('api/auth')
class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Get('session') session(@Req() req: Request, @Res() res: Response) {
    const user = this.auth.session(req, res);
    res.json(user ? { authenticated: true, user } : { authenticated: false });
  }
  @Get('google/start') start(@Req() req: Request, @Res() res: Response) { return this.auth.start(req, res); }
  @Get('google/callback') callback(@Req() req: Request, @Res() res: Response) { return this.auth.callback(req, res); }
  @Post('logout') logout(@Req() req: Request, @Res() res: Response) { this.auth.logout(req, res); }
}

@Module({ providers: [AuthService], controllers: [AuthController], exports: [AuthService] })
export class AuthModule implements NestModule {
  constructor(private readonly auth: AuthService) {}
  configure(consumer: MiddlewareConsumer) {
    consumer.apply((req: Request, res: Response, next: () => void) => {
      res.setHeader('Cache-Control', 'private, no-store');
      try {
        const path = req.originalUrl.split('?')[0].replace(/\/$/, '').toLowerCase();
        const publicGet = req.method === 'GET' && [
          '/api/auth/session', '/api/auth/google/start', '/api/auth/google/callback',
        ].includes(path);
        if (!['GET', 'HEAD'].includes(req.method) && !this.auth.csrf(req)) {
          res.status(403).json({ message: '요청 출처를 확인할 수 없습니다.' }); return;
        }
        const logout = path === '/api/auth/logout' && req.method === 'POST';
        if (!publicGet && !logout && !this.auth.session(req, res)) {
          res.status(401).json({ message: '로그인이 필요합니다.' }); return;
        }
        next();
      } catch {
        res.status(503).json({ message: '인증 서비스를 확인할 수 없습니다.' });
      }
    }).forRoutes('*');
  }
}
