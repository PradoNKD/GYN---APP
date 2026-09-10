import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [
    UsersModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        // 30 dias, e nao 12 horas. O app e usado quase todo dia, sempre na
        // porta da academia: com 12h praticamente toda visita caia com o token
        // vencido, e digitar e-mail e senha antes de treinar e exatamente o
        // atrito que faz desistir de usar.
        //
        // Token longo aqui NAO significa acesso irrevogavel. O `validate` da
        // JwtStrategy consulta o banco a cada requisicao e recusa conta
        // inativa, entao desativar alguem no painel derruba o acesso dele na
        // requisicao seguinte, mesmo com 29 dias de validade sobrando. E essa
        // consulta que sustenta o prazo longo -- se ela sair, o prazo tem de
        // encolher junto. Ela esta travada pelo teste "lanca
        // UnauthorizedException quando a conta foi desativada" em
        // jwt.strategy.spec.ts.
        signOptions: { expiresIn: '30d' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
})
export class AuthModule {}
