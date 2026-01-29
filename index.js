import express from 'express';
import path, { dirname } from 'path';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import bodyParser from 'body-parser';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import job from './cron.js';

dotenv.config();

// ----- Basic Config -----
const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret';

// ----- Middleware -----
app.use(
  cors({
    origin: true,
    credentials: true,
  })
);
app.use(cookieParser());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
job.start(); // Start the cron job
// Resolve __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Serve static front-end assets
const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir));

// ----- SQLite DB Setup -----
const dbPath = path.join(__dirname, 'team-app.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    passwordHash TEXT NOT NULL,
    isAdmin INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS ideas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS idea_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ideaId INTEGER NOT NULL,
    userId INTEGER NOT NULL,
    role TEXT NOT NULL,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    FOREIGN KEY (ideaId) REFERENCES ideas(id) ON DELETE CASCADE,
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS role_definitions (
    roleKey TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    icon TEXT NOT NULL,
    description TEXT NOT NULL,
    responsibilities TEXT NOT NULL
  );
`);

// Initialize default role definitions if table is empty
const roleCount = db.prepare('SELECT COUNT(*) as count FROM role_definitions').get();
if (roleCount.count === 0) {
  const defaultRoles = [
    {
      roleKey: 'admin',
      title: 'Admin',
      icon: '👑',
      description: 'The Admin role is the highest level of access in the Team Up application. Admins have full control over the platform and can manage all aspects of the system.',
      responsibilities: JSON.stringify([
        'Create and manage project ideas',
        'Delete project ideas',
        'View all registered users',
        'Monitor team compositions',
        'Oversee platform operations'
      ])
    },
    {
      roleKey: 'leader',
      title: 'Leader',
      icon: '🎯',
      description: 'The Leader is responsible for guiding the team and ensuring the project stays on track. They coordinate team efforts and make key decisions about project direction.',
      responsibilities: JSON.stringify([
        'Set project goals and milestones',
        'Coordinate team activities',
        'Make strategic decisions',
        'Communicate with stakeholders',
        'Ensure project completion'
      ])
    },
    {
      roleKey: 'designer',
      title: 'Designer',
      icon: '🎨',
      description: 'The Designer creates the visual identity and user experience of the project. They focus on making the product both beautiful and functional.',
      responsibilities: JSON.stringify([
        'Create UI/UX designs',
        'Design user interfaces',
        'Create visual assets',
        'Ensure design consistency',
        'Collaborate with programmers'
      ])
    },
    {
      roleKey: 'programmer1',
      title: 'Programmer 1',
      icon: '💻',
      description: 'Programmer 1 is responsible for implementing core features and functionality. They work closely with the designer to bring the vision to life.',
      responsibilities: JSON.stringify([
        'Develop core features',
        'Write clean, maintainable code',
        'Implement frontend/backend logic',
        'Debug and fix issues',
        'Collaborate with team members'
      ])
    },
    {
      roleKey: 'programmer2',
      title: 'Programmer 2',
      icon: '⚙️',
      description: 'Programmer 2 works alongside Programmer 1 to build additional features and ensure the project meets all technical requirements.',
      responsibilities: JSON.stringify([
        'Develop additional features',
        'Optimize code performance',
        'Write unit tests',
        'Review code from Programmer 1',
        'Ensure code quality standards'
      ])
    }
  ];

  const insertRole = db.prepare(
    'INSERT INTO role_definitions (roleKey, title, icon, description, responsibilities) VALUES (?, ?, ?, ?, ?)'
  );

  for (const role of defaultRoles) {
    insertRole.run(role.roleKey, role.title, role.icon, role.description, role.responsibilities);
  }
}

// Helper to load ideas with members in the same shape as before
function getIdeasWithMembers() {
  const ideas = db
    .prepare('SELECT id, title FROM ideas ORDER BY id ASC')
    .all();

  const membersStmt = db.prepare(
    'SELECT ideaId, role, name, email FROM idea_members WHERE ideaId = ?'
  );

  return ideas.map((idea) => {
    const membersRows = membersStmt.all(idea.id);
    const members = {
      leader: null,
      designer: null,
      programmer1: null,
      programmer2: null,
    };

    for (const row of membersRows) {
      if (members[row.role] !== undefined) {
        members[row.role] = {
          name: row.name,
          email: row.email,
        };
      }
    }

    return {
      id: idea.id,
      title: idea.title,
      members,
    };
  });
}

// ----- Auth Helpers -----
function createToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      isAdmin: !!user.isAdmin,
      name: user.name,
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

async function authRequired(req, res, next) {
  try {
    let token = null;

    // Prefer Authorization header
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith('Bearer ')
    ) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    if (!token) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    const payload = jwt.verify(token, JWT_SECRET);
    const user = db
      .prepare(
        'SELECT id, name, email, isAdmin FROM users WHERE id = ?'
      )
      .get(payload.id);

    if (!user) {
      return res.status(401).json({ message: 'Invalid token user' });
    }

    req.user = user;
    next();
  } catch (err) {
    console.error('authRequired error:', err.message);
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

function adminRequired(req, res, next) {
  if (!req.user || !req.user.isAdmin) {
    return res.status(403).json({ message: 'Admin only' });
  }
  next();
}

// ----- Page Routes (serve HTML) -----
app.get('/', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.get('/register', (req, res) => {
  res.sendFile(path.join(publicDir, 'register.html'));
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(publicDir, 'dashboard.html'));
});

app.get('/roles', (req, res) => {
  res.sendFile(path.join(publicDir, 'roles.html'));
});

// ----- Auth API -----
app.post('/api/auth/register', async (req, res) => {
  try {
    const { firstName, email, password } = req.body;
    if (!firstName || !email || !password) {
      return res
        .status(400)
        .json({ message: 'firstName, email and password are required' });
    }

    const existing = db
      .prepare('SELECT id FROM users WHERE email = ?')
      .get(email);
    if (existing) {
      return res.status(409).json({ message: 'Email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    // Admin rule similar to front-end check: Samir with that email
    const isAdmin =
      email === 'samir@gmail.com' &&
      firstName.toLowerCase() === 'samir';

    const info = db
      .prepare(
        'INSERT INTO users (name, email, passwordHash, isAdmin) VALUES (?, ?, ?, ?)'
      )
      .run(firstName, email, passwordHash, isAdmin ? 1 : 0);

    const user = {
      id: info.lastInsertRowid,
      name: firstName,
      email,
      isAdmin,
    };

    const token = createToken(user);
    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        isAdmin: user.isAdmin,
      },
      token,
    });
  } catch (err) {
    console.error('register error:', err);
    res.status(500).json({ message: 'Registration failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res
        .status(400)
        .json({ message: 'Email and password are required' });
    }

    const user = db
      .prepare(
        'SELECT id, name, email, passwordHash, isAdmin FROM users WHERE email = ?'
      )
      .get(email);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return res.status(401).json({ message: 'Incorrect password' });
    }

    const token = createToken(user);
    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        isAdmin: !!user.isAdmin,
      },
      token,
    });
  } catch (err) {
    console.error('login error:', err);
    res.status(500).json({ message: 'Login failed' });
  }
});

app.get('/api/auth/me', authRequired, (req, res) => {
  const user = req.user;
  res.json({
    id: user.id,
    name: user.name,
    email: user.email,
    isAdmin: !!user.isAdmin,
  });
});

// ----- Ideas API -----
app.get('/api/ideas', authRequired, async (req, res) => {
  try {
    const ideas = getIdeasWithMembers();
    res.json(ideas);
  } catch (err) {
    console.error('get ideas error:', err);
    res.status(500).json({ message: 'Failed to fetch ideas' });
  }
});

app.post('/api/ideas', authRequired, adminRequired, async (req, res) => {
  try {
    const { title } = req.body;
    if (!title) {
      return res.status(400).json({ message: 'Title is required' });
    }

    const now = new Date().toISOString();
    const info = db
      .prepare(
        'INSERT INTO ideas (title, createdAt, updatedAt) VALUES (?, ?, ?)'
      )
      .run(title, now, now);

    const idea = {
      id: info.lastInsertRowid,
      title,
      members: {
        leader: null,
        designer: null,
        programmer1: null,
        programmer2: null,
      },
    };

    res.status(201).json(idea);
  } catch (err) {
    console.error('create idea error:', err);
    res.status(500).json({ message: 'Failed to create idea' });
  }
});

app.post('/api/ideas/:id/join', authRequired, async (req, res) => {
  try {
    const { id } = req.params;
    const { roleKey } = req.body;
    const validRoles = ['leader', 'designer', 'programmer1', 'programmer2'];

    if (!validRoles.includes(roleKey)) {
      return res.status(400).json({ message: 'Invalid role' });
    }

    const ideaId = Number(id);
    if (!Number.isInteger(ideaId)) {
      return res.status(400).json({ message: 'Invalid idea id' });
    }

    const idea = db
      .prepare('SELECT id, title FROM ideas WHERE id = ?')
      .get(ideaId);
    if (!idea) {
      return res.status(404).json({ message: 'Idea not found' });
    }

    // Check if user already in this team
    const alreadyInTeam = db
      .prepare(
        'SELECT 1 FROM idea_members WHERE ideaId = ? AND email = ? LIMIT 1'
      )
      .get(ideaId, req.user.email);
    if (alreadyInTeam) {
      return res.status(400).json({ message: 'Already in this team' });
    }

    const roleTaken = db
      .prepare(
        'SELECT 1 FROM idea_members WHERE ideaId = ? AND role = ? LIMIT 1'
      )
      .get(ideaId, roleKey);
    if (roleTaken) {
      return res.status(409).json({ message: 'Role already taken' });
    }

    db.prepare(
      'INSERT INTO idea_members (ideaId, userId, role, name, email) VALUES (?, ?, ?, ?, ?)'
    ).run(ideaId, req.user.id, roleKey, req.user.name, req.user.email);

    const ideas = getIdeasWithMembers();
    const updatedIdea = ideas.find((i) => i.id === ideaId);

    res.json(updatedIdea);
  } catch (err) {
    console.error('join idea error:', err);
    res.status(500).json({ message: 'Failed to join team' });
  }
});

app.delete('/api/ideas/:id/leave', authRequired, async (req, res) => {
  try {
    const { id } = req.params;
    const ideaId = Number(id);
    if (!Number.isInteger(ideaId)) {
      return res.status(400).json({ message: 'Invalid idea id' });
    }

    const idea = db
      .prepare('SELECT id, title FROM ideas WHERE id = ?')
      .get(ideaId);
    if (!idea) {
      return res.status(404).json({ message: 'Idea not found' });
    }

    // Check if user is in this team
    const membership = db
      .prepare(
        'SELECT id, role FROM idea_members WHERE ideaId = ? AND userId = ?'
      )
      .get(ideaId, req.user.id);
    
    if (!membership) {
      return res.status(404).json({ message: 'You are not a member of this team' });
    }

    // Delete the membership
    db.prepare('DELETE FROM idea_members WHERE id = ?').run(membership.id);

    const ideas = getIdeasWithMembers();
    const updatedIdea = ideas.find((i) => i.id === ideaId);

    res.json(updatedIdea);
  } catch (err) {
    console.error('leave idea error:', err);
    res.status(500).json({ message: 'Failed to leave team' });
  }
});

app.delete('/api/ideas/:id', authRequired, adminRequired, async (req, res) => {
  try {
    const { id } = req.params;
    const ideaId = Number(id);
    if (!Number.isInteger(ideaId)) {
      return res.status(400).json({ message: 'Invalid idea id' });
    }

    const existing = db
      .prepare('SELECT id FROM ideas WHERE id = ?')
      .get(ideaId);
    if (!existing) {
      return res.status(404).json({ message: 'Idea not found' });
    }

    db.prepare('DELETE FROM idea_members WHERE ideaId = ?').run(ideaId);
    db.prepare('DELETE FROM ideas WHERE id = ?').run(ideaId);

    res.json({ message: 'Idea deleted' });
  } catch (err) {
    console.error('delete idea error:', err);
    res.status(500).json({ message: 'Failed to delete idea' });
  }
});

// ----- Users API (Admin) -----
app.get('/api/users', authRequired, adminRequired, async (req, res) => {
  try {
    const users = db
      .prepare('SELECT id, name, email FROM users')
      .all();
    const ideas = db
      .prepare('SELECT id, title FROM ideas')
      .all();
    const members = db
      .prepare('SELECT ideaId, userId, role FROM idea_members')
      .all();

    const ideasById = new Map();
    for (const idea of ideas) {
      ideasById.set(idea.id, idea);
    }

    const membershipsByUser = new Map();
    for (const m of members) {
      const list = membershipsByUser.get(m.userId) || [];
      list.push(m);
      membershipsByUser.set(m.userId, list);
    }

    const result = users.map((user) => {
      let roleInfo = 'No active role';
      const ms = membershipsByUser.get(user.id) || [];
      if (ms.length > 0) {
        const m = ms[0];
        const idea = ideasById.get(m.ideaId);
        if (idea) {
          roleInfo = `${m.role} in "${idea.title}"`;
        }
      }

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        roleInfo,
      };
    });

    res.json(result);
  } catch (err) {
    console.error('get users error:', err);
    res.status(500).json({ message: 'Failed to fetch users' });
  }
});

// ----- Role Definitions API -----
app.get('/api/roles', authRequired, async (req, res) => {
  try {
    const roles = db
      .prepare('SELECT roleKey, title, icon, description, responsibilities FROM role_definitions ORDER BY roleKey')
      .all();

    const result = roles.map((role) => ({
      roleKey: role.roleKey,
      title: role.title,
      icon: role.icon,
      description: role.description,
      responsibilities: JSON.parse(role.responsibilities),
    }));

    res.json(result);
  } catch (err) {
    console.error('get roles error:', err);
    res.status(500).json({ message: 'Failed to fetch role definitions' });
  }
});

app.put('/api/roles/:roleKey', authRequired, adminRequired, async (req, res) => {
  try {
    const { roleKey } = req.params;
    const { title, icon, description, responsibilities } = req.body;

    if (!title || !icon || !description || !responsibilities) {
      return res.status(400).json({ message: 'title, icon, description, and responsibilities are required' });
    }

    if (!Array.isArray(responsibilities)) {
      return res.status(400).json({ message: 'responsibilities must be an array' });
    }

    const validRoleKeys = ['admin', 'leader', 'designer', 'programmer1', 'programmer2'];
    if (!validRoleKeys.includes(roleKey)) {
      return res.status(400).json({ message: 'Invalid role key' });
    }

    const existing = db
      .prepare('SELECT roleKey FROM role_definitions WHERE roleKey = ?')
      .get(roleKey);

    if (!existing) {
      return res.status(404).json({ message: 'Role not found' });
    }

    db.prepare(
      'UPDATE role_definitions SET title = ?, icon = ?, description = ?, responsibilities = ? WHERE roleKey = ?'
    ).run(title, icon, description, JSON.stringify(responsibilities), roleKey);

    const updated = db
      .prepare('SELECT roleKey, title, icon, description, responsibilities FROM role_definitions WHERE roleKey = ?')
      .get(roleKey);

    res.json({
      roleKey: updated.roleKey,
      title: updated.title,
      icon: updated.icon,
      description: updated.description,
      responsibilities: JSON.parse(updated.responsibilities),
    });
  } catch (err) {
    console.error('update role error:', err);
    res.status(500).json({ message: 'Failed to update role definition' });
  }
});

// ----- Account Deletion -----
app.delete('/api/account', authRequired, async (req, res) => {
  try {
    const userId = req.user.id;

    // Check if user has any active roles in projects
    const membership = db
      .prepare(
        'SELECT 1 FROM idea_members WHERE userId = ? LIMIT 1'
      )
      .get(userId);

    if (membership) {
      return res.status(400).json({
        message:
          'You cannot delete your account while you have a role in a project. Please leave all teams first.',
      });
    }

    // Delete user account
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);

    res.json({ message: 'Account deleted successfully' });
  } catch (err) {
    console.error('delete account error:', err);
    res.status(500).json({ message: 'Failed to delete account' });
  }
});

// ----- Start Server -----
app.listen(PORT, () => {
  console.log(`🚀 team-app-server listening on http://localhost:${PORT}`);
});