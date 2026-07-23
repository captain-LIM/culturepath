require('dotenv').config();
const express = require('express');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const openApiDocument = require('./docs/openapi');

const authRoutes = require('./routes/auth');
const culturesRoutes = require('./routes/cultures');
const regionsRoutes = require('./routes/regions');
const placesRoutes = require('./routes/places');
const coursesRoutes = require('./routes/courses');
const aiRoutes = require('./routes/ai');
const usersRoutes = require('./routes/users');

const app = express();

app.use(cors({
  exposedHeaders: ['X-Page-No', 'X-Num-Of-Rows', 'X-Total-Count'],
}));
app.use(express.json());

app.get('/openapi.json', (req, res) => res.json(openApiDocument));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openApiDocument));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', env: process.env.NODE_ENV });
});

app.use('/auth', authRoutes);
app.use('/cultures', culturesRoutes);
app.use('/', regionsRoutes);
app.use('/places', placesRoutes);
app.use('/courses', coursesRoutes);
app.use('/ai', aiRoutes);
app.use('/users', usersRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`서버 실행 중: http://localhost:${PORT}`);
});
