'use strict';

const subprocess = require('child_process')

// const api = subprocess.fork('./api.js');
const service = subprocess.fork('./service.js');