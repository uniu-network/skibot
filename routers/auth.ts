import { Elysia } from 'elysia';
import jwtHelper from '../app/jwtHelper.js';
import config from '../app/config.js';

const AuthRoutes = new Elysia({ prefix: '/auth' })
    .post('/login', ({ body, cookie, status }) => {
        const { username, password } = body as any;
        if (username === config.get('web.username') && password === config.get('web.password')) {
            cookie.token.value = jwtHelper.issueToken({
                username,
                password,
            }, 86400000);
            cookie.token.path = '/';
            cookie.token.maxAge = 86400000;
            return { code: 0 };
        }

        return status(401, {
            code: 401,
            message: 'username or password error',
        });
    });

export default AuthRoutes;
