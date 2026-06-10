require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const connectDB = require('./config/db');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const { router: convRoutes } = require('./routes/conversations');
const messageRoutes = require('./routes/messages');
const uploadRoutes = require('./routes/upload');
const setupSocketHandlers = require('./sockets/handlers');
const admin = require('./config/firebase');
const User = require('./models/User');

const app = express();
const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST'],
  },
});

app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json({ limit: '20mb' }));

// Middleware to verify Firebase token and auto-create users
const verifyAndCreateUser = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing auth token' });
  }
  const token = header.split(' ')[1];
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    let user = await User.findOne({ firebaseUid: decoded.uid });

    // Auto-create user if doesn't exist
    if (!user) {
      const firebaseUser = await admin.auth().getUser(decoded.uid);
      user = await User.create({
        firebaseUid: decoded.uid,
        email: firebaseUser.email,
        name: firebaseUser.displayName || 'User',
        handle: firebaseUser.email.split('@')[0].toLowerCase() + Math.random().toString(36).slice(2, 5),
        initials: (firebaseUser.displayName || 'U')
          .split(' ')
          .map(w => w[0])
          .join('')
          .toUpperCase()
          .slice(0, 3),
        photoURL: firebaseUser.photoURL,
      });
    }

    req.firebaseUid = decoded.uid;
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Web app endpoints - auto-create users
app.get('/api/me', verifyAndCreateUser, (req, res) => {
  res.json(req.user.toClientJSON());
});

app.post('/api/me', verifyAndCreateUser, async (req, res) => {
  const allowed = ['name', 'email', 'photoURL'];
  const updates = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }
  if (updates.name) {
    updates.initials = updates.name
      .split(' ')
      .map(w => w[0])
      .join('')
      .toUpperCase()
      .slice(0, 3);
  }
  try {
    const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true });
    res.json(user.toClientJSON());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/conversations', convRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/upload', uploadRoutes);

app.get('/health', (_, res) => res.json({ status: 'ok' }));

setupSocketHandlers(io);

const PORT = process.env.PORT || 4000;

connectDB()
  .then(() => {
    httpServer.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch(err => {
    console.error('DB connection failed:', err);
    process.exit(1);
  });
