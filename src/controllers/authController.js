import express from 'express';
import { wrappSuccessResult, sendTelegramGroupMessage } from '../utils/index.js'
import logger from '../utils/logger.js';
import { login, refreshtoken, registerUser, activateUserInDB, forgetPassword, resetPass, checkAlreadyExistUsernameEmail } from '../services/authService.js';
import { authenticateToken, verifyForgetToken, verifyToken, extractForgetToken } from '../middleware/authMiddleware.js';
import { logPublicActivity } from '../middleware/activityLogMiddleware.js';
import redisClient from '../utils/redisClient.js';
import axios from 'axios';
const router = express.Router();

const postLoginHandler = async (req, res, next) => {
    try {
        const body = req.body;

        const user = await login({ email: body.email, password: body.password });
        res.status(200).send(wrappSuccessResult(200, { token: user.token, userInfo: user.userInfo, refreshToken: user.refreshToken }));

    } catch (error) {
        return next(error, req, res)
    }
}

const postRegistrationHandler = async (req, res, next) => {
    try {
        const body = req.body;
        const created = await registerUser(body);

        if (created) {

            const date = new Date();
            const localString = date.toLocaleString();
            // console.log(localString);

            const text = `
            <b>🚨 Paddle Alert RG</b>

            📝 <b>Type:</b> New Registration
            👤 <b>Email:</b> ${body.email}
            👤 <b>Username:</b> ${body.userName}
            💳 <b>Plan:</b> ${body.plan}
            🕒 <b>Time:</b> ${localString}
            `.trim();

            // Best-effort Telegram notification; never break the request on failure
            if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
                try { await sendTelegramGroupMessage(text); }
                catch (err) { logger.warn('Telegram send failed for registration', { error: err?.message }); }
            }

            // Auto-login after registration to issue tokens (bypasses subscription check)
            const session = await login({ email: body.email, password: body.password, loginMode: 'afterRegistration' });
            // Ensure UI-friendly role on immediate post-register session
            if (session?.userInfo && (!session.userInfo.role || session.userInfo.role === 'tenant')) {
                session.userInfo.role = 'clientadmin';
            }
            return res.status(200).send(wrappSuccessResult(200, { token: session.token, userInfo: session.userInfo, refreshToken: session.refreshToken }));
        }
        
        // Fallback (should rarely happen): created is falsy
        return res.status(201).send(wrappSuccessResult(201, { id: created?._id }));
    } catch (error) {
        return next(error, req, res)
    }
}

const forgetPasswordHandler = async (req, res, next) => {
    try {
        const body = req.body;

        const user = await forgetPassword({ email: body.email });
        res.status(200).send(wrappSuccessResult(200, { message: "Email has been sent." }));

    } catch (error) {
        return next(error, req, res)
    }
}

const postRefreshToken = async (req, res, next) => {
    try {
        const { token } = req.body;
        // console.log('token: ' + token)
        const tokenResult = await refreshtoken(token);
        res.status(200).send(wrappSuccessResult(200, { token: tokenResult.token, refreshToken: tokenResult.refreshToken }));
    } catch (error) {
        return next(error, req, res)
    }
}

const postActivateUser = async (req, res, next) => {
    const authHeader = req.headers['authorization']; // Get Authorization header
    const token = authHeader && authHeader.split(' ')[1]; // Extract token after "Bearer"

    // console.log('token');
    // console.log(token)
    try {
        const decoded = verifyToken(token);

        const { email, plan, userName } = decoded;

        const result = await activateUserInDB(email, userName, plan)
        const decodedResult = verifyToken(result)

        res.status(200).send(wrappSuccessResult(200, { token: result, userInfo: decodedResult, plan: plan }));
    }
    catch (error) {
        return next(error, req, res)
    }
}

const resetAndUpdatPasswordHandler = async (req, res, next) => {
    const { password } = req.body;


    try {
        const token = req.headers.authorization?.split(" ")[1];
        if (!token) throw new Error("No token provided.");

        const decoded = extractForgetToken(token);

        const { email, exp } = decoded;

        if (!password) {
            throw new Error("Password is required.");
        }

        const result = await resetPass({ email, password })

        const expTime = exp; // Token expiration time
        const now = Math.floor(Date.now() / 1000);
        const ttl = expTime - now; // Time-to-live for blacklist

        if (ttl > 0) {
            await redisClient.setEx(token, ttl, "blacklisted"); // Blacklist token in Redis
        }

        res.status(200).send(wrappSuccessResult(200, { data: "Password has been changed." }));

    }
    catch (error) {
        return next(error, req, res)
    }
}

const logoutHandler = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(" ")[1];
        if (!token) return res.status(400).json({ message: "No token provided" });

        const decoded = verifyToken(token);
        if (!decoded) return res.status(400).json({ message: "Invalid token" });

        // Blacklist the current token
        const exp = decoded.exp; // Token expiration time
        const now = Math.floor(Date.now() / 1000);
        const ttl = exp - now; // Time-to-live for blacklist

        if (ttl > 0) {
            await redisClient.setEx(token, ttl, "blacklisted"); // Blacklist token in Redis
        }

        // Add user ID to a "logged out users" list with a reasonable TTL
        // This prevents any other tokens issued to this user from being valid
        if (decoded.id) {
            await redisClient.setEx(`user_logout:${decoded.id}`, 86400, Date.now().toString()); // 24 hour TTL
        }

        // Return specific headers to help clear client-side storage
        res.header('Clear-Site-Data', '"cache", "cookies", "storage"');
        res.json({ 
            message: "Logged out successfully",
            clearData: true // Signal to frontend that it should clear data
        });
    } catch (error) {
        return next(error, req, res);
    }
}

const handleCheckAlreadyExistUsernameEmail = async (req, res, next) => {
    try {
        const body = req.body;

        const user = await checkAlreadyExistUsernameEmail({ email: body.email, userName: body.userName });

        if (!user) {
            res.status(200).send({ success: true, status: "success", statusCode: 200, message: "The username or email is available to use." });
        }
        else {
            res.status(409).send({ success: false, status: "failed", statusCode: 409, message: "The username or email is already in use. Please try another one." });
        }

    } catch (error) {
        return next(error, req, res)
    }
}

export const createCheckoutSession = async (req, res) => {
    try {
        const { price_id, success_url, cancel_url } = req.body || {};
        if (!price_id) {
            return res.status(400).json({ message: 'price_id is required' });
        }

        // Whitelist price IDs from env to prevent arbitrary price selection
        const priceVars = [
            'PADDLE_PRICE_BUSINESS_YEARLY',
            'PADDLE_PRICE_BUSINESS_MONTHLY',
            'PADDLE_PRICE_PRO_MONTHLY',
            'PADDLE_PRICE_PRO_YEARLY',
            'PADDLE_PRICE_HOBBY_YEARLY',
            'PADDLE_PRICE_HOBBY_MONTHLY',
        ];
        // Also accept VITE_ equivalents in case only frontend envs were configured
        const vitePriceVars = [
            'VITE_PADDLE_PRICE_BUSINESS_YEARLY',
            'VITE_PADDLE_PRICE_BUSINESS_MONTHLY',
            'VITE_PADDLE_PRICE_PRO_MONTHLY',
            'VITE_PADDLE_PRICE_PRO_YEARLY',
            'VITE_PADDLE_PRICE_HOBBY_YEARLY',
            'VITE_PADDLE_PRICE_HOBBY_MONTHLY',
        ];
        const allowedPriceIds = new Set([
            ...priceVars.map(k => process.env[k]),
            ...vitePriceVars.map(k => process.env[k])
        ].filter(Boolean));
        console.log('allowedPriceIds:', allowedPriceIds);
        if (!allowedPriceIds.has(price_id)) {
            return res.status(400).json({ message: 'Invalid price_id' });
        }

        // Build safe success/cancel URLs
        const envOrigins = (process.env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
        const defaultOrigins = [
            'http://localhost:3000', 'http://127.0.0.1:3000',
            'http://localhost:5173', 'http://127.0.0.1:5173',
            'http://localhost:5174', 'http://127.0.0.1:5174'
        ];

        // const defaultOrigins = [
        //     'http://localhost:3000',
        //     'http://localhost:5173',
        //     'http://localhost:5174',
        //     'https://app.noreplay@mytenantbook.com',
        //     'https://noreplay@mytenantbook.com'
        // ];


        const allowedOrigins = [...new Set([...defaultOrigins, ...envOrigins])];
        const originFromReq = req.headers.origin;
        console.log('originFromReq: '+ originFromReq)
        // Prefer the actual request origin in dev to avoid https localhost issues
        let frontendBase = allowedOrigins.includes(originFromReq) ? originFromReq : null;
        if (!frontendBase && process.env.FRONTEND_BASE_URL && allowedOrigins.includes(process.env.FRONTEND_BASE_URL)) {
            frontendBase = process.env.FRONTEND_BASE_URL;
        }
        if (!frontendBase) frontendBase = defaultOrigins[1];

        const safeUrl = (u, fallbackPath) => {
            try {
                if (!u) throw new Error('no url');
                const parsed = new URL(u);
                const base = `${parsed.protocol}//${parsed.host}`;
                if (allowedOrigins.includes(base)) return u;
            } catch {}
            return `${frontendBase}${fallbackPath}`;
        };

    const successUrl = safeUrl(success_url, '/dashboard');
        const cancelUrl = safeUrl(cancel_url, '/pricing');

        const apiBase = process.env.PADDLE_API_BASE || 'https://sandbox-api.paddle.com';
        // Derive customer email from the authenticated token (email or userName)
        const customerEmail = (req.user?.email || req.user?.userName || req.user?.username || '').trim();
        const payload = {
            items: [ { price_id, quantity: 1 } ],
            ...(customerEmail ? { customer: { email: customerEmail } } : {}),
            customer_ip_address: req.ip,
            checkout: { success_url: successUrl, cancel_url: cancelUrl },
            custom_data: {
                userId: req.user?.id,
                email: customerEmail || undefined,
                plan: req.body?.plan || req.user?.plan,
                price_id
            },
            ...(process.env.PADDLE_PAYMENT_METHOD_CONFIGURATION_ID ? { payment_method_configuration_id: process.env.PADDLE_PAYMENT_METHOD_CONFIGURATION_ID } : {})
        };

        console.log('process.env.PADDLE_VENDOR_AUTH_CODE:', process.env.PADDLE_VENDOR_AUTH_CODE);
        console.log('payload:', payload);
        console.log('apiBase:', apiBase);

        const response = await axios.post(
            `${apiBase}/transactions`,
            payload,
            { headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.PADDLE_VENDOR_AUTH_CODE}` } }
        );

        const data = response.data?.data || response.data;
        res.status(201).send(wrappSuccessResult(201, {
            transaction_id: data?.id,
            status: data?.status,
            checkout_url: data?.checkout?.url,
        }));
    } catch (error) {
        const apiMsg = error?.response?.data;
        const text = typeof apiMsg === 'string' ? apiMsg : (apiMsg?.error || apiMsg?.message || error?.message);
        // Fallback redirect is disabled by default to prevent landing page jumps in app
        if (process.env.PADDLE_ENABLE_FALLBACK === '1' && text && /default payment link/i.test(text) && process.env.PADDLE_FALLBACK_CHECKOUT_URL) {
            logger.warn('Paddle requires a default payment link; using fallback URL (explicitly enabled)');
            return res.status(201).send(wrappSuccessResult(201, {
                transaction_id: null,
                status: 'redirect',
                checkout_url: process.env.PADDLE_FALLBACK_CHECKOUT_URL,
            }));
        }
        res.status(500).json({ message: text || 'Failed to create checkout session' });
    }
};


router.post('/login', logPublicActivity('USER_LOGIN', 'USER', 'User login attempt'), postLoginHandler)
router.post('/register', logPublicActivity('USER_REGISTER', 'USER', 'User registration attempt'), postRegistrationHandler)
router.post('/validate-user', handleCheckAlreadyExistUsernameEmail)
router.post('/refreshtoken', postRefreshToken)
router.post('/activate', postActivateUser)
router.post('/forget-password', forgetPasswordHandler)
router.post('/reset-password', verifyForgetToken, resetAndUpdatPasswordHandler)
router.post('/logout', authenticateToken, logoutHandler)
router.post('/checkout', authenticateToken, createCheckoutSession)

const configure = (app) => {
    app.use('/api/auth', router)
}

export default configure;