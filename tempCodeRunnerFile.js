const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const clients = new Map();
const demoFilesDir = path.join(__dirname, 'demo_files');

// Serve static files from the 'public' folder
app.use(express.static('public'));

// Socket.io logic
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  socket.on('client_connect', ({ clientId, clientName }) => {
    clients.set(clientId, { clientId, clientName });
    io.emit('clients_update', Array.from(clients.values()));
  });

  socket.on('disconnect', () => {
    clients.delete(socket.id);
    io.emit('clients_update', Array.from(clients.values()));
    console.log(`Client disconnected: ${socket.id}`);
  });
});

// API endpoints for files
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

// Start the server
server.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
