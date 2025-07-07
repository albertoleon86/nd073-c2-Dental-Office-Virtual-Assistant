const express = require('express');
const app = express();

app.use(express.json());          // <- NECESARIO para leer JSON

/* PING */
app.get('/health', (_, res) => res.sendStatus(200));

/* Rutas API */
app.get('/', (_, res) => {
  res.json({ message: 'hello world' });
});

app.get('/availability', (_, res) => {
  res.json(['8am', '9am', '10am', '11am', '12pm', '1pm', '2pm', '3pm', '4pm']);
});

app.post('/schedule', (req, res) => {
  res.json(req.body);             // echo de la cita recibida
});

/* Start server */
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on port ${port}`));
