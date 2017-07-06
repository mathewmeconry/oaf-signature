var express = require('express');
var app = express();
var server = require('http').Server(app);
var io = require('socket.io')(server);
var yaml = require('js-yaml');
var fs = require('fs');
var request = require('request');
var _ = require('lodash');
var crypto = require('crypto');
var async = require('async');
var moment = require('moment');

var config = yaml.safeLoad(fs.readFileSync(__dirname + '/config.yml', 'utf8'));

var signatureDir = __dirname + '/signatures';
require('mkdirp').sync(signatureDir);

app.set('views', __dirname + '/views');
app.set('view engine', 'pug');
app.set('title', config.title);
app.use(express.static(__dirname + '/public'));

server.listen(9000);

var baseRequest = request.defaults({
  baseUrl: config.api.base_uri,
});

var users = [];
var activities = [];

var database = {
  terminals: {},
  entries: [],
};

var terminalSockets = {};

baseRequest.post('/auth/token', {
  auth: {
    username: config.api.client_id,
    password: config.api.client_secret,
  },
  form: {
    grant_type: 'client_credentials'
  }
}, function (error, response, body) {
  var data = JSON.parse(body);
  baseRequest = baseRequest.defaults({
    auth: {
      bearer: data.access_token
    }
  });
  async.series([fetchUsers, fetchActivities], function (err) {
    if (err) {
      console.log('Could not fetch entities:' + err);
      return;
    }
    fetchEntries();
  });
});

var fetchUsers = function (cb) {
  console.log('Fetch users ...');
  baseRequest.get('/users', function (err, res, body) {
    if(err) {
      return cb(err);
    }
    var data = JSON.parse(body);
    users = _.keyBy(data, 'id');
    cb(null, data);
  });
};

var fetchActivities = function (cb) {
  console.log('Fetch activities ...');
  baseRequest.get('/timesheet/activities', function (err, res, body) {
    if(err) {
      return cb(err);
    }
    var data = JSON.parse(body);
    activities = _.keyBy(data, 'id');
    cb(null, data);
  });
};

var fetchEntries = _.throttle(function () {
  console.log('Fetch entries ...');
  baseRequest.get('/timesheet/entries', function (err, res, body) {
    if(err) {
      console.log(err);
      return;
    }
    var entries = JSON.parse(body);
    _.remove(entries, function (entry) {
      return 'approved_by' in entry;
    });
    database.entries = [];
    for(var i in entries) {
      var entry = entries[i];
      var user = users[entry.user_id];
      database.entries.push({
        id: entry.id,
        userId: user.id,
        user: user.first_name + ' ' + user.last_name,
        activity: activities[entry.activity_id].name,
        time: moment(entry.start).format('DD.MM.YYYY HH:mm') + ' - '  + moment(entry.end).format('DD.MM.YYYY HH:mm'),
        notes: (entry.notes || ''),
      });
    }
    notifyClients();
  });
}, 15000);

function notifyClients() {
  io.sockets.emit('data', database);
}

app.get('/', function (req, res) {
  const userAgent = req.get('user-agent');
  if(userAgent.includes('iPhone') || userAgent.includes('Android')) {
    res.redirect('/terminal');
  } else {
    res.redirect('/control');
  }
});

app.get('/control', function (req, res) {
  res.render('control', {});
});

app.get('/terminal', function (req, res) {
  res.render('terminal', {
    registration: {
      label: req.query.label || null,
    },
  });
});

io.on('connection', function (socket) {
  var terminalId;

  socket.on('fetch', function (data) {
    socket.emit('data', database);
  });

  socket.on('refresh', function (data) {
    fetchEntries();
  });

  socket.on('sign', function (data) {
    if(data.terminal in terminalSockets) {
      var entry = _.find(database.entries, function (entry) {
        return entry.id == data.entry;
      });
      console.log(data);
      console.log(entry);
      if(entry) {
        terminalSockets[data.terminal].emit('sign', entry);
      }
    }
  });

  socket.on('signed', function (data) {
    console.log('Success');
    var now = moment();
    var entry = _.find(database.entries, function (entry) {
      return entry.id == data.id;
    });
    if(entry) {
      baseRequest.post('/timesheet/entries/' + entry.id + '/approval', {
        form: {
          'approval[approvedBy]': entry.userId
        }
      }, function(err, res, body) {
        if (err) {
          console.log(err);
          return;
        }
        var filename = 'signature-' + entry.id + '-' + now.format('YYYYMMDD-HHmmss') + '.json';
        data.time = now.toISOString();
        var dataString = JSON.stringify(data);
        fs.writeFile(signatureDir + '/' + filename, dataString, function (err) {
          if (err) {
            console.log(err);
            console.log(dataString);
          }
        });
        fetchEntries();
      });
    }
  });

  socket.on('register', function (data) {
    if (!terminalId) {
      terminalId = crypto.randomBytes(4).toString('hex');
      database.terminals[terminalId] = {
        label: (data || {}).label || terminalId,
      };
      notifyClients();
    }
    terminalSockets[terminalId] = socket;
    socket.emit('registered', { id: terminalId });
  });

  socket.on('disconnect', function () {
    if(terminalId) {
      delete database.terminals[terminalId];
      delete terminalSockets[terminalId];
      terminalId = null;
      notifyClients();
    }
  });
});
