const matrix = require('../matrix')
const irc = require('../irc')

const init = async () => {
  await irc.init({
    onMessage: matrix.sendMessage
  })
  await matrix.init({
    onMessage: irc.sendMessage
  })
}

module.exports = {
  init: init
}
