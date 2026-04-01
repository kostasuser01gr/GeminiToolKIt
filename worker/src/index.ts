import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './env';
import authRoutes from './routes/auth';
import shiftsRoutes from './routes/shifts';
import washersRoutes from './routes/washers';
import casesRoutes from './routes/cases';
import fleetRoutes from './routes/fleet';
import dashboardRoutes from './routes/dashboard';
import staffRoutes from './routes/staff';
import healthRoutes from './routes/health';

const app = new Hono<{ Bindings: Env }>();

// CORS
app.use('/api/*', cors({
  origin: (origin) => origin || '*',
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
  maxAge: 86400,
}));

// API routes
app.route('/api/auth', authRoutes);
app.route('/api/shifts', shiftsRoutes);
app.route('/api/washers', washersRoutes);
app.route('/api/cases', casesRoutes);
app.route('/api/fleet', fleetRoutes);
app.route('/api/dashboard', dashboardRoutes);
app.route('/api/staff', staffRoutes);
app.route('/api/health', healthRoutes);

// Global error handler
app.onError((err, c) => {
  console.error('Unhandled error:', err.message, err.stack);
  return c.json({ error: 'Internal server error' }, 500);
});

// 404 for unmatched API routes
app.all('/api/*', (c) => c.json({ error: 'Not found' }, 404));

export default app;
