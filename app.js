#!/usr/bin/env node

const mtrxrc = require('./src/mtrxrc')

const app = async () => {
  mtrxrc.init()
}

app()
