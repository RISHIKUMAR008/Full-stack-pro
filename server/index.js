const express = require('express');
const cors = require('cors');
const fs = require('fs/promises');
const path = require('path');

const PORT = process.env.PORT || 3001;
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'submissions.json');

const app = express();
app.use(cors());
app.use(express.json());

async function ensureDataFile() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.writeFile(DATA_FILE, '[]', 'utf8');
  }
}

async function readSubmissions() {
  await ensureDataFile();
  const raw = await fs.readFile(DATA_FILE, 'utf8');
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeSubmissions(list) {
  await ensureDataFile();
  await fs.writeFile(DATA_FILE, JSON.stringify(list, null, 2), 'utf8');
}

function validateBody(body) {
  const errors = [];
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const age = body.age;
  const address = typeof body.address === 'string' ? body.address.trim() : '';
  const city = typeof body.city === 'string' ? body.city.trim() : '';
  const hometown = typeof body.hometown === 'string' ? body.hometown.trim() : '';
  const phoneNumber =
    typeof body.phoneNumber === 'string' ? body.phoneNumber.trim() : '';

  if (!name) errors.push('name is required');
  if (age === undefined || age === null || String(age).trim() === '')
    errors.push('age is required');
  else {
    const n = Number(age);
    if (!Number.isFinite(n) || n < 0 || n > 150) errors.push('age must be a valid number');
  }
  if (!address) errors.push('address is required');
  if (!city) errors.push('city is required');
  if (!hometown) errors.push('hometown is required');
  if (!phoneNumber) errors.push('phoneNumber is required');

  return { errors, name, age: Number(age), address, city, hometown, phoneNumber };
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/submissions', async (_req, res) => {
  try {
    const list = await readSubmissions();
    res.json(list);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to read submissions' });
  }
});

app.post('/api/submissions', async (req, res) => {
  try {
    const {
      errors,
      name,
      age,
      address,
      city,
      hometown,
      phoneNumber,
    } = validateBody(req.body);

    if (errors.length) {
      return res.status(400).json({ errors });
    }

    const state = typeof req.body.state === 'string' ? req.body.state.trim() : '';
    const zipCode =
      typeof req.body.zipCode === 'string' ? req.body.zipCode.trim() : '';
    const email = typeof req.body.email === 'string' ? req.body.email.trim() : '';
    const notes = typeof req.body.notes === 'string' ? req.body.notes.trim() : '';

    const entry = {
      id: `sub_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      createdAt: new Date().toISOString(),
      name,
      age,
      address,
      city,
      state: state || undefined,
      zipCode: zipCode || undefined,
      hometown,
      phoneNumber,
      email: email || undefined,
      notes: notes || undefined,
    };

    const list = await readSubmissions();
    list.push(entry);
    await writeSubmissions(list);

    res.status(201).json(entry);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save submission' });
  }
});

ensureDataFile().then(() => {
  app.listen(PORT, () => {
    console.log(`API listening on http://localhost:${PORT}`);
  });
});
