const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const clients = new Map();

// Define demo files directory ONCE
const demoFilesDir = path.join(__dirname, 'demo_files');
if (!fs.existsSync(demoFilesDir)) fs.mkdirSync(demoFilesDir);

// Serve static files from 'public'
app.use(express.static('public'));

// Multer setup for uploads
const upload = multer({ dest: demoFilesDir });


// Upload endpoint
app.post('/api/upload-file', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const oldPath = req.file.path;
  const newPath = path.join(demoFilesDir, req.file.originalname);

  fs.rename(oldPath, newPath, (err) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Failed to save file' });
    }
    console.log(`✅ Uploaded file saved as: ${req.file.originalname}`);
    res.json({ message: 'File uploaded successfully', filename: req.file.originalname });
  });
});


// --- Helper Function ---
function getClientsArray() {
  return Array.from(clients.values());
}

// --- Socket.io logic ---
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // Add new client
  clients.set(socket.id, {
    clientId: socket.id,
    clientName: socket.handshake.query.clientName || 'Unnamed Client',
    ip: socket.handshake.address,
    lastSeen: Date.now(),
  });

  socket.on('client_connect', ({ clientId, clientName }) => {
    clients.set(clientId, { clientId, clientName });
    io.emit('clients_update', getClientsArray());
  });

  socket.on('disconnect', () => {
    clients.delete(socket.id);
    io.emit('clients_update', getClientsArray());
    console.log(`Client disconnected: ${socket.id}`);
  });

  // Dashboard requests current clients
  socket.on('request_clients', (data, callback) => {
    if (callback) callback(getClientsArray());
  });

  // Dashboard triggers scan on a client
  socket.on('scan_file', ({ clientId, filename }) => {
    const targetSocket = io.sockets.sockets.get(clientId);
    if (targetSocket) {
      targetSocket.emit('scan_file', { filename });
    }
  });

  // Receive scan results and broadcast to dashboards
  socket.on('scan_result', (result) => {
    io.emit('scan_result_broadcast', {
      clientId: result.clientId,
      clientName: clients.get(result.clientId)?.clientName || 'Unknown',
      filename: result.filename,
      sha256: result.sha256,
      flagged: result.flagged,
      reason: result.reason,
      timestamp: result.timestamp,
    });
  });
});

// --- API endpoints for files ---
app.get('/api/files', (req, res) => {
  fs.readdir(demoFilesDir, (err, files) => {
    if (err) return res.status(500).json({ error: 'Failed to list files' });
    res.json(files);
  });
});

app.get('/api/files/:filename', (req, res) => {
  const filePath = path.join(demoFilesDir, req.params.filename);
  if (!filePath.startsWith(demoFilesDir)) {
    return res.status(400).send('Invalid filename');
  }
  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) return res.status(404).send('File not found');
    res.setHeader('Content-Type', 'application/octet-stream');
    fs.createReadStream(filePath).pipe(res);
  });
});

// --- Demo Files Auto-Generator ---
const demoFileContents = {
  'virus.txt': 'This is a benign test file. Warning: malware detected!\nEval and system calls found.',
  'program.exe': 'Fake executable content for demo purposes only.',
  'readme.txt': 'This is a safe file generated automatically.',
};

app.post('/api/create-demo-files', (req, res) => {
  try {
    if (!fs.existsSync(demoFilesDir)) {
      fs.mkdirSync(demoFilesDir);
    }
    for (const [filename, content] of Object.entries(demoFileContents)) {
      fs.writeFileSync(path.join(demoFilesDir, filename), content);
    }
    res.status(200).send('Files created');
  } catch (err) {
    console.error(err);
    res.status(500).send('Error creating files');
  }
});
// Serve dashboard.html at root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// --- Start Server ---
server.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
