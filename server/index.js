const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded screenshots
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/entry-models', require('./routes/entryModels'));
app.use('/api/trades', require('./routes/trades'));
app.use('/api/gamification', require('./routes/gamification'));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
