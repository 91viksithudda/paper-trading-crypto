const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');

const app = express();
const PORT = 3000;

// Proxy API requests to the backend
// In v3, we can pass the filter as the first argument or in options.
// We'll use the filter to ensure the full path including /api is sent to the backend.
app.use(createProxyMiddleware({
  target: 'http://localhost:5000',
  changeOrigin: true,
  pathFilter: '/api'
}));

// Serve static files from frontend/web
app.use(express.static(path.join(__dirname, 'frontend/web')));

// Fallback to index.html for SPA if needed (though this looks like a simple multi-page or single-page app)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend/web/index.html'));
});

app.listen(PORT, () => {
  console.log(`Preview server running at http://localhost:${PORT}`);
});
