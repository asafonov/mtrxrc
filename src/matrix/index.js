global.Olm = require('@matrix-org/olm')
const sdk = require("matrix-js-sdk")
const config = require('../config').init()
const { LocalStorage } = require('node-localstorage')
const localStorage = new LocalStorage(`${config.getDir()}/storage`)

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

const getDeviceId = () => {
  const allowedSymbols = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  let r = ''

  for (let i = 0; i < 10; ++i) {
    r += allowedSymbols[Math.floor(Math.random() * allowedSymbols.length)]
  }

  return r
}

const genConfigData = (user, host) => {
  return {
    baseUrl: `https://${host}`,
    userId: `@${user}:${host}`,
    deviceId: getDeviceId()
  }
}

const getConnectData = data => {
  const initialData = {
    baseUrl: config.get('baseUrl'),
    userId: config.get('userId'),
    deviceId: config.get('deviceId'),
    cryptoStore: new sdk.LocalStorageCryptoStore(localStorage)
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
        config.set('deviceId', data.deviceId)
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
  matrix.startClient({initialSyncLimit: 1})
  const userId = config.get('userId')

  matrix.on('sync', state => {
    if (state !== 'PREPARED') return
    matrix.setGlobalErrorOnUnknownDevices(false)
  })

  matrix.on('RoomMember.membership', (event, member) => {
    if (member.membership === 'invite' && member.userId === userId) {
      matrix.joinRoom(member.roomId)
    }
  })

  matrix.on('Room.timeline', async (event, room, toStartOfTimeline) => {
    if (toStartOfTimeline) {
      return
    }

    const eventType = event.getType()

    if (eventType !== 'm.room.message') {
      return
    }

    if (event.sender.userId === userId) {
      return
    }

    const age = new Date().getTime() - event.localTimestamp

    if (age > 60000) {
      return
    }

    onMessage(event.sender.userId, event.getContent().body, room.roomId)
  })

  matrix.on('Event.decrypted', async event => {
    if (event.event.sender === userId) {
      return
    }

    const age = new Date().getTime() - event.event.localTimestamp

    if (age > 60000) {
      return
    }

    onMessage(event.event.sender, event.clearEvent.content.body, event.event.room_id)
  })
}

const sendMessage = (roomId, msg) => {
  matrix.sendEvent(roomId, 'm.room.message', {msgtype: 'm.text', body: msg}, '')
}

const init = ({onMessage}) => {
  login(matrix => subscribe(matrix, onMessage))
}

module.exports = {
  init: init
}
