global.Olm = require('@matrix-org/olm')
const sdk = require("matrix-js-sdk")
const config = require('../config').init()

const showLoginForm = f => {
  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
  })
  readline.question('matrix host: ', host => {
    readline.question('username: ', user => {
      readline.question('password: ', password => {
        readline.close()
        return f(host, user, password)
      })
    })
  })
}

const getAccessToken = async (userId, password, matrix) => {
  const response = await matrix.login('m.login.password', {
    user: userId,
    password: password
  })
  return response.access_token
}

const genConfigData = (user, host) => {
  return {
    baseUrl: `https://${host}`,
    userId: `@${user}:${host}`
  }
}

const getConnectData = data => {
  const initialData = {
    baseUrl: config.get('baseUrl'),
    userId: config.get('userId'),
    deviceId: 'mtrxrc'
  }
  return {...initialData, ...data}
}

const login = async f => {
  let accessToken = config.get('accessToken')
  let matrix

  if (! accessToken) {
    showLoginForm(async (host, user, password) => {
      const data = genConfigData(user, host)
      matrix = sdk.createClient(getConnectData(data))
      accessToken = await getAccessToken(user, password, matrix)

      if (accessToken) {
        config.set('accessToken', accessToken)
        config.set('baseUrl', data.baseUrl)
        config.set('userId', data.userId)
        config.save()
        f(matrix)
      }
    })
  } else {
    matrix = sdk.createClient(
      getConnectData({
        accessToken: accessToken
      })
    )
    f(matrix)
  }
}

const subscribe = async (matrix, onMessage) => {
  await matrix.initCrypto()
  matrix.startClient()
  const userId = config.get('userId')

  matrix.on('RoomMember.membership', (event, member) => {
    if (member.membership === 'invite' && member.userId === userId) {
      matrix.joinRoom(member.roomId)
    }
  })

  matrix.on('Room.timeline', async (event, room, toStartOfTimeline) => {
    if (toStartOfTimeline) {
      return
    }

    if (event.getType() !== 'm.room.message') {
      return
    }

    if (event.sender.userId === userId) {
      return
    }

    const age = new Date().getTime() - event.localTimestamp

    if (age > 60000) {
      return
    }

    if (! antispam.isAllowedMessage(event.sender.userId, event.getRoomId())) {
      console.log('SPAM', event.sender.userId, event.getRoomId())
      const antispamErrorMessage = 'Sorry, the administrator of the bot did not allow me to react to your messages'
      matrix.sendEvent(room.roomId, 'm.room.message', {msgtype: 'm.text', body: antispamErrorMessage}, '')
      return
    }

    for (let i = 0; i < plugins.length; ++i) {
      const reply = await plugins[i].onMessage(event.getContent().body, event.getRoomId())
      reply && matrix.sendEvent(room.roomId, 'm.room.message', {msgtype: 'm.text', body: reply}, '')
    }
  })
}

const init = ({onMessage}) => {
  login(matrix => subscribe(matrix, onMessage))
}

module.exports = {
  init: init
}
