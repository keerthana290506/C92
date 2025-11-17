// ------------------------------
// Clover Backend - Updated Version
// ------------------------------

require('colors');
const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const schedule = require('node-schedule');

const store = require('./src/store');
const init = require('./src/init');
const mediasoup = require('./src/mediasoup');
const Email = require('./src/models/Email');
const sendMail = require('./src/utils/sendMail');
const Config = require('./config');

// ------------------------------
// Startup Banner
// ------------------------------
console.log(`${'Honeyside'.yellow} © ${'2022'.yellow}`);
console.log(`Welcome to ${'Clover'.cyan}`);

// ------------------------------
// Express + Socket.io
// ------------------------------
const app = express();
const server = http.createServer(app);
const io = socketIO(server);

store.app = app;
store.config = Config;
store.io = io;

// ------------------------------
// Database Check Middleware
// ------------------------------
app.use((req, res, next) => {
  if (store.connected) next();
  else res.status(500).send('Database not available.');
});

// ------------------------------
// Serve Frontend
// ------------------------------
const frontendPath = `${__dirname}/../frontend/dist`;

app.use(express.static(frontendPath));
app.use('/login', express.static(frontendPath));
app.use('/login/*', express.static(frontendPath));
app.use('/admin', express.static(frontendPath));
app.use('/room/*', express.static(frontendPath));
app.use('/meeting/*', express.static(frontendPath));

// ------------------------------
// Initialize System
// ------------------------------
init();
mediasoup.init();

// ------------------------------
// Start Server
// ------------------------------
const listen = () =>
  server.listen(Config.port, '0.0.0.0', () => {
    console.log(`✅ Server listening on http://127.0.0.1:${Config.port}`.green);
    console.log(`Mediasoup worker running`.cyan);
  });

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.log('❌ Specified port unavailable, retrying in 10 seconds...'.red);
    setTimeout(() => {
      try {
        server.close();
        server.listen(Config.port, '0.0.0.0');
      } catch (err) {
        console.error('Retry failed:', err.message.red);
      }
    }, Config.retryAfter || 10000);
  } else {
    console.error(`❌ Server error: ${e.message}`.red);
  }
});

listen();

// ------------------------------
// Mailer Cron Job
// ------------------------------
let scheduler;
let schedulerDone = false;

if (Config.nodemailerEnabled) {
  scheduler = schedule.scheduleJob('*/5 * * * * *', async () => {
    if (schedulerDone) return;
    schedulerDone = true;

    try {
      const emails = await Email.find({ sent: false });

      for (let email of emails) {
        try {
          const html = `${email.html}`;
          await sendMail({
            from: email.from,
            to: email.to,
            subject: email.subject,
            html,
          });
          const entry = await Email.findById(email._id);
          entry.sent = true;
          entry.dateSent = Date.now();
          await entry.save();
        } catch (mailErr) {
          console.log(mailErr);
        }
      }
    } catch (err) {
      console.log('Email scheduler error:', err.message);
    }

    schedulerDone = false;
  });
}

// ------------------------------
// Export for testing
// ------------------------------
module.exports = server;
