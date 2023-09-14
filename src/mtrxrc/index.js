const matrix = require('../matrix')
const irc = require('../irc')

const init = async () => {
  irc.init({
    onMessage: matrix.sendMessage
  }, () => matrix.init({
    onMessage: irc.sendMessage
  }))
}

module.exports = {
  init: init
}
